-- Phase 8I-A: Expense Voucher posting and controlled payment-account hardening.
-- Forward-only. No Petty Cash funding or cross-branch settlement is implemented.

ALTER TABLE fin.expense_voucher
  ADD COLUMN IF NOT EXISTS reversal_journal_id uuid NULL REFERENCES fin.gl_journal(journal_id),
  ADD COLUMN IF NOT EXISTS void_reason text NULL,
  ADD COLUMN IF NOT EXISTS voided_by uuid NULL REFERENCES sec.app_user(user_id),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL;

ALTER TABLE fin.expense_voucher
  DROP CONSTRAINT IF EXISTS expense_voucher_status_check,
  ADD CONSTRAINT expense_voucher_status_check
    CHECK (status IN ('DRAFT','POSTED','CANCELLED','VOID'));

CREATE OR REPLACE FUNCTION fin.resolve_expense_voucher_journal_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.source_module='EXP' AND NEW.source_id IS NOT NULL AND NEW.branch_id IS NULL THEN
    SELECT branch_id INTO NEW.branch_id
    FROM fin.expense_voucher
    WHERE expense_voucher_id=NEW.source_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_resolve_expense_voucher_journal_branch ON fin.gl_journal;
CREATE TRIGGER trg_resolve_expense_voucher_journal_branch
BEFORE INSERT OR UPDATE OF source_module,source_id,branch_id ON fin.gl_journal
FOR EACH ROW EXECUTE FUNCTION fin.resolve_expense_voucher_journal_branch();

CREATE OR REPLACE FUNCTION fin.post_expense_voucher_by_no(
  p_voucher_no text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_voucher fin.expense_voucher%ROWTYPE;
  v_journal_id uuid;
  v_journal_no text;
  v_total numeric(18,2);
  v_line_count integer;
  v_invalid_line_count integer;
  v_payment_channel text;
  v_expected_channel text;
  v_payment_account record;
BEGIN
  SELECT * INTO v_voucher
  FROM fin.expense_voucher
  WHERE voucher_no=p_voucher_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense voucher % was not found.',p_voucher_no;
  END IF;
  IF v_voucher.status='POSTED' OR v_voucher.posted_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Expense voucher % is already posted.',p_voucher_no;
  END IF;
  IF v_voucher.status IN ('CANCELLED','VOID','REVERSED') THEN
    RAISE EXCEPTION 'Cancelled or reversed expense voucher % cannot be posted.',p_voucher_no;
  END IF;
  IF v_voucher.branch_id IS NULL THEN
    RAISE EXCEPTION 'Expense voucher % has no branch attribution.',p_voucher_no;
  END IF;
  IF v_voucher.payment_account_id IS NULL THEN
    RAISE EXCEPTION 'Expense voucher % has no payment account.',p_voucher_no;
  END IF;

  SELECT pac.channel_type,pac.is_active,pac.is_payment_account,
         ga.account_type,ga.account_code,ga.account_name
  INTO v_payment_account
  FROM fin.payment_account_control pac
  JOIN fin.gl_account ga ON ga.account_id=pac.account_id
  WHERE pac.account_id=v_voucher.payment_account_id;
  IF NOT FOUND OR NOT v_payment_account.is_active OR NOT v_payment_account.is_payment_account THEN
    RAISE EXCEPTION 'Selected account is not an active payment account.';
  END IF;
  IF v_payment_account.account_type <> 'ASSET' THEN
    RAISE EXCEPTION 'Payment account % must link to an ASSET GL account.',v_payment_account.account_code;
  END IF;

  v_payment_channel := upper(coalesce(v_voucher.payment_method,'CASH'));
  IF v_payment_channel='CHEQUE' THEN v_expected_channel:='BANK';
  ELSE v_expected_channel:=v_payment_channel;
  END IF;
  IF v_payment_channel NOT IN ('CASH','BANK','MOBILE_MONEY','CHEQUE','OTHER') THEN
    RAISE EXCEPTION 'Unsupported expense payment method %.',v_payment_channel;
  END IF;
  IF v_expected_channel IS NOT NULL AND v_payment_account.channel_type <> v_expected_channel THEN
    RAISE EXCEPTION '% requires a % payment account.',v_payment_channel,v_expected_channel;
  END IF;

  SELECT COUNT(*),COALESCE(SUM(amount),0)
  INTO v_line_count,v_total
  FROM fin.expense_voucher_line
  WHERE expense_voucher_id=v_voucher.expense_voucher_id;
  IF v_line_count=0 THEN RAISE EXCEPTION 'Expense voucher % has no lines.',p_voucher_no; END IF;
  IF v_total<=0 THEN RAISE EXCEPTION 'Expense voucher % total must be greater than zero.',p_voucher_no; END IF;

  SELECT COUNT(*) INTO v_invalid_line_count
  FROM fin.expense_voucher_line l
  LEFT JOIN fin.gl_account ea ON ea.account_id=l.expense_account_id
  WHERE l.expense_voucher_id=v_voucher.expense_voucher_id
    AND (l.amount IS NULL OR l.amount<=0 OR ea.account_id IS NULL
         OR ea.is_active IS NOT TRUE OR ea.account_type<>'EXPENSE');
  IF v_invalid_line_count>0 THEN
    RAISE EXCEPTION 'Expense voucher % contains an invalid expense account or amount.',p_voucher_no;
  END IF;

  -- Uses the canonical payment-account balance/overdraft policy.
  PERFORM fin.assert_payment_account_can_pay(v_voucher.payment_account_id,v_total);

  v_journal_no:='JV-'||p_voucher_no;
  INSERT INTO fin.gl_journal(
    journal_no,journal_date,description,source_module,source_id,created_by,branch_id
  ) VALUES(
    v_journal_no,v_voucher.voucher_date,'Expense voucher '||p_voucher_no,
    'EXP',v_voucher.expense_voucher_id,coalesce(p_user_id,v_voucher.created_by),
    v_voucher.branch_id
  ) RETURNING journal_id INTO v_journal_id;

  INSERT INTO fin.gl_journal_line(journal_id,account_id,party_id,memo,debit,credit)
  SELECT v_journal_id,l.expense_account_id,v_voucher.payee_id,l.description,l.amount,0
  FROM fin.expense_voucher_line l
  WHERE l.expense_voucher_id=v_voucher.expense_voucher_id;

  INSERT INTO fin.gl_journal_line(journal_id,account_id,party_id,memo,debit,credit)
  VALUES(v_journal_id,v_voucher.payment_account_id,v_voucher.payee_id,
         'Payment for expense voucher '||p_voucher_no,0,v_total);

  PERFORM fin.assert_balanced(v_journal_id);

  UPDATE fin.expense_voucher
  SET status='POSTED',posted_journal_id=v_journal_id,posted_at=now(),posted_by=p_user_id
  WHERE expense_voucher_id=v_voucher.expense_voucher_id;
  RETURN 1;
END;
$function$;

COMMENT ON FUNCTION fin.post_expense_voucher_by_no(text,uuid) IS
  'Posts immediate Expense Vouchers as Dr active EXPENSE accounts / Cr controlled payment account; branch comes from persisted voucher.';

CREATE OR REPLACE FUNCTION fin.void_expense_voucher_by_no(
  p_voucher_no text,
  p_user_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_voucher fin.expense_voucher%ROWTYPE;
  v_reversal_journal_id uuid;
  v_reversal_no text;
BEGIN
  IF NULLIF(trim(coalesce(p_reason,'')),'') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to void an expense voucher.';
  END IF;

  SELECT * INTO v_voucher
  FROM fin.expense_voucher
  WHERE voucher_no=p_voucher_no
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense voucher % was not found.',p_voucher_no; END IF;
  IF v_voucher.status='VOID' OR v_voucher.reversal_journal_id IS NOT NULL THEN
    RAISE EXCEPTION 'Expense voucher % is already reversed.',p_voucher_no;
  END IF;
  IF v_voucher.status<>'POSTED' OR v_voucher.posted_journal_id IS NULL THEN
    RAISE EXCEPTION 'Only a POSTED expense voucher can be voided.';
  END IF;

  v_reversal_no:='JV-VOID-'||p_voucher_no;
  INSERT INTO fin.gl_journal(
    journal_no,journal_date,description,source_module,source_id,created_by,branch_id
  ) VALUES(
    v_reversal_no,current_date,'Void expense voucher '||p_voucher_no,
    'EXP_VOID',v_voucher.expense_voucher_id,p_user_id,v_voucher.branch_id
  ) RETURNING journal_id INTO v_reversal_journal_id;

  INSERT INTO fin.gl_journal_line(journal_id,account_id,party_id,memo,debit,credit)
  SELECT v_reversal_journal_id,account_id,party_id,
         COALESCE(memo,'')||' [EXPENSE VOUCHER VOID]',credit,debit
  FROM fin.gl_journal_line
  WHERE journal_id=v_voucher.posted_journal_id;
  PERFORM fin.assert_balanced(v_reversal_journal_id);

  UPDATE fin.expense_voucher
  SET status='VOID',reversal_journal_id=v_reversal_journal_id,
      void_reason=trim(p_reason),voided_by=p_user_id,voided_at=now()
  WHERE expense_voucher_id=v_voucher.expense_voucher_id;
  RETURN v_reversal_journal_id;
END;
$function$;

COMMENT ON FUNCTION fin.void_expense_voucher_by_no(text,uuid,text) IS
  'Retains a posted Expense Voucher and creates one balanced reversal journal; original journal lines are immutable.';
