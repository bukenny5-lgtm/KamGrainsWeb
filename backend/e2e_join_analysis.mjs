import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

const week_start = '2026-07-06';
const week_end = '2026-07-12';

async function analyzeJoins(reportName, queries) {
  console.log('\n' + '='.repeat(120));
  console.log(`📊 JOIN ANALYSIS: ${reportName}`);
  console.log('='.repeat(120));

  for (const q of queries) {
    try {
      const res = await pool.query(q.sql, [week_start, week_end]);
      console.log(`\n${q.name}:`);
      console.log(`  Rows: ${res.rowCount}`);
      if (res.rowCount > 0) {
        console.log(`  Sample: ${JSON.stringify(res.rows[0])}`);
      }
    } catch (e) {
      console.log(`\n${q.name}: ERROR - ${e.message}`);
    }
  }
}

async function run() {
  // 1. Customer Weekly Performance - JOIN analysis
  await analyzeJoins('Customer Weekly Performance', [
    {
      name: 'Raw parties (all customers)',
      sql: `SELECT COUNT(*) FROM app.party WHERE party_type = 'CUSTOMER'`
    },
    {
      name: 'Parties with sales orders in week',
      sql: `SELECT COUNT(DISTINCT so.customer_id) FROM sal.sales_order so WHERE DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Deliveries with transaction_date in week',
      sql: `SELECT COUNT(*) FROM sal.delivery d WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Delivery lines for those deliveries',
      sql: `SELECT COUNT(*) FROM sal.delivery_line dl JOIN sal.delivery d ON d.delivery_id = dl.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Customers with revenue in week (aggregated)',
      sql: `SELECT COUNT(DISTINCT d.customer_id) FROM sal.delivery d LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE AND dl.delivery_line_id IS NOT NULL`
    },
    {
      name: 'Join path: party -> so -> d -> dl (total rows before GROUP BY)',
      sql: `SELECT COUNT(*) FROM app.party c LEFT JOIN sal.sales_order so ON so.customer_id = c.party_id AND DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE LEFT JOIN sal.delivery d ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id WHERE c.party_type = 'CUSTOMER'`
    },
    {
      name: 'Join path after GROUP BY (distinct customers with data)',
      sql: `SELECT COUNT(*) FROM (SELECT DISTINCT c.party_id FROM app.party c LEFT JOIN sal.sales_order so ON so.customer_id = c.party_id AND DATE(so.created_at) BETWEEN $1::DATE AND $2::DATE LEFT JOIN sal.delivery d ON d.so_id = so.so_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id WHERE c.party_type = 'CUSTOMER') t`
    }
  ]);

  // 2. Weekly Sales by Product - JOIN analysis
  await analyzeJoins('Weekly Sales by Product', [
    {
      name: 'Active bean products',
      sql: `SELECT COUNT(*) FROM inv.product WHERE product_type IN ('FINISHED','RAW') AND is_active = true`
    },
    {
      name: 'Delivery lines in week',
      sql: `SELECT COUNT(*) FROM sal.delivery_line dl JOIN sal.delivery d ON d.delivery_id = dl.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Products with sales in week',
      sql: `SELECT COUNT(DISTINCT dl.product_id) FROM sal.delivery_line dl JOIN sal.delivery d ON d.delivery_id = dl.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE AND dl.product_id IN (SELECT product_id FROM inv.product WHERE product_type IN ('FINISHED','RAW'))`
    },
    {
      name: 'Join path: product LEFT JOIN dl (total rows before GROUP BY)',
      sql: `SELECT COUNT(*) FROM inv.product p LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true`
    },
    {
      name: 'Report query result (products with revenue)',
      sql: `SELECT COUNT(*) FROM inv.product p LEFT JOIN sal.delivery_line dl ON dl.product_id = p.product_id LEFT JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true GROUP BY p.product_id, p.product_name, p.sku HAVING COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0)), 0) > 0`
    }
  ]);

  // 3. Customer Concentration - JOIN multiplicity analysis
  await analyzeJoins('Customer Concentration', [
    {
      name: 'Total customers',
      sql: `SELECT COUNT(*) FROM app.party WHERE party_type = 'CUSTOMER'`
    },
    {
      name: 'Unique deliveries in week',
      sql: `SELECT COUNT(DISTINCT delivery_id) FROM sal.delivery WHERE DATE(transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Unique delivery lines in week',
      sql: `SELECT COUNT(*) FROM sal.delivery_line dl JOIN sal.delivery d ON d.delivery_id = dl.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Multiplier: avg lines per delivery',
      sql: `SELECT COUNT(*)::FLOAT / (SELECT COUNT(DISTINCT delivery_id) FROM sal.delivery WHERE DATE(transaction_date) BETWEEN $1::DATE AND $2::DATE) AS lines_per_delivery FROM sal.delivery_line dl JOIN sal.delivery d ON d.delivery_id = dl.delivery_id WHERE DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Join path before GROUP BY (multiplied rows)',
      sql: `SELECT COUNT(*) FROM app.party c LEFT JOIN sal.delivery d ON d.customer_id = c.party_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id WHERE c.party_type = 'CUSTOMER'`
    },
    {
      name: 'After GROUP BY (customers by revenue rank)',
      sql: `SELECT COUNT(*) FROM (SELECT c.party_id, SUM(CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE THEN COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0) ELSE 0 END) AS revenue FROM app.party c LEFT JOIN sal.delivery d ON d.customer_id = c.party_id LEFT JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id WHERE c.party_type = 'CUSTOMER' GROUP BY c.party_id) t WHERE revenue > 0`
    }
  ]);

  // 4. Date filtering verification
  await analyzeJoins('Date Filtering Verification', [
    {
      name: 'Deliveries with transaction_date IN week',
      sql: `SELECT COUNT(*) FROM sal.delivery WHERE DATE(transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Deliveries IN week vs. created_at IN week (may differ for backdated)',
      sql: `SELECT COUNT(*) FROM sal.delivery WHERE DATE(created_at) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'AP invoices with transaction_date IN week',
      sql: `SELECT COUNT(*) FROM pur.ap_invoice WHERE DATE(transaction_date) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Sales orders with created_at IN week',
      sql: `SELECT COUNT(DISTINCT so_id) FROM sal.sales_order WHERE DATE(created_at) BETWEEN $1::DATE AND $2::DATE`
    },
    {
      name: 'Stock movements DELIVERY type with movement_ts IN week',
      sql: `SELECT COUNT(*) FROM inv.stock_movement WHERE movement_type = 'DELIVERY' AND DATE(movement_ts) BETWEEN $1::DATE AND $2::DATE`
    }
  ]);

  await pool.end();
}

run();
