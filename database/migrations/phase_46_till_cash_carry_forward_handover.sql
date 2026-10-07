-- Phase 8F: opening-source, carry-forward, safe handover, and close disposition.
-- Forward-only. No historical account 1000 migration or balance mutation.

ALTER TABLE app.cashier_session
  ADD COLUMN IF NOT EXISTS opening_source text NOT NULL DEFAULT 'EXISTING_TILL_BALANCE',
  ADD COLUMN IF NOT EXISTS opening_source_session_id uuid NULL REFERENCES app.cashier_session(session_id),
  ADD COLUMN IF NOT EXISTS opening_transfer_journal_id uuid NULL,
  ADD COLUMN IF NOT EXISTS cash_disposition text NULL,
  ADD COLUMN IF NOT EXISTS safe_transfer_amount numeric(18,2) NULL CHECK (safe_transfer_amount IS NULL OR safe_transfer_amount >= 0),
  ADD COLUMN IF NOT EXISTS handover_amount numeric(18,2) NULL CHECK (handover_amount IS NULL OR handover_amount >= 0),
  ADD COLUMN IF NOT EXISTS handover_to_user_id uuid NULL REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS handover_id uuid NULL;

ALTER TABLE app.cashier_session
  DROP CONSTRAINT IF EXISTS cashier_session_opening_source_chk,
  ADD CONSTRAINT cashier_session_opening_source_chk CHECK (opening_source IN ('MAIN_SAFE','CARRY_FORWARD','EXISTING_TILL_BALANCE')),
  DROP CONSTRAINT IF EXISTS cashier_session_cash_disposition_chk,
  ADD CONSTRAINT cashier_session_cash_disposition_chk CHECK (cash_disposition IS NULL OR cash_disposition IN ('SAFE_TRANSFER','CARRY_FORWARD','LEAVE_IN_TILL','HANDOVER'));

CREATE TABLE IF NOT EXISTS app.till_cash_handover (
  handover_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NOT NULL REFERENCES app.branch(branch_id),
  location_id uuid NOT NULL REFERENCES app.location(location_id),
  till_id uuid NOT NULL REFERENCES app.till(till_id),
  source_session_id uuid NOT NULL REFERENCES app.cashier_session(session_id),
  source_cashier_user_id uuid NOT NULL REFERENCES sec.app_user(user_id),
  receiving_session_id uuid NULL REFERENCES app.cashier_session(session_id),
  receiving_cashier_user_id uuid NULL REFERENCES sec.app_user(user_id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','ACCEPTED','REJECTED','CANCELLED')),
  proposed_by uuid NULL REFERENCES sec.app_user(user_id),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid NULL REFERENCES sec.app_user(user_id),
  accepted_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS till_handover_one_open
  ON app.till_cash_handover(source_session_id) WHERE status='PROPOSED';
CREATE INDEX IF NOT EXISTS till_handover_till_idx
  ON app.till_cash_handover(till_id, created_at);
