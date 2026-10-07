-- Phase 8K: same-company cross-branch cash funding with dispatch/receipt control.
ALTER TABLE fin.payment_account_control
  ADD COLUMN IF NOT EXISTS allow_cross_branch_funding boolean NOT NULL DEFAULT false;

ALTER TABLE fin.payment_account_transfer
  ADD COLUMN IF NOT EXISTS transfer_type text NOT NULL DEFAULT 'SAME_BRANCH',
  ADD COLUMN IF NOT EXISTS source_branch_id uuid REFERENCES app.branch(branch_id),
  ADD COLUMN IF NOT EXISTS destination_branch_id uuid REFERENCES app.branch(branch_id),
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by uuid REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_reference text,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS receipt_reference text,
  ADD COLUMN IF NOT EXISTS receipt_notes text,
  ADD COLUMN IF NOT EXISTS source_journal_id uuid REFERENCES fin.gl_journal(journal_id),
  ADD COLUMN IF NOT EXISTS destination_journal_id uuid REFERENCES fin.gl_journal(journal_id),
  ADD COLUMN IF NOT EXISTS in_transit_journal_id uuid REFERENCES fin.gl_journal(journal_id),
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE fin.payment_account_transfer
SET source_branch_id=COALESCE(source_branch_id, branch_id),
    destination_branch_id=COALESCE(destination_branch_id, branch_id)
WHERE source_branch_id IS NULL OR destination_branch_id IS NULL;

ALTER TABLE fin.payment_account_transfer DROP CONSTRAINT IF EXISTS payment_account_transfer_status_check;
ALTER TABLE fin.payment_account_transfer DROP CONSTRAINT IF EXISTS payment_account_transfer_transfer_type_check;
ALTER TABLE fin.payment_account_transfer
  ADD CONSTRAINT payment_account_transfer_transfer_type_check
  CHECK (transfer_type IN ('SAME_BRANCH','CROSS_BRANCH'));
ALTER TABLE fin.payment_account_transfer
  ADD CONSTRAINT payment_account_transfer_status_check
  CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','DISPATCHED','IN_TRANSIT','RECEIVED','COMPLETED','RECEIPT_VARIANCE','CANCELLED','POSTED','VOID','REVERSED'));

CREATE INDEX IF NOT EXISTS payment_account_transfer_cross_branch_idx
  ON fin.payment_account_transfer(company_id, source_branch_id, destination_branch_id, status, transaction_date);

INSERT INTO fin.gl_account(account_code, account_name, account_type, is_control, is_active)
SELECT '1140', 'Cash in Transit', 'ASSET', true, true
WHERE NOT EXISTS (SELECT 1 FROM fin.gl_account WHERE account_code='1140');

CREATE TABLE IF NOT EXISTS fin.cross_branch_account_configuration (
  company_id uuid PRIMARY KEY REFERENCES app.company_profile(company_id),
  cash_in_transit_account_id uuid NOT NULL REFERENCES fin.gl_account(account_id),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES sec.app_user(user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fin.cross_branch_account_configuration(company_id, cash_in_transit_account_id)
SELECT cp.company_id, ga.account_id
FROM app.company_profile cp
JOIN fin.gl_account ga ON ga.account_code='1140'
WHERE NOT EXISTS (SELECT 1 FROM fin.cross_branch_account_configuration c WHERE c.company_id=cp.company_id);

-- Main Cash Safe is the initial configurable source for cross-branch cash funding.
UPDATE fin.payment_account_control pac
SET allow_cross_branch_funding=true
FROM fin.gl_account ga
WHERE ga.account_id=pac.account_id AND ga.account_code='1120' AND pac.channel_type='CASH';

COMMENT ON COLUMN fin.payment_account_control.allow_cross_branch_funding IS
  'Explicit policy flag allowing this controlled cash account to fund another branch.';
COMMENT ON TABLE fin.cross_branch_account_configuration IS
  'Company-level configuration for the reusable Cash in Transit clearing account.';
