# Payment Account Transfers

Phase 8G adds a dedicated internal transfer workflow at `/api/payment-account-transfers` and from Payment Account Control.

## Boundaries

- Opening Balance establishes a go-live or migration position.
- Payment Account Transfer moves value between existing controlled payment accounts during normal operations.
- Till Cash Movement changes a physical drawer/session and remains the authority for Cash In, Safe Drop, opening float, refunds, and carry-forward.

Payment Account Transfer must not be used to fund an active till session or bypass cashier accountability.

## Posting behavior

An authorized Finance, Manager, or Admin user submits a transfer with transaction date, source, destination, amount, reason, optional reference, and a UUID request key. The backend locks both payment-account control rows in deterministic order, validates the canonical available balance and channel compatibility, creates the durable transfer header, creates `Dr destination / Cr source`, calls `fin.assert_balanced`, links the journal, and marks the transfer `POSTED` in one transaction.

Initial supported channel combinations are CASH→CASH, CASH→BANK, and BANK→CASH. Account codes are selected from normal payment-account metadata; no account UUID or code is hardcoded in the workflow.

Retries with the same idempotency key return the original transfer. A later legitimate transfer with a new key is allowed. Posted transfers are not edited or deleted; authorized void creates a reversal journal and retains the original audit record.

## Current local acceptance precondition

Local `kam_grains_db` currently reports approximately UGX 840,876.20 available in `1000 — Cash`, zero in `1120 — Main Cash Safe`, and zero in `1110 — Cash in Tills`. The controlled acceptance sequence is therefore 1000→1120 for UGX 1,000, followed by a Phase 8F Main Safe opening-float test. No live transfer was posted during implementation without an authenticated business-user session.

## Permissions

View: Admin, Manager, Finance, Auditor. Create/Post/Void: Admin, Manager, Finance. Sales and ordinary cashier roles are not granted transfer permissions.

Void/reversal is supported; cross-branch settlement, approval thresholds, and cash-in-transit are documented extension points rather than silently invented parallel systems.
