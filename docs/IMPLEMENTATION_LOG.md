# Implementation Log

## 2026-09-18 — Phase 1 Universal Business Configuration / Branding

- **Status:** Implemented; runtime/API/UI and database validation remain required before approval.
- **Files inspected:** Existing server/routes/middleware, frontend API/types/auth/layout/login/Setup, print pages, migration directory, and Phase 0 documentation.
- **Files changed:** `database/migrations/phase_11_business_profile.sql`, `backend/src/routes/businessProfile.routes.js`, `backend/src/server.js`, business-profile frontend API/types/hook, shell/login/Setup, print branding references, and Phase 1 documentation.
- **Database change:** Added `timezone text NOT NULL DEFAULT 'Africa/Kampala'` only when absent; normalized the existing active KAM GRAINS profile to `KAM GRAINS SUPPLIES` / `KAM GRAINS`.
- **Authorization:** PATCH uses existing authenticated `EDIT_SETUP` permission; GET is fallback-safe for login branding.
- **Validation:** Frontend TypeScript, frontend production build, backend build, and `git diff --check` passed after the final correction. No deployment or service restart performed.

### Automated Runtime Validation — 2026-09-18

- Exercised the actual Express route over HTTP against the real development PostgreSQL database `kam_grains_db`.
- Exercised the existing JWT authentication middleware and `EDIT_SETUP` permission middleware.
- Confirmed migration state, GET contract, unauthorized/authorized PATCH behavior, partial update behavior, protected-field rejection, empty-value validation, fallback values, and cleanup restoration.
- Temporary validation scripts were removed. Production was not touched.
- **Phase 1 status:** RUNTIME VALIDATION PASSED — UI SMOKE TEST PENDING

## 2026-09-18 — Phase 2 Product Model Inspection

- Inspected the real development PostgreSQL schema, constraints, indexes, foreign keys, migrations, backend routes/services, frontend consumers, and reporting dependencies.
- Confirmed one primary `inv.product` table and one simple `inv.uom` table; no conversion model exists.
- Recorded the additive, backward-compatible product-foundation recommendation in `docs/PHASE2_PRODUCT_MODEL_INSPECTION.md`.
- Recorded the future 80 mm thermal POS receipt requirement in ADR-0011.
- **Status:** Inspection complete; no schema, migration, workflow, deployment, or commit performed.

## 2026-09-18 — Phase 2 Minimal Universal Product Foundation

- **Migration:** Created `database/migrations/phase_12_universal_product_model.sql` with additive `inv.product_category` and nullable/defaulted product metadata fields.
- **Backend:** Extended existing product CRUD responses and added `/api/product-categories` CRUD using existing setup permissions.
- **Frontend:** Extended product contracts/API functions and Setup product administration with description, category, purchasable, and stock-item fields.
- **Runtime validation:** Real Express + development PostgreSQL integration suite passed, including cleanup and compatibility endpoint checks.
- **Static validation:** Frontend TypeScript/build, backend build, and `git diff --check` passed.
- **Status:** Implementation complete; runtime/UI approval required before commit. No deployment or commit performed.

## 2026-09-18 — Phase 2 UI Regression Fix

- Diagnosed React error #185 as an unstable business-profile object identity feeding the Setup profile synchronization effect.
- Applied the smallest correction by memoizing the merged profile in `useBusinessProfile()`.
- Static validation passed. Browser UI smoke validation remains pending because the local browser automation tab could not attach.
## 2026-09-17 â€” Phase 0 Documentation Baseline

- **Phase:** Phase 0 â€” Platform Transformation Baseline
- **Date Started:** 2026-09-17
- **Date Completed:** 2026-09-17
- **Objective:** Establish documentation, architecture baseline, validation records, Git discipline, backup requirements, and roadmap before platform transformation.
- **Scope:** Documentation and non-destructive baseline verification only.

### Files Inspected
- Repository root
- `frontend/package.json`
- `backend/package.json`
- `frontend/src`
- `backend/src`
- `database/migrations`
- `.gitignore`
- Git branch/status
- Existing Phase 0 documentation draft

### Files Changed
- `docs/PLATFORM_ROADMAP.md`
- `docs/IMPLEMENTATION_LOG.md`
- `docs/ERROR_LOG.md`
- `docs/CODEX_PROMPTS.md`
- `docs/DECISIONS.md`
- `docs/TEST_LOG.md`
- `docs/DEPLOYMENT_LOG.md`
- `docs/CURRENT_STATUS.md`

### Database Objects Inspected
- PostgreSQL usage and schema organization recorded.
- Detailed database object inspection: NOT RUN in Phase 0 documentation correction.

### Database Objects Changed
None.

### Migration Files
None created, edited, or applied.

### Implementation Summary
Established the Phase 0 documentation baseline and future platform transformation roadmap while preserving the current KAM GRAINS ERP as the stable production reference system.

### Important Decisions
- Preserve KAM GRAINS as reference tenant.
- Preserve existing Sales Order â†’ Delivery â†’ AR Invoice â†’ Receipt workflow.
- Add POS as a complementary path later.
- Keep delivery-based reporting authoritative for the existing workflow.
- Target one configurable codebase across industries.
- Target responsive web/PWA as primary client.
- Target database-per-business tenancy later.
- Use approved stored translations rather than runtime AI translation.

### Recent Completed Fixes Recorded
1. Frontend TypeScript cleanup and clean build.
2. AR backdated receipt audit fix involving `NEW.delivery_id`.
3. AR Invoice Receipt History.
4. Excel export header visibility fix.
5. AP partial-payment calculation fix.
6. AP Apply-button regression fix.
7. TanStack Query invalidation improvements and runtime refresh confirmation.

### Validation Performed
- Git branch/status: confirmed `main`, tracking `origin/main`.
- Repository hygiene: PASS based on current `.gitignore`.
- Frontend TypeScript: PASS
- Frontend production build: PASS
- Backend build: PASS

### Build Results
- Frontend TypeScript: PASS
- Frontend Build: PASS
- Backend Build: PASS

### Runtime Results
NOT RUN as part of Phase 0 documentation correction.

### Regression Results
Historical runtime fixes are recorded, but Phase 0 regression matrix execution is NOT RUN.

### Deployment Status
No deployment performed.

### Git Commit
Pending review.

### Commit Hash
PENDING

### Known Issues
- No blocking issues remain for Phase 0.
- Full runtime regression matrix remains to be executed incrementally as future phases begin.

### Follow-up Work
1. Create the Phase 0 Git checkpoint.
2. Record the resulting commit hash.
3. Begin Phase 1 planning.
4. Keep Phase 1 implementation separate from the Phase 0 checkpoint.

## 2026-09-18 — Phase 3 Minimal Feature Configuration

- **Status:** Implemented; runtime/API validation passed; authenticated browser UI smoke validation remains required before approval/commit.
- **Files changed:** Phase 3 migration, backend feature service/route/server mount, frontend feature types/API/hook, navigation, route guard, Setup feature panel, and documentation.
- **Architecture:** Generic `app.feature` catalogue plus `app.company_feature` overrides; `business_type` remains descriptive metadata.
- **Catalogue:** Sales, purchasing, inventory, cleaning, finance, and reports enabled for KAM; POS and barcode seeded as future disabled placeholders.
- **Authorization/audit:** Existing `EDIT_SETUP` remains the mutation permission; feature changes use existing `audit.event` with old/new values, company, feature, user, and timestamp.
- **Transaction safety:** No transaction tables, posting logic, permission tables, or business calculations changed.
- **Deployment/commit:** No deployment, production restart, or commit performed.

## 2026-09-20 — Phase 19D Customer Return UI / Post / Return Note Corrections

- Confirmed and corrected the five reported defects: UUID-only source input, weak invalid-quantity UI control, incomplete post feedback, incorrect draft `original_sale_qty`, and raw JSON Return Note output.
- Customer Return source lookup now accepts posted POS sale numbers and Delivery numbers while retaining UUID compatibility. Draft creation resolves the source line and enforces requested quantity against remaining returnable quantity before inserting authoritative sold quantity and unit price.
- Customer Returns now shows a responsive source-line table, consistent quantity/money formatting, explicit DRAFT/POSTED states, visible draft/post errors, duplicate-click guards, cache invalidation, and preview/print behavior.
- Added customer-facing printable layouts: compact 80mm POS Return Note and Delivery/KAM A4 Return Note. Internal IDs, costs, COGS, and journal IDs are not printed.
- No historical drafts were auto-corrected. No deployment, production restart, or commit performed.

## 2026-09-20 — Phase 19D Document-Number Source Lookup Correction

- Confirmed the runtime defect where `POS-20260920-000040` reached UUID-typed source loading and produced a PostgreSQL invalid-UUID error.
- Added safe identifier resolution: POS document numbers use `sal.pos_sale.sale_no`; Delivery document numbers use the existing `sal.delivery.delivery_no`; UUIDs remain backward-compatible only after format validation.
- Preserved POSTED eligibility and returnable-line logic. Unknown or non-POSTED sources now return clear source-specific 404 messages instead of raw UUID-cast errors.
- No frontend search redesign, deployment, production restart, or commit performed.

## 2026-09-20 — Phase 19D Customer Return POST UUID Correction

- Confirmed direct SQL posting succeeds with a valid return UUID; the API route was the failing layer.
- Corrected `POST /api/customer-returns/:id/post`: validate the required return UUID, normalize optional authenticated-user UUID state, never pass an empty UUID string, and sanitize user-facing database errors while logging server-side details.
- Preserved the existing `sal.post_customer_return(uuid)` function and all return, stock, accounting, pricing, and document-number fixes.
- No deployment, production restart, or commit performed.

## 2026-09-20 — Phase 19D Current User UUID Session Context Hardening

- Inspected the live `sec.current_user_id()` definition and confirmed it directly cast `current_setting('app.current_user_id', true)` to UUID.
- Added forward migration `phase_22_current_user_context_hardening.sql`: absent, empty, and whitespace-only settings now return NULL; valid UUIDs remain unchanged.
- Confirmed the authoritative authenticated property is `req.user.user_id`, populated into JWTs by `auth.routes.js`.
- Added shared backend UUID/context helpers and transaction-scoped context setup for Customer Return post/refund/void and POS mutation routes. Empty/invalid authenticated IDs now produce an authentication/session error rather than an empty UUID.
- Development tests passed for absent/empty/whitespace/valid context values. A controlled API POST posted a 0.050 NB-CLEAN return with authenticated `posted_by` and stock `created_by`, original lot/cost preserved, and a balanced 330/330 journal.
- The earlier pre-fix development post `RET-20260920-000021` is historical test data with NULL audit fields; it was not auto-corrected.

## 2026-09-20 — Phase 19D Return Policy UI Exposure

- Added the missing **Return & Refund Policy** section to Setup using the existing `GET /api/return-policy` and `PATCH /api/return-policy` endpoints. No duplicate API or schema was created.
- Exposed the implemented policy fields: enabled state, return window, proof/receipt rules, inspection, partial/damaged/change-of-mind rules, original-method refund, customer credit, exchange, manager approval, restocking fee and percentage, refund processing days, and notes.
- Added frontend validation for non-negative whole-day values and a 0–100 restocking fee percentage. Edit controls and save action are role-gated with the existing Setup edit roles; backend permissions remain authoritative.
- Browser save/reload acceptance remains pending manual confirmation. No policy values, active NB-CLEAN price, deployment, production restart, or commit were changed.

## 2026-09-20 — Phase 19D Frontend Recovery

- Diagnosed the blank authenticated shell to an unsafe `AuthProvider.hasRole()` assumption that `user.roles` was always an array.
- Hardened the role guard with an empty-array fallback; no permissions were broadened.
- Existing authenticated Dashboard, Setup, and Customer Returns pages now render.
- Current backend source lookup returned HTTP 200 on port 3001. The pre-existing authenticated browser origin still targeted an older port-3000 backend returning HTTP 404, so financial UI acceptance remains pending.

## 2026-09-20 — Universal Customer Returns Foundation

- Added forward migration `database/migrations/phase_19_universal_customer_returns.sql`, applied to development only.
- Added `sal.customer_return` and `sal.customer_return_line` with POS/DELIVERY source typing, controlled numbering, DRAFT/POSTED/VOID statuses, RESTOCK/DAMAGED disposition, exact original lot/price/cost capture, and return quantity enforcement.
- Added `sal.post_customer_return` using existing stock movement and finance journal primitives. POS COGS now reads posted movement-line cost, and the reporting event view includes posted returns as negative sales/COGS events.
- Added `/api/customer-returns` source lookup, draft creation, detail, and post endpoints with return permissions.
- Added the Customer Returns frontend route/page and navigation entry.
- Added backend and frontend protection against independent voiding of POS-linked AR invoices, plus AR modal feedback reset behavior.
- Development rollback evidence confirmed exact original POS lot and unit cost reuse. Full authenticated/UI transaction matrix remains pending.

### Phase 19 Runtime Validation — 2026-09-20

- Rollback-contained CASH POS validation posted partial and remaining returns, preserved the original lot and exact movement-line cost, and rejected a cumulative over-return.
- The database guard, static TypeScript/build checks, and repository whitespace checks passed.
- Settlement analysis found that the current foundation records `CREDIT_DUE` but does not recalculate AR outstanding/status; paid and partially paid credit returns therefore remain intentionally unimplemented.
- Cash refund settlement, return voiding, quarantine/damaged-location handling, delivery/KAM runtime validation, authenticated UI feedback testing, report/dashboard verification, and cache-refresh verification remain open.
- `POS-20260918-000019` was inspected but not repaired. NB-CLEAN UGX 4,000 remains untouched.

## 2026-09-20 — Phase 19A Return Policy / Refund / Quarantine Foundation

- Repository inspection found no formal configurable return/refund policy, refund settlement table, Return Note document, or quarantine location.
- Added forward migration `database/migrations/phase_20_return_policy_refund_quarantine.sql` and applied it to development only.
- Added business-level configurable policy, customer-return reason catalogue, condition fields, QUARANTINE/WRITE_OFF dispositions, controlled `RETURN_QUARANTINE` location, refund numbering/table foundation, and non-saleable movement routing.
- Added server-side policy/reason validation, manager exception fields, quarantine management read API, Return Note data API, policy API, and Return Note print action foundation.
- Rollback-contained quarantine validation preserved original lot and unit cost while routing returned quantity to `RETURN_QUARANTINE`.
- Formal monetary refund journal settlement, AR balance adjustment, return voiding, quarantine release/write-off, DELIVERY/KAM runtime matrix, and authenticated UI approval remain open where existing primitives are insufficient.

## 2026-09-20 — Phase 19B Return Settlement and Reversal

- Added forward migration `database/migrations/phase_21_return_settlement_reversal.sql` and applied it to development only.
- Added capped AR credit adjustments for POS CREDIT returns, preserving original invoices and receipts. AR is never reduced below zero; excess becomes refund due.
- Added `REFUND_PAYABLE` account mapping, atomic refund settlement function with RFD numbering, partial/final refund handling, configured payment-account posting, and refund listing API.
- Added posted-return void/reversal function with exact movement-cost reversal, journal reversal, source returnability restoration, and refund-after-settlement blocking.
- Development rollback tests passed for unpaid partial credit, fully paid refund due, partial/final refund settlement, overpayment rejection, cash return, quarantine routing, and void-before-refund.
- Delivery/KAM runtime, dashboard/cache/browser layouts, and full authenticated UI approval remain pending.

## 2026-09-20 — Phase 19C Final Runtime/UI Acceptance

- Safe WRITE_OFF rejection was revalidated transactionally; no inventory or accounting side effect persisted.
- Backend/database settlement, refund, reversal, quarantine, and static checks remain validated in development.
- Browser acceptance was attempted against the local backend and Vite frontend. The backend health JSON loaded, but the Vite frontend rendered blank without a usable authenticated UI tree; required UI/KAM/dashboard/cache/Return Note acceptance is therefore NOT RUN.
- Phase 19 is classified **NOT PRODUCTION READY — BLOCKERS REMAIN**.

## 2026-09-18 — Phase 4 Step 1 POS Architecture Inspection

- **Status:** Inspection and design-gap analysis complete; implementation approval required.
- **Result:** Confirmed the existing delivery-centered sales lifecycle, inventory lot enforcement, AR/payment boundaries, feature-flag state, responsive frontend foundation, thermal-print gap, reporting joins, and POS dependencies.
- **Recommendation:** Add a dedicated online POS sale path with atomic stock/accounting posting, optional walk-in customer state, controlled pricing, explicit payment mapping, dedicated 80 mm receipt output, feature/permission gating, idempotency, and reversal-based voids.
- **Files changed:** Documentation only: `docs/PHASE4_POS_INSPECTION.md`, roadmap, implementation log, current status, decisions, and prompt log.
- **Files/code not changed:** No backend code, frontend code, database schema, migration, posting logic, deployment artifact, or production service.
- **Deployment/commit:** No deployment, restart, or commit performed.

## 2026-09-18 — Phase 4 Step 2 Minimal POS Foundation

- **Status:** Implemented in the working tree; runtime API validation passed; UI smoke approval required before commit.
- **Migration:** `database/migrations/phase_14_pos_foundation.sql`, applied to development `kam_grains_db` only.
- **Database objects:** `sal.pos_sale`, `sal.pos_sale_line`, `sal.pos_product_price`, `sal.pos_sale_no_seq`, POS numbering/posting/void functions, and `reporting.v_sales_event_lines`.
- **Backend:** Feature-gated/permissioned POS product, price, sale, retrieval, and void endpoints. Posting uses existing inventory movement and finance journal primitives atomically.
- **Frontend:** Feature-gated `/pos` route, Quick Sale page, cart/checkout, double-submit protection, and dedicated 80 mm thermal receipt renderer.
- **Reporting:** Weekly sales, profit, management summary, customer performance, and customer concentration now use the explicit delivery-plus-posted-POS event view. Walk-in sales remain excluded from customer-specific metrics when `customer_id` is null.
- **Temporary pricing rule:** POS accepts only an active server-side `sal.pos_product_price`; the client cannot submit an arbitrary unit price. A full pricing engine remains deferred.
- **Payment scope:** CASH, BANK, and MOBILE_MONEY using existing posting setup keys. CARD, split tender, and new account mappings were not added.
- **Validation:** Development API tests passed for feature gating, authentication, permissions, product search, cash sale, named-customer multi-line sale, invalid quantity, insufficient stock, idempotency, retrieval, stock movement, balanced journal, reporting endpoints, and reversal void.
- **Deployment/commit:** No deployment, production restart, or commit performed.

## 2026-09-18 — Phase 4 Final POS Integration

## 2026-09-18 — Phase 18 Forward POS Corrections

### HYBRID Override Reason Correction

- Root cause: the POS form omitted `price_override_reason`; line-level backend reasons were also not explicitly trimmed before persistence.
- Correction: added the HYBRID-only frontend reason field and payload mapping, retained the configured price for override detection, and normalized/persisted the trimmed reason in the route.
- Development evidence: authorized 4,000-to-3,800 override posted successfully with `Negotiated wholesale price`; whitespace-only/missing and unauthorized cases were rejected; journal debits and credits both totaled 640.00.
- Phase 18 remains open for void, receipt, reporting/cache, and browser smoke validation.

- Phase 16 and 17 had already been applied to development/local production state; no rollback or destructive migration was used.
- Added and applied `database/migrations/phase_18_pos_integration_corrections.sql` as a forward migration. It replaces `sal.post_pos_sale` and `sal.void_pos_sale` with corrected pricing, CREDIT validation, CARD mapping, credit-AR safety, and exact original-movement-cost reversals.

- Added POS cache refresh after posting, configurable FIXED/MANUAL/HYBRID pricing, server-side price authorization/audit fields, CREDIT sales backed by existing AR open items, CARD/BANK_TRANSFER terminology, barcode administration and keyboard-wedge lookup.
- Added `database/migrations/phase_16_pos_final_integration.sql` and `database/migrations/phase_17_pos_credit_void_fix.sql`; both were applied to development only. Barcode was intentionally brought forward from the former Phase 6 position.
- Runtime credit testing was blocked by a development database hang during the stock/location test and is not marked complete until manual UI approval.

## 2026-09-18 — Phase 4 POS Enablement and Product Price Management

- **Status:** Implemented in the working tree; development API validation passed; authenticated browser UI smoke validation remains required.
- **Feature correction:** POS was previously non-editable because Phase 3 classified it as `FUTURE`. A new idempotent migration changes only POS to `CURRENT`; barcode remains `FUTURE`. KAM's company override remains disabled by default.
- **Price model:** Reused `sal.pos_product_price` with its product FK, unique product key, authoritative `unit_price`, active flag, audit user fields, and timestamps. No duplicate price table was created.
- **API:** Added price list, single-product read, create, update, PUT compatibility, and safe deactivate endpoints under `/api/pos/prices`, protected by authentication, POS feature state, and `EDIT_SETUP` for mutations.
- **Frontend:** Added a separate Product Prices section to Setup using the business profile currency; configured prices can be created, edited, and deactivated.
- **Pricing behavior:** POS continues to use active server-side configured prices only. Missing prices block checkout. Existing Sales Order manual price entry was not changed. Manual POS override was deferred.
- **Deployment/commit:** No deployment, production restart, or commit performed.





- **Phase 3 Step 1 — Feature flags/business profiles inspection (2026-09-18):** Completed capability inspection and design-gap analysis only. Findings and recommended architecture are recorded in `docs/PHASE3_FEATURE_FLAGS_INSPECTION.md`. No schema, migration, code gating, POS work, deployment, or commit performed.
## 2026-09-21 — Phase 19D Reports and AR SQL Syntax Regression Fixes

  Corrected three development SQL parser defects without changing report design or AR behavior: added missing CTE commas before `dormant_status` and `segmented`, removed the duplicated RFM `CASE`, and corrected the AR summary `GROUP BY` expression while preserving the `pos_sale_no` response field. Direct PostgreSQL execution passed for all seven requested report queries and the AR summary; unified `reporting.v_sales_event_lines` usage and customer-return reporting paths were preserved. No deployment or commit performed.
## 2026-09-21 — Phase 19D Delivery Return Lookup and Customer Returns History

Customer Returns Delivery lookup now resolves document numbers and accepts the existing completed Delivery model (`DELIVERED`, `is_posted = true`, `posted_movement_id` present), while excluding void/cancelled sources. The existing POS source, returnability, posting, settlement, reversal, costing, quarantine, and current-user context paths were preserved.

Added aggregate Customer Returns history and summary support to the existing route/page. History joins customer/operator data and aggregates authoritative return value, refund values, line count, primary/mixed disposition, and quarantine presence without per-row detail queries. Added compact filters, summary cards, row actions, and a detail view. No deployment or commit performed.
## 2026-09-22 — Phase 23 Return Settlement Journal Fix

Added and applied forward migration `database/migrations/phase_23_return_settlement_journal_fix.sql` in development only. `sal.post_customer_return` owns return stock plus sales/COGS foundation accounting; `sal.finalize_customer_return_settlement` owns invoice-linked AR/refund settlement. `RET-20260921-000026` posted successfully with refund due UGX 2,200, refund settled UGX 0, invoice PAID, one RESTOCK movement, and balanced journal totals of UGX 4,000. No reporting view, receipt, production database, deployment, or commit was changed.

## 2026-09-22 — Customer Return Details and Authorized Refund UI

Added a shared Return Details dialog opened by the history View button or desktop row double-click. The dialog shows return metadata, lines, financial totals, normalized refund status, journal/stock identifiers, void rules, and refund history. Added a controlled partial/full refund form using the existing settlement API and `PROCESS_REFUND` permission model; no second refund engine or GL-account selector was introduced. Backend detail output now includes AR reduction and named refund processor data. Manual UI/refund acceptance remains pending.

## 2026-09-22 — Phase 25 Multi-Branch Operations Foundation

Added forward migration `phase_25_multi_branch_operations.sql` and applied it only to documented development database `kam_grains_db`. It creates one KAM HEAD_OFFICE branch, links the existing seven location IDs to it, adds one non-saleable branch transit location, sets the company default branch, maps existing user-location grants into `sec.user_branch`, and backfills branch dimensions on Sales Orders, Purchase Orders, expense vouchers, journals, AR payments, and AP payments to the single historical KAM branch. Existing transaction/location IDs were preserved.

Added branch context/administration APIs, a DRAFT → IN_TRANSIT → RECEIVED transfer API using source-branch transit, shared frontend operating context, AppLayout branch/location controls, and branch-aware POS context. Sales Order/Purchase Order list/detail/create paths use a concrete branch. Shared product/customer/supplier masters and finance ledger remain company-wide. Only explicit `HEAD_OFFICE` bypasses branch membership. Branch/user/location administration UI and per-branch quarantine provisioning remain incomplete.

**Acceptance status:** Phase 5 is not complete. No Branch A/B fixture or POS, SO/Delivery, AR/Receipt, PO/GRN/AP, returns/refunds, inventory, transfer, finance, reports, restricted-user, HQ, single-branch regression, Phase 4 regression, or authenticated browser matrix was run. Legacy route/report branch scope and end-to-end finance dimension coverage remain to audit and validate. Transit is per source branch; quarantine remains tied to its branch location. No production changes, deployment, or commit performed.

## 2026-09-22 — Phase 5 Dashboard Branch-Scoping Fix

Changed `GET /api/dashboard/summary` to scope each operational metric to middleware-validated active branch context. Branch attribution uses existing location, transaction, and journal dimensions: saleable stock by location; sales and AR by invoice delivery/POS source location; AP by GRN location; cash/P&L by `gl_journal.branch_id`; cleaning by raw and finished locations; PO by `purchase_order.branch_id`; GRN/delivery by location; movement rows by either branch-owned endpoint location; receipts by payment branch; and alerts by their source documents. Schema inspection found `pos_sale.location_id` (not `branch_id`), so POS credit invoices resolve to their source sale location. A selected branch is used for all users, including HEAD_OFFICE; consolidated Dashboard mode remains absent.

Frontend Dashboard now reads the shared operating context and keys/refetches its query by selected branch. The API passes that branch in both `branch_id` and `x-branch-id`; mismatched values fail closed. Stock card states saleable quantity. Cash and net profit are marked unavailable if any journal lacks branch attribution, avoiding partial finance totals. No database migration or view change was needed. Authenticated branch isolation and browser retest remain pending; see the test log. No production changes, deployment, or commit.

## 2026-09-22 — Phase 5 Ambiguous Locations Query Fix

Qualified every location column in the joined `GET /api/locations` select as `l.*` and retained explicit `b.branch_code,b.branch_name`. This resolves the ambiguous shared names `company_id`, `branch_id`, `is_active`, `address`, `phone`, `email`, `created_at`, and `updated_at`. Existing `user_branch`/`user_location` predicates and HEAD_OFFICE role behavior are unchanged. Location-load errors no longer return raw database details. Shared context already auto-selects an authorized usable location and the header supports a selector for multiple assignments; AppLayout now gives a clear Setup-directed message when the active branch has no authorized location. Read-only direct SQL against the supplied user/branch returned seven rows; authenticated endpoint and Dashboard retests remain pending. No production changes, deployment, or commit.
# 2026-09-22 — Phase 24 Multi-Location Foundation

Added an additive location migration with controlled types, saleable/stock-holding/system flags, company assignment, parent/contact fields, company default location, configurable 50 active non-system location soft limit, user-location scope table, and MULTI_LOCATION feature flag. The Setup location editor captures type and stock behavior; location deletion is refused in favor of deactivation. Location APIs expose scoped locations, default-location changes, and user assignment updates with audit events. POS rejects unauthorized explicit location IDs; stock-on-hand requests enforce user location scope. Runtime migration/API/UI validation is pending; static validation passes. No production changes or deployment made.

Read-only schema/runtime inspection: `app.location` initially contained `location_id`, `location_code`, `location_name`, `is_active`, and `created_at`; seven existing location codes were present. `app.location.company_id`, `app.company_profile.default_location_id`, and `sec.user_location` did not exist. Configured localhost database identity was `kam_grains_db`, not positively identifiable as development, so it was not mutated.

Follow-up found prior project test records explicitly identify `kam_grains_db` as development. Applied the migration there; the original seven location IDs and names remained. Verified default FG_STORE, all type/flag backfills, two existing users assigned, and MULTI_LOCATION disabled by default. Rollback-only SQL guards and authenticated GET `/api/locations` smoke passed. Browser tests and POS/operations transaction matrix remain pending. Production was untouched.


## 2026-09-22 — Phase 5 Acceptance Hardening

Acceptance code review closed several confirmed legacy route scope omissions and added the Setup user branch/location assignment/default panel. Server-side route scopes and source-document guards now cover touched inventory, count, adjustment, cleaning, delivery, GRN, AR/AP, finance, POS and return routes; AR/AP payment allocation checks source branch/location. The shared context middleware rejects inactive branches. Dashboard, consolidated reports, finance aggregates and GRN variance remain HEAD_OFFICE-gated until their SQL sources are branch-safe. A rollback-only SQL fixture confirmed restricted versus multi-branch membership and branch-owned stock rows; this does not prove API authorization or transaction behavior. Authenticated workflows, report correctness, audit fields, and browser validation remain pending. No new migration, deployment, or commit was made in this acceptance turn.
# Phase 5 reporting/finance + POS acceptance fix — 2026-09-22

- Added `database/migrations/phase_26_multi_branch_reporting_finance_fix.sql`. It appends `branch_id` to `reporting.v_sales_event_lines` while retaining existing column order and event semantics, and keeps POS posting/reversal journal branch IDs aligned to the sale location. Applied idempotently to the configured development database only.
- Finance routes now scope the whitelisted General Ledger, Trial Balance, P&L, Balance Sheet, and Cashbook to the selected branch, including journal/detail/voucher reads. Trial Balance totals balance in current development data. Balance Sheet includes branch current earnings and reports the shared-chart allocation limitation.
- Reports routes now scope customer weekly performance, dormant customers, RFM, weekly sales, purchases, profit, and management summary to the branch; customer-concentration and other unlisted consolidated endpoints retain their existing HEAD_OFFICE gate.
- POS location resolution, stock display, and sale reads enforce selected branch/location. POS A/B security and workflow behavior still require authenticated tests with two active branches.
- Finance and Reports front ends include branch IDs in React query keys and use the existing shared branch/location context.
- Validation: exact route SQL executed read-only against development DB; all listed queries executed, trial balance difference is zero, Balance Sheet equation matches within floating-point rounding, 33 posted POS sales have zero journal branch mismatches. Syntax and static/build status recorded in `docs/TEST_LOG.md`. Authenticated API/browser and Branch A/B POS tests were not run. No production/deployment/commit.
# Phase 5 authenticated A/B runtime acceptance — 2026-09-22

Created TEST_B and development-only branch-scoped accounts, locations, product lots, and controlled test transactions after confirming the configured database is `kam_grains_db` on localhost. Real API login sessions validated branch contexts, locations, Dashboard, Finance, weekly reports, POS isolation, Sales→Delivery→AR→Receipt, PO→GRN→AP→payment, returns/refunds, transfer dispatch/receive, count, and adjustment. Accepted defects received targeted fixes: Phase 30 for source-derived SAL journal branches and Phase 31 for PUR journal branches; the AP from-GRN query was qualified. Phase 31 is an applied forward migration on development. No deployment or commit. Overall remains in progress because of pending items in the test log.
# Phase 5 Extension — 2026-09-22

- Added STOCK_VISIBILITY read access independently of operating branch/location grants; inventory can filter by branch/location and masks cost without VIEW_TRANSFER_COST.
- Added Internal Stock Request data model and UI with controlled states, partial line approvals, and supplied/outstanding quantities.
- Extended inter-site transfers for request links, received quantities, variance reasons, atomic transit/receipt posting, duplicate-post protection, and split request fulfillment.
- Added transfer history/detail and receipt actions; branch procurement modes and approval timestamps. Pending approval POs cannot proceed to GRN.
- Added forward migrations 32–33; applied only to local development database. No production changes, deployment, or commit.
- Authenticated API acceptance passed for visibility/POS denial, partial fulfillment, transfer operations, procurement modes, audit, unchanged inventory valuation and no GL journal creation. Browser and reverse Head Office request cases remain pending.
## Phase 5 Final Closure Update — 2026-09-22

Added the Inventory Category filter using the existing getProductCategories API and inv.product.category_id query filter. The selector includes All Categories and combines with branch/location/search without a page reload. Browser acceptance was not possible because the Codex browser had no tabs or authenticated session; reverse Head Office request remains pending.
## Phase 5 Final Acceptance Update — 2026-09-22

Extended stock transfer receiving to support a later controlled receipt from RECEIVED_WITH_VARIANCE. The endpoint accumulates received quantity, prevents receiving beyond remaining transit, clears variance metadata only when fully received, and preserves destination authorization. Updated Transfer Detail to show remaining in transit and permit Receive Remaining only for the unresolved remainder.
## Phase 5 Frontend Completion — 2026-09-22

Confirmed existing Stock Requests and Inter-Site Transfers routes in App.tsx and AppLayout.tsx. Preserved their permission-gated navigation and existing API client usage. Completed transfer detail presentation for dispatched, received, remaining transit, variance, reason, actors and timestamps, with a Receive Remaining action for unresolved variance. Backend later-receipt support accumulates only the remaining quantity.
## Phase 5 Authentication Timeout Fix — 2026-09-22

Aligned frontend/.env.local with the backend development port by changing VITE_API_BASE_URL from localhost:3001/api to localhost:3000/api. No auth route, password, role, branch security, timeout, or production configuration was changed. Direct database and HTTP timing confirmed the login path responds successfully on the configured port.
## Phase 5 Source-Lot Selection Fix — 2026-09-22

Corrected Internal Stock Requests source-location loading to pass stock_visibility=true for the explicitly selected source branch, preventing the current operating branch header from supplying stale locations. Preferred source branch/location IDs are used as defaults, and changing source branch clears the selected location. Transfer preparation now allocates approved outstanding quantity across every eligible lot returned for the selected source location, preserving lot IDs and allowing partial availability. Existing backend revalidation remains unchanged.
## Phase 5 Transfer Detail UI Correction — 2026-09-23

Updated InterSiteTransfers.tsx with a shared three-decimal quantity formatter, UGX cost formatter, readable statuses and variance reasons, responsive padded table layout, explicit Receive Now/Received Total/Remaining In Transit columns, and consistent timestamps. Extended the transfer detail API select with product UOM and actor display names. Database quantities and state transitions remain unchanged.
## Phase 5 Request Direction UI Fix — 2026-09-23

Added explicit Requesting Branch and Receiving Location controls to InternalStockRequests.tsx. Requesting branches use the authorized branch list; locations are reloaded by selected branch and stale location state is cleared. Creation now sends the selected branch/location rather than only the current operating context. Request history/detail APIs now return receiving location and actor display fields, and the UI shows requesting branch, receiving location and preferred source.
