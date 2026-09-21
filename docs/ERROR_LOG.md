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

## ERR-006 — Phase 2 Setup React Render Loop

- **Date:** 2026-09-18
- **Module:** Phase 2 Product Setup / Business Profile
- **Environment:** Deployed frontend production bundle / local source reproduction analysis
- **Exact Error:** Minified React error #185, consistent with an excessive repeating state-update render cycle.
- **Reproduction Steps:** Open the Setup page after the Phase 2 frontend deployment while the business-profile query is active.
- **Impact:** Setup could fail to render in the production browser; product/category administration was unavailable. Transaction data and backend/API behavior were unaffected.
- **Root Cause:** `useBusinessProfile()` returned a newly spread fallback/merged profile object on every render. `Setup.tsx` copied that object into `profileForm` in an effect dependent on `businessProfile`, so the dependency identity changed after every state update and the effect continuously called `setProfileForm`.
- **Fix:** Memoized the merged profile object in `frontend/src/lib/businessProfile.ts` with `useMemo`, keyed by the query result. No Phase 2 fields, API contract, database schema, or transaction logic were removed or changed.
- **Files Changed:** `frontend/src/lib/businessProfile.ts`, `docs/ERROR_LOG.md`, `docs/TEST_LOG.md`, `docs/IMPLEMENTATION_LOG.md`, `docs/CURRENT_STATUS.md`.
- **Database Objects Changed:** None.
- **Migration:** None.
- **Regression Risk:** Low; the correction stabilizes object identity while preserving fallback and query behavior.
- **Validation:** Frontend TypeScript PASS, frontend build PASS, backend build PASS, `git diff --check` PASS. Browser automation could not attach to the local Vite tab; UI smoke validation remains pending.
- **Status:** FIXED — UI VALIDATION PENDING
- **Related Commit:** NONE

## Logging Rules

- Record exact errors without exposing secrets.
- Separate symptoms from confirmed root causes.
- Use `NOT RUN` when validation was not executed.
- Use `UNKNOWN` where evidence is unavailable.
- Link each error to the relevant commit when known.
## ERR-P3-FEATURE-AUDIT-001 — Phase 3 Feature Audit Insert Type Error — 2026-09-18

- **Module:** Business feature configuration API
- **Environment:** Development PostgreSQL and isolated Express server on port 3001
- **Exact Error:** Initial authorized feature PATCH returned HTTP 500 with PostgreSQL `could not determine data type of parameter $3`.
- **Reproduction:** Apply `PATCH /api/business-features` with an ADMIN JWT and `{ "features": { "reports": false } }`.
- **Root Cause:** Parameters embedded in `jsonb_build_object` were not explicitly typed for the audit insert.
- **Fix:** Cast feature code and boolean old/new values in `backend/src/routes/businessFeatures.routes.js`.
- **Impact:** Development validation only; no transaction rows or production systems affected.
- **Files Changed:** `backend/src/routes/businessFeatures.routes.js`.
- **Database Objects Changed:** None beyond the already-applied Phase 3 feature tables; the failed transaction rolled back.
- **Migration:** `database/migrations/phase_13_feature_flags.sql` was not changed for this defect.
- **Regression Risk:** Low; explicit parameter casts are limited to audit serialization.
- **Validation:** Authorized disable/restore PATCH returned HTTP 200 after restart; the failed attempt rolled back and left KAM configuration unchanged.

## ERR-P4-REPORT-001 — POS Sales Report Alias Regression — 2026-09-18

## ERR-P4-POS-002 — Phase 16/17 Pricing and Void Valuation Corrections — 2026-09-18

## ERR-P4-POS-003 — Final Runtime Validation Found HYBRID Reason Transport Gap — 2026-09-18

- **Root cause:** The POS form had no override-reason state or input and `completeSale()` omitted `price_override_reason` from the request payload. The backend therefore received an empty reason for authorized HYBRID price differences. Line-level reasons were also not explicitly normalized before persistence.
- **Correction:** Added frontend `priceOverrideReason` state and a HYBRID-only reason input, preserved the original configured price for detecting an override, and sent the deliberate API field `price_override_reason`. The route now trims the sale-level or line-level reason, requires a non-empty value only for an actual HYBRID override, and persists the trimmed value.
- **Runtime evidence:** Development API test passed an authorized ADMIN override from configured 4,000 to actual 3,800 with input `  Negotiated wholesale price  `. Persisted values were `price_source=OVERRIDE`, `reference_price=4000.00`, `unit_price=3800.00`, and `price_override_reason='Negotiated wholesale price'`. Whitespace-only and missing reasons were rejected; SALES authorization was rejected; configured HYBRID price posted successfully.
- **Status:** Correction validated in development. Phase 18 remains open for the remaining void, receipt, reporting/cache, and browser smoke tests.

- **Cause:** The Phase 16 posting function rejected valid HYBRID price overrides by requiring actual price equality with the configured price, and Phase 17 recalculated reversal COGS using the current default cost.
- **Correction:** Phase 18 replaces both functions. HYBRID overrides retain reference and actual price audit fields; voids reuse the original `SALE_ISSUE` movement line quantity, lot, and unit cost exactly.
- **Status:** Corrective migration applied to development. Full changed-cost runtime regression remains pending.

- **Module:** Phase 4 POS reporting compatibility

- **Environment:** Development Express API / PostgreSQL
- **Exact Error:** First request to `GET /api/reports/weekly-sales-by-product` after the event-view migration returned HTTP 500: `missing FROM-clause entry for table "dl"`.
- **Root Cause:** The query was partially converted from delivery-line aliases to `reporting.v_sales_event_lines` and retained old `dl`/`d` aliases in average-price and count expressions.
- **Fix:** Replaced the remaining expressions with event-view quantity, revenue, event, and customer fields.
- **Impact:** Development validation only; the failed read query made no data changes.
- **Files Changed:** `backend/src/routes/reports.routes.js`.
- **Validation:** All five POS-aware report endpoints returned HTTP 200 after correction.
- **Status:** FIXED.

## ERR-P4-RET-001 — POS-Linked AR Could Be Voided Independently — 2026-09-20

- **Cause:** The normal AR invoice void function had no knowledge of the originating `sal.pos_sale.credit_ar_invoice_id` relationship, allowing AR reversal without POS status or inventory reversal.
- **Correction:** Phase 19 adds a database trigger and backend preflight guard that reject direct voids for POS-linked receivables and direct users to the originating POS sale or Customer Returns.
- **Validation:** A transactional attempt against `POS-20260918-000022` returned the expected originating-POS/Customer Returns error and was rolled back.
- **Status:** FIXED in development; authenticated UI/runtime approval remains required.

## ERR-P4-RET-002 — AR Invoice Action Feedback Leaked Between Modals — 2026-09-20

- **Cause:** TanStack mutation success/error state was retained while selecting or reopening another AR invoice.
- **Correction:** `ArInvoices.tsx` now resets post/void mutations when the selected invoice or modal state changes, when the modal closes, and before new actions. POS-linked AR void is also disabled in the UI with explanatory text.
- **Status:** FIXED in the working tree; browser smoke remains pending.

## ERR-P4-RET-003 — Credit Return Does Not Recalculate AR Settlement — 2026-09-20

- **Module:** Universal Customer Returns settlement
- **Environment:** Development migration/function review and rollback-contained validation
- **Exact Gap:** `sal.post_customer_return` posts a balanced return journal and marks POS CREDIT returns `CREDIT_DUE`, but does not reduce the originating AR invoice amount/outstanding balance or transition its status.
- **Impact:** Unpaid, partially paid, and fully paid credit-return scenarios cannot yet be safely settled; a return must not be presented as production-ready accounting behavior.
- **Status:** OPEN — follow-up design/implementation required.

## ERR-P4-RET-004 — Cash Refund and Return Voiding Workflows Are Missing — 2026-09-20

- **Module:** Universal Customer Returns settlement/disposition
- **Exact Gap:** CASH/card/mobile returns are recorded as `REFUND_DUE` foundation state without a refund-payment settlement workflow, and no return-void endpoint/function exists.
- **Impact:** Paid returns cannot be completed without external manual accounting, and posted return data must not be deleted or simulated as voided.
- **Status:** OPEN — follow-up implementation required.

## ERR-P4-RET-005 — DAMAGED Returns Have No Quarantine Location — 2026-09-20

- **Module:** Inventory disposition
- **Exact Gap:** DAMAGED lines avoid normal sellable stock by using a NULL destination location, but there is no controlled quarantine/damaged location or reporting workflow.
- **Impact:** The goods are not silently restocked, but physical/accounting custody is incomplete.
- **Status:** OPEN — smallest safe follow-up is a controlled damaged/quarantine location and stock policy before production use.

## ERR-P4-RET-006 — Refund/AR Settlement Requires a Complete Financial Reversal Model — 2026-09-20

- **Module:** Phase 19A refund and credit settlement
- **Exact Gap:** Existing Phase 19 journals do not provide a safe linked refund-payable/AR-credit workflow for unpaid, partially paid, and fully paid returns. A refund record foundation was added, but monetary settlement is not falsely marked complete.
- **Status:** OPEN — requires finance-approved account mappings, AR balance refresh, refund journals, and receipt-preserving tests.

## ERR-P4-RET-007 — Return Void/Reversal Not Yet Implemented — 2026-09-20

- **Module:** Return lifecycle
- **Exact Gap:** Posted return movement, journal, AR reduction, and refund obligations do not yet have a complete reverse transaction. Return deletion/simulation was intentionally not allowed.
- **Status:** OPEN — implement only with refund-after-void blocking and complete audit reversal.

## ERR-P4-RET-008 — Phase 19 Credit Return Used Uncapped AR Credit — 2026-09-20

- **Module:** Customer return credit settlement
- **Cause:** The Phase 19 journal credited AR by the full return value even when current outstanding was lower than the return value.
- **Correction:** Phase 21 caps AR credit at current invoice outstanding and routes excess to the configured refund-payable account; original invoices and receipts remain unchanged.
- **Validation:** Development rollback tests passed for unpaid partial/full and fully paid return scenarios.
- **Status:** CORRECTED in development; authenticated runtime approval remains pending.

## ERR-P4-RET-009 — Return Void Needed Reversal Boundary — 2026-09-20

- **Module:** Customer return lifecycle
- **Correction:** Added controlled void function and route with exact-cost reversal movement, balanced journal reversal, audit fields, and refund-after-settlement blocking.
- **Status:** Implemented in development; delivery/quarantine/browser validation remains pending.

## ERR-P4-RET-010 — Phase 19C Frontend Acceptance Surface Blank — 2026-09-20

- **Module:** Local Vite frontend / authenticated runtime acceptance
- **Observed:** Backend health page was reachable on port 3000. Vite frontend started on port 5174, but the browser rendered a blank page with no usable accessibility tree or authenticated application controls.
- **Impact:** Required policy, POS, refund, void, quarantine, Return Note, dashboard, cache, permission, and KAM UI acceptance could not be executed.
- **Status:** RESOLVED in working tree; current-backend browser integration remains pending.

## ERR-P4-RET-011 — Browser Session Bound to Stale Backend Port — 2026-09-20

- **Module:** Local development runtime
- **Observed:** Existing authenticated frontend session called port 3000, where the current customer-return source route returned HTTP 404. The current working-tree backend on port 3001 returned HTTP 200 for the same controlled source.
- **Impact:** Full authenticated financial UI acceptance could not be run against the current backend without re-authentication on the new frontend origin.
- **Status:** OPEN — use one current frontend/backend origin and an authenticated session before final approval.

## ERR-P4-RET-012 — Missing Return Policy Setup UI — 2026-09-20

- **Module:** Setup / Return & Refund Policy administration
- **Observed:** The return policy API and server-side enforcement existed, but Setup exposed no policy configuration surface; Customer Returns was transaction processing only.
- **Correction:** Added the Return & Refund Policy section to Setup using the existing API, implemented fields, validation, and role-gated editing.
- **Status:** CORRECTED in working tree; manual authenticated save/reload and unauthorized-role browser validation remain pending.

## ERR-P4-RET-013 — Customer Returns Accepted Internal Source UUID — 2026-09-20

- **Module:** Customer Returns source loading
- **Observed:** The UI requested an internal POS/Delivery UUID as the primary source input.
- **Correction:** Source lookup now accepts normal posted POS sale or Delivery document numbers and resolves the internal UUID server-side; UUID compatibility remains supported.
- **Status:** CORRECTED in working tree; authenticated runtime retest remains pending.

## ERR-P4-RET-014 — Invalid Return Quantity Was Not Clearly Controlled — 2026-09-20

- **Module:** Customer Returns draft creation and source-line UI
- **Observed:** A return quantity such as 0.500 could be entered against a 0.100 remaining quantity, and the draft path did not independently enforce the remaining balance.
- **Correction:** The UI displays remaining quantity, validates positive values and upper bounds, disables draft creation while invalid, and the backend rejects over-return quantities before persistence.
- **Status:** CORRECTED in working tree; controlled 0.500/0.050 runtime retest remains pending.

## ERR-P4-RET-015 — Customer Return Post Feedback Was Incomplete — 2026-09-20

- **Module:** Customer Returns draft/post workflow
- **Observed:** Post Return had no visible error rendering and did not clearly show the draft/post state.
- **Correction:** Draft ID/status is displayed, posting uses the stored return ID, loading/duplicate-click guards were added, and backend errors are rendered visibly.
- **Status:** CORRECTED in working tree; authenticated runtime retest remains pending.

## ERR-P4-RET-016 — Return Note Used Submitted Quantity as Original Quantity — 2026-09-20

- **Module:** Customer Return draft persistence and Return Note
- **Observed:** Draft insertion set `original_sale_qty` from the submitted return quantity, causing a 0.500 request to appear as the original quantity for a 0.100 sale.
- **Correction:** Draft creation now copies source sold quantity and source unit price; the Return Note exposes original, previously returned, current returned, and remaining quantities. Existing incorrect development drafts are not auto-corrected.
- **Status:** CORRECTED in working tree; controlled runtime retest remains pending.

## ERR-P4-RET-017 — Return Note Rendered Raw JSON — 2026-09-20

- **Module:** Customer-facing Return Note
- **Observed:** The frontend printed the note API response as raw JSON.
- **Correction:** Added formatted printable POS thermal and Delivery/KAM A4 layouts with business-facing fields only; draft preview is marked DRAFT and final printing is available after POSTED.
- **Status:** CORRECTED in working tree; print-layout browser retest remains pending.

## ERR-P4-RET-018 — Document Number Reached UUID Query — 2026-09-20

- **Module:** `GET /api/customer-returns/source/:sourceType/:sourceIdentifier`
- **Observed:** Authenticated lookup of `POS-20260920-000040` returned a PostgreSQL UUID-cast error because the runtime path passed the document number into UUID-typed source loading.
- **Correction:** Added explicit POS `sale_no` and Delivery `delivery_no` resolution. UUID lookup is retained only when the input matches a validated UUID shape; source loading receives the resolved UUID only.
- **Status:** CORRECTED in working tree; exact POS and Delivery authenticated browser/API retest remains pending.

## ERR-P4-RET-019 — Customer Return POST Used Empty Current-User UUID — 2026-09-20

- **Module:** `POST /api/customer-returns/:id/post`
- **Observed:** API posting failed with `invalid input syntax for type uuid: ""`, while direct `sal.post_customer_return(valid_uuid)` SQL succeeded.
- **Root cause:** The route passed `req.user?.user_id || ""` into `app.current_user_id`; downstream audit functions read that setting as a UUID.
- **Correction:** Return IDs are validated before SQL, optional user UUIDs are normalized and empty values are never sent, and user-facing errors are sanitized while server-side details are logged.
- **Status:** CORRECTED in working tree; authenticated API/browser retest for RET-20260920-000020 remains pending.

## ERR-P4-RET-020 — Request User Context Was Not Transaction-Local — 2026-09-20

- **Module:** PostgreSQL request context for audited mutation routes
- **Observed:** `set_config('app.current_user_id', ..., true)` was executed without an enclosing transaction in the Customer Return post/refund/void routes, so the context could disappear before the posting function ran.
- **Correction:** Added shared UUID/context helpers, required the established `req.user.user_id` identity, and wrapped Customer Return context plus function execution in one transaction. POS context writes now use the same helper.
- **Validation:** A new controlled API-posted return persisted the authenticated UUID in `sal.customer_return.posted_by` and `inv.stock_movement.created_by`.
- **Status:** CORRECTED in development; manual browser retest remains pending.
- **ERR-P19D-SQL-001 — Reports `dormant_status` parser error — 2026-09-21**

  **Root cause:** The `customer_last_purchase` CTE closed without the comma required before the following `dormant_status` CTE, so PostgreSQL reported a syntax error at `dormant_status`.

  **Correction:** Added the missing CTE separator. Dormancy thresholds and status logic were unchanged.

- **ERR-P19D-SQL-002 — Reports `segmented` parser error — 2026-09-21**

  **Root cause:** The `rfm_data` CTE also lacked its separator before `segmented`, and the segmentation expression contained a duplicated opening `CASE`.

  **Correction:** Added the missing separator and removed only the extra `CASE`; existing RFM `WHEN` rules and segment labels were preserved.

- **ERR-P19D-SQL-003 — AR summary `AS` parser error — 2026-09-21**

  **Root cause:** The AR summary `GROUP BY` listed `ps.sale_no AS pos_sale_no`. PostgreSQL does not accept a `SELECT` alias declaration in `GROUP BY`.

  **Correction:** The selected POS field is explicitly `ps.sale_no AS pos_sale_no`, while `GROUP BY` uses the source expression `ps.sale_no`.
- **ERR-P19D-RET-021 — Delivery return source rejected despite completed delivery — 2026-09-21**

  **Root cause:** Customer Returns required `sal.delivery.status = 'POSTED'`, but the repository's Delivery lifecycle stores completed posted deliveries as `status = 'DELIVERED'`, `is_posted = true`, with a non-null `posted_movement_id`.

  **Correction:** Delivery return eligibility now follows the existing posting model: posted flag and stock issue are required, and VOID/CANCELLED deliveries are excluded. Delivery status values were not changed.

- **ERR-P19D-RET-022 — Customer Returns had no operational history/summary surface — 2026-09-21**

  **Root cause:** The page only supported source lookup and draft/post entry; users had to reconstruct return activity from Stock Movements, Journals, AR, and refunds.

  **Correction:** Reused the Customer Returns API with aggregate history/summary queries and added searchable/filterable history, summary cards, detail view, disposition/quarantine markers, and view/print actions. Return values use returned quantity multiplied by original sale price.
## ERR-P23-RET-001 — Fully Paid Delivery Return Created Duplicate Refund Credit — 2026-09-22

- **Observed:** Posting `RET-20260921-000026` failed with debits UGX 4,000 and credits UGX 6,200.
- **Root cause:** `sal.post_customer_return` created a provisional UGX 2,200 return-value credit while the settlement trigger independently created the AR/refund credit. The duplicate was `Refund due RET-20260921-000026`.
- **Correction:** Phase 23 makes invoice-linked settlement lines trigger-owned; the posting function retains only inventory and sales/COGS foundation lines. Non-invoiced returns retain the fallback credit.
- **Validation:** Development retest posted successfully with a balanced UGX 4,000 journal, AR still PAID, and refund due UGX 2,200.

## ERR-P19D-RET-UI-001 — Customer Return View and Refund Workflow Were Not Discoverable — 2026-09-22

- **Observed:** History View only selected an inline section, there was no discoverable refund action, and refund authorization was not represented in the frontend.
- **Correction:** Added shared Return Details and Process Refund dialogs, double-click row opening, refund history, normalized status labels, and `PROCESS_REFUND`-gated actions. The backend endpoint remains protected by `requireAuth` and `requirePermission('PROCESS_REFUND')`.
- **Status:** Implemented in the working tree; authenticated browser and partial/full refund retests remain pending.
