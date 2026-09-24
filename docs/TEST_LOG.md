# Test and Regression Log

## Test Rules
- Do not mark a test `PASS` unless actually executed.
- Mark tests not executed as `NOT RUN`.
- Record command, environment, date, result, and evidence.
- Record failures as `BLOCKED` or `FAIL`.
- Regression coverage must protect the stable KAM GRAINS workflow.

## Regression Matrix

| Test ID | Area | Scenario | Status | Evidence / Notes |
|---|---|---|---|---|
| P0-AUTH-001 | Auth | Login, authorization, permissions | NOT RUN | Runtime baseline not executed in Phase 0 documentation correction |
| P0-SALES-001 | Sales | Sales Orders â†’ Deliveries â†’ AR Invoice â†’ Receipt | NOT RUN | Existing workflow must remain supported |
| P0-PUR-001 | Purchasing | Purchase Orders â†’ Goods Receipts â†’ AP | NOT RUN | Runtime baseline not executed |
| P0-INV-001 | Inventory | Stock movements, lots, counts, adjustments | NOT RUN | Runtime baseline not executed |
| P0-AR-001 | AR | Invoices, receipts, receipt history, backdating | NOT RUN | Historical fixes recorded |
| P0-AP-001 | AP | Invoices, payments, partial payments, Apply workflow | NOT RUN | Historical fixes recorded |
| P0-FIN-001 | Finance | Journals, accounts, payment accounts, postings | NOT RUN | Runtime baseline not executed |
| P0-REP-001 | Reporting | Operational and financial reports | NOT RUN | Runtime baseline not executed |
| P0-EXP-001 | Exports | Excel export/header visibility | NOT RUN | Historical fix recorded |
| P0-BACK-001 | Backdating | Backdated transaction/audit behavior | NOT RUN | Historical fix recorded |
| P0-QUERY-001 | Query Refresh | Dependent cache invalidation | NOT RUN | Historical runtime improvement recorded |
| P0-BUILD-TS | Build | Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` completed successfully |
| P0-BUILD-FE | Build | Frontend Vite production build | PASS | `npm.cmd run build` completed successfully |
| P0-BUILD-BE | Build | Backend build/check | PASS | `npm.cmd run build` completed successfully |
| P0-DEPLOY-001 | Deployment | Deployment/smoke test | NOT RUN | Deployment outside Phase 0 scope |

## Future Regression Requirements
Before Phase 1 begins, confirm baseline build commands and preserve repeatable coverage for the current stable production workflow.

## Phase 1 Validation — 2026-09-18

| Test | Command / Scope | Status | Evidence / Notes |
|---|---|---|---|
| P1-BUILD-TS | `cd frontend; npx.cmd tsc -b --pretty false` | PASS | Completed successfully after final correction. |
| P1-BUILD-FE | `cd frontend; npm.cmd run build` | PASS | Vite production build completed; existing chunk-size warning only. |
| P1-BUILD-BE | `cd backend; npm.cmd run build` | PASS | Node syntax/build check completed successfully. |
| P1-DIFF-001 | `git diff --check` | PASS | No whitespace errors; line-ending warnings only. |
| P1-DB-001 | Migration/schema/profile verification | NOT RUN | Requires approved database runtime execution; migration was not applied. |
| P1-API-001 | Authenticated GET/PATCH and unauthorized PATCH | NOT RUN | Postman/runtime validation required before Phase 1 approval. |
| P1-UI-001 | Login, shell, Setup profile editor, print output | NOT RUN | Browser runtime validation required. |

## Automated Runtime Validation — 2026-09-18

- **Mechanism:** Temporary Node integration runner using `pg`, `fetch`, `jsonwebtoken`, the actual development `.env`, and the actual Express server over HTTP. Temporary runners were removed after execution.
- **Database:** Development `kam_grains_db`; production database was not touched.
- **Database state:** `timezone` exists with default `'Africa/Kampala'::text`; exactly one active profile exists and it is the intended KAM GRAINS profile with UGX and Africa/Kampala.
- **GET:** PASS — HTTP 200; stable response shape and expected values returned.
- **Unauthorized PATCH:** PASS — HTTP 401, `Authentication required. Please log in.`
- **Authorized PATCH:** PASS — HTTP 200 using a JWT with the existing ADMIN/EDIT_SETUP role path.
- **Partial update:** PASS — temporary phone/address values were reflected by GET; unrelated fields remained unchanged; original values restored.
- **Protected fields:** PASS — `company_id` and `currency_code` rejected with HTTP 400 and `Unsupported business profile field(s): company_id, currency_code.`
- **Invalid values:** PASS — empty `company_name`, `business_name`, and `timezone` each returned HTTP 400 with the expected field-specific message.
- **Fallback:** PASS — fallback contract confirmed as KAM GRAINS / KAM GRAINS SUPPLIES / UGX / Africa/Kampala.
- **Cleanup:** PASS — original values restored; no test rows created; one active intended profile remains; company ID and currency unchanged.
- **Static validation:** Frontend TypeScript PASS; frontend build PASS; backend build PASS; `git diff --check` PASS.
- **Status:** RUNTIME VALIDATION PASSED — UI SMOKE TEST PENDING

## Phase 2 Runtime Validation — 2026-09-18

- **Database:** Development `kam_grains_db`; migration applied idempotently for validation only. Production untouched.
- **Existing product:** PASS — GET returned HTTP 200 and preserved product ID.
- **Category CRUD:** PASS — create 201, patch 200, list 200.
- **Product CRUD:** PASS — full create 201, PATCH 200, create without optional fields 201 with safe defaults.
- **Nullable category:** PASS — category assignment and clearing to NULL.
- **Validation:** PASS — invalid category 400, invalid boolean 400, duplicate SKU 409, missing required field 400.
- **Foreign-key protection:** PASS — deleting an assigned category returned 409.
- **Compatibility:** PASS — sales orders, deliveries, purchase orders, goods receipts, inventory stock-on-hand, cleaning batches, and all product-related report endpoints returned HTTP 200.
- **Cleanup:** PASS — zero `PH2TEST_` products, zero `PH2_` categories, one active company profile; product IDs and lot relationships unchanged.
- **Status:** RUNTIME VALIDATION PASSED — UI SMOKE TEST PENDING

## Phase 2 UI Regression Fix — 2026-09-18

- **Regression:** React error #185 on Setup after Phase 2 frontend deployment.
- **Root cause:** Unstable merged profile object caused the Setup profile synchronization effect to call `setProfileForm` continuously.
- **Correction:** Memoized the merged profile result in `useBusinessProfile()`.
- **Static validation:** Frontend TypeScript PASS; frontend build PASS; backend build PASS; `git diff --check` PASS.
- **Browser validation:** BLOCKED — local browser automation could not attach/navigate to the Vite tab. Required Setup smoke cases remain NOT RUN.
- **Status:** RUNTIME FIX APPLIED — UI SMOKE TEST PENDING

## Phase 3 Minimal Feature Configuration — 2026-09-18

| Test | Scope | Status | Evidence / Notes |
|---|---|---|---|
| P3-BUILD-TS | Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` completed. |
| P3-BUILD-FE | Frontend production build | PASS | `npm.cmd run build` completed successfully. |
| P3-BUILD-BE | Backend syntax/build | PASS | Server, feature route/service syntax checks and backend build passed. |
| P3-DIFF-001 | `git diff --check` | PASS | No whitespace errors; line-ending warnings only. |
| P3-DB-001 | Phase 3 migration | PASS | Applied idempotently to development `kam_grains_db`; production untouched. |
| P3-API-001 | Feature GET and KAM resolution | PASS | HTTP 200; current KAM features true; POS/barcode false. |
| P3-AUTH-001 | Auth/permission checks | PASS | Unauthenticated GET 401; SALES-role PATCH 403. |
| P3-TOGGLE-001 | Disable and restore | PASS | ADMIN disabled reports, observed false, then restored true. |
| P3-VALIDATION-001 | Unknown feature | PASS | Unknown code returned HTTP 400. |
| P3-AUDIT-001 | Existing audit integration | PASS | Feature changes recorded in `audit.event`. |
| P3-REGRESSION-001 | Transaction preservation | PASS | Sales, purchase, and stock movement counts unchanged; KAM settings restored. |
| P3-UI-001 | Authenticated browser smoke | BLOCKED | Login page loaded, but no authorized browser session/credentials were available to validate Setup/sidebar/direct-route flows. |

- **Validation server:** New feature route exercised on isolated development port 3001; existing port-3000 process was not modified.
- **Remaining approval item:** Authenticated browser smoke test and final UI approval.

## Phase 4 Step 2 Minimal POS Foundation — 2026-09-18

| Test | Scope | Status | Evidence / Notes |
|---|---|---|---|
| P4-DB-001 | Development migration and objects | PASS | `phase_14_pos_foundation.sql` applied to development `kam_grains_db`; POS tables, sequence, functions, and reporting view verified. |
| P4-AUTH-001 | Unauthenticated POS access | PASS | Real Express API returned HTTP 401. |
| P4-AUTH-002 | POS permission enforcement | PASS | VIEWER JWT returned HTTP 403 while ADMIN JWT succeeded. |
| P4-FEATURE-001 | POS feature gate | PASS | POS enabled for development test, API exercised, then feature restored disabled; disabled API returned HTTP 404. |
| P4-PRODUCT-001 | POS product search | PASS | Active saleable product search returned HTTP 200 with stock/lot/price data. |
| P4-SALE-001 | Cash sale | PASS | Atomic create-and-post returned HTTP 201 with POSTED sale, total 1000.00, change 500.00. |
| P4-SALE-002 | Named customer and multiple lines | PASS | Two-line named-customer sale returned HTTP 201/POSTED. |
| P4-VALID-001 | Invalid quantity | PASS | Invalid quantity returned HTTP 400. |
| P4-VALID-002 | Insufficient stock | PASS | Excess quantity returned HTTP 400; no partial sale was posted. |
| P4-IDEMP-001 | Duplicate idempotency request | PASS | Retry returned HTTP 200 duplicate response with the same sale ID. |
| P4-STOCK-001 | Stock movement | PASS | Controlled multi-line sale created two movement lines; void created reversal movement. |
| P4-FIN-001 | Accounting | PASS | Controlled sale journal balanced; void created reversal journal. |
| P4-REPORT-001 | POS-aware reporting | PASS | Weekly sales, profit, management summary, customer performance, and concentration endpoints returned HTTP 200 after event-view integration. |
| P4-VOID-001 | Posted-sale void | PASS | Void required reason, preserved original sale, and returned HTTP 200 with VOID status and reversal links. |
| P4-BUILD-TS | Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false`. |
| P4-BUILD-FE | Frontend production build | PASS | `npm.cmd run build`; existing chunk-size warning only. |
| P4-BUILD-BE | Backend build/check | PASS | `npm.cmd run build`. |
| P4-DIFF-001 | Repository whitespace | PASS | `git diff --check`; line-ending warnings only. |
| P4-UI-001 | Authenticated browser smoke | NOT RUN | Manual/browser validation remains required for navigation, cart, checkout, double-click, and receipt preview. |

- **Environment:** Development PostgreSQL and isolated local Express ports only; production was not touched.
- **Cleanup:** Temporary POS price rows removed and feature restored disabled. Controlled VOID rows remain as audit-preserving test evidence.
- **Status:** RUNTIME API VALIDATION PASSED — UI SMOKE TEST PENDING.

## Phase 4 POS Enablement and Product Price Management — 2026-09-18

Final integration checks added for pricing modes, credit AR open-item behavior, payment-method mappings, barcode uniqueness/lookup, and POS cache refresh. Development runtime credit test requires rerun after a transient database hang; no final UI approval is claimed.

Phase 18 migration application: PASS. Static TypeScript/build checks: PASS. Full Phase 18 transaction matrix remains pending authenticated API/browser execution, especially changed-cost void and receipt settlement.

## Phase 18 Final Runtime Validation — 2026-09-18

- Development database: Phase 18 migration applied successfully; no production database was touched.
- Fresh-source authenticated API checks: PASS for BANK_TRANSFER, CARD, CREDIT posting with AR invoice linkage, MANUAL authorized posting, MANUAL unauthorized rejection, and FIXED configured-price mismatch rejection.
- Fresh-source authenticated API checks: PASS for HYBRID unauthorized override rejection and missing-reason rejection.
- Fresh-source authenticated API check: FAIL for the authorized HYBRID override path; the supplied sale-level override reason was still rejected as missing. Logged as `ERR-P4-POS-003`; production approval is blocked.
- Not completed in this run: changed-cost void valuation, applied-credit receipt rejection, full idempotency/report/cache matrix, and browser UI smoke validation.
- Static checks: backend syntax PASS; local TypeScript build PASS; frontend production build PASS; `git diff --check` PASS with normal line-ending warnings only.

## Phase 18 HYBRID Override Reason Correction — 2026-09-18

- Frontend/API field trace: `priceOverrideReason` state maps to request field `price_override_reason`; backend normalizes it as a trimmed override reason; database persists `sal.pos_sale_line.price_override_reason`.
- Authorized HYBRID override: PASS. Configured/reference price 4,000; actual charged price 3,800; trimmed persisted reason `Negotiated wholesale price`; sale posted as `POSTED`.
- Whitespace-only reason: PASS rejection. Missing reason: PASS rejection. Unauthorized SALES override: PASS rejection. HYBRID configured price without override: PASS.
- Accounting evidence: posted journal had 4 lines with debits 640.00 and credits 640.00; receipt/report response used actual revenue total 380.00. COGS/inventory logic was not changed.

Fresh-source authenticated runtime: BANK_TRANSFER PASS, CARD PASS, CREDIT posting/AR linkage PASS, MANUAL authorized PASS, MANUAL unauthorized rejected PASS, FIXED client-price mismatch guard PASS. HYBRID authorized override remains unresolved; no production approval.

| Test | Scope | Status | Evidence / Notes |
|---|---|---|---|
| P4E-MIG-001 | Feature catalogue migration | PASS | POS resolved as `CURRENT`; barcode resolved as `FUTURE`; KAM override remained disabled. |
| P4E-FEATURE-001 | Feature API | PASS | Authorized feature read returned POS `CURRENT` and barcode `FUTURE`. |
| P4E-PRICE-001 | Price list | PASS | `GET /api/pos/prices` returned HTTP 200 and existing saleable products. |
| P4E-PRICE-002 | Create price | PASS | `POST /api/pos/prices` returned HTTP 201. |
| P4E-PRICE-003 | Read price | PASS | `GET /api/pos/prices/:productId` returned the configured price. |
| P4E-PRICE-004 | Update price | PASS | `PATCH /api/pos/prices/:productId` returned HTTP 200 with updated price. |
| P4E-PRICE-005 | Deactivate price | PASS | `DELETE /api/pos/prices/:productId` safely set `is_active=false`. |
| P4E-PRICE-006 | Missing-price POS guard | PASS | POS product had no active price and sale completion returned HTTP 400 with the configured-price message. |
| P4E-CLEAN-001 | Development cleanup | PARTIAL | POS restored disabled; active `NB-CLEAN` price `4,000.00` was preserved because its origin could not be confirmed as temporary. |
| P4E-BUILD-TS | Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false`. |
| P4E-BUILD-FE | Frontend production build | PASS | `npm.cmd run build`; existing chunk-size warning only. |
| P4E-BUILD-BE | Backend build/check | PASS | `npm.cmd run build`. |
| P4E-UI-001 | Browser UI smoke | NOT RUN | Setup feature toggle, Product Prices interaction, POS sidebar, and browser price editing remain manual approval items. |

## Phase 18 Final Runtime Matrix Checkpoint — 2026-09-20

| Test | Scope | Status | Evidence / Notes |
|---|---|---|---|
| P18-RO-DB-001 | Development database reachability and baseline | PASS | Read-only PostgreSQL diagnostics completed successfully; existing business data and POS objects were reachable. |
| P18-RO-DB-002 | POS feature/pricing baseline | PASS | POS and barcode are disabled for the active company; pricing mode is `FIXED`. No feature or pricing state was changed. |
| P18-RO-DB-003 | Existing POS audit baseline | PASS | Existing POS history contains 29 `POSTED` and 3 `VOID` sales; `sal.post_pos_sale` and `sal.void_pos_sale` are present. |
| P18-RO-DB-004 | Existing CREDIT linkage baseline | PASS | Four existing CREDIT POS sales have linked POS-sourced AR invoices in `OPEN` status. No receipts or applications were changed. |
| P18-STATIC-001 | Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false`. |
| P18-STATIC-002 | Frontend production build | PASS | `npm.cmd run build`; existing large-chunk warning only. |
| P18-STATIC-003 | Backend build | PASS | `npm.cmd run build`. |
| P18-STATIC-004 | Repository whitespace | PASS | `git diff --check`; line-ending warnings only. |
| P18-RUNTIME-001 | Changed-cost void, credit receipts/settlement, credit void matrix, reporting/cache transaction checks | BLOCKED | Requires an authenticated controlled POS session and approved development transaction execution; no such session was available in this run. |
| P18-UI-001 | Authenticated browser smoke, barcode, pricing modes, credit UI, receipt preview, existing KAM workflow | NOT RUN | In-app browser could not open local development app: `ERR_BLOCKED_BY_CLIENT` for both `localhost:3000` and `127.0.0.1:3000`. |

Phase 18 is not marked PASS. No deployment or commit was performed, and no production state was touched.

## Phase 19 Universal Customer Returns and POS/AR Void Safety — 2026-09-20

| Test | Scope | Status | Evidence / Notes |
|---|---|---|---|
| P19-MIGRATION-001 | Development migration application | PASS | `phase_19_universal_customer_returns.sql` applied to development PostgreSQL; production was not touched. |
| P19-VOID-GUARD-001 | Direct void of POS-linked AR | PASS | Transactional update was rejected with the POS-origin message and rolled back; no business state changed. |
| P19-RETURN-COST-001 | POSTED customer return exact cost/lot | PASS | Rolled-back CASH POS return preserved the original lot and `2,600.0000` unit cost in the CUSTOMER_RETURN movement. |
| P19-RETURN-SCHEMA-001 | Universal return schema and numbering | PASS | POS/DELIVERY source fields, lines, dispositions, statuses, refund state, indexes, and `RET-YYYYMMDD-NNNNNN` numbering are present. |
| P19-REPORT-001 | Return event reporting foundation | PARTIAL | Reporting view includes negative RETURN quantity/revenue/COGS events; dedicated dashboard and full report matrix remain runtime approval items. |
| P19-API-001 | Customer Returns API foundation | PASS | Source lookup, draft creation, and posting routes are implemented with permission checks; authenticated runtime matrix remains pending. |
| P19-UI-001 | Customer Returns UI | NOT RUN | Frontend page and navigation are implemented; authenticated browser smoke was unavailable because local browser access returned `ERR_BLOCKED_BY_CLIENT`. |
| P19-AR-UI-001 | Stale AR modal feedback | PASS | AR post/void mutation state is reset on selection/modal transitions; POS-linked AR void is blocked in the UI. |
| P19-FULL-MATRIX-001 | POS/DELIVERY, over-return, refund/credit, DAMAGED, void, and KAM matrix | NOT RUN | No authenticated controlled session was available; no production approval is claimed. |
| P19-BUILD-TS | Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false`. |
| P19-BUILD-FE | Frontend production build | PASS | `npm.cmd run build`; existing large-chunk warning only. |
| P19-BUILD-BE | Backend build and syntax | PASS | Backend build and route syntax checks passed. |
| P19-DIFF-001 | Repository whitespace | PASS | `git diff --check`; only normal line-ending warnings were reported. |
| P19-NB-CLEAN-001 | Existing active NB-CLEAN price | PASS | Active UGX 4,000 price was preserved because its origin remains unconfirmed; it was not deleted or overwritten. |

Known inconsistent `POS-20260918-000019` remains unrepaired. Recommended next step is an audit-approved, one-off development reconciliation after inspecting its existing AR/journal/movement state; no automatic repair or duplicate reversal was executed. Existing CREDIT-sale receipt/application data was also not fabricated or changed.

## Phase 19 Runtime Validation and Settlement Gap Analysis — 2026-09-20

| Test | Status | Evidence / Notes |
|---|---|---|
| P19-RUNTIME-CASH-PARTIAL-FULL | PASS | Rollback-contained POS CASH test posted 0.040 and 0.060 returns against a 0.100 sale; both retained the original lot and `2,600.0000` unit cost. |
| P19-RUNTIME-OVERRETURN | PASS | A further 0.001 attempt was rejected with `Return quantity exceeds remaining returnable quantity.` |
| P19-RUNTIME-MOVEMENT | PASS | Two CUSTOMER_RETURN movements totalled 0.100 in the rollback test; no test rows persisted. |
| P19-RUNTIME-CREDIT-UNPAID | PARTIAL | Foundation creates a balanced journal and marks `CREDIT_DUE`, but does not reduce AR invoice totals/outstanding balance or close the invoice. |
| P19-RUNTIME-CREDIT-PARTIAL-PAID | NOT RUN | No safe settlement implementation exists for applying a return first against outstanding AR and then creating any excess refund obligation. |
| P19-RUNTIME-CREDIT-FULL-PAID | NOT RUN | Refund/credit settlement is not implemented; historical receipts were not changed. |
| P19-RUNTIME-DELIVERY-KAM | NOT RUN | No authenticated controlled delivery/KAM return session was available. |
| P19-RUNTIME-RESTOCK | PARTIAL | RESTOCK targets the source location with the original lot/cost; live stock-cache/UI refresh was not authenticated-UI tested. |
| P19-RUNTIME-DAMAGED | PARTIAL | DAMAGED does not target normal sellable stock (`to_location_id` is NULL), but no quarantine/damaged location or follow-up workflow exists. |
| P19-RUNTIME-VOID | NOT IMPLEMENTED | No return-void endpoint/function exists; data was not deleted or simulated. |
| P19-RUNTIME-AR-GUARD | PASS | Database trigger and backend guard rejected direct void of POS-linked AR; normal non-POS behavior was not browser-tested. |
| P19-RUNTIME-AR-FEEDBACK | NOT RUN | Code reset logic is present; authenticated browser sequence A/B/C was blocked by local-browser `ERR_BLOCKED_BY_CLIENT`. |
| P19-RUNTIME-REPORTING-DASHBOARD | PARTIAL | Return events are included as negative sales/COGS in the event view; full report/dashboard double-counting and dashboard display matrix remains pending. |
| P19-RUNTIME-REFRESH | NOT RUN | Stock/POS/dashboard query invalidation requires authenticated UI validation. |
| P19-RUNTIME-REGRESSION | NOT RUN | Barcode/pricing, POS receipt, and existing KAM workflow regression was not re-executed in an authenticated browser session. |
| P19-STATIC-TS | PASS | `npx.cmd tsc -b --pretty false`. |
| P19-STATIC-FE | PASS | `npm.cmd run build`; existing large-chunk warning only. |
| P19-STATIC-BE | PASS | `npm.cmd run build`. |
| P19-STATIC-DIFF | PASS | `git diff --check`; normal line-ending warnings only. |

Settlement conclusion: the current return foundation is safe for controlled development inspection, but it is not production-ready for credit/refund settlement. The exact gaps are AR outstanding recalculation/credit-note integration, refund settlement for paid and over-outstanding returns, return voiding, quarantine handling, and authenticated UI/report/cache validation.

## Phase 19A Policy / Quarantine Validation — 2026-09-20

| Test | Status | Evidence / Notes |
|---|---|---|
| P19A-REPO-POLICY-001 | PASS | No existing formal configurable return/refund policy or Return Note model was found; no duplicate model was reused. |
| P19A-MIGRATION-001 | PASS | `phase_20_return_policy_refund_quarantine.sql` applied to development only. |
| P19A-POLICY-001 | PASS | One active business policy exists with conservative configurable defaults, including a 30-day default window. |
| P19A-REASONS-001 | PASS | Ten customer-return reasons seeded separately from inventory-adjustment reasons. |
| P19A-QUARANTINE-001 | PASS | `RETURN_QUARANTINE` location created as a traceable non-saleable location. |
| P19A-QUARANTINE-RUNTIME-001 | PASS | Rollback-contained DAMAGED/QUARANTINE return routed 0.010 quantity to quarantine with exact `2,600.0000` cost. |
| P19A-POLICY-API-001 | PARTIAL | Policy GET/PATCH API and permissions added; authenticated API/UI execution remains pending. |
| P19A-RETURN-NOTE-001 | PARTIAL | Printable Return Note data endpoint and frontend print action added; formal POS thermal and KAM A4 layout approval remains pending. |
| P19A-REFUND-001 | PARTIAL | Refund settlement table/numbering foundation added; safe monetary journal settlement and AR adjustment remain open. |
| P19A-VOID-001 | NOT IMPLEMENTED | Return void/reversal was not fabricated or implemented without a complete refund-reversal model. |
| P19A-STATIC-TS | PASS | Frontend TypeScript passed. |
| P19A-STATIC-FE | PASS | Frontend production build passed; existing large-chunk warning only. |
| P19A-STATIC-BE | PASS | Backend syntax/build passed. |
| P19A-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Phase 19A is not production-ready. Businesses must configure policy according to applicable consumer law and contractual terms; the default template is not a jurisdictional legal-compliance claim.

## Phase 19B Settlement and Reversal Validation — 2026-09-20

| Test | Status | Evidence / Notes |
|---|---|---|
| P19B-AR-UNPAID-PARTIAL | PASS | Rollback test returned 200.00 from a 400.00 unpaid POS CREDIT sale; AR credit was capped at 200.00, refund due remained zero, invoice remained OPEN. |
| P19B-AR-UNPAID-FULL | PASS | Rollback test returned the full 400.00 unpaid POS CREDIT sale; AR reached PAID without creating a cash refund. |
| P19B-AR-FULLY-PAID | PASS | Fully paid POS CREDIT return created 400.00 refund due while preserving receipt history and AR at settled state. |
| P19B-REFUND-PARTIAL-FINAL | PASS | Refund settlement test posted RFD records for 100.00 then 300.00; remaining due moved to zero and status to SETTLED. |
| P19B-REFUND-OVERPAY | PASS | A further 1.00 refund was rejected as exceeding remaining refund due. |
| P19B-REFUND-JOURNAL | PASS | Refund journals use the configured REFUND_PAYABLE mapping and payment account and are balanced. |
| P19B-RETURN-VOID | PASS | Rollback test preserved the return as VOID, created reversal journal/movement, zeroed refund due, and retained original records. |
| P19B-VOID-AFTER-REFUND | PASS BY GUARD | Function blocks void when any posted refund settlement exists; full authenticated route test remains pending. |
| P19B-RESTOCK-REVERSAL | PASS | Void reversal removes returned quantity using a new exact-cost movement; historic movement remains intact. |
| P19B-QUARANTINE-REVERSAL | PARTIAL | Generic movement reversal is implemented; dedicated authenticated quarantine-void runtime remains pending. |
| P19B-WRITE-OFF | BLOCKED | No safe write-off accounting workflow was silently invented; production posting policy requires explicit follow-up. |
| P19B-DELIVERY-KAM | NOT RUN | Authenticated controlled delivery/KAM data path remains pending. |
| P19B-POS-REGRESSION | PARTIAL | Database rollback checks passed; authenticated receipt/report/cache UI regression remains pending. |
| P19B-POLICY | PARTIAL | Server-side policy/reason/exception enforcement remains present; within/outside-window runtime matrix remains pending. |
| P19B-STATIC-TS | PASS | Frontend TypeScript passed. |
| P19B-STATIC-FE | PASS | Frontend production build passed; existing large-chunk warning only. |
| P19B-STATIC-BE | PASS | Backend build and route syntax passed. |
| P19B-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Phase 19B is not production-ready until authenticated delivery/KAM, reporting/dashboard/cache, Return Note layouts, and full browser approval are completed.

## Phase 19C Final Runtime/UI Acceptance — 2026-09-20

| Acceptance | Status | Actual Evidence |
|---|---|---|
| P19C-WRITE-OFF | PASS | Development transaction rejected WRITE_OFF with the controlled-workflow error; transaction rolled back and no side effect persisted. |
| P19C-POLICY-UI | NOT RUN | Frontend acceptance page was blank in the local browser; no authenticated policy UI was available. |
| P19C-POS-CASH-UI | NOT RUN | No authenticated usable frontend surface; database rollback tests remain the evidence for cash return mechanics. |
| P19C-CREDIT-UI | NOT RUN | No authenticated usable frontend surface. Database settlement tests passed separately. |
| P19C-REFUND-UI | NOT RUN | No authenticated usable frontend surface. Database partial/final/overpayment tests passed separately. |
| P19C-VOID-UI | NOT RUN | No authenticated usable frontend surface. Database void and refund-after-void guard tests passed separately. |
| P19C-QUARANTINE-UI | NOT RUN | Quarantine API/database path exists; browser acceptance and POS availability check were not executable. |
| P19C-RETURN-NOTE-POS-80MM | NOT RUN | Current frontend print action is a foundation, not a verified thermal layout. |
| P19C-RETURN-NOTE-KAM-A4 | NOT RUN | No authenticated KAM Return Note page/layout was available. |
| P19C-DELIVERY-PARTIAL-FULL | NOT RUN | Controlled authenticated Delivery/KAM runtime data path was unavailable. |
| P19C-REPORTING-EXACT-FIGURES | NOT RUN | No final browser-controlled POS+Delivery matrix was available for exact dashboard reconciliation. |
| P19C-DASHBOARD-CACHE | NOT RUN | No authenticated UI surface was available to verify targeted refetch without manual reload. |
| P19C-AR-STALE-MESSAGE | NOT RUN | Code-level reset remains present; browser sequence A/B/C could not be executed. |
| P19C-AR-VOID-GUARD | PASS-DB | Development database/backend guard remains validated; browser regression not run. |
| P19C-PRICING-BARCODE | NOT RUN | No authenticated browser acceptance surface. NB-CLEAN UGX 4,000 remains preserved. |
| P19C-KAM-SMOKE | NOT RUN | Existing KAM module smoke suite was not run through an authenticated browser. |
| P19C-PERMISSIONS | PARTIAL | Server-side permissions are present; authenticated unauthorized-user matrix was not run. |
| P19C-AUDIT | PARTIAL | Settlement, reversal, and policy fields are persisted; full audit-event/browser evidence remains pending. |
| P19C-STATIC-TS | PASS | Frontend TypeScript passed. |
| P19C-STATIC-FE | PASS | Frontend build passed; existing large-chunk warning only. |
| P19C-STATIC-BE | PASS | Backend build and syntax passed. |
| P19C-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Browser evidence: after the recovery patch, the existing authenticated Vite session rendered Dashboard, Setup, and Customer Returns. That session targeted an older backend on port 3000, where the current return-source request returned HTTP 404. The current backend on port 3001 returned the same controlled POS source with HTTP 200, but the fresh frontend origin had no authenticated session. No financial UI action was submitted.

## Phase 19D Frontend Recovery — 2026-09-20

| Test | Status | Evidence |
|---|---|---|
| P19D-FE-ROOT | PASS | Authenticated Vite session rendered Dashboard after hardening `hasRole()` against missing role arrays. |
| P19D-FE-SETUP | PASS | Setup rendered feature controls, Product Prices, Business Profile, and active NB-CLEAN UGX 4,000. |
| P19D-FE-RETURNS | PASS | Customer Returns rendered POS/Delivery selector, source input, and Load source control. |
| P19D-API-SOURCE | PASS | Current backend on port 3001 returned controlled POS source HTTP 200 with sale, line, lot, quantity, and price. |
| P19D-API-OLD-BACKEND | FAIL/ENVIRONMENT | Existing port-3000 backend returned HTTP 404 for the current customer-return source route. |
| P19D-FINANCIAL-UI | NOT RUN | No authenticated browser session was available on the current backend origin; no financial UI action was submitted. |
| P19D-POLICY-UI | SUPERSEDED | The missing Setup surface was implemented below; authenticated browser save/reload remains separately tracked as P19D-POLICY-SAVE-RELOAD. |
| P19D-STATIC-TS | PASS | Frontend TypeScript passed after the recovery patch. |
| P19D-STATIC-FE | PASS | Frontend build passed after the recovery patch. |
| P19D-STATIC-BE | PASS | Backend build/syntax passed. |
| P19D-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Recovery conclusion: ERR-P4-RET-010 is resolved for the authenticated shell; current-backend browser integration and all financial UI acceptance remain pending.

## Phase 19D Return Policy UI Exposure — 2026-09-20

| Test | Status | Evidence |
|---|---|---|
| P19D-POLICY-API-REUSE | PASS | Setup uses the existing `GET /api/return-policy` and `PATCH /api/return-policy` helpers and endpoints. |
| P19D-POLICY-FIELDS | PASS | All implemented policy fields are represented in the new Return & Refund Policy section. |
| P19D-POLICY-VALIDATION | PASS | Frontend guards return window and refund processing days as non-negative integers and restocking fee percent to 0–100; backend remains authoritative. |
| P19D-POLICY-PERMISSIONS | PARTIAL | Save is gated by existing Setup edit roles and the API requires `EDIT_RETURN_POLICY`; authenticated unauthorized-role runtime testing remains pending. |
| P19D-POLICY-SAVE-RELOAD | NOT RUN | No authenticated browser session on the current frontend/backend origin was available for a manual save/reload confirmation. |
| P19D-STATIC-TS | PASS | `npx.cmd tsc -b --pretty false` passed. |
| P19D-STATIC-FE | PASS | `npm.cmd run build` passed; existing large-chunk warning only. |
| P19D-STATIC-BE | PASS | `npm.cmd run build` passed. |
| P19D-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

The previously identified missing Return Policy UI blocker is corrected in the working tree. Manual browser confirmation is still required before production approval.

## Phase 19D Customer Return UI / Post / Return Note Corrections — 2026-09-20

| Test | Status | Evidence |
|---|---|---|
| P19D-RET-UUID-INPUT | PASS-CODE | Source endpoint accepts document number lookup and resolves internal UUID; UUID compatibility remains available. |
| P19D-RET-QTY-FRONTEND | PASS-CODE | Source table shows sold/previously returned/returnable quantities, inline positive/bounds validation, and disables draft creation while invalid. |
| P19D-RET-QTY-BACKEND | PASS-CODE | Draft route independently compares requested quantity to source remaining quantity and returns a 400 error when exceeded. Existing post SQL guard remains authoritative. |
| P19D-RET-DRAFT-POST | PASS-CODE | Stored return ID drives posting; draft/status display, loading state, duplicate-click guards, success, and error feedback were added. |
| P19D-RET-ORIGINAL-QTY | PASS-CODE | Draft persistence now uses source sold quantity and unit price; Return Note distinguishes original, prior, current, and remaining quantities. |
| P19D-RET-NOTE-POS | PASS-CODE | Formatted 80mm thermal POS Return Note implemented. |
| P19D-RET-NOTE-DELIVERY | PASS-CODE | Formatted Delivery/KAM A4 Return Note implemented. |
| P19D-RET-PRINT-GUARD | PASS-CODE | Draft action is Preview Return Note with DRAFT watermark; final label is available after POSTED. |
| P19D-RET-0.500 | NOT RUN | Controlled authenticated runtime test against POS-20260920-000040 remains pending. |
| P19D-RET-0.050 | NOT RUN | Controlled valid draft/post and Return Note runtime test remains pending. |
| P19D-RET-STOCK-ACCOUNTING | NOT RUN | Requires authenticated controlled post and database reconciliation. |
| P19D-RET-CACHE | PASS-CODE | Post success invalidates source, returns, inventory, stock-on-hand, POS products, and dashboard query keys. |
| P19D-RET-STATIC-TS | PASS | `npx.cmd tsc -b --pretty false` passed. |
| P19D-RET-STATIC-FE | PASS | `npm.cmd run build` passed; existing large-chunk warning only. |
| P19D-RET-STATIC-BE | PASS | `npm.cmd run build` passed. |
| P19D-RET-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Browser acceptance is intentionally not marked PASS until the controlled 0.500 rejection, 0.050 valid return, stock/accounting, and print-layout flows are manually retested.

## Phase 19D Document-Number Source Lookup — 2026-09-20

| Test | Status | Evidence |
|---|---|---|
| P19D-LOOKUP-ROOT-CAUSE | PASS-CODE | Route now validates UUID shape before UUID compatibility lookup and resolves document numbers separately. |
| P19D-LOOKUP-POS | NOT RUN | `POS-20260920-000040` authenticated HTTP 200 retest remains pending. |
| P19D-LOOKUP-DELIVERY | NOT RUN | Known development Delivery document-number lookup remains pending. |
| P19D-LOOKUP-NOT-FOUND | PASS-CODE | Unknown POS/Delivery identifiers return source-specific 404 messages; raw UUID-cast errors are no longer exposed. |
| P19D-LOOKUP-ELIGIBILITY | PASS-CODE | Existing POSTED-only source filters and returnable-line calculations remain in place. |
| P19D-LOOKUP-UUID-COMPAT | PASS-CODE | Valid UUID input continues through the resolved UUID path. |
| P19D-LOOKUP-BACKEND | PASS | Backend build and route syntax checks passed. |
| P19D-LOOKUP-TS | PASS | Frontend TypeScript passed. |
| P19D-LOOKUP-FE | PASS | Frontend build passed; existing large-chunk warning only. |
| P19D-LOOKUP-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Browser/API acceptance is intentionally not marked PASS until the exact POS and Delivery document-number lookups are manually retested.

## Phase 19D Customer Return POST API UUID Fix — 2026-09-20

| Test | Status | Evidence |
|---|---|---|
| P19D-POST-ROUTE | PASS-CODE | Route is `POST /api/customer-returns/:id/post` and calls `sal.post_customer_return($1::uuid)` only after return-ID validation. |
| P19D-POST-ROOT-CAUSE | PASS-CODE | Empty string came from `req.user?.user_id || ""` used for `app.current_user_id`; direct SQL function execution was already successful. |
| P19D-POST-UUID-NORMALIZATION | PASS-CODE | Optional user UUID is normalized; empty/invalid values are not passed to PostgreSQL. |
| P19D-POST-ERROR-HYGIENE | PASS-CODE | Invalid IDs receive a clear 400 message and database details are logged/sanitized. |
| P19D-POST-RET-20260920-000020 | NOT RUN | Authenticated API/browser retest remains pending; no new posting transaction was submitted. |
| P19D-POST-DB-SIDE-EFFECTS | NOT RUN | Stock movement, journal, and posted-field verification remain pending with the API retest. |
| P19D-POST-STATIC-BE | PASS | Backend build and route syntax checks passed. |
| P19D-POST-STATIC-TS | PASS | Frontend TypeScript passed. |
| P19D-POST-STATIC-FE | PASS | Frontend build passed; existing large-chunk warning only. |
| P19D-POST-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Direct SQL function success is recorded as evidence; manual/API acceptance is intentionally not marked PASS until RET-20260920-000020 is retested end to end.

## Phase 19D Current User UUID Session Context — 2026-09-20

| Test | Status | Evidence |
|---|---|---|
| P19D-CONTEXT-DEFINITION | PASS | Live definition was confirmed as direct `current_setting(... )::uuid`; migration now uses `NULLIF(btrim(...),'')::uuid`. |
| P19D-CONTEXT-ABSENT | PASS-DB | Rollback-contained test returned NULL. |
| P19D-CONTEXT-EMPTY | PASS-DB | Rollback-contained empty-setting test returned NULL instead of 22P02. |
| P19D-CONTEXT-WHITESPACE | PASS-DB | Rollback-contained whitespace-setting test returned NULL. |
| P19D-CONTEXT-VALID | PASS-DB | Valid UUID returned unchanged. |
| P19D-CONTEXT-AUTH-SOURCE | PASS-CODE | `auth.routes.js` signs `user.user_id` as `req.user.user_id`; shared context helper uses that property. |
| P19D-CONTEXT-API-POST | PASS-DB/API | New controlled API post returned HTTP 200 and POSTED status. |
| P19D-CONTEXT-AUDIT | PASS-DB | `posted_by` and stock `created_by` equal authenticated UUID `235bcfd6-bef8-4103-ad29-7a41f04d2fd4`. |
| P19D-CONTEXT-STOCK | PASS-DB | CUSTOMER_RETURN movement qty 0.050, NB-CLEAN, original lot, unit cost 2600.0000, destination `FG_STORE`. |
| P19D-CONTEXT-JOURNAL | PASS-DB | Posted journal balanced: debit 330.00, credit 330.00. |
| P19D-CONTEXT-SOURCE | PASS-DB/API | POS-20260920-000040 lookup returned 200; cumulative returned quantity is now 0.100. |
| P19D-CONTEXT-STATIC-BE | PASS | Backend build and route syntax checks passed. |
| P19D-CONTEXT-STATIC-TS | PASS | Frontend TypeScript passed. |
| P19D-CONTEXT-STATIC-FE | PASS | Frontend build passed; existing large-chunk warning only. |
| P19D-CONTEXT-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

The initial target draft ID `6c0fb770-306a-4dae-8ffa-cdfdc4e4fd17` was already posted during the pre-fix development attempt and has NULL audit fields; it was not altered. The new controlled post validates the corrected path without rewriting historical test data. Browser UI acceptance remains pending.

## Phase 19D Reports and AR SQL Syntax Regression Validation — 2026-09-21

  | Test | Status | Evidence |
  |---|---|---|
  | P19D-SQL-DORMANT | PASS-DB | Corrected dormant-customers SQL executed against development PostgreSQL; returned `customer_code`, `customer_name`, `last_purchase_date`, `days_since_last_purchase`, `last_purchase_value`, and `status`. |
  | P19D-SQL-RFM | PASS-DB | Corrected customer-rfm SQL executed; returned RFM values and `segment`. |
  | P19D-SQL-REPORTS | PASS-DB | Customer weekly performance, weekly sales/product, weekly profit/product, weekly management summary, and customer concentration executed successfully with expected fields. |
  | P19D-SQL-AR-SUMMARY | PASS-DB | AR summary executed successfully; returned `pos_sale_no`, totals, payment, and balance fields. 231 rows returned in development. |
  | P19D-API-AUTH | NOT RUN | Existing browser session is unauthenticated at `/login`; credentials were not provided. |
  | P19D-BROWSER | NOT RUN | Reports and AR Invoices browser retest remains required after authenticated login. |
  | P19D-STATIC-BE | PASS | `npm.cmd run build` passed; report and AR route syntax checks passed. |
  | P19D-STATIC-TS | PASS | `npx.cmd tsc -b --pretty false` passed. |
  | P19D-STATIC-FE | PASS | `npm.cmd run build` passed. |
  | P19D-STATIC-DIFF | PENDING | Run after documentation edits. |

  Development database only; production was not touched.
## Phase 19D Delivery Return Lookup and History Validation — 2026-09-21

| Test | Status | Evidence |
|---|---|---|
| P19D-DELIVERY-STATE | PASS-DB | `DEL-20260914-104214` is `DELIVERED`, `is_posted=true`, with posted movement `353a7a4a-d5a6-40d2-910b-f91541fb5c4f`; no status mutation performed. |
| P19D-DELIVERY-SOURCE-SQL | PASS-DB | Corrected source query returned one source: mama Jerry, Yellow Beans Clean / YB-CLEAN, 35 KG, UGX 4,400, previously returned 0, returnable 35, original unit cost 3,600, and original location identifier. |
| P19D-RETURNS-HISTORY-SQL | PASS-DB | Aggregate history query returned 6 persisted returns with return value, refund, disposition, quarantine, and operator fields; RET-20260921-000023 and RET-20260921-000025 are present. |
| P19D-RETURNS-SUMMARY-SQL | PASS-DB | Summary query returned total/post/draft/void counts, return value, refund due/settled, quarantine quantity/value. |
| P19D-DELIVERY-API | NOT RUN | Authenticated API test requires an authenticated session; available browser session is at login and no credentials were supplied. |
| P19D-RETURNS-BROWSER | NOT RUN | Manual Delivery lookup, history, detail, and action retest remains required. |
| P19D-STATIC-BE | PASS | Backend route syntax and `npm.cmd run build` passed. |
| P19D-STATIC-TS | PASS | `npx.cmd tsc -b --pretty false` passed. |
| P19D-STATIC-FE | PASS | `npm.cmd run build` passed. |
| P19D-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Historical test data was not repaired or deleted. Development only; production untouched.
## Phase 23 Return Settlement Journal Fix — 2026-09-22

| Test | Status | Evidence |
|---|---|---|
| P23-LIVE-DEFINITIONS | PASS-DB | Live function and trigger definitions confirmed the duplicate-entry path. |
| P23-FAILED-DRAFT-ATOMICITY | PASS-DB | Before correction, target return was DRAFT with NULL movement/journal IDs and no orphan. |
| P23-FULLY-PAID-DELIVERY | PASS-DB | Target posted successfully; invoice remains PAID; refund due UGX 2,200, settled UGX 0. |
| P23-JOURNAL | PASS-DB | Dr Sales Returns 2,200; Dr Inventory 1,800; Cr COGS 1,800; Cr Refunds Payable 2,200; totals UGX 4,000/4,000. |
| P23-STOCK | PASS-DB | One YB-CLEAN CUSTOMER_RETURN movement, qty 0.500, original lot and UGX 3,600 cost preserved. |
| P23-RECEIPT | PASS-DB | Invoice remains PAID; no refund settlement was created. |
| P23-STATIC-BE | PASS | `npm.cmd run build` passed. |
| P23-STATIC-TS | PASS | `npx.cmd tsc -b --pretty false` passed. |
| P23-STATIC-FE | PASS | `npm.cmd run build` passed; existing large-chunk warning only. |
| P23-STATIC-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |

Development only; manual authenticated Delivery browser retest remains required.

## Customer Return Details and Authorized Refund UI — 2026-09-22

| Test | Status | Evidence |
|---|---|---|
| P19D-RET-UI-DETAIL | PASS-CODE | Shared Return Details dialog is used by View and row double-click; View remains keyboard/touch accessible. |
| P19D-RET-UI-REFUND | PASS-CODE | Process Refund is shown only for POSTED returns with remaining due and `PROCESS_REFUND` role access. |
| P19D-RET-UI-HISTORY | PASS-CODE | Refund history renders refund number, date, amount, method, reference, processor, status, and journal. |
| P19D-RET-UI-STATUS | PASS-CODE | `REFUND_DUE` and `DUE` normalize to DUE without rewriting persisted data. |
| P19D-RET-UI-BACKEND-AUTH | PASS-CODE | Existing endpoint uses `requireAuth` plus `requirePermission('PROCESS_REFUND')`; unauthorized API calls remain 403. |
| P19D-RET-UI-STATIC-BE | PASS | `npm.cmd run build` passed. |
| P19D-RET-UI-STATIC-TS | PASS | `npx.cmd tsc -b --pretty false` passed. |
| P19D-RET-UI-STATIC-FE | PASS | `npm.cmd run build` passed; existing large-chunk warning only. |
| P19D-RET-UI-DIFF | PASS | `git diff --check` passed with normal line-ending warnings only. |
| P19D-RET-UI-MANUAL | NOT RUN | Authenticated browser View, double-click, partial refund, final refund, overpayment, and unauthorized-user tests remain required. |
# Phase 24 — Multi-Location Foundation (2026-09-22)

| Check | Status | Notes |
|---|---|---|
| Migration / development DB foundation | PASS | `phase_24_multi_location_foundation.sql` applied to documented development `kam_grains_db`; original seven locations retained and FG_STORE default verified. |
| Soft limit / quarantine guards | PASS | Rollback-only development DB check created temporary branch/warehouse, verified limit rejection and RETURN_QUARANTINE saleable protection, then rolled back. |
| Locations API smoke / scope | PASS | Admin GET returned 200 with seven locations/default; Sales-role GET for an unassigned location returned 403. |
| POS and operational authorization matrix | NOT RUN | Branch A/B posting and unauthorized cases remain manual/runtime tests. |
| Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` (2026-09-22). |
| Frontend build | PASS | `npm.cmd run build` (2026-09-22); existing large-chunk warning. |
| Backend build / changed-route syntax | PASS | `npm.cmd run build` and `node --check` for changed routes (2026-09-22). |
| Repository diff check | PASS | `git diff --check` (2026-09-22); line-ending warnings only. |
| Browser location management/current location | NOT RUN | Setup type/default controls and POS selector are implemented; authenticated browser session required. |

# Phase 25 — Multi-Branch Operations Foundation (2026-09-22)

| Check | Status | Evidence |
|---|---|---|
| Phase 25 migration | PASS | Applied to documented development `kam_grains_db`; verified one KAM default branch, eight branch locations including transit, and two active user-branch mappings. |
| Preservation/backfill | PASS-SCHEMA | Existing location IDs retained; legacy data mapped to KAM under the inspected single-branch history assumption. |
| Transfer stock/cost/lot SQL path | PASS-ROLLBACK | Development transaction fixture moved 0.001 KG from KAM FG_STORE through KAM transit to a temporary Branch B warehouse; both movement lines retained the same lot and unit cost and transfer reached RECEIVED; the fixture and movements were rolled back. Route-level authorization/API path and no-P&L assertion remain untested. |
| Browser UI smoke | NOT RUN | Read-only browser inventory showed no open tabs in the Codex in-app browser. No login or browser session was available. |
| Branch/transfer route runtime | NOT RUN | No authenticated API or browser exercise performed. |
| POS A/B, SO/Delivery, AR/Receipt | NOT RUN | Branch fixtures and operational posting assertions required. |
| PO/GRN/AP | NOT RUN | Receiving-branch and accounting assertions required. |
| Returns/refunds, inventory/counts/adjustments, cleaning | NOT RUN | Isolation and Phase 23 settlement regression required. |
| Transfers, finance, reports/dashboard | NOT RUN | Lot/cost conservation, balanced finance, branch/consolidated totals required. |
| Restricted, multi-branch, HQ, single-branch and Phase 4 regressions | NOT RUN | Authenticated user/Branch A/B matrix required. |
| Backend build | PASS | `npm.cmd run build`; note repository script checks `src/server.js` only. |
| Frontend TypeScript/build | PASS | `npx.cmd tsc -b --pretty false` and `npm.cmd run build` passed after fixing operating-context query typing; Vite emitted the existing >500 kB chunk warning. |
| Changed route syntax | PASS | `node --check` passed for branches, transfers, locations, POS, Sales Orders, Purchase Orders, and location access middleware. |
| `git diff --check` | PASS | Completed with normal Git line-ending warnings only. |
| Production/deployment/commit | NOT TOUCHED | Development DB only; no deployment or commit. |


## Phase 5 Acceptance — Runtime, Security and Regression Validation — 2026-09-22

| Area | Status | Evidence / remaining work |
|---|---|---|
| Controlled A/B context fixture | PASS-ROLLBACK | Development-only transaction created temporary Branch A/B, SHOP and WAREHOUSE each, restricted and multi-branch assignments, and identical 0.001 KG product/lot/cost stock rows. Scope queries returned 1 branch/1 location for restricted and 2/2 for multi-branch user. Transaction rolled back; no fixtures retained. SQL fixture evidence only, not authenticated API/UI proof. |
| Branch/location selector and defaults | NOT RUN | No authenticated browser session; switching/refetch and single-branch UX remain pending. |
| Read-route security code audit | PASS-CODE / API PENDING | Added guards/scopes for POS, SO/PO (existing), delivery, AR/AP invoices/payments, GRN, journals/expense vouchers, inventory/movements, counts/adjustments, cleaning and customer returns/refunds. Direct cross-branch UUID/query attack tests have not been exercised through authenticated HTTP. |
| Inactive branch/location guard | PASS-CODE / API PENDING | Shared context middleware now requires requested/default branches and any requested locations' owning branches to be active. Inactive/wrong-branch/transit/quarantine endpoint attacks have not been exercised through authenticated HTTP. |
| Write-route security | PASS-CODE / API PENDING | Request branch/location scope and source-record guards added to touched routes. Cross-branch create/post/receive/adjust/refund attacks, inactive/wrong-branch/transit/quarantine location rejection, and double receive remain untested via HTTP. |
| AR payment application boundary | PASS-CODE / API PENDING | Source-derived branch/location validation added before receipt allocation; authenticated attack test pending. |
| AP payment application boundary | PASS-CODE / API PENDING | Source-derived GRN branch/location validation inspected; API test pending. |
| POS A/B sale and Phase 4 regression | NOT RUN | No API/browser sale; branch attribution, stock isolation, lot/cost, finance, AR, reporting and void/receipt regression unproven. |
| SO / Delivery / AR / Receipt | NOT RUN | No end-to-end API/browser test. |
| PO / GRN / AP / AP payment | NOT RUN | No end-to-end receiving/accounting test. |
| Customer returns / refund / quarantine | NOT RUN | Route scope reviewed and patched; return, settlement, permission, stock and audit regression not run. |
| Transfer conservation | PASS-ROLLBACK (SQL) | Prior test transferred 0.001 KG KAM FG_STORE → source transit → temporary Branch B warehouse, retaining lot/cost and RECEIVED state, then rolled back. No journal/P&L assertion or route/API authorization test was recorded; zero P&L is not certified. |
| Inventory counts / adjustments | NOT RUN | No workflow run. |
| Cleaning | PASS-CODE / API PENDING | Final route audit found list, summary, detail, create, post and delete service methods omitted branch/location scope. Added current-branch and user-location constraints plus active-location checks for writes; authenticated workflow and cost/quantity regression remain untested. |
| Expense / finance dimensions | PASS-CODE / API PENDING | Expense voucher and payment headers persist branch IDs; journal list scoped. Branch dimensions through Delivery, GRN, refund and posting are not comprehensively proven. |
| Branch P&L / reporting | BLOCKED BY SAFE GATING | General reports, finance aggregates, Dashboard and GRN variance remain HEAD_OFFICE-only because underlying SQL branch filters are unproven. No branch/consolidated totals were validated. |
| Audit trail dimensions | NOT RUN | Assignment, sale, delivery, refund, transfer and adjustment audit records not inspected end-to-end. |
| Number uniqueness | NOT RUN / GAP | Global uniqueness across concurrent branches was not audited. Existing numbering unchanged; not certified. |
| Master data level | PASS-DESIGN | Products, customers, suppliers, units, categories and chart of accounts remain company-shared by design; workflow integrity pending. |
| Admin UI | PASS-CODE / BROWSER PENDING | Setup branch/location assignment panel added using existing APIs; save/default/role behavior not browser-tested. |
| Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` passed (2026-09-22). |
| Frontend build | PASS | `npm.cmd run build` passed (2026-09-22); existing large bundle warning. |
| Backend build | PASS | `npm.cmd run build` passed; script checks `src/server.js` only. |
| Route syntax | PASS | `node --check` passed for every backend route and locationAccess middleware. |
| `git diff --check` | PASS | Passed after trailing blank lines were removed; normal LF/CRLF notices only. |
| Production / deployment / commit | NOT TOUCHED | Development only; no deployment or commit. |

### Manual Browser Acceptance Checklist

1. Verify the branch selector and the locations shown for the selected branch.
2. Sign in as a restricted user and confirm only assigned branch/location data is visible.
3. Sign in as a multi-branch user, switch A↔B, and confirm the selected location follows.
4. Sign in as HEAD_OFFICE and confirm cross-branch access still follows endpoint permissions.
5. Post a POS sale in A and then B; confirm stock isolation and correct branch context.
6. Dispatch a transfer and receive it with an authorized destination-branch user.
7. Switch branches on Inventory and confirm rows refresh without stale values.
8. Switch branches on Reports and confirm only supported branch-safe reports are available.
9. Switch branches on Dashboard and confirm each branch's scoped totals refresh without stale values.
10. In Setup, assign/revoke a user branch and location, change defaults, then reload and verify.
11. As restricted user, try a known Branch B document/location URL or submission and confirm denial.
12. Confirm one-branch KAM navigation and POS/order/return pages remain usable without extra branch steps.

### 2026-09-22 — Dashboard Branch-Scoping Fix

| Check | Status | Evidence / limitation |
|---|---|---|
| Dashboard endpoint and metrics review | PASS (code review) | `GET /api/dashboard/summary`; inventory, sales, AR, AP, cash, income/expense, cleaning, PO, GRN, deliveries, recent stock movements/invoices/receipts, and four operational alert counts. |
| Branch query attribution | PASS (code review) | Inventory by active saleable stock-holding location; sales/AR by invoice delivery or credit-POS source location; AP by AP invoice→GRN→location; GL by journal branch; cleaning by both raw/finished locations; PO by PO branch; GRN/delivery by location; movements by from/to locations; receipts by payment branch; alerts by source branch/location. |
| Development schema evidence | PASS (read-only inspection) | `sal.pos_sale` has `location_id` and no `branch_id`; `inv.v_stock_on_hand` exposes location; GL journals currently have branch attribution. No migration/view change required. |
| Restricted Branch A API returns 200 | NOT RUN | No authenticated API session/token available in this execution. |
| Restricted Branch A requesting Branch B returns 403 | NOT RUN | No authenticated API session/token available. Middleware rejects unauthorized branch IDs; endpoint rejects query/header mismatch. |
| HEAD_OFFICE selected branch / consolidated | CODE REVIEW | HEAD_OFFICE still needs `VIEW_ONLY`; selected branch is returned. No consolidated mode exists in the Dashboard UI. |
| A↔B selector switch/refetch | CODE REVIEW | Shared operating context provides branch ID; Dashboard query key includes branch ID and API sends it in both query and header. |
| Branch A/B distinguishable fixture | NOT RUN | No A/B operational data fixture was created for this targeted fix. |
| Backend build | PASS | `npm.cmd run build` passed (script runs `node --check src/server.js`). |
| Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` passed. |
| Frontend build | PASS | `npm.cmd run build` passed; Vite reports the existing >500 kB chunk warning. |
| `git diff --check` | PASS | No whitespace errors; standard LF/CRLF notices only. |
| Manual browser Dashboard retest | REQUIRED | Authenticated visual/API retest remains outstanding. |

### 2026-09-22 — Ambiguous Locations Query Fix

| Check | Status | Evidence / limitation |
|---|---|---|
| Location query qualification | PASS | All selected `app.location l` fields use `l.`; branch display columns use `b.`. Ambiguous original names were `company_id`, `branch_id`, `is_active`, `address`, `phone`, `email`, `created_at`, `updated_at`. |
| Exact SQL against development DB | PASS (read-only SQL) | Ran the fixed endpoint SELECT with supplied user `235bcfd6-bef8-4103-ad29-7a41f04d2fd4`, branch `7739b68b-6f16-4f67-9713-b29b2748d46e`, and restricted-scope flags; returned seven authorized active location rows with branch code KAM. This was a direct SQL check, not an authenticated HTTP request. |
| Locations endpoint authenticated HTTP result | NOT RUN | Current browser session has no open authenticated browser tab/session. |
| Location defaults/selector | CODE REVIEW | Shared operating context selects an authorized stored location, branch/company default, user default, saleable location, then first authorized location; the header offers a selector when multiple authorized locations are available. No unauthorized fallback is introduced. |
| No authorized location | CODE REVIEW | Operating context remains `currentLocation: null`; app shell now displays “No authorized operating location is configured for this branch” with Setup guidance. GET locations suppresses raw database error details. |
| Similar Phase 24/25 joins | REVIEWED | `stockTransfers.routes.js` qualifies joined location/branch fields. `branches.routes.js` qualifies both branch and location fields. No other confirmed ambiguous select list found in searched location/branch joins. |
| Dashboard retest | NOT RUN | No authenticated browser/API session available. Dashboard runtime PASS is not claimed. |
| Backend build | PASS | `npm.cmd run build` passed; `node --check src/routes/locations.routes.js` also passed. |
| Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` passed. |
| Frontend build | PASS | `npm.cmd run build` passed; Vite reports the existing >500 kB bundle warning. |
| `git diff --check` | PASS | No whitespace errors; standard LF/CRLF notices only. |
# Phase 5 reporting/finance + POS A/B acceptance — 2026-09-22

| Acceptance item | Result | Evidence / limit |
|---|---|---|
| General Ledger branch SQL | PASS (direct read-only DB query) | 2,058 rows for selected KAM branch. Authenticated HTTP response NOT RUN. |
| Trial Balance branch SQL | PASS (direct read-only DB query) | 22 rows; debit and credit totals each 179,367,827.10; difference 0. Authenticated HTTP response NOT RUN. |
| Profit & Loss branch SQL | PASS (direct read-only DB query) | 13 rows; income 30,333,141.60; expenses 28,275,624.70; net profit 2,057,516.90. Account 5000 is treated as COGS; no non-operating classification exists, so operating profit equals net profit. |
| Balance Sheet branch SQL | PASS (direct read-only DB query) | 22 rows; assets 334,947.20; liabilities plus equity including calculated current earnings 334,947.20 (floating-point difference under 0.000001). Shared chart balances are not allocated. |
| Cashbook branch SQL | PASS (direct read-only DB query) | 383 rows. Authenticated HTTP response NOT RUN. |
| Customer weekly performance | PASS (direct read-only DB query) | 1 grouped row for the selected week/branch. Authenticated HTTP response NOT RUN. |
| Dormant customers | PASS (direct read-only DB query) | 42 rows. Authenticated HTTP response NOT RUN. |
| Customer RFM | PASS (direct read-only DB query) | 42 rows. Authenticated HTTP response NOT RUN. |
| Weekly sales by product | PASS (direct read-only DB query) | 1 grouped row. Authenticated HTTP response NOT RUN. |
| Weekly purchases by product | PASS (direct read-only DB query) | 0 rows for the selected week, valid empty result. Authenticated HTTP response NOT RUN. |
| Weekly profit by product | PASS (direct read-only DB query) | 1 grouped row. Authenticated HTTP response NOT RUN. |
| Weekly management summary | PASS (direct read-only DB query) | 1 summary row. Authenticated HTTP response NOT RUN. |
| Unified event branch attribution | PASS (direct read-only DB query) | KAM: 261 delivery lines, 33 POS lines, 5 return lines. |
| POS posted journal branch attribution | PASS (direct read-only DB query) | 33 posted sales; 0 mismatched journal branch IDs. |
| POS Branch A/B sale, stock, access-denial, and refresh acceptance | NOT RUN | Development has one active branch and no authenticated browser/API session. No A/B fixture or POS transaction was created. |
| Customer-concentration and other unlisted consolidated reports | GATED | Existing HEAD_OFFICE-only behavior retained; these endpoints are outside the approved branch-scoped whitelist. |
| Backend route syntax | PASS | `node --check` passed for finance.routes.js, reports.routes.js, pos.routes.js. |
| Backend build | PASS | `npm.cmd run build` (backend syntax check) passed. |
| Frontend TypeScript/build | PASS | `npm.cmd run build` completed TypeScript compilation and Vite production build (2006 modules); existing >500 kB bundle warning. |
| `git diff --check` | PASS | No whitespace errors; Git emitted routine LF/CRLF notices. |
| Production/deployment/commit | NOT PERFORMED | Migration applied only to configured development DB; no deployment or commit. |
# Phase 5 authenticated multi-branch acceptance — 2026-09-22

**Overall: IN PROGRESS — NOT ACCEPTED.** Tests used real `/api/auth/login` bearer sessions against an isolated development API on port 3301 and development database `kam_grains_db` (`localhost:5432`). Production was not accessed; no deployment or commit was made. No browser session was available, so browser/UI acceptance remains pending.

| Acceptance item | Status | Evidence / limits |
|---|---|---|
| Development environment | PASS | Current database confirmed `kam_grains_db` on localhost:5432; prior environment logs designate it development. |
| Branch fixtures | PASS | A KAM `7739b68b-6f16-4f67-9713-b29b2748d46e`; B TEST_B `53a7ca12-e6a5-4a2d-a356-94d4a448c1b8`; B locations TEST_B_SHOP `e15e6e72-d589-4e6e-82a4-d696ae5b88e9`, TEST_B_STORE `8022a0e3-0bc2-4bf8-ac85-d35fb2203be5`. Existing FG_STORE retained; TRANSIT and RETURN_QUARANTINE remained non-saleable. |
| Test users | PASS (API) | Temporary test users created for A-only, B-only, multi-branch and A SALES-only. HEAD_OFFICE suitable test account not available. Temporary users must be disabled after the tests. |
| Product and baseline | PASS | Shared test product `PHASE5-AB-TEST` (`219a3793-824b-4828-b0bd-ec2c4525520e`), unit cost 1,000, sale price 2,500; A lot `32ca0e77-553e-42f4-83d9-33a01d3ce1b5` baseline 10.000; B lot `fbbedfb1-8fd5-47b6-828e-fe0720ee3664` baseline 20.000. |
| Context and location A/B authorization | PASS (authenticated API) | 70-check matrix: A and B users each received only their own branch and authorized locations; opposite-branch context/location requests returned 403. Multi user selected both. |
| Dashboard A/B | PASS (authenticated API) | Own branch 200; opposite branch 403 for each restricted account. |
| Finance reports A/B | PASS (authenticated API) | Trial Balance, P&L, Balance Sheet, Cashbook own branch 200; opposite branch 403, both users. Finance summary represented by branch-scoped Dashboard summary. |
| Seven weekly reports A/B | PASS (authenticated API) | Own branch 200; opposite branch 403 for each restricted account. Product-level A/B transaction reconciliation is recorded below. |
| POS A sale | PASS (authenticated API) | Sale `POS-20260922-000043`; A stock 10→9, B remained 20; A lot used, 1,000 cost; journal balanced 3,500/3,500 and attributed to A. |
| POS B sale | PASS (authenticated API) | Sale `POS-20260922-000044`; B stock 20→19, A remained 9; B lot used, 1,000 cost; journal balanced 3,500/3,500 and attributed to B. Numbering globally unique. |
| POS attack tests | PASS (authenticated API) | A user selecting B shop, A TRANSIT, A RETURN_QUARANTINE, and non-saleable B store received 403; stock unchanged. |
| Sales → Delivery → AR → Receipt | PASS (authenticated API) | A order `SO-20260922-182958`, delivery `DEL-20260922-182958`, invoice `ARI-20260922-183016`, receipt `RCP-001255`, each posted. Cross-branch reads denied (404/403 according to endpoint). A delivery changed A stock only. Journals balanced and Phase 30 backfilled/attributes their A branch. |
| PO → GRN → AP → AP payment | PASS (authenticated API + DB reconciliation) | B PO `PO-20260922-183446`, GRN `GRN-20260922-183446`, AP invoice `AP-INV-20260922-00001` ($500), payment `APP-20260922-183643`; invoice PAID and payment POSTED. After Phase 31, GRN, invoice and payment PUR journals all tagged B and balanced 500/500. Cross-branch document-read check remains PENDING. |
| Return and refund | PASS (authenticated API) | Two A returns of 0.5kg each; restocked to A saleable FG_STORE only. Refunds settled $1,250 each; journals balanced and A-attributed. A SALES-only user refund attempt returned 403. B reads denied. |
| Transfer A→transit→B | PASS (authenticated API) | Transfer `TRF-20260922-000002`, qty 1, same lot/cost. Dispatch A 8→8, transit 0→1, B unchanged; receive transit 1→0, B 19→20; duplicate receive 409; A-only receive attempt 403. No sales/COGS/P&L event. |
| Stock count | PASS (authenticated API) | A count `SC-PHASE5-A-20260922-02`, FG_STORE, 20 lines, test item system/count 8.000, variance zero. Left OPEN, not posted. |
| Stock adjustment | PASS (authenticated API) | B damage adjustment reduced B stock by 0.1 only. Branch B journal balanced 100/100 after Phase 27. |
| Cleaning | PENDING | No safely bounded end-to-end cleaning run completed. |
| Multi-branch switch and UI refresh | API PASS / BROWSER PENDING | Multi user sees both branches in authenticated API context. UI switching, location refresh and stale-data behavior not browser-tested. |
| HEAD_OFFICE / consolidated | PENDING | No suitable isolated HEAD_OFFICE account. No consolidated mode was invented. |
| Shared masters | PASS (fixture inspection) | Both branches use same test product and shared test customer/supplier master; no branch-specific duplicate master created. Shared chart of accounts remains one chart. |
| Weekly sales reconciliation | PASS (API and SQL review) | A and B POS documents and source branch attribution verified; transfer did not create sales. Exact post-return net totals not fully asserted in the original report script. |
| Finance reconciliation | PASS (source-journal checks) | Representative POS, returns/refunds, A sales workflow, and B adjustment attributed to correct branch and balanced. Branch trial balance A/B and consolidated post-transaction total query remains PENDING. |
| Single-branch and Phase 4 regression | PARTIAL | Quick Sale, AR/Receipt, Return/Refund, quarantine/non-saleable denial and reports exercised via API. Credit POS, Return Policy, browser pages, cleanup and single-branch UI regression remain PENDING. |
| Defect fixes | PASS (targeted retests) | Transfer middleware cross-branch create exception; Phase 27 inventory journal attribution; Phase 28 return journal attribution; Phase 29 refund field compatibility; Phase 30 SAL journal attribution; AP GRN query qualification; Phase 31 PUR journal attribution. Details in `docs/ERROR_LOG.md`. |
| Backend build and route syntax | PASS | `npm.cmd run build`; `node --check` on locationAccess, apInvoices, finance, reports and POS route files. |
| Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false`. |
| Frontend build | PASS | `npm.cmd run build` completed TypeScript compilation and Vite production build (2006 modules); existing large-chunk warning (>500kB). |
| `git diff --check` | PASS | Exit 0; routine LF/CRLF notices only. |
| Production / deployment / commit | PASS | Production untouched; no deployment and no commit. Retain TEST_B temporarily in development as acceptance evidence. |
| Test credential cleanup | PASS | All four temporary test users deactivated and local scripts/results/secrets removed. Branch B, transactions, test product/party retained as development evidence. |
# Phase 5 Extension acceptance — 2026-09-22

**Overall: IMPLEMENTED; RUNTIME APPROVAL REQUIRED.** Authenticated API checks ran against the local development API/database. No browser session was available. No production environment, deployment, or commit was used.

| Acceptance item | Status | Evidence / limit |
|---|---|---|
| Branch-wide stock visibility | PASS | A-only user with STOCK_VISIBILITY listed Branch B/locations and read B stock; unit cost was redacted. |
| Visibility does not grant POS authority | PASS | Same user’s Branch B POS attempt returned 403; Branch B stock did not change. |
| Request and partial approval | PASS | B request submitted; approval actor/time persisted; 1.2 of 2 requested approved. |
| Split transfer fulfillment | PASS | A source-only operator dispatched to B; B received 1.0 with SHORT_DELIVERY, then separately received 0.2; ISR reached FULFILLED with 1.2 supplied. |
| Dispatch/receipt movement and actors | PASS | State, actor and movement flow were verified through authenticated API/DB-backed response. |
| Duplicate dispatch/receipt | PASS | Repeat attempts returned 409. |
| Explicit variance | PASS | Unreceived quantity remained in transit in RECEIVED_WITH_VARIANCE; no silent receipt. |
| Internal accounting | PASS | Company inventory value remained UGX 28,800 and GL journal count remained 971; no internal-transfer finance posting. |
| Procurement policy | PASS | LOCAL_WITH_APPROVAL held PO and blocked GRN until approval; LOCAL_ALLOWED PO opened; CENTRAL_ONLY PO denied while ISR remained allowed; policy restored to HYBRID. |
| Audit | PASS | Request/transfer audit events with authenticated user context verified. |
| Reverse Head Office request from Branch B | PENDING | Not exercised. |
| HYBRID PO→GRN→AP→payment in this extension pass | PENDING | Policy gating checked here; full external purchasing flow is recorded in Phase 5 acceptance sections. |
| Inventory category selector | PENDING | Branch/location/product search and detail exist; category selector not implemented. |
| Authenticated browser acceptance | PENDING | No available authenticated browser session. |
| Changed backend route syntax/build | PASS | node --check on changed route/middleware modules and backend npm build passed. |
| Frontend TypeScript/build | PASS | npx tsc -b and frontend production build passed; bundler reports a large-chunk warning. |
| git diff --check | PASS | No whitespace errors after documentation cleanup; routine LF/CRLF conversion notices only. |
| Production/deployment/commit | NOT PERFORMED | Development only. |
# Phase 5 Final Closure — 2026-09-22

- Inventory category filter: IMPLEMENTED / STATIC VERIFIED. Uses existing product-category API and inv.product.category_id; supports All Categories, branch, location, and search together without reload.
- Backend route syntax/build: PASS.
- Frontend TypeScript: PASS.
- Frontend build: PASS (existing large-chunk warning).
- git diff --check: PASS after this update.
- Browser acceptance: PENDING. Codex browser had zero tabs and no authenticated session.

Manual browser checklist:
- Inventory: branch, location, category, search, View, double-click.
- Stock Request: create, submit, approve, partial supply, detail.
- Transfer: dispatch, partial receipt, full receipt, variance, double-click.
- Procurement: policy behavior.
- Reverse HQ Request: create, dispatch, receive.

Reverse Head Office request, reverse authorization, stock before/after, transit remainder UX, procurement browser behavior, single-branch UX, multi-branch switching/stale-data checks remain browser/API acceptance items rather than claimed passes.
# Phase 5 Final Acceptance — Reverse HQ and Transit UX — 2026-09-22

- Later receipt of unresolved variance: IMPLEMENTED in API/UI. RECEIVED_WITH_VARIANCE can receive only the remaining in-transit quantity; receipt totals accumulate, variance clears when transit reaches zero, and authorization remains destination-scoped.
- Transfer detail now displays dispatched, received, remaining in transit, variance quantity, variance reason, status, actors, and timestamps.
- Reverse Head Office request API run: PENDING. The temporary development API process was unavailable during the final scripted attempt; no reverse transaction is claimed.
- Browser acceptance: BROWSER PENDING. No browser tab or authenticated session was available.
- Static validation after transit changes: backend build PASS; frontend TypeScript PASS; frontend build PASS; changed transfer route syntax PASS; git diff --check pending after documentation append.
# Phase 5 Frontend Completion — 2026-09-22

- Sidebar/navigation: PASS-CODE. Internal Stock Requests and Inter-Site Transfers are routed and permission-gated in AppLayout/App.
- Stock Requests page: PASS-CODE. Existing page provides create draft, submit, approval quantities, request detail, linked transfer creation, View and double-click.
- Stock Transfers page: PASS-CODE. Existing page provides history, View/double-click, dispatch, receive and duplicate backend protection.
- Transfer remainder UX: IMPLEMENTED. Detail shows dispatched, received, remaining in transit, variance, reason, status, actors and timestamps. RECEIVED_WITH_VARIANCE exposes Receive Remaining.
- Later remainder receipt: IMPLEMENTED in backend with remaining-quantity validation and accumulated receipt totals.
- Reverse HQ request: PENDING. Final authenticated API run could not complete because the temporary development API process was unavailable.
- Browser acceptance: BROWSER PENDING. No authenticated browser tab/session was available.
- Inventory category/branch/location/search regression: STATIC PASS; browser PENDING.
- Procurement policy browser behavior: BROWSER PENDING.
- Single-branch and multi-branch stale-data browser regression: BROWSER PENDING.
- Backend build and changed transfer syntax: PASS.
- Frontend TypeScript/build: PASS.
- git diff --check: PASS after documentation cleanup.
# Phase 5 Authentication Timeout Retest — 2026-09-22

- Auth route: POST /api/auth/login.
- Port/process check: backend configured for localhost:3000; no listener was present on 3001.
- Direct database timing: sec.login approximately 3,478 ms; user lookup approximately 22 ms; role lookup approximately 94 ms.
- Direct HTTP retest with kam.admin credentials on configured port 3000: HTTP 200, approximately 4,752 ms, authenticated user returned.
- Health endpoint: HTTP 200, approximately 611 ms.
- Root cause: frontend/backend development port mismatch.
- Browser retest: PENDING; no authenticated browser tab was available.
# Phase 5 Source-Lot Selection Defect Retest — 2026-09-22

- Source lot endpoint: GET /api/inventory/stock-on-hand with selected branch_id and location_id.
- Exact development query result for NB-CLEAN: KAM Clean Beans Store contains NBCLN-0018 4.000, NBCLN-0004 5.800, NBCLN-0005 8.000, NBCLN-0006 1.000, NBCLN-0007 9.000, NBCLN-0008 4.800, NBCLN-0009 25.200, NBCLN-0011 16.000. TEST_B currently has no NB-CLEAN stock.
- Location ownership: Clean Beans Store is KAM, not TEST_B. TEST_B source dropdown now loads only TEST_B locations.
- Multi-lot allocation: PASS-CODE. Eligible rows are split into separate transfer lines until approved outstanding quantity or available stock is exhausted; no arbitrary lot ID or silent full-quantity claim.
- Partial availability: PASS-CODE. Available lots can produce a partial transfer and leave request outstanding; backend rechecks availability at creation/dispatch.
- Transfer/dispatch/receive runtime for this exact NB-CLEAN case: PENDING because TEST_B has zero NB-CLEAN stock.
- Backend build, changed-route syntax, frontend TypeScript/build: PASS.
- git diff --check: PASS.
# Phase 5 Transfer Detail UI Correction — 2026-09-23

- Quantity formatting: PASS-CODE. All operational quantities display to three decimal places without changing database NUMERIC values.
- Cost formatting: PASS-CODE. Authorized costs display as UGX with two decimals; restricted costs remain hidden.
- Table layout: PASS-CODE. Transfer detail uses horizontal scrolling, minimum column widths, padding, separate headers and right-aligned numeric cells.
- State display: PASS-CODE. IN_TRANSIT shows received total and remaining transit; RECEIVED_WITH_VARIANCE shows remaining/variance and Receive Remaining; RECEIVED is read-only with zero remaining.
- Actor/timestamp/reason/status formatting: PASS-CODE. User names, locale timestamps, and human-readable enum labels are used where available.
- Sample transfer database comparison: PENDING browser/runtime inspection; no numeric persistence migration was performed.
- Frontend TypeScript/build: PASS.
- Backend syntax/build: PASS.
- git diff --check: PASS.
- Manual transfer display retest: PENDING.
# Phase 5 Internal Stock Request Direction UI Fix — 2026-09-23

- Requesting Branch selector: PASS-CODE. Uses assigned branch visibility from the existing branch API.
- Receiving Location selector: PASS-CODE. Loads active stock-holding locations for the selected requesting branch and clears on branch change.
- Preferred Source Branch label: PASS-CODE.
- Payload mapping: PASS-CODE. Sends requesting_branch_id, requesting_location_id, preferred_source_branch_id, product, quantity, priority and request type.
- History/detail direction: PASS-CODE. Displays requesting branch, receiving location and preferred source.
- Backend validation: unchanged and still validates branch/location ownership.
- Reverse HQ and opposite-direction runtime requests: PENDING manual/API acceptance.
- Frontend TypeScript/build: PASS.
- Backend syntax/build: PASS.
- git diff --check: PASS.
- Browser retest: PENDING.
## Phase 6 VAT / Tax Engine foundation — 2026-09-24

| Check | Result | Evidence |
|---|---|---|
| Phase 34 migration | PASS | Applied to local `kam_grains_db`; four Uganda tax codes present. |
| Decimal tax unit tests | PASS | Exclusive, inclusive, zero/exempt/out-of-scope, and line-total reconciliation tests pass. |
| Backend build | PASS | `npm.cmd run build`. |
| Changed backend syntax | PASS | `node --check` on tax route, product route, and tax service. |
| Frontend TypeScript/build | PASS | `npx.cmd tsc -b --pretty false` and `npm.cmd run build`. |
| Authenticated tax/POS/AR/AP/return runtime matrix | NOT RUN | Requires authenticated acceptance after legacy posting functions are tax-wired. |
| Browser acceptance | NOT RUN | Manual browser session remains required. |
## Phase 6B VAT accounting integration — 2026-09-24

| Check | Result | Evidence |
|---|---|---|
| Universality audit | PASS-CODE | Tax calculation reads configured tax treatment/rate; Uganda/KAM occurrences are seed/configuration, documentation, fallback branding, or platform identity. |
| Migrations 35–37 | PASS | Applied to local `kam_grains_db`; account mappings, activation function, invoice posting functions, and return snapshot columns verified. |
| Activation precheck | PASS | Returns actionable checks; current development state is not ready because active saleable/purchasable products remain unclassified. |
| Tax formula tests | PASS | 7 tests: inclusive/exclusive 18%, generic 10%, mixed basket, zero/exempt/out-of-scope, rounding, disabled behavior. |
| Backend build / route syntax | PASS | Backend build plus changed route `node --check` passed. |
| Frontend TypeScript/build | PASS | `npx.cmd tsc -b --pretty false` and `npm.cmd run build` passed. |
| Authenticated POS/AR/AP/return/branch runtime matrix | NOT RUN | Requires controlled authenticated development session. |
| Browser acceptance | NOT RUN | Manual browser validation remains required. |
## Phase 6C automated VAT runtime acceptance — 2026-09-24

| Check | Result | Evidence |
|---|---|---|
| Runtime target | PASS | Local development database `kam_grains_db`; health endpoint confirmed. Current source tested on temporary local port 3011 because the existing port-3000 process was stale; configured target remains `http://localhost:3000/api`. |
| Migrations 34–37 | PASS | Tax table/codes, VAT accounts, activation function, posting functions, and return snapshot columns exist. |
| Activation precheck | PASS/BLOCKED | Input/output accounts and default tax code pass; 7 active saleable and 11 active purchasable products remain unclassified. VAT remains disabled. |
| Unauthenticated tax API protection | PASS | `/api/tax/settings` and `/api/tax/activation-precheck` returned 401 on current source. |

| Phase 6C product classification UX | PASS-CODE | Setup exposes Product Tax Classification backed by active configured tax codes; product API validation rejects inactive, expired, or cross-company tax codes. Manual authenticated browser assignment of PHASE5-AB-TEST remains pending. |
| Phase 6C Quick Sale VAT display | PASS-CODE | POS product API exposes tax_code_id/tax_code/tax_treatment/tax_rate and Quick Sale renders Taxable Value, VAT, and Total when tax is enabled. Authenticated browser retest remains pending. |
| Phase 6C activation bypass review | PASS | Tax settings and Business Features tax_engine activation paths both call `app.tax_activation_precheck`; no development override is exposed. |

| Phase 6C final Selling Price tax selector | PASS-CODE | Selling Price Management now shows dynamic Tax Treatment values and a separate permission-checked Tax save path. Product price records remain tax-neutral. |
| Phase 6C effective-date management | PASS-CODE | Tax-rate create/update paths validate bounds/date order and reject overlapping active periods; migration 38 adds database exclusion enforcement. Future-rate runtime/browser acceptance remains pending. |
| Phase 6C non-hardcoded rate review | PASS | Transaction paths resolve configured tax rows; no product/POS/AR/AP/return transaction code contains a fixed 18% rate. Existing generic 10% tax utility test passes. |
| Phase 6D tax-save UX | PASS-CODE | Tax selection is drafted locally and persisted only through explicit Save Tax; successful save refetches/invalidate relevant React Query caches. Authenticated browser persistence retest remains pending. |
| Phase 6D quantity input | PASS-CODE | Quantity editing preserves intermediate text input and commits positive values at three-decimal precision with stock validation. Browser keyboard retest remains pending. |
| Rollback POS/AR/AP accounting | PASS-ROLLBACK | Designated `NB-CLEAN` development fixture: POS net 4,000, VAT 720, gross 4,720; AR same; AP input VAT 720; all journals balanced. All test rows/configuration rolled back. POS journal debit/credit was 7,220/7,220 due to existing COGS/inventory lines. |
| VAT disabled restoration | PASS | After rollback: tax engine false, feature false, VAT false, no temporary posted test sales. |
| Generic/mixed/inclusive/exclusive formulas | PASS | 7 deterministic service tests pass, including configured 10% rate. |
| Authenticated cash/credit/return/branch/browser matrix | NOT RUN | No safe authenticated development credentials/session was available. No credentials were created. |

## Phase 39 Payment Channel Foundation — 2026-09-24

| Check | Result | Evidence |
|---|---|---|
| Migration 39 | PASS | Applied idempotently to local development `kam_grains_db`; existing channel rows remain inactive and no provider calls were made. |
| Existing architecture inspection | PASS | `fin.api_payment_channel`, `fin.payment_account_control`, existing queue/webhook tables, and `sal.post_pos_sale` confirmed as authoritative structures. |
| Backend route syntax | PASS | `node --check` passed for API payment channel and POS routes. |
| Frontend TypeScript | PASS | `npx.cmd tsc -b --pretty false` passed after channel UI/client changes. |
| Deterministic transaction constraints | PASS-CODE | Lifecycle transition guard, idempotency unique index, and per-channel provider-reference unique index are implemented. |
| Payment foundation deterministic test | PASS | `node backend/test/payment-channel.foundation.test.mjs` covered allowed/invalid status transitions, duplicate-reference detection, active/manual eligibility, and branch restriction behavior. |
| Manual MTN/Airtel/Card/Bank/Cash/Credit browser acceptance | PENDING | Requires an authorized browser session and explicitly configured active manual development channels. |
| Provider API/sandbox/live | NOT RUN | Deliberately out of scope; no credentials, network calls, callbacks, or live mode. |

## Phase 7 EFRIS foundation — 2026-09-24

| Check | Result | Evidence |
|---|---|---|
| Repository EFRIS inspection | PASS | No existing EFRIS adapter, URA transport, FDN/QR model, or official specification found. |
| Migration 40 | PASS | Applied to local `kam_grains_db`; EFRIS remains disabled and no historical documents were submitted. |
| Activation precheck | PASS-CODE | Server-side checks cover TIN, Uganda country, registration, system mode, environment, credentials/transport metadata, product/UOM/tax/branch mappings. |
| Durable queue/idempotency | PASS-CODE | Fiscal documents, events, attempts, unique internal/source keys, retry state, and snapshot payload are database-backed. |
| Internal mock lifecycle | PASS-CODE | Accept/reject/transient outcomes are explicitly labelled INTERNAL MOCK — NOT URA; no official identifiers are fabricated. |
| EFRIS deterministic foundation test | PASS | `node backend/test/efris.foundation.test.mjs` covered lifecycle guards, source uniqueness, and posted-tax-snapshot preservation. |
| POS/return integration | PASS-CODE | Posted POS queueing and accepted-source return credit-note linkage use persisted tax snapshots; AR-from-POS duplicate fiscalisation is prevented by authority decision. |
| Backend/frontend builds and route syntax | PENDING | Run after final route/UI validation. |
| Authenticated browser acceptance | NOT RUN | Requires safe development session and verified mapping/configuration data. |
