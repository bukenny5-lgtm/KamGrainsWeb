# Phase 8J — Audit Coverage Hardening

Implemented locally on 2026-09-30 using forward migration `phase_51_audit_coverage_hardening.sql`.

## Architecture

The existing append-only `audit.event` table remains the single Audit Log source; `audit.backdate_event` remains unchanged. Phase 51 adds:

- `audit.log_business_event(...)`, a reusable transactional business-event writer in `audit.event`.
- `audit.log_business_event_from_row()`, which maps material source-row changes to human-readable event codes.
- Low-level row triggers and business-event triggers on expense vouchers, payment accounts, transfers, till configuration/assignment, sessions, cash movements, handovers, and reconciliations.
- Lookup indexes plus action/object idempotency for business events.
- Audit permission enforcement and branch scoping for non-global viewers.

Expense Voucher create/post/reversal, payment transfer create/post/reversal, petty-cash account configuration/funding, till configuration, session, cash movement, carry-forward/handover, and reconciliation events are covered prospectively. Business events carry persisted branch, actor, amount, reason/reference, document/object, and journal linkage where available. Existing raw row data remains available for forensic inspection.

No accounting entries, posting/reversal logic, cash controls, branch attribution, UI design, historical audit records, deployment, or commit were changed. The initial live smoke test found and corrected the pre-existing `audit.event.action` check constraint so only `I/U/D` or uppercase business-event codes under `business.event` are accepted.

Validation passed: local database identity check, Phase 51 migration, business-event rollback smoke test, row-trigger rollback smoke test, backend build, changed-file syntax checks, deterministic Phase 8J/8I tests, and `git diff --check`. Authenticated live acceptance remains required for the specified Expense Voucher, transfer, Till Cash In, Safe Drop, and Audit Log sequences.
