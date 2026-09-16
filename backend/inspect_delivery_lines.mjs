import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

async function run(){
  try{
    const res = await pool.query(`
      SELECT dl.delivery_line_id, dl.qty, dl.sell_qty, dl.unit_price, d.transaction_date, d.delivery_id
      FROM sal.delivery_line dl
      JOIN sal.delivery d ON d.delivery_id = dl.delivery_id
      WHERE dl.product_id = $1 AND DATE(d.transaction_date) BETWEEN $2::DATE AND $3::DATE
      ORDER BY d.transaction_date DESC
    `, ['e384aab6-2465-4c4d-8f2b-26aa832c448d','2026-07-06','2026-07-12']);
    console.log('rows:', res.rowCount);
    console.table(res.rows);

    const sum = await pool.query(`
      SELECT COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0)),0) AS revenue
      FROM sal.delivery_line dl
      JOIN sal.delivery d ON d.delivery_id = dl.delivery_id
      WHERE dl.product_id = $1 AND DATE(d.transaction_date) BETWEEN $2::DATE AND $3::DATE
    `, ['e384aab6-2465-4c4d-8f2b-26aa832c448d','2026-07-06','2026-07-12']);
    console.log('computed revenue:', sum.rows[0].revenue);
  } catch(e){console.error(e);} finally{ await pool.end(); }
}
run();
