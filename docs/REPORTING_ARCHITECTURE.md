# Reporting Architecture

POS reporting is intentionally separate from delivery-based weekly sales reporting. POS summaries and grouped reports query `sal.pos_sale`, `sal.pos_sale_line`, and posted `sal.customer_return` records, scoped by persisted sale location branch and authorized locations.

The legacy `/api/reports` router still protects consolidated views with an explicit branch-scoped allowlist. For ordinary branch users, routes outside that allowlist return the exact backend guard message: `These consolidated report views are not yet branch-scoped.` This guard remains in place; the POS report section does not bypass it and uses `/api/pos-sales` instead.

The current Reports POS section includes Summary, By Product, By Customer, By Cashier, By Payment Method, and Returns & Refunds. SQL aggregation is performed in the database; no new migration was required for Phase 8T.

Dashboard inspection: the existing dashboard definition was not changed in this continuation. POS reporting is not merged into delivery-based dashboard totals unless the existing dashboard query explicitly includes it; validate the dashboard query separately before treating its Total Sales as a POS-inclusive figure.

## Phase 8T-A legacy audit

The consolidated guard is the router middleware in `backend/src/routes/reports.routes.js`. It permits the explicit branch-scoped set (`customer-weekly-performance`, `dormant-customers`, `weekly-sales-by-product`, `weekly-purchases-by-product`, `weekly-profit-by-product`, `weekly-management-summary`, `petty-cash-activity`, and `cross-branch-transfers`) and Head Office users; other `/api/reports/*` routes return `These consolidated report views are not yet branch-scoped.`

Classification:

- Branch-safe now: POS routes; the allowlisted weekly reports; finance trial balance, profit and loss, balance sheet, and cashbook, which use branch-tagged journal rows; inventory, GRN, delivery, and expense routes that join persisted location/branch context.
- Intentionally blocked: customer concentration, customer RFM, branch performance, till performance, and any other `/api/reports` endpoint outside the allowlist for ordinary branch users.
- Root cause: Customer Concentration aggregates `reporting.v_sales_event_lines` without `branch_id`, so the guard correctly prevents company-wide customer rankings from being exposed. It needs a branch predicate or a branch-safe source/view before being enabled.
- Weekly Sales by Product is branch-safe in the current route: it uses `reporting.v_sales_event_lines`, `event_date`, `branch_id=$3`, and the existing delivery/business-event reporting model. It is not switched to Sales Orders.

Likely future audit targets are any new route added under `/api/reports` without an explicit allowlist entry, and any report query that reads `reporting.v_sales_event_lines` without carrying `branch_id` through every aggregation layer.
