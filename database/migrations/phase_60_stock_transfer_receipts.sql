-- Phase 9E: immutable destination receipt events for dispatch executions.
CREATE SEQUENCE IF NOT EXISTS inv.stock_transfer_receipt_no_seq;

CREATE TABLE IF NOT EXISTS inv.stock_transfer_receipt (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE DEFAULT ('TRR-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('inv.stock_transfer_receipt_no_seq')::text,6,'0')),
  dispatch_id uuid NOT NULL REFERENCES inv.stock_transfer_dispatch(dispatch_id),
  stock_transfer_id uuid NOT NULL REFERENCES inv.stock_transfer(stock_transfer_id),
  stock_request_id uuid REFERENCES inv.stock_request(request_id),
  source_branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  source_location_id uuid NOT NULL REFERENCES app.location(location_id),
  destination_branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  destination_location_id uuid NOT NULL REFERENCES app.location(location_id),
  status text NOT NULL DEFAULT 'POSTED' CHECK (status='POSTED'),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES sec.app_user(user_id),
  notes text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_transfer_receipt_idempotency UNIQUE (dispatch_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS inv.stock_transfer_receipt_line (
  receipt_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES inv.stock_transfer_receipt(receipt_id) ON DELETE CASCADE,
  dispatch_line_id uuid NOT NULL REFERENCES inv.stock_transfer_dispatch_line(dispatch_line_id),
  stock_transfer_line_id uuid NOT NULL REFERENCES inv.stock_transfer_line(stock_transfer_line_id),
  product_id uuid NOT NULL REFERENCES inv.product(product_id),
  lot_id uuid REFERENCES inv.lot(lot_id),
  uom text NOT NULL,
  dispatched_qty numeric(18,3) NOT NULL CHECK (dispatched_qty>=0),
  received_qty numeric(18,3) NOT NULL CHECK (received_qty>0),
  unit_cost numeric(18,4) NOT NULL CHECK (unit_cost>=0),
  variance_reason text,
  variance_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_stock_transfer_receipt_dispatch
  ON inv.stock_transfer_receipt(dispatch_id,received_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_transfer_receipt_transfer
  ON inv.stock_transfer_receipt(stock_transfer_id,received_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_transfer_receipt_line_dispatch_line
  ON inv.stock_transfer_receipt_line(dispatch_line_id);

COMMENT ON TABLE inv.stock_transfer_receipt IS 'Immutable destination receipt events. Each TRR represents one physical receipt event.';
