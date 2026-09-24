-- Phase 39: payment channel foundation hardening.
-- Additive only: reuses fin.api_payment_channel and preserves existing BANK rows.

ALTER TABLE fin.api_payment_channel
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id),
  ADD COLUMN IF NOT EXISTS location_id uuid NULL REFERENCES app.location(location_id),
  ADD COLUMN IF NOT EXISTS merchant_code text NULL,
  ADD COLUMN IF NOT EXISTS merchant_name text NULL,
  ADD COLUMN IF NOT EXISTS terminal_id text NULL,
  ADD COLUMN IF NOT EXISTS terminal_name text NULL,
  ADD COLUMN IF NOT EXISTS bank_name text NULL,
  ADD COLUMN IF NOT EXISTS account_name text NULL,
  ADD COLUMN IF NOT EXISTS credential_status text NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS credentials_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credentials_last_verified_at timestamptz NULL;

UPDATE fin.api_payment_channel
SET mode = CASE WHEN api_enabled THEN 'SANDBOX' ELSE 'MANUAL' END
WHERE mode IS NULL OR mode NOT IN ('MANUAL', 'SANDBOX', 'LIVE');

ALTER TABLE fin.api_payment_channel
  DROP CONSTRAINT IF EXISTS api_payment_channel_mode_check,
  ADD CONSTRAINT api_payment_channel_mode_check CHECK (mode IN ('MANUAL', 'SANDBOX', 'LIVE')) NOT VALID,
  DROP CONSTRAINT IF EXISTS api_payment_channel_status_check,
  ADD CONSTRAINT api_payment_channel_status_check CHECK (status IN ('INACTIVE', 'ACTIVE', 'TESTING', 'SUSPENDED', 'API_ENABLED')) NOT VALID,
  DROP CONSTRAINT IF EXISTS api_payment_channel_credential_status_check,
  ADD CONSTRAINT api_payment_channel_credential_status_check CHECK (credential_status IN ('NOT_CONFIGURED', 'CONFIGURED', 'VERIFIED', 'REVOKED')) NOT VALID;

CREATE INDEX IF NOT EXISTS api_payment_channel_pos_scope_idx
  ON fin.api_payment_channel (channel_type, status, collection_enabled, branch_id, location_id);

CREATE TABLE IF NOT EXISTS app.payment_transaction (
  payment_transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NULL REFERENCES app.branch(branch_id),
  location_id uuid NULL REFERENCES app.location(location_id),
  channel_id uuid NOT NULL REFERENCES fin.api_payment_channel(api_payment_channel_id),
  document_type text NOT NULL,
  document_id uuid NULL,
  internal_reference text NOT NULL,
  provider_reference text NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL DEFAULT 'UGX',
  status text NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REVERSED')),
  confirmation_mode text NOT NULL DEFAULT 'MANUAL' CHECK (confirmation_mode IN ('MANUAL', 'SANDBOX', 'LIVE')),
  initiated_by uuid NULL REFERENCES sec.app_user(user_id),
  confirmed_by uuid NULL REFERENCES sec.app_user(user_id),
  initiated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL,
  failure_reason text NULL,
  idempotency_key text NOT NULL,
  provider_status text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_transaction_idempotency_uq
  ON app.payment_transaction (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transaction_provider_reference_uq
  ON app.payment_transaction (channel_id, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_transaction_document_idx
  ON app.payment_transaction (document_type, document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.payment_transaction_event (
  payment_transaction_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES app.payment_transaction(payment_transaction_id),
  old_status text NULL,
  new_status text NOT NULL,
  event_type text NOT NULL,
  actor_user_id uuid NULL REFERENCES sec.app_user(user_id),
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.payment_transaction IS 'Provider-neutral payment transaction audit record; manual mode is the only enabled implementation in Phase 39.';
COMMENT ON TABLE app.payment_transaction_event IS 'Immutable status/audit trail for payment transaction lifecycle changes.';
COMMENT ON COLUMN fin.api_payment_channel.secret_key_ref IS 'Reference only; never store a provider secret here.';
COMMENT ON COLUMN fin.api_payment_channel.api_key_ref IS 'Reference only; never store a provider secret here.';

DROP VIEW IF EXISTS fin.v_api_payment_channel_summary;
CREATE VIEW fin.v_api_payment_channel_summary AS
SELECT ch.api_payment_channel_id, ch.channel_code, ch.channel_name, ch.channel_type,
       ch.provider_name, ch.linked_payment_account_id, pa.account_code AS payment_account_code,
       pa.account_name AS payment_account_name, ch.linked_gl_account_id,
       ga.account_code AS gl_account_code, ga.account_name AS gl_account_name,
       ch.account_number_masked, ch.wallet_number_masked, ch.currency_code, ch.mode,
       ch.branch_id, ch.location_id, ch.merchant_code, ch.merchant_name, ch.terminal_id,
       ch.terminal_name, ch.bank_name, ch.account_name, ch.credential_status,
       ch.credentials_configured, ch.credentials_last_verified_at, ch.api_enabled,
       ch.collection_enabled, ch.disbursement_enabled, ch.base_url, ch.webhook_url,
       ch.status, ch.notes, ch.created_by, ch.created_at, ch.updated_at,
       COALESCE(q.total_queue_count, 0) AS total_queue_count,
       COALESCE(q.success_count, 0) AS success_count,
       COALESCE(q.failed_count, 0) AS failed_count,
       COALESCE(q.pending_count, 0) AS pending_count,
       COALESCE(w.webhook_count, 0) AS webhook_count
FROM fin.api_payment_channel ch
LEFT JOIN fin.gl_account pa ON pa.account_id = ch.linked_payment_account_id
LEFT JOIN fin.gl_account ga ON ga.account_id = ch.linked_gl_account_id
LEFT JOIN (SELECT api_payment_channel_id, count(*) AS total_queue_count,
                  count(*) FILTER (WHERE status = 'SUCCESS') AS success_count,
                  count(*) FILTER (WHERE status = 'FAILED') AS failed_count,
                  count(*) FILTER (WHERE status IN ('DRAFT','QUEUED','PROCESSING')) AS pending_count
           FROM fin.api_payment_transaction_queue GROUP BY api_payment_channel_id) q
  ON q.api_payment_channel_id = ch.api_payment_channel_id
LEFT JOIN (SELECT api_payment_channel_id, count(*) AS webhook_count
           FROM fin.api_payment_webhook_log GROUP BY api_payment_channel_id) w
  ON w.api_payment_channel_id = ch.api_payment_channel_id;
