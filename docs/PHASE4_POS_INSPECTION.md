# Phase 4 — Quick Sale / POS Foundation Inspection

**Date:** 2026-09-18
**Scope:** Architecture inspection and design-gap analysis only
**Status:** Inspection complete; implementation approval required

## 1. Existing sales lifecycle

The current operational path is Sales Order → Delivery → AR Invoice → AR Receipt. Sales orders require a customer and line items. Deliveries require a customer, location, and sales-order context; posting creates an inventory `SALE_ISSUE` movement and a COGS/Inventory journal. An AR invoice is created from a posted delivery, then an AR receipt is applied to that invoice and posted to cash/bank/mobile money against AR control. POS must remain a complementary path.

## 2. Existing delivery-posting behavior

`sal.post_delivery_by_no` delegates to `sal.post_delivery`. Posting locks the delivery, rejects cancelled/already-posted records, creates `inv.stock_movement` and lines, calculates COGS from lot unit cost, creates a balanced COGS/Inventory journal, and marks the delivery posted. This is safe to reuse only at a lower posting boundary; a POS transaction should not manufacture an order/delivery chain merely to obtain these side effects.

## 3. Existing AR invoice/payment behavior

AR invoices require a customer and a posted delivery. AR invoice posting debits AR control and credits sales revenue. AR payments require a customer, an invoice application, and a positive amount; payment posting debits the selected cash/bank/mobile account and credits AR control. A cash POS sale should not create unnecessary AR documents. Customer credit sales may use AR later, but that should be an explicit POS mode.

## 4. Product and inventory model

Products provide SKU, name, base UOM, saleable/active flags, product type, stock-item semantics, packaging metadata, lot tracking, expiry tracking, and shelf-life metadata. There is no product barcode field and no established price-list/default selling-price model. Stock-on-hand is available through inventory views and summary endpoints. Stock issue lines share the inventory movement model.

## 5. Lot allocation

`inv.enforce_lot_rules` requires a lot for lot-tracked products, verifies product/lot ownership, requires expiry data where configured, and rejects expired lots for `SALE_ISSUE`. Current delivery entry permits manual lot selection and does not provide a POS-grade automatic allocation algorithm. Future POS posting must allocate lots atomically: FEFO for expiry-tracked items, otherwise deterministic FIFO/oldest available lot, with a server-side availability check.

## 6. Customer and walk-in strategy

Current sales, delivery, AR invoice, and AR payment records require customers. No existing WALK-IN party was found. The recommended POS header should make `customer_id` optional for immediate cash sales and represent walk-in as a POS domain state. If a later AR or reporting boundary requires a party, a controlled WALK-IN customer can be introduced during implementation; it must not be silently created during this inspection.

## 7. Payment strategy

The current AR payment constraint supports `CASH`, `BANK`, and `MOBILE`; the current model has no `CARD` method. POS should define a small payment abstraction for CASH, CARD, and MOBILE_MONEY at the POS boundary, map each method to an explicitly configured posting account, and defer CARD account/method migration until implementation approval. Split tender is out of the minimum foundation scope.

## 8. Accounting integration

Existing posting setup provides Inventory, COGS, AR control, Sales Revenue, Cash, Bank, and Mobile account boundaries through `fin.get_account_id`, `fin.create_journal`, journal lines, and balance assertions. The minimum cash POS posting should atomically create: debit tender account / credit Sales Revenue, plus debit COGS / credit Inventory. A customer-credit POS mode may additionally use AR, but must not mix cash and AR semantics accidentally.

## 9. Recommended transaction model

Recommend a dedicated POS sale header/line model, rather than forcing POS through Sales Order and Delivery. The header should have a stable UUID, server-generated POS number, status, optional customer, location, cashier, totals, payment summary, posted/void audit fields, and an idempotency key. Lines should capture product, quantity, UOM, unit price, amount, and the resolved lot allocation. Link the completed POS sale to its stock movement and journal(s). This avoids document noise while preserving shared inventory and accounting primitives.

## 10. Alternatives considered

**Reuse Delivery:** smallest apparent schema change, but incompatible with mandatory sales-order/customer assumptions, manual lot semantics, and receipt-speed requirements. It also creates misleading delivery records.
**Dedicated POS posting:** cleanest user and audit model, but requires a shared/approved atomic posting boundary so stock and accounting logic is not duplicated.
**Delivery/Invoice variant:** reduces new objects but conflates fulfilment and checkout and still leaves payment/customer/lot gaps.
**Recommendation:** dedicated POS transaction model with shared low-level inventory/accounting primitives and optional AR linkage for credit sales.

## 11. POS API boundary

Future API shape: `GET /api/pos/products`, atomic `POST /api/pos/sales`, `GET /api/pos/sales/:id`, `POST /api/pos/sales/:id/void`, and a receipt retrieval/print boundary. The complete-sale endpoint should validate feature state and permission, accept an idempotency key, validate price/stock/payment, post all effects in one transaction, and return the sale plus receipt data. No endpoints are added in this inspection.

## 12. Frontend architecture

The frontend is React/TypeScript/Vite with React Router, TanStack Query, the existing `AppLayout`, and shared Radix/shadcn-style components. Future work should add a focused POS page and route, reuse the current responsive shell, and gate it with the existing feature resolver plus a POS permission. The current navigation and feature behavior are unchanged.

## 13. Responsive POS UI

Use a focused, fast-entry layout: searchable saleable products, cart, quantity/price editing according to approved pricing rules, customer optional, checkout/payment panel, and completion/receipt actions. Desktop can use a product/cart split; tablet/mobile should stack the same components. This is an additive page, not a navigation redesign.

## 14. Barcode readiness

No barcode field or scanner workflow exists today. Barcode scanning remains a later feature. Keep product lookup behind a product-search abstraction so a future barcode resolver can be added without changing the sale contract.

## 15. Pricing gap

Existing sales entry accepts a client-provided unit price; no approved default price-list model was found. POS implementation must not trust an arbitrary browser price. Before POS implementation, approve whether prices come from a controlled product price, a price list, or an explicitly permissioned cashier override. Pricing Engine remains a later roadmap phase unless the POS approval explicitly narrows that dependency.

## 16. Receipt design

Existing pages open browser print windows with HTML and `window.print`; those layouts are document/invoice-oriented. POS requires a separate thermal renderer and print stylesheet: 80 mm default, optional 58 mm printer profile later. The receipt must not reuse the A4 invoice layout.

## 17. Receipt content

Minimum receipt fields: business identity, address/phone where configured, POS/receipt number, date/time, cashier, optional customer, item description, quantity, unit price, line amount, subtotal, total, payment method, tendered amount, change, and footer. Tax, discount, and loyalty fields should be added only when their models and accounting treatment are approved.

## 18. Numbering

Current numbers are document-specific: sales orders and deliveries use timestamp-style identifiers, AR invoices use a sequence, and receipts use `RCP-` plus `sal.receipt_no_seq`. POS should have a dedicated server-side sequence such as `POS-YYYYMMDD-######`; the stable UUID and idempotency key remain the actual integrity anchors. Offline clients must not derive uniqueness from timestamps.

## 19. Till/session readiness

Till sessions are a later phase. POS should leave an extension point for a future register/till session and cashier, but the foundation should not invent a till model or opening/closing workflow. Cashier identity should come from the authenticated user for the initial online flow.

## 20. Offline readiness

Offline POS is a later synchronization phase. The online transaction contract should include an idempotency key and stable client correlation value so queued retries can be reconciled later. No offline queue, local posting, conflict resolution, or client-side stock authority should be implemented in this phase.

## 21. Void and returns

Void should be an authorized reversal, never deletion of a posted POS sale: reverse the sales/tender journal and stock movement in an atomic operation, retain the original record, and audit actor/time/reason. Returns, refunds, exchanges, and partial line returns require a separate approved model and are out of this foundation inspection.

## 22. Permissions

Current authorization is role-based and separate from feature flags. Existing delivery, invoice, and receipt permissions are not a clean POS boundary. Recommend future explicit `VIEW_POS`/`CREATE_POS_SALE` and `VOID_POS_SALE` actions, mapped to existing roles first; do not invent a new CASHIER role in this phase. POS access must require both the enabled `pos` feature and the relevant permission.

## 23. Feature flag state

The existing feature catalogue contains POS and barcode as future disabled features. POS must remain disabled by default and must not be globally enabled during implementation. Feature configuration must continue to control capability exposure, while permissions independently control authorization.

## 24. Audit/security

The future endpoint must rely on authenticated user/company context, validate all product, price, lot, location, payment, and customer references server-side, and record cashier, timestamps, idempotency key, source, and void reason. Never accept posted journal IDs, stock movement IDs, or final totals as trusted client authority.

## 25. Atomicity and idempotency

The completed sale should be one database transaction: lock/idempotency-check the request, validate all lines and tender, resolve lots, write the sale, write stock issue, write revenue/COGS journals, optionally write AR linkage, and mark posted. A retry must return the existing result or fail deterministically; it must never duplicate stock, revenue, or payment. The UI should also disable duplicate completion while the request is pending.

## 26. Reporting impact

Current sales, customer, product, and profit reports predominantly join `sal.delivery` and `sal.delivery_line`; delivery-based reporting remains authoritative for that workflow. POS should initially have separate POS sales/tender reports and a source discriminator. Do not silently union POS into existing reports during the foundation. A later approved reporting adapter can combine delivery and POS sale events without changing historical semantics.

## 27. Inventory reporting impact

If POS uses `SALE_ISSUE` movements with the same inventory movement tables, stock-on-hand and movement reports can remain inventory-authoritative. COGS reporting must link the POS-origin movement to its sale/journal and avoid double counting. This requires explicit implementation tests; no reporting query is changed now.

## 28. Payment/reporting impact

Existing AR payment screens and reports are invoice-application oriented. Immediate POS tender should be reported as POS tender, with payment method and account mapping, rather than pretending every cash checkout is an AR receipt. Customer-credit POS sales may bridge to AR only when the customer and credit terms are explicit.

## 29. Database/API/UI gaps

The main gaps are the absent POS sale model/API/page, absent controlled pricing source, absent barcode, absent walk-in convention, absent CARD posting mapping, absent automatic lot allocator, and absent till/offline/idempotency implementation. These are design dependencies, not reasons to alter existing production paths during inspection.

## 30. Smallest safe implementation slice

After approval, implement online-only cash/mobile/bank checkout for active saleable products, with an optional customer, controlled server-side price source, atomic dedicated POS sale posting, shared inventory/accounting primitives, dedicated 80 mm receipt output, explicit feature/permission gating, and reversible void. Defer card until its account/method mapping is approved if the existing payment model remains unchanged. Defer barcode, till, split tender, offline, returns, promotions, and advanced pricing.

## 31. Main risks

The highest risks are duplicate posting logic, overselling under concurrent checkouts, incorrect lot selection, untrusted client prices, duplicate retries, treating cash as AR, and silently changing existing reports. These risks require transaction-level tests and a controlled rollout after implementation approval.

## 32. Approval gates

Before implementation approve: the dedicated POS model; cash/customer treatment; supported payment methods and account mapping; price authority; lot-allocation rule; document numbering; POS permissions; void semantics; reporting source strategy; and the 80 mm receipt contract. No migration or backend/frontend implementation is included here.

## 33. Inspection conclusion

POS should be a dedicated, feature-gated, permissioned, online-first transaction path that shares inventory and accounting primitives but does not masquerade as a delivery or AR receipt. The recommended foundation is implementable without redesigning navigation or changing the existing workflow, subject to the approval gates above.

**No backend code, database code, migration, deployment, or commit was performed for Phase 4 Step 1.**
