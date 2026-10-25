-- Phase 9C: idempotent source-side transfer preparation.
ALTER TABLE inv.stock_transfer ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_transfer_idempotency_key ON inv.stock_transfer(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_stock_transfer_request_status ON inv.stock_transfer(stock_request_id, status, created_at DESC);
COMMENT ON COLUMN inv.stock_transfer.idempotency_key IS 'Client retry key for atomic transfer-draft preparation.';
