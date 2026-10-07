-- Phase 8I-B: branch-scoped petty cash and reusable expense-voucher history.
-- General payment accounts remain company-wide (branch_id NULL).
ALTER TABLE fin.payment_account_control
  ADD COLUMN IF NOT EXISTS account_role text NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES app.branch(branch_id);

ALTER TABLE fin.payment_account_control
  DROP CONSTRAINT IF EXISTS payment_account_control_role_check;
ALTER TABLE fin.payment_account_control
  ADD CONSTRAINT payment_account_control_role_check
  CHECK (account_role IN ('GENERAL','PETTY_CASH'));

ALTER TABLE fin.payment_account_control
  DROP CONSTRAINT IF EXISTS payment_account_control_petty_cash_scope_check;
ALTER TABLE fin.payment_account_control
  ADD CONSTRAINT payment_account_control_petty_cash_scope_check
  CHECK (account_role <> 'PETTY_CASH' OR (branch_id IS NOT NULL AND channel_type = 'CASH'));

CREATE UNIQUE INDEX IF NOT EXISTS payment_account_control_one_petty_cash_per_branch
  ON fin.payment_account_control(branch_id)
  WHERE account_role = 'PETTY_CASH' AND is_active;
CREATE INDEX IF NOT EXISTS payment_account_control_branch_role_idx
  ON fin.payment_account_control(branch_id, account_role, is_active);

-- The GL account is reusable across branches; branch ownership belongs to the
-- payment-account control row, not to a duplicate GL account per branch.
INSERT INTO fin.gl_account(account_code, account_name, account_type, is_control, is_active)
SELECT '1130', 'Petty Cash', 'ASSET', true, true
WHERE NOT EXISTS (SELECT 1 FROM fin.gl_account WHERE account_code='1130');

COMMENT ON COLUMN fin.payment_account_control.account_role IS
  'GENERAL for company-wide controlled accounts; PETTY_CASH for one branch-owned petty-cash account.';
COMMENT ON COLUMN fin.payment_account_control.branch_id IS
  'Owning branch for branch-scoped controlled accounts; NULL for general company-wide accounts.';

CREATE OR REPLACE FUNCTION fin.assert_expense_voucher_payment_account_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_role text; v_branch uuid;
BEGIN
  IF NEW.posted_journal_id IS NOT NULL AND NEW.payment_account_id IS NOT NULL THEN
    SELECT account_role, branch_id INTO v_role, v_branch
    FROM fin.payment_account_control WHERE account_id=NEW.payment_account_id;
    IF v_role='PETTY_CASH' AND v_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'Petty Cash payment account belongs to a different branch.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS expense_voucher_payment_account_scope_trg ON fin.expense_voucher;
CREATE TRIGGER expense_voucher_payment_account_scope_trg
AFTER UPDATE OF posted_journal_id ON fin.expense_voucher
FOR EACH ROW EXECUTE FUNCTION fin.assert_expense_voucher_payment_account_scope();
