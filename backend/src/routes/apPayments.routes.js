import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, getUserRoles } from "../middleware/permissions.js";
import { refreshPurchaseOrderStatusesByApPaymentId } from "../utils/purchaseOrderStatus.js";

const router = express.Router();

async function validateApPaymentApplications(client, supplierId, applications, excludePaymentId = null) {
  const validatedApplications = [];

  for (const app of applications) {
    const requestedAmount = Number(app.amount || 0);

    if (!app.ap_invoice_id || requestedAmount <= 0) {
      const error = new Error(
        "Each payment application requires an invoice and amount greater than zero."
      );
      error.status = 400;
      throw error;
    }

    const invoiceResult = await client.query(
      `
      WITH invoice_total AS (
        SELECT
          api.ap_invoice_id,
          api.supplier_id,
          COALESCE(SUM(apil.qty * apil.unit_price), 0)::numeric AS invoice_total
        FROM pur.ap_invoice api
        LEFT JOIN pur.ap_invoice_line apil
          ON apil.ap_invoice_id = api.ap_invoice_id
        WHERE api.ap_invoice_id = $1
        GROUP BY api.ap_invoice_id, api.supplier_id
      ),
      applied_total AS (
        SELECT
          pa.ap_invoice_id,
          COALESCE(SUM(pa.amount), 0)::numeric AS amount_paid
        FROM pur.ap_payment_apply pa
        JOIN pur.ap_payment p
          ON p.ap_payment_id = pa.ap_payment_id
        WHERE pa.ap_invoice_id = $1
          AND p.posted_journal_id IS NOT NULL
          AND p.reversal_journal_id IS NULL
          AND ($2::uuid IS NULL OR pa.ap_payment_id <> $2::uuid)
        GROUP BY pa.ap_invoice_id
      )
      SELECT
        it.ap_invoice_id,
        it.supplier_id,
        it.invoice_total,
        COALESCE(at.amount_paid, 0)::numeric AS amount_paid,
        (it.invoice_total - COALESCE(at.amount_paid, 0))::numeric AS balance
      FROM invoice_total it
      LEFT JOIN applied_total at
        ON at.ap_invoice_id = it.ap_invoice_id;
      `,
      [app.ap_invoice_id, excludePaymentId || null]
    );

    if (invoiceResult.rowCount === 0) {
      const error = new Error("One of the selected supplier invoices was not found.");
      error.status = 404;
      throw error;
    }

    const invoice = invoiceResult.rows[0];

    if (String(invoice.supplier_id) !== String(supplierId)) {
      const error = new Error("Selected invoice does not belong to the selected supplier.");
      error.status = 400;
      throw error;
    }

    const invoiceBalance = Number(invoice.balance || 0);

    if (invoiceBalance <= 0) {
      const error = new Error("One of the selected invoices has no open balance.");
      error.status = 400;
      throw error;
    }

    if (requestedAmount > invoiceBalance) {
      const error = new Error(
        `Applied amount cannot exceed invoice balance. Invoice balance is ${invoiceBalance}.`
      );
      error.status = 400;
      throw error;
    }

    validatedApplications.push({
      ap_invoice_id: app.ap_invoice_id,
      amount: requestedAmount,
      invoice_total: Number(invoice.invoice_total || 0),
      amount_paid: Number(invoice.amount_paid || 0),
      balance: invoiceBalance
    });
  }

  return validatedApplications;
}

function getApPaymentErrorStatus(error, fallbackStatus = 500) {
  const code = String(error?.code || "");

  if (Number(error?.status) >= 400) return Number(error.status);
  if (Number(error?.statusCode) >= 400) return Number(error.statusCode);

  // PostgreSQL business-rule exceptions raised from functions.
  if (code === "P0001") return 400;

  // Unique violation.
  if (code === "23505") return 409;

  // Common user/data errors.
  if (["23502", "23503", "22P02", "22003"].includes(code)) return 400;

  return fallbackStatus;
}

function getApPaymentErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();

  if (message) return message;

  return fallbackMessage;
}

function sendApPaymentError(res, error, fallbackMessage, fallbackStatus = 500) {
  const status = getApPaymentErrorStatus(error, fallbackStatus);
  const message = getApPaymentErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null
  });
}

/**
 * PHASE 4 NOTE:
 * Unlike sal.ar_payment_apply, the backdate columns for supplier payments
 * (transaction_date, backdate_flag, backdate_reason, backdate_approved_by,
 * backdate_approved_at) live on the pur.ap_payment HEADER, matching the
 * actual migration that was run. This mirrors the pattern used in
 * deliveries.routes.js and apInvoices.routes.js.
 */

/**
 * GET /api/ap-payments
 * Lists supplier payments with supplier name and applied amount.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.ap_payment_id,
        p.payment_no,
        p.supplier_id,
        s.party_name AS supplier_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        p.reversal_journal_id,
        p.status,
        p.void_reason,
        p.voided_at,
        p.voided_by,
        p.transaction_date,
        p.backdate_flag,
        p.backdate_reason,
        p.backdate_approved_by,
        p.backdate_approved_at,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted,
        COALESCE(SUM(CASE WHEN p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL THEN pa.amount ELSE 0 END), 0) AS applied_amount,
        p.amount - COALESCE(SUM(CASE WHEN p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL THEN pa.amount ELSE 0 END), 0) AS unapplied_amount
      FROM pur.ap_payment p
      LEFT JOIN app.party s
        ON s.party_id = p.supplier_id
      LEFT JOIN pur.ap_payment_apply pa
        ON pa.ap_payment_id = p.ap_payment_id
      GROUP BY
        p.ap_payment_id,
        p.payment_no,
        p.supplier_id,
        s.party_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        p.reversal_journal_id,
        p.status,
        p.void_reason,
        p.voided_at,
        p.voided_by,
        p.transaction_date,
        p.backdate_flag,
        p.backdate_reason,
        p.backdate_approved_by,
        p.backdate_approved_at
      ORDER BY p.created_at DESC, p.payment_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      ap_payments: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load supplier payments.",
      error: error.message,
    });
  }
});

/**
 * GET /api/ap-payments/reports/summary
 * Dashboard-ready AP payment summary.
 */
router.get("/reports/summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.ap_payment_id,
        p.payment_no,
        p.supplier_id,
        s.party_name AS supplier_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        p.reversal_journal_id,
        p.status,
        p.void_reason,
        p.voided_at,
        p.voided_by,
        p.transaction_date,
        p.backdate_flag,
        p.backdate_reason,
        p.backdate_approved_by,
        p.backdate_approved_at,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted,

        COUNT(CASE WHEN p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL THEN pa.ap_invoice_id END) AS invoice_count,
        COALESCE(SUM(CASE WHEN p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL THEN pa.amount ELSE 0 END), 0) AS applied_amount,
        p.amount - COALESCE(SUM(CASE WHEN p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL THEN pa.amount ELSE 0 END), 0) AS unapplied_amount,

        STRING_AGG(CASE WHEN p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL THEN ai.invoice_no END, ', ' ORDER BY ai.invoice_no) AS applied_invoices

      FROM pur.ap_payment p
      LEFT JOIN app.party s
        ON s.party_id = p.supplier_id
      LEFT JOIN pur.ap_payment_apply pa
        ON pa.ap_payment_id = p.ap_payment_id
      LEFT JOIN pur.ap_invoice ai
        ON ai.ap_invoice_id = pa.ap_invoice_id
      GROUP BY
        p.ap_payment_id,
        p.payment_no,
        p.supplier_id,
        s.party_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        p.reversal_journal_id,
        p.status,
        p.void_reason,
        p.voided_at,
        p.voided_by,
        p.transaction_date,
        p.backdate_flag,
        p.backdate_reason,
        p.backdate_approved_by,
        p.backdate_approved_at
      ORDER BY p.created_at DESC, p.payment_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load AP payment summary.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/ap-payments/:paymentId
 * Gets one supplier payment with invoice applications.
 */
router.get("/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    const headerResult = await query(
      `
      SELECT
        p.ap_payment_id,
        p.payment_no,
        p.supplier_id,
        s.party_name AS supplier_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        p.reversal_journal_id,
        p.status,
        p.void_reason,
        p.voided_at,
        p.voided_by,
        p.transaction_date,
        p.backdate_flag,
        p.backdate_reason,
        p.backdate_approved_by,
        p.backdate_approved_at,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted
      FROM pur.ap_payment p
      LEFT JOIN app.party s
        ON s.party_id = p.supplier_id
      WHERE p.ap_payment_id = $1;
      `,
      [paymentId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Supplier payment not found.",
      });
    }

    const applicationsResult = await query(
      `
      WITH invoice_totals AS (
        SELECT
          api.ap_invoice_id,
          COALESCE(SUM(apil.qty * apil.unit_price), 0)::numeric AS invoice_total
        FROM pur.ap_invoice api
        LEFT JOIN pur.ap_invoice_line apil
          ON apil.ap_invoice_id = api.ap_invoice_id
        GROUP BY api.ap_invoice_id
      ),
      applied_totals AS (
        SELECT
          ap_invoice_id,
          COALESCE(SUM(amount), 0)::numeric AS amount_paid
        FROM pur.ap_payment_apply
        GROUP BY ap_invoice_id
      )
      SELECT
        pa.ap_payment_id,
        pa.ap_invoice_id,
        ai.invoice_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        it.invoice_total,
        COALESCE(at.amount_paid, 0)::numeric AS amount_paid,
        (it.invoice_total - COALESCE(at.amount_paid, 0))::numeric AS invoice_balance,
        pa.amount AS applied_amount
      FROM pur.ap_payment_apply pa
      LEFT JOIN pur.ap_invoice ai
        ON ai.ap_invoice_id = pa.ap_invoice_id
      LEFT JOIN invoice_totals it
        ON it.ap_invoice_id = ai.ap_invoice_id
      LEFT JOIN applied_totals at
        ON at.ap_invoice_id = ai.ap_invoice_id
      WHERE pa.ap_payment_id = $1
      ORDER BY ai.invoice_date, ai.invoice_no;
      `,
      [paymentId]
    );

    res.json({
      success: true,
      ap_payment: headerResult.rows[0],
      applications: applicationsResult.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load supplier payment.",
      error: error.message,
    });
  }
});

/**
 * GET /api/ap-payments/supplier/:supplierId/open-invoices
 * Lists unpaid supplier invoices for one supplier.
 *
 * PHASE 4: ordered by business date (transaction_date) ascending for true
 * FIFO allocation, not by due_date.
 */
router.get("/supplier/:supplierId/open-invoices", async (req, res) => {
  try {
    const { supplierId } = req.params;

    const result = await query(
      `
      WITH invoice_totals AS (
        SELECT
          api.ap_invoice_id,
          COALESCE(SUM(apil.qty * apil.unit_price), 0) AS invoice_total
        FROM pur.ap_invoice api
        LEFT JOIN pur.ap_invoice_line apil
          ON apil.ap_invoice_id = api.ap_invoice_id
        GROUP BY api.ap_invoice_id
      ),
      applied_totals AS (
        SELECT
          pa.ap_invoice_id,
          COALESCE(SUM(pa.amount), 0) AS amount_paid
        FROM pur.ap_payment_apply pa
        JOIN pur.ap_payment p
          ON p.ap_payment_id = pa.ap_payment_id
        WHERE p.posted_journal_id IS NOT NULL
          AND p.reversal_journal_id IS NULL
        GROUP BY pa.ap_invoice_id
      )
      SELECT
        api.ap_invoice_id,
        api.invoice_no,
        api.invoice_date,
        api.due_date,
        api.status,
        api.transaction_date,
        api.backdate_flag,
        api.backdate_reason,
        it.invoice_total,
        COALESCE(at.amount_paid, 0) AS amount_paid,
        it.invoice_total - COALESCE(at.amount_paid, 0) AS balance
      FROM pur.ap_invoice api
      JOIN invoice_totals it
        ON it.ap_invoice_id = api.ap_invoice_id
      LEFT JOIN applied_totals at
        ON at.ap_invoice_id = api.ap_invoice_id
      WHERE api.supplier_id = $1
        AND api.posted_journal_id IS NOT NULL
        AND it.invoice_total - COALESCE(at.amount_paid, 0) > 0
      ORDER BY COALESCE(api.transaction_date, api.created_at::date) ASC, api.ap_invoice_id ASC;
      `,
      [supplierId]
    );

    res.json({
      success: true,
      count: result.rowCount,
      open_invoices: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load supplier open invoices.",
      error: error.message,
    });
  }
});

/**
 * Shared backdate validation for POST and PATCH supplier payments.
 */
function resolveBackdateFields(req, { payment_date, transaction_date, backdate_flag, backdate_reason }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const finalTransactionDate = transaction_date || payment_date || todayStr;
  const isBackdated =
    backdate_flag === true ||
    (finalTransactionDate && finalTransactionDate < todayStr);

  const resolved = {
    finalTransactionDate,
    finalBackdateFlag: isBackdated,
    finalBackdateReason: isBackdated ? backdate_reason : null,
    finalBackdateApprovedBy: isBackdated ? (req.user?.user_id || null) : null,
    finalBackdateApprovedAt: isBackdated ? new Date() : null,
  };

  if (isBackdated) {
    const roles = getUserRoles(req);
    if (!roles.includes("ADMIN") && !roles.includes("MANAGER")) {
      const error = new Error(
        "Only ADMIN or MANAGER roles are authorized to create backdated supplier payments."
      );
      error.status = 403;
      throw error;
    }
    if (!resolved.finalBackdateReason || !resolved.finalBackdateReason.trim()) {
      const error = new Error(
        "A backdate reason must be provided for backdated supplier payments."
      );
      error.status = 400;
      throw error;
    }
  }

  return resolved;
}

/**
 * POST /api/ap-payments
 * Creates a supplier payment and applies it to one or more invoices.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_AP_PAYMENT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        supplier_id,
        payment_date,
        amount,
        method,
        reference,
        applications,
        transaction_date,
        backdate_flag,
        backdate_reason,
      } = req.body || {};

      if (!supplier_id) {
        return res.status(400).json({
          success: false,
          message: "Supplier is required.",
        });
      }

      if (!payment_date) {
        return res.status(400).json({
          success: false,
          message: "Payment date is required.",
        });
      }

      if (Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Payment amount must be greater than zero.",
        });
      }

      if (!Array.isArray(applications) || applications.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one invoice application is required.",
        });
      }

      const totalApplied = applications.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );
      const paymentAmount = Number(amount);

      if (totalApplied <= 0) {
        return res.status(400).json({
          success: false,
          message: "Applied amount must be greater than zero.",
        });
      }

      if (totalApplied > paymentAmount) {
        return res.status(400).json({
          success: false,
          message: "Applied amount cannot exceed payment amount.",
        });
      }

      if (Math.abs(totalApplied - paymentAmount) > 0.01) {
        return res.status(400).json({
          success: false,
          message:
            "In Phase 1, the payment amount must equal the total amount applied to invoices before posting.",
        });
      }

      for (const app of applications) {
        if (!app.ap_invoice_id || Number(app.amount) <= 0) {
          return res.status(400).json({
            success: false,
            message:
              "Each application requires ap_invoice_id and amount greater than zero.",
          });
        }
      }

      let backdateFields;
      try {
        backdateFields = resolveBackdateFields(req, {
          payment_date,
          transaction_date,
          backdate_flag,
          backdate_reason,
        });
      } catch (backdateError) {
        return res.status(backdateError.status || 400).json({
          success: false,
          message: backdateError.message,
        });
      }

      await client.query("BEGIN");

      const validatedApplications = await validateApPaymentApplications(
        client,
        supplier_id,
        applications
      );

      const headerResult = await client.query(
        `
        INSERT INTO pur.ap_payment (
          ap_payment_id,
          payment_no,
          supplier_id,
          payment_date,
          amount,
          method,
          reference,
          created_at,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at
        )
        VALUES (
          gen_random_uuid(),
          'APP-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
          $1,
          $2,
          $3,
          $4,
          $5,
          now(),
          $6,
          $7,
          $8,
          $9,
          $10
        )
        RETURNING
          ap_payment_id,
          payment_no,
          supplier_id,
          payment_date,
          amount,
          method,
          reference,
          created_at,
          posted_journal_id,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at;
        `,
        [
          supplier_id,
          payment_date,
          Number(amount),
          method || "CASH",
          reference || null,
          backdateFields.finalTransactionDate,
          backdateFields.finalBackdateFlag,
          backdateFields.finalBackdateReason,
          backdateFields.finalBackdateApprovedBy,
          backdateFields.finalBackdateApprovedAt,
        ]
      );

      const payment = headerResult.rows[0];
      const createdApplications = [];

      for (const app of validatedApplications) {
        const appResult = await client.query(
          `
          INSERT INTO pur.ap_payment_apply (
            ap_payment_id,
            ap_invoice_id,
            amount
          )
          VALUES (
            $1,
            $2,
            $3
          )
          RETURNING
            ap_payment_id,
            ap_invoice_id,
            amount;
          `,
          [payment.ap_payment_id, app.ap_invoice_id, Number(app.amount)]
        );

        createdApplications.push(appResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Supplier payment created successfully.",
        ap_payment: payment,
        applications: createdApplications,
      });
        } catch (error) {
      await client.query("ROLLBACK");

      return sendApPaymentError(
        res,
        error,
        "Failed to create supplier payment.",
        500
      );
    } finally {
      client.release();
    }
  }
);


/**
 * PATCH /api/ap-payments/:paymentId
 * Updates an unposted supplier payment and its invoice applications.
 */
router.patch(
  "/:paymentId",
  requireAuth,
  requirePermission("CREATE_AP_PAYMENT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { paymentId } = req.params;
      const {
        supplier_id,
        payment_date,
        amount,
        method,
        reference,
        applications,
        transaction_date,
        backdate_flag,
        backdate_reason,
      } = req.body || {};

      if (!supplier_id) {
        return res.status(400).json({
          success: false,
          message: "Supplier is required.",
        });
      }

      if (!payment_date) {
        return res.status(400).json({
          success: false,
          message: "Payment date is required.",
        });
      }

      if (Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Payment amount must be greater than zero.",
        });
      }

      if (!Array.isArray(applications) || applications.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one invoice application is required.",
        });
      }

      const totalApplied = applications.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );
      const paymentAmount = Number(amount);

      if (totalApplied <= 0) {
        return res.status(400).json({
          success: false,
          message: "Applied amount must be greater than zero.",
        });
      }

      if (totalApplied > paymentAmount) {
        return res.status(400).json({
          success: false,
          message: "Applied amount cannot exceed payment amount.",
        });
      }

      if (Math.abs(totalApplied - paymentAmount) > 0.01) {
        return res.status(400).json({
          success: false,
          message:
            "In Phase 1, the payment amount must equal the total amount applied to invoices before posting.",
        });
      }

      let backdateFields;
      try {
        backdateFields = resolveBackdateFields(req, {
          payment_date,
          transaction_date,
          backdate_flag,
          backdate_reason,
        });
      } catch (backdateError) {
        return res.status(backdateError.status || 400).json({
          success: false,
          message: backdateError.message,
        });
      }

      await client.query("BEGIN");

      const existingResult = await client.query(
        `
        SELECT ap_payment_id, posted_journal_id
        FROM pur.ap_payment
        WHERE ap_payment_id = $1::uuid;
        `,
        [paymentId]
      );

      if (existingResult.rowCount === 0) {
        const error = new Error("Supplier payment not found.");
        error.status = 404;
        throw error;
      }

      if (existingResult.rows[0].posted_journal_id) {
        const error = new Error("Posted supplier payments cannot be edited.");
        error.status = 400;
        throw error;
      }

      const validatedApplications = await validateApPaymentApplications(
        client,
        supplier_id,
        applications,
        paymentId
      );

      const updateResult = await client.query(
        `
        UPDATE pur.ap_payment
        SET
          supplier_id = $2,
          payment_date = $3,
          amount = $4,
          method = $5,
          reference = $6,
          transaction_date = $7,
          backdate_flag = $8,
          backdate_reason = $9,
          backdate_approved_by = $10,
          backdate_approved_at = $11
        WHERE ap_payment_id = $1::uuid
          AND posted_journal_id IS NULL
        RETURNING
          ap_payment_id,
          payment_no,
          supplier_id,
          payment_date,
          amount,
          method,
          reference,
          created_at,
          posted_journal_id,
          transaction_date,
          backdate_flag,
          backdate_reason,
          backdate_approved_by,
          backdate_approved_at;
        `,
        [
          paymentId,
          supplier_id,
          payment_date,
          Number(amount),
          method || "CASH",
          reference || null,
          backdateFields.finalTransactionDate,
          backdateFields.finalBackdateFlag,
          backdateFields.finalBackdateReason,
          backdateFields.finalBackdateApprovedBy,
          backdateFields.finalBackdateApprovedAt,
        ]
      );

      await client.query(
        "DELETE FROM pur.ap_payment_apply WHERE ap_payment_id = $1::uuid;",
        [paymentId]
      );

      const createdApplications = [];

      for (const app of validatedApplications) {
        const appResult = await client.query(
          `
          INSERT INTO pur.ap_payment_apply (
            ap_payment_id,
            ap_invoice_id,
            amount
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3
          )
          RETURNING
            ap_payment_id,
            ap_invoice_id,
            amount;
          `,
          [paymentId, app.ap_invoice_id, Number(app.amount)]
        );

        createdApplications.push(appResult.rows[0]);
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Supplier payment updated successfully.",
        ap_payment: updateResult.rows[0],
        applications: createdApplications,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendApPaymentError(
        res,
        error,
        "Failed to update supplier payment.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * DELETE /api/ap-payments/:paymentId
 * Deletes an unposted supplier payment and its invoice applications.
 */
router.delete(
  "/:paymentId",
  requireAuth,
  requirePermission("CREATE_AP_PAYMENT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { paymentId } = req.params;

      await client.query("BEGIN");

      const existingResult = await client.query(
        `
        SELECT
          ap_payment_id,
          payment_no,
          posted_journal_id
        FROM pur.ap_payment
        WHERE ap_payment_id = $1::uuid;
        `,
        [paymentId]
      );

      if (existingResult.rowCount === 0) {
        const error = new Error("Supplier payment not found.");
        error.status = 404;
        throw error;
      }

      if (existingResult.rows[0].posted_journal_id) {
        const error = new Error("Posted supplier payments cannot be deleted.");
        error.status = 400;
        throw error;
      }

      await client.query(
        "DELETE FROM pur.ap_payment_apply WHERE ap_payment_id = $1::uuid;",
        [paymentId]
      );

      await client.query(
        `
        DELETE FROM pur.ap_payment
        WHERE ap_payment_id = $1::uuid
          AND posted_journal_id IS NULL;
        `,
        [paymentId]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: `Supplier payment ${existingResult.rows[0].payment_no} deleted successfully.`,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendApPaymentError(
        res,
        error,
        "Failed to delete supplier payment.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/ap-payments/:paymentId/post
 * Posts supplier payment using existing PostgreSQL function.
 *
 * NOTE:
 * This uses CREATE_AP_PAYMENT because your current permission map does not yet
 * define POST_AP_PAYMENT. If you want stricter separation later, add
 * POST_AP_PAYMENT to permissions.js and frontend permissions.ts.
 */
router.post(
  "/:paymentId/post",
  requireAuth,
  requirePermission("CREATE_AP_PAYMENT"),
  async (req, res) => {
    try {
      const { paymentId } = req.params;

      const result = await query(
        "SELECT pur.post_ap_payment($1::uuid) AS result;",
        [paymentId]
      );

      const purchaseOrderStatuses =
        await refreshPurchaseOrderStatusesByApPaymentId({ query }, paymentId);

      res.json({
        success: true,
        message: "Supplier payment posted successfully.",
        result: result.rows[0]?.result ?? null,
        purchase_order_statuses: purchaseOrderStatuses,
      });
        } catch (error) {
      return sendApPaymentError(
        res,
        error,
        "Failed to post supplier payment.",
        500
      );
    }
  }
);

router.post(
  "/:paymentId/void",
  requireAuth,
  requirePermission("CREATE_AP_PAYMENT"),
  async (req, res) => {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body || {};
      const trimmedReason = typeof reason === "string" ? reason.trim() : "";

      if (!trimmedReason) {
        return res.status(400).json({
          success: false,
          message: "Void reason is required.",
        });
      }

      const userId = req.user?.user_id || req.user?.id || null;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authenticated user is required to void an AP payment.",
        });
      }

      await query("SELECT set_config('app.current_user_id', $1::text, true);", [
        String(userId),
      ]);

      const result = await query(
        "SELECT * FROM pur.void_ap_payment($1::uuid, $2::text);",
        [paymentId, trimmedReason]
      );

      const row = result.rows[0];
      if (!row) {
        return res.status(404).json({
          success: false,
          message: "AP payment void operation did not return a result.",
        });
      }

      return res.json({
        success: true,
        payment_id: row.ap_payment_id,
        original_journal_id: row.original_journal_id,
        reversal_journal_id: row.reversal_journal_id,
        status: row.status,
        void_reason: row.void_reason,
        voided_at: row.voided_at,
        voided_by: row.voided_by,
        message: "Supplier payment voided successfully.",
      });
    } catch (error) {
      return sendApPaymentError(
        res,
        error,
        "Failed to void supplier payment.",
        500
      );
    }
  }
);

export default router;
