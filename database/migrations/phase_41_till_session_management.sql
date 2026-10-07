-- Phase 8: till/register and cashier-session foundation.
-- Disabled by default; historical POS sales are intentionally not backfilled.

INSERT INTO app.feature(feature_code, feature_name, feature_group, description, default_enabled, is_active)
VALUES ('till_management', 'Till / Cashier Sessions', 'FUTURE', 'Controls POS tills, cashier sessions, physical cash movements, and closing variance.', false, true)
ON CONFLICT (feature_code) DO UPDATE SET feature_name=EXCLUDED.feature_name, feature_group=EXCLUDED.feature_group,
  description=EXCLUDED.description, default_enabled=false, is_active=true;

INSERT INTO app.company_feature(company_id, feature_code, is_enabled)
SELECT company_id, 'till_management', false FROM app.company_profile WHERE is_active
ON CONFLICT (company_id, feature_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.till_configuration (
  till_configuration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES app.company_profile(company_id),
  cash_variance_tolerance numeric(18,2) NOT NULL DEFAULT 0 CHECK (cash_variance_tolerance >= 0),
  require_variance_approval boolean NOT NULL DEFAULT false,
  one_session_per_cashier boolean NOT NULL DEFAULT true,
  max_session_hours numeric(8,2) NULL CHECK (max_session_hours IS NULL OR max_session_hours > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES sec.app_user(user_id)
);

INSERT INTO app.till_configuration(company_id)
SELECT company_id FROM app.company_profile WHERE is_active
ON CONFLICT (company_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.till (
  till_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  location_id uuid NOT NULL REFERENCES app.location(location_id),
  till_code text NOT NULL,
  till_name text NOT NULL,
  description text NULL,
  cash_payment_account_id uuid NULL REFERENCES fin.payment_account_control(account_id),
  cash_gl_account_id uuid NULL REFERENCES fin.gl_account(account_id),
  allow_shared_session boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES sec.app_user(user_id),
  updated_by uuid NULL REFERENCES sec.app_user(user_id),
  UNIQUE(company_id, location_id, till_code)
);

CREATE TABLE IF NOT EXISTS sec.user_till (
  user_till_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES sec.app_user(user_id),
  till_id uuid NOT NULL REFERENCES app.till(till_id),
  can_open boolean NOT NULL DEFAULT true,
  can_close boolean NOT NULL DEFAULT true,
  can_reconcile boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, till_id)
);

CREATE SEQUENCE IF NOT EXISTS app.cashier_session_no_seq;

CREATE TABLE IF NOT EXISTS app.cashier_session (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  location_id uuid NOT NULL REFERENCES app.location(location_id),
  till_id uuid NOT NULL REFERENCES app.till(till_id),
  cashier_user_id uuid NOT NULL REFERENCES sec.app_user(user_id),
  session_no text NOT NULL UNIQUE DEFAULT ('TSE-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('app.cashier_session_no_seq')::text, 6, '0')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSING','CLOSED','RECONCILED','VOID')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  opening_float numeric(18,2) NOT NULL CHECK (opening_float >= 0),
  expected_cash numeric(18,2) NULL,
  counted_cash numeric(18,2) NULL CHECK (counted_cash IS NULL OR counted_cash >= 0),
  cash_variance numeric(18,2) NULL,
  opening_notes text NULL,
  closing_notes text NULL,
  opened_by uuid NULL REFERENCES sec.app_user(user_id),
  closed_by uuid NULL REFERENCES sec.app_user(user_id),
  approved_by uuid NULL REFERENCES sec.app_user(user_id),
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cashier_session_one_open_till
  ON app.cashier_session(till_id) WHERE status IN ('OPEN','CLOSING');
CREATE UNIQUE INDEX IF NOT EXISTS cashier_session_one_open_cashier
  ON app.cashier_session(cashier_user_id) WHERE status IN ('OPEN','CLOSING');

CREATE TABLE IF NOT EXISTS app.till_cash_movement (
  movement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  location_id uuid NOT NULL REFERENCES app.location(location_id),
  till_id uuid NOT NULL REFERENCES app.till(till_id),
  session_id uuid NOT NULL REFERENCES app.cashier_session(session_id),
  movement_type text NOT NULL CHECK (movement_type IN ('OPENING_FLOAT','CASH_SALE','CASH_REFUND','CASH_IN','CASH_OUT','PAYOUT','SAFE_DROP','CLOSING_ADJUSTMENT')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  reference text NULL,
  reason text NULL,
  source_document_type text NULL,
  source_document_id uuid NULL,
  created_by uuid NULL REFERENCES sec.app_user(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.till_cash_count (
  cash_count_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES app.cashier_session(session_id),
  denomination numeric(18,2) NOT NULL CHECK (denomination > 0),
  quantity numeric(18,3) NOT NULL CHECK (quantity >= 0),
  amount numeric(18,2) GENERATED ALWAYS AS (round(denomination * quantity, 2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, denomination)
);

ALTER TABLE sal.pos_sale
  ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES app.cashier_session(session_id),
  ADD COLUMN IF NOT EXISTS till_id uuid NULL REFERENCES app.till(till_id);

CREATE INDEX IF NOT EXISTS pos_sale_session_idx ON sal.pos_sale(session_id, created_at);
CREATE INDEX IF NOT EXISTS till_session_status_idx ON app.cashier_session(status, branch_id, location_id, opened_at);
CREATE INDEX IF NOT EXISTS till_movement_session_idx ON app.till_cash_movement(session_id, created_at);
