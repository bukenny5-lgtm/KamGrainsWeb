import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
(async()=>{
  const week_start='2026-07-06';
  const week_end='2026-07-12';
  try{
    const sql = `
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
      )
      SELECT * FROM rfm_data ORDER BY monetary DESC LIMIT 20;
    `;
    const res = await pool.query(sql, [week_start, week_end]);
    console.log('RFM rows:', res.rowCount);
    console.table(res.rows.slice(0,20));
  } catch(e){ console.error(e); } finally{ await pool.end(); }
})();
