# Phase 8K — Cross-Branch Cash Funding and Settlement

Implemented as a forward extension of `fin.payment_account_transfer`; the existing same-branch immediate-posting path remains available.

## Control model

- Cross-branch requests carry source and destination branches, controlled payment accounts, amount, reference, idempotency key, maker/checker timestamps, dispatch/receipt metadata, journal links, and cancellation/reversal history.
- Both branches must be active branches of the same company. The source must be the operator's authorized operating branch; receipt is restricted to the destination branch.
- Initial scope is CASH only. The source account must be explicitly enabled with `allow_cross_branch_funding`; the destination must be branch-owned Petty Cash. Active till cash accounts are rejected.
- The state path is `DRAFT -> SUBMITTED -> APPROVED -> IN_TRANSIT -> COMPLETED`. Cancellation is limited to pre-dispatch states. A received amount that differs from dispatch becomes `RECEIPT_VARIANCE` without automatic gain/loss. Completed transfers use paired reversal journals and remain traceable.

## Accounting

Dispatch posts a source-branch journal: Dr configured company Cash in Transit / Cr source cash. Receipt posts a destination-branch journal: Dr destination Petty Cash / Cr Cash in Transit. The Cash in Transit GL account is configured in `fin.cross_branch_account_configuration`; no branch-specific GL code is hardcoded in the route. This keeps P&L neutral and nets the transit asset to zero after receipt.

## Authorization and audit

The explicit actions are `VIEW_CROSS_BRANCH_TRANSFERS`, `CREATE_CROSS_BRANCH_TRANSFER`, `APPROVE_CROSS_BRANCH_TRANSFER`, `DISPATCH_CROSS_BRANCH_TRANSFER`, `RECEIVE_CROSS_BRANCH_TRANSFER`, `CANCEL_CROSS_BRANCH_TRANSFER`, and `REVERSE_CROSS_BRANCH_TRANSFER`. Sales and Cashier roles are not granted these actions. Every lifecycle transition emits the corresponding Phase 8J business event.

The scoped report is `/api/reports/cross-branch-transfers`; the existing transfer screen adds branch selectors, destination-account loading, lifecycle actions, and a status preview without replacing the same-branch form.
