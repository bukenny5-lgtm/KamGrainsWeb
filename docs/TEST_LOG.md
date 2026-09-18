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

