import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { refreshPurchaseOrderStatus } from "../utils/purchaseOrderStatus.js";

const router = express.Router();

/**
 * GET /api/purchase-orders
 * Lists purchase orders with supplier name and total amount.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        po.po_id,
        po.po_no,
        po.supplier_id,
        s.party_name AS supplier_name,
        po.order_date,
        po.expected_date,
        po.status,
        po.created_by,
        u.full_name AS created_by_name,
        po.created_at,
        COALESCE(SUM(pol.qty * pol.unit_price), 0) AS po_total,
        COUNT(pol.po_line_id) AS line_count
      FROM pur.purchase_order po
      LEFT JOIN app.party s
        ON s.party_id = po.supplier_id
      LEFT JOIN sec.app_user u
        ON u.user_id = po.created_by
      LEFT JOIN pur.purchase_order_line pol
        ON pol.po_id = po.po_id
      GROUP BY
        po.po_id,
        po.po_no,
        po.supplier_id,
        s.party_name,
        po.order_date,
        po.expected_date,
        po.status,
        po.created_by,
        u.full_name,
        po.created_at
      ORDER BY po.created_at DESC, po.po_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      purchase_orders: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load purchase orders.",
      error: error.message
    });
  }
});

/**
 * GET /api/purchase-orders/reports/summary
 * Dashboard-ready purchase order summary.
 */
router.get("/reports/summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        po.po_id,
        po.po_no,
        po.order_date,
        po.expected_date,
        po.status,

        po.supplier_id,
        s.party_name AS supplier_name,

        COUNT(pol.po_line_id) AS line_count,
        COALESCE(SUM(pol.qty), 0) AS total_ordered_qty,
        COALESCE(SUM(pol.qty * pol.unit_price), 0) AS total_po_value,

        COALESCE(grn_summary.grn_count, 0) AS grn_count,
        COALESCE(grn_summary.total_received_qty, 0) AS total_received_qty,
        COALESCE(grn_summary.total_received_value, 0) AS total_received_value,

        CASE
          WHEN COALESCE(SUM(pol.qty), 0) = 0 THEN 0
          ELSE ROUND(
            (
              COALESCE(grn_summary.total_received_qty, 0)
              / COALESCE(SUM(pol.qty), 0)
            ) * 100,
            2
          )
        END AS receipt_percentage,

        po.created_by,
        u.full_name AS created_by_name,
        po.created_at

      FROM pur.purchase_order po
      LEFT JOIN app.party s
        ON s.party_id = po.supplier_id
      LEFT JOIN sec.app_user u
        ON u.user_id = po.created_by
      LEFT JOIN pur.purchase_order_line pol
        ON pol.po_id = po.po_id

      LEFT JOIN (
        SELECT
          gr.po_id,
          COUNT(DISTINCT gr.grn_id) AS grn_count,
          COALESCE(SUM(grl.qty_received), 0) AS total_received_qty,
          COALESCE(SUM(grl.qty_received * grl.unit_cost), 0) AS total_received_value
        FROM pur.goods_receipt gr
        LEFT JOIN pur.goods_receipt_line grl
          ON grl.grn_id = gr.grn_id
        WHERE COALESCE(UPPER(gr.status), '') <> 'CANCELLED'
        GROUP BY gr.po_id
      ) grn_summary
        ON grn_summary.po_id = po.po_id

      GROUP BY
        po.po_id,
        po.po_no,
        po.order_date,
        po.expected_date,
        po.status,
        po.supplier_id,
        s.party_name,
        grn_summary.grn_count,
        grn_summary.total_received_qty,
        grn_summary.total_received_value,
        po.created_by,
        u.full_name,
        po.created_at

      ORDER BY po.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load purchase order summary report.",
      error: error.message
    });
  }
});

/**
 * GET /api/purchase-orders/:poId
 * Gets one purchase order with lines.
 */
router.get("/:poId", async (req, res) => {
  try {
    const { poId } = req.params;

    const headerResult = await query(
      `
      SELECT
        po.po_id,
        po.po_no,
        po.supplier_id,
        s.party_name AS supplier_name,
        po.order_date,
        po.expected_date,
        po.status,
        po.created_by,
        u.full_name AS created_by_name,
        po.created_at
      FROM pur.purchase_order po
      LEFT JOIN app.party s
        ON s.party_id = po.supplier_id
      LEFT JOIN sec.app_user u
        ON u.user_id = po.created_by
      WHERE po.po_id = $1;
      `,
      [poId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Purchase order not found."
      });
    }

    const linesResult = await query(
      `
      SELECT
        pol.po_line_id,
        pol.po_id,
        pol.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        pol.qty,
        pol.unit_price,
        pol.qty * pol.unit_price AS line_total
      FROM pur.purchase_order_line pol
      LEFT JOIN inv.product p
        ON p.product_id = pol.product_id
      WHERE pol.po_id = $1
      ORDER BY p.product_name;
      `,
      [poId]
    );

    const totalQty = linesResult.rows.reduce(
      (sum, row) => sum + Number(row.qty || 0),
      0
    );
    const totalValue = linesResult.rows.reduce(
      (sum, row) => sum + Number(row.line_total || 0),
      0
    );

    res.json({
      success: true,
      purchase_order: headerResult.rows[0],
      lines: linesResult.rows,
      totals: {
        line_count: linesResult.rowCount,
        total_qty: totalQty,
        total_value: totalValue
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load purchase order.",
      error: error.message
    });
  }
});

/**
 * POST /api/purchase-orders
 * Creates a purchase order with lines.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_PURCHASE_ORDER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        supplier_id,
        order_date,
        expected_date,
        created_by,
        lines
      } = req.body || {};

      if (!supplier_id) {
        return res.status(400).json({
          success: false,
          message: "Supplier is required."
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
          message: "At least one purchase order line is required."
        });
      }

      for (const line of lines) {
        if (
          !line.product_id ||
          Number(line.qty) <= 0 ||
          Number(line.unit_price) < 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Each line requires product_id, qty greater than 0, and unit_price."
          });
        }
      }

      await client.query("BEGIN");

      const headerResult = await client.query(
        `
        INSERT INTO pur.purchase_order (
          po_id,
          po_no,
          supplier_id,
          order_date,
          expected_date,
          status,
          created_by,
          created_at
        )
        VALUES (
          gen_random_uuid(),
          'PO-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
          $1,
          $2,
          $3,
          'OPEN',
          $4,
          now()
        )
        RETURNING
          po_id,
          po_no,
          supplier_id,
          order_date,
          expected_date,
          status,
          created_by,
          created_at;
        `,
        [
          supplier_id,
          order_date,
          expected_date || order_date,
          created_by || req.user?.user_id || null
        ]
      );

      const po = headerResult.rows[0];

      const createdLines = [];

      for (const line of lines) {
        const lineResult = await client.query(
          `
          INSERT INTO pur.purchase_order_line (
            po_line_id,
            po_id,
            product_id,
            qty,
            unit_price
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4
          )
          RETURNING
            po_line_id,
            po_id,
            product_id,
            qty,
            unit_price,
            qty * unit_price AS line_total;
          `,
          [
            po.po_id,
            line.product_id,
            Number(line.qty),
            Number(line.unit_price)
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Purchase order created successfully.",
        purchase_order: po,
        lines: createdLines
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create purchase order.",
        error: error.message
      });
    } finally {
      client.release();
    }
  }
);


/**
 * PATCH /api/purchase-orders/:poId/refresh-status
 * Recalculates PO status from posted GRNs, supplier invoices, and supplier payments.
 */
router.patch(
  "/:poId/refresh-status",
  requireAuth,
  requirePermission("CREATE_PURCHASE_ORDER"),
  async (req, res) => {
    try {
      const { poId } = req.params;

      const result = await refreshPurchaseOrderStatus({ query }, poId);

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Purchase order not found.",
        });
      }

      res.json({
        success: true,
        message: "Purchase order status refreshed successfully.",
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to refresh purchase order status.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

export default router;