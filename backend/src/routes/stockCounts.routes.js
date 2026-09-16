import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

/**
 * GET /api/stock-counts
 * List stock counts.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        sc.stock_count_id,
        sc.count_no,
        sc.count_date,
        sc.location_id,
        loc.location_code,
        loc.location_name,
        sc.status,
        sc.notes,
        sc.created_by,
        sc.created_at,
        sc.posted_movement_id,
        COUNT(scl.stock_count_line_id) AS line_count,
        COALESCE(SUM(scl.system_qty), 0) AS total_system_qty,
        COALESCE(SUM(scl.counted_qty), 0) AS total_counted_qty,
        COALESCE(SUM(scl.counted_qty - scl.system_qty), 0) AS total_variance_qty
      FROM inv.stock_count sc
      LEFT JOIN app.location loc
        ON loc.location_id = sc.location_id
      LEFT JOIN inv.stock_count_line scl
        ON scl.stock_count_id = sc.stock_count_id
      GROUP BY
        sc.stock_count_id,
        sc.count_no,
        sc.count_date,
        sc.location_id,
        loc.location_code,
        loc.location_name,
        sc.status,
        sc.notes,
        sc.created_by,
        sc.created_at,
        sc.posted_movement_id
      ORDER BY sc.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load stock counts.",
      error: error.message
    });
  }
});

/**
 * GET /api/stock-counts/:countNo
 * Get one stock count with lines.
 */
router.get("/:countNo", async (req, res) => {
  try {
    const { countNo } = req.params;

    const headerResult = await query(
      `
      SELECT
        sc.stock_count_id,
        sc.count_no,
        sc.count_date,
        sc.location_id,
        loc.location_code,
        loc.location_name,
        sc.status,
        sc.notes,
        sc.created_by,
        sc.created_at,
        sc.posted_movement_id
      FROM inv.stock_count sc
      LEFT JOIN app.location loc
        ON loc.location_id = sc.location_id
      WHERE sc.count_no = $1;
      `,
      [countNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Stock count not found."
      });
    }

    const stockCount = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        scl.stock_count_line_id,
        scl.stock_count_id,
        scl.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        scl.lot_id,
        l.lot_code,
        scl.system_qty,
        scl.counted_qty,
        scl.counted_qty - scl.system_qty AS variance_qty
      FROM inv.stock_count_line scl
      JOIN inv.product p
        ON p.product_id = scl.product_id
      LEFT JOIN inv.lot l
        ON l.lot_id = scl.lot_id
      WHERE scl.stock_count_id = $1
      ORDER BY p.product_name, l.lot_code;
      `,
      [stockCount.stock_count_id]
    );

    res.json({
      success: true,
      data: {
        ...stockCount,
        lines: linesResult.rows,
        totals: {
          line_count: linesResult.rowCount,
          total_system_qty: linesResult.rows.reduce(
            (sum, row) => sum + Number(row.system_qty || 0),
            0
          ),
          total_counted_qty: linesResult.rows.reduce(
            (sum, row) => sum + Number(row.counted_qty || 0),
            0
          ),
          total_variance_qty: linesResult.rows.reduce(
            (sum, row) => sum + Number(row.variance_qty || 0),
            0
          )
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load stock count.",
      error: error.message
    });
  }
});

/**
 * POST /api/stock-counts
 * Create stock count header.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_STOCK_COUNT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { count_no, count_date, location_id, notes, created_by } =
        req.body || {};

      if (!count_date) {
        return res.status(400).json({
          success: false,
          message: "Count date is required."
        });
      }

      if (!location_id) {
        return res.status(400).json({
          success: false,
          message: "Location is required."
        });
      }

      await client.query("BEGIN");

      const finalCountNo =
        count_no ||
        `SC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now()}`;

      const result = await client.query(
        `
        INSERT INTO inv.stock_count (
          stock_count_id,
          count_no,
          count_date,
          location_id,
          status,
          notes,
          created_by,
          created_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          'OPEN',
          $4,
          $5,
          now()
        )
        RETURNING *;
        `,
        [
          finalCountNo,
          count_date,
          location_id,
          notes || null,
          created_by || req.user?.user_id || null
        ]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Stock count created successfully.",
        data: result.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create stock count.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/stock-counts/:countNo/load-lines
 * Load current stock-on-hand lines into stock count.
 */
router.post(
  "/:countNo/load-lines",
  requireAuth,
  requirePermission("LOAD_STOCK_COUNT_LINES"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { countNo } = req.params;

      await client.query("BEGIN");

      const countCheck = await client.query(
        `
        SELECT stock_count_id, count_no, status
        FROM inv.stock_count
        WHERE count_no = $1
        FOR UPDATE;
        `,
        [countNo]
      );

      if (countCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Stock count not found."
        });
      }

      if (countCheck.rows[0].status !== "OPEN") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Only OPEN stock counts can load lines."
        });
      }

      const loadResult = await client.query(
        `
        SELECT inv.load_stock_count_lines_by_no($1) AS lines_loaded;
        `,
        [countNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Stock count lines loaded successfully.",
        count_no: countNo,
        lines_loaded: loadResult.rows[0].lines_loaded
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to load stock count lines.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * PATCH /api/stock-counts/:countNo/lines/:lineId
 * Update counted quantity.
 */
router.patch(
  "/:countNo/lines/:lineId",
  requireAuth,
  requirePermission("UPDATE_STOCK_COUNT_LINES"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { countNo, lineId } = req.params;
      const { counted_qty } = req.body || {};

      if (
        counted_qty === undefined ||
        counted_qty === null ||
        counted_qty === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "counted_qty is required."
        });
      }

      if (Number(counted_qty) < 0) {
        return res.status(400).json({
          success: false,
          message: "counted_qty cannot be negative."
        });
      }

      await client.query("BEGIN");

      const countCheck = await client.query(
        `
        SELECT stock_count_id, count_no, status
        FROM inv.stock_count
        WHERE count_no = $1
        FOR UPDATE;
        `,
        [countNo]
      );

      if (countCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Stock count not found."
        });
      }

      if (countCheck.rows[0].status !== "OPEN") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Only OPEN stock counts can be edited."
        });
      }

      const updateResult = await client.query(
        `
        UPDATE inv.stock_count_line
        SET counted_qty = $1
        WHERE stock_count_line_id = $2
          AND stock_count_id = $3
        RETURNING
          stock_count_line_id,
          stock_count_id,
          product_id,
          lot_id,
          system_qty,
          counted_qty,
          counted_qty - system_qty AS variance_qty;
        `,
        [Number(counted_qty), lineId, countCheck.rows[0].stock_count_id]
      );

      if (updateResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Stock count line not found."
        });
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Stock count line updated successfully.",
        data: updateResult.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to update stock count line.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/stock-counts/:countNo/post
 * Post stock count variances.
 */
router.post(
  "/:countNo/post",
  requireAuth,
  requirePermission("POST_STOCK_COUNT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { countNo } = req.params;
      const { reason_code = "COUNT_VARIANCE" } = req.body || {};

      if (!reason_code) {
        return res.status(400).json({
          success: false,
          message: "reason_code is required."
        });
      }

      await client.query("BEGIN");

      const countCheck = await client.query(
        `
        SELECT stock_count_id, count_no, status
        FROM inv.stock_count
        WHERE count_no = $1
        FOR UPDATE;
        `,
        [countNo]
      );

      if (countCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Stock count not found."
        });
      }

      if (countCheck.rows[0].status !== "OPEN") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Only OPEN stock counts can be posted."
        });
      }

      const postResult = await client.query(
        `
        SELECT inv.post_stock_count_by_no($1, $2) AS posted_movement_id;
        `,
        [countNo, reason_code]
      );

      const postedStockCount = await client.query(
        `
        SELECT
          sc.stock_count_id,
          sc.count_no,
          sc.count_date,
          sc.location_id,
          loc.location_code,
          loc.location_name,
          sc.status,
          sc.notes,
          sc.created_by,
          sc.created_at,
          sc.posted_movement_id
        FROM inv.stock_count sc
        LEFT JOIN app.location loc
          ON loc.location_id = sc.location_id
        WHERE sc.count_no = $1;
        `,
        [countNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Stock count posted successfully.",
        posted_movement_id: postResult.rows[0].posted_movement_id,
        data: postedStockCount.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to post stock count.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/stock-counts/:countNo
 * Delete OPEN stock count.
 */
router.delete(
  "/:countNo",
  requireAuth,
  requirePermission("DELETE"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { countNo } = req.params;

      await client.query("BEGIN");

      const countCheck = await client.query(
        `
        SELECT stock_count_id, count_no, status
        FROM inv.stock_count
        WHERE count_no = $1
        FOR UPDATE;
        `,
        [countNo]
      );

      if (countCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Stock count not found."
        });
      }

      if (countCheck.rows[0].status !== "OPEN") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Only OPEN stock counts can be deleted."
        });
      }

      await client.query(
        `
        DELETE FROM inv.stock_count_line
        WHERE stock_count_id = $1;
        `,
        [countCheck.rows[0].stock_count_id]
      );

      await client.query(
        `
        DELETE FROM inv.stock_count
        WHERE stock_count_id = $1;
        `,
        [countCheck.rows[0].stock_count_id]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Stock count deleted successfully.",
        count_no: countNo
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to delete stock count.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

export default router;