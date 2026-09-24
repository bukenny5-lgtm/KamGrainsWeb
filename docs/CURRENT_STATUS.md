# Current Status

- **Project:** KAM GRAINS ERP â†’ Multi-Business ERP/POS Platform
- **Current Phase:** Phase 1 — Universal Business Configuration / Universal Branding
- **Phase Status:** RUNTIME VALIDATION PASSED — UI SMOKE TEST PENDING
- **Current Branch:** main
- **Frontend TypeScript:** PASS — `npx.cmd tsc -b --pretty false`
- **Frontend Build:** PASS — `npm.cmd run build`
- **Backend Build:** PASS — `npm.cmd run build`
- **Known Blocking Issues:** None for Phase 0.
- **Production Status:** KAM GRAINS remains the stable production reference; no deployment or service restart authorized in Phase 0.
- **Last Completed Major Fix:** TanStack Query invalidation and runtime refresh improvements.
- **Next Task:** Apply/verify the Phase 1 migration and complete runtime/API/UI validation.

## Phase 1 Status — 2026-09-18

- **Implementation:** Complete in the working tree; not yet approved as complete.
- **Required next validation:** Apply/verify the migration, exercise authenticated GET/PATCH and unauthorized PATCH, and validate login, shell, Setup, and print output in the browser.
- **Restrictions retained:** No deployment, production restart, multi-tenancy, subscription, POS, multilingual, or transaction/accounting workflow changes.

## Phase 2 Status — 2026-09-18

- **Current step:** Product model inspection and design gap analysis complete.
- **Implementation:** Not started; no Phase 2 migration or schema change created.
- **Approval required:** Review `docs/PHASE2_PRODUCT_MODEL_INSPECTION.md` before implementation.

## Phase 2 Step 2 Status — 2026-09-18

- **Implementation:** Minimal universal product foundation implemented.
- **Runtime validation:** PASSED against development PostgreSQL and the real Express API.
- **Current status:** RUNTIME VALIDATION PASSED — UI SMOKE TEST PENDING.
- **Approval required:** Complete UI smoke validation before commit or Phase 2 completion.

## Phase 2 UI Regression Status — 2026-09-18

- **Regression:** React error #185 on Setup diagnosed and corrected.
- **Current status:** PHASE 2 UI REGRESSION FIX COMPLETE — UI SMOKE TEST PENDING.
- **Approval required:** Redeploy/reload the corrected frontend and complete browser smoke validation before commit.

## Current Future Direction
- Universal ERP configuration
- POS alongside Sales Orders
- Beverage operations
- Supermarket operations
- Spare parts operations
- Multilingual UI
- Responsive PWA
- Offline POS synchronization
- Database-per-business multi-tenancy
- Subscription and SaaS capabilities

## Phase 3 Step 1 Status — 2026-09-18

- **Current step:** Feature flags / business profiles capability inspection and design-gap analysis complete.
- **Implementation:** Not started; no schema change, migration, feature gating, or POS work created.
- **Recommendation:** Review `docs/PHASE3_FEATURE_FLAGS_INSPECTION.md`; approve the minimal feature catalogue and company-feature architecture before implementation.
- **Status:** PHASE 3 INSPECTION COMPLETE — IMPLEMENTATION APPROVAL REQUIRED.

## Phase 3 Step 2 Status — 2026-09-18

- **Implementation:** Minimal feature catalogue, per-company overrides, resolved API, shared hook, feature-aware navigation/route protection, and Setup controls implemented.
- **Development runtime:** Migration and real Express/PostgreSQL API validation passed; KAM settings restored with current features enabled and POS/barcode disabled.
- **Browser validation:** Authenticated UI smoke test remains pending because no authorized browser session was available.
- **Approval:** Do not mark Phase 3 complete or commit until browser smoke validation passes.

## Phase 4 Step 1 Status — 2026-09-18

- **Current step:** Quick Sale / POS foundation architecture inspection and design-gap analysis complete.
- **Implementation:** Not started; no POS migration, schema, API, UI, posting logic, or receipt implementation created.
- **Recommendation:** Review `docs/PHASE4_POS_INSPECTION.md` and approve the dedicated POS transaction boundary and approval gates before implementation.
- **Feature state:** POS remains disabled by default under the existing feature configuration.
- **Status:** PHASE 4 POS INSPECTION COMPLETE — IMPLEMENTATION APPROVAL REQUIRED.

## Phase 4 Step 2 Status — 2026-09-18

- **Implementation:** Minimal online POS foundation implemented: dedicated sale/line tables, server-controlled prices, atomic stock/accounting posting, idempotency, feature/permission gating, receipt renderer, reporting event union, and reversal voids.
- **Development runtime:** Migration applied and real Express/PostgreSQL API validation passed. POS feature and temporary test prices were restored/removed; POS remains disabled for KAM by default.
- **Static validation:** Frontend TypeScript PASS; frontend production build PASS; backend build PASS; `git diff --check` PASS.
- **Browser validation:** Authenticated UI smoke test remains pending.
- **Deferred:** Till sessions, barcode, offline, split tender, promotions, advanced discounts, returns/exchanges, container returns, and full pricing engine.
- **Status:** PHASE 4 POS IMPLEMENTATION COMPLETE — RUNTIME/UI APPROVAL REQUIRED BEFORE COMMIT.

## Phase 4 POS Enablement and Price Management — 2026-09-18

Final integration adds POS CREDIT receivables through the existing AR engine, FIXED/MANUAL/HYBRID pricing controls, explicit payment methods, barcode administration/lookup, and scoped POS stock-cache invalidation. Barcode was intentionally brought forward. Static validation passes; runtime/browser approval remains required.

Phase 18 forward corrective migration is applied to development. It preserves Phase 16/17 data and corrects hybrid overrides, pre-side-effect CREDIT validation, and void valuation using the original SALE_ISSUE movement costs/lots.

The HYBRID override reason transport/normalization correction is validated in development: authorized override, whitespace/missing rejection, unauthorized rejection, and configured HYBRID pricing all pass. Changed-cost void, receipt settlement/void, complete reporting/cache checks, and browser UI smoke validation remain pending; Phase 18 is not yet production-approved.

Final runtime validation is not approved: fresh-source API checks passed for BANK_TRANSFER, CARD, CREDIT, and MANUAL controls, but HYBRID authorized override still needs a focused reason-payload correction/rerun. Changed-cost void, receipt settlement, and browser smoke testing remain pending.

- **Implementation:** POS is now a normal configurable `CURRENT` feature; barcode remains `FUTURE`.
- **Price management:** Setup includes a separate Product Prices section backed by `sal.pos_product_price` and the `/api/pos/prices` API.
- **Pricing policy:** POS uses active server-authoritative configured prices. Missing prices block checkout. Existing manual Sales Order pricing remains unchanged; manual POS override is deferred.
- **Development runtime:** Feature classification and price CRUD/deactivation API validation passed. POS was restored disabled. The active `NB-CLEAN` price at `4,000.00` remains preserved pending confirmation of its origin; no price deletion or overwrite was performed.
- **Validation:** TypeScript PASS; frontend build PASS; backend build PASS; UI smoke test pending.
- **Status:** PHASE 4 POS ENABLEMENT AND PRICE MANAGEMENT COMPLETE — UI SMOKE TEST REQUIRED.

## Phase 19 Universal Customer Returns Foundation — 2026-09-20

The forward-only Customer Returns foundation is implemented and applied to development. It supports POS and delivery source records, return lines, RESTOCK/DAMAGED dispositions, posted `CUSTOMER_RETURN` movements, exact original movement-line valuation, controlled numbering, and return APIs/UI.

POS-linked AR direct voids are now blocked in both backend/database and frontend paths. AR invoice action feedback is reset when changing or closing invoice details. The active NB-CLEAN price at UGX 4,000 remains preserved.

**Status:** IMPLEMENTED IN DEVELOPMENT — RUNTIME/UI APPROVAL REQUIRED.

### Phase 19 Runtime Validation — 2026-09-20

The rollback-contained CASH partial/full return and cumulative over-return checks passed, including exact original lot and unit-cost preservation. Static validation passed again. Settlement analysis confirms that credit/refund handling is still a foundation only: `CREDIT_DUE` is recorded, but AR outstanding/status recalculation, paid-return refund settlement, return voiding, and damaged-goods quarantine are not implemented. Delivery/KAM and authenticated UI/report/cache validation remain pending. Production approval is blocked.

## Phase 19A Return Policy / Refund / Quarantine — 2026-09-20

Added and applied development-only migration `phase_20_return_policy_refund_quarantine.sql`. The repository had no formal return policy, so a conservative configurable business-level policy was added with 30-day default window, proof normally required, partial returns allowed, inspection required, manager exceptions, and no automatic restocking fee. Added reason/condition validation, controlled quarantine location, non-saleable routing, refund record foundation, Return Note API/print action, policy API, and quarantine read API.

**Status:** FOUNDATION IMPLEMENTED IN DEVELOPMENT — MONETARY SETTLEMENT, VOID/REVERSAL, RELEASE/WRITE-OFF, DELIVERY/KAM RUNTIME, AND UI APPROVAL REMAIN REQUIRED.

## Phase 19B Settlement and Reversal — 2026-09-20

Development-only settlement work is implemented: POS CREDIT returns now cap AR credit at current outstanding, excess becomes refund due, refund settlement posts balanced journals through configured payment accounts, and posted returns can be voided before refund with movement/journal reversals. Refund-after-settlement void is blocked. Original invoices and receipts remain preserved.

**Status:** IMPLEMENTED IN DEVELOPMENT — DELIVERY/KAM, DASHBOARD/CACHE, PRINT LAYOUT, AND AUTHENTICATED UI APPROVAL REMAIN REQUIRED.

## Phase 19C Acceptance — 2026-09-20

Database acceptance checks and static validation passed, including safe WRITE_OFF rejection. The blank-shell defect was corrected by hardening `AuthProvider.hasRole()` against missing/partial role arrays. The existing authenticated Vite session now renders Dashboard, Setup, and Customer Returns. That session targets an older port-3000 backend, while the current backend/API was verified on port 3001. No financial UI submissions were made. Phase 19 remains **NOT PRODUCTION READY — BLOCKERS REMAIN**.

## Phase 19D Return Policy UI — 2026-09-20

The Setup page now exposes the existing server-enforced Return & Refund Policy model and reuses the existing policy API. Policy fields are populated from the active development policy, validated client-side, and saved only through the permission-protected PATCH endpoint. Manual authenticated browser save/reload and unauthorized-role checks remain pending. The active NB-CLEAN price remains preserved. **NOT PRODUCTION READY — RUNTIME/UI APPROVAL REQUIRED.**

## Phase 19D Customer Return Corrections — 2026-09-20

The Customer Returns UI and route now use business document lookup, enforce remaining-returnable quantity in both UI and draft creation, expose explicit draft/post status and errors, preserve authoritative original quantity/price data, refresh affected query caches after posting, and print formatted POS thermal or Delivery/KAM A4 Return Notes. Controlled runtime acceptance for POS-20260920-000040, stock/accounting reconciliation, and print layouts remains pending. Existing development drafts were not auto-corrected; the active NB-CLEAN price remains preserved. **NOT PRODUCTION READY — MANUAL RETEST REQUIRED.**

The subsequent document-number lookup defect was also corrected: source identifiers are now resolved by `sale_no`/`delivery_no` before UUID source loading, with clear not-found responses and UUID backward compatibility. Exact POS-20260920-000040 and Delivery lookup retests remain pending. **NOT PRODUCTION READY — MANUAL RETEST REQUIRED.**

The Customer Return POST API empty-UUID defect was corrected after direct SQL confirmed the database function itself succeeds. The route now validates the return ID and normalizes optional authenticated-user UUID state instead of sending an empty string. RET-20260920-000020 API/browser posting, stock movement, journal, and final Return Note checks remain pending. **NOT PRODUCTION READY — MANUAL BROWSER RETEST REQUIRED.**

Phase 22 context hardening is applied in development. `sec.current_user_id()` now safely handles absent/empty context, and mutation routes set the valid `req.user.user_id` within the same transaction as posting. A controlled API return posted successfully with correct audit UUIDs, stock movement, lot/cost, and balanced journal. The earlier pre-fix draft remains historical NULL-audit test data and was not modified. **NOT PRODUCTION READY — MANUAL CUSTOMER RETURN BROWSER RETEST REQUIRED.**

## Phase 0 Restrictions
- Do not start Phase 1.
- Do not change frontend business logic.
- Do not change backend business logic.
- Do not change database schema.
- Do not create or apply migrations.
- Do not deploy.
- Do not restart production services.
- Do not alter accounting, posting, AR, AP, inventory, sales, purchasing, or reporting behavior.

## Phase 19D Reports and AR SQL Syntax Regression Fixes — 2026-09-21

Fixed the `dormant_status`, `segmented`, and AR summary `AS` PostgreSQL parser errors in the working tree. Direct development PostgreSQL execution passed for all requested report statements and the AR summary, with expected report/AR response fields. POS and Delivery remain combined through `reporting.v_sales_event_lines`; customer-return event reporting was not removed or redesigned. Backend build, frontend TypeScript, and frontend build passed. Authenticated browser/API retest remains required because the available local browser session is at the login screen and no credentials were supplied. **NO DEPLOYMENT; NO COMMIT; PRODUCTION UNTOUCHED.**
## Phase 19D Delivery Return Lookup and Customer Returns History — 2026-09-21

Delivery return source eligibility now follows the existing Delivery posting model and successfully resolves `DEL-20260914-104214` in development SQL validation. Customer Returns now includes aggregate summary cards, searchable/filterable history, return detail, authoritative return values, refund fields, disposition/mixed handling, and quarantine markers. Authenticated browser/API validation remains pending. **NO DEPLOYMENT; NO COMMIT; PRODUCTION UNTOUCHED.**
Phase 23 corrected the fully paid Delivery return journal imbalance in development. `RET-20260921-000026` now posts with one UGX 2,200 REFUND_PAYABLE credit, AR remains PAID, refund remains DUE, and the RESTOCK movement/journal are balanced. **NOT PRODUCTION READY — MANUAL DELIVERY RETURN RETEST REQUIRED.**

The Customer Return Details and Authorized Refund UI is implemented in the working tree. View and double-click open the same details dialog; refund processing is permission-gated and uses the existing backend settlement workflow. **NOT PRODUCTION READY — MANUAL REFUND RETEST REQUIRED.**

## Phase 25 — Multi-Branch Operations Foundation — 2026-09-22

Phase 24 is retained. Phase 25 added one KAM default branch in development, preserved and assigned existing location IDs, created branch/user mapping, shared branch/location context, branch selector shell, branch APIs, selected order/finance branch dimensions, and a source-branch transit transfer foundation. Development migration applied to `kam_grains_db`; production untouched. Sales Orders and Purchase Orders have branch-filtered reads and branch-aware creation. Broader legacy route/report coverage and branch administration UI are incomplete. POS A/B, Delivery, AR/Receipt, GRN/AP, returns/refunds, inventory controls, transfer conservation, finance, consolidated reporting, authorization matrix, browser testing, and single-branch/Phase 4 regressions remain unvalidated. **PHASE 5 NOT COMPLETE — NOT READY FOR USER APPROVAL. NO DEPLOYMENT; NO COMMIT.**
# Phase 5 — Multi-Location Foundation (2026-09-22)

- **Implementation:** Initial foundation in the working tree; additive migration, location attributes, default and user-location mapping, scoped POS/inventory validation, and Setup type/saleable fields are present.
- **Soft limit:** 50 active non-system locations per company by default; profile value can be overridden for future subscription editions.
- **Compatibility:** FG_STORE and RETURN_QUARANTINE IDs/history are preserved; RETURN_QUARANTINE is flagged system-managed and non-saleable.
- **Existing location inspection:** Read-only inspection found seven locations (CLEANING_AREA, DISPATCH, FG_STORE, MAIN_STORE, RAW_STORE, RETURN_QUARANTINE, WASTE_AREA), only the five legacy columns, no `company_id`, and no `sec.user_location`. POS previously resolved the first active location when omitted; the migration chooses FG_STORE as the business default when present.
- **Database safety:** The configured target reports database `kam_grains_db` on localhost but is not identified as development. No migration or test data was applied.
- **Static validation:** Frontend TypeScript/build, backend build, and `git diff --check` PASS (2026-09-22).
- **Development runtime:** Migration, rollback-only soft-limit/quarantine checks, and authenticated Locations API smoke passed. Full POS/operational matrix and browser UI remain pending.
- **Pending:** Shared current-location context, report/dashboard filters, transfer workflow, user assignment screen, and read-list scope review. Production untouched; no deployment or commit.

## Dashboard branch-scoping acceptance fix — 2026-09-22

`GET /api/dashboard/summary` now uses the validated active branch and branch-scoped source queries; HEAD_OFFICE remains subject to `VIEW_ONLY` and receives the selected branch only. Dashboard follows shared operating context and refetches on branch changes. No new migration was required. Static checks and authenticated API/browser acceptance status are tracked in `docs/TEST_LOG.md`; manual Dashboard retest is still required. Production untouched; no deployment or commit.

### Location query acceptance defect — 2026-09-22

The joined locations SELECT now qualifies every location field, removing the reported PostgreSQL ambiguity; existing branch/location authorization is preserved. Read-only execution of the fixed SQL returned seven rows for the supplied account/branch scope. The UI auto-selects only an authorized available location and displays a controlled Setup-directed message when none is available. Authenticated HTTP and Dashboard browser retests remain outstanding; see `docs/TEST_LOG.md`.


## Phase 5 Acceptance — Runtime, Security and Regression (2026-09-22)

**Status: IN PROGRESS — NOT ACCEPTED.** The rollback-contained database fixture check proves temporary A/B scope membership and branch-owned stock rows only. Static code review/builds pass. Authenticated API and browser workflow matrix is pending. Any remaining unscoped legacy/consolidated reports and GRN variance retain their existing role gates while branch-safe scopes are unavailable. See `docs/TEST_LOG.md` for test-by-test status and a manual browser checklist.

Additional hardening adds server-side branch/location guards to legacy inventory, counts, adjustments, cleaning, deliveries, GRNs, AR/AP, finance, POS, and customer-return routes. AR and AP payment applications verify source invoice branch/location. The shared context middleware also rejects inactive requested/default branches. HEAD_OFFICE remains subject to endpoint permission checks. Expense vouchers and payment headers persist branch IDs. The Setup branch access panel reuses branch/location administration APIs. These changes have not been exercised through authenticated UI/API workflows.

### Phase 5 reporting/finance + POS A/B acceptance — 2026-09-22

**Status: IN PROGRESS — NOT ACCEPTED.** Added selected-branch query scopes for the approved Finance reports and seven weekly reporting endpoints, exposed source branch on the unified sales-event view, and attributed POS posting/reversal journals to the POS location branch. POS location resolution and product stock are scoped to the selected branch/location, and sale lookup rejects cross-branch access. Direct development-database SQL checks pass for the listed Finance and weekly-report queries, but there is only one active branch and no authenticated browser/API session for genuine Branch A/B POS acceptance. Customer-concentration and other non-whitelisted consolidated reports remain HEAD_OFFICE-gated. P&L classification remains constrained by the shared chart of accounts; see `docs/TEST_LOG.md` and `docs/DECISIONS.md`. No production deployment or commit was made.
# Phase 5 authenticated A/B acceptance — 2026-09-22

**IN PROGRESS — NOT ACCEPTED.** A second development-only branch and real authenticated A/B API sessions were created and exercised. Dashboard, Finance, seven weekly reports, POS, returns/refunds, transfer, stock count/adjustment and A sales/AP purchasing workflows have substantial API coverage. Browser verification, cleaning, Head Office/consolidated access, complete post-transaction consolidated finance reconciliation, cross-branch AP document retrieval checks, Credit POS, Return Policy, and frontend build completion remain pending. See `docs/TEST_LOG.md`. Phase 31 fixes PUR journal branch attribution on the configured development database. Test branch B should be retained temporarily for final approval. Production remains untouched; no deployment or commit.
## Phase 5 Extension — 2026-09-22

- Implementation: cross-branch stock visibility, Internal Stock Requests, partial/multiple transfers, explicit variance, transfer screens, branch procurement policy and PO approval are implemented.
- Authenticated development API acceptance passed for visibility versus transaction authorization, partial approval/fulfillment, transfer state/actors, duplicate-post protection, procurement modes, audit, valuation invariance and no GL journals.
- Static validation: backend syntax/build and frontend TypeScript/build passed.
- Pending: authenticated browser acceptance, reverse Head Office request direction, and explicit inventory category filter. A partial-delivery variance remains explicitly in transit in development.
- No production access/deployment or commit. Runtime approval required.
## Phase 5 Final Closure — 2026-09-22

The Inventory page now includes a Category selector sourced from the existing product-category model and combined with branch, location and search filters. Backend/static validation passes. Codex browser inspection found no tabs or authenticated session, so browser workflows remain pending. Reverse Head Office request and explicit transit-remainder UX acceptance also remain pending. Production untouched; no deployment or commit.
## Phase 5 Final Acceptance Update — 2026-09-22

Transfer variance closure was tightened: unresolved RECEIVED_WITH_VARIANCE transfers can receive only their remaining transit quantity, and the Transfer Detail UI makes dispatched, received, remaining in transit, variance, reason, status, actors and timestamps explicit. Reverse Head Office API acceptance could not be completed because the temporary development API process was unavailable; browser acceptance remains pending because no authenticated browser session exists. No production access, deployment or commit.
## Phase 5 Frontend Completion — 2026-09-22

Stock Request and Inter-Site Transfer pages are routed, sidebar-visible and permission-gated. Transfer detail now exposes remaining transit and supports controlled later receipt for RECEIVED_WITH_VARIANCE. Static validation passes. Reverse HQ runtime acceptance and all browser workflows remain pending because no authenticated browser session was available and the temporary API process was unavailable during the final scripted attempt. Production untouched; no deployment or commit.
## Authentication Timeout Fix — 2026-09-22

The reported login timeout was caused by frontend/.env.local targeting localhost:3001 while the backend is configured for localhost:3000. The frontend base URL now matches the backend. Direct HTTP login returned 200 in approximately 4.8 seconds; browser retest remains pending because no authenticated browser session was available. Production untouched; no deployment or commit.
## Phase 5 Source-Lot Selection Fix — 2026-09-22

The Internal Stock Request transfer form no longer mixes the current KAM operating location with a selected TEST_B source branch. Source locations are branch-scoped and stale selections clear on branch changes. Multi-lot source allocation is supported in the UI; backend revalidation remains authoritative. Development NB-CLEAN stock is currently in KAM Clean Beans Store, not TEST_B, so the exact TEST_B transfer remains pending. Production untouched; no deployment or commit.
## Phase 5 Transfer Detail UI Correction — 2026-09-23

Transfer detail presentation now normalizes quantity precision, formats costs, separates table columns, labels receive inputs explicitly, and displays readable actors/statuses/reasons/timestamps. Static validation passes. Manual transfer display retest remains pending; no production changes, deployment, or commit.
## Phase 5 Request Direction UI Fix — 2026-09-23

Internal Stock Requests now make direction explicit in creation, history and detail views. Branch/location authorization remains backend-enforced. Static validation passes; manual reverse-HQ and opposite-direction request retests remain pending. Production untouched; no deployment or commit.
## Phase 6 Configurable VAT / Tax Engine — 2026-09-24

The Phase 6 tax foundation is implemented in the working tree and applied to local development only. It includes effective-dated Uganda tax codes, company settings, feature gating, product classification fields, snapshot columns, tax APIs, reports foundation, decimal formula utilities, and static/unit evidence. Tax remains disabled. Tax-aware GL posting, returns reversal, complete operational UI totals, authenticated runtime tests, and browser acceptance are still required before activation.
## Phase 6B VAT Accounting Integration — 2026-09-24

Phase 6B adds configured VAT account mappings, activation prechecks, tax-aware AR/AP journal functions, POS snapshots and output VAT adjustment, credit-POS duplication protection, and customer-return original tax snapshots. The engine remains disabled because existing active products require classification. Authenticated transaction/branch reconciliation and manual browser acceptance remain outstanding.

Phase 6C UI correction adds a clearly labelled Product Tax Classification control in Setup, activation-readiness blockers, backend validation of selected effective tax codes, tax metadata on POS/price product responses, and Quick Sale Taxable Value/VAT/Total display. `PHASE5-AB-TEST` was not automatically classified; the required normal-UI assignment and controlled VAT retest remain pending. Production is untouched; no deployment or commit was performed.
## Phase 6C final VAT configuration UX — 2026-09-24

Selling Price Management now includes a Tax Treatment editor, and Tax Rate Management is administrator-only and effective-dated. Uganda STANDARD remains an 18% seed configuration, not transaction logic. Future periods resolve by code/date without product reassignment; active overlaps are rejected and posted snapshots remain unchanged. Migration 38 is present in the working tree and must be applied through the normal migration process before relying on database-level overlap enforcement.

## Phase 6C Automated VAT Runtime Acceptance — 2026-09-24

Migration 38 overlap enforcement was also applied and verified on the local development database; the final VAT state remains disabled with 7 saleable and 11 purchasable products unclassified.

Phase 6D corrects tax-save UX by requiring explicit Save Tax confirmation and refreshing dependent React Query data. Quick Sale quantity editing now supports fractional keyboard entry, cart-line tax indicators, and an ordered checkout summary/payment flow. Existing POS accounting, inventory, lot/cost, branch/location, and tax snapshot behavior remains unchanged. Manual authenticated browser acceptance is still required.

Rollback-contained POS/AR/AP VAT accounting acceptance passed on local development data. All temporary configuration and transactions were rolled back. Activation remains blocked by 7 unclassified active saleable and 11 unclassified active purchasable products. VAT and the tax feature are disabled. Authenticated CREDIT POS, returns/refunds, branch A/B, and manual browser acceptance remain pending.

## Payment channels — 2026-09-24

Payment channel foundation hardening is implemented in development only. Manual mode, scoped channel selection, provider-neutral payment transactions, lifecycle events, idempotency, reference uniqueness, and permissions are present. All existing channels remain safe unless an authorized user explicitly enables manual collection. No provider integration, live mode, deployment, or commit was performed. Exact MTN, Airtel, Card, Bank Transfer, Cash, Credit, duplicate-reference, inactive-channel, and branch/location browser acceptance remains required.
