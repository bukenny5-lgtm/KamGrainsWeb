import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
function getArInvoiceErrorStatus(error, fallbackStatus = 500) {
  const code = String(error?.code || "");

  if (Number(error?.status) >= 400) return Number(error.status);
  if (Number(error?.statusCode) >= 400) return Number(error.statusCode);

  // PostgreSQL RAISE EXCEPTION from business-rule functions usually returns P0001.
  if (code === "P0001") return 400;

  // Unique violation.
  if (code === "23505") return 409;

  // Common user/data errors.
  if (["23502", "23503", "22P02", "22003"].includes(code)) return 400;

  return fallbackStatus;
}

function getArInvoiceErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();

  if (message) return message;

  return fallbackMessage;
}

function sendArInvoiceError(res, error, fallbackMessage, fallbackStatus = 500) {
  const status = getArInvoiceErrorStatus(error, fallbackStatus);
  const message = getArInvoiceErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null
  });
}

/**
 * GET /api/ar-invoices
 * Lists customer invoices with customer, delivery, and totals.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ai.ar_invoice_id,
        ai.invoice_no,
        ai.customer_id,
        c.party_name AS customer_name,
        ai.delivery_id,
        d.delivery_no,
        so.so_no,
        ps.sale_no AS pos_sale_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.created_at,
        ai.posted_journal_id,
        gj_post.journal_no AS posted_journal_no,
        ai.reversal_journal_id,
        gj_rev.journal_no AS reversal_journal_no,
        ai.voided_at,
        ai.voided_by,
        ai.void_reason,
        ai.transaction_date,
        ai.backdate_flag,
        ai.backdate_reason,
        ai.backdate_approved_by,
        ai.backdate_approved_at,
        COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0) AS invoice_total,
        COUNT(ail.ar_invoice_line_id) AS line_count
      FROM sal.ar_invoice ai
      LEFT JOIN app.party c
        ON c.party_id = ai.customer_id
      LEFT JOIN sal.delivery d
        ON d.delivery_id = ai.delivery_id
      LEFT JOIN sal.sales_order so
        ON so.so_id = d.so_id
      LEFT JOIN sal.pos_sale ps
        ON ps.credit_ar_invoice_id = ai.ar_invoice_id
      LEFT JOIN fin.gl_journal gj_post
        ON gj_post.journal_id = ai.posted_journal_id
      LEFT JOIN fin.gl_journal gj_rev
        ON gj_rev.journal_id = ai.reversal_journal_id
      LEFT JOIN sal.ar_invoice_line ail
        ON ail.ar_invoice_id = ai.ar_invoice_id
      GROUP BY
        ai.ar_invoice_id,
        ai.invoice_no,
        ai.customer_id,
        c.party_name,
        ai.delivery_id,
        d.delivery_no,
        so.so_no,
        ps.sale_no AS pos_sale_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.created_at,
        ai.posted_journal_id,
        gj_post.journal_no,
        ai.reversal_journal_id,
        gj_rev.journal_no,
        ai.voided_at,
        ai.voided_by,
        ai.void_reason,
        ai.transaction_date,
        ai.backdate_flag,
        ai.backdate_reason,
        ai.backdate_approved_by,
        ai.backdate_approved_at
      ORDER BY ai.created_at DESC, ai.invoice_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      ar_invoices: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load customer invoices.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/ar-invoices/reports/summary
 * Dashboard-ready AR invoice summary.
 */
router.get("/reports/summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ai.ar_invoice_id,
        ai.invoice_no,
        ai.customer_id,
        c.party_name AS customer_name,
        ai.delivery_id,
        d.delivery_no,
        so.so_no,
        ps.sale_no AS pos_sale_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.posted_journal_id,
        gj_post.journal_no AS posted_journal_no,
        ai.reversal_journal_id,
        gj_rev.journal_no AS reversal_journal_no,
        ai.voided_at,
        ai.voided_by,
        ai.void_reason,
        ai.created_at,
        ai.transaction_date,
        ai.backdate_flag,
        ai.backdate_reason,
        ai.backdate_approved_by,
        ai.backdate_approved_at,

        COUNT(ail.ar_invoice_line_id) AS line_count,
        COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0)), 0) AS total_qty,
        COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0) AS invoice_total,

        COALESCE(payments.total_applied, 0) AS total_paid,
        COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0)
          - COALESCE(payments.total_applied, 0) AS balance_due

      FROM sal.ar_invoice ai
      LEFT JOIN app.party c
        ON c.party_id = ai.customer_id
      LEFT JOIN sal.delivery d
        ON d.delivery_id = ai.delivery_id
      LEFT JOIN sal.sales_order so
        ON so.so_id = d.so_id
      LEFT JOIN sal.pos_sale ps
        ON ps.credit_ar_invoice_id = ai.ar_invoice_id
      LEFT JOIN fin.gl_journal gj_post
        ON gj_post.journal_id = ai.posted_journal_id
      LEFT JOIN fin.gl_journal gj_rev
        ON gj_rev.journal_id = ai.reversal_journal_id
      LEFT JOIN sal.ar_invoice_line ail
        ON ail.ar_invoice_id = ai.ar_invoice_id
      LEFT JOIN (
        SELECT
          apa.ar_invoice_id,
          SUM(apa.amount) AS total_applied
        FROM sal.ar_payment_apply apa
        GROUP BY apa.ar_invoice_id
      ) payments
        ON payments.ar_invoice_id = ai.ar_invoice_id

      GROUP BY
        ai.ar_invoice_id,
        ai.invoice_no,
        ai.customer_id,
        c.party_name,
        ai.delivery_id,
        d.delivery_no,
        so.so_no,
        ps.sale_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.posted_journal_id,
        gj_post.journal_no,
        ai.reversal_journal_id,
        gj_rev.journal_no,
        ai.voided_at,
        ai.voided_by,
        ai.void_reason,
        ai.created_at,
        ai.transaction_date,
        ai.backdate_flag,
        ai.backdate_reason,
        ai.backdate_approved_by,
        ai.backdate_approved_at,
        payments.total_applied

      ORDER BY ai.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load AR invoice summary.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * POST /api/ar-invoices/from-delivery/:deliveryNo
 * Creates AR invoice from delivery number using PostgreSQL function.
 */
router.post(
  "/from-delivery/:deliveryNo",
  requireAuth,
  requirePermission("CREATE_AR_INVOICE"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { deliveryNo } = req.params;

      if (!deliveryNo) {
        return res.status(400).json({
          success: false,
          message: "Delivery number is required."
        });
      }

      await client.query("BEGIN");

      const deliveryCheck = await client.query(
        `
        SELECT
          delivery_id,
          delivery_no,
          customer_id,
          status,
          is_posted,
          transaction_date,
          delivery_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at
        FROM sal.delivery
        WHERE delivery_no = $1;
        `,
        [deliveryNo]
      );

      if (deliveryCheck.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Delivery not found."
        });
      }

      const delivery = deliveryCheck.rows[0];

      if (delivery.is_posted !== true) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Delivery must be posted before creating AR invoice."
        });
      }

      const existingInvoice = await client.query(
        `
        SELECT ar_invoice_id, invoice_no, status
        FROM sal.ar_invoice
        WHERE delivery_id = $1
          AND COALESCE(status, 'OPEN') <> 'VOID'
        LIMIT 1;
        `,
        [delivery.delivery_id]
      );

      if (existingInvoice.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "An active invoice already exists for this delivery.",
          existing_invoice: existingInvoice.rows[0]
        });
      }

      const result = await client.query(
        `
        SELECT sal.create_ar_invoice_from_delivery_no($1) AS invoice_no;
        `,
        [deliveryNo]
      );

      const invoiceNo = result.rows[0]?.invoice_no;

      if (!invoiceNo) {
        await client.query("ROLLBACK");
        throw new Error("AR invoice creation returned no invoice number.");
      }

      await client.query(
        `
        UPDATE sal.ar_invoice ai
        SET transaction_date = COALESCE(d.transaction_date, d.delivery_date, CURRENT_DATE),
            backdate_flag = d.backdate_flag,
            backdate_reason = d.backdate_reason,
            backdate_approved_by = d.backdate_approved_by,
            backdate_approved_at = d.backdate_approved_at,
            invoice_date = COALESCE(d.delivery_date, d.transaction_date, CURRENT_DATE),
            due_date = COALESCE(d.delivery_date, d.transaction_date, CURRENT_DATE) + 30
        FROM sal.delivery d
        WHERE ai.delivery_id = d.delivery_id
          AND ai.invoice_no = $1;
        `,
        [invoiceNo]
      );

      const invoiceResult = await client.query(
        `
        SELECT
          ai.ar_invoice_id,
          ai.invoice_no,
          ai.customer_id,
          c.party_name AS customer_name,
          ai.delivery_id,
          d.delivery_no,
          ai.invoice_date,
          ai.due_date,
          ai.status,
          ai.posted_journal_id,
          gj_post.journal_no AS posted_journal_no,
          ai.reversal_journal_id,
          gj_rev.journal_no AS reversal_journal_no,
          ai.voided_at,
          ai.voided_by,
          ai.void_reason,
          ai.created_at,
          ai.transaction_date,
          ai.backdate_flag,
          ai.backdate_reason,
          ai.backdate_approved_by,
          ai.backdate_approved_at,
          COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0) AS invoice_total,
          COUNT(ail.ar_invoice_line_id) AS line_count
        FROM sal.ar_invoice ai
        LEFT JOIN app.party c
          ON c.party_id = ai.customer_id
        LEFT JOIN sal.delivery d
          ON d.delivery_id = ai.delivery_id
        LEFT JOIN fin.gl_journal gj_post
          ON gj_post.journal_id = ai.posted_journal_id
        LEFT JOIN fin.gl_journal gj_rev
          ON gj_rev.journal_id = ai.reversal_journal_id
        LEFT JOIN sal.ar_invoice_line ail
          ON ail.ar_invoice_id = ai.ar_invoice_id
        WHERE ai.invoice_no = $1
        GROUP BY
          ai.ar_invoice_id,
          ai.invoice_no,
          ai.customer_id,
          c.party_name,
          ai.delivery_id,
          d.delivery_no,
          ai.invoice_date,
          ai.due_date,
          ai.status,
          ai.posted_journal_id,
          gj_post.journal_no,
          ai.reversal_journal_id,
          gj_rev.journal_no,
          ai.voided_at,
          ai.voided_by,
          ai.void_reason,
          ai.created_at,
          ai.transaction_date,
          ai.backdate_flag,
          ai.backdate_reason,
          ai.backdate_approved_by,
          ai.backdate_approved_at;
        `,
        [invoiceNo]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "AR invoice created from delivery successfully.",
        invoice_no: invoiceNo,
        data: invoiceResult.rows[0]
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // No open transaction.
      }

      return sendArInvoiceError(
        res,
        error,
        "Failed to create AR invoice from delivery.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * GET /api/ar-invoices/by-no/:invoiceNo
 * Gets one customer invoice by invoice number with lines.
 */
router.get("/by-no/:invoiceNo", async (req, res) => {
  try {
    const { invoiceNo } = req.params;

    const headerResult = await query(
      `
      WITH invoice_total AS (
        SELECT
          ar_invoice_id,
          COALESCE(SUM(COALESCE(sell_qty, qty, base_qty, 0) * COALESCE(unit_price, 0)), 0) AS invoice_total
        FROM sal.ar_invoice_line
        GROUP BY ar_invoice_id
      ),
      paid_total AS (
        SELECT
          ar_invoice_id,
          COALESCE(SUM(amount), 0) AS amount_paid
        FROM sal.ar_payment_apply
        GROUP BY ar_invoice_id
      )
      SELECT
        ai.ar_invoice_id,
        ai.invoice_no,
        ai.customer_id,
        c.party_name AS customer_name,
        ai.delivery_id,
        d.delivery_no,
        so.so_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.created_at,
        ai.posted_journal_id,
        gj_post.journal_no AS posted_journal_no,
        ai.reversal_journal_id,
        gj_rev.journal_no AS reversal_journal_no,
        ai.voided_at,
        ai.voided_by,
        ai.void_reason,
        ai.transaction_date,
        ai.backdate_flag,
        ai.backdate_reason,
        ai.backdate_approved_by,
        ai.backdate_approved_at,
        COALESCE(it.invoice_total, 0) AS invoice_total,
        COALESCE(pt.amount_paid, 0) AS amount_paid,
        COALESCE(it.invoice_total, 0) - COALESCE(pt.amount_paid, 0) AS balance_due,
        CASE
          WHEN ai.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted
      FROM sal.ar_invoice ai
      LEFT JOIN app.party c
        ON c.party_id = ai.customer_id
      LEFT JOIN sal.delivery d
        ON d.delivery_id = ai.delivery_id
      LEFT JOIN sal.sales_order so
        ON so.so_id = d.so_id
      LEFT JOIN fin.gl_journal gj_post
        ON gj_post.journal_id = ai.posted_journal_id
      LEFT JOIN fin.gl_journal gj_rev
        ON gj_rev.journal_id = ai.reversal_journal_id
      LEFT JOIN invoice_total it
        ON it.ar_invoice_id = ai.ar_invoice_id
      LEFT JOIN paid_total pt
        ON pt.ar_invoice_id = ai.ar_invoice_id
      WHERE ai.invoice_no = $1;
      `,
      [invoiceNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer invoice not found."
      });
    }

    const invoice = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        ail.ar_invoice_line_id,
        ail.ar_invoice_id,
        ail.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        ail.description,
        ail.qty,
        ail.sell_qty,
        ail.sell_uom_code,
        ail.base_qty,
        ail.unit_price,
        ail.pieces_per_carton,
        COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0) AS line_total
      FROM sal.ar_invoice_line ail
      LEFT JOIN inv.product p
        ON p.product_id = ail.product_id
      WHERE ail.ar_invoice_id = $1
      ORDER BY p.product_name;
      `,
      [invoice.ar_invoice_id]
    );

    
    const receiptApplicationsResult = await query(
      `
      SELECT
        pa.ar_payment_id,
        p.receipt_no,
        p.payment_date,
        pa.transaction_date,
        pa.amount AS applied_amount,
        p.method,
        p.reference,
        CASE
          WHEN p.posted_journal_id IS NULL THEN 'Not Posted'
          ELSE 'Posted'
        END AS receipt_status,
        p.posted_journal_id,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS posted,
        pa.backdate_flag,
        pa.backdate_reason,
        p.created_at
      FROM sal.ar_payment_apply pa
      INNER JOIN sal.ar_payment p
        ON p.ar_payment_id = pa.ar_payment_id
      WHERE pa.ar_invoice_id = $1
      ORDER BY COALESCE(pa.transaction_date, p.payment_date), p.receipt_no;
      `,
      [invoice.ar_invoice_id]
    );

    res.json({
      success: true,
      ar_invoice: invoice,
      lines: linesResult.rows,
      receipt_applications: receiptApplicationsResult.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load customer invoice.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/ar-invoices/:invoiceId
 * Gets one customer invoice by UUID with lines.
 */
router.get("/:invoiceId", async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const headerResult = await query(
      `
      WITH invoice_total AS (
        SELECT
          ar_invoice_id,
          COALESCE(SUM(COALESCE(sell_qty, qty, base_qty, 0) * COALESCE(unit_price, 0)), 0) AS invoice_total
        FROM sal.ar_invoice_line
        GROUP BY ar_invoice_id
      ),
      paid_total AS (
        SELECT
          ar_invoice_id,
          COALESCE(SUM(amount), 0) AS amount_paid
        FROM sal.ar_payment_apply
        GROUP BY ar_invoice_id
      )
      SELECT
        ai.ar_invoice_id,
        ai.invoice_no,
        ai.customer_id,
        c.party_name AS customer_name,
        ai.delivery_id,
        d.delivery_no,
        so.so_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.created_at,
        ai.posted_journal_id,
        gj_post.journal_no AS posted_journal_no,
        ai.reversal_journal_id,
        gj_rev.journal_no AS reversal_journal_no,
        ai.voided_at,
        ai.voided_by,
        ai.void_reason,
        ai.transaction_date,
        ai.backdate_flag,
        ai.backdate_reason,
        ai.backdate_approved_by,
        ai.backdate_approved_at,
        COALESCE(it.invoice_total, 0) AS invoice_total,
        COALESCE(pt.amount_paid, 0) AS amount_paid,
        COALESCE(it.invoice_total, 0) - COALESCE(pt.amount_paid, 0) AS balance_due,
        CASE
          WHEN ai.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted
      FROM sal.ar_invoice ai
      LEFT JOIN app.party c
        ON c.party_id = ai.customer_id
      LEFT JOIN sal.delivery d
        ON d.delivery_id = ai.delivery_id
      LEFT JOIN sal.sales_order so
        ON so.so_id = d.so_id
      LEFT JOIN fin.gl_journal gj_post
        ON gj_post.journal_id = ai.posted_journal_id
      LEFT JOIN fin.gl_journal gj_rev
        ON gj_rev.journal_id = ai.reversal_journal_id
      LEFT JOIN invoice_total it
        ON it.ar_invoice_id = ai.ar_invoice_id
      LEFT JOIN paid_total pt
        ON pt.ar_invoice_id = ai.ar_invoice_id
      LEFT JOIN sal.pos_sale ps
        ON ps.credit_ar_invoice_id = ai.ar_invoice_id
      WHERE ai.ar_invoice_id = $1;
      `,
      [invoiceId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer invoice not found."
      });
    }

    const linesResult = await query(
      `
      SELECT
        ail.ar_invoice_line_id,
        ail.ar_invoice_id,
        ail.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        ail.description,
        ail.qty,
        ail.sell_qty,
        ail.sell_uom_code,
        ail.base_qty,
        ail.unit_price,
        ail.pieces_per_carton,
        COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0) AS line_total
      FROM sal.ar_invoice_line ail
      LEFT JOIN inv.product p
        ON p.product_id = ail.product_id
      WHERE ail.ar_invoice_id = $1
      ORDER BY p.product_name;
      `,
      [invoiceId]
    );

    
    const receiptApplicationsResult = await query(
      `
      SELECT
        pa.ar_payment_id,
        p.receipt_no,
        p.payment_date,
        pa.transaction_date,
        pa.amount AS applied_amount,
        p.method,
        p.reference,
        CASE
          WHEN p.posted_journal_id IS NULL THEN 'Not Posted'
          ELSE 'Posted'
        END AS receipt_status,
        p.posted_journal_id,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS posted,
        pa.backdate_flag,
        pa.backdate_reason,
        p.created_at
      FROM sal.ar_payment_apply pa
      INNER JOIN sal.ar_payment p
        ON p.ar_payment_id = pa.ar_payment_id
      WHERE pa.ar_invoice_id = $1
      ORDER BY COALESCE(pa.transaction_date, p.payment_date), p.receipt_no;
      `,
      [invoiceId]
    );

    res.json({
      success: true,
      ar_invoice: headerResult.rows[0],
      lines: linesResult.rows,
      receipt_applications: receiptApplicationsResult.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load customer invoice.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * POST /api/ar-invoices
 * Creates customer invoice from a delivery ID.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_AR_INVOICE"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { delivery_id, invoice_date, due_date } = req.body || {};

      if (!delivery_id) {
        return res.status(400).json({
          success: false,
          message: "Delivery is required."
        });
      }

      if (!invoice_date) {
        return res.status(400).json({
          success: false,
          message: "Invoice date is required."
        });
      }

      await client.query("BEGIN");

      const deliveryResult = await client.query(
        `
        SELECT
          d.delivery_id,
          d.delivery_no,
          d.customer_id,
          d.status,
          d.is_posted,
          d.transaction_date,
          d.backdate_flag,
          d.backdate_reason,
          d.backdate_approved_by,
          d.backdate_approved_at
        FROM sal.delivery d
        WHERE d.delivery_id = $1;
        `,
        [delivery_id]
      );

      if (deliveryResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Delivery not found."
        });
      }

      const delivery = deliveryResult.rows[0];

      if (delivery.is_posted !== true) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Delivery must be posted before creating invoice."
        });
      }

      if (!delivery.customer_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Customer could not be resolved from delivery."
        });
      }

      const lineCheck = await client.query(
        `
        SELECT COUNT(*)::int AS line_count
        FROM sal.delivery_line
        WHERE delivery_id = $1;
        `,
        [delivery_id]
      );

      if (lineCheck.rows[0].line_count <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Delivery has no lines."
        });
      }

      const existingInvoice = await client.query(
        `
        SELECT ar_invoice_id, invoice_no, status
        FROM sal.ar_invoice
        WHERE delivery_id = $1
          AND COALESCE(status, 'OPEN') <> 'VOID'
        LIMIT 1;
        `,
        [delivery_id]
      );

      if (existingInvoice.rowCount > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "An active invoice already exists for this delivery.",
          existing_invoice: existingInvoice.rows[0]
        });
      }

      const headerResult = await client.query(
        `
        INSERT INTO sal.ar_invoice (
          ar_invoice_id,
          invoice_no,
          customer_id,
          delivery_id,
          invoice_date,
          due_date,
          status,
          created_at,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at
        )
        VALUES (
          gen_random_uuid(),
          'ARI-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
          $1,
          $2,
          $3,
          $4,
          'OPEN',
          now(),
          $5,
          $6,
          $7,
          $8,
          $9
        )
        RETURNING
          ar_invoice_id,
          invoice_no,
          customer_id,
          delivery_id,
          invoice_date,
          due_date,
          status,
          created_at,
          posted_journal_id,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at;
        `,
        [
          delivery.customer_id,
          delivery_id,
          invoice_date,
          due_date || invoice_date,
          delivery.transaction_date,
          delivery.backdate_flag,
          delivery.backdate_reason,
          delivery.backdate_approved_by,
          delivery.backdate_approved_at
        ]
      );

      const invoice = headerResult.rows[0];

      const linesResult = await client.query(
        `
        INSERT INTO sal.ar_invoice_line (
          ar_invoice_line_id,
          ar_invoice_id,
          product_id,
          description,
          qty,
          sell_qty,
          sell_uom_code,
          base_qty,
          unit_price,
          pieces_per_carton
        )
        SELECT
          gen_random_uuid(),
          $1,
          dl.product_id,
          p.product_name,
          COALESCE(dl.qty, dl.sell_qty),
          COALESCE(dl.sell_qty, dl.qty),
          dl.sell_uom_code,
          COALESCE(dl.qty, dl.sell_qty),
          dl.unit_price,
          dl.pieces_per_carton
        FROM sal.delivery_line dl
        LEFT JOIN inv.product p
          ON p.product_id = dl.product_id
        WHERE dl.delivery_id = $2
        RETURNING
          ar_invoice_line_id,
          ar_invoice_id,
          product_id,
          description,
          qty,
          sell_qty,
          sell_uom_code,
          base_qty,
          unit_price,
          pieces_per_carton,
          COALESCE(sell_qty, qty, base_qty, 0) * COALESCE(unit_price, 0) AS line_total;
        `,
        [invoice.ar_invoice_id, delivery_id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Customer invoice created successfully.",
        ar_invoice: invoice,
        lines: linesResult.rows
      });
        } catch (error) {
      await client.query("ROLLBACK");

      return sendArInvoiceError(
        res,
        error,
        "Failed to create customer invoice.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
  * POST /api/ar-invoices/:invoiceNo/void
  * Voids a posted AR invoice via a reversal journal without changing the
  * original invoice or original journal.
  */
router.post(
   "/:invoiceNo/void",
   requireAuth,
   requirePermission("CREATE_AR_INVOICE"),
   async (req, res) => {
     try {
       const { invoiceNo } = req.params;
       const { reason } = req.body || {};
       const userId = req.user?.user_id || null;

       if (!invoiceNo) {
         return res.status(400).json({
           success: false,
           message: "Invoice number is required."
         });
       }

       if (!reason || !String(reason).trim()) {
         return res.status(400).json({
           success: false,
           message: "A void reason is required."
         });
       }

       if (!userId) {
         return res.status(401).json({
           success: false,
           message: "Authenticated user is required to void an invoice."
         });
       }

       const posOrigin = await query(
         `SELECT ps.sale_no
            FROM sal.ar_invoice ai
            JOIN sal.pos_sale ps ON ps.credit_ar_invoice_id = ai.ar_invoice_id
           WHERE ai.invoice_no = $1`,
         [invoiceNo]
       );
       if (posOrigin.rowCount) {
         return res.status(409).json({
           success: false,
           message: `This receivable was created from POS sale ${posOrigin.rows[0].sale_no}. Void the originating POS sale or use Customer Returns.`,
           pos_sale_no: posOrigin.rows[0].sale_no,
         });
       }

       const result = await query(
         `SELECT * FROM sal.void_ar_invoice_by_no($1, $2, $3);`,
         [invoiceNo, String(reason).trim(), userId]
       );

       const row = result.rows[0];

       if (!row) {
         return res.status(500).json({
           success: false,
           message: "Void operation returned no result."
         });
       }

       return res.json({
         success: true,
         invoice_no: row.invoice_no,
         status: row.status,
         reversal_journal_id: row.reversal_journal_id,
         original_journal_id: row.original_journal_id,
         voided_at: row.voided_at,
         voided_by: row.voided_by,
         void_reason: row.void_reason,
         message: "AR invoice voided and accounting journal reversed successfully."
       });
     } catch (error) {
       return sendArInvoiceError(
         res,
         error,
         "Failed to void customer invoice.",
         500
       );
     }
   }
);

/**
  * POST /api/ar-invoices/:invoiceNo/post
  * Posts customer invoice using existing PostgreSQL posting function.
  *
  * NOTE:
  * This uses CREATE_AR_INVOICE because your current permission map does not yet
  * define POST_AR_INVOICE. If you want stricter separation later, add
  * POST_AR_INVOICE to permissions.js and frontend permissions.ts.
  */
router.post(
  "/:invoiceNo/post",
  requireAuth,
  requirePermission("CREATE_AR_INVOICE"),
  async (req, res) => {
    try {
      const { invoiceNo } = req.params;

      const invoiceCheck = await query(
        `
        SELECT invoice_no, status, posted_journal_id
        FROM sal.ar_invoice
        WHERE invoice_no = $1;
        `,
        [invoiceNo]
      );

      if (invoiceCheck.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Customer invoice not found."
        });
      }

      if (invoiceCheck.rows[0].posted_journal_id) {
        return res.status(409).json({
          success: false,
          message: "Customer invoice is already posted.",
          invoice: invoiceCheck.rows[0]
        });
      }

      const result = await query(
        "SELECT sal.post_ar_invoice_by_no($1) AS result;",
        [invoiceNo]
      );

      const postedInvoice = await query(
        `
        SELECT
          ar_invoice_id,
          invoice_no,
          customer_id,
          invoice_date,
          due_date,
          status,
          delivery_id,
          posted_journal_id,
          created_at
        FROM sal.ar_invoice
        WHERE invoice_no = $1;
        `,
        [invoiceNo]
      );

      res.json({
        success: true,
        message: "Customer invoice posted successfully.",
        result: result.rows[0]?.result ?? null,
        data: postedInvoice.rows[0]
      });
        } catch (error) {
      return sendArInvoiceError(
        res,
        error,
        "Failed to post customer invoice.",
        500
      );
    }
  }
);

export default router;
