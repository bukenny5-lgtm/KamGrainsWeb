import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

function sendStockAdjustmentError(res, error, fallbackMessage = "Stock adjustment action failed.") {
  const status = error?.statusCode || error?.status || 500;

  return res.status(status).json({
    success: false,
    message: error?.userMessage || error?.message || fallbackMessage,
    error: error?.message || fallbackMessage,
    detail: error?.detail || null,
  });
}

function makeHttpError(statusCode, message, detail = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.userMessage = message;
  error.detail = detail;
  return error;
}

function normalizeMovementType(value) {
  const text = String(value || "ADJUSTMENT").trim().toUpperCase();

  if (text === "RECEIPT_REVERSAL") return "RECEIPT_REVERSAL";
  if (text === "PRODUCT_RECLASSIFICATION") return "PRODUCT_RECLASSIFICATION";
  if (text === "DAMAGE") return "DAMAGE";

  return "ADJUSTMENT";
}

function normalizeReasonCode(value, movementType) {
  if (movementType === "PRODUCT_RECLASSIFICATION") {
    return "PRODUCT_RECLASSIFICATION";
  }

  return String(value || "").trim().toUpperCase();
}

async function ensureReasonExists(client, reasonCode) {
  const result = await client.query(
    `
    SELECT reason_code
    FROM inv.adjustment_reason
    WHERE reason_code = $1;
    `,
    [reasonCode]
  );

  if (result.rowCount === 0) {
    throw makeHttpError(
      400,
      `Invalid adjustment reason code: ${reasonCode}. Please add it in inv.adjustment_reason first.`
    );
  }
}

async function getStockAvailable(client, productId, lotId, locationId) {
  const result = await client.query(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN sml.to_location_id = $3 THEN sml.qty
        WHEN sml.from_location_id = $3 THEN -sml.qty
        ELSE 0
      END
    ), 0) AS available_qty
    FROM inv.stock_movement_line sml
    JOIN inv.stock_movement sm
      ON sm.movement_id = sml.movement_id
    WHERE sml.product_id = $1
      AND sml.lot_id IS NOT DISTINCT FROM $2;
    `,
    [productId, lotId || null, locationId]
  );

  return Number(result.rows[0]?.available_qty || 0);
}

async function getStockIdentity(client, productId, lotId, locationId) {
  const result = await client.query(
    `
    SELECT
      p.product_name,
      p.sku,
      l.lot_code,
      loc.location_code,
      loc.location_name
    FROM inv.product p
    LEFT JOIN inv.lot l
      ON l.lot_id = $2
    LEFT JOIN app.location loc
      ON loc.location_id = $3
    WHERE p.product_id = $1;
    `,
    [productId, lotId || null, locationId]
  );

  return result.rows[0] || {};
}

async function validateLineBasics(client, line, movementType, fromLocationId) {
  if (!line.product_id) {
    throw makeHttpError(400, "Each adjustment line requires a source product.");
  }

  if (!line.lot_id) {
    throw makeHttpError(400, "Each adjustment line requires a source lot.");
  }

  const qty = Number(line.qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw makeHttpError(400, "Each adjustment line quantity must be greater than zero.");
  }


  if (movementType === "PRODUCT_RECLASSIFICATION") {
    if (!line.target_product_id) {
      throw makeHttpError(400, "Target product is required for product reclassification.");
    }

    if (line.target_product_id === line.product_id) {
      throw makeHttpError(
        400,
        "Target product must be different from source product for product reclassification."
      );
    }

    if (line.target_lot_id) {
      const lotCheck = await client.query(
        `
        SELECT lot_id
        FROM inv.lot
        WHERE lot_id = $1
          AND product_id = $2;
        `,
        [line.target_lot_id, line.target_product_id]
      );

      if (lotCheck.rowCount === 0) {
        throw makeHttpError(
          400,
          "Selected target lot does not belong to the selected target product."
        );
      }
    }
  }

  const availableQty = await getStockAvailable(
    client,
    line.product_id,
    line.lot_id || null,
    fromLocationId
  );

  if (availableQty < qty) {
    const identity = await getStockIdentity(
      client,
      line.product_id,
      line.lot_id || null,
      fromLocationId
    );

    throw makeHttpError(
      409,
      `Insufficient stock for ${identity.product_name || "selected product"}, lot ${identity.lot_code || "NO LOT"}, location ${identity.location_name || identity.location_code || "selected location"}. Available: ${availableQty}, requested: ${qty}.`
    );
  }
}

async function validateSourceStock(client, lines, movementType, fromLocationId) {
  for (const line of lines) {
    await validateLineBasics(client, line, movementType, fromLocationId);
  }
}

/**
 * GET /api/stock-adjustments
 * List stock/damage/reclassification adjustments.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        da.damage_adjustment_id,
        da.document_no,
        da.reference_document_no,
        da.movement_ts,
        da.movement_type,
        da.from_location_id,
        from_loc.location_code AS from_location_code,
        from_loc.location_name AS from_location_name,
        da.to_location_id,
        to_loc.location_code AS to_location_code,
        to_loc.location_name AS to_location_name,
        da.reason_code,
        ar.reason_name,
        da.status,
        da.notes,
        da.posted_movement_id,
        da.created_by,
        u.username AS created_by_username,
        u.full_name AS created_by_name,
        da.created_at,
        COUNT(dal.damage_adjustment_line_id) AS line_count,
        COALESCE(SUM(dal.qty), 0) AS total_qty,
        COALESCE(SUM(dal.qty * COALESCE(dal.unit_cost, 0)), 0) AS total_value
      FROM inv.damage_adjustment da
      LEFT JOIN app.location from_loc
        ON from_loc.location_id = da.from_location_id
      LEFT JOIN app.location to_loc
        ON to_loc.location_id = da.to_location_id
      LEFT JOIN inv.adjustment_reason ar
        ON ar.reason_code = da.reason_code
      LEFT JOIN inv.damage_adjustment_line dal
        ON dal.damage_adjustment_id = da.damage_adjustment_id
      LEFT JOIN sec.app_user u
        ON u.user_id = da.created_by
      GROUP BY
        da.damage_adjustment_id,
        da.document_no,
        da.reference_document_no,
        da.movement_ts,
        da.movement_type,
        da.from_location_id,
        from_loc.location_code,
        from_loc.location_name,
        da.to_location_id,
        to_loc.location_code,
        to_loc.location_name,
        da.reason_code,
        ar.reason_name,
        da.status,
        da.notes,
        da.posted_movement_id,
        da.created_by,
        u.username,
        u.full_name,
        da.created_at
      ORDER BY da.created_at DESC;
    `);

    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    return sendStockAdjustmentError(res, error, "Failed to load stock adjustments.");
  }
});

/**
 * GET /api/stock-adjustments/:documentNo
 * Get one adjustment with lines.
 */
router.get("/:documentNo", async (req, res) => {
  try {
    const { documentNo } = req.params;

    const headerResult = await query(
      `
      SELECT
        da.damage_adjustment_id,
        da.document_no,
        da.reference_document_no,
        da.movement_ts,
        da.movement_type,
        da.from_location_id,
        from_loc.location_code AS from_location_code,
        from_loc.location_name AS from_location_name,
        da.to_location_id,
        to_loc.location_code AS to_location_code,
        to_loc.location_name AS to_location_name,
        da.reason_code,
        ar.reason_name,
        da.status,
        da.notes,
        da.posted_movement_id,
        da.created_by,
        u.username AS created_by_username,
        u.full_name AS created_by_name,
        da.created_at
      FROM inv.damage_adjustment da
      LEFT JOIN app.location from_loc
        ON from_loc.location_id = da.from_location_id
      LEFT JOIN app.location to_loc
        ON to_loc.location_id = da.to_location_id
      LEFT JOIN inv.adjustment_reason ar
        ON ar.reason_code = da.reason_code
      LEFT JOIN sec.app_user u
        ON u.user_id = da.created_by
      WHERE da.document_no = $1;
      `,
      [documentNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Stock adjustment not found." });
    }

    const adjustment = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        dal.damage_adjustment_line_id,
        dal.damage_adjustment_id,
        dal.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        dal.lot_id,
        l.lot_code,
        dal.target_product_id,
        tp.sku AS target_sku,
        tp.product_name AS target_product_name,
        tp.uom_code AS target_uom_code,
        dal.target_lot_id,
        tl.lot_code AS target_lot_code,
        dal.qty,
        dal.unit_cost,
        dal.qty * COALESCE(dal.unit_cost, 0) AS line_value
      FROM inv.damage_adjustment_line dal
      JOIN inv.product p
        ON p.product_id = dal.product_id
      LEFT JOIN inv.lot l
        ON l.lot_id = dal.lot_id
      LEFT JOIN inv.product tp
        ON tp.product_id = dal.target_product_id
      LEFT JOIN inv.lot tl
        ON tl.lot_id = dal.target_lot_id
      WHERE dal.damage_adjustment_id = $1
      ORDER BY p.product_name, l.lot_code;
      `,
      [adjustment.damage_adjustment_id]
    );

    res.json({
      success: true,
      data: {
        ...adjustment,
        lines: linesResult.rows,
        totals: {
          line_count: linesResult.rowCount,
          total_qty: linesResult.rows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
          total_value: linesResult.rows.reduce(
            (sum, row) => sum + Number(row.line_value || 0),
            0
          ),
        },
      },
    });
  } catch (error) {
    return sendStockAdjustmentError(res, error, "Failed to load stock adjustment.");
  }
});

/**
 * POST /api/stock-adjustments
 * Create stock adjustment, damage write-off, or product reclassification.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_STOCK_ADJUSTMENT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const body = req.body || {};
      const movementType = normalizeMovementType(body.movement_type);
      const reasonCode = normalizeReasonCode(body.reason_code, movementType);
      const fromLocationId = body.from_location_id;
      const toLocationId = movementType === "PRODUCT_RECLASSIFICATION"
        ? fromLocationId
        : body.to_location_id || null;
      const lines = Array.isArray(body.lines) ? body.lines : [];

      if (!fromLocationId) {
        throw makeHttpError(400, "Source location is required.");
      }

      if (!reasonCode) {
        throw makeHttpError(400, "Reason code is required.");
      }

      if (lines.length === 0) {
        throw makeHttpError(400, "At least one adjustment line is required.");
      }

      await client.query("BEGIN");

      await ensureReasonExists(client, reasonCode);
      await validateSourceStock(client, lines, movementType, fromLocationId);

      const finalDocumentNo =
        String(body.document_no || "").trim() ||
        `ADJ-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now()}`;

      const duplicateCheck = await client.query(
        `
        SELECT document_no
        FROM inv.damage_adjustment
        WHERE document_no = $1;
        `,
        [finalDocumentNo]
      );

      if (duplicateCheck.rowCount > 0) {
        throw makeHttpError(409, `Document number already exists: ${finalDocumentNo}`);
      }

      const headerResult = await client.query(
        `
        INSERT INTO inv.damage_adjustment (
          damage_adjustment_id,
          document_no,
          reference_document_no,
          movement_ts,
          movement_type,
          from_location_id,
          to_location_id,
          reason_code,
          status,
          notes,
          created_by,
          created_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          COALESCE($3::timestamptz, now()),
          $4,
          $5,
          $6,
          $7,
          'DRAFT',
          $8,
          $9,
          now()
        )
        RETURNING *;
        `,
        [
          finalDocumentNo,
          body.reference_document_no || null,
          body.movement_ts || null,
          movementType,
          fromLocationId,
          toLocationId,
          reasonCode,
          body.notes || null,
          req.user?.user_id || body.created_by || null,
        ]
      );

      const adjustment = headerResult.rows[0];
      const createdLines = [];

      for (const line of lines) {
        const costResult = await client.query(
          `
          SELECT unit_cost
          FROM inv.v_lot_unit_cost
          WHERE lot_id = $1;
          `,
          [line.lot_id]
        );

        if (costResult.rowCount === 0) {
          throw makeHttpError(400, "No inventory cost found for the selected lot.");
        }

        const unitCost = costResult.rows[0].unit_cost;

        const lineResult = await client.query(
          `
          INSERT INTO inv.damage_adjustment_line (
            damage_adjustment_line_id,
            damage_adjustment_id,
            product_id,
            lot_id,
            target_product_id,
            target_lot_id,
            qty,
            unit_cost
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
          RETURNING *;
          `,
          [
            adjustment.damage_adjustment_id,
            line.product_id,
            line.lot_id || null,
            movementType === "PRODUCT_RECLASSIFICATION" ? line.target_product_id : null,
            movementType === "PRODUCT_RECLASSIFICATION" ? line.target_lot_id || null : null,
            Number(line.qty),
            unitCost,
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        message:
          movementType === "PRODUCT_RECLASSIFICATION"
            ? "Product reclassification draft created successfully. Review and post to update stock."
            : "Stock adjustment draft created successfully. Review and post to update stock.",
        data: { ...adjustment, lines: createdLines },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return sendStockAdjustmentError(res, error, "Failed to create stock adjustment.");
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/stock-adjustments/:documentNo/post
 * Post adjustment and create stock movement lines.
 */
router.post(
  "/:documentNo/post",
  requireAuth,
  requirePermission("POST_STOCK_ADJUSTMENT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { documentNo } = req.params;

      await client.query("BEGIN");

      const adjustmentCheck = await client.query(
        `
        SELECT damage_adjustment_id, document_no, status, posted_movement_id
        FROM inv.damage_adjustment
        WHERE document_no = $1
        FOR UPDATE;
        `,
        [documentNo]
      );

      if (adjustmentCheck.rowCount === 0) {
        throw makeHttpError(404, "Stock adjustment not found.");
      }

      const adjustment = adjustmentCheck.rows[0];

      if (adjustment.status !== "DRAFT") {
        throw makeHttpError(409, "Only DRAFT stock adjustments can be posted.");
      }

      const postResult = await client.query(
        `
        SELECT inv.post_damage_adjustment_by_no($1) AS posted_movement_id;
        `,
        [documentNo]
      );

      const postedAdjustment = await client.query(
        `
        SELECT
          da.damage_adjustment_id,
          da.document_no,
          da.reference_document_no,
          da.movement_ts,
          da.movement_type,
          da.from_location_id,
          from_loc.location_code AS from_location_code,
          from_loc.location_name AS from_location_name,
          da.to_location_id,
          to_loc.location_code AS to_location_code,
          to_loc.location_name AS to_location_name,
          da.reason_code,
          ar.reason_name,
          da.status,
          da.notes,
          da.posted_movement_id,
          da.created_by,
          da.created_at
        FROM inv.damage_adjustment da
        LEFT JOIN app.location from_loc
          ON from_loc.location_id = da.from_location_id
        LEFT JOIN app.location to_loc
          ON to_loc.location_id = da.to_location_id
        LEFT JOIN inv.adjustment_reason ar
          ON ar.reason_code = da.reason_code
        WHERE da.document_no = $1;
        `,
        [documentNo]
      );

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Stock adjustment posted successfully.",
        posted_movement_id: postResult.rows[0].posted_movement_id,
        data: postedAdjustment.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return sendStockAdjustmentError(res, error, "Failed to post stock adjustment.");
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/stock-adjustments/:documentNo
 * Delete DRAFT adjustment only.
 */
router.delete(
  "/:documentNo",
  requireAuth,
  requirePermission("DELETE"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { documentNo } = req.params;

      await client.query("BEGIN");

      const adjustmentCheck = await client.query(
        `
        SELECT damage_adjustment_id, document_no, status
        FROM inv.damage_adjustment
        WHERE document_no = $1
        FOR UPDATE;
        `,
        [documentNo]
      );

      if (adjustmentCheck.rowCount === 0) {
        throw makeHttpError(404, "Stock adjustment not found.");
      }

      if (adjustmentCheck.rows[0].status !== "DRAFT") {
        throw makeHttpError(409, "Only DRAFT stock adjustments can be deleted.");
      }

      await client.query(
        `
        DELETE FROM inv.damage_adjustment_line
        WHERE damage_adjustment_id = $1;
        `,
        [adjustmentCheck.rows[0].damage_adjustment_id]
      );

      await client.query(
        `
        DELETE FROM inv.damage_adjustment
        WHERE damage_adjustment_id = $1;
        `,
        [adjustmentCheck.rows[0].damage_adjustment_id]
      );

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Draft stock adjustment deleted successfully.",
        data: adjustmentCheck.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      return sendStockAdjustmentError(res, error, "Failed to delete stock adjustment.");
    } finally {
      client.release();
    }
  }
);

export default router;
