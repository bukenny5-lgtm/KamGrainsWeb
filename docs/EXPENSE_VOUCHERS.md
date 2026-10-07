# Expense Vouchers

Phase 8I-A hardens the existing immediate-payment Expense Voucher workflow. It preserves the `DRAFT -> POSTED` lifecycle and does not implement Petty Cash funding.

## Current posting

The live `fin.post_expense_voucher_by_no` function posts:

```text
Dr each active EXPENSE account from the voucher lines
Cr the selected active controlled payment-account GL
```

The financial date is `expense_voucher.voucher_date`. The audit timestamp remains `created_at`/`posted_at`. The journal source is `EXP` and the journal branch is copied from the persisted voucher branch.

Posting validates:

- voucher exists and is not already posted, cancelled, void, or reversed;
- voucher has a persisted branch;
- selected payment account is active, controlled, linked to an ASSET GL account, and compatible with the method;
- every line has a positive amount and active `EXPENSE` GL account;
- canonical payment-account balance/overdraft policy permits the payment;
- journal debits equal credits.

Controlled payment methods are `CASH`, `BANK`, `MOBILE_MONEY`, `CHEQUE`, and legacy `OTHER`. `CHEQUE` uses a BANK payment account. The frontend now loads payment sources from `/api/payment-accounts`; it no longer treats arbitrary active ASSET GL accounts as payment sources.

## Void/reversal

Posted vouchers are retained. The void endpoint creates a balanced reversal journal by swapping every original journal line's debit and credit, then marks the voucher `VOID` with:

- `reversal_journal_id`
- `void_reason`
- `voided_by`
- `voided_at`

Original journal lines are not edited. A second reversal is rejected. Permission: `VOID_EXPENSE_VOUCHER`, assigned to `ADMIN`, `MANAGER`, and `FINANCE`.

## Reporting and cashbook

Payment Account Control balances remain journal-derived. No balance fields are directly mutated. Cashbook now includes all active controlled payment accounts and labels `CASH_TRANSFER`/`TRF` activity as `INTERNAL_TRANSFER`, preventing internal funding movements from being treated as operating income or expense.

## Branch and Petty Cash boundary

Expense Voucher is branch-scoped through the authorized persisted voucher branch. Payment Accounts currently have no branch ownership column; they are company-wide controlled accounts. Future Petty Cash should use branch-owned Payment Account Control records or a branch-account assignment layer over a reusable Petty Cash GL control account.

Future funding is intentionally deferred:

```text
Dr Branch Petty Cash
Cr funding account
```

The current transfer model has one `branch_id`; source-branch versus destination-branch funding requires a future explicit inter-branch design with source/destination branches and, if needed, due-to/due-from accounts.

## Verification SQL

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='fin' AND p.proname='post_expense_voucher_by_no';

SELECT ev.voucher_no,ev.branch_id AS voucher_branch_id,ev.posted_journal_id,
       gj.branch_id AS journal_branch_id,gj.source_module,gj.source_id
FROM fin.expense_voucher ev
LEFT JOIN fin.gl_journal gj ON gj.journal_id=ev.posted_journal_id
WHERE ev.posted_journal_id IS NOT NULL
  AND ev.branch_id IS DISTINCT FROM gj.branch_id;

SELECT ev.voucher_no,gj.journal_no,gj.journal_date,gj.branch_id,
       ga.account_code,ga.account_name,gjl.debit,gjl.credit
FROM fin.expense_voucher ev
JOIN fin.gl_journal gj ON gj.journal_id=ev.posted_journal_id
JOIN fin.gl_journal_line gjl ON gjl.journal_id=gj.journal_id
JOIN fin.gl_account ga ON ga.account_id=gjl.account_id
ORDER BY ev.voucher_no,ga.account_code;

SELECT pac.account_id,ga.account_code,ga.account_name,pac.channel_type,
       pac.is_active,pac.is_payment_account,b.current_balance,b.available_balance
FROM fin.payment_account_control pac
JOIN fin.gl_account ga ON ga.account_id=pac.account_id
JOIN fin.v_payment_account_balance b ON b.account_id=pac.account_id
ORDER BY ga.account_code;

SELECT ev.voucher_no,ev.status,ev.posted_journal_id,ev.reversal_journal_id,
       ev.void_reason,ev.voided_by,ev.voided_at,gj.journal_no AS reversal_journal
FROM fin.expense_voucher ev
LEFT JOIN fin.gl_journal gj ON gj.journal_id=ev.reversal_journal_id
WHERE ev.reversal_journal_id IS NOT NULL;
```
