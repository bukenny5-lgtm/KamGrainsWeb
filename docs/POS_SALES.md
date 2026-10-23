# POS Sales and Branch-Safe Analytics

Phase 8T uses the persisted `sal.pos_sale` and `sal.pos_sale_line` records as the source of truth. Every `/api/pos-sales` request joins the sale location to `app.branch` and applies the authenticated branch/location scope before filtering or aggregating.

Available reporting endpoints are `/api/pos-sales/summary`, `/api/pos-sales/by-product`, `/api/pos-sales/by-customer`, `/api/pos-sales/by-cashier`, `/api/pos-sales/by-payment`, and `/api/pos-sales/returns`. Date filters use `from` and `to`; history also supports search, payment, status, return status, and refund status.

The POS history page exports the filtered rows through the existing `excelExport.ts` helper. Money columns are exported as numeric cells, with date/time and business-reference columns kept separate. Reports exposes the grouped POS views and exports the currently selected report/date scope.

Return status is derived from posted POS return quantities (`NONE`, `PARTIAL`, `FULL`). Refund status is derived from posted refund due/settled amounts (`NONE`, `DUE`, `PARTIAL`, `SETTLED`). Returns are aggregated independently from original sale revenue so they are not double-counted.

## Phase 8T-A period standard

POS reports use visible `Date From` and `Date To` controls. The Reports page defaults to the first day of the current month through today, includes both dates in React Query keys, validates `Date From <= Date To`, and sends the active range (plus the current location when selected) to every POS report route. Weekly operational reports retain their separate Monday–Sunday `week_start`/`week_end` convention.

The grouped POS endpoints use the actual persisted POS sale customer, creator/cashier, payment method, sale lines, and posted POS return fields. Walk-in sales are grouped as one `Walk-in` row and do not require `sal.customer_branch` membership. Failed requests remain errors; an empty successful result is shown as no records for the selected period.
