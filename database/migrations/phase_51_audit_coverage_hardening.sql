-- Phase 8J: audit coverage hardening. No accounting or posting rules change.

CREATE INDEX IF NOT EXISTS audit_event_event_ts_idx ON audit.event(event_ts DESC);
CREATE INDEX IF NOT EXISTS audit_event_user_id_idx ON audit.event(user_id,event_ts DESC);
CREATE INDEX IF NOT EXISTS audit_event_action_idx ON audit.event(action,event_ts DESC);
CREATE INDEX IF NOT EXISTS audit_event_table_name_idx ON audit.event(table_name,event_ts DESC);

ALTER TABLE audit.event DROP CONSTRAINT IF EXISTS event_action_check;
ALTER TABLE audit.event ADD CONSTRAINT event_action_check
  CHECK (action IN ('I','U','D') OR (table_name='business.event' AND action ~ '^[A-Z][A-Z0-9_]+$'));

CREATE UNIQUE INDEX IF NOT EXISTS audit_event_business_event_idempotency_idx
  ON audit.event(action,(row_pk->>'object_id'))
  WHERE table_name='business.event' AND row_pk ? 'object_id';

CREATE OR REPLACE FUNCTION audit.log_business_event(
  p_event_code text,
  p_object_type text,
  p_object_id uuid,
  p_document_no text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT 'UGX',
  p_reason text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_journal_id uuid DEFAULT NULL,
  p_related_object_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE v_event_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,client_addr,txid)
  VALUES(
    v_event_id,now(),p_user_id,p_event_code,'business.event',
    jsonb_strip_nulls(jsonb_build_object('object_type',p_object_type,'object_id',p_object_id::text,'document_no',p_document_no)),
    jsonb_strip_nulls(jsonb_build_object(
      'event_code',p_event_code,'event_name',p_event_code,'source_module','BUSINESS_EVENT',
      'object_type',p_object_type,'object_id',p_object_id,'document_no',p_document_no,
      'company_id',p_company_id,'branch_id',p_branch_id,'location_id',p_location_id,
      'user_id',p_user_id,'event_time',now(),'amount',p_amount,'currency',p_currency,
      'reason',p_reason,'reference',p_reference,'journal_id',p_journal_id,
      'related_object_id',p_related_object_id,'metadata',COALESCE(p_metadata,'{}'::jsonb)
    )),inet_client_addr(),txid_current()
  ) ON CONFLICT DO NOTHING;
  RETURN v_event_id;
END;
$function$;

COMMENT ON FUNCTION audit.log_business_event IS
  'Transactional human-readable business events stored in the existing append-only audit.event table.';

CREATE OR REPLACE FUNCTION audit.log_business_event_from_row()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_new jsonb := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  v_code text;
  v_object_type text;
  v_object_id uuid;
  v_document_no text;
  v_actor uuid;
  v_branch uuid;
  v_location uuid;
  v_company uuid;
  v_amount numeric;
  v_journal uuid;
  v_reason text;
  v_reference text;
BEGIN
  v_object_type := TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME;
  v_object_id := CASE v_object_type
    WHEN 'fin.expense_voucher' THEN (v_new->>'expense_voucher_id')::uuid
    WHEN 'fin.payment_account_control' THEN (v_new->>'payment_account_control_id')::uuid
    WHEN 'fin.payment_account_transfer' THEN (v_new->>'transfer_id')::uuid
    WHEN 'app.till' THEN (v_new->>'till_id')::uuid
    WHEN 'app.till_configuration' THEN (v_new->>'company_id')::uuid
    WHEN 'sec.user_till' THEN (v_new->>'user_till_id')::uuid
    WHEN 'app.cashier_session' THEN (v_new->>'session_id')::uuid
    WHEN 'app.till_cash_movement' THEN (v_new->>'movement_id')::uuid
    WHEN 'app.till_cash_handover' THEN (v_new->>'handover_id')::uuid
    WHEN 'fin.reconciliation' THEN (v_new->>'reconciliation_id')::uuid
    ELSE NULL END;
  IF v_object_id IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;

  v_document_no := COALESCE(v_new->>'voucher_no',v_new->>'transfer_no',v_new->>'session_no',v_new->>'reconciliation_no',v_new->>'till_code');
  v_actor := COALESCE(NULLIF(COALESCE(v_new->>'created_by',v_new->>'opened_by',v_new->>'posted_by',v_new->>'closed_by',v_new->>'reversed_by',v_new->>'voided_by',v_new->>'confirmed_by',v_new->>'proposed_by',v_new->>'accepted_by',v_new->>'updated_by'),'')::uuid, NULLIF(current_setting('app.current_user_id',true),'')::uuid);
  v_branch := NULLIF(v_new->>'branch_id','')::uuid;
  v_location := NULLIF(v_new->>'location_id','')::uuid;
  v_company := NULLIF(v_new->>'company_id','')::uuid;
  v_amount := NULLIF(COALESCE(v_new->>'amount',v_new->>'total_amount',v_new->>'opening_float'),'')::numeric;
  v_journal := NULLIF(COALESCE(v_new->>'journal_id',v_new->>'posted_journal_id',v_new->>'reversal_journal_id'),'')::uuid;
  v_reason := COALESCE(v_new->>'reason',v_new->>'notes',v_new->>'void_reason',v_new->>'reversal_reason');
  v_reference := v_new->>'reference';

  IF v_object_type='fin.expense_voucher' THEN
    IF TG_OP='INSERT' THEN v_code:='EXPENSE_VOUCHER_CREATED';
    ELSIF (v_old->>'posted_journal_id') IS NULL AND (v_new->>'posted_journal_id') IS NOT NULL THEN v_code:='EXPENSE_VOUCHER_POSTED';
    ELSIF (v_old->>'reversal_journal_id') IS NULL AND (v_new->>'reversal_journal_id') IS NOT NULL THEN v_code:='EXPENSE_VOUCHER_REVERSED'; END IF;
  ELSIF v_object_type='fin.payment_account_transfer' THEN
    IF TG_OP='INSERT' THEN v_code:='PAYMENT_ACCOUNT_TRANSFER_CREATED';
    ELSIF v_old->>'status' IS DISTINCT FROM v_new->>'status' AND v_new->>'status'='POSTED' THEN v_code:='PAYMENT_ACCOUNT_TRANSFER_POSTED';
    ELSIF v_old->>'status' IS DISTINCT FROM v_new->>'status' AND v_new->>'status'='VOID' THEN v_code:='PAYMENT_ACCOUNT_TRANSFER_REVERSED'; END IF;
  ELSIF v_object_type='fin.payment_account_control' THEN
    IF TG_OP='INSERT' AND v_new->>'account_role'='PETTY_CASH' THEN v_code:='PETTY_CASH_ACCOUNT_CREATED';
    ELSIF TG_OP='INSERT' THEN v_code:='PAYMENT_ACCOUNT_CONFIG_CREATED';
    ELSIF v_old->>'is_active'='true' AND v_new->>'is_active'='false' THEN v_code:='PAYMENT_ACCOUNT_CONFIG_DEACTIVATED';
    ELSE v_code:=CASE WHEN v_new->>'account_role'='PETTY_CASH' THEN 'PETTY_CASH_ACCOUNT_UPDATED' ELSE 'PAYMENT_ACCOUNT_CONFIG_UPDATED' END; END IF;
  ELSIF v_object_type='app.till' THEN v_code:=CASE WHEN TG_OP='INSERT' THEN 'TILL_CREATED' WHEN v_old->>'is_active'='true' AND v_new->>'is_active'='false' THEN 'TILL_DEACTIVATED' ELSE 'TILL_UPDATED' END;
  ELSIF v_object_type='app.till_configuration' THEN v_code:='TILL_CONFIGURATION_UPDATED';
  ELSIF v_object_type='sec.user_till' THEN v_code:=CASE WHEN TG_OP='INSERT' OR (v_old->>'is_active'='false' AND v_new->>'is_active'='true') THEN 'TILL_USER_ASSIGNED' ELSE 'TILL_USER_ASSIGNMENT_UPDATED' END;
  ELSIF v_object_type='app.cashier_session' THEN v_code:=CASE WHEN TG_OP='INSERT' THEN 'TILL_SESSION_OPENED' WHEN v_old->>'status' IS DISTINCT FROM v_new->>'status' AND v_new->>'status' IN ('CLOSED','RECONCILED') AND lower(COALESCE(v_new->>'closing_notes','')) LIKE 'force closed%' THEN 'TILL_SESSION_FORCE_CLOSED' WHEN v_old->>'status' IS DISTINCT FROM v_new->>'status' AND v_new->>'status' IN ('CLOSED','RECONCILED') THEN 'TILL_SESSION_CLOSED' ELSE NULL END;
  ELSIF v_object_type='app.till_cash_movement' AND TG_OP='INSERT' THEN v_code:=CASE v_new->>'movement_type' WHEN 'CASH_IN' THEN 'CASH_IN' WHEN 'SAFE_DROP' THEN 'SAFE_DROP' WHEN 'OPENING_FLOAT' THEN 'OPENING_FLOAT' WHEN 'CASH_REFUND' THEN 'CASH_REFUND' WHEN 'CASH_OUT' THEN 'CASH_OUT' ELSE NULL END;
  ELSIF v_object_type='app.till_cash_handover' THEN v_code:=CASE WHEN TG_OP='INSERT' THEN 'SESSION_HANDOVER_SAFE' WHEN v_new->>'status'='ACCEPTED' THEN 'CARRY_FORWARD_ACCEPTED' ELSE NULL END;
  ELSIF v_object_type='fin.reconciliation' AND v_new->>'status' IN ('CONFIRMED','COMPLETED') THEN v_code:=CASE WHEN abs(COALESCE((v_new->>'closing_statement_balance')::numeric,0)-COALESCE((v_new->>'opening_statement_balance')::numeric,0))>0 THEN 'PETTY_CASH_RECONCILIATION_VARIANCE' ELSE 'PETTY_CASH_RECONCILED' END;
  END IF;

  IF v_code IS NOT NULL THEN
    PERFORM audit.log_business_event(v_code,v_object_type,v_object_id,v_document_no,v_company,v_branch,v_location,v_actor,v_amount,'UGX',v_reason,v_reference,v_journal,NULL,jsonb_build_object('operation',TG_OP,'row',v_new));
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$function$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fin.expense_voucher','fin.payment_account_control','fin.payment_account_transfer',
    'app.till','app.till_configuration','sec.user_till','app.cashier_session',
    'app.till_cash_movement','app.till_cash_handover','fin.reconciliation'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change_trg ON %s',t);
      EXECUTE format('CREATE TRIGGER audit_row_change_trg AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.log_row_change()',t);
      EXECUTE format('DROP TRIGGER IF EXISTS audit_business_event_trg ON %s',t);
      EXECUTE format('CREATE TRIGGER audit_business_event_trg AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.log_business_event_from_row()',t);
    END IF;
  END LOOP;
END;
$do$;
