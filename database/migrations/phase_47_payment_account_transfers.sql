-- Phase 8G: controlled internal transfers between payment accounts.
-- Forward-only. Till/session movements and historical account 1000 remain unchanged.

CREATE SEQUENCE IF NOT EXISTS fin.payment_account_transfer_no_seq;

CREATE TABLE IF NOT EXISTS fin.payment_account_transfer (
  transfer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_no text NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES app.company_profile(company_id),
  branch_id uuid NULL REFERENCES app.branch(branch_id),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  from_payment_account_id uuid NOT NULL REFERENCES fin.payment_account_control(account_id),
  to_payment_account_id uuid NOT NULL REFERENCES fin.payment_account_control(account_id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  reference text NULL,
  status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','VOID')),
  journal_id uuid NULL REFERENCES fin.gl_journal(journal_id),
  idempotency_key uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES sec.app_user(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid NULL REFERENCES sec.app_user(user_id),
  posted_at timestamptz NULL,
  reversed_by uuid NULL REFERENCES sec.app_user(user_id),
  reversed_at timestamptz NULL,
  reversal_journal_id uuid NULL REFERENCES fin.gl_journal(journal_id),
  reversal_reason text NULL,
  CONSTRAINT payment_account_transfer_distinct_accounts CHECK (from_payment_account_id <> to_payment_account_id)
);

CREATE INDEX IF NOT EXISTS payment_account_transfer_date_idx
  ON fin.payment_account_transfer(transaction_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_account_transfer_accounts_idx
  ON fin.payment_account_transfer(from_payment_account_id, to_payment_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_account_transfer_status_idx
  ON fin.payment_account_transfer(status, branch_id, created_at DESC);
