import express from "express";
import { query } from "../db.js";

const router = express.Router();
router.get("/stock-on-hand", async (req, res) => {
  try {
    const { product_id, location_id, saleable, include_closed } = req.query;

    const params = [];
    const conditions = [];

    // DEBUG: log the parameter and the chosen view
    console.log('=== INVENTORY API CALL ===');
    console.log('include_closed:', include_closed);
    console.log('typeof include_closed:', typeof include_closed);

    // Choose view based on include_closed
    const viewName = include_closed === 'true'
      ? 'inv.v_stock_on_hand_all'
      : 'inv.v_stock_on_hand_active';

    console.log('Using view:', viewName);

    if (product_id) {
      params.push(product_id);
      conditions.push(`soh.product_id = $${params.length}`);
    }

    if (location_id) {
      params.push(location_id);
      conditions.push(`soh.location_id = $${params.length}`);
    }

    if (saleable !== undefined) {
      params.push(saleable === "true");
      conditions.push(`p.is_saleable = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

   const result = await query(
  `
  SELECT
    soh.product_id,
    p.sku,
    p.product_name,
    p.product_type,
    p.uom_code,
    p.is_saleable,

    soh.location_id,
    loc.location_code,
    loc.location_name,

    soh.lot_id,
    l.lot_code,
    l.expiry_date,
    l.lot_status,

    vuc.unit_cost,
    soh.qty_on_hand
  FROM ${viewName} soh
  JOIN inv.product p
    ON p.product_id = soh.product_id
  LEFT JOIN app.location loc
    ON loc.location_id = soh.location_id
  LEFT JOIN inv.lot l
    ON l.lot_id = soh.lot_id
  LEFT JOIN inv.v_lot_unit_cost vuc
    ON vuc.lot_id = soh.lot_id
  ${whereClause}
  ORDER BY
    p.product_name,
    loc.location_name,
    l.lot_code;
  `,
  params
);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load stock on hand.",
      error: error.message
    });
  }
});
/**
 * GET /api/inventory/lots
 * Optional filters: product_id, active
 */
router.get("/lots", async (req, res) => {
  try {
    const { product_id, active } = req.query;

    const params = [];
    const conditions = [];

    if (product_id) {
      params.push(product_id);
      conditions.push(`l.product_id = $${params.length}`);
    }

    if (active !== undefined) {
      params.push(active === "true");
      conditions.push(`l.is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `
      SELECT
        l.lot_id,
        l.lot_code,
        l.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        l.received_date,
        l.expiry_date,
        l.is_active
      FROM inv.lot l
      JOIN inv.product p
        ON p.product_id = l.product_id
      ${whereClause}
      ORDER BY
        p.product_name,
        l.received_date DESC,
        l.lot_code;
      `,
      params
    );

    res.json({
      success: true,
      count: result.rowCount,
      lots: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load lots.",
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/products-summary
 * Summarizes total stock by product.
 */
router.get("/products-summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable,
        COALESCE(SUM(soh.qty_on_hand), 0) AS total_qty_on_hand
      FROM inv.product p
      LEFT JOIN inv.v_stock_on_hand_active soh
        ON soh.product_id = p.product_id
      WHERE p.is_active = true
      GROUP BY
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable
      ORDER BY p.product_name;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      products_summary: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load product stock summary.",
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/low-stock
 * Returns products with zero or negative stock.
 */
router.get("/low-stock", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable,
        COALESCE(SUM(soh.qty_on_hand), 0) AS total_qty_on_hand
      FROM inv.product p
      LEFT JOIN inv.v_stock_on_hand_active soh
        ON soh.product_id = p.product_id
      WHERE p.is_active = true
      GROUP BY
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable
      HAVING COALESCE(SUM(soh.qty_on_hand), 0) <= 0
      ORDER BY p.product_name;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      low_stock: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load low stock products.",
      error: error.message
    });
  }
});

export default router;