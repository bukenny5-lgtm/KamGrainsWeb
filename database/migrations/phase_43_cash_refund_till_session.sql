-- Phase 8C: cash refunds belong to the active paying till session.
-- This is a forward migration; previously-applied migrations remain unchanged.

ALTER TABLE sal.refund_settlement
  ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES app.cashier_session(session_id),
  ADD COLUMN IF NOT EXISTS till_id uuid NULL REFERENCES app.till(till_id),
  ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id),
  ADD COLUMN IF NOT EXISTS location_id uuid NULL REFERENCES app.location(location_id);

CREATE INDEX IF NOT EXISTS refund_settlement_session_idx
  ON sal.refund_settlement(session_id) WHERE session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS till_cash_refund_source_unique
  ON app.till_cash_movement(source_document_type, source_document_id)
  WHERE movement_type='CASH_REFUND' AND source_document_type='REFUND_SETTLEMENT' AND source_document_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sal.settle_customer_return_refund(
    p_customer_return_id uuid,
    p_amount numeric,
    p_refund_method text,
    p_reference text DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql AS $function$
DECLARE
    v_return sal.customer_return%ROWTYPE;
    v_remaining numeric;
    v_account uuid;
    v_journal uuid;
    v_refund_no text;
    v_settlement_id uuid;
    v_company_id uuid;
    v_till_enabled boolean := false;
    v_session record;
BEGIN
    SELECT * INTO v_return
    FROM sal.customer_return
    WHERE customer_return_id=p_customer_return_id
    FOR UPDATE;
    IF NOT FOUND OR v_return.status<>'POSTED' THEN
        RAISE EXCEPTION 'Only a posted customer return can be refunded';
    END IF;
    IF p_refund_method NOT IN ('CASH','MOBILE_MONEY','CARD','BANK_TRANSFER') THEN
        RAISE EXCEPTION 'Refund method must be CASH, MOBILE_MONEY, CARD, or BANK_TRANSFER';
    END IF;
    v_remaining:=COALESCE(v_return.refund_due_amount,0);
    IF p_amount IS NULL OR p_amount<=0 OR p_amount>GREATEST(v_remaining,0) THEN
        RAISE EXCEPTION 'Refund exceeds remaining refund due';
    END IF;

    SELECT cp.company_id,COALESCE(cf.is_enabled,false)
    INTO v_company_id,v_till_enabled
    FROM app.company_profile cp
    LEFT JOIN app.company_feature cf ON cf.company_id=cp.company_id AND cf.feature_code='till_management'
    WHERE cp.is_active
    ORDER BY cp.created_at,cp.company_id
    LIMIT 1;

    IF p_refund_method='CASH' AND v_till_enabled THEN
        SELECT cs.session_id,cs.company_id,cs.branch_id,cs.location_id,cs.till_id
        INTO v_session
        FROM app.cashier_session cs
        WHERE cs.company_id=v_company_id
          AND cs.cashier_user_id=sec.current_user_id()
          AND cs.status='OPEN'
        ORDER BY cs.opened_at DESC
        LIMIT 1
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'An open till session for the refund operator is required for cash refunds.';
        END IF;
    END IF;

    v_account:=fin.get_account_id(CASE p_refund_method WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY' WHEN 'BANK_TRANSFER' THEN 'BANK' ELSE p_refund_method END);
    v_journal:=fin.create_journal('RFD',v_return.transaction_date,'Refund settlement '||v_return.return_no,'SAL',v_return.customer_return_id);
    PERFORM fin.add_journal_line(v_journal,sal.customer_return_refund_account(),v_return.customer_id,'Refund settlement '||v_return.return_no,p_amount,0);
    PERFORM fin.add_journal_line(v_journal,v_account,v_return.customer_id,'Refund '||p_refund_method||' '||v_return.return_no,0,p_amount);
    PERFORM fin.assert_balanced(v_journal);

    v_refund_no:=sal.next_refund_no();
    INSERT INTO sal.refund_settlement(refund_no,customer_return_id,amount,refund_method,reference,notes,journal_id,settled_by,session_id,till_id,branch_id,location_id)
    VALUES(v_refund_no,p_customer_return_id,p_amount,p_refund_method,p_reference,p_notes,v_journal,sec.current_user_id(),
           CASE WHEN p_refund_method='CASH' AND v_till_enabled THEN v_session.session_id ELSE NULL END,
           CASE WHEN p_refund_method='CASH' AND v_till_enabled THEN v_session.till_id ELSE NULL END,
           CASE WHEN p_refund_method='CASH' AND v_till_enabled THEN v_session.branch_id ELSE NULL END,
           CASE WHEN p_refund_method='CASH' AND v_till_enabled THEN v_session.location_id ELSE NULL END)
    RETURNING refund_settlement_id INTO v_settlement_id;

    IF p_refund_method='CASH' AND v_till_enabled THEN
        INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reference,reason,source_document_type,source_document_id,created_by)
        VALUES(v_session.company_id,v_session.branch_id,v_session.location_id,v_session.till_id,v_session.session_id,'CASH_REFUND',p_amount,
               v_refund_no,'Customer refund '||v_return.return_no,'REFUND_SETTLEMENT',v_settlement_id,sec.current_user_id());
    END IF;

    UPDATE sal.customer_return
    SET refund_due_amount=refund_due_amount-p_amount,
        refund_settled_amount=refund_settled_amount+p_amount,
        refund_status=CASE WHEN refund_due_amount-p_amount<=0 THEN 'SETTLED' ELSE 'PARTIAL' END
    WHERE customer_return_id=p_customer_return_id;
    RETURN v_refund_no;
END;
$function$;
