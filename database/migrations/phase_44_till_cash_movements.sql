-- Phase 8D: configured safe account, durable movement idempotency, and journal trace.
ALTER TABLE app.till_configuration
  ADD COLUMN IF NOT EXISTS safe_cash_payment_account_id uuid NULL REFERENCES fin.payment_account_control(account_id);

ALTER TABLE app.till_cash_movement
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL,
  ADD COLUMN IF NOT EXISTS journal_id uuid NULL REFERENCES fin.gl_journal(journal_id),
  ADD COLUMN IF NOT EXISTS source_account_id uuid NULL REFERENCES fin.gl_account(account_id),
  ADD COLUMN IF NOT EXISTS destination_account_id uuid NULL REFERENCES fin.gl_account(account_id);

CREATE UNIQUE INDEX IF NOT EXISTS till_cash_movement_idempotency_idx
  ON app.till_cash_movement(session_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS till_cash_movement_journal_idx
  ON app.till_cash_movement(journal_id)
  WHERE journal_id IS NOT NULL;
