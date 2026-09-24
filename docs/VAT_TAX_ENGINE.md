# Phase 6 — Configurable VAT / Tax Engine

## Architecture

`app.tax_code` is a company-scoped, effective-dated tax master. Uganda is seeded with `STANDARD` (18%), `ZERO_RATED` (0%), `EXEMPT`, and `OUT_OF_SCOPE`. Zero-rated and exempt are deliberately separate treatments. Tax remains disabled by default through the `tax_engine` feature and company settings.

The core tax engine is business-agnostic. Uganda VAT is the initial jurisdiction configuration. The current platform remains single-company with many branches and locations; `company_id` is already carried by tax codes and company settings as the extension point for future multi-company tenancy, which is intentionally out of scope.

Products use a nullable `inv.product.tax_code_id`; existing products are therefore preserved as unclassified until an administrator assigns a treatment. Posting-time tax snapshots are stored on POS, AR, and AP lines with tax code, treatment, rate, taxable amount, tax amount, and gross amount. Historical posted documents do not depend on the current tax master.

## Phase 6C UI correction

Product classification is exposed in Setup under Product Tax Classification and writes the authoritative `inv.product.tax_code_id`; values are loaded from active company tax codes rather than hardcoded in the frontend. Quick Sale product and price responses include tax code, treatment, name, and rate, and its cart summary displays Taxable Value, VAT, and Total when the tax engine is enabled. Activation readiness is shown separately and the server precheck remains authoritative for both the tax settings and Tax Engine feature paths.

## Calculation rules

- Tax exclusive: net is the entered amount; tax is net × rate; gross is net + tax.
- Tax inclusive: net is gross ÷ (1 + rate); tax is gross − net.
- Calculations use integer-scaled decimal arithmetic in `backend/src/services/tax.service.js` and round to two money decimals.
- Document totals add rounded line values, avoiding floating-point leakage and cumulative drift.

## Configuration and permissions

`GET/PATCH /api/tax/settings` manages engine/VAT state, country, default code, pricing mode, precision, and future account mappings. `GET/POST/PATCH /api/tax/codes` manages tax codes. Access is controlled by `VIEW_TAX_CONFIGURATION`, `MANAGE_TAX_CONFIGURATION`, and `VIEW_VAT_REPORTS` role mappings; no Admin-only shortcut is introduced.

## Posting/reporting readiness

Snapshot columns and report contracts are additive and preserve the existing Sales Order → Delivery → AR and PO → GRN → AP boundaries. `GET /api/tax/reports/summary` is explicitly an ERP VAT summary, not an official URA return. Branch filtering is retained for POS source locations; broader AR/AP branch reconciliation remains a follow-up before activation.

No EFRIS/URA API, product codes, fiscal identifiers, QR values, or deployment work is included in Phase 6. The snapshot model is intended to support later fiscal reconciliation and credit-note linkage.

## Data activation sequence

1. Configure tax codes and account mappings.
2. Classify products; keep unclassified products visible for administrator review.
3. Validate reports and posting behavior in a controlled environment.
4. Enable `tax_engine` and VAT settings only after acceptance.

## Known limitations

The current legacy database posting functions still own POS/AR/AP journal construction. Full output/input VAT journal split, tax-aware customer-return reversal, all document UI totals, and authenticated browser acceptance remain pending follow-up work. Phase 6 does not claim those workflows are safe to activate solely from this foundation.

## Manual acceptance checklist after tax posting wiring

- Open Setup as an authorized setup user; verify tax settings, four Uganda tax codes, and disabled-by-default feature state.
- Assign Standard Rated, Zero Rated, Exempt, and Out of Scope to products; leave one product unclassified and confirm it remains neutral while VAT is disabled.
- Enable only in a controlled test business, then test exclusive/inclusive POS prices, a mixed basket, manual price mode, discount, credit POS, AR invoice, full/partial return, refund, standard/non-recoverable purchase, AP invoice, and rate-date history.
- Repeat representative sales and purchases in Branch A and Branch B; verify journal branch attribution and no duplicate VAT from credit POS or refunds.
- Review ERP VAT Sales, Purchase, Control, and transaction-detail reports by date, branch, and tax code.

## Phase 6C final rate-management UX

Tax Rate Management is administrator-only and creates/maintains company-scoped effective periods. Product assignments remain tax-code references; transaction resolution selects the applicable effective row by tax-code code and date, so a future rate does not require product reassignment. Active periods cannot overlap, and posted transaction snapshots remain immutable.

Phase 6D adds explicit tax-save confirmation and dependent catalogue/cache refreshes, plus Quick Sale fractional quantity editing and ordered tax/payment checkout presentation. These are UI changes only; POS journal, inventory, lot/cost, branch/location, and snapshot posting authority are preserved.

## Phase 6C runtime evidence

Rollback-contained development acceptance passed for POS, AR, and AP using the designated `NB-CLEAN` fixture: net UGX 4,000, VAT UGX 720, gross UGX 4,720. POS debit/credit was UGX 7,220/7,220 including existing COGS/inventory; AR and AP journals were each UGX 4,720/4,720. The test transaction, temporary classification, and temporary activation were rolled back. VAT remains disabled because product classification is incomplete.
