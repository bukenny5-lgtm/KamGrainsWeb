# Branch Petty Cash — Phase 8I-B

Petty Cash is a reusable controlled payment account, not a new duplicate voucher or a till movement.

- Configure one active `PETTY_CASH` control per branch on Payment Accounts.
- The control uses the shared `1130 — Petty Cash` ASSET GL account (created only when absent).
- Funding is a same-branch Payment Account Transfer: Dr Petty Cash / Cr source cash, with no P&L effect.
- An Expense Voucher paid from Petty Cash posts Dr the selected expense account / Cr Petty Cash.
- Voiding retains the original voucher and creates exactly one balanced `EXP_VOID` reversal.
- General company-wide payment accounts remain `branch_id NULL`; petty cash is branch-required and branch-filtered.
- The existing reconciliation module can reconcile petty cash by selecting its controlled account and recording opening/closing counted cash. Book balances and activity come from posted journals.
- `GET /api/reports/petty-cash-activity?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` provides journal-derived funding, expenses, reversals, transfers out, and running balance.
- Ordinary Till Cash Out remains in the database and historical reporting, but is no longer offered as a new UI action. Use Expense Vouchers for business expenses.

Manual acceptance: configure a real branch petty-cash account, fund it from the same-branch source, post a voucher, void it, and verify journal balances, branch IDs, and reconciliation book balance before live branch cash is accepted.
