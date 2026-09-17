# Architecture Decision Record Log

## ADR-0001 — KAM GRAINS as Reference Tenant
- **Date:** 2026-09-17
- **Status:** Accepted
- **Context:** KAM GRAINS is the existing operational ERP.
- **Decision:** Preserve KAM GRAINS as the stable production reference and first tenant.
- **Consequences:** Future abstractions must preserve current KAM GRAINS workflows and data integrity.
- **Alternatives Considered:** Rewrite before platform transformation.
- **Related Phase:** Phase 0, Phase 15

## ADR-0002 — Preserve Existing Sales Workflow
- **Date:** 2026-09-17
- **Status:** Accepted
- **Context:** Sales Order → Delivery → AR Invoice → Receipt is established.
- **Decision:** Preserve and continue supporting the existing workflow.
- **Consequences:** POS must integrate without breaking existing sales operations.
- **Alternatives Considered:** POS-only processing.
- **Related Phase:** Phase 0, Phase 4, Phase 9

## ADR-0003 — POS Coexists with Sales Orders
- **Date:** 2026-09-17
- **Status:** Accepted
- **Context:** Quick Sale/POS is required while existing workflows remain active.
- **Decision:** Add POS as a complementary transaction path.
- **Consequences:** Shared customer, inventory, payment, reporting, and accounting boundaries are required.
- **Alternatives Considered:** Replace current sales entry path.
- **Related Phase:** Phase 4, Phase 5, Phase 9

## ADR-0004 — Universal Configurable ERP
- **Date:** 2026-09-17
- **Status:** Accepted
- **Context:** Future customers span multiple industries.
- **Decision:** Use one configurable codebase with universal models, business profiles, and feature flags.
- **Consequences:** Industry-specific extensions must remain modular.
- **Alternatives Considered:** Separate codebases per industry.
- **Related Phase:** Phase 1, Phase 2, Phase 3, Phase 19

## ADR-0005 — Stored and Approved Translations
- **Date:** 2026-09-17
- **Status:** Accepted
- **Context:** Multilingual UI is required later.
- **Decision:** Use stored and approved translations rather than live AI translation on every screen.
- **Consequences:** Translation management and approval workflow required.
- **Alternatives Considered:** Runtime AI translation.
- **Related Phase:** Phase 10, Phase 11

## ADR-0006 — POS-First Offline Support
- **Date:** 2026-09-17
- **Status:** Accepted
- **Context:** Offline capability is desirable but broad offline ERP support is high risk.
- **Decision:** Start offline synchronization with POS only.
- **Consequences:** Queueing, conflict handling, retry, and reconciliation must be designed.
- **Alternatives Considered:** Offline-enable every module simultaneously.
- **Related Phase:** Phase 12, Phase 13

## ADR-0007 — Database-Per-Business Tenancy
- **Date:** 2026-09-17
- **Status:** Accepted Direction
- **Context:** Future subscription and tenant isolation require a tenancy strategy.
- **Decision:** Target a central platform database with one database per business.
- **Consequences:** Provisioning, migrations, backups, and licensing become platform responsibilities.
- **Alternatives Considered:** Shared database with tenant identifiers only.
- **Related Phase:** Phase 15, Phase 16

## ADR-0008 — Separate Returnable Container Ledger
- **Date:** 2026-09-17
- **Status:** Planned
- **Context:** Beverage bottles/crates involve custody, deposits, returns, and reconciliation.
- **Decision:** Represent returnable containers in a separate ledger/model.
- **Consequences:** Container balances must reconcile with sales, customers, suppliers, and locations.
- **Alternatives Considered:** Treat all returnables as ordinary stock.
- **Related Phase:** Phase 7, Phase 22

## ADR-0009 — Delivery-Based Sales Reporting Remains Authoritative for Existing Workflow
- **Date:** 2026-09-17
- **Status:** Accepted
- **Context:** Current operational reporting uses Deliveries as the sales business event.
- **Decision:** Preserve delivery-based sales reporting for the existing order/delivery workflow.
- **Consequences:** Future POS reporting must integrate without silently redefining historical reporting semantics.
- **Alternatives Considered:** Rebase all existing sales reporting on Sales Orders or invoices.
- **Related Phase:** Phase 0, Phase 4, Phase 9

## ADR-0010 — Responsive Web/PWA as Primary Client
- **Date:** 2026-09-17
- **Status:** Accepted Direction
- **Context:** The platform must work on desktops, tablets, and phones while remaining maintainable.
- **Decision:** Keep the primary client as a responsive web application and evolve toward PWA support.
- **Consequences:** Desktop-only packaging is not the default architecture; hardware bridges may be added later if needed.
- **Alternatives Considered:** Desktop-first native application.
- **Related Phase:** Phase 12

## ADR-0011 — Future POS Receipt Uses 80 mm Thermal Formatting
- **Date:** 2026-09-18
- **Status:** Accepted Future Requirement
- **Context:** POS receipts serve a different operational purpose from existing A4 invoices.
- **Decision:** Future POS receipts will target 80 mm thermal printers by default; optional 58 mm support may be considered through printer profiles.
- **Consequences:** POS receipt rendering must be a dedicated thermal layout and must not reuse the existing A4 invoice layout.
- **Scope:** Documentation/design only; no POS or receipt-format implementation in Phase 2.
- **Related Phase:** Phase 2 inspection, future POS phase.

## ADR Logging Rules
- Assign stable ADR identifiers.
- Record context and decision separately.
- Record consequences and alternatives.
- Do not silently change accepted decisions; supersede them with a new ADR.
