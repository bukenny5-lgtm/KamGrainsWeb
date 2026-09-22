import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserRoles, requirePermission } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

const router = express.Router();
router.use(requireAuth, requireLocationAccessWhenSpecified);
const branchWide = (req) => getUserRoles(req).includes("HEAD_OFFICE");

/**
 * GET /api/sales-orders
 * Lists sales orders with customer name and total amount.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        so.so_id,
        so.branch_id,
        so.so_no,
        so.customer_id,
        c.party_name AS customer_name,
        so.order_date,
        so.status,
        so.created_by,
        u.full_name AS created_by_name,
        so.created_at,
        COALESCE(SUM(sol.sell_qty * sol.unit_price), 0) AS so_total,
        COUNT(sol.so_line_id) AS line_count
      FROM sal.sales_order so
      LEFT JOIN app.party c
        ON c.party_id = so.customer_id
      LEFT JOIN sec.app_user u
        ON u.user_id = so.created_by
      LEFT JOIN sal.sales_order_line sol
        ON sol.so_id = so.so_id
      WHERE ($1::boolean OR so.branch_id=$2)
      GROUP BY
        so.so_id,
        so.branch_id,
        so.so_no,
        so.customer_id,
        c.party_name,
        so.order_date,
        so.status,
        so.created_by,
        u.full_name,
        so.created_at
      ORDER BY so.created_at DESC, so.so_no DESC;
    `, [branchWide(req), req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      sales_orders: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load sales orders.",
      error: error.message
    });
  }
});

/**
 * GET /api/sales-orders/:soId
 * Gets one sales order with lines.
 */
router.get("/:soId", async (req, res) => {
  try {
    const { soId } = req.params;

    const headerResult = await query(
      `
      SELECT
        so.so_id,
        so.branch_id,
        so.so_no,
        so.customer_id,
        c.party_name AS customer_name,
        so.order_date,
        so.status,
        so.created_by,
        u.full_name AS created_by_name,
        so.created_at,
        (
          SELECT COUNT(*)::int
          FROM sal.delivery d
          WHERE d.so_id = so.so_id
        ) AS delivery_count,
        (
          SELECT COALESCE(SUM(COALESCE(sol2.sell_qty, sol2.qty, 0) * COALESCE(sol2.unit_price, 0)), 0)
          FROM sal.sales_order_line sol2
          WHERE sol2.so_id = so.so_id
        ) AS so_total,
        (
          SELECT COUNT(sol3.so_line_id)
          FROM sal.sales_order_line sol3
          WHERE sol3.so_id = so.so_id
        ) AS line_count
      FROM sal.sales_order so
      LEFT JOIN app.party c
        ON c.party_id = so.customer_id
      LEFT JOIN sec.app_user u
        ON u.user_id = so.created_by
      WHERE so.so_id = $1 AND ($2::boolean OR so.branch_id=$3);
      `,
      [soId, branchWide(req), req.branchId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Sales order not found."
      });
    }

    const linesResult = await query(
      `
      SELECT
        sol.so_line_id,
        sol.so_id,
        sol.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        sol.qty,
        sol.sell_qty,
        sol.sell_uom_code,
        sol.unit_price,
        sol.pieces_per_carton,
        COALESCE(sol.sell_qty, sol.qty, 0) * COALESCE(sol.unit_price, 0) AS line_total
      FROM sal.sales_order_line sol
      LEFT JOIN inv.product p
        ON p.product_id = sol.product_id
      WHERE sol.so_id = $1
      ORDER BY p.product_name;
      `,
      [soId]
    );

    res.json({
      success: true,
      sales_order: headerResult.rows[0],
      lines: linesResult.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load sales order.",
      error: error.message
    });
  }
});

/**
 * POST /api/sales-orders
 *
 * KAM GRAINS logic:
 * - sell_qty = quantity sold in KG
 * - sell_uom_code = KG
 * - qty = same as sell_qty because beans are KG-based
 * - pieces_per_carton = null
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_SALES_ORDER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        customer_id,
        order_date,
        created_by,
        lines
      } = req.body || {};

      if (!customer_id) {
        return res.status(400).json({
          success: false,
          message: "Customer is required."
        });
      }

      if (!order_date) {
        return res.status(400).json({
          success: false,
          message: "Order date is required."
        });
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one sales order line is required."
        });
      }

      for (const line of lines) {
        if (!line.product_id) {
          return res.status(400).json({
            success: false,
            message: "Each line requires product_id."
          });
        }

        if (Number(line.sell_qty) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Sell quantity must be greater than zero."
          });
        }

        if (Number(line.unit_price) < 0) {
          return res.status(400).json({
            success: false,
            message: "Unit price cannot be negative."
          });
        }
      }

      await client.query("BEGIN");

      const headerResult = await client.query(
        `
        INSERT INTO sal.sales_order (
          so_id,
          branch_id,
          so_no,
          customer_id,
          order_date,
          status,
          created_by,
          created_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          'SO-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
          $2,
          $3,
          'OPEN',
          $4,
          now()
        )
        RETURNING
          so_id,
          branch_id,
          so_no,
          customer_id,
          order_date,
          status,
          created_by,
          created_at;
        `,
        [
          req.branchId,
          customer_id,
          order_date,
          created_by || req.user?.user_id || null
        ]
      );

      const so = headerResult.rows[0];
      const createdLines = [];

      for (const line of lines) {
        const sellQty = Number(line.sell_qty);
        const unitPrice = Number(line.unit_price);

        const lineResult = await client.query(
          `
          INSERT INTO sal.sales_order_line (
            so_line_id,
            so_id,
            product_id,
            qty,
            sell_qty,
            sell_uom_code,
            unit_price,
            pieces_per_carton
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $3,
            'KG',
            $4,
            NULL
          )
          RETURNING
            so_line_id,
            so_id,
            product_id,
            qty,
            sell_qty,
            sell_uom_code,
            unit_price,
            pieces_per_carton,
            sell_qty * unit_price AS line_total;
          `,
          [
            so.so_id,
            line.product_id,
            sellQty,
            unitPrice
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Sales order created successfully.",
        sales_order: so,
        lines: createdLines
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create sales order.",
        error: error.message
      });
    } finally {
      client.release();
    }
  }
);


/**
 * PATCH /api/sales-orders/:soId/cancel
 * Cancels an OPEN sales order that has no posted delivery.
 * If an unposted delivery exists, delete/cancel that delivery first.
 */
router.patch(
  "/:soId/cancel",
  requireAuth,
  requirePermission("CREATE_SALES_ORDER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { soId } = req.params;

      await client.query("BEGIN");

      const soResult = await client.query(
        `
        SELECT so_id, so_no, status
        FROM sal.sales_order
        WHERE so_id = $1 AND ($2::boolean OR branch_id=$3)
        FOR UPDATE;
        `,
        [soId, branchWide(req), req.branchId]
      );

      if (soResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Sales order not found."
        });
      }

      const salesOrder = soResult.rows[0];
      const currentStatus = String(salesOrder.status || "").toUpperCase();

      if (["CANCELLED", "CANCELED", "CLOSED", "COMPLETED"].includes(currentStatus)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Sales order ${salesOrder.so_no} is already ${salesOrder.status}.`
        });
      }

      const deliveryCheck = await client.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE COALESCE(is_posted, false) = true)::int AS posted_count,
          COUNT(*) FILTER (WHERE COALESCE(is_posted, false) = false)::int AS unposted_count
        FROM sal.delivery
        WHERE so_id = $1;
        `,
        [soId]
      );

      const postedCount = Number(deliveryCheck.rows[0]?.posted_count || 0);
      const unpostedCount = Number(deliveryCheck.rows[0]?.unposted_count || 0);

      if (postedCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message:
            "This sales order already has a posted delivery. It cannot be cancelled directly. Use returns/adjustments instead."
        });
      }

      if (unpostedCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message:
            "This sales order has an unposted delivery. Delete/cancel the unposted delivery first, then cancel the sales order."
        });
      }

      const result = await client.query(
        `
        UPDATE sal.sales_order
        SET status = 'CANCELLED'
        WHERE so_id = $1 AND ($2::boolean OR branch_id=$3)
        RETURNING so_id, so_no, customer_id, order_date, status, created_by, created_at;
        `,
        [soId, branchWide(req), req.branchId]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Sales order cancelled successfully.",
        sales_order: result.rows[0],
        data: result.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to cancel sales order.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * PATCH /api/sales-orders/:soId
 * Updates an OPEN sales order before any delivery exists.
 */
router.patch(
  "/:soId",
  requireAuth,
  requirePermission("CREATE_SALES_ORDER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { soId } = req.params;
      const {
        customer_id,
        order_date,
        lines
      } = req.body || {};

      if (!customer_id) {
        return res.status(400).json({
          success: false,
          message: "Customer is required."
        });
      }

      if (!order_date) {
        return res.status(400).json({
          success: false,
          message: "Order date is required."
        });
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one sales order line is required."
        });
      }

      for (const line of lines) {
        if (!line.product_id) {
          return res.status(400).json({
            success: false,
            message: "Each line requires product_id."
          });
        }

        if (Number(line.sell_qty) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Sell quantity must be greater than zero."
          });
        }

        if (Number(line.unit_price) < 0) {
          return res.status(400).json({
            success: false,
            message: "Unit price cannot be negative."
          });
        }
      }

      await client.query("BEGIN");

      const soResult = await client.query(
        `
        SELECT so_id, so_no, status
        FROM sal.sales_order
        WHERE so_id = $1 AND ($2::boolean OR branch_id=$3)
        FOR UPDATE;
        `,
        [soId, branchWide(req), req.branchId]
      );

      if (soResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Sales order not found."
        });
      }

      const salesOrder = soResult.rows[0];
      const currentStatus = String(salesOrder.status || "").toUpperCase();

      if (currentStatus !== "OPEN") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Only OPEN sales orders can be edited. Current status: ${salesOrder.status}.`
        });
      }

      const deliveryCheck = await client.query(
        `
        SELECT COUNT(*)::int AS delivery_count
        FROM sal.delivery
        WHERE so_id = $1;
        `,
        [soId]
      );

      if (Number(deliveryCheck.rows[0]?.delivery_count || 0) > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "This sales order already has a delivery and cannot be edited."
        });
      }

      const headerResult = await client.query(
        `
        UPDATE sal.sales_order
        SET customer_id = $2,
            order_date = $3
        WHERE so_id = $1 AND ($4::boolean OR branch_id=$5)
        RETURNING so_id, so_no, customer_id, order_date, status, created_by, created_at;
        `,
        [soId, customer_id, order_date, branchWide(req), req.branchId]
      );

      await client.query(
        `
        DELETE FROM sal.sales_order_line
        WHERE so_id = $1;
        `,
        [soId]
      );

      const updatedLines = [];

      for (const line of lines) {
        const sellQty = Number(line.sell_qty);
        const unitPrice = Number(line.unit_price);

        const lineResult = await client.query(
          `
          INSERT INTO sal.sales_order_line (
            so_line_id,
            so_id,
            product_id,
            qty,
            sell_qty,
            sell_uom_code,
            unit_price,
            pieces_per_carton
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $3,
            'KG',
            $4,
            NULL
          )
          RETURNING
            so_line_id,
            so_id,
            product_id,
            qty,
            sell_qty,
            sell_uom_code,
            unit_price,
            pieces_per_carton,
            sell_qty * unit_price AS line_total;
          `,
          [
            soId,
            line.product_id,
            sellQty,
            unitPrice
          ]
        );

        updatedLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Sales order updated successfully.",
        sales_order: headerResult.rows[0],
        lines: updatedLines
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to update sales order.",
        error: error.message
      });
    } finally {
      client.release();
    }
  }
);

export default router;
