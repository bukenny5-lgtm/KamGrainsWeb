-- Phase 42: customer-return VAT reversal owns the complete balanced journal.
-- Return tax values are immutable snapshots captured when the return draft is
-- created.  The API route must not make a second journal adjustment.

CREATE OR REPLACE FUNCTION sal.post_customer_return(p_customer_return_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $function$
DECLARE
    v_return sal.customer_return%ROWTYPE;
    v_line record;
    v_source_line record;
    v_movement_id uuid;
    v_journal_id uuid;
    v_sales_account uuid;
    v_vat_account uuid;
    v_inventory_account uuid;
    v_cogs_account uuid;
    v_ar_invoice uuid;
    v_damage_account uuid;
    v_net numeric(18,2) := 0;
    v_tax numeric(18,2) := 0;
    v_gross numeric(18,2) := 0;
    v_cogs numeric(18,2) := 0;
    v_returned numeric(18,3);
    v_source_movement_id uuid;
    v_source_customer uuid;
    v_source_location uuid;
    v_source_status text;
BEGIN
    SELECT * INTO v_return FROM sal.customer_return WHERE customer_return_id=p_customer_return_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer return not found: %',p_customer_return_id; END IF;
    IF v_return.status='POSTED' THEN RETURN v_return.customer_return_id; END IF;
    IF v_return.status<>'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT customer returns can be posted.'; END IF;

    IF v_return.source_type='POS' THEN
        SELECT ps.customer_id,ps.location_id,ps.status,ps.posted_movement_id INTO v_source_customer,v_source_location,v_source_status,v_source_movement_id
        FROM sal.pos_sale ps WHERE ps.pos_sale_id=v_return.source_id FOR SHARE;
    ELSE
        SELECT d.customer_id,d.location_id,d.status,d.posted_movement_id INTO v_source_customer,v_source_location,v_source_status,v_source_movement_id
        FROM sal.delivery d WHERE d.delivery_id=v_return.source_id FOR SHARE;
    END IF;
    IF v_source_status IS NULL THEN RAISE EXCEPTION 'Return source was not found.'; END IF;
    IF v_source_status IN ('VOID','CANCELLED') THEN RAISE EXCEPTION 'A VOID/CANCELLED source cannot be returned.'; END IF;
    IF v_source_movement_id IS NULL THEN RAISE EXCEPTION 'Return source has no posted stock movement.'; END IF;
    IF v_return.customer_id IS NULL THEN v_return.customer_id:=v_source_customer; END IF;
    IF v_return.location_id IS NULL THEN v_return.location_id:=v_source_location; END IF;

    FOR v_line IN SELECT * FROM sal.customer_return_line WHERE customer_return_id=v_return.customer_return_id FOR UPDATE LOOP
        IF v_return.source_type='POS' THEN
            SELECT l.pos_sale_line_id AS source_line_id,l.product_id,l.lot_id,l.qty AS sold_qty,l.unit_price,sml.unit_cost INTO v_source_line
            FROM sal.pos_sale_line l JOIN inv.stock_movement_line sml ON sml.movement_id=v_source_movement_id AND sml.product_id=l.product_id AND sml.lot_id IS NOT DISTINCT FROM l.lot_id
            WHERE l.pos_sale_line_id=v_line.source_line_id;
        ELSE
            SELECT l.delivery_line_id AS source_line_id,l.product_id,l.lot_id,COALESCE(l.sell_qty,l.qty) AS sold_qty,l.unit_price,sml.unit_cost INTO v_source_line
            FROM sal.delivery_line l JOIN inv.stock_movement_line sml ON sml.movement_id=v_source_movement_id AND sml.product_id=l.product_id AND sml.lot_id IS NOT DISTINCT FROM l.lot_id
            WHERE l.delivery_line_id=v_line.source_line_id;
        END IF;
        IF NOT FOUND THEN RAISE EXCEPTION 'Source line % was not found on the posted movement.',v_line.source_line_id; END IF;
        IF v_line.qty_returned>v_source_line.sold_qty THEN RAISE EXCEPTION 'Return quantity exceeds sold quantity.'; END IF;
        SELECT COALESCE(SUM(crl.qty_returned),0) INTO v_returned
        FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id=cr.customer_return_id
        WHERE cr.status='POSTED' AND cr.source_type=v_return.source_type AND cr.source_id=v_return.source_id AND crl.source_line_id=v_line.source_line_id;
        IF v_returned+v_line.qty_returned>v_source_line.sold_qty THEN RAISE EXCEPTION 'Return quantity exceeds remaining returnable quantity.'; END IF;

        UPDATE sal.customer_return_line SET product_id=v_source_line.product_id,lot_id=v_source_line.lot_id,
            original_sale_qty=v_source_line.sold_qty,original_unit_price=v_source_line.unit_price,
            original_unit_cost=COALESCE(v_source_line.unit_cost,0)
        WHERE customer_return_line_id=v_line.customer_return_line_id;
        -- These three values are the original transaction snapshot.  Never
        -- recalculate tax from the product's current tax configuration.
        v_net:=v_net+COALESCE(v_line.returned_taxable_amount,0);
        v_tax:=v_tax+COALESCE(v_line.returned_tax_amount,0);
        v_gross:=v_gross+COALESCE(v_line.returned_gross_amount,0);
        v_cogs:=v_cogs+round(v_line.qty_returned*COALESCE(v_source_line.unit_cost,0),2);
    END LOOP;
    IF v_gross<=0 OR v_gross<>v_net+v_tax THEN RAISE EXCEPTION 'Customer return tax snapshot is invalid.'; END IF;

    INSERT INTO inv.stock_movement(movement_type,document_no,party_id,from_location_id,to_location_id,notes,created_by,reason_code)
    VALUES('CUSTOMER_RETURN',v_return.return_no,v_return.customer_id,NULL,v_return.location_id,'Customer return '||v_return.return_no,sec.current_user_id(),'CUSTOMER_RETURN') RETURNING movement_id INTO v_movement_id;
    FOR v_line IN SELECT * FROM sal.customer_return_line WHERE customer_return_id=v_return.customer_return_id LOOP
        INSERT INTO inv.stock_movement_line(movement_id,product_id,lot_id,qty,unit_cost,to_location_id)
        VALUES(v_movement_id,v_line.product_id,v_line.lot_id,v_line.qty_returned,v_line.original_unit_cost,CASE WHEN v_line.return_disposition='RESTOCK' THEN v_return.location_id ELSE NULL END);
    END LOOP;

    v_sales_account:=fin.get_account_id('SALES_REVENUE');
    v_vat_account:=NULL;
    IF v_tax>0 THEN SELECT output_vat_account_id INTO v_vat_account FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1; IF v_vat_account IS NULL THEN RAISE EXCEPTION 'Output VAT Payable account is not configured.'; END IF; END IF;
    v_inventory_account:=fin.get_account_id('INVENTORY');
    v_cogs_account:=fin.get_account_id('COGS');
    v_journal_id:=fin.create_journal('RET',v_return.transaction_date,'Customer return '||v_return.return_no,'SAL',v_return.customer_return_id);
    PERFORM fin.add_journal_line(v_journal_id,v_sales_account,NULL,'Sales return '||v_return.return_no,v_net,0);
    IF v_tax>0 THEN PERFORM fin.add_journal_line(v_journal_id,v_vat_account,NULL,'Output VAT reversal '||v_return.return_no,v_tax,0); END IF;

    IF v_return.source_type='POS' THEN SELECT ps.credit_ar_invoice_id INTO v_ar_invoice FROM sal.pos_sale ps WHERE ps.pos_sale_id=v_return.source_id;
    ELSE SELECT ai.ar_invoice_id INTO v_ar_invoice FROM sal.ar_invoice ai WHERE ai.delivery_id=v_return.source_id ORDER BY ai.created_at DESC LIMIT 1; END IF;
    IF v_ar_invoice IS NULL THEN
        v_damage_account:=fin.get_account_id('SALES_REVENUE');
        PERFORM fin.add_journal_line(v_journal_id,v_damage_account,v_return.customer_id,'Refund due '||v_return.return_no,0,v_gross);
        UPDATE sal.customer_return SET refund_status='REFUND_DUE',refund_due=v_gross WHERE customer_return_id=v_return.customer_return_id;
    END IF;
    PERFORM fin.add_journal_line(v_journal_id,v_inventory_account,NULL,'Return inventory '||v_return.return_no,v_cogs,0);
    PERFORM fin.add_journal_line(v_journal_id,v_cogs_account,NULL,'Reverse returned COGS '||v_return.return_no,0,v_cogs);
    IF v_ar_invoice IS NULL THEN PERFORM fin.assert_balanced(v_journal_id); END IF;

    UPDATE sal.customer_return SET customer_id=v_return.customer_id,location_id=v_return.location_id,posted_movement_id=v_movement_id,posted_journal_id=v_journal_id,status='POSTED',posted_by=sec.current_user_id(),posted_at=now() WHERE customer_return_id=v_return.customer_return_id;
    RETURN v_return.customer_return_id;
END;
$function$;

CREATE OR REPLACE FUNCTION sal.finalize_customer_return_settlement()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    v_invoice uuid; v_total numeric(18,2); v_paid numeric(18,2); v_credited numeric(18,2);
    v_return_value numeric(18,2); v_ar_credit numeric(18,2); v_refund_due numeric(18,2);
    v_ar_account uuid; v_refund_account uuid; v_journal uuid;
BEGIN
    IF NEW.status='POSTED' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.source_type IN ('POS','DELIVERY') THEN
        IF NEW.source_type='POS' THEN SELECT ps.credit_ar_invoice_id INTO v_invoice FROM sal.pos_sale ps WHERE ps.pos_sale_id=NEW.source_id;
        ELSE SELECT ai.ar_invoice_id INTO v_invoice FROM sal.ar_invoice ai WHERE ai.delivery_id=NEW.source_id ORDER BY ai.created_at DESC LIMIT 1; END IF;
        IF v_invoice IS NULL THEN RETURN NEW; END IF;
        SELECT COALESCE(SUM(l.returned_gross_amount),0) INTO v_return_value FROM sal.customer_return_line l WHERE l.customer_return_id=NEW.customer_return_id;
        SELECT COALESCE(SUM(COALESCE(l.sell_qty,l.qty,l.base_qty,0)*COALESCE(l.unit_price,0)),0) INTO v_total FROM sal.ar_invoice_line l WHERE l.ar_invoice_id=v_invoice;
        SELECT COALESCE(SUM(a.amount),0) INTO v_paid FROM sal.ar_payment_apply a WHERE a.ar_invoice_id=v_invoice;
        SELECT COALESCE(SUM(a.amount),0) INTO v_credited FROM sal.ar_credit_adjustment a WHERE a.ar_invoice_id=v_invoice AND a.status='POSTED';
        v_ar_credit:=LEAST(v_return_value,GREATEST(v_total-v_paid-v_credited,0)); v_refund_due:=GREATEST(v_return_value-v_ar_credit,0);
        v_ar_account:=fin.get_account_id('AR_CONTROL'); v_refund_account:=sal.customer_return_refund_account();
        SELECT posted_journal_id INTO v_journal FROM sal.customer_return WHERE customer_return_id=NEW.customer_return_id;
        DELETE FROM fin.gl_journal_line WHERE journal_id=v_journal AND memo IN ('Credit return '||NEW.return_no,'Refund payable '||NEW.return_no);
        IF v_ar_credit>0 THEN PERFORM fin.add_journal_line(v_journal,v_ar_account,NEW.customer_id,'Credit return '||NEW.return_no,0,v_ar_credit); END IF;
        IF v_refund_due>0 THEN PERFORM fin.add_journal_line(v_journal,v_refund_account,NEW.customer_id,'Refund payable '||NEW.return_no,0,v_refund_due); END IF;
        PERFORM fin.assert_balanced(v_journal);
        PERFORM sal.settle_posted_customer_return(NEW.customer_return_id,v_refund_due,v_ar_credit,v_journal);
        UPDATE sal.ar_invoice SET status=CASE WHEN GREATEST(v_total-v_paid-v_credited-v_ar_credit,0)=0 THEN 'PAID' ELSE 'OPEN' END WHERE ar_invoice_id=v_invoice AND status<>'VOID';
    END IF;
    RETURN NEW;
END;
$function$;
