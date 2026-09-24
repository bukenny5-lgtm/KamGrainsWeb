-- PHASE 6C FINAL: prevent overlapping active effective periods per company/tax code.
-- Forward-only. Existing posted snapshots are not changed.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  ALTER TABLE app.tax_code
    ADD CONSTRAINT tax_code_active_period_no_overlap
    EXCLUDE USING gist (
      company_id WITH =,
      code WITH =,
      (daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]')) WITH &&
    ) WHERE (is_active);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON CONSTRAINT tax_code_active_period_no_overlap ON app.tax_code
  IS 'Only one active effective period may apply for a company and tax code on a date.';
