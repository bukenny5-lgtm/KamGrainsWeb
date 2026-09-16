import fs from 'fs';
import pg from 'pg';
const { Client } = pg;
const client = new Client({ host: 'localhost', user: 'postgres', database: 'kam_grains_db', password: 'Gomis5@buk', port: 5432 });

const sql = fs.readFileSync('C:\\BusinessSystems\\KamGrainsWeb\\database\\migrations\\phase_4_ap_payment_partial_fix.sql', 'utf8');

try {
  await client.connect();
  await client.query(sql);
  console.log('MIGRATION_OK');

  const paymentCheck = await client.query("SELECT proname, pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('post_ap_payment','refresh_ap_invoice_status') AND pronamespace='pur'::regnamespace ORDER BY proname;");
  console.log(JSON.stringify(paymentCheck.rows, null, 2));
} finally {
  await client.end();
}
