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
