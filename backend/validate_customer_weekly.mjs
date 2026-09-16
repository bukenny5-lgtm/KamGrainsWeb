import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

async function run(){
  const week_start='2026-07-06';
  const week_end='2026-07-12';
  try{
    console.log('Running report SQL (customer-weekly-performance)');
    const reportSql = `
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
      LIMIT 20;
    `;

    const rep = await pool.query(reportSql, [week_start, week_end]);
    console.log('Report rows:', rep.rowCount);
    console.table(rep.rows.slice(0,20));

    // Raw aggregates per customer from delivery_line
    const rawSql = `
      SELECT c.party_id AS customer_code, c.party_name,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0)),0) AS total_kg,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0)),0) AS total_revenue
      FROM app.party c
      LEFT JOIN sal.delivery d ON d.customer_id = c.party_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
      WHERE c.party_type = 'CUSTOMER'
      GROUP BY c.party_id, c.party_name
      ORDER BY total_revenue DESC
      LIMIT 20;
    `;

    const raw = await pool.query(rawSql, [week_start, week_end]);
    console.log('Raw aggregates rows:', raw.rowCount);
    console.table(raw.rows.slice(0,20));

    // Orders per customer
    const ordersSql = `
      SELECT so.customer_id AS customer_code, COUNT(DISTINCT so.so_id) AS orders_count
      FROM sal.sales_order so
      LEFT JOIN sal.delivery d ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      WHERE DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE
      GROUP BY so.customer_id
      ORDER BY orders_count DESC
      LIMIT 20;
    `;
    const ord = await pool.query(ordersSql, [week_start, week_end]);
    console.log('Orders rows:', ord.rowCount);
    console.table(ord.rows.slice(0,20));

  } catch (e){ console.error('Validation ERROR', e.message); }
  finally { await pool.end(); }
}
run();
