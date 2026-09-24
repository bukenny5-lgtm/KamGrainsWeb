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
# ADR-0025 — One Business, Multiple Typed Locations

- **Date:** 2026-09-22
- **Decision:** Extend `app.location`; use a company default and `sec.user_location` assignments; retain role permissions separately. Default the soft guard to 50 active non-system locations.
- **Reason:** Existing POS, delivery, purchase, return, and stock records already reference location IDs and must retain their historical meaning.
- **Consequence:** RETURN_QUARANTINE remains system-managed and non-saleable. Internal transfers and transit receipt confirmation remain pending; future EFRIS branch mapping and pharmacy use cases can extend the model without credentials or medicine-specific data now.

## ADR-0026 — One Company, Branches, and Branch-Owned Locations

- **Date:** 2026-09-22
- **Decision:** Retain the existing company and location model, add `app.branch` as the operational/security/reporting unit, and require each active location to belong to one branch. Preserve existing KAM location IDs and backfill them to one default branch.
- **Security:** Role permissions, `sec.user_branch`, and subordinate `sec.user_location` are separate checks. Only explicit `HEAD_OFFICE` bypasses branch membership for cross-branch reads; transactions require a concrete branch.
- **Transfers:** Each dispatch branch has a system, non-saleable TRANSIT location. Receipt moves stock from that transit to the destination branch/location. No GL/P&L entry is created for transfer movements.
- **Master data/numbering:** Product/customer/supplier data and ledger remain company-wide. Existing document-number logic is retained; branch-safe uniqueness and future centralized numbering require validation before multi-branch launch.
- **Acceptance:** Schema/context/API foundation is not operational completion; branch isolation and consolidated reporting still require runtime proof.


## ADR-0027 — Fail Closed on Legacy Reports Without Branch Dimensions

- **Date:** 2026-09-22
- **Status:** Accepted for Phase 5 development hardening.
- **Decision:** Keep legacy dashboard, aggregate finance/general reports, and GRN variance inaccessible to non-HEAD_OFFICE users until their SQL sources are demonstrably branch-filterable. HEAD_OFFICE access still requires each endpoint's normal permission.
- **Reason:** Frontend branch selectors cannot secure or correctly partition consolidated SQL views that lack branch attribution.
- **Consequence:** Branch dashboard/report acceptance remains pending; do not claim per-branch P&L or consolidated correctness from this interim gate.

## ADR-0028 — Dashboard Uses the Selected Operating Branch

- **Date:** 2026-09-22
- **Decision:** Dashboard summary queries use the validated selected/default branch for every user. HEAD_OFFICE remains subject to the endpoint permission and does not get implicit consolidated totals; the current Dashboard has no consolidated-mode control.
- **Attribution:** Use source document location/branch dimensions for operational figures and `gl_journal.branch_id` for finance. If any journal has no branch attribution, cash and P&L cards are unavailable rather than partial.
- **Reason:** Releasing the old role gate is safe only when each query has a concrete branch attribution path and the current UI requests one branch.
- **Consequence:** Authenticated A/B API isolation and manual browser retest remain acceptance requirements; this code change alone is not runtime proof.
# Phase 5 finance/reporting scope decisions — 2026-09-22

- Finance and the seven explicitly branch-scoped weekly reports operate on the currently selected branch for every user, including HEAD_OFFICE. These endpoints do not offer an implicit consolidated view; other unscoped legacy/consolidated report endpoints retain their HEAD_OFFICE gate.
- POS stock and sale operations follow the selected operating branch/location. POS journals inherit the authoritative branch from the sale's location, including reversals.
- The Balance Sheet includes calculated current earnings for the selected branch because journal balances are not necessarily closed into equity. The account chart is shared across branches; the endpoint warns that company-wide balances are not allocated to branches.
- P&L classifies account code 5000 as COGS. With no separate non-operating classification in the current chart, operating profit equals net profit. Revisit when account classifications are defined.
# Phase 5 acceptance decisions — 2026-09-22

- Keep TEST_B, locations, and transaction evidence in development until Phase 5 receives final user approval; do not expose these fixtures in production.
- Preserve the shared chart of accounts and current P&L classification model. Non-operating classification remains deferred; acceptance did not redesign finance classification.
- Derive branch for source-module journals from authoritative originating documents (Phase 30 SAL and Phase 31 PUR); payment documents with an explicit branch retain that source where applicable.
- Leave the existing `PHASE5-AB-TEST` product and shared test party clearly identified as test masters; no branch-specific master duplication.
- Do not claim overall acceptance until the pending authenticated/browser/regression items in `docs/TEST_LOG.md` are closed.
# Phase 5 Extension Decisions — 2026-09-22

- Cross-branch inventory visibility is a read capability and does not modify operating branch/location authorization used by transactions.
- Cost visibility is separate. Internal requests do not force lot selection; source selects lot at transfer preparation.
- Internal replenishment uses an ISR and stock transfer. Head Office is a company location, never a supplier; internal transfers create no AP/AR/GL/P&L entries.
- Partial receipt requires a variance reason. Unreceived quantity remains explicitly in transit as RECEIVED_WITH_VARIANCE pending resolution.
- Default procurement policy is HYBRID. LOCAL_WITH_APPROVAL holds POs in PENDING_APPROVAL until approved; CENTRAL_ONLY blocks supplier PO creation but allows internal requests.
- Keep accessible View actions alongside row double-click. Browser and reverse Head Office runtime cases remain pending.
## Phase 5 Final Closure Decisions — 2026-09-22

- Inventory category filtering reuses the existing product-category API and product foreign key; no duplicate category logic was introduced.
- Browser-dependent acceptance is recorded as PENDING when no authenticated browser tab is available. API/static results are not promoted to browser PASS.
- The existing explicit variance/transit model remains unchanged: unreceived stock stays in transit and is not silently written off.
## Phase 5 Final Acceptance Update — 2026-09-22

- A short-delivery transfer remains unresolved until the remaining in-transit quantity is received; subsequent receipt is allowed only for that remainder and uses the destination authorization path.
- No write-off was introduced. A confirmed loss remains an explicit variance requiring a future controlled workflow.
- Reverse Head Office and browser results stay PENDING when the development API/browser session is unavailable.
## Phase 5 Frontend Completion Decisions — 2026-09-22

- Existing Stock Requests and Inter-Site Transfers screens are the repository-equivalent operational pages; no duplicate pages or endpoints were introduced.
- Transfer UI keeps View and row double-click as separate access paths and makes unresolved transit explicit.
- Browser acceptance remains PENDING when no authenticated browser tab exists; static/API evidence is not promoted to browser PASS.
## ADR-0018 — Tax snapshots precede tax activation

- **Decision:** Store effective-dated tax master data and nullable transaction snapshots first; leave the tax feature disabled until accounting posting and return reversal paths are tax-aware.
- **Reason:** This preserves existing ERP behavior and prevents a current-rate change from recalculating historical documents or introducing duplicate VAT in credit POS/return flows.
## ADR-0019 — Tax recognition follows the authoritative accounting event

- **Decision:** POS is the accounting authority for POS sales, including CREDIT POS. Generated credit AR invoices reuse the POS journal. Ordinary AR invoices post revenue/output VAT once; AP invoices post input VAT at AP posting; Delivery and GRN do not create duplicate tax.
- **Decision:** Refund settlement never posts a second tax reversal. Customer-return tax facts are copied from the original line snapshot for later proportional reversal integration.

## ADR-0020 — Configurable effective-dated VAT rates

- Uganda STANDARD is seeded at 18%, but rates are configuration data in company-scoped effective-dated tax-code rows. Products reference tax codes, not percentages; future rate periods are added without rewriting product records or posted snapshots.
- Selling Price Management is a convenience editor for `inv.product.tax_code_id`; Tax Rate Management is restricted to `MANAGE_TAX_CONFIGURATION`. The dedicated Product Tax Classification control remains available.

## ADR-0021 — Explicit tax save and editable POS quantities

- Tax treatment changes remain local drafts until an explicit Save Tax request succeeds; dependent product/POS/precheck queries are then refreshed.
- POS quantities preserve intermediate text while typing and validate on commit. Checkout presentation may improve, but POS accounting, inventory, lot/cost, branch/location, and tax snapshot authority remain unchanged.

## ADR-0022 — Reuse API payment channels for manual POS

- `fin.api_payment_channel` remains the single channel register; no provider or checkout duplicate was created. Existing `BANK` values remain compatible with the target `BANK_TRANSFER` concept.
- Manual payment transactions are confirmed only from an entered external reference and are recorded beside, not instead of, the existing POS journal boundary. Live/sandbox adapters are documented only.
- Provider secrets are never entered into ordinary channel fields; credential columns are status/reference metadata only.

## ADR-0023 — Uganda EFRIS as an adapter

- EFRIS remains outside the generic ERP core and tax engine. The independent `efris` feature/configuration is disabled by default and activation requires a server-side readiness precheck.
- POS is the fiscal authority for POS credit sales; generated AR invoices are not duplicated. Posted returns link to the original accepted fiscal document and queue a credit note using immutable return tax snapshots.
- Without official URA technical documentation, only a durable queue, adapter contract, mapping/readiness model, and explicitly-labelled internal mock are implemented.
