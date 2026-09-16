/**
 * PHASE 4: INVENTORY LOT LIFECYCLE MANAGEMENT
 * 
 * Add lot status tracking to inv.lot table
 * Statuses: ACTIVE, CLOSED (qty=0 or fully consumed), EXPIRED (past expiry date)
 * 
 * Migration: Add 3 new columns to existing inv.lot table
 * Impact: Zero data loss; all existing lots default to ACTIVE
 * Rollback: DROP COLUMN if needed
 */

-- Step 1: Add lot_status column to inv.lot
ALTER TABLE inv.lot
ADD COLUMN lot_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
CONSTRAINT chk_lot_status CHECK (lot_status IN ('ACTIVE', 'CLOSED', 'EXPIRED'))
;

COMMENT ON COLUMN inv.lot.lot_status IS 
'Lot lifecycle status: ACTIVE=in use, CLOSED=quantity=0 or fully consumed, EXPIRED=past expiry date';

-- Step 2: Add lot_status_changed_at timestamp
ALTER TABLE inv.lot
ADD COLUMN lot_status_changed_at TIMESTAMP NULL
;

COMMENT ON COLUMN inv.lot.lot_status_changed_at IS 
'When lot status was last changed';

-- Step 3: Add lot_status_changed_by user reference
ALTER TABLE inv.lot
ADD COLUMN lot_status_changed_by UUID NULL
REFERENCES sec.app_user(user_id)
;

COMMENT ON COLUMN inv.lot.lot_status_changed_by IS 
'User who changed the status (system user if auto-triggered)';

-- Step 4: Create index for status queries (important for stock view performance)
CREATE INDEX idx_lot_status ON inv.lot(lot_status, product_id)
WHERE lot_status = 'ACTIVE'
;

COMMENT ON INDEX idx_lot_status IS 
'Index for fast queries filtering by lot_status; WHERE clause optimizes for ACTIVE lots';

-- Step 5: Update stock movement view to only include ACTIVE lots
-- This ensures stock calculations exclude closed/expired lots
-- 
-- NOTE: This must be applied to inv.v_stock_on_hand view if it exists
-- The view should be updated by separate view migration script
-- Original: SELECT lot_id, product_id, SUM(qty) FROM inv.stock_movement GROUP BY ...
-- Updated: ... WHERE lot_status = 'ACTIVE'

-- Step 6: Migration complete
-- All existing lots now have lot_status='ACTIVE' (default applied)
-- New lots will automatically be created with lot_status='ACTIVE'

-- Verification query to check migration:
-- SELECT COUNT(*) as total_lots, 
--        COUNT(*) FILTER (WHERE lot_status='ACTIVE') as active,
--        COUNT(*) FILTER (WHERE lot_status='CLOSED') as closed,
--        COUNT(*) FILTER (WHERE lot_status='EXPIRED') as expired
-- FROM inv.lot;
rollback;
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'inv';
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'inv' AND table_name = 'lot';
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'inv' AND table_name = 'lot'
ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'inv' AND table_name = 'lot' AND column_name = 'product_id';
CREATE INDEX idx_lot_status ON inv.lot(lot_status, product_id)
WHERE lot_status = 'ACTIVE';
rollback;
-- Step 1: Add lot_status column (if not already added)
ALTER TABLE inv.lot
ADD COLUMN IF NOT EXISTS lot_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
CONSTRAINT chk_lot_status CHECK (lot_status IN ('ACTIVE', 'CLOSED', 'EXPIRED'));

COMMENT ON COLUMN inv.lot.lot_status IS 
'Lot lifecycle status: ACTIVE=in use, CLOSED=quantity=0 or fully consumed, EXPIRED=past expiry date';

-- Step 2: Add lot_status_changed_at
ALTER TABLE inv.lot
ADD COLUMN IF NOT EXISTS lot_status_changed_at TIMESTAMP NULL;

COMMENT ON COLUMN inv.lot.lot_status_changed_at IS 
'When lot status was last changed';

-- Step 3: Add lot_status_changed_by
ALTER TABLE inv.lot
ADD COLUMN IF NOT EXISTS lot_status_changed_by UUID NULL
REFERENCES sec.app_user(user_id);

COMMENT ON COLUMN inv.lot.lot_status_changed_by IS 
'User who changed the status (system user if auto-triggered)';

-- Step 4: Create index (if it doesn't already exist)
CREATE INDEX IF NOT EXISTS idx_lot_status 
ON inv.lot(lot_status, product_id)
WHERE lot_status = 'ACTIVE';

-- Step 5: Add comment only if the index exists (safe now)
COMMENT ON INDEX idx_lot_status IS 
'Index for fast queries filtering by lot_status; WHERE clause optimizes for ACTIVE lots';
rollback;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'inv' AND table_name = 'lot'
ORDER BY ordinal_position;
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'inv' AND table_name = 'lot' AND column_name = 'product_id';
CREATE INDEX idx_lot_status ON inv.lot(lot_status, product_id) WHERE lot_status = 'ACTIVE';
-- 1. Check all columns and their defaults
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'inv' AND table_name = 'lot'
ORDER BY ordinal_position;
-- 2. Verify the index exists and its definition
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'inv' AND tablename = 'lot' 
  AND indexname = 'idx_lot_status';
-- 3. Check the check constraint
SELECT conname, contype, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'inv.lot'::regclass AND conname = 'chk_lot_status';
-- 4. View comments (optional)
SELECT col.column_name, pg_catalog.col_description(('inv.lot'::regclass)::oid, col.ordinal_position) AS column_comment
FROM information_schema.columns col
WHERE col.table_schema = 'inv' AND col.table_name = 'lot'
  AND col.column_name IN ('lot_status', 'lot_status_changed_at', 'lot_status_changed_by');
-- 5. Quick status distribution (nice to have)
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE lot_status = 'ACTIVE') AS active,
       COUNT(*) FILTER (WHERE lot_status = 'CLOSED') AS closed,
       COUNT(*) FILTER (WHERE lot_status = 'EXPIRED') AS expired
FROM inv.lot;