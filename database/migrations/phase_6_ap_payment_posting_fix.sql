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
    v_total_applied
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

COMMIT;
