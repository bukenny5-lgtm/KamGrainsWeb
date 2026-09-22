# Codex Prompt Log

## Prompt Record Fields

Each significant prompt record should include:
- Date
- Phase/Module
- Objective
- Prompt
- Result Summary
- Files Changed
- Accepted/Modified
- Notes

## 2026-09-18 — Phase 1 / Universal Business Configuration

- **Objective:** Implement the approved business profile migration, protected API, cached frontend profile contract, fallback branding, and Setup editor without changing transaction logic.
- **Prompt:** Approved Phase 1 implementation brief supplied in the project request.
- **Result Summary:** Implemented; runtime/API/UI/database validation and approval remain required.
- **Files Changed:** Migration, backend profile route, frontend profile API/types/hook, shell/login/Setup, print branding references, and Phase 1 documentation.
- **Accepted/Modified:** Implemented, pending runtime approval.
- **Notes:** No deployment or service restart performed.

## Prompt Entries

| Date | Phase/Module | Objective | Prompt | Result Summary | Files Changed | Accepted/Modified | Notes |
|---|---|---|---|---|---|---|---|
| 2026-09-17 | Phase 0 / Platform Baseline | Establish Phase 0 documentation and engineering baseline. | Phase 0 baseline documentation/verification prompt. | Initial runner could inspect repository but could not create/write docs; documentation was later generated for manual placement. | `docs/*.md` | Modified | No production, schema, or business-logic changes. |
| 2026-09-17 | Phase 0 / Documentation Correction | Correct malformed tables, seed error log, expand implementation log, and add ADRs. | Documentation-only correction prompt. | Corrections prepared for the eight-file documentation set. | `docs/*.md` | Pending review | Phase 1 remains unstarted. |

## Prompt Logging Rules

- Record significant Codex prompts related to architecture, implementation, debugging, testing, deployment, or migration work.
- Record the intended objective before implementation.
- Record whether the result was accepted, modified, rejected, or pending review.
- Do not include secrets, credentials, tokens, or private configuration values.
- Link prompt results to implementation and deployment records where applicable.

## 2026-09-18 — Phase 3 / Minimal Feature Configuration

- **Objective:** Implement the approved generic feature catalogue, per-company overrides, resolved API, frontend hook, navigation/route gating, Setup controls, audit trail, and KAM-safe fallback without changing transaction logic.
- **Prompt:** Phase 3 Step 2 minimal feature-configuration implementation brief supplied in the project request.
- **Result:** Implemented and API/runtime-validated against development PostgreSQL and the isolated Express server; authenticated browser smoke remains pending.
- **Files Changed:** Phase 3 migration, backend feature service/route/server mount, frontend feature contracts/API/hook, navigation, route guard, Setup, and documentation.
- **Accepted/Modified:** POS/barcode remain non-editable and disabled; industry presets and backend transaction-route gating were not implemented.
- **Notes:** No deployment, production restart, or commit performed.

## 2026-09-18 — Phase 2 / Minimal Universal Product Foundation

- **Objective:** Add only description, purchasable, stock-item, and normalized product-category support while preserving existing workflows.
- **Result:** Implemented and runtime-validated against the development database and real Express routes.
- **Files Changed:** Phase 2 migration, product/category backend routes, frontend product contracts/API/Setup, and documentation.
- **Status:** Runtime validation passed; UI smoke test pending; no deployment or commit.

## 2026-09-18 — Phase 4 / Quick Sale POS Foundation Step 1

- **Objective:** Inspect the current sales, delivery posting, AR, inventory/lot, product, customer, payment, accounting, reporting, feature-flag, permission, receipt, responsive UI, till, and offline foundations without implementing POS.
- **Result:** Inspection complete. Recommended a dedicated online POS transaction path sharing inventory/accounting primitives, with explicit approval gates for price authority, payment mapping, lot allocation, permissions, numbering, reporting, receipts, and voids.
- **Files Changed:** Documentation only, including `docs/PHASE4_POS_INSPECTION.md` and the Phase 4 entries in roadmap, implementation log, current status, decisions, and prompt log.
- **Accepted/Modified:** Proposed architecture pending approval; no backend, frontend, database, migration, deployment, or commit changes.
- **Notes:** POS remains feature-disabled by default. Existing Sales Order → Delivery → AR Invoice → Receipt behavior remains unchanged.

## 2026-09-18 — Phase 4 / Quick Sale POS Foundation Step 2

- **Objective:** Implement only the approved minimal online POS foundation using a dedicated transaction path and existing inventory/accounting primitives.
- **Result:** Implemented and validated against the development database and real Express API. Added dedicated POS tables/functions, controlled price source, API, permissions, feature gating, responsive Quick Sale page, 80 mm receipt renderer, reporting event union, and reversal voids.
- **Files Changed:** Phase 4 migration, POS backend route/server/permissions, report compatibility queries, POS frontend page/API/types/route/navigation/permissions, and Phase 4 documentation.
- **Accepted/Modified:** CASH/BANK/MOBILE_MONEY supported from existing mappings; CARD, till, barcode, offline, split tender, promotions, returns, and advanced pricing deferred. POS remains disabled by default.
- **Notes:** No deployment, production restart, or commit performed. Authenticated browser UI smoke validation remains required.

## 2026-09-18 — Phase 4 / POS Enablement and Product Price Management

Final integration follow-up: validate POS CREDIT settlement, FIXED/MANUAL/HYBRID pricing, barcode administration and keyboard-wedge lookup in the browser before approval.

Phase 18 follow-up: validate original SALE_ISSUE unit-cost reuse during void, credit receipt rejection after application, and all payment mappings before production approval.

- **Objective:** Promote implemented POS from future/non-editable to configurable, keep barcode future, and add controlled product selling-price administration using the existing POS price table.
- **Result:** Added POS feature-catalogue migration, complete price CRUD/deactivation API, Setup Product Prices section with business currency, and preserved server-authoritative POS price enforcement.
- **Files Changed:** Phase 4 enablement migration, POS backend route, frontend API client and Setup UI, plus Phase 4 documentation.
- **Accepted/Modified:** Manual Sales Order pricing remains supported. Manual POS price override was deferred because the secure configured-price path is sufficient and avoids weakening server-side enforcement.
- **Notes:** POS was enabled only for development API validation, then restored disabled. No deployment or commit performed.

## 2026-09-20 — Phase 4/18 Completion / Universal Customer Returns

- **Objective:** Add a universal POS and delivery customer-return foundation, block independent POS-linked AR voids, and clear stale AR modal feedback.
- **Result:** Added the forward Phase 19 migration, return posting API/UI, exact original-cost return valuation, negative return reporting events, database/backend AR-void protection, and AR mutation reset handling.
- **Validation:** Development migration applied; direct POS-linked AR void was rejected transactionally; rolled-back POS return posting preserved original lot and unit cost; TypeScript, frontend build, backend build, and `git diff --check` passed.
- **Remaining:** Full authenticated transaction matrix and browser/UI smoke testing are still required before production review.

## 2026-09-20 — Phase 19A / Return Policy, Refund and Quarantine Foundation

- **Objective:** Close safe policy, reason/condition, quarantine, refund-record, and Return Note gaps without touching production or rewriting Phase 19 migrations.
- **Result:** Added forward Phase 20 migration, configurable business policy API, reason catalogue, server-side policy validation, controlled quarantine location/routing, quarantine read API, refund record foundation, and Return Note data/print action.
- **Remaining:** Monetary refund/AR settlement, return void/reversal, quarantine release/write-off, Delivery/KAM runtime, and authenticated UI approval remain required.
- **Notes:** Default policy is a conservative configurable template, not a legal-compliance claim. NB-CLEAN remains preserved. No deployment or commit performed.

## 2026-09-20 — Phase 19B / Return Settlement, Refund Posting and Reversal

- **Objective:** Complete capped AR settlement, refund posting, and safe return reversal without rewriting prior migrations or touching production.
- **Result:** Added Phase 21 forward migration, AR credit-adjustment model, configured refund-payable account, atomic partial/final refund posting, overpayment rejection, refund document listing, and posted-return void/reversal.
- **Validation:** Development rollback tests passed for unpaid/fully-paid credit returns, partial/final refunds, overpayment rejection, balanced journals, exact-cost reversal movement, and refund-after-settlement void blocking.
- **Remaining:** DELIVERY/KAM runtime, dashboard/report/cache validation, Return Note layout approval, WRITE_OFF workflow, and authenticated UI approval.
- **Notes:** Original invoices and receipts remain preserved. No deployment or commit performed.

## 2026-09-20 — Phase 19C / Final Runtime and UI Acceptance

- **Objective:** Validate the complete returns lifecycle through authenticated UI, APIs, PostgreSQL, inventory, AR, finance, reporting, and dashboard without redesigning the architecture.
- **Result:** Safe WRITE_OFF rejection and development database/static checks passed. Browser acceptance was attempted, but the local Vite frontend rendered blank without an authenticated usable surface.
- **Status:** NOT PRODUCTION READY — BLOCKERS REMAIN. Delivery/KAM, dashboard/cache, print layout, permissions, and browser regression tests remain NOT RUN.
- **Notes:** No automatic repair of POS-20260918-000019, no deployment, and no commit performed.

## 2026-09-20 — Phase 19D / Frontend Recovery and Final Returns Acceptance

- **Objective:** Diagnose the blank frontend, rerun acceptance, and patch only genuine runtime defects.
- **Result:** Hardened `AuthProvider.hasRole()`; authenticated Dashboard, Setup, and Customer Returns render. Current backend source lookup passed on port 3001.
- **Remaining:** Existing authenticated browser session targets an older port-3000 backend, so financial UI, Delivery/KAM, dashboard/cache, and Return Note acceptance remain pending.
# Phase 5 prompt checkpoint — 2026-09-22

Implement the multi-location foundation in the existing business/location model. Preserve transaction history and Phase 4 flows. Follow up with development migration/API/UI validation, static builds, and operational/report location-scope review. Do not deploy or commit without approval.

## Phase 5 continuation checkpoint — 2026-09-22

Phase 24 remains intact. Phase 25 adds branch ownership/current context, but acceptance is incomplete. Continue by auditing each legacy route/report for branch/location read and write scope; add branch/user/location administration UI; verify GRN/Delivery/AR/AP/refund branch inheritance; validate transfer costing and stock conservation; then run authenticated Branch A/B, restricted/multi-branch/HQ, finance/report, single-branch, and Phase 4 regression tests. Do not claim completion until runtime proof is recorded. Do not deploy, touch production, or commit.


## 2026-09-22 — Phase 5 Acceptance Hardening and Validation

- **Objective:** Prove and harden Phase 24/25 multi-branch operations without expanding architecture; complete only minimum branch/location user administration UI; record verified and pending acceptance cases.
- **Result:** Audited and patched confirmed branch/location scope omissions in legacy routes; added source-derived AR/AP allocation scope; added Setup assignment/default panel; completed rollback-only A/B membership/stock fixture. Reports without verified branch dimensions fail closed to non-HEAD_OFFICE users.
- **Validation:** Backend build and frontend TypeScript passed. Final frontend build, route syntax and diff results are recorded in `docs/TEST_LOG.md`. Authenticated API/browser matrix remains pending.
- **Files:** Phase 5 route/middleware changes, branch access UI/API, and acceptance documentation.
- **Accepted/Modified:** No new phase feature or migration; Phase 24/25 migrations retained. Production untouched; no deployment or commit.
