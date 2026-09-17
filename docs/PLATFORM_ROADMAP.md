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
| 4 | Quick Sale / POS Foundation | PLANNED |
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
| 21 | Promotions / Discounts | PLANNED |
| 22 | Advanced Beverage Features | PLANNED |
| 23 | Spare Parts Extension | PLANNED |
| 24 | Platform Administration Portal | PLANNED |
| 25 | SaaS Deployment / Operations | PLANNED |

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

