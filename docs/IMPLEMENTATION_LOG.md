# Implementation Log

## 2026-09-25 — Phase 8C cash refund/session and date display correction

- Added forward migration 43 with auditable nullable session/till/branch/location fields on `sal.refund_settlement`.
- Updated refund settlement to require the authenticated operator's OPEN session for CASH refunds when Till Management is enabled.
- Added one idempotent `CASH_REFUND` movement linked to the refund settlement; non-cash refunds remain financially unchanged and create no till movement.
- Added a date-only formatter for customer-return calendar dates; timestamp rendering remains timezone-aware elsewhere.
- Added deterministic Phase 8C regression tests. No deployment or commit performed.

## 2026-09-25 — Customer return VAT journal correction

- Added `database/migrations/phase_42_customer_return_vat_journal_fix.sql`.
- `sal.post_customer_return` now posts net sales reversal, snapshot Output VAT reversal, gross refund/AR effect, and independent inventory/COGS reversal as one balanced flow.
- `sal.finalize_customer_return_settlement` now uses snapshot gross value for invoice-linked AR/refund settlement.
- Removed route-level VAT journal mutation from `POST /api/customer-returns/:id/post`; rollback, EFRIS queueing, and refund/till separation remain intact.
- Added deterministic customer-return VAT journal tests. No deployment or commit performed.

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
## 2026-09-24 — Phase 6 Configurable VAT / Tax Engine foundation

- Added forward-only `database/migrations/phase_34_tax_engine.sql`; applied only to the documented local development database `kam_grains_db`. Production was not touched, and no deployment or commit was performed.
- Added effective-dated company tax codes, Uganda seed treatments, disabled-by-default `tax_engine` feature, company tax settings, nullable product tax classification, and additive POS/AR/AP snapshot columns.
- Added tax configuration/report endpoints, role mappings, product API tax fields, exact decimal calculation utilities, and deterministic tax formula tests.
- Full tax-aware journal replacement, returns VAT reversal, document UI totals, and authenticated browser acceptance remain pending because legacy posting functions are the authoritative accounting boundary.
## 2026-09-24 — Phase 6B VAT accounting and universality hardening

- Audited hardcoded assumptions: Uganda/KAM values remain seed data, fallback branding, documentation, or existing platform identity; no tax calculation uses a company name, UUID, branch, product, or fixed 18% constant.
- Added forward migrations 35–37 for configured Input/Output VAT accounts, activation precheck, tax-aware AR/AP posting, and immutable original tax snapshots on customer returns.
- Integrated POS tax snapshots and Output VAT journal adjustment in the existing POS authoritative posting boundary. Credit POS-generated AR invoices reuse the POS journal and do not repost revenue/VAT.
- Added Setup VAT settings display, activation precheck API, generic 10% tests, mixed-tax/disabled tests, and documented the single-company extension point and EFRIS boundary.
## 2026-09-24 — Phase 6C automated runtime acceptance

- Confirmed local `kam_grains_db`, migrations 34–37, VAT accounts, activation blockers, and disabled final state.

## Phase 6C UI correction — 2026-09-24

- Confirmed the existing classification control was in Setup → Business Features, not in the visible product master table or Quick Sale.
- Added activation-readiness messaging with actionable precheck blockers and preserved server-side precheck enforcement.
- Added current/effective tax-code validation to product create/update APIs.
- Exposed tax metadata in POS products and price administration API results; Quick Sale now shows Taxable Value, VAT, and Total when enabled.
- PHASE5-AB-TEST remains deliberately unchanged and requires manual classification through the normal UI before acceptance.

## Phase 6C final VAT configuration UX — 2026-09-24

- Added Tax Treatment to Selling Price Management as a dynamic approved-tax-code selector. It writes only `inv.product.tax_code_id` through `PATCH /api/products/:productId/tax-code`; price rows and price history are not used for tax ownership.
- Added administrator-only Tax Rate Management for new effective-dated periods, closing periods, and activation/deactivation. Backend validates bounds, dates, company scope, and overlaps; migration 38 adds a database exclusion constraint for active-period overlap prevention.
- Updated POS, product, and AR/AP effective-date resolution so a product tax-code reference automatically uses the applicable current/future rate row by code and date.

## Phase 6D VAT persistence and Quick Sale UX — 2026-09-24

- Replaced the Selling Price tax selector's immediate mutation with explicit row-local draft state and Save Tax confirmation. Successful saves refresh setup products, product classification, POS catalogue, and activation readiness queries.
- Quick Sale quantity inputs now use editable text state while typing, commit on blur/Enter, normalize to three decimals, and validate positive quantity and available stock.
- Quick Sale cart lines show compact tax treatment indicators; checkout now presents customer, tax summary, payment, tender/change, and completion in that order while preserving existing payment methods and posting authority.
- Ran rollback-contained development accounting acceptance using existing `NB-CLEAN` stock. Temporary product classification, tax enablement, POS sale, AR invoice, AP invoice, journals, and configuration were rolled back in one transaction.
- Evidence: POS 4,000/720/4,720 with balanced 7,220/7,220 journal; AR 4,000/720/4,720 balanced; AP 4,000/720/4,720 balanced. No temporary test rows remain.
- Unauthenticated tax API protection passed. Authenticated CREDIT POS, returns/refunds, branch A/B, and browser checks remain unavailable without a safe development session.

## Phase 39 Payment Channel Foundation — 2026-09-24

- Reused `fin.api_payment_channel`; added manual/sandbox/live mode metadata, explicit active/manual collection state, provider identifiers, masked account/terminal metadata, credential readiness, branch/location scope, and first-class CARD/BANK_TRANSFER compatibility.
- Added normalized `app.payment_transaction` and immutable `app.payment_transaction_event` records with lifecycle statuses, provider-reference and idempotency uniqueness, and manual-confirmation audit fields.
- POS Quick Sale now loads scoped active manual channels, auto-selects a sole eligible channel, captures an external reference, and records confirmed manual payment atomically with the existing POS posting function.
- Added payment-channel permissions, available-channel API, transaction status endpoint, and management action to enable manual collection from the existing API Payment Channels page. No provider network calls or live credentials were added.

## Phase 7 EFRIS foundation — 2026-09-24

- Confirmed no existing EFRIS/URA adapter, fiscal queue, FDN/QR model, or official technical specification in the repository.
- Added migration 40 with independent `efris` feature/configuration, readiness precheck, branch/place, product, UOM, and tax mappings, durable fiscal documents, events, and submission attempts.
- Added a `NOT_CONFIGURED` adapter boundary; no URA HTTP/VPN/encryption/signature behavior or secrets were invented.
- POS posted sales queue fiscal documents from persisted snapshots when EFRIS is enabled; POS credit remains the sole authority and customer returns can queue linked credit notes after an accepted original.
- Added EFRIS settings, precheck, mappings, document monitor, retry, and clearly-labelled internal mock endpoints/UI.

## Phase 8 Till / cashier sessions — 2026-09-24

- Added migration 41 for company till configuration, branch/location tills, user-till assignments, cashier sessions, cash movements, denomination counts, and POS session/till references.
- Added disabled-by-default `till_management` feature gating and activation precheck for an active till and cash payment mapping.
- Added branch-scoped session APIs for open, cash movement, close, variance approval, reconciliation, force-close, till register, and session history.
- POS now requires an active session only when the feature is enabled; cash sales create drawer movements while non-cash payments do not.
- Added Till Management UI, Quick Sale session banner/blocker, permissions, deterministic cash-formula tests, and documentation. Migration was applied locally only; manual authenticated acceptance remains pending.

## Phase 8B Till UX and assignment — 2026-09-24

- Reused the existing ERP user, role, branch, and location authorization model; no duplicate cashier authentication was introduced.
- Added eligible-user and till-assignment APIs with active-user and branch/location validation, plus manager-only opening for another cashier.
- Improved Till Management with cash/payment account selection, zero-float opening, explicit operator/notes, assignment display, activate/deactivate controls, and clear no-active-till guidance.
- Setup now presents Till / Cashier Sessions as a manageable feature with activation state and a Manage action to the real Till Management route.

## Phase 8B acceptance defect correction — 2026-09-24

- Traced TILL-01 and Kenneth’s assignment/scope data to matching KAM GRAINS / Clean Beans Store identifiers.
- Corrected opening-context handling by submitting and validating the operating branch and location explicitly.
- Added server-side validation for active till, active cashier, branch/location authorization, and `can_open` assignment for ordinary cashiers.
- Added active assignment aggregation for Till Register and a cashier-specific eligible-till query that excludes conflicting sessions.
- Separated administrative Till Register/configuration UI from the ordinary cashier’s operational session flow.

## Phase 8B final acceptance fix — 2026-09-25

- Added a minimal operational tax-context endpoint for POS roles and removed Quick Sale’s dependency on administrative tax settings.
- Preserved administrative permissions for tax settings, tax codes, activation readiness, and tax configuration.
- Added explicit branch/location open-session payload validation and confirmed TILL-01/Kenneth database scope alignment.

## Phase 8B runtime correction — 2026-09-25

- Added an explicit-context session-opening transaction that validates branch/location/company/till/cashier scope and writes session plus opening movement from the validated till/session dimensions.
- Hydrated Till Management queries only after authenticated branch/location context is available and added context-aware query keys.
- Kept API base at `http://localhost:3000/api`; improved login error classification without changing backend port or service configuration.

## Phase 8B zero opening-float correction — 2026-09-25

- Confirmed the existing `till_cash_movement_amount_check` correctly requires positive movement amounts.
- Corrected zero-float opening to persist the session opening float without inserting a meaningless zero-value movement.
- Preserved positive opening movements, normal cash movement integrity, negative-float rejection, and transaction rollback behavior.

## Phase 8B/POS parameter correction — 2026-09-25

- Traced the manual Quick Sale failure through `POST /api/pos/sales` to the `sal.pos_sale` insert.
- Removed the unused `$12` slot and bound active-session `session_id` and `till_id` as UUID placeholders in sequence.
- Kept fractional quantities, VAT calculation, active-session enforcement, cash-sale drawer movement, transaction rollback, and idempotency unchanged.

## Phase 8B close-session authorization correction — 2026-09-25

- Corrected close authorization to use persisted session company/branch/location/till dimensions rather than treating volatile `req.branchId` as the authority.
- Added cashier ownership, branch/location authorization, and active `can_close` validation; reconciliation permission remains separate.
- Preserved counted-cash validation, variance calculation, status workflow, audit fields, and no-new-movement close behavior.

## Phase 8C till ownership and cashier UX

Added a dedicated cashier session endpoint, scoped ordinary session queries to the authenticated cashier, limited `/my-tills` active-session joins to that cashier, protected cash movements and till deactivation, and split the Till Management page into cashier and manager modes. Existing refund integration was preserved.
## Manager console and Quick Sale resume correction

Restored manager open-session, create/configure, register, assignment, and session-history controls while retaining cashier-only rendering for SALES users. Quick Sale now resumes the authenticated user’s persisted OPEN/CLOSING session from `/my-session`; no silent session creation was added.

## Phase 8D movement accounting

Added migration 44 for Safe/Main Cash configuration, movement idempotency, and journal linkage. Safe Drop now requires configured accounts and posts Dr Safe/Main Cash / Cr Till Cash atomically. Cash Out and Safe Drop are bounded by expected physical cash.
## Phase 8D runtime correction (2026-09-25)

Corrected the ambiguous POS activity timestamp used by `/my-session`, restored safe existing-till editing, added active CASH payment-account validation, preserved partial-edit mappings, and added the occupied-till empty-state message. No migration, deployment, production write, or commit was performed.
## 2026-09-25 — Targeted active-session correction

Added the existing-session detail query to the approved manager page, wired register selection to active session inspection, restored force-close action through the existing permissioned endpoint, and kept movement entry conditional on an OPEN selected session. No new subsystem, migration, account-per-cashier model, deployment, or commit was introduced.
## 2026-09-26 — Phase 8E cash-control account setup

Added forward migration 45 for reusable `TILL-CASH` and `MAIN-SAFE` operational payment-account labels backed by new asset control GL accounts `1110` and `1120`, because `1100` was already Accounts Receivable. Added manager-only payment-account creation alongside existing monitoring, and hardened Safe Drop/Cash In account prechecks and journal directions. Migration applied locally only; no historical balance was moved.

## 2026-09-28 — Phase 8E runtime correction

Separated manager assignment-till state from selected session state, auto-selected the logged-in manager/admin's active session, and added explicit register session selection. Corrected movement locking by locking `app.cashier_session` before loading optional account controls. Added source available-balance precheck, fresh client UUID idempotency keys, permission-aware movement actions, and immediate summary refresh through existing query invalidation. No deployment or commit performed.
## Phase 8F — cash funding, carry-forward, and handover (2026-09-28)

Added `phase_46_till_cash_carry_forward_handover.sql`, opening-options discovery, Main Safe funding journal transfers, same-till carry-forward, close dispositions, cashier handover proposals/acceptance, and receiving opening-float audit movements. Existing Phase 8E session locking and movement idempotency remain intact.
## Phase 8F migration alignment and opening-balance verification (2026-09-28)

Confirmed the local runtime/schema mismatch: Phase 46 existed in the workspace but `app.till_cash_handover` and the new `app.cashier_session` columns were absent from `kam_grains_db`. Applied the existing migration transactionally to local development only. Verified active ASSET accounts 1110 and 1120, canonical payment-account mappings, zero available MAIN-SAFE/TILL-CASH balances, preserved historical 1000, existing OPEN sessions, and the unchanged Opening Balances metadata-driven account selector. No redesign, deployment, production change, or commit was performed.
## Phase 8F/8G combined UI correction (2026-09-28)

Replaced the shared movement interaction with explicit independent Cash In, Cash Out, and Safe Drop rows. Added inline validation, row-specific processing state, success-only reset, failure input preservation, and complete post-success query invalidation. Existing routes, journals, UUID idempotency, backend, and schema were preserved.

## Phase 8G payment-account transfer workflow (2026-09-28)

Added forward migration 47, durable internal transfer records, deterministic transfer numbers, source/destination validation and locking, canonical available-balance checks, automatic balanced GL journals, idempotency, reversal journals, explicit permissions, Payment Account Control transfer UI/history, and documentation. Till Management, Opening Balances, VAT, refunds, and historical 1000 Cash behavior were preserved.
## 2026-09-29 — Phase 8H branch attribution and reusable reporting

- Added `database/migrations/phase_48_branch_financial_attribution_reporting.sql`.
- TILL_CASH journal branch attribution now resolves from persisted movement/session dimensions; opening, cash-in, safe-transfer, and handover source rows retain session dimensions.
- Added branch-performance business-event reporting and daily till-performance movement reporting. Receipts are excluded from sales revenue; cash movements are not profit.
- Existing posted debit/credit lines are unchanged. No production deployment or commit was performed.
## 2026-09-30 — Phase 8I-A Expense Voucher hardening

- Inspected the live local `fin.post_expense_voucher_by_no` definition before changes.
- Confirmed 26 posted vouchers and zero voucher/journal branch mismatches before migration.
- Added `database/migrations/phase_49_expense_voucher_payment_account_hardening.sql`.
- Versioned immediate-payment posting with persisted voucher branch, voucher date, controlled Payment Account validation, canonical balance checks, active EXPENSE-line validation, and balanced reversal support.
- Expense Voucher payment-source selection now uses controlled Payment Account rows and channel metadata. Cashbook now includes active controlled payment accounts and classifies internal transfers separately.
- Phase 49 was applied only to local development `kam_grains_db`. No Petty Cash funding, cross-branch settlement, deployment, or commit was performed.

Phase 8L UX correction adds optional initial Operating Branch and Default Location fields to the existing Users & Roles create modal. The backend atomically creates the user, initial role, optional grants/defaults, and business audit events. Existing Branch & Location Access remains authoritative for later changes.

Phase 8L acceptance hardening adds responsive create-user controls, active grant visibility in Manage User, a preselected link into authoritative Branch & Location Access, and branch-scoped operational till register filtering. No migration was required.
# Phase 8L till eligibility correction

Changed the till eligibility endpoint and Till Management queries to use the selected persisted till scope. Added cashier-role and optional assignment/can_open filtering. Till creation now validates authorized branch/location context. No schema migration was required.
# Phase 8M management target

Added `managementScope.service.js`, the management branch endpoint, Till Management target selectors, target-aware register/session/create/force-close paths, and HEAD_OFFICE till permissions. No migration was required.

Phase 8M acceptance correction aligned Quick Sale session discovery with My Till, preserved cashier-vs-opened-by semantics, and added operating-location scope to Dashboard stock cards. No master data was changed.

Phase 8N added branch-targeted Setup location listing and editing, central create authorization, saleability/status display, safe deactivation guards, and atomic location audit events. No migration was required because the operational location columns already existed.

Phase 8N acceptance correction added forward migration 54 (`phase_54_expand_audit_event_actions.sql`) after inspecting the original constraint. User-location access now performs business update and audit insert in one transaction; known validation messages remain specific and unexpected failures return a safe generic message. Branch/location selectors now use responsive columns with constrained, discoverable long labels.

Phase 8N UI acceptance correction replaced the undeclared `managementBranch` references with the existing `managedBranch` derived selection, added guarded management-branch/location empty states, made location management discoverable as `Branches & Locations`, and refetched the management branch list after location saves. No schema or backend behavior changed.

Phase 8O-A added POS cash-movement journal linkage and source fallback display, labels POS activity distinctly from the corresponding cash movement, and changed cashier close UX to use the supported `CARRY_FORWARD` disposition rather than silently requesting manager-only `LEAVE_IN_TILL`. Close/open success messages now identify the session.

Phase 8O-A2 aligned central Till Management to an explicit management branch/location. Admin manager mode no longer seeds its active-session panel from the administrator's own operating-context session; session history, detail, force-close, cash movements, assignments, eligible users, and opening options are target-authorized. No migration, deployment, or production change was required.

Phase 8P adds reconciliation-oriented session history fields and a session-specific management table. Phase 55 adds `sal.customer_branch`, backfills only reliable historical branch associations, preserves one company-wide customer identity, and enforces branch visibility in party lists plus POS, Sales Order, and Delivery customer selection.
# Phase 8Q implementation

Central Admin open-session feedback now uses the committed session response and selected cashier; cashier history reuses the management summary contract; posted return reposts are rejected before database posting; existing Phase 8C cash-refund session enforcement and idempotent movement behavior remain unchanged.
## Phase 8R

Added permission-scoped Finance access to Customer Returns, branch/location-scoped paying-session selection, and cash refund settlement through another user's OPEN till session. The existing Sales return workflow and Admin/Manager-only void policy remain unchanged.

## Phase 8S

Receipt printing uses `taxable_subtotal`, `tax_total`, `total_amount`, and line tax snapshots. Finance refund filtering is backend-parameterized and branch/location scoped; status badges and the settlement dialog were improved. Return accounting and historical records were left unchanged.

## Phase 8T

POS history now has responsive detail presentation, grouped summary hierarchy, return/refund filters, and filtered Excel export. Branch-safe POS summary, product, customer, cashier, payment, and returns reports use SQL aggregation under `/api/pos-sales`. No new migration, commit, push, or deployment was performed.

## Phase 8T-A

Reports now separates POS transaction date ranges from weekly operational periods. POS controls show the active range, reject reversed dates, include branch/location/date values in query keys, and preserve the selected range on Refresh All. The summary report uses grouped panels rather than a wide one-row display. Legacy report scope findings were documented without weakening the safety middleware.

The three grouped POS SQL failures were corrected by using the `scoped_sales` CTE alias in outer aggregations. No schema or migration change was needed.
## Phase 8U

Standardized POS transaction review UX and added the reusable `useRowInteraction` behavior. Updated POS Sales, Stock Movements, and Journals; Customer Returns already had safe double-click/View handling and remains excluded from editable return-entry rows. No accounting, posting, VAT, return/refund, or historical data behavior was changed.

## Phase 8U-A

Corrected the shared row hook's unconditional selection reconciliation update and stabilized the POS detail opener with `useCallback`. View and double-click now share one controlled-dialog open path. No accounting, API, or Radix trigger behavior was changed.
## Phase 9B — Stock request hardening and operational list UX (2026-10-25)

- Added additive migration `phase_57_stock_request_hardening.sql` for cancellation audit metadata and status filtering support.
- Separated `VIEW_STOCK_REQUEST`, `SUBMIT_STOCK_REQUEST`, and `CANCEL_STOCK_REQUEST` from creation/approval permissions; company-wide request visibility remains an explicit `VIEW_ALL_STOCK_REQUESTS` capability.
- Hardened stock-request scope, cancellation, linked-transfer reservation checks, and named business audit events for create, submit, approve, reject, and cancel.
- Expanded list/detail responses with request date, source/requesting locations, requester, product search, allocated/dispatched/received quantities, and linked transfer progress.
- Standardized the Internal Stock Requests list with filters, shared row interaction, wide detail modal, and read-only fulfilment progress. Transfer creation remains deferred to Phase 9C.
## Phase 9B-C — Acceptance corrections and transfer-task foundation (2026-10-25)

- Restored the existing Manager request visibility capability and added source-branch-only approval enforcement for ordinary users; Admin/Head Office retain override authority.
- Added backend-authoritative approval scope response and source-side list visibility, including authorized Admin/source filtering.
- Added Preferred Source Location and live stock-on-hand availability to request creation. Only positive-stock products are offered when a source location is selected; requested quantity remains independent and can exceed availability.
- Added labeled responsive filters with dependent location refresh, date-order validation, and explicit Clear Filters.
- Added derived Stock Transfer Tasks views for New Requests and Ready for Fulfilment using existing request history and canonical outstanding quantities. Dispatch/receipt execution remains deferred.
## Phase 9B-D — Request reset and business-facing task detail (2026-10-25)

- Successful request submission now closes the active request detail, resets source/product/quantity/priority/type fields, preserves operating branch/location context, and gives explicit request-number feedback.
- Replaced raw JSON task detail with a wide business-facing modal showing request routing, human names, status, priority, line quantities, current source availability, approval quantities, and contextual approval/rejection actions.
- Added real source-side approval quantity entry and rejection reason handling in Stock Transfer Tasks. Approval refreshes task/history queries; approved outstanding work classifies as Ready for Fulfilment.
## Phase 9C — source fulfilment and transfer preparation

- Added additive migration `phase_58_stock_fulfilment_preparation.sql` with transfer-draft idempotency and request/status indexing.
- Added source-scoped `FULFIL_STOCK_REQUEST` permission and `/internal-stock-requests/:id/fulfil`.
- Added partial allocation, multiple linked transfer preparation, same-branch alternate source locations, lot splitting, live availability checks, request-line linkage, `TRANSFER_PREPARED` audit/business event, and retry protection.
- Extended Stock Transfer Tasks with fulfilment quantities, source-location selection, live availability, and draft preparation.

## Phase 9C-A — fulfilment progress persistence

- Traced request history and task detail to the internal-stock-request list/detail endpoints and confirmed persisted transfer linkage in the local database.
- Corrected linked-transfer allocated aggregation to exclude `CANCELLED` drafts.
- Expanded successful preparation invalidation across task queues, request history/detail, inter-site transfers, and stock availability.

## Phase 9C-B — stock reservation model

- Added authoritative inventory reservation fields derived from active `DRAFT` transfer lines and separated `IN_TRANSIT` quantities.
- Added branch-safe `/api/stock-reservations` drill-down and Inventory Stock reservation columns/modal.
- Fulfilment validation now subtracts active source-location/product/lot reservations before allowing a new draft.
- Added structured business conflict payloads for request-outstanding and available-stock conflicts.

## Phase 9D — dispatch execution and incoming receipt work

- Added forward-only `phase_59_stock_transfer_dispatch_executions.sql` with `inv.stock_transfer_dispatch`, dispatch lines, execution numbering, idempotency, and `PARTIALLY_DISPATCHED` status support.
- Hardened the existing dispatch route with source branch/location authorization, transfer/line locks, active reservation and physical-stock revalidation, partial quantities, execution-linked source-to-TRANSIT movement, lot/cost preservation, and same-transaction audit.
- Added destination-scoped `/stock-transfers/incoming-receipts` execution search and task visibility. Stock Transfer Tasks now exposes Awaiting Dispatch and Incoming Receipts work queues.
- Preserved GL-neutral internal transfer treatment and deferred destination receipt posting, receipt variance, and saleable destination stock.

## Phase 9D-A — destination receipt visibility and business references

- Investigated persisted `TEX-20261026-000006`; it is `DISPATCHED`, linked to `TRF-20260922-000004` and `ISR-20260922-000004`, with 0.200 outstanding for Test Branch B Store.
- Corrected Incoming Receipt eligibility to use persisted execution destination fields and destination user-location authorization rather than incorrectly requiring the active branch header to equal the destination.
- Added `request_no` joins, legacy fallback labels, source/destination/date filters, dispatch detail retrieval, and consistent React Query invalidation.
- Added read-only Incoming Receipt detail presentation and replaced dispatch success native alert with an in-page application notification. Destination receipt posting remains deferred.

## Phase 9E-A — receipt route runtime correction

- Confirmed final route composition: `POST /api/stock-transfers/dispatches/:id/receive`.
- Identified and replaced stale port-3000 Node PID 20920; the current workspace backend then served the route.
- Live acceptance generated `TRR-20261026-000001`, posted one transit-to-destination TRANSFER movement, returned JSON for success/duplicate/409 business-error cases, and preserved the legacy route.

## Phase 9E-B — destination receiving UI and multi-event history

- Fixed the UI history query so the active queue's `NEW RECEIPT` default cannot hide completed receipt events.
- Added execution-level Receive Now defaults from outstanding quantity and preserved partial/multiple receipt event semantics.
- Corrected active queue aggregation by pre-aggregating receipt lines before joining dispatch quantities; completed executions now leave active work while all TRRs remain in history.
- Live acceptance created `TRR-20261026-000002` (0.100 KG) and `TRR-20261026-000003` (0.200 KG) for `TEX-20261026-000004`; history returned three events and the execution closed from active receipt work.

## Phase 9E-C — receive action availability

- Added destination receipt capability evaluation and merged it into dispatch detail loading without duplicating receipt posting logic.
- Receive Stock is shown only when the canonical capability is true and execution receipt outstanding is positive; blocked destination locations show a business-facing reason.
- Bukenya’s live check confirmed Test Branch B Shop is authorized and Test Branch B Store is not; `TEX-20261026-000006` therefore returns `can_receive=false` with the Store-specific explanation.
## Phase 9D-B — internal stock request history

- Verified `ISR-20261025-000019`, `ISR-20261025-000020`, and `ISR-20260922-000004` remain persisted in `kam_grains_db`.
- Fixed the Phase 9D dispatch aggregation query so historical request listing no longer fails on an ungrouped correlated transfer column.
- Preserved canonical requesting-branch OR preferred-source-branch scope, Admin/Head Office broader scope, all lifecycle statuses, filters, progress quantities, and detail authorization.
- Added regression coverage and a business-friendly history load error state.

## Phase 9E-D2 — recipient-selected receiving location

- Added an authoritative `receiving-locations` endpoint scoped to the persisted destination branch and the authenticated user’s active location grants.
- Added alternate-location capability evaluation, the Receive Into Location selector, and `receiving_location_id` payload submission.
