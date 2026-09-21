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

## ADR-0012 — Generic Feature Catalogue with Per-Company Overrides
- **Date:** 2026-09-18
- **Status:** Accepted for Phase 3 implementation
- **Context:** Businesses need capability configuration while user authorization remains independent and KAM's current workflow remains stable.
- **Decision:** Store controlled feature definitions in `app.feature` and per-company overrides in `app.company_feature`. Resolve an override when present, otherwise use the catalogue default. Future industry profiles may seed configuration as onboarding presets but must not become runtime `business_type` switches.
- **Consequences:** Feature state is queryable and auditable without coupling capability flags to company identity. Access requires both feature enablement and existing authorization. KAM defaults preserve current modules; POS/barcode remain disabled until implemented.
- **Alternatives Considered:** Boolean columns on `app.company_profile`, JSON-only configuration, and immediate industry-template runtime logic.
- **Related Phase:** Phase 3, Phase 4, Phase 19.

## ADR-0013 — Dedicated POS Transaction Boundary (Proposed)
- **Date:** 2026-09-18
- **Status:** Accepted for Phase 4 Step 2 foundation; broader POS extensions remain deferred
- **Context:** The existing Sales Order → Delivery → AR Invoice → Receipt workflow requires customer and delivery semantics that do not fit fast checkout, while inventory and accounting must remain authoritative and shared.
- **Decision:** Use a dedicated, feature-gated POS sale model and atomic posting boundary. Reuse shared inventory/accounting primitives, keep customer optional for walk-in cash sales, require an active server-side POS price, use existing CASH/BANK/MOBILE_MONEY account mappings, expose a dedicated 80 mm receipt, and preserve delivery-based reporting semantics through an explicit sales-event view.
- **Consequences:** POS now has a separate sale history and reversal void path while existing sales remain stable. Till sessions, barcode, offline, split tender, returns, and advanced pricing remain later work.
- **Alternatives Considered:** Creating delivery/invoice chains for every checkout; a delivery/invoice variant; replacing the existing sales workflow.
- **Related Phase:** Phase 4, Phase 5, Phase 6, Phase 8, Phase 9, Phase 13.

## ADR-0014 — Configured Product Prices and Controlled POS Pricing
- **Date:** 2026-09-18
- **Status:** Accepted for Phase 4 foundation
- **Context:** POS requires a safe selling-price source, while existing Sales Order workflows already support manually entered prices.
- **Decision:** Reuse `sal.pos_product_price` as the configured POS selling-price source. POS accepts only an active server-side configured price by default; products without one cannot be sold through POS. Existing manual pricing workflows remain unchanged. Manual POS override, if later required, must use an explicit permission, audit fields, and receipt visibility.
- **Consequences:** Setup users can administer configured prices using `EDIT_SETUP`; the full pricing engine and manual POS override remain deferred. No arbitrary client price is trusted by POS.

## ADR-0015 — POS Credit Uses Existing AR Open Items

- **Status:** Accepted for Phase 4 final integration.
- **Decision:** Immediate POS payments do not create AR. CREDIT POS creates one POS-sourced AR invoice/open item, posts inventory/revenue immediately with AR_CONTROL as the debit, and reuses existing customer receipt/application processing for OPEN → PARTIAL → PAID/CLOSED settlement.
- **Consequences:** Customer receipts can distinguish POS CREDIT from conventional AR invoices without a duplicate receivable ledger. Credit POS voids are blocked after receipt application.

## ADR-0016 — Universal Customer Returns Share the Sales Reversal Boundary

- **Status:** Accepted for development Phase 19; production approval pending runtime/UI validation.
- **Decision:** Use one `sal.customer_return`/`sal.customer_return_line` model for POS and delivery sources. Preserve original sales and receipts, enforce remaining returnable quantity, post exact original movement-line cost, and distinguish RESTOCK from DAMAGED disposition.
- **Consequences:** Returns appear as explicit negative sales/COGS events and do not require rewriting Sales Order, Delivery, POS, AR invoice, or receipt history. POS-linked AR invoices cannot be voided independently.

## ADR-0017 — Configurable Return Policy and Non-Saleable Quarantine

- **Status:** Accepted for development Phase 19A; production approval pending settlement and UI validation.
- **Decision:** Add one business-level policy with conservative defaults, separate customer-return reasons/conditions, and a system-managed `RETURN_QUARANTINE` location. Quarantine and write-off dispositions must not enter ordinary saleable stock.
- **Consequences:** Policy is configurable per business and exceptions require authorized reason capture. Monetary refund settlement and release/write-off remain separate workflows rather than being silently inferred.
- **Notes:** Businesses must configure policy according to applicable law and contractual terms; defaults are not a universal legal rule.

## ADR-0018 — Return Notes Are Not Refund Documents

- **Status:** Accepted for development Phase 19A.
- **Decision:** Keep Return Note, refund settlement, customer credit, and original sale/receipt as separate records. Return Note output excludes internal unit cost and remains distinct from an invoice, receipt, refund voucher, or credit note.

## ADR-0019 — Cap Credit Returns Before Creating Refund Due

- **Status:** Accepted for development Phase 19B; production approval pending runtime/UI validation.
- **Decision:** Apply a posted credit return first against the current AR outstanding balance, never below zero. Any excess is recorded as refund payable/due and settled separately through configured payment accounts.
- **Consequences:** Historical invoice lines and receipts are preserved; fully paid returns do not create negative AR or an automatic cash refund.

## ADR-0020 — WRITE_OFF Remains Deferred Until Controlled Workflow Exists

- **Status:** Accepted for Phase 19C.
- **Decision:** Reject WRITE_OFF customer-return posting server-side until a controlled inventory write-off/accounting workflow is implemented. Do not silently move or destroy inventory value.
- **Validation:** Development transaction rejected the disposition and rolled back without side effects.

## ADR-0021 — Missing Role State Must Fail Closed, Not Crash the Shell

- **Status:** Accepted for Phase 19D.
- **Decision:** Treat absent or malformed `user.roles` as an empty role set in the frontend guard. Do not grant fallback permissions and do not let malformed session state blank the application.
- **Validation:** Existing authenticated Dashboard, Setup, and Customer Returns pages rendered after the guard fix.

## ADR-0016 — Barcode Foundation Brought Forward

- **Status:** Accepted for Phase 4 final integration.
- **Decision:** Use reusable `inv.product_barcode` records with unique values, active/deactivated lifecycle, and keyboard-wedge lookup. The barcode feature is implemented/configurable and remains independently feature-gated from permissions.
- **Alternatives Considered:** Trusting client-submitted prices, adding a duplicate price table, or changing existing Sales Order pricing behavior.
- **Related Phase:** Phase 4, Phase 8, Phase 21.
## ADR-0022 — Transaction-Scoped Authenticated User UUID Context

- **Date:** 2026-09-20
- **Decision:** Database mutation functions that use `sec.current_user_id()` must execute in the same transaction as the request-local `app.current_user_id` context. The context is populated only from the authenticated `req.user.user_id` UUID; empty or invalid values are rejected for authenticated mutations.
- **Defensive rule:** `sec.current_user_id()` treats absent, empty, and whitespace-only settings as NULL through a forward migration, but normal authenticated requests must persist the real user UUID in audit fields.
- **Reason:** Session-local context was previously set outside a transaction or populated with `""`, causing UUID cast failures and risking NULL audit identities.
## 2026-09-21 — Customer Return Delivery Eligibility and History

- Delivery return eligibility follows the existing source-of-truth model: `is_posted = true`, non-null `posted_movement_id`, and status not in VOID/CANCELLED variants. `DELIVERED` is a valid completed Delivery status in this repository.
- Customer Returns history remains an operational/audit view and does not replace `reporting.v_sales_event_lines` or redesign management reports.
- Return value is sourced from `qty_returned * original_unit_price`; inventory unit cost is used only for quarantine inventory visibility and is not exposed in the customer-facing entry/history UI.
## ADR-0023 — Single Owner for Invoice-Linked Customer Return Settlement

- **Date:** 2026-09-22
- **Decision:** `sal.post_customer_return` owns return inventory and sales/COGS foundation lines. `sal.finalize_customer_return_settlement` owns invoice-linked AR credit and REFUND_PAYABLE lines.
- **Reason:** The previous design created a provisional return-value credit and then added the trigger settlement credit, duplicating the refund value and failing journal balance.
- **Consequence:** Fully paid Delivery returns leave AR PAID and create exactly one refund payable; unpaid/partially paid returns still reduce outstanding AR first, with excess becoming refund due.

## ADR-0024 — Reuse Existing Permission and Settlement Engine for Refund UI

- **Date:** 2026-09-22
- **Decision:** The refund UI uses the existing `PROCESS_REFUND` role mapping and `/customer-returns/:id/refund` endpoint. It does not expose GL account selection or create a parallel accounting path.
- **Reason:** Refunds are financially sensitive; backend authorization and configured payment-account mapping must remain authoritative.
- **Consequence:** Admin/Manager/Finance users can access the action when a posted return has remaining due. Other users can view details but do not receive an active refund action. Manual UI acceptance remains required.
