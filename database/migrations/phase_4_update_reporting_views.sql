/**
 * PHASE 4: UPDATE REPORTING VIEWS FOR TRANSACTION_DATE
 * 
 * Critical: All financial reports must use transaction_date (business date)
 * instead of created_at for accurate date-based calculations
 * 
 * Views to update:
 * - reporting.v_ar_aging: Use transaction_date for invoice age calculation
 * - reporting.v_ap_aging: Use transaction_date for payment terms
 * - reporting.v_weekly_p_and_l: Use transaction_date for period matching
 * - reporting.v_weekly_management_summary: Use transaction_date
 * - reporting.v_customer_concentration: Use transaction_date
 * 
 * NOTE: These are placeholder scripts. Each view must be examined and updated
 * according to its specific logic. The pattern is always the same:
 * 
 * OLD: ... WHERE invoice_date ... AND created_at < ...
 * NEW: ... WHERE transaction_date ... AND created_at < ...
 * 
 * created_at should NOT be used for age/period calculations; only for sort order or filtering timestamps
 */

-- ============================================================================
-- UPDATE 1: AR AGING VIEW
-- ============================================================================
-- Old query uses invoice_date for aging; new query uses transaction_date

-- DROP VIEW IF EXISTS reporting.v_ar_aging;
-- 
-- CREATE OR REPLACE VIEW reporting.v_ar_aging AS
-- SELECT
--   ai.ar_invoice_id,
--   ai.invoice_no,
--   ai.customer_id,
--   c.party_name AS customer_name,
--   ai.transaction_date,  -- <-- USE THIS for business date (not created_at)
--   CURRENT_DATE - ai.transaction_date AS days_outstanding,
--   CASE 
--     WHEN CURRENT_DATE - ai.transaction_date <= 30 THEN 'Current'
--     WHEN CURRENT_DATE - ai.transaction_date <= 60 THEN '31-60'
--     WHEN CURRENT_DATE - ai.transaction_date <= 90 THEN '61-90'
--     ELSE '90+'
--   END AS aging_bucket,
--   ai.due_date,
--   COALESCE(SUM(ail.sell_qty * ail.unit_price), 0) AS invoice_amount,
--   COALESCE(SUM(apa.amount), 0) AS paid_amount,
--   COALESCE(SUM(ail.sell_qty * ail.unit_price), 0) - COALESCE(SUM(apa.amount), 0) AS outstanding_amount,
--   ai.status,
--   CASE WHEN ai.backdate_flag = TRUE THEN 'YES' ELSE 'NO' END AS is_backdated
-- FROM sal.ar_invoice ai
-- LEFT JOIN app.party c ON c.party_id = ai.customer_id
-- LEFT JOIN sal.ar_invoice_line ail ON ail.ar_invoice_id = ai.ar_invoice_id
-- LEFT JOIN sal.ar_payment_apply apa ON apa.ar_invoice_id = ai.ar_invoice_id
-- GROUP BY ai.ar_invoice_id, c.party_name, ai.transaction_date, ai.due_date, ai.status, ai.backdate_flag
-- ORDER BY ai.transaction_date DESC;

-- ============================================================================
-- UPDATE 2: AP AGING VIEW
-- ============================================================================
-- Similar to AR aging: use transaction_date for payment terms/aging

-- DROP VIEW IF EXISTS reporting.v_ap_aging;
-- 
-- CREATE OR REPLACE VIEW reporting.v_ap_aging AS
-- SELECT
--   ap.ap_invoice_id,
--   ap.invoice_no,
--   ap.supplier_id,
--   s.party_name AS supplier_name,
--   ap.transaction_date,  -- <-- USE THIS
--   CURRENT_DATE - ap.transaction_date AS days_outstanding,
--   CASE 
--     WHEN CURRENT_DATE - ap.transaction_date <= ap.payment_terms THEN 'Not Due'
--     WHEN CURRENT_DATE - ap.transaction_date <= ap.payment_terms + 30 THEN 'Overdue 0-30'
--     WHEN CURRENT_DATE - ap.transaction_date <= ap.payment_terms + 60 THEN 'Overdue 31-60'
--     ELSE 'Overdue 60+'
--   END AS aging_bucket,
--   ap.due_date,
--   ap.invoice_amount,
--   COALESCE(SUM(app.amount), 0) AS paid_amount,
--   ap.invoice_amount - COALESCE(SUM(app.amount), 0) AS outstanding_amount,
--   ap.status,
--   CASE WHEN ap.backdate_flag = TRUE THEN 'YES' ELSE 'NO' END AS is_backdated
-- FROM pur.ap_invoice ap
-- LEFT JOIN app.party s ON s.party_id = ap.supplier_id
-- LEFT JOIN pur.ap_payment app ON app.ap_invoice_id = ap.ap_invoice_id
-- GROUP BY ap.ap_invoice_id, s.party_name, ap.transaction_date, ap.payment_terms, ap.due_date, ap.invoice_amount, ap.status, ap.backdate_flag
-- ORDER BY ap.transaction_date DESC;

-- ============================================================================
-- UPDATE 3: WEEKLY P&L REPORT
-- ============================================================================
-- Use transaction_date to group sales and purchases by business week

-- DROP VIEW IF EXISTS reporting.v_weekly_profit_and_loss;
-- 
-- CREATE OR REPLACE VIEW reporting.v_weekly_profit_and_loss AS
-- SELECT
--   DATE_TRUNC('week', ai.transaction_date)::DATE AS week_start,  -- <-- USE transaction_date
--   (DATE_TRUNC('week', ai.transaction_date) + '6 days'::INTERVAL)::DATE AS week_end,
--   SUM(COALESCE(ail.sell_qty * ail.unit_price, 0)) AS weekly_revenue,
--   SUM(COALESCE(ail.qty * isc.unit_cost, 0)) AS weekly_cogs,
--   SUM(COALESCE(ail.sell_qty * ail.unit_price, 0)) - SUM(COALESCE(ail.qty * isc.unit_cost, 0)) AS weekly_profit,
--   ROUND(
--     (SUM(COALESCE(ail.sell_qty * ail.unit_price, 0)) - SUM(COALESCE(ail.qty * isc.unit_cost, 0))) 
--     / NULLIF(SUM(COALESCE(ail.sell_qty * ail.unit_price, 0)), 0) * 100, 2
--   ) AS gross_margin_pct
-- FROM sal.ar_invoice ai
-- LEFT JOIN sal.ar_invoice_line ail ON ail.ar_invoice_id = ai.ar_invoice_id
-- LEFT JOIN inv.stock_movement_line isc ON isc.delivery_line_id = ail.delivery_line_id
-- GROUP BY DATE_TRUNC('week', ai.transaction_date)
-- ORDER BY week_start DESC;

-- ============================================================================
-- UPDATE 4: WEEKLY MANAGEMENT SUMMARY (Phase 3)
-- ============================================================================
-- Use transaction_date for all date-based metrics

-- The weekly management summary created in Phase 3 should be updated
-- to use transaction_date instead of created_at/delivery_date for all calculations
-- Original query groups by delivery_date; should group by transaction_date
-- Example change:
--   OLD: WHERE delivery_date BETWEEN week_start AND week_end
--   NEW: WHERE transaction_date BETWEEN week_start AND week_end

-- ============================================================================
-- UPDATE 5: CUSTOMER CONCENTRATION (Phase 3)
-- ============================================================================
-- Use transaction_date for weekly revenue calculation

-- The customer concentration report should use transaction_date
-- for determining which week a sale belongs to
-- This ensures backdated invoices appear in correct business period

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================
--
-- 1. TESTING REQUIRED: Each view must be tested with backdated transactions
--    to ensure dates are calculated correctly.
--
-- 2. FIFO LOGIC UPDATE: Separate migration required for payment allocation
--    Order payments by transaction_date instead of payment_date
--
-- 3. BACKDATE_FLAG ADDITION: All views that track backdates should include
--    backdate_flag in output for audit purposes
--
-- 4. PERFORMANCE: Ensure indexes on transaction_date exist on all transaction tables
--    Create indexes: CREATE INDEX idx_transaction_date ON [table](transaction_date)
--
-- 5. BACKWARD COMPATIBILITY: For existing reports using created_at:
--    - Keep both created_at and transaction_date in view
--    - Users can choose which date to use for analysis
--    - Document the difference clearly
--
-- ============================================================================
-- MIGRATION STATUS: SCRIPT TEMPLATES PROVIDED
-- ============================================================================
-- 
-- These are placeholder scripts showing the UPDATE PATTERN.
-- You MUST:
-- 1. Review existing views in your database
-- 2. Apply the same pattern (use transaction_date instead of created_at)
-- 3. Test thoroughly with backdated sample data
-- 4. Update this script with actual view definitions from your database
--
-- Example verification query:
-- SELECT view_definition FROM information_schema.views 
-- WHERE table_schema = 'reporting' 
-- AND table_name ILIKE '%aging%' OR '%profit%';
SELECT viewname, definition 
FROM pg_views 
WHERE schemaname = 'reporting' 
  AND viewname IN ('v_ar_aging', 'v_ap_aging', 'v_weekly_profit_and_loss');
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'sal' AND table_name = 'ar_invoice' 
  AND column_name = 'transaction_date';  -- also check 'pur.ap_invoice'
  SELECT
  ai.ar_invoice_id,
  ai.invoice_no,
  ai.transaction_date,      -- new business date
  CURRENT_DATE - ai.transaction_date AS days_outstanding,
  ...
FROM sal.ar_invoice ai
...
ORDER BY ai.transaction_date DESC
LIMIT 100;