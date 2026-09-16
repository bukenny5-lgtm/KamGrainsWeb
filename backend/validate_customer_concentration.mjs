import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
(async()=>{
  const week_start='2026-07-06';
  const week_end='2026-07-12';
  try{
    const reportSql = `
      SELECT c.party_id, c.party_name,
        COALESCE(SUM(CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE THEN COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0) ELSE 0 END),0) AS revenue,
        COALESCE(SUM(CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE THEN COALESCE(dl.sell_qty, dl.qty,0) ELSE 0 END),0) AS kg_purchased,
        COUNT(DISTINCT d.delivery_id) AS orders_count
      FROM app.party c
      LEFT JOIN sal.delivery d ON d.customer_id = c.party_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
      WHERE c.party_type = 'CUSTOMER'
      GROUP BY c.party_id, c.party_name
      ORDER BY revenue DESC
      LIMIT 10;
    `;
    const rep = await pool.query(reportSql, [week_start, week_end]);
    console.log('Top customers from report-style aggregation:');
    console.table(rep.rows);

    const rawSql = `
      SELECT d.customer_id AS party_id, c.party_name, COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0)),0) AS revenue
      FROM sal.delivery_line dl
      JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      JOIN app.party c ON c.party_id = d.customer_id
      WHERE c.party_type = 'CUSTOMER'
      GROUP BY d.customer_id, c.party_name
      ORDER BY revenue DESC
      LIMIT 10;
    `;
    const raw = await pool.query(rawSql, [week_start, week_end]);
    console.log('Top customers from raw aggregates:');
    console.table(raw.rows);

  } catch(e){ console.error(e); } finally{ await pool.end(); }
})();
