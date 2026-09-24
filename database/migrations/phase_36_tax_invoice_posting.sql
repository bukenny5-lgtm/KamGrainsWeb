-- PHASE 6B: tax-aware AR/AP invoice journal posting.
-- POS remains authoritative for credit POS; generated AR invoices reuse its journal.

CREATE OR REPLACE FUNCTION sal.post_ar_invoice(p_ar_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $function$
DECLARE
  v_inv sal.ar_invoice%ROWTYPE; v_line record; v_journal_id uuid; v_ar_account uuid; v_sales_account uuid; v_vat_account uuid;
  v_tax_enabled boolean := false; v_inclusive boolean := false; v_net numeric(18,2) := 0; v_tax numeric(18,2) := 0; v_gross numeric(18,2) := 0; v_base numeric(18,2); v_line_tax numeric(18,2); v_line_gross numeric(18,2); v_code record;
BEGIN
  SELECT * INTO v_inv FROM sal.ar_invoice WHERE ar_invoice_id=p_ar_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AR invoice not found'; END IF;
  IF v_inv.status='VOID' THEN RAISE EXCEPTION 'Cannot post VOID AR invoice'; END IF;
  IF v_inv.posted_journal_id IS NOT NULL THEN RAISE EXCEPTION 'AR invoice already posted'; END IF;
  SELECT cp.tax_engine_enabled AND COALESCE(cf.is_enabled,false), cp.tax_pricing_mode='TAX_INCLUSIVE' INTO v_tax_enabled,v_inclusive
  FROM app.company_profile cp LEFT JOIN app.company_feature cf ON cf.company_id=cp.company_id AND cf.feature_code='tax_engine'
  WHERE cp.is_active ORDER BY cp.created_at,cp.company_id LIMIT 1;
  v_inclusive := COALESCE(v_inclusive,false);
  FOR v_line IN SELECT l.* FROM sal.ar_invoice_line l WHERE l.ar_invoice_id=v_inv.ar_invoice_id FOR UPDATE LOOP
    v_base := round(COALESCE(v_line.qty,1)*v_line.unit_price,2);
    IF v_tax_enabled THEN
      SELECT tc.* INTO v_code FROM app.tax_code tc JOIN app.tax_code assigned_tc ON assigned_tc.company_id=tc.company_id AND assigned_tc.code=tc.code JOIN inv.product p ON p.tax_code_id=assigned_tc.tax_code_id
       WHERE p.product_id=v_line.product_id AND tc.is_active AND tc.effective_from<=COALESCE(v_inv.transaction_date,v_inv.invoice_date,current_date)
         AND (tc.effective_to IS NULL OR tc.effective_to>=COALESCE(v_inv.transaction_date,v_inv.invoice_date,current_date))
       ORDER BY tc.effective_from DESC LIMIT 1;
      IF v_code.tax_code_id IS NULL THEN RAISE EXCEPTION 'Product % lacks an effective tax classification.',v_line.product_id; END IF;
      IF v_inclusive THEN v_line_gross:=v_base; v_net:=v_net+round(v_base/(1+v_code.rate/100),2); v_line_tax:=v_base-round(v_base/(1+v_code.rate/100),2);
      ELSE v_line_tax:=CASE WHEN v_code.treatment='STANDARD' THEN round(v_base*v_code.rate/100,2) ELSE 0 END; v_line_gross:=v_base+v_line_tax; v_net:=v_net+v_base; END IF;
      v_tax:=v_tax+v_line_tax; v_gross:=v_gross+v_line_gross;
      UPDATE sal.ar_invoice_line SET tax_code_id=v_code.tax_code_id,tax_code=v_code.code,tax_treatment=v_code.treatment,tax_rate=v_code.rate,taxable_amount=v_base,tax_amount=v_line_tax,gross_amount=v_line_gross WHERE ar_invoice_line_id=v_line.ar_invoice_line_id;
    ELSE v_net:=v_net+v_base; v_gross:=v_gross+v_base; END IF;
  END LOOP;
  IF v_gross<=0 THEN RAISE EXCEPTION 'AR invoice total must be > 0'; END IF;
  v_ar_account:=fin.get_account_id('AR_CONTROL'); v_sales_account:=fin.get_account_id('SALES_REVENUE');
  IF v_tax_enabled THEN SELECT output_vat_account_id INTO v_vat_account FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1; IF v_vat_account IS NULL THEN RAISE EXCEPTION 'Output VAT Payable account is not configured.'; END IF; END IF;
  v_journal_id:=fin.create_journal('ARI',COALESCE(v_inv.transaction_date,v_inv.invoice_date,current_date),'AR Invoice '||v_inv.invoice_no,'SAL',v_inv.ar_invoice_id);
  PERFORM fin.add_journal_line(v_journal_id,v_ar_account,v_inv.customer_id,'AR Invoice '||v_inv.invoice_no,v_gross,0);
  PERFORM fin.add_journal_line(v_journal_id,v_sales_account,NULL,'AR Invoice '||v_inv.invoice_no,0,v_gross-v_tax);
  IF v_tax_enabled AND v_tax>0 THEN PERFORM fin.add_journal_line(v_journal_id,v_vat_account,NULL,'Output VAT '||v_inv.invoice_no,0,v_tax); END IF;
  PERFORM fin.assert_balanced(v_journal_id);
  UPDATE sal.ar_invoice SET taxable_subtotal=v_net,tax_total=v_tax,gross_total=v_gross,tax_snapshot_at=CASE WHEN v_tax_enabled THEN now() ELSE tax_snapshot_at END,posted_journal_id=v_journal_id WHERE ar_invoice_id=v_inv.ar_invoice_id;
  RETURN v_journal_id;
END;$function$;

CREATE OR REPLACE FUNCTION pur.post_ap_invoice(p_ap_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $function$
DECLARE
  v_inv pur.ap_invoice%ROWTYPE; v_line record; v_journal_id uuid; v_debit_account uuid; v_ap_account uuid; v_input_account uuid; v_tax_enabled boolean:=false; v_net numeric(18,2):=0; v_tax numeric(18,2):=0; v_gross numeric(18,2):=0; v_base numeric(18,2); v_line_tax numeric(18,2); v_code record; v_has_stock_lines boolean;
BEGIN
  SELECT * INTO v_inv FROM pur.ap_invoice WHERE ap_invoice_id=p_ap_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AP invoice not found'; END IF;
  IF v_inv.status='VOID' THEN RAISE EXCEPTION 'Cannot post VOID AP invoice'; END IF;
  IF v_inv.posted_journal_id IS NOT NULL THEN RAISE EXCEPTION 'AP invoice already posted'; END IF;
  SELECT cp.tax_engine_enabled AND COALESCE(cf.is_enabled,false) INTO v_tax_enabled FROM app.company_profile cp LEFT JOIN app.company_feature cf ON cf.company_id=cp.company_id AND cf.feature_code='tax_engine' WHERE cp.is_active ORDER BY cp.created_at,cp.company_id LIMIT 1;
  FOR v_line IN SELECT l.* FROM pur.ap_invoice_line l WHERE l.ap_invoice_id=v_inv.ap_invoice_id FOR UPDATE LOOP
    v_base:=round(COALESCE(v_line.qty,1)*v_line.unit_price,2); v_line_tax:=0;
    IF v_tax_enabled THEN
      IF v_line.tax_recoverability='PARTIALLY_RECOVERABLE' THEN RAISE EXCEPTION 'Partially recoverable VAT requires explicit allocation and is not enabled yet.'; END IF;
      SELECT tc.* INTO v_code FROM app.tax_code tc JOIN app.tax_code assigned_tc ON assigned_tc.company_id=tc.company_id AND assigned_tc.code=tc.code JOIN inv.product p ON p.tax_code_id=assigned_tc.tax_code_id WHERE p.product_id=v_line.product_id AND tc.is_active AND tc.effective_from<=COALESCE(v_inv.transaction_date,v_inv.invoice_date,current_date) AND (tc.effective_to IS NULL OR tc.effective_to>=COALESCE(v_inv.transaction_date,v_inv.invoice_date,current_date)) ORDER BY tc.effective_from DESC LIMIT 1;
      IF v_code.tax_code_id IS NULL THEN RAISE EXCEPTION 'Product % lacks an effective tax classification.',v_line.product_id; END IF;
      v_line_tax:=CASE WHEN v_code.treatment='STANDARD' THEN round(v_base*v_code.rate/100,2) ELSE 0 END;
      UPDATE pur.ap_invoice_line SET tax_code_id=v_code.tax_code_id,tax_code=v_code.code,tax_treatment=v_code.treatment,tax_rate=v_code.rate,taxable_amount=v_base,tax_amount=v_line_tax,gross_amount=v_base+v_line_tax WHERE ap_invoice_line_id=v_line.ap_invoice_line_id;
    END IF;
    v_net:=v_net+v_base; v_tax:=v_tax+CASE WHEN v_line.tax_recoverability='RECOVERABLE' THEN v_line_tax ELSE 0 END; v_gross:=v_gross+v_base+v_line_tax;
  END LOOP;
  IF v_gross<=0 THEN RAISE EXCEPTION 'AP invoice total must be > 0'; END IF;
  SELECT EXISTS(SELECT 1 FROM pur.ap_invoice_line l JOIN inv.product p ON p.product_id=l.product_id WHERE l.ap_invoice_id=v_inv.ap_invoice_id AND p.product_type IN ('RAW','FINISHED','PACKAGING')) INTO v_has_stock_lines;
  v_ap_account:=fin.get_account_id('AP_CONTROL'); IF v_tax_enabled THEN SELECT input_vat_account_id INTO v_input_account FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1; IF v_input_account IS NULL THEN RAISE EXCEPTION 'Input VAT Recoverable account is not configured.'; END IF; END IF;
  IF v_inv.grn_id IS NOT NULL THEN v_debit_account:=fin.get_account_id('GRNI'); ELSE v_debit_account:=fin.get_account_id(CASE WHEN v_has_stock_lines THEN 'INVENTORY' ELSE 'PURCHASES_EXPENSE' END); END IF;
  v_journal_id:=fin.create_journal('API',COALESCE(v_inv.transaction_date,v_inv.invoice_date,current_date),'AP Invoice '||v_inv.invoice_no,'PUR',v_inv.ap_invoice_id);
  PERFORM fin.add_journal_line(v_journal_id,v_debit_account,NULL,'AP Invoice '||v_inv.invoice_no,v_net+CASE WHEN v_tax_enabled THEN v_gross-v_net-v_tax ELSE 0 END,0);
  IF v_tax_enabled AND v_tax>0 THEN PERFORM fin.add_journal_line(v_journal_id,v_input_account,NULL,'Input VAT '||v_inv.invoice_no,v_tax,0); END IF;
  PERFORM fin.add_journal_line(v_journal_id,v_ap_account,v_inv.supplier_id,'AP Invoice '||v_inv.invoice_no,0,v_gross);
  PERFORM fin.assert_balanced(v_journal_id);
  UPDATE pur.ap_invoice SET taxable_subtotal=v_net,input_vat=v_tax,gross_total=v_gross,tax_snapshot_at=CASE WHEN v_tax_enabled THEN now() ELSE tax_snapshot_at END,posted_journal_id=v_journal_id WHERE ap_invoice_id=v_inv.ap_invoice_id;
  RETURN v_journal_id;
END;$function$;
