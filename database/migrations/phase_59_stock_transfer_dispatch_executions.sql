-- Phase 9D: durable dispatch executions for partial and repeatable transfer dispatch.
-- Receiving remains a separate operation; these tables record source -> transit only.
CREATE SEQUENCE IF NOT EXISTS inv.stock_transfer_dispatch_no_seq;

ALTER TABLE inv.stock_transfer DROP CONSTRAINT IF EXISTS stock_transfer_status_check;
ALTER TABLE inv.stock_transfer DROP CONSTRAINT IF EXISTS ck_stock_transfer_status;
ALTER TABLE inv.stock_transfer ADD CONSTRAINT stock_transfer_status_check
  CHECK (status IN ('DRAFT','PARTIALLY_DISPATCHED','IN_TRANSIT','RECEIVED_WITH_VARIANCE','RECEIVED','CANCELLED'));

CREATE TABLE IF NOT EXISTS inv.stock_transfer_dispatch (
  dispatch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_no text NOT NULL UNIQUE DEFAULT ('TEX-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('inv.stock_transfer_dispatch_no_seq')::text,6,'0')),
  stock_transfer_id uuid NOT NULL REFERENCES inv.stock_transfer(stock_transfer_id),
  source_branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  source_location_id uuid NOT NULL REFERENCES app.location(location_id),
  transit_location_id uuid NOT NULL REFERENCES app.location(location_id),
  destination_branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  destination_location_id uuid NOT NULL REFERENCES app.location(location_id),
  status text NOT NULL DEFAULT 'DISPATCHED' CHECK (status='DISPATCHED'),
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  dispatched_by uuid REFERENCES sec.app_user(user_id),
  movement_id uuid REFERENCES inv.stock_movement(movement_id),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_transfer_dispatch_idempotency UNIQUE (stock_transfer_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS inv.stock_transfer_dispatch_line (
  dispatch_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES inv.stock_transfer_dispatch(dispatch_id) ON DELETE CASCADE,
  stock_transfer_line_id uuid NOT NULL REFERENCES inv.stock_transfer_line(stock_transfer_line_id),
  product_id uuid NOT NULL REFERENCES inv.product(product_id),
  lot_id uuid REFERENCES inv.lot(lot_id),
  qty numeric(18,3) NOT NULL CHECK (qty>0),
  unit_cost numeric(18,4) NOT NULL CHECK (unit_cost>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_stock_transfer_dispatch_transfer
  ON inv.stock_transfer_dispatch(stock_transfer_id,dispatched_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_transfer_dispatch_destination
  ON inv.stock_transfer_dispatch(destination_branch_id,status,dispatched_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_transfer_dispatch_line_transfer_line
  ON inv.stock_transfer_dispatch_line(stock_transfer_line_id);

COMMENT ON TABLE inv.stock_transfer_dispatch IS 'Immutable source-to-transit dispatch executions. Destination receipt is a separate operation.';
COMMENT ON COLUMN inv.stock_transfer_dispatch.idempotency_key IS 'Client retry key scoped to one prepared transfer.';
