import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

async function run(){
  try{
    const queries = [
      {k:'count_parties', sql: `SELECT party_type, COUNT(*) FROM app.party GROUP BY party_type`},
      {k:'count_products', sql: `SELECT product_type, COUNT(*) FROM inv.product GROUP BY product_type`},
      {k:'count_sales_orders', sql: `SELECT COUNT(*) FROM sal.sales_order`},
      {k:'count_deliveries', sql: `SELECT COUNT(*) FROM sal.delivery`},
      {k:'count_delivery_lines', sql: `SELECT COUNT(*) FROM sal.delivery_line`},
      {k:'sample_delivery_lines', sql: `SELECT dl.delivery_line_id, dl.product_id, dl.qty, dl.sell_qty, dl.unit_price, d.transaction_date, d.delivery_id FROM sal.delivery_line dl JOIN sal.delivery d ON d.delivery_id = dl.delivery_id ORDER BY d.transaction_date DESC LIMIT 10`},
      {k:'count_ar_invoices', sql: `SELECT COUNT(*) FROM sal.ar_invoice`},
      {k:'count_ar_invoice_lines', sql: `SELECT COUNT(*) FROM sal.ar_invoice_line`},
      {k:'count_ap_invoices', sql: `SELECT COUNT(*) FROM pur.ap_invoice`},
      {k:'count_ap_invoice_lines', sql: `SELECT COUNT(*) FROM pur.ap_invoice_line`},
      {k:'count_stock_movements', sql: `SELECT COUNT(*) FROM inv.stock_movement`},
      {k:'count_stock_movement_lines', sql: `SELECT COUNT(*) FROM inv.stock_movement_line`},
      {k:'sample_products', sql: `SELECT product_id, product_name, sku, product_type, is_active FROM inv.product ORDER BY product_name LIMIT 10`},
      {k:'sample_parties', sql: `SELECT party_id, party_type, party_name FROM app.party ORDER BY party_name LIMIT 10`}
    ];

    for (const q of queries) {
      try {
        const res = await pool.query(q.sql);
        console.log('---', q.k);
        console.log(res.rows);
      } catch (e) {
        console.log('---', q.k, 'ERROR', e.message);
      }
    }
  } catch (err){ console.error('ERR', err); }
  finally{ await pool.end(); }
}
run();
