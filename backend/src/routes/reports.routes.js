import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserRoles, ACTION_ROLES, requirePermission } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

console.log("=== LOADED reports.routes.js ===");
console.log("=== LOADED reports.routes.js ===");
const router = express.Router();
router.use(requireAuth, requireLocationAccessWhenSpecified);
const BRANCH_SCOPED_REPORTS = new Set([
  "/customer-weekly-performance",
  "/dormant-customers",
  "/customer-rfm",
  "/weekly-sales-by-product",
  "/weekly-purchases-by-product",
  "/weekly-profit-by-product",
  "/weekly-management-summary",
  "/petty-cash-activity",
  "/cross-branch-transfers",
]);
router.use((req,res,next)=>{
  const roles=getUserRoles(req);
  if(!roles.some(role=>ACTION_ROLES.VIEW_ONLY.includes(role)))return res.status(403).json({success:false,message:"You do not have permission to view reports."});
  if(!BRANCH_SCOPED_REPORTS.has(req.path)&&!roles.includes("HEAD_OFFICE"))return res.status(403).json({success:false,message:"These consolidated report views are not yet branch-scoped."});
  next();
});

/**
 * Finance error helpers (from finance.routes.js)
 */
function getFinanceErrorStatus(error, fallbackStatus = 500) {
  const code = String(error?.code || "");
  if (Number(error?.status) >= 400) return Number(error.status);
  if (Number(error?.statusCode) >= 400) return Number(error.statusCode);
  if (code === "P0001") return 400;
  if (code === "23505") return 409;
  if (["23502", "23503", "22P02", "22003"].includes(code)) return 400;
  return fallbackStatus;
}

function getFinanceErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();
  if (message) return message;
  return fallbackMessage;
}

function sendFinanceError(res, error, fallbackMessage, fallbackStatus = 500) {
  console.error("========== REPORT ERROR ==========");
  console.error(error);
  console.error("Message:", error?.message);
  console.error("Code:", error?.code);
  console.error("Detail:", error?.detail);
  console.error("Hint:", error?.hint);
  console.error("Stack:");
  console.error(error?.stack);
  console.error("==================================");

  const status = getFinanceErrorStatus(error, fallbackStatus);
  const message = getFinanceErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null
  });
}

function reportScope(req, requestedBranch) {
  const roles = getUserRoles(req);
  const global = roles.some((role) => ["ADMIN", "HEAD_OFFICE", "AUDITOR"].includes(role));
  if (!global && requestedBranch && String(requestedBranch) !== String(req.branchId)) {
    const error = new Error("You are not authorized for the requested branch.");
    error.statusCode = 403;
    throw error;
  }
  return global ? (requestedBranch || null) : req.branchId;
}

function reportDates(req) {
  const end = String(req.query.date_to || new Date().toISOString().slice(0, 10));
  const start = String(req.query.date_from || end);
  return [start, end];
}

/** Branch-level business-event revenue and posted inventory cost. Payments are
 * deliberately absent: receipts do not create sales revenue. */
router.get("/branch-performance", async (req, res) => {
  try {
    const [dateFrom, dateTo] = reportDates(req);
    const branchId = reportScope(req, req.query.branch_id);
    const result = await query(`
      SELECT b.branch_id,b.branch_code,b.branch_name,
             COALESCE(SUM(e.revenue),0) AS sales_revenue,
             COALESCE(SUM(e.cogs),0) AS cogs,
             COALESCE(SUM(e.revenue-e.cogs),0) AS gross_profit,
             CASE WHEN COALESCE(SUM(e.revenue),0)=0 THEN 0
                  ELSE COALESCE(SUM(e.revenue-e.cogs),0)/SUM(e.revenue) END AS gross_margin,
             COUNT(DISTINCT e.event_id)::int AS transaction_count,
             COUNT(DISTINCT e.customer_id)::int AS customer_count
      FROM app.branch b
      LEFT JOIN reporting.v_sales_event_lines e
        ON e.branch_id=b.branch_id AND e.event_date BETWEEN $1::date AND $2::date
      WHERE b.company_id=(SELECT company_id FROM app.company_profile WHERE is_active ORDER BY created_at LIMIT 1)
        AND b.is_active AND ($3::uuid IS NULL OR b.branch_id=$3::uuid)
      GROUP BY b.branch_id,b.branch_code,b.branch_name
      ORDER BY b.branch_name`, [dateFrom, dateTo, branchId]);
    res.json({ success: true, filters: { date_from: dateFrom, date_to: dateTo, branch_id: branchId }, data: result.rows });
  } catch (error) { sendFinanceError(res, error, "Failed to load branch performance report.", error.statusCode || 500); }
});

/** Daily till/session operational performance. Cash movements are reported as
 * movements, never as sales or profit. */
router.get("/till-performance", async (req, res) => {
  try {
    const [dateFrom, dateTo] = reportDates(req);
    const branchId = reportScope(req, req.query.branch_id);
    const locationId = req.query.location_id || null;
    const tillId = req.query.till_id || null;
    const result = await query(`
      WITH scoped_sessions AS (
        SELECT s.session_id,s.till_id,s.branch_id,s.location_id,s.opened_at::date AS business_date,
               s.expected_cash,s.counted_cash,s.cash_variance,t.till_code,b.branch_name,l.location_name
        FROM app.cashier_session s
        JOIN app.till t ON t.till_id=s.till_id
        JOIN app.branch b ON b.branch_id=s.branch_id
        JOIN app.location l ON l.location_id=s.location_id
        WHERE s.opened_at::date BETWEEN $1::date AND $2::date
          AND ($3::uuid IS NULL OR s.branch_id=$3::uuid)
          AND ($4::uuid IS NULL OR s.location_id=$4::uuid)
          AND ($5::uuid IS NULL OR s.till_id=$5::uuid)
      ), movement_totals AS (
        SELECT session_id,
          COALESCE(SUM(amount) FILTER (WHERE movement_type='CASH_SALE'),0) AS cash_sales,
          COALESCE(SUM(amount) FILTER (WHERE movement_type='CASH_REFUND'),0) AS cash_refunds,
          COALESCE(SUM(amount) FILTER (WHERE movement_type='CASH_IN'),0) AS cash_in,
          COALESCE(SUM(amount) FILTER (WHERE movement_type IN ('CASH_OUT','PAYOUT')),0) AS cash_out,
          COALESCE(SUM(amount) FILTER (WHERE movement_type='SAFE_DROP'),0) AS safe_drops,
          COALESCE(SUM(amount) FILTER (WHERE movement_type='OPENING_FLOAT'),0) AS opening_float
        FROM app.till_cash_movement GROUP BY session_id
      )
      SELECT ss.business_date,ss.till_id,ss.till_code,ss.branch_name AS branch,ss.location_name AS location,
             COUNT(*)::int AS session_count,
             COALESCE(SUM(mt.cash_sales),0) AS cash_sales,COALESCE(SUM(mt.cash_refunds),0) AS cash_refunds,
             COALESCE(SUM(mt.cash_in),0) AS cash_in,COALESCE(SUM(mt.cash_out),0) AS cash_out,
             COALESCE(SUM(mt.safe_drops),0) AS safe_drops,COALESCE(SUM(mt.opening_float),0) AS opening_float,
             COALESCE(SUM(ss.expected_cash),0) AS expected_cash,COALESCE(SUM(ss.counted_cash),0) AS counted_cash,
             COALESCE(SUM(ss.cash_variance),0) AS variance
      FROM scoped_sessions ss LEFT JOIN movement_totals mt ON mt.session_id=ss.session_id
      GROUP BY ss.business_date,ss.till_id,ss.till_code,ss.branch_name,ss.location_name
      ORDER BY ss.business_date,ss.till_code`, [dateFrom, dateTo, branchId, locationId, tillId]);
    res.json({ success: true, filters: { date_from: dateFrom, date_to: dateTo, branch_id: branchId, location_id: locationId, till_id: tillId }, data: result.rows });
  } catch (error) { sendFinanceError(res, error, "Failed to load till performance report.", error.statusCode || 500); }
});

/** Branch petty-cash book: funding, expenses, reversals, and running balance.
 * It is journal-derived so it cannot drift from the canonical GL balance. */
router.get("/cross-branch-transfers", requirePermission("VIEW_CROSS_BRANCH_TRANSFERS"), async (req, res) => {
  try {
    const [dateFrom, dateTo] = reportDates(req);
    const branchId = reportScope(req, req.query.branch_id);
    const result = await query(`
      SELECT t.transfer_id,t.transfer_no,t.transaction_date,t.amount,t.reason,t.reference,t.status,
             t.transfer_type,t.source_branch_id,t.destination_branch_id,t.created_at,t.submitted_at,
             t.approved_at,t.dispatched_at,t.received_at,t.received_amount,
             sb.branch_code AS source_branch_code,sb.branch_name AS source_branch_name,
             db.branch_code AS destination_branch_code,db.branch_name AS destination_branch_name,
             fa.account_code AS source_account_code,ta.account_code AS destination_account_code
      FROM fin.payment_account_transfer t
      JOIN app.branch sb ON sb.branch_id=t.source_branch_id
      JOIN app.branch db ON db.branch_id=t.destination_branch_id
      JOIN fin.gl_account fa ON fa.account_id=t.from_payment_account_id
      JOIN fin.gl_account ta ON ta.account_id=t.to_payment_account_id
      WHERE t.company_id=(SELECT company_id FROM app.company_profile LIMIT 1)
        AND t.transfer_type='CROSS_BRANCH' AND t.transaction_date BETWEEN $1::date AND $2::date
        AND ($3::uuid IS NULL OR t.source_branch_id=$3 OR t.destination_branch_id=$3)
      ORDER BY t.transaction_date DESC,t.created_at DESC
      LIMIT 500
    `, [dateFrom, dateTo, branchId]);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) { sendFinanceError(res, error, "Failed to load cross-branch transfer report."); }
});

router.get("/petty-cash-activity", async (req, res) => {
  try {
    const [dateFrom, dateTo] = reportDates(req);
    const branchId = reportScope(req, req.query.branch_id);
    const result = await query(`
      WITH petty AS (
        SELECT pac.account_id,pac.branch_id,ga.account_code,ga.account_name,b.branch_code,b.branch_name
        FROM fin.payment_account_control pac
        JOIN fin.gl_account ga ON ga.account_id=pac.account_id
        JOIN app.branch b ON b.branch_id=pac.branch_id
        WHERE pac.account_role='PETTY_CASH' AND pac.is_active
          AND ($3::uuid IS NULL OR pac.branch_id=$3::uuid)
      ), movements AS (
        SELECT p.branch_id,p.account_id,p.account_code,p.account_name,p.branch_code,p.branch_name,
               j.journal_id,j.journal_no,j.journal_date,j.source_module,j.description,
               COALESCE(SUM(l.debit),0) AS debit,COALESCE(SUM(l.credit),0) AS credit
        FROM petty p JOIN fin.gl_journal_line l ON l.account_id=p.account_id
        JOIN fin.gl_journal j ON j.journal_id=l.journal_id
        WHERE j.journal_date BETWEEN $1::date AND $2::date
        GROUP BY p.branch_id,p.account_id,p.account_code,p.account_name,p.branch_code,p.branch_name,
                 j.journal_id,j.journal_no,j.journal_date,j.source_module,j.description
      ), opening AS (
        SELECT p.account_id,COALESCE(SUM(CASE WHEN j.journal_id IS NOT NULL THEN l.debit-l.credit ELSE 0 END),0) AS opening_balance
        FROM petty p LEFT JOIN fin.gl_journal_line l ON l.account_id=p.account_id
        LEFT JOIN fin.gl_journal j ON j.journal_id=l.journal_id AND j.journal_date < $1::date
        GROUP BY p.account_id
      )
      SELECT m.*,o.opening_balance,
             SUM(m.debit-m.credit) OVER (PARTITION BY m.account_id ORDER BY m.journal_date,m.journal_no,m.journal_id) + o.opening_balance AS running_balance,
             CASE WHEN m.source_module='CASH_TRANSFER' AND m.debit>0 THEN 'FUNDING_IN'
                  WHEN m.source_module='EXP' AND m.credit>0 THEN 'EXPENSE_OUT'
                  WHEN m.source_module='EXP_VOID' AND m.debit>0 THEN 'EXPENSE_REVERSAL_IN'
                  WHEN m.source_module IN ('CASH_TRANSFER','TRF') AND m.credit>0 THEN 'TRANSFER_OUT'
                  ELSE 'OTHER' END AS activity_type
      FROM movements m JOIN opening o ON o.account_id=m.account_id
      ORDER BY m.journal_date,m.journal_no`, [dateFrom,dateTo,branchId]);
    res.json({ success:true, filters:{date_from:dateFrom,date_to:dateTo,branch_id:branchId}, data:result.rows });
  } catch (error) { sendFinanceError(res,error,"Failed to load petty cash activity report.",error.statusCode||500); }
});

/**
 * Week utilities
 */
function getWeekBoundaries(refDateStr = null) {
  const date = refDateStr ? new Date(refDateStr) : new Date();
  const dayOfWeek = date.getDay();
  const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  
  // Format as ISO date strings
  const format = (d) => d.toISOString().split('T')[0];
  return {
    week_start: format(monday),
    week_end: format(sunday)
  };
}

/**
 * GET /api/reports/customer-weekly-performance?week_date=YYYY-MM-DD
 * Customer sales performance for selected week with dynamic bean type columns
 *
 * PHASE 4: period membership now keyed off d.transaction_date (business date)
 * instead of d.delivery_date, so backdated deliveries land in the correct
 * business week. so.created_at is left as-is for sales-order scoping since
 * sal.sales_order has no transaction_date column.
 */
router.get("/customer-weekly-performance", requireAuth, async (req, res) => {
  try {
    const { week_date } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    // First, get all active bean products for dynamic columns
    const productsResult = await query(`
      SELECT product_id, product_name, sku
      FROM inv.product
      WHERE product_type IN ('FINISHED','RAW') AND is_active = true
      ORDER BY product_name;
    `);

    const products = productsResult.rows || [];

    // Get customer weekly performance data
    const result = await query(`
      WITH week_sales AS (
    SELECT
        c.party_id,
        c.party_name,
        COALESCE(s.orders_count, 0) AS orders_count,
        COALESCE(s.total_kg_purchased, 0) AS total_kg_purchased,
        COALESCE(s.total_revenue, 0) AS total_revenue,
        s.last_purchase_date
    FROM app.party c
    LEFT JOIN (
        SELECT customer_id,
               COUNT(DISTINCT event_id) FILTER(WHERE source<>'RETURN') AS orders_count,
               SUM(qty) AS total_kg_purchased,
               SUM(revenue) AS total_revenue,
               MAX(event_date) AS last_purchase_date
        FROM reporting.v_sales_event_lines
        WHERE customer_id IS NOT NULL AND event_date BETWEEN $1::DATE AND $2::DATE AND branch_id=$3
        GROUP BY customer_id
    ) s ON s.customer_id = c.party_id
    WHERE c.party_type = 'CUSTOMER' AND s.customer_id IS NOT NULL
),
      customer_summary AS (
    SELECT
        party_id,
        party_name,
        COUNT(DISTINCT CASE WHEN orders_count > 0 THEN party_id END) AS has_orders,
        COALESCE(SUM(total_kg_purchased), 0) AS total_kg,
        COALESCE(SUM(total_revenue), 0) AS revenue,
        COALESCE(MAX(orders_count), 0) AS orders,
        MAX(last_purchase_date) AS last_purchase
    FROM week_sales
    GROUP BY
        party_id,
        party_name
)
      SELECT
    cs.party_id AS customer_code,
    cs.party_name AS customer_name,
    cs.orders AS orders_count,
    cs.total_kg AS total_kg_purchased,
    cs.revenue AS total_revenue,
    CASE
        WHEN cs.orders > 0
        THEN cs.revenue / cs.orders
        ELSE 0
    END AS average_order_value,
    cs.last_purchase AS last_purchase_date
FROM customer_summary cs
ORDER BY
    cs.revenue DESC,
    cs.party_name;
    `, [week_start, week_end, req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
      products: products.map(p => ({
        product_id: p.product_id,
        product_name: p.product_name,
        sku: p.sku
      }))
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load customer weekly performance report.");
  }
});

/**
 * GET /api/reports/dormant-customers?week_date=YYYY-MM-DD&status=ACTIVE|AT_RISK|DORMANT
 * Customers with no purchases in selected week
 *
 * PHASE 4: last purchase / dormancy window now keyed off transaction_date
 * (business date) on both delivery and ar_invoice instead of delivery_date /
 * invoice_date.
 */
router.get("/dormant-customers", requireAuth, async (req, res) => {
  try {
    const { week_date, status } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    const result = await query(`
      WITH branch_sales AS (
        SELECT * FROM reporting.v_sales_event_lines
        WHERE branch_id=$4 AND customer_id IS NOT NULL AND source<>'RETURN'
      ), customer_last_purchase AS (
        SELECT c.party_id,c.party_name,MAX(bs.event_date) AS last_purchase_date,
               COALESCE(SUM(bs.revenue) FILTER(WHERE bs.event_date=last_event.event_date),0) AS last_purchase_value,
               CURRENT_DATE-MAX(bs.event_date)::date AS days_since
        FROM app.party c
        JOIN branch_sales bs ON bs.customer_id=c.party_id
        JOIN LATERAL(SELECT MAX(event_date) AS event_date FROM branch_sales recent WHERE recent.customer_id=c.party_id) last_event ON true
        WHERE c.party_type='CUSTOMER'
        GROUP BY c.party_id,c.party_name,last_event.event_date
      ),
      dormant_status AS (
        SELECT
          party_id,
          party_name,
          last_purchase_date,
          days_since,
          last_purchase_value,
          CASE
            WHEN days_since IS NULL THEN 'DORMANT'
            WHEN days_since <= 14 THEN 'ACTIVE'
            WHEN days_since <= 30 THEN 'AT_RISK'
            ELSE 'DORMANT'
          END AS status
        FROM customer_last_purchase
        WHERE NOT EXISTS (
          SELECT 1 FROM branch_sales e
          WHERE e.customer_id = customer_last_purchase.party_id
            AND e.event_date BETWEEN $1::DATE AND $2::DATE
        )
      )
      SELECT
        cs.party_id AS customer_code,
        cs.party_name AS customer_name,
        last_purchase_date,
        COALESCE(days_since, 999999) AS days_since_last_purchase,
        COALESCE(last_purchase_value, 0) AS last_purchase_value,
        status
      FROM dormant_status cs
      WHERE $3::TEXT IS NULL OR status = $3::TEXT
      ORDER BY days_since DESC, party_name;
    `, [week_start, week_end, status || null, req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load dormant customers report.");
  }
});

/**
 * GET /api/reports/customer-rfm?week_date=YYYY-MM-DD
 * RFM analysis for customer segmentation
 *
 * PHASE 4: recency/frequency/monetary windowing now keyed off transaction_date
 * on delivery and ar_invoice. so.created_at left as-is for sales-order scoping.
 */
router.get("/customer-rfm", requireAuth, async (req, res) => {
  try {
    const { week_date } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    const result = await query(`
      WITH branch_events AS (
        SELECT * FROM reporting.v_sales_event_lines
        WHERE branch_id=$3 AND event_date BETWEEN $1::DATE AND $2::DATE AND customer_id IS NOT NULL
      ), rfm_data AS (
        SELECT c.party_id,c.party_name,
               COALESCE($2::DATE-MAX(e.event_date) FILTER(WHERE e.source<>'RETURN'),999) AS recency,
               COUNT(DISTINCT e.event_id) FILTER(WHERE e.source<>'RETURN') AS frequency,
               COALESCE(SUM(e.revenue),0) AS monetary
        FROM app.party c
        LEFT JOIN branch_events e ON e.customer_id=c.party_id
        WHERE c.party_type='CUSTOMER'
          AND EXISTS(SELECT 1 FROM reporting.v_sales_event_lines history WHERE history.branch_id=$3 AND history.customer_id=c.party_id AND history.source<>'RETURN')
        GROUP BY c.party_id,c.party_name
      ),
      segmented AS (
        SELECT
          party_id,
          party_name,
          COALESCE(recency, 999) AS recency,
          COALESCE(frequency, 0) AS frequency,
          COALESCE(monetary, 0) AS monetary,
          CASE
    /* Frequent purchaser with high weekly spend */
    WHEN frequency >= 5
         AND monetary >= 100000
         AND recency <= 2
    THEN 'Champion'

    /* Strong repeat customer this week */
    WHEN frequency >= 3
         AND monetary >= 50000
         AND recency <= 7
    THEN 'Loyal'

    /* Purchased more than once this week */
    WHEN frequency >= 2
    THEN 'Regular'

    /* Purchased only once this week */
    WHEN frequency = 1
    THEN 'At Risk'

    /* No purchases during selected week */
    ELSE 'Dormant'
END AS segment
        FROM rfm_data
      )
      SELECT
        party_id AS customer_code,
        party_name AS customer_name,
        recency,
        frequency,
        monetary,
        segment
      FROM segmented
      ORDER BY segment, monetary DESC, party_name;
    `, [week_start, week_end, req.branchId]);

    // Aggregate by segment
    const segments = {};
    result.rows.forEach(row => {
      if (!segments[row.segment]) {
        segments[row.segment] = { count: 0, total_monetary: 0, avg_recency: 0, avg_frequency: 0 };
      }
      segments[row.segment].count += 1;
      segments[row.segment].total_monetary += row.monetary;
      segments[row.segment].avg_recency += row.recency;
      segments[row.segment].avg_frequency += row.frequency;
    });

    // Calculate averages
    Object.keys(segments).forEach(seg => {
      const count = segments[seg].count;
      segments[seg].avg_recency = Math.round(segments[seg].avg_recency / count);
      segments[seg].avg_frequency = Math.round(segments[seg].avg_frequency / count * 10) / 10;
    });

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
      summary: segments
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load RFM analysis report.");
  }
});

/**
 * GET /api/reports/weekly-sales-by-product?week_date=YYYY-MM-DD
 * Product sales for selected week
 *
 * PHASE 4: period membership keyed off d.transaction_date instead of
 * d.delivery_date.
 */
router.get("/weekly-sales-by-product", requireAuth, async (req, res) => {
  try {
    const { week_date } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    const result = await query(`
      SELECT
        p.product_id,
        p.product_name,
        p.sku,
        COALESCE(SUM(s.qty), 0) AS kg_sold,
        COALESCE(SUM(s.revenue), 0) AS revenue,
        CASE
          WHEN COALESCE(SUM(s.qty), 0) > 0
          THEN COALESCE(SUM(s.revenue), 0) / COALESCE(SUM(s.qty), 1)
          ELSE 0
        END AS average_selling_price,
        COUNT(DISTINCT s.event_id) FILTER(WHERE s.source<>'RETURN') AS orders_count,
        COUNT(DISTINCT s.customer_id) AS customers_count
      FROM inv.product p
        LEFT JOIN reporting.v_sales_event_lines s
         ON s.product_id = p.product_id
         AND s.event_date BETWEEN $1::DATE AND $2::DATE
         AND s.branch_id=$3
      WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
      GROUP BY p.product_id, p.product_name, p.sku
        HAVING COALESCE(SUM(s.qty), 0) > 0
      ORDER BY revenue DESC, p.product_name;
    `, [week_start, week_end, req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load weekly sales by product report.");
  }
});

/**
 * GET /api/reports/weekly-purchases-by-product?week_date=YYYY-MM-DD
 * Product purchases for selected week
 *
 * PHASE 4: period membership keyed off api.transaction_date instead of
 * api.invoice_date.
 */
router.get("/weekly-purchases-by-product", requireAuth, async (req, res) => {
  try {
    const { week_date } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    const result = await query(`
      SELECT
    p.product_id,
    p.product_name,
    p.sku,

    COALESCE(SUM(COALESCE(grl.qty_received, 0)), 0) AS kg_purchased,

    COALESCE(
        SUM(
            COALESCE(grl.qty_received, 0) *
            COALESCE(grl.unit_cost, 0)
        ),
        0
    ) AS purchase_value,

    CASE
        WHEN COALESCE(SUM(COALESCE(grl.qty_received, 0)), 0) > 0
        THEN
            COALESCE(
                SUM(
                    COALESCE(grl.qty_received, 0) *
                    COALESCE(grl.unit_cost, 0)
                ),
                0
            ) /
            COALESCE(SUM(COALESCE(grl.qty_received, 0)), 1)
        ELSE 0
    END AS average_cost_per_kg,

    COUNT(DISTINCT gr.supplier_id) AS supplier_count

FROM inv.product p

LEFT JOIN pur.goods_receipt gr
    ON DATE(gr.receipt_date) BETWEEN $1::DATE AND $2::DATE
   AND EXISTS(SELECT 1 FROM app.location loc WHERE loc.location_id=gr.location_id AND loc.branch_id=$3)

LEFT JOIN pur.goods_receipt_line grl
    ON grl.grn_id = gr.grn_id
   AND grl.product_id = p.product_id

WHERE
    p.product_type IN ('FINISHED', 'RAW')
    AND p.is_active = TRUE

GROUP BY
    p.product_id,
    p.product_name,
    p.sku

HAVING
    COALESCE(SUM(COALESCE(grl.qty_received, 0)), 0) > 0

ORDER BY
    purchase_value DESC,
    p.product_name;
    `, [week_start, week_end, req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load weekly purchases by product report.");
  }
});

/**
 * GET /api/reports/weekly-profit-by-product?week_date=YYYY-MM-DD
 * Gross profit by product for selected week
 *
 * PHASE 4: sales side keyed off d.transaction_date instead of d.delivery_date.
 * COGS side (inv.stock_movement.movement_ts) is left as system time because
 * the Phase 4 migration did not add a transaction_date column to
 * inv.stock_movement / inv.stock_movement_line.
 */
router.get("/weekly-profit-by-product", requireAuth, async (req, res) => {
  try {
    const { week_date } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    const result = await query(`
      WITH sales_data AS (
        SELECT
          p.product_id,
          p.product_name,
          p.sku,
          COALESCE(SUM(s.revenue), 0) AS revenue,
          COALESCE(SUM(s.qty), 0) AS qty_sold,
          COALESCE(SUM(s.cogs), 0) AS cogs
        FROM inv.product p
        LEFT JOIN reporting.v_sales_event_lines s
          ON s.product_id = p.product_id
         AND s.event_date BETWEEN $1::DATE AND $2::DATE
         AND s.branch_id=$3
        WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
        GROUP BY p.product_id, p.product_name, p.sku
      )
      SELECT
        s.product_id,
        s.product_name,
        s.sku,
        s.revenue,
        s.cogs AS cogs,
        s.revenue - s.cogs AS gross_profit,
        CASE
          WHEN s.revenue > 0
          THEN ROUND(((s.revenue - s.cogs) / s.revenue) * 100, 2)
          ELSE 0
        END AS gross_margin_pct
      FROM sales_data s
      WHERE s.revenue > 0
      ORDER BY s.revenue DESC, s.product_name;
    `, [week_start, week_end, req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load weekly profit by product report.");
  }
});

/**
 * GET /api/reports/weekly-management-summary?week_date=YYYY-MM-DD
 * Executive dashboard summary for selected week
 *
 * PHASE 4: sales/purchase period membership keyed off transaction_date.
 * so.created_at and stock_movement.movement_ts left as-is (no
 * transaction_date column on those tables).
 */
router.get("/weekly-management-summary", requireAuth, async (req, res) => {
  try {
    const { week_date } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    const result = await query(`
      WITH weekly_sales AS (
        SELECT
          COALESCE(SUM(revenue), 0) AS total_revenue,
          COUNT(DISTINCT event_id) FILTER(WHERE source<>'RETURN') AS total_orders,
          COUNT(DISTINCT customer_id) AS total_customers
        FROM reporting.v_sales_event_lines
        WHERE event_date BETWEEN $1::DATE AND $2::DATE AND branch_id=$3
      ),
      weekly_purchases AS (
        SELECT
          COALESCE(SUM(apil.qty * apil.unit_price), 0) AS total_purchases
        FROM pur.ap_invoice api
        JOIN pur.goods_receipt gr ON gr.grn_id=api.grn_id
        JOIN app.location ploc ON ploc.location_id=gr.location_id
        LEFT JOIN pur.ap_invoice_line apil ON apil.ap_invoice_id = api.ap_invoice_id
        WHERE DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE AND ploc.branch_id=$3
      ),
      weekly_cogs AS (
        SELECT COALESCE(SUM(cogs), 0) AS total_cogs
        FROM reporting.v_sales_event_lines
        WHERE event_date BETWEEN $1::DATE AND $2::DATE AND branch_id=$3
      ),
      new_customers AS (
        SELECT COUNT(*) AS new_count FROM (
          SELECT customer_id,MIN(event_date) AS first_date
          FROM reporting.v_sales_event_lines
          WHERE branch_id=$3 AND customer_id IS NOT NULL AND source<>'RETURN'
          GROUP BY customer_id
        ) branch_first_activity
        WHERE first_date BETWEEN $1::DATE AND $2::DATE
      ),
      dormant_count AS (
        SELECT COUNT(DISTINCT c.party_id) AS dormant
        FROM (
          SELECT DISTINCT customer_id FROM reporting.v_sales_event_lines
          WHERE branch_id=$3 AND customer_id IS NOT NULL AND source<>'RETURN'
        ) branch_customer
        JOIN app.party c ON c.party_id=branch_customer.customer_id
        WHERE c.party_type = 'CUSTOMER'
          AND NOT EXISTS (
            SELECT 1 FROM reporting.v_sales_event_lines e
            WHERE e.customer_id = c.party_id AND e.branch_id=$3 AND e.source<>'RETURN'
              AND e.event_date BETWEEN $1::DATE AND $2::DATE
          )
      ),
      top_customer_data AS (
        SELECT
          c.party_name,
          COALESCE(SUM(s.revenue), 0) AS revenue
        FROM app.party c
        LEFT JOIN reporting.v_sales_event_lines s ON s.customer_id = c.party_id AND s.event_date BETWEEN $1::DATE AND $2::DATE AND s.branch_id=$3
        WHERE c.party_type = 'CUSTOMER' AND s.customer_id IS NOT NULL
        GROUP BY c.party_id, c.party_name
        ORDER BY revenue DESC
        LIMIT 1
      ),
      top_product_data AS (
        SELECT
          p.product_name,
          COALESCE(SUM(s.revenue), 0) AS revenue
        FROM inv.product p
        LEFT JOIN reporting.v_sales_event_lines s ON s.product_id = p.product_id AND s.event_date BETWEEN $1::DATE AND $2::DATE AND s.branch_id=$3
        WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true AND s.product_id IS NOT NULL
        GROUP BY p.product_id, p.product_name
        ORDER BY revenue DESC
        LIMIT 1
      )
      SELECT
        $1::DATE AS week_start,
        $2::DATE AS week_end,
        ws.total_revenue,
        wp.total_purchases,
        ws.total_revenue - wc.total_cogs AS total_gross_profit,
        CASE WHEN ws.total_revenue > 0 THEN ROUND(((ws.total_revenue - wc.total_cogs) / ws.total_revenue) * 100, 2) ELSE 0 END AS gross_margin_pct,
        ws.total_orders,
        ws.total_customers,
        COALESCE(nc.new_count, 0) AS new_customers,
        COALESCE(dc.dormant, 0) AS dormant_customers_count,
        COALESCE(tc.party_name, 'N/A') AS top_customer,
        COALESCE(tc.revenue, 0) AS top_customer_revenue,
        COALESCE(tp.product_name, 'N/A') AS top_product,
        COALESCE(tp.revenue, 0) AS top_product_revenue,
        CASE WHEN ws.total_orders > 0 THEN ws.total_revenue / ws.total_orders ELSE 0 END AS average_order_value
      FROM weekly_sales ws, weekly_purchases wp, weekly_cogs wc, new_customers nc, dormant_count dc, top_customer_data tc, top_product_data tp;
    `, [week_start, week_end, req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows[0] || {}
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load weekly management summary report.");
  }
});

/**
 * GET /api/reports/customer-concentration?week_date=YYYY-MM-DD
 * Customer revenue concentration analysis
 *
 * PHASE 4: period membership keyed off d.transaction_date instead of
 * d.delivery_date.
 */
router.get("/customer-concentration", requireAuth, async (req, res) => {
  try {
    const { week_date } = req.query;
    const { week_start, week_end } = getWeekBoundaries(week_date);

    const result = await query(`
      WITH customer_revenue AS (
        SELECT
          c.party_id,
          c.party_name,
          COALESCE(SUM(s.revenue), 0) AS revenue,
          COALESCE(SUM(s.qty), 0) AS kg_purchased,
          COUNT(DISTINCT s.event_id) AS orders_count,
          ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(s.revenue), 0) DESC) AS rank
        FROM app.party c
        LEFT JOIN reporting.v_sales_event_lines s ON s.customer_id = c.party_id AND s.event_date BETWEEN $1::DATE AND $2::DATE
        WHERE c.party_type = 'CUSTOMER'
        GROUP BY c.party_id,c.party_name
      ),
      total_revenue_calc AS (
        SELECT SUM(revenue) AS total_revenue
        FROM customer_revenue
      ),
      top_10 AS (
        SELECT
          cr.rank,
          cr.party_id,
          cr.party_name,
          cr.revenue,
          CASE
            WHEN tr.total_revenue IS NULL OR tr.total_revenue = 0 THEN 0
            ELSE ROUND((cr.revenue / tr.total_revenue * 100)::NUMERIC, 2)
          END AS revenue_pct,
          cr.kg_purchased,
          cr.orders_count
        FROM customer_revenue cr, total_revenue_calc tr
        WHERE cr.rank <= 10
        ORDER BY cr.rank
      )
      SELECT
        rank,
        party_id AS customer_code,
        party_name AS customer_name,
        revenue,
        revenue_pct,
        kg_purchased,
        orders_count
      FROM top_10
      ORDER BY rank;
    `, [week_start, week_end]);

    // Calculate concentration metrics
    const top5Revenue = result.rows.slice(0, 5).reduce((sum, row) => sum + Number(row.revenue_pct || 0), 0);
    const top10Revenue = result.rows.slice(0, 10).reduce((sum, row) => sum + Number(row.revenue_pct || 0), 0);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
      summary: {
        top_5_concentration_pct: Math.round(top5Revenue * 100) / 100,
        top_10_concentration_pct: Math.round(top10Revenue * 100) / 100
      }
    });
  } catch (error) {
    sendFinanceError(res, error, "Failed to load customer concentration report.");
  }
});

export default router;
