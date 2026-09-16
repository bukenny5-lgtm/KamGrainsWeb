import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

function getAccruedExpenseErrorStatus(error, fallbackStatus = 500) {
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

function getAccruedExpenseErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();

  if (message) return message;

  return fallbackMessage;
}

function sendAccruedExpenseError(
  res,
  error,
  fallbackMessage,
  fallbackStatus = 500
) {
  const status = getAccruedExpenseErrorStatus(error, fallbackStatus);
  const message = getAccruedExpenseErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null,
  });
}

/**
 * GET /api/accrued-expenses
 * Lists accrued expense documents with totals.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        accrued_expense_id,
        document_no,
        document_date,
        due_date,
        party_id,
        party_name,
        liability_account_id,
        liability_account_code,
        liability_account_name,
        status,
        notes,
        posted_journal_id,
        posted_journal_no,
        posted_at,
        payment_account_id,
        payment_account_code,
        payment_account_name,
        payment_method,
        payment_reference,
        paid_journal_id,
        paid_journal_no,
        paid_at,
        created_by,
        created_at,
        line_count,
        total_amount
      FROM fin.v_accrued_expense_summary
      ORDER BY created_at DESC, document_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    return sendAccruedExpenseError(
      res,
      error,
      "Failed to load accrued expenses.",
      500
    );
  }
});

/**
 * GET /api/accrued-expenses/next-no
 */
router.get("/next-no", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT fin.next_accrued_expense_no() AS document_no;
    `);

    res.json({
      success: true,
      document_no: result.rows[0]?.document_no,
    });
  } catch (error) {
    return sendAccruedExpenseError(
      res,
      error,
      "Failed to generate accrued expense number.",
      500
    );
  }
});

/**
 * GET /api/accrued-expenses/:documentNo
 * Gets one accrued expense with lines.
 */
router.get("/:documentNo", requireAuth, async (req, res) => {
  try {
    const { documentNo } = req.params;

    const headerResult = await query(
      `
      SELECT
        ae.accrued_expense_id,
        ae.document_no,
        ae.document_date,
        ae.due_date,
        ae.party_id,
        p.party_name,
        ae.liability_account_id,
        la.account_code AS liability_account_code,
        la.account_name AS liability_account_name,
        ae.status,
        ae.notes,
        ae.posted_journal_id,
        gj_post.journal_no AS posted_journal_no,
        ae.posted_at,
        ae.posted_by,
        ae.payment_account_id,
        pa.account_code AS payment_account_code,
        pa.account_name AS payment_account_name,
        ae.payment_method,
        ae.payment_reference,
        ae.paid_journal_id,
        gj_paid.journal_no AS paid_journal_no,
        ae.paid_at,
        ae.paid_by,
        ae.created_by,
        ae.created_at,
        ae.updated_at
      FROM fin.accrued_expense ae
      LEFT JOIN app.party p
        ON p.party_id = ae.party_id
      LEFT JOIN fin.gl_account la
        ON la.account_id = ae.liability_account_id
      LEFT JOIN fin.gl_account pa
        ON pa.account_id = ae.payment_account_id
      LEFT JOIN fin.gl_journal gj_post
        ON gj_post.journal_id = ae.posted_journal_id
      LEFT JOIN fin.gl_journal gj_paid
        ON gj_paid.journal_id = ae.paid_journal_id
      WHERE ae.document_no = $1;
      `,
      [documentNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Accrued expense document not found.",
      });
    }

    const header = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        ael.accrued_expense_line_id,
        ael.accrued_expense_id,
        ael.expense_account_id,
        ea.account_code AS expense_account_code,
        ea.account_name AS expense_account_name,
        ea.account_type AS expense_account_type,
        ael.description,
        ael.amount,
        ael.created_at
      FROM fin.accrued_expense_line ael
      JOIN fin.gl_account ea
        ON ea.account_id = ael.expense_account_id
      WHERE ael.accrued_expense_id = $1
      ORDER BY ea.account_code, ael.created_at;
      `,
      [header.accrued_expense_id]
    );

    const totalAmount = linesResult.rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    res.json({
      success: true,
      data: {
        ...header,
        lines: linesResult.rows,
        totals: {
          line_count: linesResult.rowCount,
          total_amount: totalAmount,
        },
      },
    });
  } catch (error) {
    return sendAccruedExpenseError(
      res,
      error,
      "Failed to load accrued expense document.",
      500
    );
  }
});

/**
 * POST /api/accrued-expenses
 * Creates accrued expense document with lines.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_EXPENSE_VOUCHER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        document_no,
        document_date,
        due_date = null,
        party_id = null,
        liability_account_id,
        notes = null,
        created_by = null,
        lines,
      } = req.body || {};

      if (!document_date) {
        return res.status(400).json({
          success: false,
          message: "document_date is required.",
        });
      }

      if (!liability_account_id) {
        return res.status(400).json({
          success: false,
          message: "liability_account_id is required.",
        });
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one accrued expense line is required.",
        });
      }

      for (const line of lines) {
        if (!line.expense_account_id) {
          return res.status(400).json({
            success: false,
            message: "Each line requires expense_account_id.",
          });
        }

        if (!line.description) {
          return res.status(400).json({
            success: false,
            message: "Each line requires description.",
          });
        }

        if (Number(line.amount) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Each line amount must be greater than zero.",
          });
        }
      }

      await client.query("BEGIN");

      const finalDocumentNoResult = await client.query(`
        SELECT fin.next_accrued_expense_no() AS document_no;
      `);

      const finalDocumentNo =
        document_no || finalDocumentNoResult.rows[0]?.document_no;

      const duplicateCheck = await client.query(
        `
        SELECT accrued_expense_id, document_no
        FROM fin.accrued_expense
        WHERE document_no = $1
        LIMIT 1;
        `,
        [finalDocumentNo]
      );

      if (duplicateCheck.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Accrued expense document number already exists.",
          existing_document: duplicateCheck.rows[0],
        });
      }

      const liabilityCheck = await client.query(
        `
        SELECT account_id, account_code, account_name, account_type, is_active
        FROM fin.gl_account
        WHERE account_id = $1;
        `,
        [liability_account_id]
      );

      if (liabilityCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Liability account not found.",
        });
      }

      const liabilityAccount = liabilityCheck.rows[0];

      if (liabilityAccount.account_type !== "LIABILITY") {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Accrued expense payable account must be a LIABILITY account.",
        });
      }

      if (liabilityAccount.is_active === false) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Inactive liability account cannot be used.",
        });
      }

      for (const line of lines) {
        const expenseCheck = await client.query(
          `
          SELECT account_id, account_code, account_name, account_type, is_active
          FROM fin.gl_account
          WHERE account_id = $1;
          `,
          [line.expense_account_id]
        );

        if (expenseCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            message: "One of the selected expense accounts was not found.",
          });
        }

        const expenseAccount = expenseCheck.rows[0];

        if (expenseAccount.account_type !== "EXPENSE") {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: `${expenseAccount.account_code} - ${expenseAccount.account_name} is not an EXPENSE account.`,
          });
        }

        if (expenseAccount.is_active === false) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: `${expenseAccount.account_code} - ${expenseAccount.account_name} is inactive.`,
          });
        }
      }

      const userId = req.user?.user_id || req.body?.user_id || created_by || null;

      const headerResult = await client.query(
        `
        INSERT INTO fin.accrued_expense (
          accrued_expense_id,
          document_no,
          document_date,
          due_date,
          party_id,
          liability_account_id,
          status,
          notes,
          created_by,
          created_at,
          updated_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          'DRAFT',
          $6,
          $7,
          now(),
          now()
        )
        RETURNING *;
        `,
        [
          finalDocumentNo,
          document_date,
          due_date || null,
          party_id || null,
          liability_account_id,
          notes,
          userId,
        ]
      );

      const header = headerResult.rows[0];
      const createdLines = [];

      for (const line of lines) {
        const lineResult = await client.query(
          `
          INSERT INTO fin.accrued_expense_line (
            accrued_expense_line_id,
            accrued_expense_id,
            expense_account_id,
            description,
            amount,
            created_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            now()
          )
          RETURNING *;
          `,
          [
            header.accrued_expense_id,
            line.expense_account_id,
            line.description,
            Number(line.amount),
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Accrued expense created successfully.",
        data: {
          ...header,
          lines: createdLines,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendAccruedExpenseError(
        res,
        error,
        "Failed to create accrued expense.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/accrued-expenses/:documentNo/post
 * Posts accrued expense.
 */
router.post(
  "/:documentNo/post",
  requireAuth,
  requirePermission("CREATE_EXPENSE_VOUCHER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { documentNo } = req.params;
      const userId = req.user?.user_id || req.body?.user_id || null;

      await client.query("BEGIN");

      const postResult = await client.query(
        `
        SELECT fin.post_accrued_expense_by_no($1, $2::uuid) AS journal_id;
        `,
        [documentNo, userId]
      );

      const postedDocument = await client.query(
        `
        SELECT *
        FROM fin.v_accrued_expense_summary
        WHERE document_no = $1;
        `,
        [documentNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Accrued expense posted successfully.",
        journal_id: postResult.rows[0]?.journal_id,
        data: postedDocument.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendAccruedExpenseError(
        res,
        error,
        "Failed to post accrued expense.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/accrued-expenses/:documentNo/pay
 * Pays posted accrued expense.
 */
router.post(
  "/:documentNo/pay",
  requireAuth,
  requirePermission("CREATE_EXPENSE_VOUCHER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { documentNo } = req.params;
      const {
        payment_account_id,
        payment_method = "CASH",
        payment_reference = null,
      } = req.body || {};

      if (!payment_account_id) {
        return res.status(400).json({
          success: false,
          message: "payment_account_id is required.",
        });
      }

      const normalizedMethod = String(payment_method || "CASH")
        .trim()
        .toUpperCase();

      if (!["CASH", "BANK", "MOBILE_MONEY", "CHEQUE"].includes(normalizedMethod)) {
        return res.status(400).json({
          success: false,
          message: "payment_method must be CASH, BANK, MOBILE_MONEY, or CHEQUE.",
        });
      }

      const userId = req.user?.user_id || req.body?.user_id || null;

      await client.query("BEGIN");

      const payResult = await client.query(
        `
        SELECT fin.pay_accrued_expense_by_no(
          $1::text,
          $2::uuid,
          $3::text,
          $4::text,
          $5::uuid
        ) AS journal_id;
        `,
        [
          documentNo,
          payment_account_id,
          normalizedMethod,
          payment_reference || null,
          userId,
        ]
      );

      const paidDocument = await client.query(
        `
        SELECT *
        FROM fin.v_accrued_expense_summary
        WHERE document_no = $1;
        `,
        [documentNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Accrued expense paid successfully.",
        journal_id: payResult.rows[0]?.journal_id,
        data: paidDocument.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendAccruedExpenseError(
        res,
        error,
        "Failed to pay accrued expense.",
        500
      );
    } finally {
      client.release();
    }
  }
);

export default router;