import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, getUserRoles } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

const router = express.Router();
router.use(requireAuth,requireLocationAccessWhenSpecified);
const allBranches=(req)=>getUserRoles(req).includes("HEAD_OFFICE");
const allLocations=(req)=>getUserRoles(req).some((role)=>["ADMIN","MANAGER","AUDITOR","HEAD_OFFICE"].includes(role));
async function assertArApplicationScope(req,applications){
  for(const app of applications||[]){
    const r=await query(`SELECT loc.location_id,loc.branch_id FROM sal.ar_invoice ai LEFT JOIN sal.delivery d ON d.delivery_id=ai.delivery_id LEFT JOIN sal.pos_sale ps ON ps.credit_ar_invoice_id=ai.ar_invoice_id LEFT JOIN app.location loc ON loc.location_id=COALESCE(d.location_id,ps.location_id) WHERE ai.ar_invoice_id=$1`,[app.ar_invoice_id]);
    if(!r.rowCount)continue;
    const row=r.rows[0];
    if(!row.branch_id&&!allBranches(req))throw Object.assign(new Error("Invoice has no branch context; only HEAD_OFFICE may apply payment."),{status:403});
    if(!allBranches(req)&&row.branch_id!==req.branchId)throw Object.assign(new Error("Payment applications must belong to the active branch."),{status:403});
    if(row.location_id&&!allLocations(req)&&!(await query(`SELECT 1 FROM sec.user_location WHERE user_id=$1 AND location_id=$2 AND is_active`,[req.user?.user_id,row.location_id])).rowCount)throw Object.assign(new Error("You are not authorized for an applied invoice location."),{status:403});
  }
}
router.param("paymentId",async(req,res,next,value)=>{try{const r=await query(`SELECT branch_id FROM sal.ar_payment WHERE ar_payment_id=$1`,[value]);if(!r.rowCount)return res.status(404).json({success:false,message:"Customer payment not found."});if(!allBranches(req)&&r.rows[0].branch_id!==req.branchId)return res.status(403).json({success:false,message:"You are not authorized for this receipt branch."});next();}catch(error){next(error);}});
function getArPaymentErrorStatus(error, fallbackStatus = 500) {
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

function getArPaymentErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();

  if (message) return message;

  return fallbackMessage;
}

function sendArPaymentError(res, error, fallbackMessage, fallbackStatus = 500) {
  const status = getArPaymentErrorStatus(error, fallbackStatus);
  const message = getArPaymentErrorMessage(error, fallbackMessage);

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
 * The backdate columns (transaction_date, backdate_flag, backdate_reason,
 * backdate_approved_by, backdate_approved_at) live on sal.ar_payment_apply
 * (one row per invoice application), NOT on sal.ar_payment itself. This
 * matches the actual migration that was run. Because a single receipt can
 * have multiple applications, we treat backdate_flag as "any application on
 * this receipt is backdated" (bool_or) when summarizing at the receipt level.
 */

/**
 * GET /api/ar-payments
 * Lists customer payments with customer name and applied amount.
 */
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.ar_payment_id,
        p.receipt_no,
        p.customer_id,
        c.party_name AS customer_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted,
        COALESCE(SUM(pa.amount), 0) AS applied_amount,
        p.amount - COALESCE(SUM(pa.amount), 0) AS unapplied_amount,
        COALESCE(bool_or(pa.backdate_flag), false) AS backdate_flag,
        MAX(pa.transaction_date) AS transaction_date
      FROM sal.ar_payment p
      LEFT JOIN app.party c
        ON c.party_id = p.customer_id
      LEFT JOIN sal.ar_payment_apply pa
        ON pa.ar_payment_id = p.ar_payment_id
      WHERE (p.branch_id=$1 OR $2::boolean)
      GROUP BY
        p.ar_payment_id,
        p.receipt_no,
        p.customer_id,
        c.party_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id
      ORDER BY p.created_at DESC, p.receipt_no DESC;
    `,[req.branchId,allBranches(req)]);

    res.json({
      success: true,
      count: result.rowCount,
      ar_payments: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load customer payments.",
      error: error.message
    });
  }
});

/**
 * GET /api/ar-payments/reports/summary
 * Dashboard-ready AR payment summary.
 */
router.get("/reports/summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.ar_payment_id,
        p.receipt_no,
        p.customer_id,
        c.party_name AS customer_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted,

        COUNT(pa.ar_invoice_id) AS invoice_count,
        COALESCE(SUM(pa.amount), 0) AS applied_amount,
        p.amount - COALESCE(SUM(pa.amount), 0) AS unapplied_amount,
        COALESCE(bool_or(pa.backdate_flag), false) AS backdate_flag,
        MAX(pa.transaction_date) AS transaction_date,

        STRING_AGG(ai.invoice_no, ', ' ORDER BY ai.invoice_no) AS applied_invoices

      FROM sal.ar_payment p
      LEFT JOIN app.party c
        ON c.party_id = p.customer_id
      LEFT JOIN sal.ar_payment_apply pa
        ON pa.ar_payment_id = p.ar_payment_id
      LEFT JOIN sal.ar_invoice ai
        ON ai.ar_invoice_id = pa.ar_invoice_id
      WHERE (p.branch_id=$1 OR $2::boolean)
      GROUP BY
        p.ar_payment_id,
        p.receipt_no,
        p.customer_id,
        c.party_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id
      ORDER BY p.created_at DESC, p.receipt_no DESC;
    `,[req.branchId,allBranches(req)]);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load AR payment summary.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/ar-payments/:paymentId
 * Gets one payment with invoice applications.
 */
router.get("/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    const headerResult = await query(
      `
      SELECT
        p.ar_payment_id,
        p.receipt_no,
        p.customer_id,
        c.party_name AS customer_name,
        p.payment_date,
        p.amount,
        p.method,
        p.reference,
        p.created_at,
        p.posted_journal_id,
        CASE
          WHEN p.posted_journal_id IS NULL THEN false
          ELSE true
        END AS is_posted
      FROM sal.ar_payment p
      LEFT JOIN app.party c
        ON c.party_id = p.customer_id
      WHERE p.ar_payment_id = $1 AND (p.branch_id=$2 OR $3::boolean);
      `,
      [paymentId,req.branchId,allBranches(req)]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer payment not found."
      });
    }

    const applicationsResult = await query(
      `
      SELECT
        pa.ar_payment_id,
        pa.ar_invoice_id,
        ai.invoice_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        pa.amount AS applied_amount,
        pa.transaction_date,
        pa.backdate_flag,
        pa.backdate_reason,
        pa.backdate_approved_by,
        pa.backdate_approved_at
      FROM sal.ar_payment_apply pa
      LEFT JOIN sal.ar_invoice ai
        ON ai.ar_invoice_id = pa.ar_invoice_id
      WHERE pa.ar_payment_id = $1
      ORDER BY ai.invoice_date, ai.invoice_no;
      `,
      [paymentId]
    );

    res.json({
      success: true,
      ar_payment: headerResult.rows[0],
      applications: applicationsResult.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load customer payment.",
      error: error.message
    });
  }
});

/**
 * GET /api/ar-payments/customer/:customerId/open-invoices
 * Lists open/unpaid invoices for one customer.
 *
 * PHASE 4: ordered by business date (transaction_date) ascending so the
 * frontend presents invoices in true FIFO order, not by due_date.
 */
router.get("/customer/:customerId/open-invoices", async (req, res) => {
  try {
    const { customerId } = req.params;

    const result = await query(
      `
      WITH invoice_totals AS (
        SELECT
          ai.ar_invoice_id,
          COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0) AS invoice_total
        FROM sal.ar_invoice ai
        LEFT JOIN sal.ar_invoice_line ail
          ON ail.ar_invoice_id = ai.ar_invoice_id
        GROUP BY ai.ar_invoice_id
      ),
      applied_totals AS (
        SELECT
          ar_invoice_id,
          COALESCE(SUM(amount), 0) AS amount_paid
        FROM sal.ar_payment_apply
        GROUP BY ar_invoice_id
      )
      SELECT
        ai.ar_invoice_id,
        ai.invoice_no,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.transaction_date,
        ai.backdate_flag,
        ai.backdate_reason,
        it.invoice_total,
        COALESCE(at.amount_paid, 0) AS amount_paid,
        it.invoice_total - COALESCE(at.amount_paid, 0) AS balance
      FROM sal.ar_invoice ai
      JOIN invoice_totals it
        ON it.ar_invoice_id = ai.ar_invoice_id
      LEFT JOIN applied_totals at
        ON at.ar_invoice_id = ai.ar_invoice_id
      WHERE ai.customer_id = $1
        AND COALESCE(ai.status, 'OPEN') <> 'VOID'
        AND ai.posted_journal_id IS NOT NULL
        AND it.invoice_total - COALESCE(at.amount_paid, 0) > 0
      ORDER BY COALESCE(ai.transaction_date, ai.created_at::date) ASC, ai.ar_invoice_id ASC;
      `,
      [customerId]
    );

    res.json({
      success: true,
      count: result.rowCount,
      open_invoices: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load customer open invoices.",
      error: error.message
    });
  }
});

/**
 * POST /api/ar-payments
 * Creates a customer payment and applies it to one or more invoices.
 *
 * PHASE 4: accepts transaction_date, backdate_flag, backdate_reason. Because
 * the backdate columns live on sal.ar_payment_apply, the same business date /
 * backdate metadata is stamped onto every application row created for this
 * receipt.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_RECEIPT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        customer_id,
        payment_date,
        amount,
        method,
        reference,
        applications,
        transaction_date,
        backdate_flag,
        backdate_reason
      } = req.body || {};

      if (!customer_id) {
        return res.status(400).json({
          success: false,
          message: "Customer is required."
        });
      }

      if (!payment_date) {
        return res.status(400).json({
          success: false,
          message: "Payment date is required."
        });
      }

      if (Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Payment amount must be greater than zero."
        });
      }

      if (!Array.isArray(applications) || applications.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one invoice application is required."
        });
      }

      const totalApplied = applications.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      if (totalApplied <= 0) {
        return res.status(400).json({
          success: false,
          message: "Applied amount must be greater than zero."
        });
      }

      if (totalApplied > Number(amount)) {
        return res.status(400).json({
          success: false,
          message: "Applied amount cannot exceed payment amount."
        });
      }

      for (const app of applications) {
        if (!app.ar_invoice_id || Number(app.amount) <= 0) {
          return res.status(400).json({
            success: false,
            message:
              "Each application requires ar_invoice_id and amount greater than zero."
          });
        }
      }

      await assertArApplicationScope(req, applications);

      // ----- PHASE 4: backdate validation -----
      const todayStr = new Date().toISOString().split("T")[0];
      const finalTransactionDate = transaction_date || payment_date || todayStr;
      const isBackdated =
        backdate_flag === true ||
        (finalTransactionDate && finalTransactionDate < todayStr);
      const finalBackdateFlag = isBackdated;
      const finalBackdateReason = isBackdated ? backdate_reason : null;
      const finalBackdateApprovedBy = isBackdated ? (req.user?.user_id || null) : null;
      const finalBackdateApprovedAt = isBackdated ? new Date() : null;

      if (isBackdated) {
        const roles = getUserRoles(req);
        if (!roles.includes("ADMIN") && !roles.includes("MANAGER")) {
          return res.status(403).json({
            success: false,
            message: "Only ADMIN or MANAGER roles are authorized to create backdated receipts."
          });
        }
        if (!finalBackdateReason || !finalBackdateReason.trim()) {
          return res.status(400).json({
            success: false,
            message: "A backdate reason must be provided for backdated receipts."
          });
        }
      }

      const validationResult = await client.query(
        `
        WITH invoice_totals AS (
          SELECT
            ai.ar_invoice_id,
            ai.customer_id,
            ai.invoice_no,
            COALESCE(
              SUM(
                COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0)
                * COALESCE(ail.unit_price, 0)
              ),
              0
            ) AS invoice_total
          FROM sal.ar_invoice ai
          LEFT JOIN sal.ar_invoice_line ail
            ON ail.ar_invoice_id = ai.ar_invoice_id
          WHERE ai.ar_invoice_id = ANY($1::uuid[])
          GROUP BY ai.ar_invoice_id, ai.customer_id, ai.invoice_no
        ),
        applied_totals AS (
          SELECT
            ar_invoice_id,
            COALESCE(SUM(amount), 0) AS amount_paid
          FROM sal.ar_payment_apply
          WHERE ar_invoice_id = ANY($1::uuid[])
          GROUP BY ar_invoice_id
        )
        SELECT
          it.ar_invoice_id,
          it.customer_id,
          it.invoice_no,
          it.invoice_total,
          COALESCE(at.amount_paid, 0) AS amount_paid,
          it.invoice_total - COALESCE(at.amount_paid, 0) AS open_balance
        FROM invoice_totals it
        LEFT JOIN applied_totals at
          ON at.ar_invoice_id = it.ar_invoice_id;
        `,
        [applications.map((item) => item.ar_invoice_id)]
      );

      const invoiceBalanceMap = new Map(
        validationResult.rows.map((row) => [String(row.ar_invoice_id), row])
      );

      for (const app of applications) {
        const row = invoiceBalanceMap.get(String(app.ar_invoice_id));

        if (!row) {
          return res.status(400).json({
            success: false,
            message: "One or more selected invoices could not be found."
          });
        }

        if (String(row.customer_id) !== String(customer_id)) {
          return res.status(400).json({
            success: false,
            message: `Invoice ${row.invoice_no} does not belong to the selected customer.`
          });
        }

        if (Number(app.amount) > Number(row.open_balance)) {
          return res.status(400).json({
            success: false,
            message: `Applied amount for invoice ${row.invoice_no} cannot exceed its open balance. Open balance: ${row.open_balance}.`
          });
        }
      }

      await client.query("BEGIN");

      const receiptResult = await client.query(`
        SELECT sal.next_receipt_no() AS receipt_no;
      `);

      const receiptNo = receiptResult.rows[0]?.receipt_no;

      const headerResult = await client.query(
        `
        INSERT INTO sal.ar_payment (
          ar_payment_id,
          branch_id,
          receipt_no,
          customer_id,
          payment_date,
          amount,
          method,
          reference,
          created_at
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
          now()
        )
        RETURNING
          ar_payment_id,
          branch_id,
          receipt_no,
          customer_id,
          payment_date,
          amount,
          method,
          reference,
          created_at,
          posted_journal_id;
        `,
        [
          req.branchId,
          receiptNo,
          customer_id,
          payment_date,
          Number(amount),
          method || "CASH",
          reference || null
        ]
      );

      const payment = headerResult.rows[0];
      const createdApplications = [];

      for (const app of applications) {
        const appResult = await client.query(
          `
          INSERT INTO sal.ar_payment_apply (
            ar_payment_id,
            ar_invoice_id,
            amount,
            transaction_date,
            backdate_flag,
            backdate_reason,
            backdate_approved_by,
            backdate_approved_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )
          RETURNING
            ar_payment_id,
            ar_invoice_id,
            amount,
            transaction_date,
            backdate_flag,
            backdate_reason,
            backdate_approved_by,
            backdate_approved_at;
          `,
          [
            payment.ar_payment_id,
            app.ar_invoice_id,
            Number(app.amount),
            finalTransactionDate,
            finalBackdateFlag,
            finalBackdateReason,
            finalBackdateApprovedBy,
            finalBackdateApprovedAt
          ]
        );

        createdApplications.push(appResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Customer payment created successfully.",
        ar_payment: payment,
        applications: createdApplications
      });
        } catch (error) {
      await client.query("ROLLBACK");

      return sendArPaymentError(
        res,
        error,
        "Failed to create customer payment.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/ar-payments/:receiptNo/post
 * Posts customer payment using existing PostgreSQL function.
 *
 * NOTE:
 * This uses CREATE_RECEIPT because your current permission map does not yet
 * define POST_RECEIPT. If you want stricter separation later, add POST_RECEIPT
 * to permissions.js and frontend permissions.ts.
 */
router.post(
  "/:receiptNo/post",
  requireAuth,
  requirePermission("CREATE_RECEIPT"),
  async (req, res) => {
    try {
      const { receiptNo } = req.params;

      const result = await query(
        "SELECT sal.post_ar_payment_by_receipt_no($1) AS result;",
        [receiptNo]
      );

      res.json({
        success: true,
        message: "Customer payment posted successfully.",
        result: result.rows[0]?.result ?? null
      });
        } catch (error) {
      return sendArPaymentError(
        res,
        error,
        "Failed to post customer payment.",
        500
      );
    }
  }
);


/**
 * DELETE /api/ar-payments/:paymentId
 * Deletes an unposted customer receipt and its invoice applications.
 */
router.delete(
  "/:paymentId",
  requireAuth,
  requirePermission("CREATE_RECEIPT"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { paymentId } = req.params;

      await client.query("BEGIN");

      const paymentCheck = await client.query(
        `
        SELECT ar_payment_id, receipt_no, posted_journal_id
        FROM sal.ar_payment
        WHERE ar_payment_id = $1;
        `,
        [paymentId]
      );

      if (paymentCheck.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Customer receipt not found."
        });
      }

      const payment = paymentCheck.rows[0];

      if (payment.posted_journal_id) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Posted receipts cannot be deleted. Use a reversal workflow instead."
        });
      }

      await client.query(
        `
        DELETE FROM sal.ar_payment_apply
        WHERE ar_payment_id = $1;
        `,
        [paymentId]
      );

      await client.query(
        `
        DELETE FROM sal.ar_payment
        WHERE ar_payment_id = $1
          AND posted_journal_id IS NULL;
        `,
        [paymentId]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Unposted customer receipt deleted successfully.",
        receipt_no: payment.receipt_no
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendArPaymentError(
        res,
        error,
        "Failed to delete customer receipt.",
        500
      );
    } finally {
      client.release();
    }
  }
);


export default router;
