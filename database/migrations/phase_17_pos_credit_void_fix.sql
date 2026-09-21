-- PHASE 4 FINAL POS: reverse CREDIT through AR_CONTROL, not a cash account.
CREATE OR REPLACE FUNCTION sal.void_pos_sale(p_pos_sale_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql AS $function$
DECLARE
  v_sale sal.pos_sale%ROWTYPE; v_line record; v_movement_id uuid; v_journal_id uuid;
  v_tender_account uuid; v_sales_account uuid; v_inventory_account uuid; v_cogs_account uuid; v_ar_account uuid; v_cogs numeric(18,2) := 0;
BEGIN
  SELECT * INTO v_sale FROM sal.pos_sale WHERE pos_sale_id=p_pos_sale_id FOR UPDATE;
  IF v_sale.pos_sale_id IS NULL THEN RAISE EXCEPTION 'POS sale not found: %', p_pos_sale_id; END IF;
  IF v_sale.status='VOID' THEN RETURN v_sale.pos_sale_id; END IF;
  IF v_sale.status<>'POSTED' THEN RAISE EXCEPTION 'Only POSTED POS sales can be voided.'; END IF;
  IF NULLIF(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A void reason is required.'; END IF;
  IF v_sale.payment_method='CREDIT' AND EXISTS (SELECT 1 FROM sal.ar_payment_apply WHERE ar_invoice_id=v_sale.credit_ar_invoice_id) THEN
    RAISE EXCEPTION 'A POS credit sale with receipts cannot be voided.';
  END IF;
  INSERT INTO inv.stock_movement(movement_type,document_no,party_id,to_location_id,notes,created_by)
    VALUES('CUSTOMER_RETURN',v_sale.sale_no,v_sale.customer_id,v_sale.location_id,'Void POS sale '||v_sale.sale_no,sec.current_user_id()) RETURNING movement_id INTO v_movement_id;
  FOR v_line IN SELECT l.*,p.is_stock_item FROM sal.pos_sale_line l JOIN inv.product p ON p.product_id=l.product_id WHERE l.pos_sale_id=v_sale.pos_sale_id LOOP
    IF v_line.is_stock_item THEN
      INSERT INTO inv.stock_movement_line(movement_id,product_id,lot_id,qty,unit_cost,to_location_id) VALUES(v_movement_id,v_line.product_id,v_line.lot_id,v_line.qty,inv.get_default_unit_cost(v_line.product_id,v_line.lot_id),v_sale.location_id);
      v_cogs:=v_cogs+round(v_line.qty*COALESCE(inv.get_default_unit_cost(v_line.product_id,v_line.lot_id),0),2);
    END IF;
  END LOOP;
  v_sales_account:=fin.get_account_id('SALES_REVENUE'); v_inventory_account:=fin.get_account_id('INVENTORY'); v_cogs_account:=fin.get_account_id('COGS');
  v_journal_id:=fin.create_journal('POSV',current_date,'Void POS sale '||v_sale.sale_no,'SAL',v_sale.pos_sale_id);
  PERFORM fin.add_journal_line(v_journal_id,v_sales_account,NULL,'Reverse POS revenue '||v_sale.sale_no,v_sale.total_amount,0);
  IF v_sale.payment_method='CREDIT' THEN
    v_ar_account:=fin.get_account_id('AR_CONTROL');
    PERFORM fin.add_journal_line(v_journal_id,v_ar_account,v_sale.customer_id,'Reverse POS credit '||v_sale.sale_no,0,v_sale.total_amount);
    UPDATE sal.ar_invoice SET status='VOID',voided_at=now(),voided_by=sec.current_user_id(),void_reason=trim(p_reason),reversal_journal_id=v_journal_id WHERE ar_invoice_id=v_sale.credit_ar_invoice_id;
  ELSE
    v_tender_account:=fin.get_account_id(CASE v_sale.payment_method WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY' WHEN 'BANK' THEN 'BANK' WHEN 'BANK_TRANSFER' THEN 'BANK' WHEN 'CARD' THEN 'CARD' ELSE 'CASH' END);
    PERFORM fin.add_journal_line(v_journal_id,v_tender_account,v_sale.customer_id,'Reverse POS tender '||v_sale.sale_no,0,v_sale.total_amount);
  END IF;
  PERFORM fin.add_journal_line(v_journal_id,v_inventory_account,NULL,'Reverse POS inventory '||v_sale.sale_no,v_cogs,0);
  PERFORM fin.add_journal_line(v_journal_id,v_cogs_account,NULL,'Reverse POS COGS '||v_sale.sale_no,0,v_cogs);
  PERFORM fin.assert_balanced(v_journal_id);
  UPDATE sal.pos_sale SET status='VOID',voided_at=now(),voided_by=sec.current_user_id(),void_reason=trim(p_reason),reversal_movement_id=v_movement_id,reversal_journal_id=v_journal_id WHERE pos_sale_id=v_sale.pos_sale_id;
  RETURN v_sale.pos_sale_id;
END;
$function$;
