-- Phase 8L: user -> branch -> location operating context hardening.
-- Additive only. Existing transaction dimensions and applied migrations are preserved.

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_location_one_default
  ON sec.user_location(user_id)
  WHERE is_default AND is_active;

-- A default location is meaningful only inside the user's active default branch.
CREATE OR REPLACE FUNCTION sec.validate_user_default_location() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_location_branch uuid;
  v_default_branch uuid;
BEGIN
  IF NEW.is_active AND NEW.is_default THEN
    SELECT branch_id INTO v_location_branch
    FROM app.location
    WHERE location_id = NEW.location_id AND is_active;

    SELECT branch_id INTO v_default_branch
    FROM sec.user_branch
    WHERE user_id = NEW.user_id AND is_active AND is_default;

    IF v_location_branch IS NULL OR v_default_branch IS NULL OR v_location_branch <> v_default_branch THEN
      RAISE EXCEPTION 'User default location must be active, granted, and belong to the user default branch.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_user_default_location ON sec.user_location;
CREATE TRIGGER trg_validate_user_default_location
BEFORE INSERT OR UPDATE OF user_id, location_id, is_default, is_active
ON sec.user_location
FOR EACH ROW EXECUTE FUNCTION sec.validate_user_default_location();

-- Keep the default location valid when a default branch is changed. The API
-- selects a replacement location in the same transaction; this trigger clears
-- any old default before the new branch is exposed.
CREATE OR REPLACE FUNCTION sec.clear_invalid_user_default_location() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active AND NEW.is_default THEN
    UPDATE sec.user_location ul
    SET is_default = false, updated_at = now()
    WHERE ul.user_id = NEW.user_id
      AND ul.is_default
      AND ul.location_id NOT IN (
        SELECT l.location_id
        FROM app.location l
        WHERE l.branch_id = NEW.branch_id AND l.is_active
      );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_invalid_user_default_location ON sec.user_branch;
CREATE TRIGGER trg_clear_invalid_user_default_location
AFTER INSERT OR UPDATE OF branch_id, is_default, is_active
ON sec.user_branch
FOR EACH ROW EXECUTE FUNCTION sec.clear_invalid_user_default_location();

COMMENT ON TABLE sec.user_branch IS 'Branch authorization is independent of roles. One active default branch per user.';
COMMENT ON TABLE sec.user_location IS 'Location authorization is independent of roles. A default location must belong to the user default branch.';
