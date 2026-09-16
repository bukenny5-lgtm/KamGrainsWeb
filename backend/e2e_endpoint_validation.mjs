import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

const week_start = '2026-07-06';
const week_end = '2026-07-12';

async function testReport(name, sql, params = [week_start, week_end]) {
  console.log('\n' + '='.repeat(100));
  console.log(`ENDPOINT: ${name}`);
  console.log('='.repeat(100));
  try {
    const res = await pool.query(sql, params);
    console.log(`Rows returned: ${res.rowCount}`);
    if (res.rowCount === 0) {
      console.log('⚠️  EMPTY RESULT SET');
    } else {
      console.log('First row:');
      console.log(JSON.stringify(res.rows[0], null, 2));
      if (res.rowCount > 1) console.log(`... and ${res.rowCount - 1} more rows`);
    }
  } catch (err) {
    console.error('❌ SQL ERROR:', err.message);
  }
}

async function run() {
  // 1. Customer Weekly Performance
  await testReport('Customer Weekly Performance', `
    WITH week_sales AS (
      SELECT
        c.party_id,
        c.party_name,
        COALESCE(SUM(
          COALESCE(dl.sell_qty, dl.qty, 0)
        ), 0) AS total_kg_purchased,
        COALESCE(SUM(
          COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)
        ), 0) AS total_revenue,
        MAX(d.transaction_date) AS last_purchase_date
      FROM app.party c
      LEFT JOIN sal.sales_order so
        ON so.customer_id = c.party_id AND DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.delivery d
        ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.delivery_line dl
        ON dl.delivery_id = d.delivery_id
      WHERE c.party_type = 'CUSTOMER'
      GROUP BY c.party_id,c.party_name
    )
    SELECT
       cs.party_id AS customer_code,
       cs.party_name AS customer_name,
      (SELECT COUNT(DISTINCT so.so_id)
         FROM sal.sales_order so
         LEFT JOIN sal.delivery d ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
         WHERE so.customer_id = cs.party_id AND DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
      ) AS orders_count,
      cs.total_kg_purchased AS total_kg_purchased,
      cs.total_revenue AS total_revenue,
      CASE WHEN (
        SELECT COUNT(DISTINCT so2.so_id)
        FROM sal.sales_order so2
        LEFT JOIN sal.delivery d2 ON d2.so_id = so2.so_id AND DATE(d2.transaction_date) BETWEEN $1::DATE AND $2::DATE
        WHERE so2.customer_id = cs.party_id AND DATE(so2.created_at) BETWEEN $1::DATE AND $2::DATE
      ) > 0 THEN cs.total_revenue / (
        SELECT COUNT(DISTINCT so3.so_id)
        FROM sal.sales_order so3
        LEFT JOIN sal.delivery d3 ON d3.so_id = so3.so_id AND DATE(d3.transaction_date) BETWEEN $1::DATE AND $2::DATE
        WHERE so3.customer_id = cs.party_id AND DATE(so3.created_at) BETWEEN $1::DATE AND $2::DATE
      ) ELSE 0 END AS average_order_value,
      cs.last_purchase_date AS last_purchase_date
    FROM week_sales cs
    ORDER BY cs.total_revenue DESC, cs.party_name
    LIMIT 10;
  `);

  // 2. Weekly Sales by Product
  await testReport('Weekly Sales by Product', `
    SELECT
      p.product_id,
      p.product_name,
      p.sku,
      COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) AS kg_sold,
      COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS revenue,
      CASE
        WHEN COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) > 0
        THEN COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) /
             COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 1)
        ELSE 0
      END AS average_selling_price,
      COUNT(DISTINCT d.delivery_id) AS orders_count,
      COUNT(DISTINCT d.customer_id) AS customers_count
    FROM inv.product p
    LEFT JOIN sal.delivery_line dl
      ON dl.product_id = p.product_id
    LEFT JOIN sal.delivery d
      ON d.delivery_id = dl.delivery_id
      AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
    WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
    GROUP BY p.product_id, p.product_name, p.sku
    HAVING COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) > 0
    ORDER BY revenue DESC, p.product_name;
  `);

  // 3. Weekly Purchases by Product
  await testReport('Weekly Purchases by Product', `
    SELECT
      p.product_id,
      p.product_name,
      p.sku,
      COALESCE(SUM(COALESCE(apil.qty, 0)), 0) AS kg_purchased,
      COALESCE(SUM(COALESCE(apil.qty, 0) * COALESCE(apil.unit_price, 0)), 0) AS purchase_value,
      CASE
        WHEN COALESCE(SUM(COALESCE(apil.qty, 0)), 0) > 0
        THEN COALESCE(SUM(COALESCE(apil.qty, 0) * COALESCE(apil.unit_price, 0)), 0) /
             COALESCE(SUM(COALESCE(apil.qty, 0)), 1)
        ELSE 0
      END AS average_cost_per_kg,
      COUNT(DISTINCT api.supplier_id) AS supplier_count
    FROM inv.product p
    LEFT JOIN pur.ap_invoice_line apil
      ON apil.product_id = p.product_id
    LEFT JOIN pur.ap_invoice api
      ON api.ap_invoice_id = apil.ap_invoice_id
      AND DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE
    WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
    GROUP BY p.product_id, p.product_name, p.sku
    HAVING COALESCE(SUM(COALESCE(apil.qty, 0)), 0) > 0
    ORDER BY purchase_value DESC, p.product_name;
  `);

  // 4. Weekly Gross Profit by Product
  await testReport('Weekly Gross Profit by Product', `
    WITH sales_data AS (
      SELECT
        p.product_id,
        p.product_name,
        p.sku,
        COALESCE(SUM(
          CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
               THEN COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)
               ELSE 0 END
        ), 0) AS revenue,
        COALESCE(SUM(
          CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
               THEN COALESCE(dl.sell_qty, dl.qty, 0)
               ELSE 0 END
        ), 0) AS qty_sold
      FROM inv.product p
      LEFT JOIN sal.delivery_line dl
        ON dl.product_id = p.product_id
      LEFT JOIN sal.delivery d
        ON d.delivery_id = dl.delivery_id
        AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
      GROUP BY p.product_id, p.product_name, p.sku
    ),
    cogs_data AS (
      SELECT
        sml.product_id,
        COALESCE(SUM(sml.qty * sml.unit_cost), 0) AS cogs
      FROM inv.stock_movement_line sml
      WHERE sml.product_id IN (
        SELECT product_id FROM sales_data
      )
      AND sml.movement_id IN (
        SELECT DISTINCT movement_id
        FROM inv.stock_movement sm
        WHERE sm.movement_type = 'DELIVERY'
          AND DATE(sm.movement_ts) BETWEEN $1::DATE AND $2::DATE
      )
      GROUP BY sml.product_id
    )
    SELECT
      s.product_id,
      s.product_name,
      s.sku,
      s.revenue,
      COALESCE(c.cogs, 0) AS cogs,
      s.revenue - COALESCE(c.cogs, 0) AS gross_profit,
      CASE
        WHEN s.revenue > 0
        THEN ROUND(((s.revenue - COALESCE(c.cogs, 0)) / s.revenue) * 100, 2)
        ELSE 0
      END AS gross_margin_pct
    FROM sales_data s
    LEFT JOIN cogs_data c ON c.product_id = s.product_id
    WHERE s.revenue > 0
    ORDER BY s.revenue DESC, s.product_name;
  `);

  // 5. Weekly Management Summary
  await testReport('Weekly Management Summary', `
    WITH weekly_sales AS (
      SELECT
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS total_revenue,
        COUNT(DISTINCT so.so_id) AS total_orders,
        COUNT(DISTINCT d.customer_id) AS total_customers
      FROM sal.sales_order so
      LEFT JOIN sal.delivery d ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
      WHERE DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
    ),
    top_product_data AS (
      SELECT
        p.product_name,
        COALESCE(SUM(
          CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
               THEN COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)
               ELSE 0 END
        ), 0) AS revenue
      FROM inv.product p
      LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id
      LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
      GROUP BY p.product_id, p.product_name
      ORDER BY revenue DESC
      LIMIT 1
    )
    SELECT
      $1::DATE AS week_start,
      $2::DATE AS week_end,
      ws.total_revenue,
      ws.total_orders,
      ws.total_customers,
      tp.product_name AS top_product,
      tp.revenue AS top_product_revenue
    FROM weekly_sales ws, top_product_data tp;
  `);

  // 6. Customer Concentration
  await testReport('Customer Concentration', `
    WITH customer_revenue AS (
      SELECT
        c.party_id,
        c.party_name,
        COALESCE(SUM(
          CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
               THEN COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)
               ELSE 0 END
        ), 0) AS revenue,
        COALESCE(SUM(
          CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
               THEN COALESCE(dl.sell_qty, dl.qty, 0)
               ELSE 0 END
        ), 0) AS kg_purchased,
        COUNT(DISTINCT d.delivery_id) AS orders_count,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(
          CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
               THEN COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)
               ELSE 0 END
        ), 0) DESC) AS rank
      FROM app.party c
      LEFT JOIN sal.delivery d ON d.customer_id = c.party_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
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
    ORDER BY rank
    LIMIT 10;
  `);

  // 7. Customer RFM
  await testReport('Customer RFM', `
    WITH rfm_data AS (
      SELECT
        c.party_id,
        c.party_name,
        CURRENT_DATE - MAX(COALESCE(d.transaction_date, ai.transaction_date))::DATE AS recency,
        COUNT(DISTINCT so.so_id) AS frequency,
        COALESCE(SUM(ail.qty * ail.unit_price), 0) AS monetary
      FROM app.party c
      LEFT JOIN sal.sales_order so
        ON so.customer_id = c.party_id
        AND DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.delivery d
        ON d.so_id = so.so_id
        AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.ar_invoice ai
        ON ai.customer_id = c.party_id
        AND DATE(ai.transaction_date) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.ar_invoice_line ail
        ON ail.ar_invoice_id = ai.ar_invoice_id
      WHERE c.party_type = 'CUSTOMER'
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
          WHEN COALESCE(frequency, 0) >= 10 AND COALESCE(monetary, 0) >= 100000 AND COALESCE(recency, 999) <= 7 THEN 'Champion'
          WHEN COALESCE(frequency, 0) >= 5 AND COALESCE(monetary, 0) >= 50000 THEN 'Loyal'
          WHEN COALESCE(frequency, 0) >= 3 THEN 'Regular'
          WHEN COALESCE(recency, 999) <= 60 AND COALESCE(frequency, 0) > 0 THEN 'At Risk'
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
    ORDER BY segment, monetary DESC, party_name
    LIMIT 20;
  `);

  await pool.end();
}

run();
