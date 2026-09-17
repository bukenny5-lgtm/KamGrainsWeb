# Error and Root-Cause Log

## Required Error Fields

Each error entry should include:
- Error ID
- Date
- Module
- Environment
- Exact Error
- Reproduction Steps
- Impact
- Root Cause
- Fix
- Files Changed
- Database Objects Changed
- Migration
- Regression Risk
- Validation
- Status
- Related Commit

## ERR-001 — AR Backdated Receipt Audit Trigger

- **Date:** 2026-09-14
- **Module:** AR Payments / Backdating / Audit
- **Environment:** Development / PostgreSQL
- **Exact Error:** `record "new" has no field "delivery_id"`
- **Reproduction Steps:** Create a backdated AR receipt/payment and submit it.
- **Impact:** Backdated receipt creation failed.
- **Root Cause:** Shared audit trigger function referenced nonexistent `NEW.delivery_id` and incompatible fields on AR payment application rows.
- **Fix:** Updated audit trigger logic to use JSON-based field lookup and correct AR application mapping; audit event mapped to `CREATE`.
- **Files Changed:** `database/migrations/phase_10_fix_backdate_audit_trigger.sql`
- **Database Objects Changed:** `audit.fn_log_backdate_event()` and associated trigger behavior.
- **Migration:** `phase_10_fix_backdate_audit_trigger.sql`
- **Regression Risk:** Medium; shared audit trigger behavior.
- **Validation:** Normal and backdated rollback tests passed; audit event created correctly.
- **Status:** VERIFIED
- **Related Commit:** UNKNOWN

## ERR-002 — AP Partial Payment Applied Full Invoice Balance

- **Date:** 2026-09-14
- **Module:** AP Payments
- **Environment:** Frontend
- **Exact Error:** User intended a partial application but the UI initialized the full invoice balance.
- **Reproduction Steps:** Click Apply before entering a payment amount.
- **Impact:** Incorrect payment/application amount could be prepared.
- **Root Cause:** `addApplication()` used full invoice balance fallback when payment amount was not positive.
- **Fix:** Removed full-balance fallback from the partial-payment path and synchronized Payment Amount to total application amounts.
- **Files Changed:** `frontend/src/pages/ApPayments.tsx`
- **Database Objects Changed:** None
- **Migration:** None
- **Regression Risk:** Medium; AP payment UI workflow.
- **Validation:** Partial-payment scenario verified; TypeScript/build passed.
- **Status:** VERIFIED
- **Related Commit:** UNKNOWN

## ERR-003 — AP Apply Button Disabled Regression

- **Date:** 2026-09-14
- **Module:** AP Payments
- **Environment:** Frontend
- **Exact Error:** Open invoice Apply buttons were disabled when Payment Amount was blank.
- **Reproduction Steps:** Select supplier with open invoices before a payment amount exists.
- **Impact:** User could not select an invoice.
- **Root Cause:** Apply disabled condition and `addApplication()` guard still required positive Payment Amount after Payment Amount became derived from applications.
- **Fix:** Apply now depends on invoice eligibility, not pre-existing Payment Amount; blank Payment Amount can initialize from invoice application.
- **Files Changed:** `frontend/src/pages/ApPayments.tsx`
- **Database Objects Changed:** None
- **Migration:** None
- **Regression Risk:** Low to Medium.
- **Validation:** Blank-amount selection, partial edit, duplicate protection, removal, multiple invoices, and backdate validation passed.
- **Status:** VERIFIED
- **Related Commit:** UNKNOWN

## ERR-004 — Stale TanStack Query Dependent Caches

- **Date:** 2026-09-14
- **Module:** Frontend / Multiple transactional modules
- **Environment:** Frontend
- **Exact Error:** Updated records remained visible until manual refresh/navigation.
- **Reproduction Steps:** Post/change a transaction and immediately revisit dependent open-invoice or summary data.
- **Impact:** UI displayed stale server state.
- **Root Cause:** Mutation handlers refreshed only visible list/detail queries while dependent caches remained valid for up to configured `staleTime`.
- **Fix:** Added targeted invalidation for affected dependent query keys.
- **Files Changed:** AP Payments, AR Payments, AP Invoices, AR Invoices, Purchase Orders, Goods Receipts, Sales Orders.
- **Database Objects Changed:** None
- **Migration:** None
- **Regression Risk:** Low.
- **Validation:** Runtime refresh behavior confirmed.
- **Status:** VERIFIED
- **Related Commit:** UNKNOWN

## ERR-005 — Invisible Excel Export Headers

- **Date:** 2026-09-14
- **Module:** Shared Excel Export
- **Environment:** Frontend / Excel
- **Exact Error:** Header values existed but were visually invisible in worksheet cells.
- **Reproduction Steps:** Export a worksheet and inspect row 1.
- **Impact:** Export readability degraded.
- **Root Cause:** Fragile header styling with poor text/fill contrast and style mapping.
- **Fix:** Changed header styling to dark text on light fill with explicit alignment, bold styling, and normal row height.
- **Files Changed:** `frontend/src/lib/excelExport.ts`
- **Database Objects Changed:** None
- **Migration:** None
- **Regression Risk:** Low.
- **Validation:** Delivery and AR Invoice export XML/shared-helper behavior verified.
- **Status:** VERIFIED
- **Related Commit:** UNKNOWN

## Logging Rules

- Record exact errors without exposing secrets.
- Separate symptoms from confirmed root causes.
- Use `NOT RUN` when validation was not executed.
- Use `UNKNOWN` where evidence is unavailable.
- Link each error to the relevant commit when known.
