-- Phase 40: Uganda EFRIS adapter foundation.
-- No URA endpoints, credentials, codes, or transport assumptions are introduced.

ALTER TABLE app.company_profile
  ADD COLUMN IF NOT EXISTS tin text NULL,
  ADD COLUMN IF NOT EXISTS efris_place_of_business_identifier text NULL;

INSERT INTO app.feature(feature_code, feature_name, feature_group, description, default_enabled, is_active)
VALUES ('efris', 'Uganda EFRIS', 'FUTURE', 'Uganda-specific EFRIS compliance adapter; disabled until onboarding and readiness checks pass.', false, true)
ON CONFLICT (feature_code) DO UPDATE SET feature_name=EXCLUDED.feature_name, feature_group=EXCLUDED.feature_group,
  description=EXCLUDED.description, default_enabled=false, is_active=true;

INSERT INTO app.company_feature(company_id, feature_code, is_enabled)
SELECT company_id, 'efris', false FROM app.company_profile WHERE is_active
ON CONFLICT (company_id, feature_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.efris_configuration (
  efris_configuration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES app.company_profile(company_id),
  country_code char(2) NOT NULL DEFAULT 'UG',
  efris_enabled boolean NOT NULL DEFAULT false,
  integration_mode text NOT NULL DEFAULT 'SYSTEM_TO_SYSTEM',
  environment text NOT NULL DEFAULT 'NOT_CONFIGURED',
  registration_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  system_to_system_enabled boolean NOT NULL DEFAULT false,
  place_of_business_identifier text NULL,
  device_identifier text NULL,
  offline_enabled boolean NOT NULL DEFAULT false,
  credentials_configured boolean NOT NULL DEFAULT false,
  credential_reference text NULL,
  technical_spec_version text NULL,
  transport_configured boolean NOT NULL DEFAULT false,
  last_connectivity_check_at timestamptz NULL,
  last_success_at timestamptz NULL,
  health_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (integration_mode IN ('SYSTEM_TO_SYSTEM')),
  CHECK (environment IN ('NOT_CONFIGURED', 'SANDBOX', 'PRODUCTION')),
  CHECK (registration_status IN ('NOT_CONFIGURED', 'PENDING', 'REGISTERED', 'SUSPENDED')),
  CHECK (health_status IN ('NOT_CONFIGURED', 'READY', 'OFFLINE', 'DEGRADED', 'CONNECTED'))
);

INSERT INTO app.efris_configuration(company_id)
SELECT company_id FROM app.company_profile WHERE is_active
ON CONFLICT (company_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.efris_branch_mapping (
  efris_branch_mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  location_id uuid NULL REFERENCES app.location(location_id),
  efris_place_of_business_code text NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, branch_id, location_id)
);

CREATE TABLE IF NOT EXISTS app.efris_product_mapping (
  efris_product_mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  product_id uuid NOT NULL REFERENCES inv.product(product_id),
  commodity_code text NULL,
  item_classification text NULL,
  efris_uom_code text NULL,
  description_override text NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, product_id)
);

CREATE TABLE IF NOT EXISTS app.efris_uom_mapping (
  efris_uom_mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  uom_code text NOT NULL REFERENCES inv.uom(uom_code),
  efris_uom_code text NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, uom_code)
);

CREATE TABLE IF NOT EXISTS app.efris_tax_mapping (
  efris_tax_mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  tax_code_id uuid NOT NULL REFERENCES app.tax_code(tax_code_id),
  efris_tax_category_code text NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, tax_code_id)
);

CREATE TABLE IF NOT EXISTS app.efris_document (
  efris_document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NULL REFERENCES app.branch(branch_id),
  location_id uuid NULL REFERENCES app.location(location_id),
  source_document_type text NOT NULL,
  source_document_id uuid NOT NULL,
  source_document_number text NOT NULL,
  document_kind text NOT NULL CHECK (document_kind IN ('SALE_INVOICE', 'SALE_RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE')),
  internal_reference text NOT NULL UNIQUE,
  transaction_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','QUEUED','SUBMITTING','PENDING','ACCEPTED','REJECTED','RETRY_PENDING','OFFLINE_PENDING','CANCELLED','CREDITED')),
  submission_mode text NOT NULL DEFAULT 'STRICT_ONLINE' CHECK (submission_mode IN ('STRICT_ONLINE','OFFLINE_ALLOWED')),
  external_request_id text NULL,
  fdn text NULL,
  verification_code text NULL,
  qr_payload text NULL,
  provider_document_id text NULL,
  original_efris_document_id uuid NULL REFERENCES app.efris_document(efris_document_id),
  snapshot_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at timestamptz NULL,
  submitted_at timestamptz NULL,
  accepted_at timestamptz NULL,
  rejected_at timestamptz NULL,
  last_error_code text NULL,
  last_error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_document_type, source_document_id, document_kind)
);

CREATE TABLE IF NOT EXISTS app.efris_document_event (
  efris_document_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  efris_document_id uuid NOT NULL REFERENCES app.efris_document(efris_document_id),
  event_type text NOT NULL,
  old_status text NULL,
  new_status text NULL,
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES sec.app_user(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.efris_submission_attempt (
  efris_submission_attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  efris_document_id uuid NOT NULL REFERENCES app.efris_document(efris_document_id),
  attempt_number integer NOT NULL,
  environment text NOT NULL,
  operation text NOT NULL,
  provider_status text NULL,
  external_reference text NULL,
  request_hash text NULL,
  sanitized_request jsonb NULL,
  sanitized_response jsonb NULL,
  error_code text NULL,
  error_message text NULL,
  duration_ms integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(efris_document_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS efris_document_status_idx ON app.efris_document(status, next_retry_at, transaction_date);
CREATE INDEX IF NOT EXISTS efris_event_document_idx ON app.efris_document_event(efris_document_id, created_at);

CREATE OR REPLACE FUNCTION app.efris_activation_precheck(p_company_id uuid)
RETURNS TABLE(check_code text, is_valid boolean, message text)
LANGUAGE sql STABLE AS $$
  SELECT 'TIN'::text, NULLIF(btrim(cp.tin), '') IS NOT NULL, 'Business TIN is required.'
    FROM app.company_profile cp WHERE cp.company_id=p_company_id
  UNION ALL SELECT 'COUNTRY', COALESCE(cp.tax_country_code, 'UG')='UG', 'Country must be Uganda for this adapter.' FROM app.company_profile cp WHERE cp.company_id=p_company_id
  UNION ALL SELECT 'REGISTRATION', ec.registration_status='REGISTERED', 'EFRIS registration status must be REGISTERED.' FROM app.efris_configuration ec WHERE ec.company_id=p_company_id
  UNION ALL SELECT 'SYSTEM_MODE', ec.system_to_system_enabled, 'System-to-system mode must be enabled.' FROM app.efris_configuration ec WHERE ec.company_id=p_company_id
  UNION ALL SELECT 'ENVIRONMENT', ec.environment IN ('SANDBOX','PRODUCTION'), 'Select a configured EFRIS environment.' FROM app.efris_configuration ec WHERE ec.company_id=p_company_id
  UNION ALL SELECT 'CREDENTIALS', ec.credentials_configured, 'Credential metadata is not configured.' FROM app.efris_configuration ec WHERE ec.company_id=p_company_id
  UNION ALL SELECT 'TRANSPORT', ec.transport_configured, 'Technical transport configuration is not configured.' FROM app.efris_configuration ec WHERE ec.company_id=p_company_id
  UNION ALL SELECT 'PRODUCT_MAPPING', NOT EXISTS (SELECT 1 FROM inv.product p LEFT JOIN app.efris_product_mapping m ON m.company_id=p_company_id AND m.product_id=p.product_id AND m.is_active AND m.commodity_code IS NOT NULL WHERE p.is_active AND p.is_saleable AND m.efris_product_mapping_id IS NULL), 'One or more active saleable products lack EFRIS commodity mapping.' FROM app.company_profile cp WHERE cp.company_id=p_company_id
  UNION ALL SELECT 'UOM_MAPPING', NOT EXISTS (SELECT 1 FROM inv.product p LEFT JOIN app.efris_uom_mapping u ON u.company_id=p_company_id AND u.uom_code=p.uom_code AND u.is_active AND u.efris_uom_code IS NOT NULL WHERE p.is_active AND p.is_saleable AND u.efris_uom_mapping_id IS NULL), 'One or more saleable product UOMs lack EFRIS mapping.' FROM app.company_profile cp WHERE cp.company_id=p_company_id
  UNION ALL SELECT 'BRANCH_MAPPING', NOT EXISTS (SELECT 1 FROM app.branch b LEFT JOIN app.efris_branch_mapping m ON m.company_id=p_company_id AND m.branch_id=b.branch_id AND m.is_active AND m.efris_place_of_business_code IS NOT NULL WHERE b.company_id=p_company_id AND b.is_active AND m.efris_branch_mapping_id IS NULL), 'One or more active branches lack place-of-business mapping.' FROM app.company_profile cp WHERE cp.company_id=p_company_id
  UNION ALL SELECT 'TAX_MAPPING', NOT EXISTS (SELECT 1 FROM app.tax_code t LEFT JOIN app.efris_tax_mapping m ON m.company_id=p_company_id AND m.tax_code_id=t.tax_code_id AND m.is_active AND m.efris_tax_category_code IS NOT NULL WHERE t.company_id=p_company_id AND t.is_active AND m.efris_tax_mapping_id IS NULL), 'One or more active tax codes lack EFRIS tax-category mapping.' FROM app.company_profile cp WHERE cp.company_id=p_company_id;
$$;
