# Audit Architecture — Phase 8J

The existing append-only `audit.event` table remains the single Audit Log source. `audit.backdate_event` remains the specialized backdating history. No parallel event store or replacement UI was introduced.

## Two layers

- Row-level audit uses the existing `audit.log_row_change()` trigger function and preserves INSERT/UPDATE/DELETE forensic data, primary-key JSON, transaction ID, client address, and authenticated database user context when available.
- Business-event audit uses `audit.log_business_event(...)`, storing human-readable event codes in the same `audit.event` table with `table_name='business.event'`. Its JSON carries object/document, company, branch, location, actor, amount, reason/reference, journal, related object, and metadata.
- Financial journals remain the accounting source of truth. Audit events describe actions and link to them; they do not calculate balances or replace journal detail.

Phase 51 installs low-level triggers and business-event mapping prospectively on material expense, payment-account, transfer, till, session, cash movement, handover, and reconciliation tables. Existing historical transactions are not backfilled or fabricated.

Business-event writes occur in the parent transaction. A rollback removes the event; an idempotent retry cannot create a duplicate successful event for the same action/object. The existing Audit Log endpoint and detail view remain in use, with branch-scoped visibility for non-global users and authorized Finance/Auditor/Admin access.

Sensitive credentials, tokens, PINs, CVV, and full card numbers are not added to business-event metadata.
