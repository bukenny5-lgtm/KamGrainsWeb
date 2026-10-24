BEGIN;

ALTER TABLE inv.stock_request
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS ix_stock_request_status_created
  ON inv.stock_request(status, created_at DESC);

COMMIT;
