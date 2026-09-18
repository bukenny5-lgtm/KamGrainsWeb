-- Phase 3: minimal generic business feature configuration.
-- Additive and idempotent. No transaction tables or permission tables are changed.

CREATE TABLE IF NOT EXISTS app.feature (
  feature_code text PRIMARY KEY,
  feature_name text NOT NULL,
  feature_group text NULL,
  description text NULL,
  default_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.company_feature (
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  feature_code text NOT NULL REFERENCES app.feature(feature_code),
  is_enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES sec.app_user(user_id),
  PRIMARY KEY (company_id, feature_code)
);

INSERT INTO app.feature (
  feature_code,
  feature_name,
  feature_group,
  description,
  default_enabled,
  is_active
)
VALUES
  ('sales', 'Sales', 'CURRENT', 'Sales order and delivery workflow.', true, true),
  ('purchasing', 'Purchasing', 'CURRENT', 'Purchase orders and goods receipt workflow.', true, true),
  ('inventory', 'Inventory', 'CURRENT', 'Inventory, stock control, and stock movements.', true, true),
  ('cleaning', 'Cleaning Batches', 'CURRENT', 'Grain cleaning, output, waste, and batch costing.', true, true),
  ('finance', 'Finance', 'CURRENT', 'Finance, journals, payments, and accounting workflows.', true, true),
  ('reports', 'Reports', 'CURRENT', 'Operational and financial reporting.', true, true),
  ('pos', 'POS / Quick Sale', 'FUTURE', 'Future point-of-sale capability; not implemented in Phase 3.', false, true),
  ('barcode', 'Barcode Scanning', 'FUTURE', 'Future barcode capability; not implemented in Phase 3.', false, true)
ON CONFLICT (feature_code) DO UPDATE
SET feature_name = EXCLUDED.feature_name,
    feature_group = EXCLUDED.feature_group,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- Preserve current KAM behavior explicitly. Future features remain disabled.
INSERT INTO app.company_feature (company_id, feature_code, is_enabled)
SELECT cp.company_id, f.feature_code,
       CASE WHEN f.feature_code IN ('pos', 'barcode') THEN false ELSE true END
FROM app.company_profile cp
JOIN app.feature f ON f.is_active = true
WHERE cp.is_active = true
  AND cp.company_name = 'KAM GRAINS SUPPLIES'
ON CONFLICT (company_id, feature_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS ix_company_feature_feature_code
  ON app.company_feature(feature_code);

COMMENT ON TABLE app.feature IS 'Controlled platform capability catalogue.';
COMMENT ON TABLE app.company_feature IS 'Per-company feature overrides; absence resolves to app.feature.default_enabled.';
