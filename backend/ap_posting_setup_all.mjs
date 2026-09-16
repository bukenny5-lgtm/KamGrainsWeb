import pg from 'pg';
const { Client } = pg;
const client = new Client({ host: 'localhost', user: 'postgres', database: 'kam_grains_db', password: 'Gomis5@buk', port: 5432 });
try {
  await client.connect();
  const rows = await client.query("SELECT setup_key, account_id FROM fin.posting_setup ORDER BY setup_key;");
  console.log(JSON.stringify(rows.rows, null, 2));
} finally { await client.end(); }
