import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });

async function run(){
  const week_start='2026-07-06';
  const week_end='2026-07-12';
  try{
    console.log('Running weekly-profit-by-product report SQL');
    const reportSql = `
      WITH sales_data AS (
        SELECT
          p.product_id,
          p.product_name,
          p.sku,
          COALESCE(SUM(
            CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
                 THEN COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)
                 ELSE 0 END
          ), 0) AS revenue,
          COALESCE(SUM(
            CASE WHEN DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
                 THEN COALESCE(dl.sell_qty, dl.qty, 0)
                 ELSE 0 END
          ), 0) AS qty_sold
        FROM inv.product p
        LEFT JOIN sal.delivery_line dl
          ON dl.product_id = p.product_id
        LEFT JOIN sal.delivery d
          ON d.delivery_id = dl.delivery_id
          AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
        WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
        GROUP BY p.product_id, p.product_name, p.sku
      ),
      cogs_data AS (
        SELECT
          sml.product_id,
          COALESCE(SUM(sml.qty * sml.unit_cost), 0) AS cogs
        FROM inv.stock_movement_line sml
        WHERE sml.product_id IN (
          SELECT product_id FROM sales_data
        )
        AND sml.movement_id IN (
          SELECT DISTINCT movement_id
          FROM inv.stock_movement sm
          WHERE sm.movement_type = 'DELIVERY'
            AND DATE(sm.movement_ts) BETWEEN $1::DATE AND $2::DATE
        )
        GROUP BY sml.product_id
      )
      SELECT
        s.product_id,
        s.product_name,
        s.sku,
        s.revenue,
        COALESCE(c.cogs, 0) AS cogs,
        s.revenue - COALESCE(c.cogs, 0) AS gross_profit,
        CASE
          WHEN s.revenue > 0
          THEN ROUND(((s.revenue - COALESCE(c.cogs, 0)) / s.revenue) * 100, 2)
          ELSE 0
        END AS gross_margin_pct
      FROM sales_data s
      LEFT JOIN cogs_data c ON c.product_id = s.product_id
      WHERE s.revenue > 0
      ORDER BY s.revenue DESC, s.product_name;
    `;

    const rep = await pool.query(reportSql, [week_start, week_end]);
    console.log('Report rows:', rep.rowCount);
    console.table(rep.rows.slice(0,20));

    // raw sales aggregates
    const rawSales = await pool.query(`
      SELECT dl.product_id, p.product_name,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty,0) * COALESCE(dl.unit_price,0)),0) AS revenue
      FROM sal.delivery_line dl
      JOIN sal.delivery d ON d.delivery_id = dl.delivery_id AND DATE(d.transaction_date) BETWEEN $1::DATE AND $2::DATE
      JOIN inv.product p ON p.product_id = dl.product_id
      WHERE p.product_type IN ('FINISHED','RAW') AND p.is_active = true
      GROUP BY dl.product_id, p.product_name
      ORDER BY revenue DESC
      LIMIT 20;
    `, [week_start, week_end]);
    console.log('Raw sales rows:', rawSales.rowCount);
    console.table(rawSales.rows.slice(0,20));

    // raw cogs aggregates
    const rawCogs = await pool.query(`
      SELECT sml.product_id, COALESCE(SUM(sml.qty * sml.unit_cost),0) AS cogs
      FROM inv.stock_movement_line sml
      WHERE sml.movement_id IN (
        SELECT DISTINCT movement_id FROM inv.stock_movement sm WHERE sm.movement_type = 'DELIVERY' AND DATE(sm.movement_ts) BETWEEN $1::DATE AND $2::DATE
      )
      GROUP BY sml.product_id
      ORDER BY cogs DESC
      LIMIT 20;
    `, [week_start, week_end]);
    console.log('Raw cogs rows:', rawCogs.rowCount);
    console.table(rawCogs.rows.slice(0,20));

  } catch (e){ console.error('Validation ERROR', e.message); }
  finally { await pool.end(); }
}
run();
