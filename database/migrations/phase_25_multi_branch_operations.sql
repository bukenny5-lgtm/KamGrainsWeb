-- Phase 5 continuation. One company -> branches -> locations.
-- Existing KAM data is single-branch, so only current location references are backfilled.
CREATE TABLE IF NOT EXISTS app.branch (
  branch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_code text NOT NULL,
  branch_name text NOT NULL,
  branch_type text NOT NULL DEFAULT 'BRANCH',
  is_active boolean NOT NULL DEFAULT true,
  is_head_office boolean NOT NULL DEFAULT false,
  address text,
  phone text,
  email text,
  default_location_id uuid NULL REFERENCES app.location(location_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_branch_company_code UNIQUE(company_id,branch_code),
  CONSTRAINT ck_branch_type CHECK(branch_type IN ('HEAD_OFFICE','BRANCH'))
);
CREATE INDEX IF NOT EXISTS ix_branch_company_active ON app.branch(company_id,is_active,branch_name);

ALTER TABLE app.company_profile
  ADD COLUMN IF NOT EXISTS default_branch_id uuid NULL REFERENCES app.branch(branch_id),
  ADD COLUMN IF NOT EXISTS active_branch_soft_limit integer NOT NULL DEFAULT 50;
DO $$ BEGIN ALTER TABLE app.company_profile ADD CONSTRAINT ck_active_branch_soft_limit CHECK(active_branch_soft_limit>0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO app.branch(company_id,branch_code,branch_name,branch_type,is_active,is_head_office,address,phone,email,created_at,updated_at)
SELECT cp.company_id,'KAM',COALESCE(NULLIF(cp.business_name,''),'KAM Main Branch'),'HEAD_OFFICE',true,true,cp.address,cp.phone,cp.email,now(),now()
FROM app.company_profile cp WHERE cp.is_active
ON CONFLICT(company_id,branch_code) DO NOTHING;

UPDATE app.company_profile cp SET default_branch_id=b.branch_id
FROM app.branch b WHERE b.company_id=cp.company_id AND b.branch_code='KAM' AND cp.is_active AND cp.default_branch_id IS NULL;

ALTER TABLE app.location ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);
UPDATE app.location l SET branch_id=b.branch_id
FROM app.branch b WHERE l.company_id=b.company_id AND l.branch_id IS NULL;
UPDATE app.location l SET branch_id=cp.default_branch_id
FROM app.company_profile cp WHERE l.branch_id IS NULL AND cp.is_active AND cp.default_branch_id IS NOT NULL;
DO $$ BEGIN ALTER TABLE app.location ALTER COLUMN branch_id SET NOT NULL;
EXCEPTION WHEN others THEN RAISE EXCEPTION 'Cannot assign every location to a branch; review location company_id and default branch.'; END $$;
CREATE INDEX IF NOT EXISTS ix_location_branch_active ON app.location(branch_id,is_active);

UPDATE app.branch b SET default_location_id=cp.default_location_id,updated_at=now()
FROM app.company_profile cp WHERE b.branch_id=cp.default_branch_id AND b.default_location_id IS NULL;

CREATE TABLE IF NOT EXISTS sec.user_branch (
  user_id uuid NOT NULL REFERENCES sec.app_user(user_id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,branch_id)
);
CREATE INDEX IF NOT EXISTS ix_user_branch_active ON sec.user_branch(user_id,is_active,branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_branch_one_default ON sec.user_branch(user_id) WHERE is_default AND is_active;

INSERT INTO sec.user_branch(user_id,branch_id,is_default,is_active)
SELECT DISTINCT ul.user_id,l.branch_id,ul.is_default,ul.is_active
FROM sec.user_location ul JOIN app.location l ON l.location_id=ul.location_id
ON CONFLICT(user_id,branch_id) DO NOTHING;

-- Preserve former broad single-branch access: existing KAM users retain their current
-- location scope inside KAM Main Branch. New branch grants remain explicit.
INSERT INTO sec.user_location(user_id,location_id,is_default,is_active)
SELECT ub.user_id,l.location_id,false,true
FROM sec.user_branch ub JOIN app.location l ON l.branch_id=ub.branch_id AND l.is_active
WHERE ub.is_active
ON CONFLICT(user_id,location_id) DO NOTHING;
INSERT INTO sec.user_branch(user_id,branch_id,is_default,is_active)
SELECT u.user_id,cp.default_branch_id,true,true FROM sec.app_user u
CROSS JOIN LATERAL(SELECT default_branch_id FROM app.company_profile WHERE is_active AND default_branch_id IS NOT NULL ORDER BY created_at,company_id LIMIT 1)cp
WHERE NOT EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=u.user_id AND ub.is_active)
ON CONFLICT(user_id,branch_id) DO NOTHING;

-- Branch dimensions only where no location already provides authoritative ownership.
ALTER TABLE sal.sales_order ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);
ALTER TABLE pur.purchase_order ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);
ALTER TABLE fin.expense_voucher ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);
ALTER TABLE fin.gl_journal ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);
ALTER TABLE sal.ar_payment ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);
ALTER TABLE pur.ap_payment ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);
UPDATE sal.sales_order SET branch_id=(SELECT default_branch_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1) WHERE branch_id IS NULL;
UPDATE pur.purchase_order SET branch_id=(SELECT default_branch_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1) WHERE branch_id IS NULL;
UPDATE fin.expense_voucher SET branch_id=(SELECT default_branch_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1) WHERE branch_id IS NULL;
UPDATE fin.gl_journal SET branch_id=(SELECT default_branch_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1) WHERE branch_id IS NULL;
UPDATE sal.ar_payment SET branch_id=(SELECT default_branch_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1) WHERE branch_id IS NULL;
UPDATE pur.ap_payment SET branch_id=(SELECT default_branch_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1) WHERE branch_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_sales_order_branch ON sal.sales_order(branch_id);
CREATE INDEX IF NOT EXISTS ix_purchase_order_branch ON pur.purchase_order(branch_id);
CREATE INDEX IF NOT EXISTS ix_expense_voucher_branch ON fin.expense_voucher(branch_id);
CREATE INDEX IF NOT EXISTS ix_gl_journal_branch ON fin.gl_journal(branch_id);
CREATE INDEX IF NOT EXISTS ix_ar_payment_branch ON sal.ar_payment(branch_id);
CREATE INDEX IF NOT EXISTS ix_ap_payment_branch ON pur.ap_payment(branch_id);

CREATE OR REPLACE FUNCTION app.enforce_branch_soft_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_limit integer; v_count integer;
BEGIN
  IF NEW.is_active AND (TG_OP='INSERT' OR OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.company_id IS DISTINCT FROM NEW.company_id) THEN
    SELECT active_branch_soft_limit INTO v_limit FROM app.company_profile WHERE company_id=NEW.company_id FOR UPDATE;
    SELECT count(*) INTO v_count FROM app.branch WHERE company_id=NEW.company_id AND is_active AND (TG_OP='INSERT' OR branch_id<>NEW.branch_id);
    IF v_count>=COALESCE(v_limit,50) THEN RAISE EXCEPTION 'Active branch soft limit (%) reached for this business.',COALESCE(v_limit,50) USING ERRCODE='23514'; END IF;
  END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_branch_soft_limit ON app.branch;
CREATE TRIGGER trg_branch_soft_limit BEFORE INSERT OR UPDATE OF is_active,company_id ON app.branch FOR EACH ROW EXECUTE FUNCTION app.enforce_branch_soft_limit();

CREATE OR REPLACE FUNCTION app.validate_location_branch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM app.branch WHERE branch_id=NEW.branch_id AND is_active;
  IF v_company IS NULL OR v_company IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Location branch must be active and belong to the same company.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_location_branch ON app.location;
CREATE TRIGGER trg_validate_location_branch BEFORE INSERT OR UPDATE OF branch_id,company_id ON app.location FOR EACH ROW EXECUTE FUNCTION app.validate_location_branch();

CREATE OR REPLACE FUNCTION sec.validate_user_location_branch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_branch uuid;
BEGIN
  SELECT branch_id INTO v_branch FROM app.location WHERE location_id=NEW.location_id AND is_active;
  IF v_branch IS NULL OR NOT EXISTS(SELECT 1 FROM sec.user_branch WHERE user_id=NEW.user_id AND branch_id=v_branch AND is_active) THEN
    RAISE EXCEPTION 'User must have active access to the location branch before location access can be assigned.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_user_location_branch ON sec.user_location;
CREATE TRIGGER trg_validate_user_location_branch BEFORE INSERT OR UPDATE OF user_id,location_id,is_active ON sec.user_location FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION sec.validate_user_location_branch();

CREATE OR REPLACE FUNCTION app.protect_branch_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.branch_code IS DISTINCT FROM OLD.branch_code THEN RAISE EXCEPTION 'Branch code is immutable.' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_protect_branch_code ON app.branch;
CREATE TRIGGER trg_protect_branch_code BEFORE UPDATE OF branch_code ON app.branch FOR EACH ROW EXECUTE FUNCTION app.protect_branch_code();

-- Transit is an internal, non-saleable stock-holding location within the dispatch branch.
INSERT INTO app.location(location_id,company_id,branch_id,location_code,location_name,location_type,is_active,is_saleable,is_stock_holding,is_system,created_at,updated_at)
SELECT gen_random_uuid(),b.company_id,b.branch_id,'TRANSIT_'||b.branch_code,b.branch_name||' Transit','TRANSIT',true,false,true,true,now(),now()
FROM app.branch b WHERE b.is_active
ON CONFLICT(location_code) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS inv.stock_transfer_no_seq;
CREATE TABLE IF NOT EXISTS inv.stock_transfer (
  stock_transfer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_no text NOT NULL UNIQUE DEFAULT ('TRF-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('inv.stock_transfer_no_seq')::text,6,'0')),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  source_branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  destination_branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  source_location_id uuid NOT NULL REFERENCES app.location(location_id),
  transit_location_id uuid NOT NULL REFERENCES app.location(location_id),
  destination_location_id uuid NOT NULL REFERENCES app.location(location_id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','IN_TRANSIT','RECEIVED','CANCELLED')),
  notes text,
  created_by uuid REFERENCES sec.app_user(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_by uuid REFERENCES sec.app_user(user_id),
  dispatched_at timestamptz,
  received_by uuid REFERENCES sec.app_user(user_id),
  received_at timestamptz,
  dispatch_movement_id uuid REFERENCES inv.stock_movement(movement_id),
  receipt_movement_id uuid REFERENCES inv.stock_movement(movement_id),
  CONSTRAINT ck_stock_transfer_same_company CHECK(source_branch_id<>destination_branch_id OR source_location_id<>destination_location_id)
);
CREATE TABLE IF NOT EXISTS inv.stock_transfer_line (
  stock_transfer_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_transfer_id uuid NOT NULL REFERENCES inv.stock_transfer(stock_transfer_id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inv.product(product_id),
  lot_id uuid NULL REFERENCES inv.lot(lot_id),
  qty numeric(18,3) NOT NULL CHECK(qty>0),
  unit_cost numeric(18,4) NOT NULL CHECK(unit_cost>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_stock_transfer_status ON inv.stock_transfer(status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_stock_transfer_source_branch ON inv.stock_transfer(source_branch_id,status);
CREATE INDEX IF NOT EXISTS ix_stock_transfer_destination_branch ON inv.stock_transfer(destination_branch_id,status);

CREATE OR REPLACE FUNCTION inv.validate_stock_transfer_locations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_source_company uuid; v_dest_company uuid; v_source_branch uuid; v_dest_branch uuid; v_transit_branch uuid;
BEGIN
  SELECT company_id INTO v_source_company FROM app.branch WHERE branch_id=NEW.source_branch_id AND is_active;
  SELECT company_id INTO v_dest_company FROM app.branch WHERE branch_id=NEW.destination_branch_id AND is_active;
  SELECT branch_id INTO v_source_branch FROM app.location WHERE location_id=NEW.source_location_id AND is_active AND is_stock_holding;
  SELECT branch_id INTO v_dest_branch FROM app.location WHERE location_id=NEW.destination_location_id AND is_active AND is_stock_holding;
  SELECT branch_id INTO v_transit_branch FROM app.location WHERE location_id=NEW.transit_location_id AND is_active AND is_system AND location_type='TRANSIT' AND NOT is_saleable;
  IF v_source_company IS NULL OR v_source_company<>NEW.company_id OR v_dest_company<>NEW.company_id OR v_source_branch<>NEW.source_branch_id OR v_dest_branch<>NEW.destination_branch_id OR v_transit_branch<>NEW.source_branch_id THEN
    RAISE EXCEPTION 'Transfer branches, company, source, destination, or transit location do not agree.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_stock_transfer_locations ON inv.stock_transfer;
CREATE TRIGGER trg_validate_stock_transfer_locations BEFORE INSERT OR UPDATE OF company_id,source_branch_id,destination_branch_id,source_location_id,transit_location_id,destination_location_id ON inv.stock_transfer FOR EACH ROW EXECUTE FUNCTION inv.validate_stock_transfer_locations();

COMMENT ON TABLE app.branch IS 'Operating/security/reporting unit within one company. Locations belong to exactly one branch.';
COMMENT ON COLUMN app.company_profile.active_branch_soft_limit IS 'Default soft commercial limit is 50 active branches per company; no hard capacity ceiling.';
COMMENT ON COLUMN fin.gl_journal.branch_id IS 'Optional operating branch dimension; null remains valid for company-wide/shared-accounting entries.';
