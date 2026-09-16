import express from "express";
import { query } from "../db.js";

const router = express.Router();

/**
 * GET /api/inventory-reports/stock-on-hand
 * Shows current stock balance by product, lot, and location.
 * Includes unit_cost and supports include_closed toggle.
 */
router.get("/stock-on-hand", async (req, res) => {
  try {
    const { product_id, location_id, saleable, include_closed } = req.query;

    const params = [];
    const conditions = [];

    // Choose view based on include_closed
    const viewName = include_closed === 'true'
      ? 'inv.v_stock_on_hand_all'
      : 'inv.v_stock_on_hand_active';

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
        soh.sku,
        soh.product_name,
        soh.lot_id,
        soh.lot_code,
        soh.expiry_date,
        soh.lot_status,
        soh.location_id,
        soh.location_code,
        soh.location_name,
        soh.qty_on_hand,
        COALESCE(lc.unit_cost, avg_cost.unit_cost, 0) AS unit_cost,
        COALESCE(lc.unit_cost, avg_cost.unit_cost, 0) AS average_unit_cost,
        COALESCE(lc.unit_cost, avg_cost.unit_cost, 0) AS avg_unit_cost
      FROM ${viewName} soh
      LEFT JOIN inv.v_lot_unit_cost lc
        ON lc.lot_id = soh.lot_id
      LEFT JOIN LATERAL (
        SELECT AVG(NULLIF(sml.unit_cost, 0)) AS unit_cost
        FROM inv.stock_movement_line sml
        WHERE sml.product_id = soh.product_id
          AND sml.lot_id IS NOT DISTINCT FROM soh.lot_id
          AND sml.unit_cost IS NOT NULL
      ) avg_cost ON true
      ${whereClause}
      ORDER BY soh.product_name, soh.location_name, soh.lot_code;
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
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/inventory-reports/stock-summary
 * Dashboard-ready stock summary by product (active only).
 */
router.get("/stock-summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        product_id,
        sku,
        product_name,
        SUM(qty_on_hand) AS total_qty_on_hand,
        COUNT(DISTINCT lot_id) AS lot_count,
        COUNT(DISTINCT location_id) AS location_count
      FROM inv.v_stock_on_hand_active
      GROUP BY product_id, sku, product_name
      ORDER BY product_name;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load stock summary.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/inventory-reports/stock-movements
 * Shows inventory movement history with audit information.
 */
router.get("/stock-movements", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        sm.movement_id,
        sm.movement_ts,
        sm.movement_type,
        sm.document_no,
        sm.reason_code,
        sm.notes,
        sm.created_by,
        u.username AS created_by_username,
        u.full_name AS created_by_name,
        sm.created_at,

        sml.movement_line_id,
        sml.product_id,
        p.sku,
        p.product_name,
        sml.lot_id,
        l.lot_code,
        sml.qty,
        sml.unit_cost,

        sml.from_location_id,
        from_loc.location_code AS from_location_code,
        from_loc.location_name AS from_location_name,

        sml.to_location_id,
        to_loc.location_code AS to_location_code,
        to_loc.location_name AS to_location_name

      FROM inv.stock_movement sm
      JOIN inv.stock_movement_line sml
        ON sml.movement_id = sm.movement_id
      JOIN inv.product p
        ON p.product_id = sml.product_id
      LEFT JOIN inv.lot l
        ON l.lot_id = sml.lot_id
      LEFT JOIN app.location from_loc
        ON from_loc.location_id = sml.from_location_id
      LEFT JOIN app.location to_loc
        ON to_loc.location_id = sml.to_location_id
      LEFT JOIN sec.app_user u
        ON u.user_id = sm.created_by
      ORDER BY sm.movement_ts DESC, sm.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load stock movements.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/inventory-reports/lots
 * Returns lots for GRN and stock forms.
 * Optional filter: ?product_id=uuid
 */
router.get("/lots", async (req, res) => {
  try {
    const { product_id } = req.query;

    const params = [];
    let whereClause = "";

    if (product_id) {
      params.push(product_id);
      whereClause = "WHERE l.product_id = $1";
    }

    const result = await query(
      `
      SELECT
        l.lot_id,
        l.lot_code,
        l.product_id,
        p.sku,
        p.product_name,
        l.expiry_date,
        l.created_at
      FROM inv.lot l
      LEFT JOIN inv.product p
        ON p.product_id = l.product_id
      ${whereClause}
      ORDER BY p.product_name, l.expiry_date NULLS LAST, l.lot_code;
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
      message: "Failed to load lots.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

export default router;