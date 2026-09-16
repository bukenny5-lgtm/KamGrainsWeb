import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
(async()=>{
  try{
    const sql = `
      WITH sales_data AS (
        SELECT
          p.product_id,
          COALESCE(SUM(
            CASE WHEN DATE(d.transaction_date) BETWEEN $2::DATE AND $3::DATE
                 THEN COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)
                 ELSE 0 END
          ), 0) AS revenue
        FROM inv.product p
        LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id
        LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id
        WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
        GROUP BY p.product_id
      )
      SELECT * FROM sales_data WHERE product_id = $1;
    `;
    const res = await pool.query(sql, ['e384aab6-2465-4c4d-8f2b-26aa832c448d','2026-07-06','2026-07-12']);
    console.log(res.rows);
  } catch(e){ console.error(e); } finally { await pool.end(); }
})();
