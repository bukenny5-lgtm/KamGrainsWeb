BEGIN;

ALTER TABLE pur.ap_payment
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT';

ALTER TABLE pur.ap_payment
  ADD COLUMN IF NOT EXISTS void_reason text NULL;

ALTER TABLE pur.ap_payment
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL;

ALTER TABLE pur.ap_payment
  ADD COLUMN IF NOT EXISTS voided_by uuid NULL
  REFERENCES sec.app_user(user_id);

ALTER TABLE pur.ap_payment
  ADD COLUMN IF NOT EXISTS reversal_journal_id uuid NULL
  REFERENCES fin.gl_journal(journal_id);

UPDATE pur.ap_payment
SET status = CASE
  WHEN posted_journal_id IS NOT NULL THEN 'POSTED'
  ELSE 'DRAFT'
END
WHERE status IS NULL OR btrim(status) = '';

CREATE OR REPLACE FUNCTION pur.void_ap_payment(
  p_ap_payment_id uuid,
  p_void_reason text
)
RETURNS TABLE (
  ap_payment_id uuid,
  original_journal_id uuid,
  reversal_journal_id uuid,
  status text,
  void_reason text,
  voided_at timestamptz,
  voided_by uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment pur.ap_payment%ROWTYPE;
  v_original_journal fin.gl_journal%ROWTYPE;
  v_reversal_journal_id uuid;
  v_voided_by uuid;
BEGIN
  IF p_ap_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment ID is required';
  END IF;

  IF p_void_reason IS NULL OR btrim(p_void_reason) = '' THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
  INTO v_voided_by;

  IF v_voided_by IS NULL THEN
    RAISE EXCEPTION 'Current application user is required to void an AP payment';
  END IF;

  SELECT *
  INTO v_payment
  FROM pur.ap_payment
  WHERE ap_payment_id = p_ap_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AP payment not found';
  END IF;

  IF v_payment.posted_journal_id IS NULL THEN
    RAISE EXCEPTION 'Cannot void an unposted AP payment.';
  END IF;

  IF v_payment.status = 'VOID' THEN
    IF v_payment.reversal_journal_id IS NOT NULL THEN
      RETURN QUERY
      SELECT
        v_payment.ap_payment_id,
        v_payment.posted_journal_id,
        v_payment.reversal_journal_id,
        'VOID',
        v_payment.void_reason,
        v_payment.voided_at,
        v_payment.voided_by;
      RETURN;
    END IF;

    RAISE EXCEPTION 'AP payment % is already VOID and has no recorded reversal journal', v_payment.payment_no;
  END IF;

  SELECT gj.*
  INTO v_original_journal
  FROM fin.gl_journal gj
  WHERE gj.journal_id = v_payment.posted_journal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original posted journal % for payment % not found', v_payment.posted_journal_id, v_payment.payment_no;
  END IF;

  v_reversal_journal_id := fin.create_journal(
    'APP',
    current_date,
    'Reversal of ' || v_original_journal.journal_no || ' for AP Payment ' || v_payment.payment_no || ' - ' || p_void_reason,
    'PUR',
    v_payment.ap_payment_id
  );

  INSERT INTO fin.gl_journal_line (
    journal_id,
    account_id,
    party_id,
    memo,
    debit,
    credit
  )
  SELECT
    v_reversal_journal_id,
    j.account_id,
    j.party_id,
    COALESCE(j.memo, '') || ' [AP PAYMENT VOID REVERSAL]',
    j.credit,
    j.debit
  FROM fin.gl_journal_line j
  WHERE j.journal_id = v_payment.posted_journal_id;

  PERFORM fin.assert_balanced(v_reversal_journal_id);

  UPDATE pur.ap_payment
  SET
    status = 'VOID',
    void_reason = p_void_reason,
    voided_at = now(),
    voided_by = v_voided_by,
    reversal_journal_id = v_reversal_journal_id
  WHERE ap_payment_id = v_payment.ap_payment_id;

  FOR v_payment IN
    SELECT pa.*
    FROM pur.ap_payment_apply pa
    WHERE pa.ap_payment_id = p_ap_payment_id
  LOOP
    PERFORM pur.refresh_ap_invoice_status(v_payment.ap_invoice_id);
  END LOOP;

  RETURN QUERY
  SELECT
    p.ap_payment_id,
    p.posted_journal_id,
    p.reversal_journal_id,
    p.status,
    p.void_reason,
    p.voided_at,
    p.voided_by
  FROM pur.ap_payment p
  WHERE p.ap_payment_id = p_ap_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION pur.post_ap_payment(p_ap_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_pay pur.ap_payment%ROWTYPE;
  v_journal_id uuid;
  v_ap_account uuid;
  v_payment_account uuid;
  v_payment_setup_key text;
  v_total_applied numeric := 0;
  r record;
BEGIN
  SELECT *
  INTO v_pay
  FROM pur.ap_payment
  WHERE ap_payment_id = p_ap_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AP payment not found';
  END IF;

  IF v_pay.posted_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'AP payment already posted';
  END IF;

  IF COALESCE(v_pay.amount, 0) <= 0 THEN
    RAISE EXCEPTION 'AP payment amount must be greater than zero';
  END IF;

  SELECT COALESCE(SUM(amount), 0)::numeric
  INTO v_total_applied
  FROM pur.ap_payment_apply
  WHERE ap_payment_id = v_pay.ap_payment_id;

  IF v_total_applied > COALESCE(v_pay.amount, 0) + 0.01 THEN
    RAISE EXCEPTION
      'Applied amount (%) exceeds payment amount (%).',
      v_total_applied,
      v_pay.amount;
  END IF;

  IF ABS(v_total_applied - COALESCE(v_pay.amount, 0)) > 0.01 THEN
    RAISE EXCEPTION
      'Phase 1 requires the payment amount (%) to equal the total applied amount (%). Payment must be fully allocated to invoices before posting.',
      v_pay.amount,
      v_total_applied;
  END IF;

  v_ap_account := fin.get_account_id('AP_CONTROL');

  v_payment_setup_key :=
    CASE UPPER(COALESCE(v_pay.method, 'CASH'))
      WHEN 'BANK' THEN 'BANK'
      WHEN 'CHEQUE' THEN 'BANK'
      WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY'
      WHEN 'MOBILE' THEN 'MOBILE_MONEY'
      WHEN 'CASH' THEN 'CASH'
      ELSE 'CASH'
    END;

  v_payment_account := fin.get_account_id(v_payment_setup_key);

  IF v_payment_account IS NULL THEN
    RAISE EXCEPTION 'Payment account setup % was not found', v_payment_setup_key;
  END IF;

  PERFORM fin.assert_payment_account_can_pay(v_payment_account, v_pay.amount);

  v_journal_id := fin.create_journal(
    'APP',
    v_pay.payment_date,
    'AP Payment ' || v_pay.payment_no,
    'PUR',
    v_pay.ap_payment_id
  );

  PERFORM fin.add_journal_line(
    v_journal_id,
    v_ap_account,
    v_pay.supplier_id,
    'AP Payment ' || v_pay.payment_no,
    v_total_applied,
    0
  );

  PERFORM fin.add_journal_line(
    v_journal_id,
    v_payment_account,
    NULL,
    'AP Payment ' || v_pay.payment_no,
    0,
    v_pay.amount
  );

  PERFORM fin.assert_balanced(v_journal_id);

  UPDATE pur.ap_payment
  SET
    posted_journal_id = v_journal_id,
    status = 'POSTED'
  WHERE ap_payment_id = v_pay.ap_payment_id;

  FOR r IN
    SELECT ap_invoice_id
    FROM pur.ap_payment_apply
    WHERE ap_payment_id = v_pay.ap_payment_id
  LOOP
    PERFORM pur.refresh_ap_invoice_status(r.ap_invoice_id);
  END LOOP;

  RETURN v_journal_id;
END;
$$;

CREATE OR REPLACE FUNCTION pur.refresh_ap_invoice_status(p_ap_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice_total numeric(18,2);
    v_amount_applied numeric(18,2);
    v_balance numeric(18,2);
    v_current_status text;
    v_new_status text;
BEGIN
    SELECT status
    INTO v_current_status
    FROM pur.ap_invoice
    WHERE ap_invoice_id = p_ap_invoice_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'AP invoice not found: %', p_ap_invoice_id;
    END IF;

    IF v_current_status = 'VOID' THEN
        RETURN 'VOID';
    END IF;

    SELECT COALESCE(SUM(COALESCE(qty, 1) * COALESCE(unit_price, 0)), 0)
    INTO v_invoice_total
    FROM pur.ap_invoice_line
    WHERE ap_invoice_id = p_ap_invoice_id;

    SELECT COALESCE(SUM(pa.amount), 0)
    INTO v_amount_applied
    FROM pur.ap_payment_apply pa
    JOIN pur.ap_payment p
      ON p.ap_payment_id = pa.ap_payment_id
    WHERE pa.ap_invoice_id = p_ap_invoice_id
      AND p.posted_journal_id IS NOT NULL
      AND p.reversal_journal_id IS NULL;

    v_balance := ROUND(v_invoice_total - v_amount_applied, 2);

    IF v_invoice_total > 0 AND v_balance <= 0 THEN
        v_new_status := 'PAID';
    ELSE
        v_new_status := 'OPEN';
    END IF;

    UPDATE pur.ap_invoice
    SET status = v_new_status
    WHERE ap_invoice_id = p_ap_invoice_id
      AND status <> 'VOID';

    RETURN v_new_status;
END;
$$;

COMMIT;
