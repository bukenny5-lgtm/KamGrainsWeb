import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

console.log("=== LOADED reports.routes.js ===");
console.log("=== LOADED reports.routes.js ===");
const router = express.Router();

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
               COUNT(DISTINCT event_id) AS orders_count,
               SUM(qty) AS total_kg_purchased,
               SUM(revenue) AS total_revenue,
               MAX(event_date) AS last_purchase_date
        FROM reporting.v_sales_event_lines
        WHERE customer_id IS NOT NULL AND event_date BETWEEN $1::DATE AND $2::DATE
        GROUP BY customer_id
    ) s ON s.customer_id = c.party_id
    WHERE c.party_type = 'CUSTOMER'
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
    `, [week_start, week_end]);

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
      WITH customer_last_purchase AS (
    SELECT
        c.party_id,
        c.party_name,

        /* Last completed delivery */
        (
            SELECT MAX(d.transaction_date)
            FROM sal.delivery d
            WHERE d.customer_id = c.party_id
        ) AS last_purchase_date,

        /* Total value of the last completed delivery */
        (
            SELECT COALESCE(SUM(
                COALESCE(dl.sell_qty, dl.qty,0) *
                COALESCE(dl.unit_price,0)
            ),0)
            FROM sal.delivery d
            JOIN sal.delivery_line dl
                ON dl.delivery_id = d.delivery_id
            WHERE d.customer_id = c.party_id
              AND d.transaction_date = (
                    SELECT MAX(d2.transaction_date)
                    FROM sal.delivery d2
                    WHERE d2.customer_id = c.party_id
              )
        ) AS last_purchase_value,

        /* Days since last purchase */
        (
            SELECT CURRENT_DATE - MAX(d.transaction_date)::DATE
            FROM sal.delivery d
            WHERE d.customer_id = c.party_id
        ) AS days_since

    FROM app.party c
    WHERE c.party_type = 'CUSTOMER'
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
          SELECT 1
          FROM sal.delivery d2
          WHERE d2.customer_id = customer_last_purchase.party_id
            AND DATE(d2.transaction_date) BETWEEN $1::DATE AND $2::DATE
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
    `, [week_start, week_end, status || null]);

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
      WITH rfm_data AS (
    SELECT
        c.party_id,
        c.party_name,

        /* RECENCY */
        (
            SELECT $2::DATE - MAX(d.transaction_date)::DATE
            FROM sal.delivery d
            WHERE d.customer_id = c.party_id
              AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        ) AS recency,

        /* FREQUENCY */
        (
            SELECT COUNT(DISTINCT d.delivery_id)
            FROM sal.delivery d
            WHERE d.customer_id = c.party_id
              AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        ) AS frequency,

        /* MONETARY */
        (
            SELECT COALESCE(SUM(
                COALESCE(dl.sell_qty, dl.qty, 0) *
                COALESCE(dl.unit_price, 0)
            ), 0)
            FROM sal.delivery d
            JOIN sal.delivery_line dl
              ON dl.delivery_id = d.delivery_id
            WHERE d.customer_id = c.party_id
              AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        ) AS monetary

    FROM app.party c
    WHERE c.party_type = 'CUSTOMER'
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
    `, [week_start, week_end]);

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
        COUNT(DISTINCT s.event_id) AS orders_count,
        COUNT(DISTINCT s.customer_id) AS customers_count
      FROM inv.product p
        LEFT JOIN reporting.v_sales_event_lines s
          ON s.product_id = p.product_id
         AND s.event_date BETWEEN $1::DATE AND $2::DATE
      WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
      GROUP BY p.product_id, p.product_name, p.sku
        HAVING COALESCE(SUM(s.qty), 0) > 0
      ORDER BY revenue DESC, p.product_name;
    `, [week_start, week_end]);

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
    `, [week_start, week_end]);

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
    `, [week_start, week_end]);

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
          COUNT(DISTINCT event_id) AS total_orders,
          COUNT(DISTINCT customer_id) AS total_customers
        FROM reporting.v_sales_event_lines
        WHERE event_date BETWEEN $1::DATE AND $2::DATE
      ),
      weekly_purchases AS (
        SELECT
          COALESCE(SUM(apil.qty * apil.unit_price), 0) AS total_purchases
        FROM pur.ap_invoice api
        LEFT JOIN pur.ap_invoice_line apil ON apil.ap_invoice_id = api.ap_invoice_id
        WHERE DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE
      ),
      weekly_cogs AS (
        SELECT COALESCE(SUM(cogs), 0) AS total_cogs
        FROM reporting.v_sales_event_lines
        WHERE event_date BETWEEN $1::DATE AND $2::DATE
      ),
      new_customers AS (
        SELECT COUNT(DISTINCT customer_id) AS new_count
        FROM sal.sales_order
        WHERE DATE(created_at) BETWEEN $1::DATE AND $2::DATE
          AND customer_id NOT IN (
            SELECT DISTINCT customer_id
            FROM sal.sales_order
            WHERE DATE(created_at) < $1::DATE
          )
      ),
      dormant_count AS (
        SELECT COUNT(DISTINCT c.party_id) AS dormant
        FROM app.party c
        WHERE c.party_type = 'CUSTOMER'
          AND NOT EXISTS (
            SELECT 1 FROM sal.delivery d
            WHERE d.customer_id = c.party_id
              AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
          )
      ),
      top_customer_data AS (
        SELECT
          c.party_name,
          COALESCE(SUM(s.revenue), 0) AS revenue
        FROM app.party c
        LEFT JOIN reporting.v_sales_event_lines s ON s.customer_id = c.party_id AND s.event_date BETWEEN $1::DATE AND $2::DATE
        WHERE c.party_type = 'CUSTOMER'
        GROUP BY c.party_id, c.party_name
        ORDER BY revenue DESC
        LIMIT 1
      ),
      top_product_data AS (
        SELECT
          p.product_name,
          COALESCE(SUM(s.revenue), 0) AS revenue
        FROM inv.product p
        LEFT JOIN reporting.v_sales_event_lines s ON s.product_id = p.product_id AND s.event_date BETWEEN $1::DATE AND $2::DATE
        WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
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
    `, [week_start, week_end]);

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
