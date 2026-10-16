-- Phase 56 / Phase 8R: Finance authorizes a cash refund through an eligible
-- paying cashier session. The processor remains settled_by; the cashier is
-- derived from the linked cashier_session.

CREATE OR REPLACE FUNCTION sal.settle_customer_return_refund(
    p_customer_return_id uuid,
    p_amount numeric,
    p_refund_method text,
    p_reference text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_paying_session_id uuid DEFAULT NULL
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
    SELECT r.* INTO v_return
    FROM sal.customer_return r
    WHERE r.customer_return_id=p_customer_return_id
    FOR UPDATE;
    IF NOT FOUND OR v_return.status<>'POSTED' THEN
        RAISE EXCEPTION 'Only a posted customer return can be refunded';
    END IF;
    IF p_refund_method NOT IN ('CASH','MOBILE_MONEY','CARD','BANK_TRANSFER') THEN
        RAISE EXCEPTION 'Refund method must be CASH, MOBILE_MONEY, CARD, or BANK_TRANSFER';
    END IF;
    v_remaining:=COALESCE(v_return.refund_due_amount,0)-COALESCE(v_return.refund_settled_amount,0);
    IF p_amount IS NULL OR p_amount<=0 OR p_amount>GREATEST(v_remaining,0) THEN
        IF v_remaining<=0 THEN RAISE EXCEPTION 'This refund has already been fully settled'; END IF;
        RAISE EXCEPTION 'Refund amount exceeds the remaining balance';
    END IF;

    SELECT cp.company_id,COALESCE(cf.is_enabled,false)
    INTO v_company_id,v_till_enabled
    FROM app.company_profile cp
    LEFT JOIN app.company_feature cf ON cf.company_id=cp.company_id AND cf.feature_code='till_management'
    WHERE cp.is_active ORDER BY cp.created_at,cp.company_id LIMIT 1;

    IF p_refund_method='CASH' AND v_till_enabled THEN
        IF p_paying_session_id IS NULL THEN
            RAISE EXCEPTION 'Select an open paying till session for a cash refund';
        END IF;
        SELECT cs.session_id,cs.company_id,cs.branch_id,cs.location_id,cs.till_id,
               cs.status,cs.cashier_user_id
        INTO v_session
        FROM app.cashier_session cs
        JOIN app.till t ON t.till_id=cs.till_id AND t.is_active
        JOIN app.location l ON l.location_id=cs.location_id
        WHERE cs.session_id=p_paying_session_id
          AND cs.company_id=v_company_id
          AND cs.status='OPEN'
          AND cs.branch_id=l.branch_id
          AND cs.branch_id=(SELECT loc.branch_id FROM app.location loc WHERE loc.location_id=v_return.location_id)
          AND cs.location_id=v_return.location_id
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Selected till session is closed, invalid, or outside the return branch/location'; END IF;
    ELSIF p_refund_method<>'CASH' AND p_paying_session_id IS NOT NULL THEN
        RAISE EXCEPTION 'A paying till session is only valid for cash refunds';
    END IF;

    v_account:=fin.get_account_id(CASE p_refund_method WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY' WHEN 'BANK_TRANSFER' THEN 'BANK' ELSE p_refund_method END);
    v_journal:=fin.create_journal('RFD',v_return.transaction_date,'Refund settlement '||v_return.return_no,'SAL',v_return.customer_return_id);
    PERFORM fin.add_journal_line(v_journal,sal.customer_return_refund_account(),v_return.customer_id,'Refund settlement '||v_return.return_no,p_amount,0);
    PERFORM fin.add_journal_line(v_journal,v_account,v_return.customer_id,'Refund '||p_refund_method||' '||v_return.return_no,0,p_amount);
    PERFORM fin.assert_balanced(v_journal);

    v_refund_no:=sal.next_refund_no();
    INSERT INTO sal.refund_settlement(refund_no,customer_return_id,amount,refund_method,reference,notes,journal_id,settled_by,session_id,till_id,branch_id,location_id)
    VALUES(v_refund_no,p_customer_return_id,p_amount,p_refund_method,p_reference,p_notes,v_journal,sec.current_user_id(),
           CASE WHEN p_refund_method='CASH' THEN v_session.session_id ELSE NULL END,
           CASE WHEN p_refund_method='CASH' THEN v_session.till_id ELSE NULL END,
           CASE WHEN p_refund_method='CASH' THEN v_session.branch_id ELSE NULL END,
           CASE WHEN p_refund_method='CASH' THEN v_session.location_id ELSE NULL END)
    RETURNING refund_settlement_id INTO v_settlement_id;

    IF p_refund_method='CASH' THEN
        INSERT INTO app.till_cash_movement(company_id,branch_id,location_id,till_id,session_id,movement_type,amount,reference,reason,source_document_type,source_document_id,created_by)
        VALUES(v_session.company_id,v_session.branch_id,v_session.location_id,v_session.till_id,v_session.session_id,'CASH_REFUND',p_amount,
               v_refund_no,'Customer refund '||v_return.return_no,'REFUND_SETTLEMENT',v_settlement_id,sec.current_user_id());
    END IF;

    UPDATE sal.customer_return
    SET refund_settled_amount=COALESCE(refund_settled_amount,0)+p_amount,
        refund_status=CASE WHEN COALESCE(refund_due_amount,0)-COALESCE(refund_settled_amount,0)-p_amount<=0 THEN 'SETTLED' ELSE 'PARTIAL' END
    WHERE customer_return_id=p_customer_return_id;
    RETURN v_refund_no;
END;
$function$;
