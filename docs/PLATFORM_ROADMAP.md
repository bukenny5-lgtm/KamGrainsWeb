# KAM GRAINS ERP Platform Roadmap

## Platform Baseline

KAM GRAINS ERP remains the current stable production reference system and first/reference tenant.

Current architecture:
- React, TypeScript, Vite frontend
- Node.js and Express backend
- PostgreSQL database
- Schemas including `sal`, `pur`, `inv`, `fin`, `app`, `sec`, `audit`, and `reporting`
- Existing Sales Order â†’ Delivery â†’ AR Invoice â†’ Receipt workflow

The platform direction is a universal, configurable ERP supporting agriculture, beverages, supermarkets, spare parts, general retail, and wholesale operations.

POS / Quick Sale will coexist with the existing Sales Order workflow. The primary client direction is responsive web/PWA. Offline functionality will initially focus on POS. Future multi-tenancy will use a database-per-business model with a central platform database.

## Roadmap

| Phase | Name | Status |
|---|---|---|
| 0 | Platform Transformation Baseline | COMPLETE |
| 1 | Universal Business Configuration / Universal Branding | PLANNED |
| 2 | Universal Product Model | PLANNED |
| 3 | Feature Flags / Business Profiles | PLANNED |
| 4 | Quick Sale / POS Foundation | IN PROGRESS — RUNTIME/UI APPROVAL PENDING |
| 5 | Cash Register / Till Sessions | PLANNED |
| 6 | Barcode Scanning | PLANNED |
| 7 | Beverage Units / Packaging | PLANNED |
| 8 | Pricing Engine | PLANNED |
| 9 | POS + Credit Customer Integration | PLANNED |
| 10 | Multilingual Foundation | PLANNED |
| 11 | Translation Management / Language Model Assistance | PLANNED |
| 12 | Responsive PWA | PLANNED |
| 13 | Offline POS Synchronization | PLANNED |
| 14 | Branches / Warehouses / Registers | PLANNED |
| 15 | Multi-Tenant Platform Architecture | PLANNED |
| 16 | Automated Tenant Provisioning | PLANNED |
| 17 | Subscription Plans / Licensing | PLANNED |
| 18 | Subscription Expiry Controls | PLANNED |
| 19 | Industry Profiles | PLANNED |
| 20 | Returns / Refunds / Exchanges | PLANNED |

### Phase 19A — Return Policy / Refund / Quarantine Foundation (2026-09-20)

Development-only foundation added for configurable return policy, customer-return reasons and conditions, non-saleable quarantine inventory, refund settlement records, Return Note data/print action, policy enforcement, and quarantine visibility. Monetary refund/AR settlement, return voiding, release/write-off, delivery runtime validation, and UI approval remain required before production.

### Phase 19B — Return Settlement and Reversal (2026-09-20)

Development-only forward migration adds capped AR credit adjustments, configured refund-payable accounting, partial/final refund settlement, refund documents, and posted-return reversal with refund-after-settlement protection. Delivery/KAM runtime, reporting/dashboard/cache validation, print layout approval, and production approval remain pending.

### Phase 19C — Final Runtime/UI Acceptance (2026-09-20)

Database/static acceptance passed for safe WRITE_OFF blocking and settlement/reversal foundations. Authenticated browser acceptance remains blocked by a blank local Vite frontend surface; no production approval is claimed.
| 21 | Promotions / Discounts | PLANNED |
| 22 | Advanced Beverage Features | PLANNED |
| 23 | Spare Parts Extension | PLANNED |
| 24 | Platform Administration Portal | PLANNED |
| 25 | SaaS Deployment / Operations | PLANNED |

### Phase 4 Step 1 — Quick Sale / POS Foundation Inspection (2026-09-18)

Architecture and design-gap inspection is complete. The recommended direction is a dedicated, feature-gated POS sale path sharing inventory/accounting primitives while preserving the existing Sales Order → Delivery → AR Invoice → Receipt workflow. Implementation, migration, and approval remain pending. See `docs/PHASE4_POS_INSPECTION.md`.

### Phase 4 Step 2 — Minimal POS Foundation (2026-09-18)

The minimal online POS foundation is implemented in the working tree and development database. Final integration now includes POS credit receivables through AR open items, FIXED/MANUAL/HYBRID pricing controls, explicit payment methods, barcode administration and keyboard-wedge lookup, and scoped stock-cache refresh. Barcode was intentionally brought forward from the former Phase 6 position. Runtime/API and authenticated browser approval remain required before Phase 4 is marked complete.

## Phase 0 Scope

Phase 0 covers documentation, architecture baseline, repository inspection, build verification, regression tracking, error logging, decision tracking, deployment documentation, backup and rollback planning, Git discipline, and production checkpoint planning.

Phase 1 must not begin until Phase 0 has been reviewed and accepted.

No Phase 0 activity should change business logic, database schema, accounting behavior, posting behavior, production services, or deployment artifacts.

## Git and Commit Discipline

- `main` represents validated code.
- Each completed roadmap phase must receive a clean commit.
- Use descriptive `fix(...)` commits for bug fixes.
- Use `docs:` commits for documentation-only changes.
- Do not commit `.env` files, credentials, `node_modules`, build output, logs, temporary files, or database backups.
- Every database migration must be committed.
- Never edit an already-applied production migration; create a new migration instead.
- Record important commit hashes in implementation and deployment logs.
- Do not commit automatically without review.

## Backup and Rollback Requirements

Before production-impacting work:
1. Create and verify a database backup.
2. Record backup location, timestamp, checksum, and retention plan.
3. Capture the deployed Git commit and artifact versions.
4. Confirm rollback owner and procedure.
5. Confirm service restart requirements.
6. Record deployment and rollback plan before execution.
7. Verify restore capability in a controlled environment when practical.

Production deployment must not proceed without a known rollback path.

## Future Platform Decisions

- KAM GRAINS remains operational and becomes the first/reference tenant.
- The existing Sales Order workflow remains supported.
- POS / Quick Sale will coexist with Sales Orders.
- Delivery-based sales reporting remains authoritative for the current order/delivery workflow.
- The platform should support multiple industries through configuration and profiles.
- Primary client direction is responsive web/PWA rather than desktop-only.
- Multilingual UI should use stored and approved translations.
- Live AI translation on every screen is not the initial translation strategy.
- Offline support should initially focus on POS.
- Returnable beverage bottles and crates should eventually use a separate ledger or model.
- Database-per-business multi-tenancy is a later platform capability.
- Subscription plans, expiry controls, and SaaS operations are later phases.

## Phase 19 — Universal Customer Returns

- **Development implementation:** Added shared POS/delivery return schema, controlled posting, exact historical cost reuse, RESTOCK/DAMAGED disposition, API, permissions, frontend page, reporting event integration, and POS-linked AR void safety.
- **Approval state:** Runtime transaction matrix and authenticated browser/UI validation remain required. Production untouched.

### Phase 19D — Frontend Recovery and Final Acceptance (2026-09-20)

The blank authenticated shell was corrected by hardening the role guard. Dashboard, Setup, and Customer Returns now render in the existing session. Full financial UI acceptance remains blocked until the browser session and current backend share one origin.
