/**
 * PHASE 4: AUDIT BACKDATE EVENT TABLE
 * 
 * New table to track all backdated transactions
 * Used for compliance and audit trail
 * 
 * Every backdated transaction (insert or update) automatically logged here
 */

-- Step 1: Create audit.backdate_event table
CREATE TABLE IF NOT EXISTS audit.backdate_event (
  backdate_event_id BIGSERIAL PRIMARY KEY,
  
  -- What was changed
  table_name VARCHAR(100) NOT NULL 
    COMMENT 'Schema.table: sal.delivery, sal.ar_invoice, pur.ap_invoice, etc',
  record_id UUID NOT NULL 
    COMMENT 'The primary key of the modified record',
  
  -- Who changed it
  created_by UUID NOT NULL REFERENCES sec.app_user(user_id) 
    COMMENT 'User who created the backdated entry',
  
  -- Dates
  created_date DATE NOT NULL 
    COMMENT 'The backdated transaction date (business date)',
  system_date TIMESTAMP NOT NULL 
    COMMENT 'When the entry was actually created in system',
  days_backdated INT GENERATED ALWAYS AS (created_date::date - system_date::date) STORED
    COMMENT 'Number of days backdated (negative if in future)',
  
  -- Reason & Approval
  backdate_reason VARCHAR(500) 
    COMMENT 'Why the transaction was backdated',
  approved_by UUID REFERENCES sec.app_user(user_id) 
    COMMENT 'Manager/Admin who approved (if required)',
  approved_at TIMESTAMP 
    COMMENT 'When approval was granted',
  
  -- Event metadata
  change_type VARCHAR(20) NOT NULL 
    COMMENT 'CREATE or UPDATE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  CONSTRAINT chk_backdate_change_type CHECK (change_type IN ('CREATE', 'UPDATE'))
);

-- Step 2: Create indexes for common queries
CREATE INDEX idx_backdate_event_date 
  ON audit.backdate_event(created_date DESC, table_name)
  COMMENT 'Index for filtering backdate events by date range';

CREATE INDEX idx_backdate_event_table 
  ON audit.backdate_event(table_name, created_date DESC)
  COMMENT 'Index for finding all backdates for specific table';

CREATE INDEX idx_backdate_event_user 
  ON audit.backdate_event(created_by, created_at DESC)
  COMMENT 'Index for audit trail by user';

CREATE INDEX idx_backdate_event_days 
  ON audit.backdate_event(days_backdated DESC)
  COMMENT 'Index for identifying most heavily backdated transactions';

-- Step 3: Add table comments
COMMENT ON TABLE audit.backdate_event IS 
'Comprehensive audit log for all backdated transactions. Enables compliance tracking and fraud detection.';

COMMENT ON COLUMN audit.backdate_event.backdate_event_id IS 
'Unique event identifier';

COMMENT ON COLUMN audit.backdate_event.table_name IS 
'Which table was modified (sal.delivery, sal.ar_invoice, pur.ap_invoice, sal.ar_payment_apply, pur.ap_payment)';

COMMENT ON COLUMN audit.backdate_event.record_id IS 
'The UUID primary key of the transaction record';

COMMENT ON COLUMN audit.backdate_event.created_by IS 
'User who initiated the backdated transaction';

COMMENT ON COLUMN audit.backdate_event.created_date IS 
'The business date assigned to the transaction (may be in the past)';

COMMENT ON COLUMN audit.backdate_event.system_date IS 
'The actual system timestamp when record was created';

COMMENT ON COLUMN audit.backdate_event.days_backdated IS 
'Calculated: created_date - system_date (negative if in future, positive if in past)';

COMMENT ON COLUMN audit.backdate_event.backdate_reason IS 
'Required reason explaining why transaction was backdated';

COMMENT ON COLUMN audit.backdate_event.approved_by IS 
'Manager or Admin who approved the backdate (required for strict approval workflow)';

COMMENT ON COLUMN audit.backdate_event.approved_at IS 
'Timestamp when approval was granted';

COMMENT ON COLUMN audit.backdate_event.change_type IS 
'Whether this was a CREATE (new backdated entry) or UPDATE (changing existing entry)';

-- Step 4: Create trigger function to auto-log backdate events
-- This function is called whenever a backdated transaction is inserted/updated
-- Pattern: AFTER INSERT/UPDATE ON sal.delivery, sal.ar_invoice, etc.

CREATE OR REPLACE FUNCTION audit.fn_log_backdate_event() 
RETURNS TRIGGER AS $$
DECLARE
  v_record_id UUID;
BEGIN
  -- Only log if backdate_flag is TRUE
  IF NEW.backdate_flag = TRUE THEN
    -- Determine record ID based on table
    v_record_id := CASE TG_TABLE_NAME
      WHEN 'delivery' THEN NEW.delivery_id
      WHEN 'ar_invoice' THEN NEW.ar_invoice_id
      WHEN 'ar_payment_apply' THEN NEW.ar_payment_apply_id
      WHEN 'ap_invoice' THEN NEW.ap_invoice_id
      WHEN 'ap_payment' THEN NEW.ap_payment_id
      ELSE NEW.id  -- Fallback for any other tables
    END;

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
      NEW.created_by,
      NEW.transaction_date,
      NEW.created_at,
      NEW.backdate_reason,
      NEW.backdate_approved_by,
      NEW.backdate_approved_at,
      TG_OP  -- 'INSERT' or 'UPDATE'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit.fn_log_backdate_event() IS 
'Trigger function to automatically log backdated transactions to audit.backdate_event table';

-- Step 5: Create triggers on each transaction table
-- NOTE: These triggers reference the correct primary key columns for each table

-- Trigger for sal.delivery (primary key: delivery_id)
CREATE TRIGGER trg_backdate_delivery
AFTER INSERT OR UPDATE ON sal.delivery
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for sal.ar_invoice (primary key: ar_invoice_id)
CREATE TRIGGER trg_backdate_ar_invoice
AFTER INSERT OR UPDATE ON sal.ar_invoice
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for sal.ar_payment_apply (primary key: ar_payment_apply_id or similar)
CREATE TRIGGER trg_backdate_ar_payment
AFTER INSERT OR UPDATE ON sal.ar_payment_apply
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for pur.ap_invoice (primary key: ap_invoice_id)
CREATE TRIGGER trg_backdate_ap_invoice
AFTER INSERT OR UPDATE ON pur.ap_invoice
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for pur.ap_payment (primary key: ap_payment_id or similar)
CREATE TRIGGER trg_backdate_ap_payment
AFTER INSERT OR UPDATE ON pur.ap_payment
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- audit.backdate_event table created with:
-- - Comprehensive fields tracking user, dates, reason, approval
-- - Automatic trigger logging on all 5 transaction tables
-- - Indexed for efficient audit queries
-- 
-- Verify with:
-- SELECT * FROM audit.backdate_event ORDER BY created_at DESC LIMIT 10;
rollback;
/**
 * PHASE 4: AUDIT BACKDATE EVENT TABLE
 * 
 * New table to track all backdated transactions
 * Used for compliance and audit trail
 * 
 * Every backdated transaction (insert or update) automatically logged here
 */

-- Step 1: Create audit.backdate_event table
CREATE TABLE IF NOT EXISTS audit.backdate_event (
  backdate_event_id BIGSERIAL PRIMARY KEY,
  
  -- What was changed
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  
  -- Who changed it
  created_by UUID NOT NULL REFERENCES sec.app_user(user_id),
  
  -- Dates
  created_date DATE NOT NULL,
  system_date TIMESTAMP NOT NULL,
  days_backdated INT GENERATED ALWAYS AS (created_date::date - system_date::date) STORED,
  
  -- Reason & Approval
  backdate_reason VARCHAR(500),
  approved_by UUID REFERENCES sec.app_user(user_id),
  approved_at TIMESTAMP,
  
  -- Event metadata
  change_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT chk_backdate_change_type CHECK (change_type IN ('CREATE', 'UPDATE'))
);

-- Step 2: Create indexes for common queries
CREATE INDEX idx_backdate_event_date 
  ON audit.backdate_event(created_date DESC, table_name);

CREATE INDEX idx_backdate_event_table 
  ON audit.backdate_event(table_name, created_date DESC);

CREATE INDEX idx_backdate_event_user 
  ON audit.backdate_event(created_by, created_at DESC);

CREATE INDEX idx_backdate_event_days 
  ON audit.backdate_event(days_backdated DESC);

-- Step 3: Add table and column comments
COMMENT ON TABLE audit.backdate_event IS 
'Comprehensive audit log for all backdated transactions. Enables compliance tracking and fraud detection.';

COMMENT ON COLUMN audit.backdate_event.backdate_event_id IS 
'Unique event identifier';

COMMENT ON COLUMN audit.backdate_event.table_name IS 
'Which table was modified (sal.delivery, sal.ar_invoice, pur.ap_invoice, sal.ar_payment_apply, pur.ap_payment)';

COMMENT ON COLUMN audit.backdate_event.record_id IS 
'The UUID primary key of the transaction record';

COMMENT ON COLUMN audit.backdate_event.created_by IS 
'User who initiated the backdated transaction';

COMMENT ON COLUMN audit.backdate_event.created_date IS 
'The business date assigned to the transaction (may be in the past)';

COMMENT ON COLUMN audit.backdate_event.system_date IS 
'The actual system timestamp when record was created';

COMMENT ON COLUMN audit.backdate_event.days_backdated IS 
'Calculated: created_date - system_date (negative if in future, positive if in past)';

COMMENT ON COLUMN audit.backdate_event.backdate_reason IS 
'Required reason explaining why transaction was backdated';

COMMENT ON COLUMN audit.backdate_event.approved_by IS 
'Manager or Admin who approved the backdate (required for strict approval workflow)';

COMMENT ON COLUMN audit.backdate_event.approved_at IS 
'Timestamp when approval was granted';

COMMENT ON COLUMN audit.backdate_event.change_type IS 
'Whether this was a CREATE (new backdated entry) or UPDATE (changing existing entry)';

COMMENT ON COLUMN audit.backdate_event.created_at IS 
'Timestamp when the audit record itself was created';

-- Step 4: Create trigger function to auto-log backdate events
CREATE OR REPLACE FUNCTION audit.fn_log_backdate_event() 
RETURNS TRIGGER AS $$
DECLARE
  v_record_id UUID;
BEGIN
  -- Only log if backdate_flag is TRUE
  IF NEW.backdate_flag = TRUE THEN
    -- Determine record ID based on table
    v_record_id := CASE TG_TABLE_NAME
      WHEN 'delivery' THEN NEW.delivery_id
      WHEN 'ar_invoice' THEN NEW.ar_invoice_id
      WHEN 'ar_payment_apply' THEN NEW.ar_payment_apply_id
      WHEN 'ap_invoice' THEN NEW.ap_invoice_id
      WHEN 'ap_payment' THEN NEW.ap_payment_id
      ELSE NEW.id  -- Fallback for any other tables
    END;

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
      NEW.created_by,
      NEW.transaction_date,
      NEW.created_at,
      NEW.backdate_reason,
      NEW.backdate_approved_by,
      NEW.backdate_approved_at,
      TG_OP
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION audit.fn_log_backdate_event() IS 
'Trigger function to automatically log backdated transactions to audit.backdate_event table';

-- Step 5: Create triggers on each transaction table
-- Trigger for sal.delivery (primary key: delivery_id)
CREATE TRIGGER trg_backdate_delivery
AFTER INSERT OR UPDATE ON sal.delivery
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for sal.ar_invoice (primary key: ar_invoice_id)
CREATE TRIGGER trg_backdate_ar_invoice
AFTER INSERT OR UPDATE ON sal.ar_invoice
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for sal.ar_payment_apply (primary key: ar_payment_apply_id)
CREATE TRIGGER trg_backdate_ar_payment
AFTER INSERT OR UPDATE ON sal.ar_payment_apply
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for pur.ap_invoice (primary key: ap_invoice_id)
CREATE TRIGGER trg_backdate_ap_invoice
AFTER INSERT OR UPDATE ON pur.ap_invoice
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- Trigger for pur.ap_payment (primary key: ap_payment_id)
CREATE TRIGGER trg_backdate_ap_payment
AFTER INSERT OR UPDATE ON pur.ap_payment
FOR EACH ROW
WHEN (NEW.backdate_flag = TRUE)
EXECUTE FUNCTION audit.fn_log_backdate_event();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Verify with:
-- SELECT * FROM audit.backdate_event ORDER BY created_at DESC LIMIT 10;
rollback;
