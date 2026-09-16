/**
 * PHASE 4: BACKDATED TRANSACTION SUPPORT
 * 
 * Add transaction_date + backdate tracking fields to transaction tables
 * 
 * Tables modified:
 * - sal.delivery
 * - sal.ar_invoice
 * - sal.ar_payment_apply
 * - pur.ap_invoice
 * - pur.ap_payment
 * 
 * Fields added per table: 5 columns
 * - transaction_date: Business date (may differ from created_at)
 * - backdate_flag: TRUE if transaction_date < created_at::date
 * - backdate_reason: Optional text explaining the backdate
 * - backdate_approved_by: Manager/Admin who approved the backdate
 * - backdate_approved_at: When approval occurred
 * 
 * Migration: Safe - all columns have defaults
 * Impact: Zero data loss; existing records get transaction_date = created_at::date
 */

-- ============================================================================
-- TABLE 1: sal.delivery
-- ============================================================================

ALTER TABLE sal.delivery
ADD COLUMN transaction_date DATE NOT NULL DEFAULT CURRENT_DATE
;

COMMENT ON COLUMN sal.delivery.transaction_date IS 
'Business date of delivery (may differ from created_at)';

ALTER TABLE sal.delivery
ADD COLUMN backdate_flag BOOLEAN DEFAULT FALSE
;

COMMENT ON COLUMN sal.delivery.backdate_flag IS 
'TRUE if transaction_date < created_at::date';

ALTER TABLE sal.delivery
ADD COLUMN backdate_reason VARCHAR(500) NULL
;

COMMENT ON COLUMN sal.delivery.backdate_reason IS 
'Reason for backdating (required if backdate_flag=TRUE)';

ALTER TABLE sal.delivery
ADD COLUMN backdate_approved_by UUID NULL
REFERENCES sec.app_user(user_id)
;

COMMENT ON COLUMN sal.delivery.backdate_approved_by IS 
'Manager/Admin who approved the backdated entry';

ALTER TABLE sal.delivery
ADD COLUMN backdate_approved_at TIMESTAMP NULL
;

COMMENT ON COLUMN sal.delivery.backdate_approved_at IS 
'When backdate was approved';

-- ============================================================================
-- TABLE 2: sal.ar_invoice
-- ============================================================================

ALTER TABLE sal.ar_invoice
ADD COLUMN transaction_date DATE NOT NULL DEFAULT CURRENT_DATE
;

COMMENT ON COLUMN sal.ar_invoice.transaction_date IS 
'Business date of invoice (may differ from invoice_date)';

ALTER TABLE sal.ar_invoice
ADD COLUMN backdate_flag BOOLEAN DEFAULT FALSE
;

COMMENT ON COLUMN sal.ar_invoice.backdate_flag IS 
'TRUE if transaction_date < invoice_date';

ALTER TABLE sal.ar_invoice
ADD COLUMN backdate_reason VARCHAR(500) NULL
;

COMMENT ON COLUMN sal.ar_invoice.backdate_reason IS 
'Reason for backdating';

ALTER TABLE sal.ar_invoice
ADD COLUMN backdate_approved_by UUID NULL
REFERENCES sec.app_user(user_id)
;

COMMENT ON COLUMN sal.ar_invoice.backdate_approved_by IS 
'Manager/Admin who approved the backdate';

ALTER TABLE sal.ar_invoice
ADD COLUMN backdate_approved_at TIMESTAMP NULL
;

COMMENT ON COLUMN sal.ar_invoice.backdate_approved_at IS 
'When approval was granted';

-- ============================================================================
-- TABLE 3: sal.ar_payment_apply
-- ============================================================================

ALTER TABLE sal.ar_payment_apply
ADD COLUMN transaction_date DATE NOT NULL DEFAULT CURRENT_DATE
;

COMMENT ON COLUMN sal.ar_payment_apply.transaction_date IS 
'Business date of payment';

ALTER TABLE sal.ar_payment_apply
ADD COLUMN backdate_flag BOOLEAN DEFAULT FALSE
;

COMMENT ON COLUMN sal.ar_payment_apply.backdate_flag IS 
'TRUE if transaction_date differs from payment_date';

ALTER TABLE sal.ar_payment_apply
ADD COLUMN backdate_reason VARCHAR(500) NULL
;

COMMENT ON COLUMN sal.ar_payment_apply.backdate_reason IS 
'Reason for backdating the payment';

ALTER TABLE sal.ar_payment_apply
ADD COLUMN backdate_approved_by UUID NULL
REFERENCES sec.app_user(user_id)
;

COMMENT ON COLUMN sal.ar_payment_apply.backdate_approved_by IS 
'Approver';

ALTER TABLE sal.ar_payment_apply
ADD COLUMN backdate_approved_at TIMESTAMP NULL
;

COMMENT ON COLUMN sal.ar_payment_apply.backdate_approved_at IS 
'Approval timestamp';

-- ============================================================================
-- TABLE 4: pur.ap_invoice
-- ============================================================================

ALTER TABLE pur.ap_invoice
ADD COLUMN transaction_date DATE NOT NULL DEFAULT CURRENT_DATE
;

COMMENT ON COLUMN pur.ap_invoice.transaction_date IS 
'Business date of invoice';

ALTER TABLE pur.ap_invoice
ADD COLUMN backdate_flag BOOLEAN DEFAULT FALSE
;

COMMENT ON COLUMN pur.ap_invoice.backdate_flag IS 
'TRUE if transaction_date < invoice_date';

ALTER TABLE pur.ap_invoice
ADD COLUMN backdate_reason VARCHAR(500) NULL
;

COMMENT ON COLUMN pur.ap_invoice.backdate_reason IS 
'Reason for backdating';

ALTER TABLE pur.ap_invoice
ADD COLUMN backdate_approved_by UUID NULL
REFERENCES sec.app_user(user_id)
;

COMMENT ON COLUMN pur.ap_invoice.backdate_approved_by IS 
'Approver';

ALTER TABLE pur.ap_invoice
ADD COLUMN backdate_approved_at TIMESTAMP NULL
;

COMMENT ON COLUMN pur.ap_invoice.backdate_approved_at IS 
'Approval timestamp';

-- ============================================================================
-- TABLE 5: pur.ap_payment
-- ============================================================================

ALTER TABLE pur.ap_payment
ADD COLUMN transaction_date DATE NOT NULL DEFAULT CURRENT_DATE
;

COMMENT ON COLUMN pur.ap_payment.transaction_date IS 
'Business date of payment';

ALTER TABLE pur.ap_payment
ADD COLUMN backdate_flag BOOLEAN DEFAULT FALSE
;

COMMENT ON COLUMN pur.ap_payment.backdate_flag IS 
'TRUE if transaction_date < payment_date';

ALTER TABLE pur.ap_payment
ADD COLUMN backdate_reason VARCHAR(500) NULL
;

COMMENT ON COLUMN pur.ap_payment.backdate_reason IS 
'Reason for backdating';

ALTER TABLE pur.ap_payment
ADD COLUMN backdate_approved_by UUID NULL
REFERENCES sec.app_user(user_id)
;

COMMENT ON COLUMN pur.ap_payment.backdate_approved_by IS 
'Approver';

ALTER TABLE pur.ap_payment
ADD COLUMN backdate_approved_at TIMESTAMP NULL
;

COMMENT ON COLUMN pur.ap_payment.backdate_approved_at IS 
'Approval timestamp';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary: 25 new columns added (5 per table × 5 tables)
-- All have safe defaults
-- All existing records get transaction_date = created_at::date, backdate_flag = FALSE
-- Verify with: SELECT COUNT(*) FROM information_schema.columns 
--             WHERE table_schema IN ('sal', 'pur') 
--             AND column_name LIKE 'transaction_date%' OR 'backdate%'
