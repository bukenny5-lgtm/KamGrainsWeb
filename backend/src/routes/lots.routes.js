import express from "express";
import { query } from "../db.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

/**
 * GET /api/lots
 * Lists inventory lots for dropdowns and stock workflows.
 * 
 * Query parameters:
 * - include_closed: true/false - Include CLOSED lots (default: false)
 * - status: ACTIVE, CLOSED, EXPIRED - Filter by lot status
 */
router.get("/", async (req, res) => {
  try {
    const { include_closed, status } = req.query;
    
    let statusFilter = "WHERE l.lot_status = 'ACTIVE'";
    
    if (include_closed === 'true') {
      statusFilter = "";
    } else if (status && ['ACTIVE', 'CLOSED', 'EXPIRED'].includes(status.toUpperCase())) {
      statusFilter = `WHERE l.lot_status = '${status.toUpperCase()}'`;
    }

    const result = await query(`
      SELECT
        l.lot_id,
        l.lot_code,
        l.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        l.expiry_date,
        l.lot_status,
        l.lot_status_changed_at,
        l.lot_status_changed_by,
        l.created_at
      FROM inv.lot l
      LEFT JOIN inv.product p
        ON p.product_id = l.product_id
      ${statusFilter}
      ORDER BY
        p.product_name,
        l.expiry_date NULLS LAST,
        l.lot_code;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
      lots: result.rows
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

/**
 * GET /api/lots/:lotId
 * Gets one lot with full status information.
 */
router.get("/:lotId", async (req, res) => {
  try {
    const { lotId } = req.params;

    const result = await query(
      `
      SELECT
        l.lot_id,
        l.lot_code,
        l.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        l.expiry_date,
        l.lot_status,
        l.lot_status_changed_at,
        l.lot_status_changed_by,
        l.created_at
      FROM inv.lot l
      LEFT JOIN inv.product p
        ON p.product_id = l.product_id
      WHERE l.lot_id = $1;
      `,
      [lotId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Lot not found."
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      lot: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load lot.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

export default router;

/**
 * GET /api/lots/status/list
 * Get lots by status (ACTIVE, CLOSED, EXPIRED)
 * 
 * Query parameters:
 * - status: required - ACTIVE, CLOSED, or EXPIRED
 */
router.get("/status/list", async (req, res) => {
  try {
    const { status } = req.query;
    
    if (!status || !['ACTIVE', 'CLOSED', 'EXPIRED'].includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Status must be ACTIVE, CLOSED, or EXPIRED"
      });
    }

    const result = await query(`
      SELECT
        l.lot_id,
        l.lot_code,
        l.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        l.expiry_date,
        l.lot_status,
        l.lot_status_changed_at,
        l.lot_status_changed_by,
        l.created_at
      FROM inv.lot l
      LEFT JOIN inv.product p ON p.product_id = l.product_id
      WHERE l.lot_status = $1
      ORDER BY p.product_name, l.expiry_date NULLS LAST, l.lot_code;
    `, [status.toUpperCase()]);

    res.json({
      success: true,
      status: status.toUpperCase(),
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load lots by status.",
      error: error.message
    });
  }
});

/**
 * POST /api/lots/:lotId/close
 * Manually close a lot (set status to CLOSED)
 * Only ADMIN and MANAGER can close lots
 */
router.post("/:lotId/close", requirePermission("CLOSE_LOT"), async (req, res) => {
  try {
    const { lotId } = req.params;
    const userId = req.user?.user_id || "system";

    // Check lot exists
    const lotCheck = await query(
      "SELECT lot_id, lot_status FROM inv.lot WHERE lot_id = $1",
      [lotId]
    );

    if (lotCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Lot not found"
      });
    }

    const { lot_status } = lotCheck.rows[0];
    
    if (lot_status === 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: "Lot is already closed"
      });
    }

    // Close the lot
    const result = await query(
      `UPDATE inv.lot 
       SET lot_status = 'CLOSED', 
           lot_status_changed_at = NOW(), 
           lot_status_changed_by = $1
       WHERE lot_id = $2
       RETURNING lot_id, lot_status, lot_status_changed_at, lot_status_changed_by`,
      [userId, lotId]
    );

    res.json({
      success: true,
      message: "Lot closed successfully",
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to close lot.",
      error: error.message
    });
  }
});

/**
 * POST /api/lots/:lotId/reactivate
 * Reactivate a CLOSED lot (set status to ACTIVE)
 * Only ADMIN can reactivate lots
 */
router.post("/:lotId/reactivate", requirePermission("ADMIN"), async (req, res) => {
  try {
    const { lotId } = req.params;
    const userId = req.user?.user_id || "system";

    // Check lot exists
    const lotCheck = await query(
      "SELECT lot_id, lot_status FROM inv.lot WHERE lot_id = $1",
      [lotId]
    );

    if (lotCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Lot not found"
      });
    }

    const { lot_status } = lotCheck.rows[0];
    
    if (lot_status !== 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: "Only CLOSED lots can be reactivated"
      });
    }

    // Reactivate the lot
    const result = await query(
      `UPDATE inv.lot 
       SET lot_status = 'ACTIVE', 
           lot_status_changed_at = NOW(), 
           lot_status_changed_by = $1
       WHERE lot_id = $2
       RETURNING lot_id, lot_status, lot_status_changed_at, lot_status_changed_by`,
      [userId, lotId]
    );

    res.json({
      success: true,
      message: "Lot reactivated successfully",
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to reactivate lot.",
      error: error.message
    });
  }
});