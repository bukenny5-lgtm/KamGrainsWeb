-- Phase 5: multi-location foundation. Additive; transaction location IDs are preserved.
ALTER TABLE app.location
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES app.company_profile(company_id),
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'WAREHOUSE',
  ADD COLUMN IF NOT EXISTS is_saleable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_stock_holding boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_location_id uuid REFERENCES app.location(location_id),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE app.company_profile
  ADD COLUMN IF NOT EXISTS default_location_id uuid REFERENCES app.location(location_id),
  ADD COLUMN IF NOT EXISTS active_location_soft_limit integer NOT NULL DEFAULT 50;

DO $$ BEGIN
  ALTER TABLE app.location ADD CONSTRAINT ck_location_type
    CHECK (location_type IN ('HEAD_OFFICE','BRANCH','SHOP','WAREHOUSE','STOCK_ROOM','PRODUCTION','QUARANTINE','DAMAGED','TRANSIT','VIRTUAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE app.company_profile ADD CONSTRAINT ck_active_location_soft_limit
    CHECK (active_location_soft_limit > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE app.location SET location_type='WAREHOUSE', is_saleable=true, is_stock_holding=true
WHERE location_code='FG_STORE';
UPDATE app.location SET location_type='PRODUCTION', is_saleable=false WHERE location_code='CLEANING_AREA';
UPDATE app.location SET location_type='SHOP' WHERE location_code='DISPATCH';
UPDATE app.location SET location_type='WAREHOUSE' WHERE location_code IN ('MAIN_STORE','RAW_STORE');
UPDATE app.location SET location_type='DAMAGED', is_saleable=false WHERE location_code='WASTE_AREA';
UPDATE app.location SET location_type='QUARANTINE', is_saleable=false, is_stock_holding=true, is_system=true
WHERE location_code='RETURN_QUARANTINE';

UPDATE app.location l SET company_id=cp.company_id
FROM (SELECT company_id FROM app.company_profile WHERE is_active=true ORDER BY created_at,company_id LIMIT 1) cp
WHERE l.company_id IS NULL;

UPDATE app.company_profile cp SET default_location_id = COALESCE(
  (SELECT location_id FROM app.location WHERE location_code='FG_STORE' AND is_active=true ORDER BY created_at,location_id LIMIT 1),
  (SELECT location_id FROM app.location WHERE is_active=true AND is_saleable=true ORDER BY created_at,location_id LIMIT 1)
)
WHERE cp.is_active=true AND cp.default_location_id IS NULL;

CREATE TABLE IF NOT EXISTS sec.user_location (
  user_id uuid NOT NULL REFERENCES sec.app_user(user_id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES app.location(location_id),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, location_id)
);
CREATE INDEX IF NOT EXISTS ix_user_location_active ON sec.user_location(user_id, is_active, location_id);

INSERT INTO sec.user_location(user_id,location_id,is_default,is_active)
SELECT u.user_id, cp.default_location_id, true, true
FROM sec.app_user u
CROSS JOIN LATERAL (SELECT default_location_id FROM app.company_profile WHERE is_active=true AND default_location_id IS NOT NULL ORDER BY created_at,company_id LIMIT 1) cp
ON CONFLICT(user_id,location_id) DO NOTHING;

INSERT INTO app.feature(feature_code,feature_name,feature_group,description,default_enabled,is_active)
VALUES('MULTI_LOCATION','Multi-Location','FOUNDATION','Configurable business locations and location access.',false,true)
ON CONFLICT(feature_code) DO UPDATE SET feature_name=EXCLUDED.feature_name,feature_group=EXCLUDED.feature_group,description=EXCLUDED.description,is_active=true;
INSERT INTO app.company_feature(company_id,feature_code,is_enabled)
SELECT company_id,'MULTI_LOCATION',false FROM app.company_profile WHERE is_active=true
ON CONFLICT(company_id,feature_code) DO NOTHING;

CREATE OR REPLACE FUNCTION app.enforce_location_soft_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_company uuid; v_limit integer; v_count integer;
BEGIN
  v_company := COALESCE(NEW.company_id,(SELECT company_id FROM app.company_profile WHERE is_active=true ORDER BY created_at,company_id LIMIT 1));
  IF NEW.is_active AND NOT NEW.is_system AND (TG_OP='INSERT' OR OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.company_id IS DISTINCT FROM NEW.company_id) THEN
    SELECT active_location_soft_limit INTO v_limit FROM app.company_profile WHERE company_id=v_company FOR UPDATE;
    SELECT count(*) INTO v_count FROM app.location WHERE company_id=v_company AND is_active AND NOT is_system AND (TG_OP='INSERT' OR location_id<>NEW.location_id);
    IF v_count >= COALESCE(v_limit,50) THEN RAISE EXCEPTION 'Active location soft limit (%) reached for this business.',COALESCE(v_limit,50) USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_location_soft_limit ON app.location;
CREATE TRIGGER trg_location_soft_limit BEFORE INSERT OR UPDATE OF is_active,company_id ON app.location FOR EACH ROW EXECUTE FUNCTION app.enforce_location_soft_limit();

CREATE OR REPLACE FUNCTION app.protect_system_location_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_system AND NEW.location_code IS DISTINCT FROM OLD.location_code THEN RAISE EXCEPTION 'System location code cannot be changed.' USING ERRCODE='23514'; END IF;
  IF OLD.location_code='RETURN_QUARANTINE' AND (NEW.is_saleable OR NOT NEW.is_active) THEN RAISE EXCEPTION 'RETURN_QUARANTINE must remain active and non-saleable.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_system_location_code ON app.location;
CREATE TRIGGER trg_protect_system_location_code BEFORE UPDATE OF location_code,is_active,is_saleable ON app.location FOR EACH ROW EXECUTE FUNCTION app.protect_system_location_code();

COMMENT ON COLUMN app.company_profile.active_location_soft_limit IS 'Default soft limit 50 active non-system locations; subscription editions may override. No hard capacity limit.';
COMMENT ON TABLE sec.user_location IS 'Location scope is independent of role permissions; VIEW_ALL_LOCATIONS bypasses individual assignments.';
