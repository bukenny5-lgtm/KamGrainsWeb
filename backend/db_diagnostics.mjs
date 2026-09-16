import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

const weekStart='2026-06-30';
const weekEnd='2026-07-06';

async function run(){
  try{
    console.log('WEEK',weekStart,weekEnd);
    const q1 = await pool.query(`SELECT COUNT(*) FROM sal.delivery d WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE`,[weekStart,weekEnd]);
    console.log('deliveries_in_week', q1.rows[0].count);
    const q2 = await pool.query(`SELECT COUNT(*) FROM sal.delivery_line dl JOIN sal.delivery d ON dl.delivery_id = d.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE`,[weekStart,weekEnd]);
    console.log('delivery_lines_in_week', q2.rows[0].count);
    const q3 = await pool.query(`SELECT DISTINCT p.product_id, p.product_name, p.is_active, p.product_type FROM inv.product p WHERE p.product_type='BEAN' AND p.is_active = true ORDER BY p.product_name LIMIT 10`);
    console.log('sample_products', q3.rows);
    const q4 = await pool.query(`SELECT dl.delivery_line_id, dl.product_id, dl.qty, dl.sell_qty, dl.unit_price, d.transaction_date FROM sal.delivery_line dl JOIN sal.delivery d ON dl.delivery_id = d.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE LIMIT 10`,[weekStart,weekEnd]);
    console.log('sample_delivery_lines', q4.rows);
    const q5 = await pool.query(`SELECT COUNT(*) FROM pur.ap_invoice api WHERE DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE`,[weekStart,weekEnd]);
    console.log('ap_invoices_in_week', q5.rows[0].count);
    const q6 = await pool.query(`SELECT COUNT(*) FROM pur.ap_invoice_line apil JOIN pur.ap_invoice api ON apil.ap_invoice_id = api.ap_invoice_id WHERE DATE(api.transaction_date) BETWEEN $1::DATE AND $2::DATE`,[weekStart,weekEnd]);
    console.log('ap_invoice_lines_in_week', q6.rows[0].count);
  }catch(err){ console.error('ERR',err); }
  finally{ await pool.end(); }
}
run();
