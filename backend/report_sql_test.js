const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
async function run() {
  const weekStart = '2026-06-30';
  const weekEnd = '2026-07-06';
  const tests = [
    {
      name: 'customer-weekly-performance',
      sql: `WITH week_sales AS (
        SELECT c.party_id, c.party_name, COUNT(DISTINCT so.so_id) AS orders_count,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) AS total_kg_purchased,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS total_revenue,
          MAX(d.transaction_date) AS last_purchase_date,
          dl.product_id
        FROM app.party c
        LEFT JOIN sal.sales_order so
          ON so.customer_id = c.party_id AND DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
        LEFT JOIN sal.delivery d
          ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        LEFT JOIN sal.delivery_line dl
          ON dl.delivery_id = d.delivery_id
        WHERE c.party_type = 'CUSTOMER'
        GROUP BY c.party_id, c.party_name, dl.product_id
      ),
      customer_summary AS (
        SELECT party_id, party_name,
          COUNT(DISTINCT CASE WHEN orders_count > 0 THEN party_id END) AS has_orders,
          COALESCE(SUM(total_kg_purchased), 0) AS total_kg,
          COALESCE(SUM(total_revenue), 0) AS revenue,
          COALESCE(SUM(orders_count), 0) AS orders,
          MAX(last_purchase_date) AS last_purchase
        FROM week_sales
        GROUP BY party_id, party_name
      )
      SELECT cs.party_id, cs.party_name AS customer_name,
        cs.orders AS orders_count,
        cs.total_kg AS total_kg_purchased,
        cs.revenue AS total_revenue,
        CASE WHEN cs.orders > 0 THEN cs.revenue / cs.orders ELSE 0 END AS average_order_value,
        cs.last_purchase AS last_purchase_date
      FROM customer_summary cs
      ORDER BY cs.revenue DESC, cs.party_name;`
    },
    {
      name: 'dormant-customers',
      sql: `WITH customer_last_purchase AS (
        SELECT c.party_id, c.party_name,
          MAX(COALESCE(d.transaction_date, ai.transaction_date)) AS last_purchase_date,
          MAX(COALESCE(ail.qty * ail.unit_price, 0)) AS last_purchase_value,
          CURRENT_DATE - MAX(COALESCE(d.transaction_date, ai.transaction_date))::DATE AS days_since
        FROM app.party c
        LEFT JOIN sal.delivery d ON d.customer_id = c.party_id
        LEFT JOIN sal.ar_invoice ai ON ai.customer_id = c.party_id
        LEFT JOIN sal.ar_invoice_line ail ON ail.ar_invoice_id = ai.ar_invoice_id
        WHERE c.party_type = 'CUSTOMER'
        GROUP BY c.party_id, c.party_name
      ),
      dormant_status AS (
        SELECT party_id, party_name, last_purchase_date, days_since, last_purchase_value,
          CASE WHEN days_since IS NULL THEN 'DORMANT'
               WHEN days_since <= 14 THEN 'ACTIVE'
               WHEN days_since <= 30 THEN 'AT_RISK'
               ELSE 'DORMANT' END AS status
        FROM customer_last_purchase
        WHERE NOT EXISTS (
          SELECT 1 FROM sal.delivery d2
          WHERE d2.customer_id = customer_last_purchase.party_id
            AND DATE(d2.transaction_date) BETWEEN $1::DATE AND $2::DATE
        )
      )
      SELECT cs.party_id, cs.party_name AS customer_name,
        last_purchase_date,
        COALESCE(days_since, 999999) AS days_since_last_purchase,
        COALESCE(last_purchase_value, 0) AS last_purchase_value,
        status
      FROM dormant_status cs
      WHERE $3::TEXT IS NULL OR status = $3::TEXT
      ORDER BY days_since DESC, party_name;`
    },
    {
      name: 'customer-rfm',
      sql: `WITH rfm_data AS (
        SELECT c.party_id, c.party_name,
          CURRENT_DATE - MAX(COALESCE(d.transaction_date, ai.transaction_date))::DATE AS recency,
          COUNT(DISTINCT so.so_id) AS frequency,
          COALESCE(SUM(ail.qty * ail.unit_price), 0) AS monetary
        FROM app.party c
        LEFT JOIN sal.sales_order so
          ON so.customer_id = c.party_id
          AND DATE(so.created_at) >= $1::DATE
        LEFT JOIN sal.delivery d
          ON d.so_id = so.so_id
          AND DATE(d.transaction_date) >= $1::DATE
        LEFT JOIN sal.ar_invoice ai
          ON ai.customer_id = c.party_id
          AND DATE(ai.transaction_date) >= $1::DATE
        LEFT JOIN sal.ar_invoice_line ail
          ON ail.ar_invoice_id = ai.ar_invoice_id
        WHERE c.party_type = 'CUSTOMER'
        GROUP BY c.party_id, c.party_name
      )
      SELECT party_id, party_name AS customer_name, recency, frequency, monetary,
        CASE WHEN COALESCE(frequency, 0) >= 10 AND COALESCE(monetary, 0) >= 100000 AND COALESCE(recency, 999) <= 7 THEN 'Champion'
             WHEN COALESCE(frequency, 0) >= 5 AND COALESCE(monetary, 0) >= 50000 THEN 'Loyal'
             WHEN COALESCE(frequency, 0) >= 3 THEN 'Regular'
             WHEN COALESCE(recency, 999) <= 60 AND COALESCE(frequency, 0) > 0 THEN 'At Risk'
             ELSE 'Dormant' END AS segment
      FROM rfm_data
      ORDER BY segment, monetary DESC, party_name;`
    },
    {
      name: 'weekly-sales-by-product',
      sql: `SELECT p.product_id, p.product_name, p.sku,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) AS kg_sold,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS revenue,
        CASE WHEN COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) > 0
             THEN COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) / COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 1)
             ELSE 0 END AS average_selling_price,
        COUNT(DISTINCT d.delivery_id) AS orders_count,
        COUNT(DISTINCT d.customer_id) AS customers_count
      FROM inv.product p
      LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id
      LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      WHERE p.product_type = 'BEAN' AND p.is_active = true
      GROUP BY p.product_id, p.product_name, p.sku
      HAVING COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) > 0
      ORDER BY revenue DESC, p.product_name;`
    },
    {
      name: 'weekly-purchases-by-product',
      sql: `SELECT p.product_id, p.product_name, p.sku,
        COALESCE(SUM(COALESCE(apil.qty, 0)), 0) AS kg_purchased,
        COALESCE(SUM(COALESCE(apil.qty, 0) * COALESCE(apil.unit_price, 0)), 0) AS purchase_value,
        CASE WHEN COALESCE(SUM(COALESCE(apil.qty, 0)), 0) > 0
             THEN COALESCE(SUM(COALESCE(apil.qty, 0) * COALESCE(apil.unit_price, 0)), 0) / COALESCE(SUM(COALESCE(apil.qty, 0)), 1)
             ELSE 0 END AS average_cost_per_kg,
        COUNT(DISTINCT api.supplier_id) AS supplier_count
      FROM inv.product p
      LEFT JOIN pur.ap_invoice_line apil ON apil.product_id = p.product_id
      LEFT JOIN pur.ap_invoice api ON api.ap_invoice_id = apil.ap_invoice_id AND DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE
      WHERE p.product_type = 'BEAN' AND p.is_active = true
      GROUP BY p.product_id, p.product_name, p.sku
      HAVING COALESCE(SUM(COALESCE(apil.qty, 0)), 0) > 0
      ORDER BY purchase_value DESC, p.product_name;`
    },
    {
      name: 'weekly-profit-by-product',
      sql: `WITH sales_data AS (
        SELECT p.product_id, p.product_name, p.sku,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS revenue,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) AS qty_sold
        FROM inv.product p
        LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id
        LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        WHERE p.product_type = 'BEAN' AND p.is_active = true
        GROUP BY p.product_id, p.product_name, p.sku
      ),
      cogs_data AS (
        SELECT sml.product_id, COALESCE(SUM(sml.qty * sml.unit_cost), 0) AS cogs
        FROM inv.stock_movement_line sml
        WHERE sml.product_id IN (SELECT product_id FROM sales_data)
          AND sml.movement_id IN (
            SELECT DISTINCT movement_id FROM inv.stock_movement sm
            WHERE sm.movement_type = 'DELIVERY'
              AND DATE(sm.movement_ts) BETWEEN $1::DATE AND $2::DATE
          )
        GROUP BY sml.product_id
      )
      SELECT s.product_id, s.product_name, s.sku, s.revenue,
        COALESCE(c.cogs, 0) AS cogs,
        s.revenue - COALESCE(c.cogs, 0) AS gross_profit,
        CASE WHEN s.revenue > 0
             THEN ROUND(((s.revenue - COALESCE(c.cogs, 0)) / s.revenue) * 100, 2)
             ELSE 0 END AS gross_margin_pct
      FROM sales_data s
      LEFT JOIN cogs_data c ON c.product_id = s.product_id
      WHERE s.revenue > 0
      ORDER BY s.revenue DESC, s.product_name;`
    },
    {
      name: 'weekly-management-summary',
      sql: `WITH weekly_sales AS (
        SELECT COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS total_revenue,
          COUNT(DISTINCT so.so_id) AS total_orders,
          COUNT(DISTINCT d.customer_id) AS total_customers
        FROM sal.sales_order so
        LEFT JOIN sal.delivery d ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
        WHERE DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
      ),
      weekly_purchases AS (
        SELECT COALESCE(SUM(apil.qty * apil.unit_price), 0) AS total_purchases
        FROM pur.ap_invoice api
        LEFT JOIN pur.ap_invoice_line apil ON apil.ap_invoice_id = api.ap_invoice_id
        WHERE DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE
      ),
      weekly_cogs AS (
        SELECT COALESCE(SUM(sml.qty * sml.unit_cost), 0) AS total_cogs
        FROM inv.stock_movement_line sml
        WHERE sml.movement_id IN (
          SELECT DISTINCT movement_id FROM inv.stock_movement sm
          WHERE sm.movement_type = 'DELIVERY'
            AND DATE(sm.movement_ts) BETWEEN $1::DATE AND $2::DATE
        )
      ),
      new_customers AS (
        SELECT COUNT(DISTINCT customer_id) AS new_count
        FROM sal.sales_order
        WHERE DATE(created_at) BETWEEN $1::DATE AND $2::DATE
          AND customer_id NOT IN (
            SELECT DISTINCT customer_id FROM sal.sales_order WHERE DATE(created_at) < $1::DATE
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
        SELECT c.party_name,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS revenue
        FROM app.party c
        LEFT JOIN sal.delivery d ON d.customer_id = c.party_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
        WHERE c.party_type = 'CUSTOMER'
        GROUP BY c.party_id, c.party_name
        ORDER BY revenue DESC
        LIMIT 1
      ),
      top_product_data AS (
        SELECT p.product_name,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS revenue
        FROM inv.product p
        LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id
        LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        WHERE p.product_type = 'BEAN' AND p.is_active = true
        GROUP BY p.product_id, p.product_name
        ORDER BY revenue DESC
        LIMIT 1
      )
      SELECT $1::DATE AS week_start, $2::DATE AS week_end,
        ws.total_revenue, wp.total_purchases,
        ws.total_revenue - wc.total_cogs AS total_gross_profit,
        CASE WHEN ws.total_revenue > 0 THEN ROUND(((ws.total_revenue - wc.total_cogs) / ws.total_revenue) * 100, 2) ELSE 0 END AS gross_margin_pct,
        ws.total_orders, ws.total_customers,
        COALESCE(nc.new_count, 0) AS new_customers,
        COALESCE(dc.dormant, 0) AS dormant_customers_count,
        COALESCE(tc.party_name, 'N/A') AS top_customer,
        COALESCE(tc.revenue, 0) AS top_customer_revenue,
        COALESCE(tp.product_name, 'N/A') AS top_product,
        COALESCE(tp.revenue, 0) AS top_product_revenue,
        CASE WHEN ws.total_orders > 0 THEN ws.total_revenue / ws.total_orders ELSE 0 END AS average_order_value
      FROM weekly_sales ws, weekly_purchases wp, weekly_cogs wc, new_customers nc, dormant_count dc, top_customer_data tc, top_product_data tp;`
    },
    {
      name: 'customer-concentration',
      sql: `WITH customer_revenue AS (
        SELECT c.party_id, c.party_name,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS revenue,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) AS kg_purchased,
          COUNT(DISTINCT d.delivery_id) AS orders_count,
          ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) DESC) AS rank
        FROM app.party c
        LEFT JOIN sal.delivery d ON d.customer_id = c.party_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
        WHERE c.party_type = 'CUSTOMER'
        GROUP BY c.party_id, c.party_name
      ),
      total_revenue_calc AS (
        SELECT SUM(revenue) AS total_revenue FROM customer_revenue
      ),
      top_10 AS (
        SELECT cr.rank, cr.party_id, cr.party_name, cr.revenue,
          ROUND((cr.revenue / tr.total_revenue * 100)::NUMERIC, 2) AS revenue_pct,
          cr.kg_purchased, cr.orders_count
        FROM customer_revenue cr, total_revenue_calc tr
        WHERE cr.rank <= 10
        ORDER BY cr.rank
      )
      SELECT rank, party_id, party_name AS customer_name,
        revenue, revenue_pct, kg_purchased, orders_count
      FROM top_10
      ORDER BY rank;`
    }
  ];
  for (const t of tests) {
    try {
      console.log('---', t.name);
      const res = await pool.query(t.sql, [weekStart, weekEnd, null]);
      console.log('ok rows', res.rowCount);
    } catch (err) {
      console.error('ERROR', t.name, err.message);
      await pool.end();
      process.exit(1);
    }
  }
  await pool.end();
}
run();
