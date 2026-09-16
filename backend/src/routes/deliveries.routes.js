import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

/**
 * GET /api/deliveries
 * Lists deliveries with sales order, customer, location, and totals.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        d.delivery_id,
        d.delivery_no,
        d.customer_id,
        c.party_name AS customer_name,
        d.so_id,
        so.so_no,
        d.delivery_date,
        d.location_id,
        loc.location_name,
        d.status,
        d.is_posted,
        d.posted_movement_id,
        d.posted_journal_id,
        d.created_by,
        u.full_name AS created_by_name,
        d.created_at,
        d.transaction_date,
        d.backdate_flag,
        d.backdate_reason,
        d.backdate_approved_by,
        d.backdate_approved_at,
        COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS delivery_total,
        COUNT(dl.delivery_line_id) AS line_count
      FROM sal.delivery d
      LEFT JOIN sal.sales_order so
        ON so.so_id = d.so_id
      LEFT JOIN app.party c
        ON c.party_id = d.customer_id
      LEFT JOIN app.location loc
        ON loc.location_id = d.location_id
      LEFT JOIN sec.app_user u
        ON u.user_id = d.created_by
      LEFT JOIN sal.delivery_line dl
        ON dl.delivery_id = d.delivery_id
      GROUP BY
        d.delivery_id,
        d.delivery_no,
        d.customer_id,
        c.party_name,
        d.so_id,
        so.so_no,
        d.delivery_date,
        d.location_id,
        loc.location_name,
        d.status,
        d.is_posted,
        d.posted_movement_id,
        d.posted_journal_id,
        d.created_by,
        u.full_name,
        d.created_at,
        d.transaction_date,
        d.backdate_flag,
        d.backdate_reason,
        d.backdate_approved_by,
        d.backdate_approved_at
      ORDER BY d.created_at DESC, d.delivery_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      deliveries: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load deliveries.",
      error: error.message
    });
  }
});

/**
 * GET /api/deliveries/lot-options/:deliveryLineId
 * Returns available lots for one delivery line.
 * Includes required qty and enough-stock flags so the frontend can show a clear warning.
 */
router.get("/lot-options/:deliveryLineId", async (req, res) => {
  try {
    const { deliveryLineId } = req.params;

    const lineResult = await query(
      `
      SELECT
        dl.delivery_line_id,
        dl.delivery_line_id::text AS delivery_line_id_text,
        dl.product_id,
        p.product_name,
        COALESCE(dl.sell_qty, dl.qty, 0) AS required_qty,
        d.location_id,
        loc.location_name
      FROM sal.delivery_line dl
      JOIN sal.delivery d
        ON d.delivery_id = dl.delivery_id
      LEFT JOIN inv.product p
        ON p.product_id = dl.product_id
      LEFT JOIN app.location loc
        ON loc.location_id = d.location_id
      WHERE dl.delivery_line_id::text = $1;
      `,
      [deliveryLineId]
    );

    if (lineResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery line not found."
      });
    }

    const line = lineResult.rows[0];
    const requiredQty = Number(line.required_qty || 0);

    const optionsResult = await query(
      `
      SELECT
        delivery_line_id_text,
        lot_code,
        lot_id_key,
        expiry_date,
        qty_on_hand,
        $2::numeric AS required_qty,
        (COALESCE(qty_on_hand, 0) >= $2::numeric) AS enough_stock
      FROM sal.v_delivery_line_lot_options
      WHERE delivery_line_id_text = $1
      ORDER BY
        CASE WHEN COALESCE(qty_on_hand, 0) >= $2::numeric THEN 0 ELSE 1 END,
        expiry_date,
        lot_code;
      `,
      [deliveryLineId, requiredQty]
    );

    const availableResult = await query(
      `
      SELECT COALESCE(SUM(qty_on_hand), 0) AS available_qty
      FROM inv.v_stock_on_hand
      WHERE product_id = $1
        AND location_id = $2;
      `,
      [line.product_id, line.location_id]
    );

    const availableQty = Number(availableResult.rows[0]?.available_qty || 0);

    res.json({
      success: true,
      count: optionsResult.rowCount,
      lot_options: optionsResult.rows,
      data: optionsResult.rows,
      stock_status: {
        product_id: line.product_id,
        product_name: line.product_name,
        location_id: line.location_id,
        location_name: line.location_name,
        required_qty: requiredQty,
        available_qty: availableQty,
        enough_stock: availableQty >= requiredQty
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load delivery lot options.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/deliveries/:deliveryId
 * Gets one delivery with lines.
 */
router.get("/:deliveryId", async (req, res) => {
  try {
    const { deliveryId } = req.params;

    const headerResult = await query(
      `
      SELECT
        d.delivery_id,
        d.delivery_no,
        d.customer_id,
        c.party_name AS customer_name,
        d.so_id,
        so.so_no,
        d.delivery_date,
        d.location_id,
        loc.location_name,
        d.status,
        d.is_posted,
        d.posted_movement_id,
        d.posted_journal_id,
        d.created_by,
        u.full_name AS created_by_name,
        d.created_at,
        d.transaction_date,
        d.backdate_flag,
        d.backdate_reason,
        d.backdate_approved_by,
        d.backdate_approved_at,
        COALESCE(t.delivery_total, 0) AS delivery_total,
        COALESCE(t.line_count, 0) AS line_count
      FROM sal.delivery d
      LEFT JOIN sal.sales_order so
        ON so.so_id = d.so_id
      LEFT JOIN app.party c
        ON c.party_id = d.customer_id
      LEFT JOIN app.location loc
        ON loc.location_id = d.location_id
      LEFT JOIN sec.app_user u
        ON u.user_id = d.created_by
      LEFT JOIN (
        SELECT
          delivery_id,
          COALESCE(SUM(COALESCE(sell_qty, qty, 0) * COALESCE(unit_price, 0)), 0) AS delivery_total,
          COUNT(delivery_line_id) AS line_count
        FROM sal.delivery_line
        GROUP BY delivery_id
      ) t
        ON t.delivery_id = d.delivery_id
      WHERE d.delivery_id = $1;
      `,
      [deliveryId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found."
      });
    }

    const linesResult = await query(
      `
      SELECT
        dl.delivery_line_id,
        dl.delivery_line_id::text AS delivery_line_id_text,
        dl.delivery_id,
        dl.so_line_id,
        dl.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        dl.lot_id,
        l.lot_code,
        dl.qty,
        dl.sell_qty,
        dl.sell_uom_code,
        dl.unit_price,
        dl.pieces_per_carton,
        COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0) AS line_total
      FROM sal.delivery_line dl
      LEFT JOIN inv.product p
        ON p.product_id = dl.product_id
      LEFT JOIN inv.lot l
        ON l.lot_id = dl.lot_id
      WHERE dl.delivery_id = $1
      ORDER BY p.product_name;
      `,
      [deliveryId]
    );

    res.json({
      success: true,
      delivery: headerResult.rows[0],
      lines: linesResult.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load delivery.",
      error: error.message
    });
  }
});

/**
 * POST /api/deliveries
 * Creates delivery from an existing sales order.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_DELIVERY"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { so_id, delivery_date, location_id, customer_id, lines, transaction_date, backdate_flag, backdate_reason } = req.body || {};
      const { created_by } = req.body || {};

      if (!so_id) {
        return res.status(400).json({
          success: false,
          message: "Sales order is required."
        });
      }

      if (!delivery_date) {
        return res.status(400).json({
          success: false,
          message: "Delivery date is required."
        });
      }

      if (!location_id) {
        return res.status(400).json({
          success: false,
          message: "Delivery location is required."
        });
      }

      // Backdate validation logic
      const todayStr = new Date().toISOString().split('T')[0];
      const finalTransactionDate = transaction_date || delivery_date;
      const isBackdated = backdate_flag === true || (finalTransactionDate && finalTransactionDate < todayStr);
      const finalBackdateFlag = isBackdated;
      const finalBackdateReason = isBackdated ? backdate_reason : null;
      const finalBackdateApprovedBy = isBackdated ? (req.user?.user_id || null) : null;
      const finalBackdateApprovedAt = isBackdated ? new Date() : null;

      if (isBackdated) {
        const { getUserRoles } = await import("../middleware/permissions.js");
        const roles = getUserRoles(req);
        if (!roles.includes("ADMIN") && !roles.includes("MANAGER")) {
          return res.status(403).json({
            success: false,
            message: "Only ADMIN or MANAGER roles are authorized to create backdated deliveries."
          });
        }
        if (!finalBackdateReason || !finalBackdateReason.trim()) {
          return res.status(400).json({
            success: false,
            message: "A backdate reason must be provided for backdated deliveries."
          });
        }
      }

      await client.query("BEGIN");

      const soResult = await client.query(
        `
        SELECT
          so_id,
          so_no,
          customer_id,
          status
        FROM sal.sales_order
        WHERE so_id = $1;
        `,
        [so_id]
      );

      if (soResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Sales order not found."
        });
      }

      const salesOrder = soResult.rows[0];
      const finalCustomerId = customer_id || salesOrder.customer_id;

      if (!finalCustomerId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Customer is required."
        });
      }

      const lineCheck = await client.query(
        `
        SELECT COUNT(*)::int AS line_count
        FROM sal.sales_order_line
        WHERE so_id = $1;
        `,
        [so_id]
      );

      if (lineCheck.rows[0].line_count <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Sales order has no lines."
        });
      }

      const headerResult = await client.query(
        `
        INSERT INTO sal.delivery (
          delivery_id,
          delivery_no,
          customer_id,
          delivery_date,
          so_id,
          status,
          created_by,
          created_at,
          sales_batch_id,
          is_posted,
          location_id,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at
        )
        VALUES (
          gen_random_uuid(),
          'DEL-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
          $1,
          $2,
          $3,
          'DELIVERED',
          $4,
          now(),
          NULL,
          false,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
        RETURNING
          delivery_id,
          delivery_no,
          customer_id,
          delivery_date,
          so_id,
          status,
          created_by,
          created_at,
          sales_batch_id,
          is_posted,
          location_id,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at;
        `,
        [
          finalCustomerId,
          delivery_date,
          so_id,
          created_by || req.user?.user_id || null,
          location_id,
          finalTransactionDate,
          finalBackdateFlag,
          finalBackdateReason,
          finalBackdateApprovedBy,
          finalBackdateApprovedAt
        ]
      );

      const delivery = headerResult.rows[0];
      let linesResult;

      if (Array.isArray(lines) && lines.length > 0) {
        const createdLines = [];

        for (const line of lines) {
          if (!line.product_id) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Each delivery line requires product_id."
            });
          }

          if (Number(line.qty) <= 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Each delivery line qty must be greater than zero."
            });
          }

          if (Number(line.unit_price) < 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Unit price cannot be negative."
            });
          }

          const lineResult = await client.query(
            `
            INSERT INTO sal.delivery_line (
              delivery_line_id,
              delivery_id,
              so_line_id,
              product_id,
              lot_id,
              qty,
              unit_price,
              sell_qty,
              sell_uom_code,
              pieces_per_carton
            )
            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9
            )
            RETURNING
              delivery_line_id,
              delivery_line_id::text AS delivery_line_id_text,
              delivery_id,
              so_line_id,
              product_id,
              lot_id,
              qty,
              sell_qty,
              sell_uom_code,
              unit_price,
              pieces_per_carton,
              COALESCE(sell_qty, qty, 0) * COALESCE(unit_price, 0) AS line_total;
            `,
            [
              delivery.delivery_id,
              line.so_line_id || null,
              line.product_id,
              line.lot_id || null,
              Number(line.qty),
              Number(line.unit_price),
              line.sell_qty === undefined || line.sell_qty === null
                ? null
                : Number(line.sell_qty),
              line.sell_uom_code || "KG",
              line.pieces_per_carton === undefined || line.pieces_per_carton === null
                ? null
                : Number(line.pieces_per_carton)
            ]
          );

          createdLines.push(lineResult.rows[0]);
        }

        linesResult = { rows: createdLines };
      } else {
        linesResult = await client.query(
          `
          INSERT INTO sal.delivery_line (
            delivery_line_id,
            delivery_id,
            so_line_id,
            product_id,
            qty,
            sell_qty,
            sell_uom_code,
            unit_price,
            pieces_per_carton
          )
          SELECT
            gen_random_uuid(),
            $1,
            sol.so_line_id,
            sol.product_id,
            COALESCE(sol.qty, sol.sell_qty),
            COALESCE(sol.sell_qty, sol.qty),
            COALESCE(sol.sell_uom_code, 'KG'),
            sol.unit_price,
            sol.pieces_per_carton
          FROM sal.sales_order_line sol
          WHERE sol.so_id = $2
          RETURNING
            delivery_line_id,
            delivery_line_id::text AS delivery_line_id_text,
            delivery_id,
            so_line_id,
            product_id,
            lot_id,
            qty,
            sell_qty,
            sell_uom_code,
            unit_price,
            pieces_per_carton,
            COALESCE(sell_qty, qty, 0) * COALESCE(unit_price, 0) AS line_total;
          `,
          [delivery.delivery_id, so_id]
        );
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Delivery created successfully.",
        delivery,
        lines: linesResult.rows
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create delivery.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * PATCH /api/deliveries/:deliveryId/location
 * Updates delivery location.
 */
router.patch(
  "/:deliveryId/location",
  requireAuth,
  requirePermission("CREATE_DELIVERY"),
  async (req, res) => {
    try {
      const { deliveryId } = req.params;
      const { location_id } = req.body || {};

      if (!location_id) {
        return res.status(400).json({
          success: false,
          message: "Location is required."
        });
      }

      const result = await query(
        `
        UPDATE sal.delivery
        SET location_id = $1
        WHERE delivery_id = $2
          AND COALESCE(is_posted, false) = false
        RETURNING
          delivery_id,
          delivery_no,
          location_id,
          status,
          is_posted;
        `,
        [location_id, deliveryId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Delivery not found or already posted."
        });
      }

      res.json({
        success: true,
        message: "Delivery location updated.",
        delivery: result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to update delivery location.",
        error: error.message
      });
    }
  }
);

/**
 * PATCH /api/deliveries/lines/:deliveryLineId/lot
 * Assigns lot to delivery line after confirming enough stock exists in the delivery location.
 */
router.patch(
  "/lines/:deliveryLineId/lot",
  requireAuth,
  requirePermission("CREATE_DELIVERY"),
  async (req, res) => {
    try {
      const { deliveryLineId } = req.params;
      const { lot_id } = req.body || {};

      if (!lot_id) {
        return res.status(400).json({
          success: false,
          message: "Lot is required."
        });
      }

      const lineCheck = await query(
        `
        SELECT
          dl.delivery_line_id,
          dl.product_id,
          COALESCE(dl.sell_qty, dl.qty, 0) AS required_qty,
          d.location_id,
          d.delivery_no,
          d.is_posted,
          p.product_name,
          COALESCE(SUM(soh.qty_on_hand), 0) AS available_qty
        FROM sal.delivery_line dl
        JOIN sal.delivery d
          ON d.delivery_id = dl.delivery_id
        LEFT JOIN inv.product p
          ON p.product_id = dl.product_id
        LEFT JOIN inv.v_stock_on_hand soh
          ON soh.product_id = dl.product_id
         AND soh.lot_id = $2
         AND soh.location_id = d.location_id
        WHERE dl.delivery_line_id = $1
        GROUP BY
          dl.delivery_line_id,
          dl.product_id,
          COALESCE(dl.sell_qty, dl.qty, 0),
          d.location_id,
          d.delivery_no,
          d.is_posted,
          p.product_name;
        `,
        [deliveryLineId, lot_id]
      );

      if (lineCheck.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Delivery line not found."
        });
      }

      const line = lineCheck.rows[0];

      if (line.is_posted) {
        return res.status(409).json({
          success: false,
          message: "Cannot change lot on a posted delivery."
        });
      }

      const requiredQty = Number(line.required_qty || 0);
      const availableQty = Number(line.available_qty || 0);

      if (availableQty < requiredQty) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock for ${line.product_name || "this product"}. Required: ${requiredQty}, Available: ${availableQty}.`,
          required_qty: requiredQty,
          available_qty: availableQty
        });
      }

      const result = await query(
        `
        UPDATE sal.delivery_line
        SET lot_id = $1
        WHERE delivery_line_id = $2
        RETURNING
          delivery_line_id,
          delivery_id,
          product_id,
          lot_id,
          qty,
          sell_qty,
          sell_uom_code,
          unit_price;
        `,
        [lot_id, deliveryLineId]
      );

      res.json({
        success: true,
        message: "Lot assigned successfully.",
        line: result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to assign lot.",
        error: error.message,
        detail: error.detail || null
      });
    }
  }
);

/**
 * POST /api/deliveries/:deliveryNo/post
 * Posts delivery using existing PostgreSQL posting function.
 */
router.post(
  "/:deliveryNo/post",
  requireAuth,
  requirePermission("POST_DELIVERY"),
  async (req, res) => {
    try {
      const { deliveryNo } = req.params;

      const result = await query(
        "SELECT sal.post_delivery_by_no($1) AS result;",
        [deliveryNo]
      );

      res.json({
        success: true,
        message: "Delivery posted successfully.",
        result: result.rows[0]?.result ?? null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to post delivery.",
        error: error.message,
        detail: error.detail || null
      });
    }
  }
);


/**
 * DELETE /api/deliveries/:deliveryNo
 * Deletes an unposted delivery so a mistaken sales order/delivery can be corrected safely.
 */
router.delete(
  "/:deliveryNo",
  requireAuth,
  requirePermission("DELETE"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { deliveryNo } = req.params;

      await client.query("BEGIN");

      const deliveryResult = await client.query(
        `
        SELECT delivery_id, delivery_no, is_posted, status
        FROM sal.delivery
        WHERE delivery_no = $1
        FOR UPDATE;
        `,
        [deliveryNo]
      );

      if (deliveryResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Delivery not found."
        });
      }

      const delivery = deliveryResult.rows[0];

      if (delivery.is_posted) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Posted deliveries cannot be deleted. Use returns or stock adjustments instead."
        });
      }

      await client.query(
        `DELETE FROM sal.delivery_line WHERE delivery_id = $1;`,
        [delivery.delivery_id]
      );

      await client.query(
        `DELETE FROM sal.delivery WHERE delivery_id = $1;`,
        [delivery.delivery_id]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Unposted delivery deleted successfully.",
        delivery_no: deliveryNo
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to delete delivery.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

export default router;