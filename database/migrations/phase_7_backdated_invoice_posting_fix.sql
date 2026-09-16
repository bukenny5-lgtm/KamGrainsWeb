BEGIN;

CREATE OR REPLACE FUNCTION pur.post_ap_invoice(p_ap_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $$
DECLARE
  v_inv pur.ap_invoice%ROWTYPE;
  v_total numeric(18,2);
  v_journal_id uuid;
  v_debit_account uuid;
  v_ap_account uuid;
  v_has_stock_lines boolean;
  v_journal_date date;
BEGIN
  SELECT * INTO v_inv
  FROM pur.ap_invoice
  WHERE ap_invoice_id = p_ap_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AP invoice not found';
  END IF;

  IF v_inv.status = 'VOID' THEN
    RAISE EXCEPTION 'Cannot post VOID AP invoice';
  END IF;

  IF v_inv.posted_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'AP invoice already posted';
  END IF;

  SELECT round(COALESCE(SUM(COALESCE(l.qty, 1) * l.unit_price), 0), 2)
  INTO v_total
  FROM pur.ap_invoice_line l
  WHERE l.ap_invoice_id = v_inv.ap_invoice_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'AP invoice total must be > 0';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pur.ap_invoice_line l
    JOIN inv.product p ON p.product_id = l.product_id
    WHERE l.ap_invoice_id = v_inv.ap_invoice_id
      AND p.product_type IN ('RAW','FINISHED','PACKAGING')
  )
  INTO v_has_stock_lines;

  v_journal_date := COALESCE(v_inv.transaction_date, v_inv.invoice_date, CURRENT_DATE);

  v_ap_account := fin.get_account_id('AP_CONTROL');

  IF v_inv.grn_id IS NOT NULL THEN
    v_debit_account := fin.get_account_id('GRNI');
  ELSE
    v_debit_account := fin.get_account_id(CASE WHEN v_has_stock_lines THEN 'INVENTORY' ELSE 'PURCHASES_EXPENSE' END);
  END IF;

  v_journal_id := fin.create_journal('API', v_journal_date, 'AP Invoice ' || v_inv.invoice_no, 'PUR', v_inv.ap_invoice_id);

  PERFORM fin.add_journal_line(v_journal_id, v_debit_account, NULL, 'AP Invoice ' || v_inv.invoice_no, v_total, 0);
  PERFORM fin.add_journal_line(v_journal_id, v_ap_account, v_inv.supplier_id, 'AP Invoice ' || v_inv.invoice_no, 0, v_total);

  PERFORM fin.assert_balanced(v_journal_id);

  UPDATE pur.ap_invoice
  SET posted_journal_id = v_journal_id
  WHERE ap_invoice_id = v_inv.ap_invoice_id;

  RETURN v_journal_id;
END;
$$;

CREATE OR REPLACE FUNCTION sal.post_ar_invoice(p_ar_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $$
DECLARE
  v_inv sal.ar_invoice%ROWTYPE;
  v_total numeric(18,2);
  v_journal_id uuid;
  v_ar_account uuid;
  v_sales_account uuid;
  v_journal_date date;
BEGIN
  SELECT * INTO v_inv
  FROM sal.ar_invoice
  WHERE ar_invoice_id = p_ar_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AR invoice not found';
  END IF;

  IF v_inv.status = 'VOID' THEN
    RAISE EXCEPTION 'Cannot post VOID AR invoice';
  END IF;

  IF v_inv.posted_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'AR invoice already posted';
  END IF;

  SELECT COALESCE(SUM(COALESCE(l.qty, 1) * l.unit_price), 0)
  INTO v_total
  FROM sal.ar_invoice_line l
  WHERE l.ar_invoice_id = v_inv.ar_invoice_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'AR invoice total must be > 0';
  END IF;

  v_journal_date := COALESCE(v_inv.transaction_date, v_inv.invoice_date, CURRENT_DATE);

  v_ar_account := fin.get_account_id('AR_CONTROL');
  v_sales_account := fin.get_account_id('SALES_REVENUE');

  v_journal_id := fin.create_journal('ARI', v_journal_date, 'AR Invoice ' || v_inv.invoice_no, 'SAL', v_inv.ar_invoice_id);

  PERFORM fin.add_journal_line(v_journal_id, v_ar_account, v_inv.customer_id, 'AR Invoice ' || v_inv.invoice_no, v_total, 0);
  PERFORM fin.add_journal_line(v_journal_id, v_sales_account, NULL, 'AR Invoice ' || v_inv.invoice_no, 0, v_total);

  PERFORM fin.assert_balanced(v_journal_id);

  UPDATE sal.ar_invoice
  SET posted_journal_id = v_journal_id
  WHERE ar_invoice_id = v_inv.ar_invoice_id;

  RETURN v_journal_id;
END;
$$;

COMMIT;
