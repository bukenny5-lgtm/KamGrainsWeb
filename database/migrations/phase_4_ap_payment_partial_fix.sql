-- Phase 1 AP partial payment fix
-- Scope: correct posting and official invoice balance calculations for supplier payments.
-- This phase intentionally does not add supplier prepayments / unapplied accounting.
-- It requires payment.amount to equal total application amount before posting.

BEGIN;

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
  SET posted_journal_id = v_journal_id
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
      AND p.posted_journal_id IS NOT NULL;

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
