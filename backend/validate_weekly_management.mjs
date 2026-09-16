import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
(async()=>{
  const week_start='2026-07-06';
  const week_end='2026-07-12';
  try{
    const sql = `
      WITH weekly_sales AS (
        SELECT
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS total_revenue,
          COUNT(DISTINCT so.so_id) AS total_orders,
          COUNT(DISTINCT d.customer_id) AS total_customers
        FROM sal.sales_order so
        LEFT JOIN sal.delivery d ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
        WHERE DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
      )
      SELECT * FROM weekly_sales;
    `;
    const rep = await pool.query(sql, [week_start, week_end]);
    console.log('weekly_sales:', rep.rows);

    const purchasesSql = `SELECT COALESCE(SUM(apil.qty * apil.unit_price), 0) AS total_purchases FROM pur.ap_invoice api LEFT JOIN pur.ap_invoice_line apil ON apil.ap_invoice_id = api.ap_invoice_id WHERE DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE`;
    const pur = await pool.query(purchasesSql, [week_start, week_end]);
    console.log('weekly_purchases:', pur.rows);

    const cogsSql = `SELECT COALESCE(SUM(sml.qty * sml.unit_cost), 0) AS total_cogs FROM inv.stock_movement_line sml WHERE sml.movement_id IN (SELECT DISTINCT movement_id FROM inv.stock_movement sm WHERE sm.movement_type = 'DELIVERY' AND DATE(sm.movement_ts) BETWEEN $1::DATE AND $2::DATE)`;
    const cogs = await pool.query(cogsSql, [week_start, week_end]);
    console.log('weekly_cogs:', cogs.rows);

    const topCustSql = `SELECT c.party_name, COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0)),0) AS revenue FROM app.party c LEFT JOIN sal.delivery d ON d.customer_id = c.party_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id WHERE c.party_type = 'CUSTOMER' GROUP BY c.party_id, c.party_name ORDER BY revenue DESC LIMIT 1`;
    const tc = await pool.query(topCustSql, [week_start, week_end]);
    console.log('top_customer:', tc.rows);

    const topProdSql = `SELECT p.product_name, COALESCE(SUM(CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE THEN COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0) ELSE 0 END),0) AS revenue FROM inv.product p LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true GROUP BY p.product_id, p.product_name ORDER BY revenue DESC LIMIT 1`;
    const tp = await pool.query(topProdSql, [week_start, week_end]);
    console.log('top_product:', tp.rows);

  } catch(e){ console.error(e); } finally{ await pool.end(); }
})();
