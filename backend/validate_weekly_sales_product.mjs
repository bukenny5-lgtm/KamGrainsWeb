import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

async function run(){
  const week_start='2026-07-06';
  const week_end='2026-07-12';
  try{
    console.log('Running weekly-sales-by-product report SQL');
    const reportSql = `
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
    `;

    const rep = await pool.query(reportSql, [week_start, week_end]);
    console.log('Report rows:', rep.rowCount);
    console.table(rep.rows.slice(0,20));

    // raw product aggregates from delivery_line
    const rawSql = `
      SELECT p.product_id, p.product_name, p.sku,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0)),0) AS kg_sold,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0)),0) AS revenue
      FROM inv.product p
      LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id
      LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
      GROUP BY p.product_id,p.product_name,p.sku
      HAVING COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0)),0) > 0
      ORDER BY revenue DESC
      LIMIT 20;
    `;
    const raw = await pool.query(rawSql, [week_start, week_end]);
    console.log('Raw aggregates rows:', raw.rowCount);
    console.table(raw.rows.slice(0,20));

  } catch (e){ console.error('Validation ERROR', e.message); }
  finally { await pool.end(); }
}
run();
