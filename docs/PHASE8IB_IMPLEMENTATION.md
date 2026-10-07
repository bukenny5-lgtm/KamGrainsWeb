# Phase 8I-B implementation record

Implemented on 2026-09-30 against local `kam_grains_db` only.

- Added branch-owned `PETTY_CASH` payment-account role and `branch_id` to the existing control model.
- Reused shared GL `1130 — Petty Cash`, creating it only when absent.
- Enforced one active petty-cash account per branch and same-branch transfer/payment rules.
- Added journal-derived `/api/reports/petty-cash-activity` reporting.
- Added Expense Voucher original/reversal journal references, reason, user, and timestamp without duplicate vouchers.
- Deprecated new ordinary Till Cash Out in the UI while preserving backend/history.
- Existing reconciliation can select petty cash and compare counted cash to the canonical journal-derived book balance.

Validation: local database identity was confirmed before Phase 50 was applied; backend route syntax checks, frontend typecheck, frontend production build, route SQL smoke checks, and deterministic tests passed. Authenticated live branch cash acceptance and end-to-end transfer/post/void/reconciliation acceptance remain required. No deployment or commit was made.
