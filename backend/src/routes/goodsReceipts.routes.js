import express from "express";
import { pool, query } from "../db.js";
import { postGoodsReceiptController } from "../controllers/goodsReceipts.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { refreshPurchaseOrderStatusByGrnId } from "../utils/purchaseOrderStatus.js";

const router = express.Router();

router.post(
  "/:grnNo/post",
  requireAuth,
  requirePermission("POST_GRN"),
  postGoodsReceiptController
);

/**
 * GET /api/goods-receipts
 * List GRNs with supplier, PO and totals.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        gr.grn_id,
        gr.grn_no,
        gr.po_id,
        po.po_no,
        gr.supplier_id,
        s.party_name AS supplier_name,
        gr.receipt_date,
        gr.status,
        gr.is_posted,
        gr.location_id,
        loc.location_name,
        gr.created_by,
        u.full_name AS created_by_name,
        gr.created_at,
        COALESCE(SUM(grl.qty_received * grl.unit_cost), 0) AS grn_total,
        COUNT(grl.grn_line_id) AS line_count
      FROM pur.goods_receipt gr
      LEFT JOIN pur.purchase_order po
        ON po.po_id = gr.po_id
      LEFT JOIN app.party s
        ON s.party_id = gr.supplier_id
      LEFT JOIN app.location loc
        ON loc.location_id = gr.location_id
      LEFT JOIN sec.app_user u
        ON u.user_id = gr.created_by
      LEFT JOIN pur.goods_receipt_line grl
        ON grl.grn_id = gr.grn_id
      GROUP BY
        gr.grn_id,
        gr.grn_no,
        gr.po_id,
        po.po_no,
        gr.supplier_id,
        s.party_name,
        gr.receipt_date,
        gr.status,
        gr.is_posted,
        gr.location_id,
        loc.location_name,
        gr.created_by,
        u.full_name,
        gr.created_at
      ORDER BY gr.created_at DESC, gr.grn_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      goods_receipts: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load goods receipts.",
      error: error.message,
    });
  }
});

/**
 * GET /api/goods-receipts/reports/variance
 * GRN variance report.
 */
router.get("/reports/variance", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        grn_no,
        receipt_date,
        status,
        is_posted,
        created_by_name,
        po_no,
        supplier_name,
        sku,
        product_name,
        ordered_qty,
        qty_delivered,
        accepted_qty,
        qty_rejected,
        shortage_qty,
        excess_qty,
        variance_reason,
        variance_responsibility,
        quality_status,
        unit_cost,
        notes
      FROM pur.v_grn_variance_report
      ORDER BY receipt_date DESC, grn_no DESC, product_name;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      variance_report: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load GRN variance report.",
      error: error.message,
    });
  }
});

/**
 * GET /api/goods-receipts/reports/summary
 * Dashboard-ready GRN summary.
 */
router.get("/reports/summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        gr.grn_id,
        gr.grn_no,
        gr.receipt_date,
        gr.status,
        gr.is_posted,

        gr.po_id,
        po.po_no,

        gr.supplier_id,
        s.party_name AS supplier_name,

        gr.location_id,
        loc.location_code,
        loc.location_name,

        COUNT(grl.grn_line_id) AS line_count,
        COALESCE(SUM(grl.qty_delivered), 0) AS total_delivered_qty,
        COALESCE(SUM(grl.qty_received), 0) AS total_accepted_qty,
        COALESCE(SUM(grl.qty_rejected), 0) AS total_rejected_qty,
        COALESCE(SUM(grl.shortage_qty), 0) AS total_shortage_qty,
        COALESCE(SUM(grl.excess_qty), 0) AS total_excess_qty,
        COALESCE(SUM(grl.qty_received * grl.unit_cost), 0) AS total_grn_value,

        gr.posted_movement_id,
        gr.posted_journal_id,
        gr.created_at

      FROM pur.goods_receipt gr
      LEFT JOIN pur.purchase_order po
        ON po.po_id = gr.po_id
      LEFT JOIN app.party s
        ON s.party_id = gr.supplier_id
      LEFT JOIN app.location loc
        ON loc.location_id = gr.location_id
      LEFT JOIN pur.goods_receipt_line grl
        ON grl.grn_id = gr.grn_id

      GROUP BY
        gr.grn_id,
        gr.grn_no,
        gr.receipt_date,
        gr.status,
        gr.is_posted,
        gr.po_id,
        po.po_no,
        gr.supplier_id,
        s.party_name,
        gr.location_id,
        loc.location_code,
        loc.location_name,
        gr.posted_movement_id,
        gr.posted_journal_id,
        gr.created_at

      ORDER BY gr.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load GRN summary report.",
      error: error.message,
    });
  }
});

/**
 * GET /api/goods-receipts/:grnId
 * Get one GRN with lines.
 */
router.get("/:grnId", async (req, res) => {
  try {
    const { grnId } = req.params;

    const headerResult = await query(
      `
      SELECT
        gr.grn_id,
        gr.grn_no,
        gr.supplier_id,
        s.party_name AS supplier_name,
        gr.po_id,
        po.po_no,
        gr.receipt_date,
        gr.status,
        gr.created_by,
        u.full_name AS created_by_name,
        gr.created_at,
        gr.is_posted,
        gr.location_id,
        loc.location_code,
        loc.location_name,
        gr.posted_movement_id,
        gr.posted_journal_id
      FROM pur.goods_receipt gr
      LEFT JOIN app.party s
        ON s.party_id = gr.supplier_id
      LEFT JOIN pur.purchase_order po
        ON po.po_id = gr.po_id
      LEFT JOIN app.location loc
        ON loc.location_id = gr.location_id
      LEFT JOIN sec.app_user u
        ON u.user_id = gr.created_by
      WHERE gr.grn_id::text = $1
         OR gr.grn_no = $1;
      `,
      [grnId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Goods receipt not found.",
      });
    }

    const goodsReceipt = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        grl.grn_line_id,
        grl.grn_id,
        grl.po_line_id,
        grl.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        pol.qty AS ordered_qty,
        grl.qty_delivered,
        grl.qty_received AS accepted_qty,
        grl.qty_rejected,
        grl.shortage_qty,
        grl.excess_qty,
        grl.variance_reason,
        grl.variance_responsibility,
        grl.quality_status,
        grl.lot_id,
        l.lot_code,
        grl.unit_cost,
        grl.expiry_date,
        grl.notes,
        grl.qty_received * grl.unit_cost AS line_total
      FROM pur.goods_receipt_line grl
      LEFT JOIN pur.purchase_order_line pol
        ON pol.po_line_id = grl.po_line_id
      LEFT JOIN inv.product p
        ON p.product_id = grl.product_id
      LEFT JOIN inv.lot l
        ON l.lot_id = grl.lot_id
      WHERE grl.grn_id = $1
      ORDER BY p.product_name;
      `,
      [goodsReceipt.grn_id]
    );

    res.json({
      success: true,
      goods_receipt: goodsReceipt,
      lines: linesResult.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load goods receipt.",
      error: error.message,
    });
  }
});

/**
 * POST /api/goods-receipts
 * Creates GRN.
 *
 * Lot handling:
 * - If line.lot_id is supplied, backend validates that it belongs to the product.
 * - If line.lot_id is blank/null, backend auto-generates lot using:
 *   inv.next_lot_code(product_id)
 *   inv.get_or_create_lot(product_id, lot_code, expiry_date, NULL, 'GRN', grn_id)
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_GRN"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        po_id,
        supplier_id,
        receipt_date,
        location_id,
        created_by,
        lines,
      } = req.body || {};

      if (!po_id) {
        return res.status(400).json({
          success: false,
          message: "Purchase order is required.",
        });
      }

      if (!supplier_id) {
        return res.status(400).json({
          success: false,
          message: "Supplier is required.",
        });
      }

      if (!receipt_date) {
        return res.status(400).json({
          success: false,
          message: "Receipt date is required.",
        });
      }

      if (!location_id) {
        return res.status(400).json({
          success: false,
          message: "Receipt location is required.",
        });
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one GRN line is required.",
        });
      }

      for (const line of lines) {
        if (!line.po_line_id || !line.product_id) {
          return res.status(400).json({
            success: false,
            message: "Each line requires po_line_id and product_id.",
          });
        }

        if (Number(line.qty_received) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Accepted quantity must be greater than zero.",
          });
        }

        if (Number(line.unit_cost) < 0) {
          return res.status(400).json({
            success: false,
            message: "Unit cost cannot be negative.",
          });
        }
      }

      await client.query("BEGIN");

      const poCheck = await client.query(
        `
        SELECT
          po.po_id,
          po.po_no,
          po.supplier_id,
          po.status,
          COALESCE(SUM(pol.qty), 0) AS ordered_qty,
          COALESCE(received.total_received_qty, 0) AS received_qty
        FROM pur.purchase_order po
        LEFT JOIN pur.purchase_order_line pol
          ON pol.po_id = po.po_id
        LEFT JOIN (
          SELECT
            gr.po_id,
            COALESCE(SUM(grl.qty_received), 0) AS total_received_qty
          FROM pur.goods_receipt gr
          JOIN pur.goods_receipt_line grl
            ON grl.grn_id = gr.grn_id
          WHERE COALESCE(UPPER(gr.status), '') <> 'CANCELLED'
          GROUP BY gr.po_id
        ) received
          ON received.po_id = po.po_id
        WHERE po.po_id = $1
        GROUP BY
          po.po_id,
          po.po_no,
          po.supplier_id,
          po.status,
          received.total_received_qty;
        `,
        [po_id]
      );

      if (poCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Purchase order not found.",
        });
      }

      const purchaseOrder = poCheck.rows[0];
      const pendingPoQty =
        Number(purchaseOrder.ordered_qty || 0) -
        Number(purchaseOrder.received_qty || 0);

      if (String(purchaseOrder.supplier_id) !== String(supplier_id)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Selected supplier does not match the purchase order supplier.",
        });
      }

      if (String(purchaseOrder.status || "").toUpperCase() !== "OPEN") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Only OPEN purchase orders can be received into GRN.",
        });
      }

      if (pendingPoQty <= 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "This purchase order has no pending quantity to receive.",
        });
      }

      for (const line of lines) {
        const remainingResult = await client.query(
          `
          SELECT
            pol.po_line_id,
            pol.product_id,
            pol.qty AS ordered_qty,
            COALESCE(received.qty_received, 0) AS already_received_qty,
            pol.qty - COALESCE(received.qty_received, 0) AS remaining_qty
          FROM pur.purchase_order_line pol
          LEFT JOIN (
            SELECT
              grl.po_line_id,
              COALESCE(SUM(grl.qty_received), 0) AS qty_received
            FROM pur.goods_receipt_line grl
            JOIN pur.goods_receipt gr
              ON gr.grn_id = grl.grn_id
            WHERE COALESCE(UPPER(gr.status), '') <> 'CANCELLED'
            GROUP BY grl.po_line_id
          ) received
            ON received.po_line_id = pol.po_line_id
          WHERE pol.po_line_id = $1
            AND pol.po_id = $2;
          `,
          [line.po_line_id, po_id]
        );

        if (remainingResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "One of the selected PO lines was not found on this purchase order.",
          });
        }

        const poLine = remainingResult.rows[0];

        if (String(poLine.product_id) !== String(line.product_id)) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "GRN product does not match the selected purchase order line.",
          });
        }

        if (Number(line.qty_received || 0) > Number(poLine.remaining_qty || 0)) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            message: `Received quantity cannot exceed pending PO quantity. Pending quantity for this line is ${Number(poLine.remaining_qty || 0)}.`,
          });
        }
      }

      const headerResult = await client.query(
        `
        INSERT INTO pur.goods_receipt (
          grn_id,
          grn_no,
          po_id,
          supplier_id,
          receipt_date,
          status,
          created_by,
          created_at,
          is_posted,
          location_id
        )
        VALUES (
          gen_random_uuid(),
          'GRN-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
          $1,
          $2,
          $3,
          'RECEIVED',
          $4,
          now(),
          false,
          $5
        )
        RETURNING
          grn_id,
          grn_no,
          po_id,
          supplier_id,
          receipt_date,
          status,
          created_by,
          created_at,
          is_posted,
          location_id;
        `,
        [
          po_id,
          supplier_id,
          receipt_date,
          created_by || req.user?.user_id || null,
          location_id,
        ]
      );

      const grn = headerResult.rows[0];
      const createdLines = [];

      for (const line of lines) {
        let finalLotId = line.lot_id || null;

        if (finalLotId) {
          const lotCheck = await client.query(
            `
            SELECT lot_id
            FROM inv.lot
            WHERE lot_id = $1
              AND product_id = $2;
            `,
            [finalLotId, line.product_id]
          );

          if (lotCheck.rowCount === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
              success: false,
              message: "Selected lot does not belong to this product.",
            });
          }

          if (line.expiry_date) {
            await client.query(
              `
              UPDATE inv.lot
              SET
                expiry_date = COALESCE($2::date, expiry_date),
                source_module = COALESCE(source_module, 'GRN'),
                source_id = COALESCE(source_id, $3::uuid)
              WHERE lot_id = $1;
              `,
              [finalLotId, line.expiry_date || null, grn.grn_id]
            );
          }
        } else {
          const lotCodeResult = await client.query(
            `
            SELECT inv.next_lot_code($1::uuid) AS lot_code;
            `,
            [line.product_id]
          );

          const generatedLotCode = lotCodeResult.rows[0]?.lot_code;

          if (!generatedLotCode) {
            await client.query("ROLLBACK");

            return res.status(500).json({
              success: false,
              message: "Failed to generate lot code.",
            });
          }

          const lotResult = await client.query(
            `
            SELECT inv.get_or_create_lot(
              $1::uuid,
              $2::text,
              $3::date,
              NULL::date,
              'GRN'::text,
              $4::uuid
            ) AS lot_id;
            `,
            [
              line.product_id,
              generatedLotCode,
              line.expiry_date || null,
              grn.grn_id,
            ]
          );

          finalLotId = lotResult.rows[0]?.lot_id;

          if (!finalLotId) {
            await client.query("ROLLBACK");

            return res.status(500).json({
              success: false,
              message: "Failed to create lot.",
            });
          }
        }

        const lineResult = await client.query(
          `
          INSERT INTO pur.goods_receipt_line (
            grn_line_id,
            grn_id,
            po_line_id,
            product_id,
            lot_id,
            qty_delivered,
            qty_received,
            qty_rejected,
            unit_cost,
            expiry_date,
            variance_reason,
            variance_responsibility,
            quality_status,
            notes
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
            $9,
            $10,
            $11,
            $12,
            $13
          )
          RETURNING
            grn_line_id,
            grn_id,
            po_line_id,
            product_id,
            lot_id,
            qty_delivered,
            qty_received AS accepted_qty,
            qty_rejected,
            shortage_qty,
            excess_qty,
            quality_status,
            unit_cost,
            expiry_date,
            variance_reason,
            variance_responsibility,
            notes,
            qty_received * unit_cost AS line_total;
          `,
          [
            grn.grn_id,
            line.po_line_id,
            line.product_id,
            finalLotId,
            Number(line.qty_delivered ?? line.qty_received),
            Number(line.qty_received),
            Number(line.qty_rejected || 0),
            Number(line.unit_cost || 0),
            line.expiry_date || null,
            line.variance_reason || null,
            line.variance_responsibility || null,
            line.quality_status || "ACCEPTED",
            line.notes || null,
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Goods receipt created successfully.",
        goods_receipt: grn,
        lines: createdLines,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create goods receipt.",
        error: error.message,
        detail: error.detail || null,
      });
    } finally {
      client.release();
    }
  }
);


/**
 * PATCH /api/goods-receipts/:grnId/refresh-po-status
 * Recalculates the linked purchase order status for this GRN.
 */
router.patch(
  "/:grnId/refresh-po-status",
  requireAuth,
  requirePermission("CREATE_GRN"),
  async (req, res) => {
    try {
      const { grnId } = req.params;

      const grnResult = await query(
        `
        SELECT grn_id
        FROM pur.goods_receipt
        WHERE grn_id::text = $1
           OR grn_no = $1;
        `,
        [grnId]
      );

      if (grnResult.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Goods receipt not found.",
        });
      }

      const result = await refreshPurchaseOrderStatusByGrnId(
        { query },
        grnResult.rows[0].grn_id
      );

      res.json({
        success: true,
        message: "Linked purchase order status refreshed successfully.",
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to refresh linked purchase order status.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

export default router;
