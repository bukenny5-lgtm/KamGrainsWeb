import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

async function run(){
  const week_start='2026-07-06';
  const week_end='2026-07-12';
  try{
    console.log('Running weekly-purchases-by-product report SQL');
    const reportSql = `
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
    `;

    const rep = await pool.query(reportSql, [week_start, week_end]);
    console.log('Report rows:', rep.rowCount);
    console.table(rep.rows.slice(0,20));

    const rawSql = `
      SELECT p.product_id, p.product_name, p.sku,
        COALESCE(SUM(COALESCE(apil.qty,0)),0) AS kg_purchased,
        COALESCE(SUM(COALESCE(apil.qty,0) * COALESCE(apil.unit_price,0)),0) AS purchase_value
      FROM inv.product p
      LEFT JOIN pur.ap_invoice_line apil ON apil.product_id = p.product_id
      LEFT JOIN pur.ap_invoice api ON api.ap_invoice_id = apil.ap_invoice_id AND DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE
      WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
      GROUP BY p.product_id,p.product_name,p.sku
      HAVING COALESCE(SUM(COALESCE(apil.qty,0)),0) > 0
      ORDER BY purchase_value DESC
      LIMIT 20;
    `;
    const raw = await pool.query(rawSql, [week_start, week_end]);
    console.log('Raw aggregates rows:', raw.rowCount);
    console.table(raw.rows.slice(0,20));

  } catch (e){ console.error('Validation ERROR', e.message); }
  finally { await pool.end(); }
}
run();
