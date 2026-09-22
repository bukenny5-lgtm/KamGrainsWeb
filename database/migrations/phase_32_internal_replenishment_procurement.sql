-- Phase 32: internal stock requests, transfer linkage, and branch procurement policy.
ALTER TABLE app.branch ADD COLUMN IF NOT EXISTS procurement_mode text NOT NULL DEFAULT 'HYBRID';
INSERT INTO sec.role(role_code,role_name) VALUES('STOCK_VISIBILITY','Cross-Branch Stock Visibility') ON CONFLICT(role_code) DO UPDATE SET role_name=EXCLUDED.role_name;
ALTER TABLE pur.purchase_order ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES sec.app_user(user_id);
ALTER TABLE pur.purchase_order ADD COLUMN IF NOT EXISTS approved_at timestamptz;
DO $$ BEGIN
  ALTER TABLE app.branch ADD CONSTRAINT ck_branch_procurement_mode
    CHECK (procurement_mode IN ('CENTRAL_ONLY','LOCAL_ALLOWED','LOCAL_WITH_APPROVAL','HYBRID'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS inv.stock_request_no_seq;
CREATE TABLE IF NOT EXISTS inv.stock_request (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no text NOT NULL UNIQUE DEFAULT ('ISR-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('inv.stock_request_no_seq')::text,6,'0')),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  requesting_branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  requesting_location_id uuid NOT NULL REFERENCES app.location(location_id),
  preferred_source_branch_id uuid NULL REFERENCES app.branch(branch_id),
  preferred_source_location_id uuid NULL REFERENCES app.location(location_id),
  request_date date NOT NULL DEFAULT current_date,
  required_date date,
  priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','URGENT')),
  request_type text NOT NULL DEFAULT 'REPLENISHMENT' CHECK(request_type IN ('REPLENISHMENT','EMERGENCY','CUSTOMER_ORDER','REBALANCING','OTHER')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_SUPPLIED','FULFILLED','REJECTED','CANCELLED')),
  notes text,
  rejection_reason text,
  requested_by uuid NOT NULL REFERENCES sec.app_user(user_id),
  submitted_by uuid REFERENCES sec.app_user(user_id), submitted_at timestamptz,
  approved_by uuid REFERENCES sec.app_user(user_id), approved_at timestamptz,
  rejected_by uuid REFERENCES sec.app_user(user_id), rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((preferred_source_location_id IS NULL) OR preferred_source_branch_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS inv.stock_request_line (
  request_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES inv.stock_request(request_id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inv.product(product_id),
  uom_code text NOT NULL,
  requested_qty numeric(18,3) NOT NULL CHECK(requested_qty>0),
  approved_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK(approved_qty>=0),
  supplied_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK(supplied_qty>=0),
  notes text,
  CHECK(approved_qty<=requested_qty), CHECK(supplied_qty<=approved_qty)
);
CREATE INDEX IF NOT EXISTS ix_stock_request_scope_status ON inv.stock_request(requesting_branch_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_request_source_status ON inv.stock_request(preferred_source_branch_id,status,created_at DESC);

ALTER TABLE inv.stock_transfer ADD COLUMN IF NOT EXISTS stock_request_id uuid NULL REFERENCES inv.stock_request(request_id);
ALTER TABLE inv.stock_transfer ADD COLUMN IF NOT EXISTS expected_arrival_date date;
ALTER TABLE inv.stock_transfer ADD COLUMN IF NOT EXISTS transport_method text;
ALTER TABLE inv.stock_transfer ADD COLUMN IF NOT EXISTS waybill_reference text;
ALTER TABLE inv.stock_transfer ADD COLUMN IF NOT EXISTS dispatch_reference text;
ALTER TABLE inv.stock_transfer_line ADD COLUMN IF NOT EXISTS received_qty numeric(18,3);
ALTER TABLE inv.stock_transfer_line ADD COLUMN IF NOT EXISTS variance_reason text;
ALTER TABLE inv.stock_transfer_line ADD COLUMN IF NOT EXISTS variance_notes text;
ALTER TABLE inv.stock_transfer_line ADD COLUMN IF NOT EXISTS request_line_id uuid NULL REFERENCES inv.stock_request_line(request_line_id);
DO $$ BEGIN ALTER TABLE inv.stock_transfer DROP CONSTRAINT IF EXISTS stock_transfer_status_check; EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE inv.stock_transfer ADD CONSTRAINT ck_stock_transfer_status CHECK(status IN ('DRAFT','IN_TRANSIT','RECEIVED','RECEIVED_WITH_VARIANCE','CANCELLED')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE inv.stock_transfer_line ADD CONSTRAINT ck_transfer_received_qty CHECK(received_qty IS NULL OR (received_qty>=0 AND received_qty<=qty)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE inv.stock_transfer_line ADD CONSTRAINT ck_transfer_variance_reason CHECK(variance_reason IS NULL OR variance_reason IN ('DAMAGED_IN_TRANSIT','SHORT_DELIVERY','SPILLAGE','LOST_IN_TRANSIT','COUNT_DIFFERENCE','OTHER')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION inv.guard_stock_request_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('SUBMITTED','CANCELLED')) OR
    (OLD.status='SUBMITTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR
    (OLD.status='APPROVED' AND NEW.status IN ('PARTIALLY_SUPPLIED','FULFILLED','CANCELLED')) OR
    (OLD.status='PARTIALLY_SUPPLIED' AND NEW.status IN ('FULFILLED','CANCELLED'))
  ) THEN RAISE EXCEPTION 'Invalid stock request state transition: % -> %',OLD.status,NEW.status USING ERRCODE='23514'; END IF;
  NEW.updated_at:=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_stock_request_state ON inv.stock_request;
CREATE TRIGGER trg_guard_stock_request_state BEFORE UPDATE OF status ON inv.stock_request FOR EACH ROW EXECUTE FUNCTION inv.guard_stock_request_state();

COMMENT ON COLUMN app.branch.procurement_mode IS 'Branch external purchasing policy. Internal replenishment remains a separate request/transfer workflow.';
COMMENT ON TABLE inv.stock_request IS 'Internal branch replenishment request. It is not a supplier purchase order and creates no AP/AR or sales posting.';
