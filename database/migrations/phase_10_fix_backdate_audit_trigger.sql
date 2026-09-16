-- Fix audit backdate trigger field resolution for AR payment applications.
-- The shared trigger function must not dereference columns absent from the
-- triggering row type (sal.ar_payment_apply has no delivery_id/created_at).
CREATE OR REPLACE FUNCTION audit.fn_log_backdate_event()
RETURNS TRIGGER AS $$
DECLARE
  v_row JSONB := to_jsonb(NEW);
  v_record_id UUID;
  v_record_key TEXT;
  v_created_by UUID;
  v_created_date DATE;
  v_system_date TIMESTAMP;
  v_backdate_reason VARCHAR(500);
  v_approved_by UUID;
  v_approved_at TIMESTAMP;
BEGIN
  IF NEW.backdate_flag = TRUE THEN
    v_record_key := CASE TG_TABLE_NAME
      WHEN 'delivery' THEN 'delivery_id'
      WHEN 'ar_invoice' THEN 'ar_invoice_id'
      WHEN 'ar_payment_apply' THEN 'ar_payment_id'
      WHEN 'ap_invoice' THEN 'ap_invoice_id'
      WHEN 'ap_payment' THEN 'ap_payment_id'
      ELSE 'id'
    END;

    v_record_id := (v_row ->> v_record_key)::UUID;
    v_created_by := COALESCE(v_row ->> 'created_by', v_row ->> 'backdate_approved_by')::UUID;
    v_created_date := (v_row ->> 'transaction_date')::DATE;
    v_system_date := COALESCE((v_row ->> 'created_at')::TIMESTAMPTZ::TIMESTAMP, CURRENT_TIMESTAMP::TIMESTAMP);
    v_backdate_reason := (v_row ->> 'backdate_reason')::VARCHAR(500);
    v_approved_by := (v_row ->> 'backdate_approved_by')::UUID;
    v_approved_at := (v_row ->> 'backdate_approved_at')::TIMESTAMP;

    INSERT INTO audit.backdate_event (
      table_name,
      record_id,
      created_by,
      created_date,
      system_date,
      backdate_reason,
      approved_by,
      approved_at,
      change_type
    ) VALUES (
      TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
      v_record_id,
      v_created_by,
      v_created_date,
      v_system_date,
      v_backdate_reason,
      v_approved_by,
      v_approved_at,
      CASE TG_OP WHEN 'INSERT' THEN 'CREATE' ELSE TG_OP END
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit.fn_log_backdate_event() IS
'Logs backdated transactions using JSON field lookup so shared triggers support differing row shapes.';


