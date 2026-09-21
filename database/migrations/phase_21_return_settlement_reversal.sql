-- Phase 21: customer-return settlement, refund posting, and safe reversal.
-- Forward-only; development application required before production review.

CREATE TABLE IF NOT EXISTS sal.ar_credit_adjustment (
    ar_credit_adjustment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ar_invoice_id uuid NOT NULL REFERENCES sal.ar_invoice(ar_invoice_id),
    customer_return_id uuid NOT NULL UNIQUE REFERENCES sal.customer_return(customer_return_id),
    amount numeric(18,2) NOT NULL CHECK (amount > 0),
    status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOID')),
    journal_id uuid,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    voided_by uuid,
    voided_at timestamptz
);

CREATE OR REPLACE FUNCTION sal.block_unsupported_writeoff_return()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='POSTED' AND OLD.status IS DISTINCT FROM NEW.status
       AND EXISTS (SELECT 1 FROM sal.customer_return_line WHERE customer_return_id=NEW.customer_return_id AND return_disposition='WRITE_OFF') THEN
        RAISE EXCEPTION 'WRITE_OFF customer returns require the controlled inventory write-off workflow and cannot be posted yet';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_unsupported_writeoff_return ON sal.customer_return;
CREATE TRIGGER trg_block_unsupported_writeoff_return
BEFORE UPDATE OF status ON sal.customer_return
FOR EACH ROW EXECUTE FUNCTION sal.block_unsupported_writeoff_return();

ALTER TABLE sal.customer_return
    DROP CONSTRAINT IF EXISTS customer_return_refund_status_check;
ALTER TABLE sal.customer_return
    DROP CONSTRAINT IF EXISTS customer_return_refund_status_check1;
ALTER TABLE sal.customer_return
    ADD CONSTRAINT customer_return_refund_status_check
    CHECK (refund_status IN ('NOT_APPLICABLE','NONE','DUE','PARTIAL','SETTLED','REFUND_DUE','REFUNDED','CREDIT_DUE'));

INSERT INTO fin.gl_account(account_id, account_code, account_name, account_type, is_control, is_active)
SELECT gen_random_uuid(), '2100', 'Customer Refunds Payable', 'LIABILITY', true, true
WHERE NOT EXISTS (SELECT 1 FROM fin.gl_account WHERE account_code='2100');
INSERT INTO fin.posting_setup(setup_key, account_id)
SELECT 'REFUND_PAYABLE', account_id FROM fin.gl_account WHERE account_code='2100'
ON CONFLICT (setup_key) DO NOTHING;

CREATE OR REPLACE FUNCTION sal.customer_return_refund_account()
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
    SELECT account_id INTO v_id FROM fin.posting_setup WHERE setup_key='REFUND_PAYABLE';
    IF v_id IS NULL THEN RAISE EXCEPTION 'REFUND_PAYABLE account mapping is not configured'; END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION sal.settle_posted_customer_return(
    p_customer_return_id uuid,
    p_refund_due numeric,
    p_credit_amount numeric,
    p_journal_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE sal.customer_return
    SET refund_due_amount = GREATEST(COALESCE(p_refund_due,0),0),
        refund_status = CASE WHEN COALESCE(p_refund_due,0) > 0 THEN 'DUE' ELSE 'NONE' END,
        posted_journal_id = COALESCE(posted_journal_id,p_journal_id)
    WHERE customer_return_id=p_customer_return_id;
    IF p_credit_amount > 0 THEN
        INSERT INTO sal.ar_credit_adjustment(ar_invoice_id,customer_return_id,amount,status,journal_id,created_by)
        SELECT ai.ar_invoice_id,p_customer_return_id,p_credit_amount,'POSTED',p_journal_id,sec.current_user_id()
        FROM sal.customer_return cr JOIN sal.ar_invoice ai ON ai.invoice_no=cr.source_document_no
        WHERE cr.customer_return_id=p_customer_return_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sal.finalize_customer_return_settlement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_invoice uuid;
    v_total numeric(18,2);
    v_paid numeric(18,2);
    v_credited numeric(18,2);
    v_return_value numeric(18,2);
    v_ar_credit numeric(18,2);
    v_refund_due numeric(18,2);
    v_ar_account uuid;
    v_refund_account uuid;
    v_journal uuid;
    v_line record;
BEGIN
    IF NEW.status='POSTED' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.source_type IN ('POS','DELIVERY') THEN
        IF NEW.source_type='POS' THEN
            SELECT ps.credit_ar_invoice_id INTO v_invoice FROM sal.pos_sale ps WHERE ps.pos_sale_id=NEW.source_id;
        ELSE
            SELECT ai.ar_invoice_id INTO v_invoice FROM sal.ar_invoice ai WHERE ai.delivery_id=NEW.source_id ORDER BY ai.created_at DESC LIMIT 1;
        END IF;
        IF v_invoice IS NULL THEN RETURN NEW; END IF;
        SELECT COALESCE(SUM(l.qty_returned*l.original_unit_price),0) INTO v_return_value FROM sal.customer_return_line l WHERE l.customer_return_id=NEW.customer_return_id;
        SELECT COALESCE(SUM(COALESCE(l.sell_qty,l.qty,l.base_qty,0)*COALESCE(l.unit_price,0)),0) INTO v_total FROM sal.ar_invoice_line l WHERE l.ar_invoice_id=v_invoice;
        SELECT COALESCE(SUM(a.amount),0) INTO v_paid FROM sal.ar_payment_apply a WHERE a.ar_invoice_id=v_invoice;
        SELECT COALESCE(SUM(a.amount),0) INTO v_credited FROM sal.ar_credit_adjustment a WHERE a.ar_invoice_id=v_invoice AND a.status='POSTED';
        v_ar_credit := LEAST(v_return_value,GREATEST(v_total-v_paid-v_credited,0));
        v_refund_due := GREATEST(v_return_value-v_ar_credit,0);
        v_ar_account := fin.get_account_id('AR_CONTROL');
        v_refund_account := sal.customer_return_refund_account();
        SELECT posted_journal_id INTO v_journal FROM sal.customer_return WHERE customer_return_id=NEW.customer_return_id;
        IF v_ar_credit > 0 THEN
            UPDATE fin.gl_journal_line SET credit=v_ar_credit
            WHERE journal_id=v_journal AND account_id=v_ar_account AND memo LIKE 'Credit return %';
        ELSE
            DELETE FROM fin.gl_journal_line WHERE journal_id=v_journal AND account_id=v_ar_account AND memo LIKE 'Credit return %';
        END IF;
        IF v_refund_due > 0 THEN
            PERFORM fin.add_journal_line(v_journal,v_refund_account,NEW.customer_id,'Refund payable '||NEW.return_no,0,v_refund_due);
        END IF;
        PERFORM fin.assert_balanced(v_journal);
        PERFORM sal.settle_posted_customer_return(NEW.customer_return_id,v_refund_due,v_ar_credit,v_journal);
        UPDATE sal.ar_invoice SET status=CASE WHEN GREATEST(v_total-v_paid-v_credited-v_ar_credit,0)=0 THEN 'PAID' ELSE 'OPEN' END WHERE ar_invoice_id=v_invoice AND status<>'VOID';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalize_customer_return_settlement ON sal.customer_return;
CREATE TRIGGER trg_finalize_customer_return_settlement
AFTER UPDATE OF status ON sal.customer_return
FOR EACH ROW EXECUTE FUNCTION sal.finalize_customer_return_settlement();

CREATE OR REPLACE FUNCTION sal.settle_customer_return_refund(
    p_customer_return_id uuid,
    p_amount numeric,
    p_refund_method text,
    p_reference text DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_return sal.customer_return%ROWTYPE; v_remaining numeric; v_account uuid; v_journal uuid; v_refund_no text;
BEGIN
    SELECT * INTO v_return FROM sal.customer_return WHERE customer_return_id=p_customer_return_id FOR UPDATE;
    IF NOT FOUND OR v_return.status<>'POSTED' THEN RAISE EXCEPTION 'Only a posted customer return can be refunded'; END IF;
    IF p_refund_method NOT IN ('CASH','MOBILE_MONEY','CARD','BANK_TRANSFER') THEN RAISE EXCEPTION 'Refund method must be CASH, MOBILE_MONEY, CARD, or BANK_TRANSFER'; END IF;
    v_remaining := COALESCE(v_return.refund_due_amount,0);
    IF p_amount IS NULL OR p_amount<=0 OR p_amount>GREATEST(v_remaining,0) THEN RAISE EXCEPTION 'Refund exceeds remaining refund due'; END IF;
    v_account := fin.get_account_id(CASE p_refund_method WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY' WHEN 'BANK_TRANSFER' THEN 'BANK' ELSE p_refund_method END);
    v_journal := fin.create_journal('RFD',v_return.transaction_date,'Refund settlement '||v_return.return_no,'SAL',v_return.customer_return_id);
    PERFORM fin.add_journal_line(v_journal,sal.customer_return_refund_account(),v_return.customer_id,'Refund settlement '||v_return.return_no,p_amount,0);
    PERFORM fin.add_journal_line(v_journal,v_account,v_return.customer_id,'Refund '||p_refund_method||' '||v_return.return_no,0,p_amount);
    PERFORM fin.assert_balanced(v_journal);
    v_refund_no := sal.next_refund_no();
    INSERT INTO sal.refund_settlement(refund_no,customer_return_id,amount,refund_method,reference,notes,journal_id,settled_by)
    VALUES(v_refund_no,p_customer_return_id,p_amount,p_refund_method,p_reference,p_notes,v_journal,sec.current_user_id());
    UPDATE sal.customer_return SET refund_due_amount=refund_due_amount-p_amount, refund_settled_amount=refund_settled_amount+p_amount, refund_status=CASE WHEN refund_due_amount-p_amount<=0 THEN 'SETTLED' ELSE 'PARTIAL' END WHERE customer_return_id=p_customer_return_id;
    RETURN v_refund_no;
END;
$$;

CREATE OR REPLACE FUNCTION sal.void_customer_return(p_customer_return_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_return sal.customer_return%ROWTYPE; v_move uuid; v_journal uuid; v_line record; v_orig record; v_invoice uuid;
BEGIN
    SELECT * INTO v_return FROM sal.customer_return WHERE customer_return_id=p_customer_return_id FOR UPDATE;
    IF NOT FOUND OR v_return.status<>'POSTED' THEN RAISE EXCEPTION 'Only a posted customer return can be voided'; END IF;
    IF COALESCE((SELECT SUM(amount) FROM sal.refund_settlement WHERE customer_return_id=p_customer_return_id AND status='POSTED'),0)>0 THEN RAISE EXCEPTION 'Return cannot be voided after a refund settlement; reverse the refund first'; END IF;
    INSERT INTO inv.stock_movement(movement_type,document_no,party_id,from_location_id,to_location_id,notes,created_by,reason_code)
    VALUES('CUSTOMER_RETURN',v_return.return_no||'-VOID',v_return.customer_id,NULL,v_return.location_id,'Void customer return '||v_return.return_no,sec.current_user_id(),'CUSTOMER_RETURN') RETURNING movement_id INTO v_move;
    FOR v_line IN SELECT sml.* FROM inv.stock_movement_line sml WHERE sml.movement_id=v_return.posted_movement_id LOOP
        INSERT INTO inv.stock_movement_line(movement_id,product_id,lot_id,qty,unit_cost,from_location_id,to_location_id)
        VALUES(v_move,v_line.product_id,v_line.lot_id,v_line.qty,v_line.unit_cost,v_line.to_location_id,v_line.from_location_id);
    END LOOP;
    v_journal := fin.create_journal('RETVOID',current_date,'Void customer return '||v_return.return_no,'SAL',v_return.customer_return_id);
    FOR v_orig IN SELECT * FROM fin.gl_journal_line WHERE journal_id=v_return.posted_journal_id LOOP
        PERFORM fin.add_journal_line(v_journal,v_orig.account_id,v_orig.party_id,'Void '||v_orig.memo,v_orig.credit,v_orig.debit);
    END LOOP;
    PERFORM fin.assert_balanced(v_journal);
    UPDATE sal.ar_credit_adjustment SET status='VOID',voided_by=sec.current_user_id(),voided_at=now() WHERE customer_return_id=p_customer_return_id AND status='POSTED';
    IF v_return.source_type='POS' THEN
        SELECT ps.credit_ar_invoice_id INTO v_invoice FROM sal.pos_sale ps WHERE ps.pos_sale_id=v_return.source_id;
    ELSE
        SELECT ai.ar_invoice_id INTO v_invoice FROM sal.ar_invoice ai WHERE ai.delivery_id=v_return.source_id ORDER BY ai.created_at DESC LIMIT 1;
    END IF;
    IF v_invoice IS NOT NULL THEN UPDATE sal.ar_invoice SET status='OPEN' WHERE ar_invoice_id=v_invoice AND status<>'VOID'; END IF;
    UPDATE sal.customer_return SET status='VOID',void_reason=p_reason,voided_by=sec.current_user_id(),voided_at=now(),refund_due_amount=0,refund_status='NONE' WHERE customer_return_id=p_customer_return_id;
    RETURN v_journal;
END;
$$;
