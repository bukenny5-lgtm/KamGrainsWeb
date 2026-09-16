import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { refreshPurchaseOrderStatusByGrnId } from "../utils/purchaseOrderStatus.js";

const router = express.Router();
function getApInvoiceErrorStatus(error, fallbackStatus = 500) {
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

function getApInvoiceErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();

  if (message) return message;

  return fallbackMessage;
}

function sendApInvoiceError(res, error, fallbackMessage, fallbackStatus = 500) {
  const status = getApInvoiceErrorStatus(error, fallbackStatus);
  const message = getApInvoiceErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null
  });
}

/**
 * GET /api/ap-invoices
 * Lists supplier invoices with supplier, GRN, totals, paid amount, and balance.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      WITH invoice_totals AS (
        SELECT
          api.ap_invoice_id,
          COALESCE(SUM(apil.qty * apil.unit_price), 0) AS invoice_total
        FROM pur.ap_invoice api
        LEFT JOIN pur.ap_invoice_line apil
          ON apil.ap_invoice_id = api.ap_invoice_id
        GROUP BY api.ap_invoice_id
      ),
      paid_totals AS (
        SELECT
          apa.ap_invoice_id,
          COALESCE(SUM(apa.amount), 0) AS amount_paid
        FROM pur.ap_payment_apply apa
        JOIN pur.ap_payment p
          ON p.ap_payment_id = apa.ap_payment_id
        WHERE p.posted_journal_id IS NOT NULL
          AND p.reversal_journal_id IS NULL
        GROUP BY apa.ap_invoice_id
      )
      SELECT
        api.ap_invoice_id,
        api.invoice_no,
        api.supplier_id,
        s.party_name AS supplier_name,
        api.invoice_date,
        api.due_date,
        api.status,
        api.grn_id,
        gr.grn_no,
        api.created_at,
        api.posted_journal_id,
        api.transaction_date,
        api.backdate_flag,
        api.backdate_reason,
        api.backdate_approved_by,
        api.backdate_approved_at,
        it.invoice_total,
        COALESCE(pt.amount_paid, 0) AS amount_paid,
        it.invoice_total - COALESCE(pt.amount_paid, 0) AS balance,
        CASE
          WHEN api.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted
      FROM pur.ap_invoice api
      LEFT JOIN app.party s
        ON s.party_id = api.supplier_id
      LEFT JOIN pur.goods_receipt gr
        ON gr.grn_id = api.grn_id
      LEFT JOIN invoice_totals it
        ON it.ap_invoice_id = api.ap_invoice_id
      LEFT JOIN paid_totals pt
        ON pt.ap_invoice_id = api.ap_invoice_id
      ORDER BY api.created_at DESC, api.invoice_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      ap_invoices: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load supplier invoices.",
      error: error.message,
    });
  }
});

/**
 * GET /api/ap-invoices/reports/summary
 * Dashboard-ready AP invoice summary.
 */
router.get("/reports/summary", async (req, res) => {
  try {
    const result = await query(`
      WITH invoice_totals AS (
        SELECT
          api.ap_invoice_id,
          COALESCE(SUM(apil.qty * apil.unit_price), 0) AS invoice_total,
          COALESCE(SUM(apil.qty), 0) AS total_qty,
          COUNT(apil.ap_invoice_line_id) AS line_count
        FROM pur.ap_invoice api
        LEFT JOIN pur.ap_invoice_line apil
          ON apil.ap_invoice_id = api.ap_invoice_id
        GROUP BY api.ap_invoice_id
      ),
      paid_totals AS (
        SELECT
          apa.ap_invoice_id,
          COALESCE(SUM(apa.amount), 0) AS amount_paid
        FROM pur.ap_payment_apply apa
        JOIN pur.ap_payment p
          ON p.ap_payment_id = apa.ap_payment_id
        WHERE p.posted_journal_id IS NOT NULL
          AND p.reversal_journal_id IS NULL
        GROUP BY apa.ap_invoice_id
      )
      SELECT
        api.ap_invoice_id,
        api.invoice_no,
        api.supplier_id,
        s.party_name AS supplier_name,
        api.invoice_date,
        api.due_date,
        api.status,
        api.grn_id,
        gr.grn_no,
        api.created_at,
        api.posted_journal_id,
        api.transaction_date,
        api.backdate_flag,
        api.backdate_reason,
        api.backdate_approved_by,
        api.backdate_approved_at,

        CASE
          WHEN api.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted,

        COALESCE(it.line_count, 0) AS line_count,
        COALESCE(it.total_qty, 0) AS total_qty,
        COALESCE(it.invoice_total, 0) AS invoice_total,
        COALESCE(pt.amount_paid, 0) AS total_paid,
        COALESCE(it.invoice_total, 0) - COALESCE(pt.amount_paid, 0) AS balance_due

      FROM pur.ap_invoice api
      LEFT JOIN app.party s
        ON s.party_id = api.supplier_id
      LEFT JOIN pur.goods_receipt gr
        ON gr.grn_id = api.grn_id
      LEFT JOIN invoice_totals it
        ON it.ap_invoice_id = api.ap_invoice_id
      LEFT JOIN paid_totals pt
        ON pt.ap_invoice_id = api.ap_invoice_id
      ORDER BY api.created_at DESC, api.invoice_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load AP invoice summary.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/ap-invoices/:invoiceId
 * Gets one supplier invoice with lines.
 */
router.get("/:invoiceId", async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const headerResult = await query(
      `
      WITH invoice_total AS (
        SELECT
          ap_invoice_id,
          COALESCE(SUM(qty * unit_price), 0) AS invoice_total
        FROM pur.ap_invoice_line
        WHERE ap_invoice_id = $1
        GROUP BY ap_invoice_id
      ),
      paid_total AS (
        SELECT
          apa.ap_invoice_id,
          COALESCE(SUM(apa.amount), 0) AS amount_paid
        FROM pur.ap_payment_apply apa
        JOIN pur.ap_payment p
          ON p.ap_payment_id = apa.ap_payment_id
        WHERE apa.ap_invoice_id = $1
          AND p.posted_journal_id IS NOT NULL
          AND p.reversal_journal_id IS NULL
        GROUP BY apa.ap_invoice_id
      )
      SELECT
        api.ap_invoice_id,
        api.invoice_no,
        api.supplier_id,
        s.party_name AS supplier_name,
        api.invoice_date,
        api.due_date,
        api.status,
        api.grn_id,
        gr.grn_no,
        api.created_at,
        api.posted_journal_id,
        api.transaction_date,
        api.backdate_flag,
        api.backdate_reason,
        api.backdate_approved_by,
        api.backdate_approved_at,
        COALESCE(it.invoice_total, 0) AS invoice_total,
        COALESCE(pt.amount_paid, 0) AS amount_paid,
        COALESCE(it.invoice_total, 0) - COALESCE(pt.amount_paid, 0) AS balance,
        CASE
          WHEN api.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted
      FROM pur.ap_invoice api
      LEFT JOIN app.party s
        ON s.party_id = api.supplier_id
      LEFT JOIN pur.goods_receipt gr
        ON gr.grn_id = api.grn_id
      LEFT JOIN invoice_total it
        ON it.ap_invoice_id = api.ap_invoice_id
      LEFT JOIN paid_total pt
        ON pt.ap_invoice_id = api.ap_invoice_id
      WHERE api.ap_invoice_id = $1;
      `,
      [invoiceId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Supplier invoice not found.",
      });
    }

    const linesResult = await query(
      `
      SELECT
        apil.ap_invoice_line_id,
        apil.ap_invoice_id,
        apil.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        apil.description,
        apil.qty,
        apil.unit_price,
        apil.qty * apil.unit_price AS line_total
      FROM pur.ap_invoice_line apil
      LEFT JOIN inv.product p
        ON p.product_id = apil.product_id
      WHERE apil.ap_invoice_id = $1
      ORDER BY p.product_name, apil.description;
      `,
      [invoiceId]
    );

    res.json({
      success: true,
      ap_invoice: headerResult.rows[0],
      lines: linesResult.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load supplier invoice.",
      error: error.message,
    });
  }
});

/**
 * POST /api/ap-invoices/from-grn
 * Creates supplier invoice header from GRN, then loads invoice lines from GRN.
 */
router.post(
  "/from-grn",
  requireAuth,
  requirePermission("CREATE_AP_INVOICE"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { grn_no } = req.body || {};
      if (!grn_no) {
        return res.status(400).json({
          success: false,
          message: "GRN number is required.",
        });
      }

      await client.query("BEGIN");

      const grnResult = await client.query(
        `
        SELECT
          grn_id,
          grn_no,
          po_id,
          supplier_id,
          receipt_date,
          status,
          is_posted
        FROM pur.goods_receipt
        WHERE grn_no = $1;
        `,
        [grn_no]
      );

      if (grnResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "GRN not found.",
        });
      }

      const grn = grnResult.rows[0];

      if (grn.is_posted !== true) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "GRN must be posted before creating supplier invoice.",
        });
      }

      const existingGrnInvoice = await client.query(
        `
        SELECT ap_invoice_id, invoice_no, status
        FROM pur.ap_invoice
        WHERE grn_id = $1
        LIMIT 1;
        `,
        [grn.grn_id]
      );

      if (existingGrnInvoice.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "A supplier invoice already exists for this GRN.",
          existing_invoice: existingGrnInvoice.rows[0],
        });
      }

      let finalInvoiceNo = req.body.invoice_no;
      if (!finalInvoiceNo) {
        const nextNoResult = await client.query(`
          SELECT
            'AP-INV-' ||
            to_char(CURRENT_DATE, 'YYYYMMDD') ||
            '-' ||
            lpad(
              (
                COALESCE(
                  MAX(
                    NULLIF(
                      regexp_replace(invoice_no, '^AP-INV-[0-9]{8}-', ''),
                      ''
                    )::int
                  ),
                  0
                ) + 1
              )::text,
              5,
              '0'
            ) AS next_invoice_no
          FROM pur.ap_invoice
          WHERE invoice_no LIKE 'AP-INV-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-%';
        `);
        finalInvoiceNo = nextNoResult.rows[0]?.next_invoice_no;
      }

      const { invoice_no, invoice_date, due_date, transaction_date, backdate_flag, backdate_reason } = req.body || {};

      if (!finalInvoiceNo) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Supplier invoice number is required."
        });
      }

      // Backdate validation
      const todayStr = new Date().toISOString().split('T')[0];
      const finalTransactionDate = transaction_date || invoice_date || todayStr;
      const isBackdated = backdate_flag === true || (finalTransactionDate && finalTransactionDate < todayStr);
      const finalBackdateFlag = isBackdated;
      const finalBackdateReason = isBackdated ? backdate_reason : null;
      const finalBackdateApprovedBy = isBackdated ? (req.user?.user_id || null) : null;
      const finalBackdateApprovedAt = isBackdated ? new Date() : null;

      if (isBackdated) {
        const { getUserRoles } = await import("../middleware/permissions.js");
        const roles = getUserRoles(req);
        if (!roles.includes("ADMIN") && !roles.includes("MANAGER")) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            success: false,
            message: "Only ADMIN or MANAGER roles are authorized to create backdated invoices."
          });
        }
        if (!finalBackdateReason || !finalBackdateReason.trim()) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "A backdate reason must be provided for backdated invoices."
          });
        }
      }

      const duplicateCheck = await client.query(
        `
        SELECT ap_invoice_id, invoice_no
        FROM pur.ap_invoice
        WHERE invoice_no = $1
        LIMIT 1;
        `,
        [finalInvoiceNo]
      );

      if (duplicateCheck.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Supplier invoice number already exists.",
          existing_invoice: duplicateCheck.rows[0],
        });
      }

      const headerResult = await client.query(
        `
        INSERT INTO pur.ap_invoice (
          ap_invoice_id,
          invoice_no,
          supplier_id,
          invoice_date,
          due_date,
          status,
          grn_id,
          created_at,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          COALESCE($3::date, CURRENT_DATE),
          COALESCE($4::date, COALESCE($3::date, CURRENT_DATE)),
          'OPEN',
          $5,
          now(),
          $6,
          $7,
          $8,
          $9,
          $10
        )
        RETURNING
          ap_invoice_id,
          invoice_no,
          supplier_id,
          invoice_date,
          due_date,
          status,
          grn_id,
          created_at,
          posted_journal_id,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at;
        `,
        [
          finalInvoiceNo,
          grn.supplier_id,
          invoice_date || null,
          due_date || invoice_date || null,
          grn.grn_id,
          finalTransactionDate,
          finalBackdateFlag,
          finalBackdateReason,
          finalBackdateApprovedBy,
          finalBackdateApprovedAt
        ]
      );

      const invoice = headerResult.rows[0];

      await client.query(
        `
        SELECT pur.load_ap_invoice_lines_from_grn($1, $2) AS result;
        `,
        [finalInvoiceNo, grn_no]
      );

      const linesResult = await client.query(
        `
        SELECT
          apil.ap_invoice_line_id,
          apil.ap_invoice_id,
          apil.product_id,
          p.sku,
          p.product_name,
          p.uom_code,
          apil.description,
          apil.qty,
          apil.unit_price,
          apil.qty * apil.unit_price AS line_total
        FROM pur.ap_invoice_line apil
        LEFT JOIN inv.product p
          ON p.product_id = apil.product_id
        WHERE apil.ap_invoice_id = $1
        ORDER BY p.product_name, apil.description;
        `,
        [invoice.ap_invoice_id]
      );

      const poStatus = await refreshPurchaseOrderStatusByGrnId(client, grn.grn_id);

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Supplier invoice created from GRN successfully.",
        ap_invoice: invoice,
        lines: linesResult.rows,
        purchase_order_status: poStatus,
      });
        } catch (error) {
      await client.query("ROLLBACK");

      return sendApInvoiceError(
        res,
        error,
        "Failed to create supplier invoice from GRN.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/ap-invoices
 * Creates supplier invoice manually with lines.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_AP_INVOICE"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        invoice_no,
        supplier_id,
        invoice_date,
        due_date,
        grn_id = null,
        lines,
        transaction_date,
        backdate_flag,
        backdate_reason,
      } = req.body || {};

      if (!invoice_no) {
        return res.status(400).json({
          success: false,
          message: "Supplier invoice number is required.",
        });
      }

      if (!supplier_id) {
        return res.status(400).json({
          success: false,
          message: "Supplier is required.",
        });
      }

      if (!invoice_date) {
        return res.status(400).json({
          success: false,
          message: "Invoice date is required.",
        });
      }

      // Backdate validation
      const todayStr = new Date().toISOString().split('T')[0];
      const finalTransactionDate = transaction_date || invoice_date || todayStr;
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
            message: "Only ADMIN or MANAGER roles are authorized to create backdated invoices."
          });
        }
        if (!finalBackdateReason || !finalBackdateReason.trim()) {
          return res.status(400).json({
            success: false,
            message: "A backdate reason must be provided for backdated invoices."
          });
        }
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one supplier invoice line is required.",
        });
      }

      for (const line of lines) {
        if (!line.product_id) {
          return res.status(400).json({
            success: false,
            message: "Each line requires product_id.",
          });
        }

        if (Number(line.qty) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Each line quantity must be greater than zero.",
          });
        }

        if (Number(line.unit_price) < 0) {
          return res.status(400).json({
            success: false,
            message: "Unit price cannot be negative.",
          });
        }
      }

      await client.query("BEGIN");

      const duplicateCheck = await client.query(
        `
        SELECT ap_invoice_id, invoice_no
        FROM pur.ap_invoice
        WHERE invoice_no = $1
        LIMIT 1;
        `,
        [invoice_no]
      );

      if (duplicateCheck.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Supplier invoice number already exists.",
          existing_invoice: duplicateCheck.rows[0],
        });
      }

      const headerResult = await client.query(
        `
        INSERT INTO pur.ap_invoice (
          ap_invoice_id,
          invoice_no,
          supplier_id,
          invoice_date,
          due_date,
          status,
          grn_id,
          created_at,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3::date,
          COALESCE($4::date, $3::date),
          'OPEN',
          $5::uuid,
          now(),
          $6,
          $7,
          $8,
          $9,
          $10
        )
        RETURNING
          ap_invoice_id,
          invoice_no,
          supplier_id,
          invoice_date,
          due_date,
          status,
          grn_id,
          created_at,
          posted_journal_id,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at;
        `,
        [
          invoice_no,
          supplier_id,
          invoice_date,
          due_date || null,
          grn_id || null,
          finalTransactionDate,
          finalBackdateFlag,
          finalBackdateReason,
          finalBackdateApprovedBy,
          finalBackdateApprovedAt
        ]
      );

      const invoice = headerResult.rows[0];
      const createdLines = [];

      for (const line of lines) {
        const lineResult = await client.query(
          `
          INSERT INTO pur.ap_invoice_line (
            ap_invoice_line_id,
            ap_invoice_id,
            product_id,
            description,
            qty,
            unit_price
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5
          )
          RETURNING
            ap_invoice_line_id,
            ap_invoice_id,
            product_id,
            description,
            qty,
            unit_price,
            qty * unit_price AS line_total;
          `,
          [
            invoice.ap_invoice_id,
            line.product_id,
            line.description || null,
            Number(line.qty),
            Number(line.unit_price),
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      const poStatus = grn_id
        ? await refreshPurchaseOrderStatusByGrnId(client, grn_id)
        : null;

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Supplier invoice created successfully.",
        ap_invoice: invoice,
        lines: createdLines,
        purchase_order_status: poStatus,
      });
       } catch (error) {
      await client.query("ROLLBACK");

      return sendApInvoiceError(
        res,
        error,
        "Failed to create supplier invoice.",
        500
      );
    } finally {
      client.release();
    }
  }
);
/**
 * POST /api/ap-invoices/:invoiceNo/post
 * Posts supplier invoice by invoice number.
 *
 * NOTE:
 * This uses CREATE_AP_INVOICE permission because your current permission map
 * does not yet define POST_AP_INVOICE.
 */
router.post(
  "/:invoiceNo/post",
  requireAuth,
  requirePermission("CREATE_AP_INVOICE"),
  async (req, res) => {
    try {
      const { invoiceNo } = req.params;

      const invoiceCheck = await query(
        `
        SELECT
          ap_invoice_id,
          invoice_no,
          status,
          posted_journal_id
        FROM pur.ap_invoice
        WHERE invoice_no = $1;
        `,
        [invoiceNo]
      );

      if (invoiceCheck.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Supplier invoice not found.",
        });
      }

      const invoice = invoiceCheck.rows[0];

      if (invoice.posted_journal_id) {
        return res.status(409).json({
          success: false,
          message: "Supplier invoice is already posted.",
          invoice,
        });
      }

      const result = await query(
        `
        SELECT pur.post_ap_invoice($1::uuid) AS result;
        `,
        [invoice.ap_invoice_id]
      );

      const postedInvoice = await query(
        `
        SELECT
          ap_invoice_id,
          invoice_no,
          supplier_id,
          invoice_date,
          due_date,
          status,
          grn_id,
          posted_journal_id,
          created_at
        FROM pur.ap_invoice
        WHERE invoice_no = $1;
        `,
        [invoiceNo]
      );

      const poStatus = postedInvoice.rows[0]?.grn_id
        ? await refreshPurchaseOrderStatusByGrnId({ query }, postedInvoice.rows[0].grn_id)
        : null;

      res.json({
        success: true,
        message: "Supplier invoice posted successfully.",
        result: result.rows[0]?.result ?? null,
        data: postedInvoice.rows[0],
        purchase_order_status: poStatus,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to post supplier invoice.",
        error: error.message,
        detail: error.detail || null,
      });
    }
  }
);

export default router;