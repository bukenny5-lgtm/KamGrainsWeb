# Phase 2 Product Model Inspection — Step 1

Date: 2026-09-18
Status: Inspection complete; implementation approval required.

## Existing model

The primary product master is `inv.product`:

| Column | Type / rule | Finding |
|---|---|---|
| `product_id` | UUID, PK, `gen_random_uuid()` | Stable identifier used by all transaction relationships |
| `sku` | text, NOT NULL, UNIQUE | Product code/SKU |
| `product_name` | text, NOT NULL | Display name |
| `product_type` | text, NOT NULL, CHECK `RAW`, `FINISHED`, `PACKAGING`, `SERVICE` | Current classification |
| `uom_code` | text, NOT NULL, FK `inv.uom(uom_code)` | Base inventory UOM |
| `track_lots` | boolean, NOT NULL, default true | Lot tracking |
| `track_expiry` | boolean, NOT NULL, default false | Expiry tracking |
| `shelf_life_days` | integer, nullable, positive | Shelf life |
| `is_active` | boolean, NOT NULL, default true | Active/inactive |
| `created_at` | timestamptz, NOT NULL, default now() | Audit timestamp |
| `lot_prefix` | text, nullable, constrained 2–6 uppercase alphanumeric | Lot numbering support |
| `is_saleable` | boolean, NOT NULL, default false | Selling flag |
| `bottle_volume_l` | numeric, nullable, positive | Beverage-oriented field already present |
| `pieces_per_carton` | numeric, nullable, positive | Packaging quantity |
| `pack_size_qty` | numeric, nullable, positive | Pack quantity |
| `pack_size_uom_code` | text, nullable, FK `inv.uom(uom_code)` | Pack UOM |

Constraints/indexes include `product_pkey`, unique `product_sku_key`, `ix_product_type`, unique partial `ux_product_lot_prefix`, and the listed product/UOM foreign keys.

The UOM master is `inv.uom` with only `uom_code` (PK, NOT NULL) and `uom_name` (NOT NULL). There is no conversion table or quantity-conversion service. Products have one base UOM plus an optional pack UOM. Sales orders, deliveries, and AR invoice lines carry optional `sell_uom_code`; delivery currently constrains it to `PCS`, `CTN`, or `KG`, and route code defaults missing selling UOM to `KG`. Purchase-order and GRN lines use quantity and unit price but have no independent purchase-UOM model.

## Product relationships

Direct product foreign keys were found in:

- `inv.lot.product_id`
- `inv.product_lot_counter.product_id`
- `inv.stock_movement_line.product_id`
- `inv.stock_count_line.product_id`
- `inv.damage_adjustment_line.product_id` and `.target_product_id`
- `pur.purchase_order_line.product_id`
- `pur.goods_receipt_line.product_id`
- `pur.ap_invoice_line.product_id`
- `sal.sales_order_line.product_id`
- `sal.delivery_line.product_id`
- `sal.ar_invoice_line.product_id`
- `mfg.batch.finished_product_id`
- `mfg.batch_input.component_product_id`
- `mfg.bom.finished_product_id`
- `mfg.bom_line.component_product_id`
- `mfg.packing_batch.bulk_product_id` and `.fg_product_id`
- `mfg.packing_batch_material.component_product_id`

Lots are uniquely constrained by `(product_id, lot_code)`. Stock-on-hand and valuation are exposed through `inv.v_stock_on_hand`, `inv.v_stock_on_hand_active`, `inv.v_stock_on_hand_all`, and `inv.v_inventory_valuation`. Other relevant views include expiry, lot-option, finished-product, and GRN variance views.

## Backend and frontend dependencies

Backend product CRUD is mounted at `/api/products` with list/detail GET, protected POST (`CREATE_SETUP`), protected PATCH (`EDIT_SETUP`), and protected DELETE (`DELETE`). Product selection is consumed by sales orders, purchase orders, deliveries, goods receipts, inventory, cleaning batches, stock adjustments/counts, and reporting. Inventory APIs include stock-on-hand, lots, products-summary, and low-stock endpoints. Reports include weekly sales, purchases, profit by product, and weekly management summary.

Frontend consumers include `Setup.tsx`, `SalesOrders.tsx`, `PurchaseOrders.tsx`, `GoodsReceipts.tsx`, `Deliveries.tsx`, `InventoryStock.tsx`, `CleaningBatches.tsx`, `Reports.tsx`, `src/types/api.ts`, and `src/api/client.ts`.

Observed assumptions include default selling UOM `KG`, fixed delivery selling-UOM options `PCS/CTN/KG`, lot-first inventory selection, cleaning filters based on `RAW`, `CLEAN`, `CLN`, or `FINISHED` text/type, and product forms that require SKU, name, type, and UOM. These assumptions are grain-compatible but not universal.

## Capability gap analysis

### Already supported

SKU, display name, base UOM, active/inactive, sellable flag, product type, service type, lot tracking, expiry, shelf life, lot prefix, and limited packaging metadata.

### Required for the minimal Phase 2 foundation

Design for nullable, backward-compatible product description, category/classification, purchasable flag, and stock-item/non-stock flag. Keep `product_id`, `sku`, existing product types, base UOM, lot relationships, and current API fields unchanged. A category lookup should be considered only if a controlled category vocabulary is needed; do not add industry-specific category tables yet.

### Defer to later phases

Barcode capture/scanning, multiple selling and purchasing UOM records, unit conversions, variant/size/flavour modeling, tax classification, reorder policies, pricing-engine complexity, and beverage returnable-container logic.

### Not currently justified

Tenant IDs, subscriptions, POS fields, supplier-specific SKU catalogs, price lists, and broad product attributes without a confirmed workflow requirement.

## Industry compatibility

The current model can represent supermarket products, grains, beverages, and spare parts as rows using SKU, name, product type, base UOM, optional packaging, and lot flags. It does not currently provide native barcode, category, purchaseability, non-stock, variant, or conversion semantics. Beverage packaging can be approximated with `PACKAGING`, bottle volume, and pack fields; it cannot yet model container custody/returns. Grain cleaning works because the current workflows interpret RAW/FINISHED and product naming conventions. Spare parts and general retail would require avoiding mandatory lot/cleaning assumptions in future workflow rules.

## Recommended safe implementation shape

Use additive nullable/defaulted columns on `inv.product` only after approval, preserving IDs and all existing foreign keys. Do not recreate the table, alter transaction tables, change reports, or change existing UOM semantics in this step. Backfill no new business meaning automatically. Existing products remain valid through safe defaults, while current endpoints continue returning their existing fields.

## Risks and tests for implementation

Main risks are breaking product CRUD response compatibility, accidentally treating services/non-stock items as lot-controlled, changing quantity semantics, and altering reporting joins. Required tests after implementation include product CRUD regression, existing sales/purchase/delivery/GRN flows, lots and stock-on-hand, cleaning/reclassification, all product reports, API contract snapshots, and backward compatibility with existing KAM products.

No database schema, production code, migration, deployment, or commit was performed for this inspection.
