-- PHASE 6: Configurable VAT / tax engine
-- Forward-only and additive. VAT remains disabled until configured and enabled.

CREATE TABLE IF NOT EXISTS app.tax_code (
    tax_code_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    tax_type text NOT NULL DEFAULT 'VAT',
    treatment text NOT NULL CHECK (treatment IN ('STANDARD','ZERO_RATED','EXEMPT','OUT_OF_SCOPE')),
    rate numeric(9,4) NOT NULL DEFAULT 0 CHECK (rate >= 0 AND rate <= 100),
    is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT current_date,
    effective_to date,
    country_code char(2) NOT NULL DEFAULT 'UG',
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES sec.app_user(user_id),
    updated_by uuid REFERENCES sec.app_user(user_id),
    CONSTRAINT tax_code_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tax_code_treatment_rate CHECK (treatment <> 'STANDARD' OR rate > 0),
    UNIQUE (company_id, code, effective_from)
);

CREATE INDEX IF NOT EXISTS ix_tax_code_company_active_dates
    ON app.tax_code(company_id, is_active, effective_from, effective_to);

ALTER TABLE app.company_profile
    ADD COLUMN IF NOT EXISTS tax_engine_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tax_country_code char(2) NOT NULL DEFAULT 'UG',
    ADD COLUMN IF NOT EXISTS default_tax_code_id uuid NULL REFERENCES app.tax_code(tax_code_id),
    ADD COLUMN IF NOT EXISTS tax_pricing_mode text NOT NULL DEFAULT 'TAX_EXCLUSIVE',
    ADD COLUMN IF NOT EXISTS tax_rounding_precision smallint NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS output_vat_account_id uuid NULL REFERENCES fin.gl_account(account_id),
    ADD COLUMN IF NOT EXISTS input_vat_account_id uuid NULL REFERENCES fin.gl_account(account_id),
    ADD COLUMN IF NOT EXISTS tax_config_effective_from date NOT NULL DEFAULT current_date,
    ADD COLUMN IF NOT EXISTS tax_config_effective_to date;

DO $$ BEGIN
  ALTER TABLE app.company_profile ADD CONSTRAINT company_profile_tax_pricing_mode_check
    CHECK (tax_pricing_mode IN ('TAX_INCLUSIVE','TAX_EXCLUSIVE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE app.company_profile ADD CONSTRAINT company_profile_tax_rounding_precision_check
    CHECK (tax_rounding_precision BETWEEN 0 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inv.product
    ADD COLUMN IF NOT EXISTS tax_code_id uuid NULL REFERENCES app.tax_code(tax_code_id);
CREATE INDEX IF NOT EXISTS ix_product_tax_code ON inv.product(tax_code_id);

-- Snapshots are nullable for legacy rows and are populated by tax-aware posting paths.
ALTER TABLE sal.pos_sale
    ADD COLUMN IF NOT EXISTS taxable_subtotal numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_total numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_snapshot_at timestamptz;
ALTER TABLE sal.pos_sale_line
    ADD COLUMN IF NOT EXISTS tax_code_id uuid NULL REFERENCES app.tax_code(tax_code_id),
    ADD COLUMN IF NOT EXISTS tax_code text,
    ADD COLUMN IF NOT EXISTS tax_treatment text,
    ADD COLUMN IF NOT EXISTS tax_rate numeric(9,4),
    ADD COLUMN IF NOT EXISTS taxable_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_amount numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE sal.ar_invoice
    ADD COLUMN IF NOT EXISTS taxable_subtotal numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_total numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_total numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_snapshot_at timestamptz;
ALTER TABLE sal.ar_invoice_line
    ADD COLUMN IF NOT EXISTS tax_code_id uuid NULL REFERENCES app.tax_code(tax_code_id),
    ADD COLUMN IF NOT EXISTS tax_code text,
    ADD COLUMN IF NOT EXISTS tax_treatment text,
    ADD COLUMN IF NOT EXISTS tax_rate numeric(9,4),
    ADD COLUMN IF NOT EXISTS taxable_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_amount numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE pur.ap_invoice
    ADD COLUMN IF NOT EXISTS taxable_subtotal numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS input_vat numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_total numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_snapshot_at timestamptz;
ALTER TABLE pur.ap_invoice_line
    ADD COLUMN IF NOT EXISTS tax_code_id uuid NULL REFERENCES app.tax_code(tax_code_id),
    ADD COLUMN IF NOT EXISTS tax_code text,
    ADD COLUMN IF NOT EXISTS tax_treatment text,
    ADD COLUMN IF NOT EXISTS tax_rate numeric(9,4),
    ADD COLUMN IF NOT EXISTS taxable_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_recoverability text NOT NULL DEFAULT 'RECOVERABLE'
      CHECK (tax_recoverability IN ('RECOVERABLE','NON_RECOVERABLE','PARTIALLY_RECOVERABLE'));

INSERT INTO app.feature(feature_code, feature_name, feature_group, description, default_enabled, is_active)
VALUES ('tax_engine', 'VAT / Tax Engine', 'CURRENT', 'Configurable tax codes, snapshots, and VAT summaries.', false, true)
ON CONFLICT (feature_code) DO UPDATE SET feature_name=EXCLUDED.feature_name, feature_group=EXCLUDED.feature_group,
  description=EXCLUDED.description, is_active=true;

DO $$
DECLARE c record; standard_id uuid; zero_id uuid; exempt_id uuid; out_id uuid;
BEGIN
  FOR c IN SELECT company_id FROM app.company_profile WHERE is_active LOOP
    INSERT INTO app.tax_code(company_id,code,name,description,treatment,rate,country_code,is_default)
      VALUES(c.company_id,'STANDARD','Standard Rated VAT','Uganda standard VAT rate','STANDARD',18.0000,'UG',true)
      ON CONFLICT (company_id,code,effective_from) DO NOTHING;
    INSERT INTO app.tax_code(company_id,code,name,description,treatment,rate,country_code)
      VALUES(c.company_id,'ZERO_RATED','Zero Rated','Taxable at zero percent','ZERO_RATED',0,'UG')
      ON CONFLICT (company_id,code,effective_from) DO NOTHING;
    INSERT INTO app.tax_code(company_id,code,name,description,treatment,rate,country_code)
      VALUES(c.company_id,'EXEMPT','Exempt','Exempt from VAT; not equivalent to zero-rated','EXEMPT',0,'UG')
      ON CONFLICT (company_id,code,effective_from) DO NOTHING;
    INSERT INTO app.tax_code(company_id,code,name,description,treatment,rate,country_code)
      VALUES(c.company_id,'OUT_OF_SCOPE','Out of Scope','Outside the scope of VAT','OUT_OF_SCOPE',0,'UG')
      ON CONFLICT (company_id,code,effective_from) DO NOTHING;
    SELECT tax_code_id INTO standard_id FROM app.tax_code WHERE company_id=c.company_id AND code='STANDARD' ORDER BY effective_from DESC LIMIT 1;
    UPDATE app.company_profile SET default_tax_code_id=COALESCE(default_tax_code_id,standard_id) WHERE company_id=c.company_id;
    INSERT INTO app.company_feature(company_id,feature_code,is_enabled) VALUES(c.company_id,'tax_engine',false) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

COMMENT ON TABLE app.tax_code IS 'Effective-dated, company-scoped tax classifications. Posted documents store immutable snapshots.';
