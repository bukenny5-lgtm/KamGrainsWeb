import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

function getReconciliationErrorStatus(error, fallbackStatus = 500) {
  const code = String(error?.code || "");

  if (Number(error?.status) >= 400) return Number(error.status);
  if (Number(error?.statusCode) >= 400) return Number(error.statusCode);

  // PostgreSQL RAISE EXCEPTION from business-rule functions usually returns P0001.
  if (code === "P0001") return 400;

  // Unique violation.
  if (code === "23505") return 409;

  // Foreign key violation, invalid uuid, numeric errors, not-null violation.
  if (["23502", "23503", "22P02", "22003"].includes(code)) return 400;

  return fallbackStatus;
}

function getReconciliationErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();
  if (message) return message;
  return fallbackMessage;
}

function sendReconciliationError(
  res,
  error,
  fallbackMessage,
  fallbackStatus = 500
) {
  const status = getReconciliationErrorStatus(error, fallbackStatus);
  const message = getReconciliationErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null,
  });
}

/**
 * GET /api/reconciliations
 * Lists reconciliation documents.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        reconciliation_id,
        reconciliation_no,
        statement_date,
        period_from,
        period_to,
        payment_account_id,
        payment_account_code,
        payment_account_name,
        channel_type,
        provider_name,
        account_number_masked,
        opening_statement_balance,
        closing_statement_balance,
        statement_line_count,
        statement_money_in,
        statement_money_out,
        statement_net,
        calculated_statement_closing_balance,
        statement_balance_difference,
        matched_line_count,
        unmatched_statement_line_count,
        matched_statement_net,
        matched_system_net,
        match_difference,
        status,
        notes,
        confirmed_at,
        confirmed_by,
        cancelled_at,
        cancelled_by,
        cancel_reason,
        created_by,
        created_at,
        updated_at
      FROM fin.v_reconciliation_summary
      ORDER BY created_at DESC, reconciliation_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    return sendReconciliationError(
      res,
      error,
      "Failed to load reconciliations.",
      500
    );
  }
});

/**
 * GET /api/reconciliations/next-no
 */
router.get("/next-no", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT fin.next_reconciliation_no() AS reconciliation_no;
    `);

    res.json({
      success: true,
      reconciliation_no: result.rows[0]?.reconciliation_no,
    });
  } catch (error) {
    return sendReconciliationError(
      res,
      error,
      "Failed to generate reconciliation number.",
      500
    );
  }
});

/**
 * GET /api/reconciliations/system-transactions
 * Lists available system transactions for a payment account.
 * Query params:
 *   payment_account_id required
 *   period_from optional
 *   period_to optional
 *   include_matched optional boolean
 */
router.get("/system-transactions", requireAuth, async (req, res) => {
  try {
    const {
      payment_account_id,
      period_from = null,
      period_to = null,
      include_matched = "false",
    } = req.query || {};

    if (!payment_account_id) {
      return res.status(400).json({
        success: false,
        message: "payment_account_id is required.",
      });
    }

    const includeMatched =
      String(include_matched || "").toLowerCase() === "true";

    const result = await query(
      `
      SELECT
        vst.journal_line_id,
        vst.journal_id,
        vst.journal_no,
        vst.journal_date,
        vst.journal_description,
        vst.source_module,
        vst.source_id,
        vst.payment_account_id,
        vst.payment_account_code,
        vst.payment_account_name,
        vst.channel_type,
        vst.provider_name,
        vst.account_number_masked,
        vst.memo,
        vst.money_in,
        vst.money_out,
        vst.signed_amount,
        vst.created_at,

        CASE
          WHEN existing.reconciliation_match_id IS NULL THEN false
          ELSE true
        END AS is_already_matched,

        existing.reconciliation_no AS matched_reconciliation_no

      FROM fin.v_reconciliation_system_transaction vst
      LEFT JOIN (
        SELECT
          rm.reconciliation_match_id,
          rm.journal_line_id,
          r.reconciliation_no
        FROM fin.reconciliation_match rm
        JOIN fin.reconciliation r
          ON r.reconciliation_id = rm.reconciliation_id
        WHERE r.status <> 'CANCELLED'
      ) existing
        ON existing.journal_line_id = vst.journal_line_id
      WHERE vst.payment_account_id = $1::uuid
        AND ($2::date IS NULL OR vst.journal_date >= $2::date)
        AND ($3::date IS NULL OR vst.journal_date <= $3::date)
        AND (
          $4::boolean = true
          OR existing.reconciliation_match_id IS NULL
        )
      ORDER BY vst.journal_date DESC, vst.created_at DESC, vst.journal_no;
      `,
      [
        payment_account_id,
        period_from || null,
        period_to || null,
        includeMatched,
      ]
    );

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    return sendReconciliationError(
      res,
      error,
      "Failed to load system transactions.",
      500
    );
  }
});

/**
 * GET /api/reconciliations/:reconciliationNo
 * Gets one reconciliation with statement lines, matches, and summary.
 */
router.get("/:reconciliationNo", requireAuth, async (req, res) => {
  try {
    const { reconciliationNo } = req.params;

    const headerResult = await query(
      `
      SELECT *
      FROM fin.v_reconciliation_summary
      WHERE reconciliation_no = $1;
      `,
      [reconciliationNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Reconciliation document not found.",
      });
    }

    const header = headerResult.rows[0];

    const statementLinesResult = await query(
      `
      SELECT
        reconciliation_id,
        reconciliation_no,
        reconciliation_status,
        payment_account_id,
        statement_line_id,
        line_no,
        transaction_date,
        reference_no,
        description,
        money_in,
        money_out,
        statement_signed_amount,
        reconciliation_match_id,
        journal_line_id,
        matched_amount,
        match_note,
        matched_by,
        matched_at,
        journal_no,
        journal_date,
        source_module,
        journal_description,
        journal_line_memo,
        system_money_in,
        system_money_out,
        system_signed_amount,
        is_matched,
        match_status,
        line_difference
      FROM fin.v_reconciliation_statement_line
      WHERE reconciliation_no = $1
      ORDER BY line_no, transaction_date;
      `,
      [reconciliationNo]
    );

    const systemTransactionsResult = await query(
      `
      SELECT
        vst.journal_line_id,
        vst.journal_id,
        vst.journal_no,
        vst.journal_date,
        vst.journal_description,
        vst.source_module,
        vst.source_id,
        vst.payment_account_id,
        vst.payment_account_code,
        vst.payment_account_name,
        vst.channel_type,
        vst.provider_name,
        vst.account_number_masked,
        vst.memo,
        vst.money_in,
        vst.money_out,
        vst.signed_amount,
        vst.created_at,

        CASE
          WHEN rm.reconciliation_match_id IS NULL THEN false
          ELSE true
        END AS is_selected_in_this_reconciliation,

        CASE
          WHEN other_match.reconciliation_match_id IS NULL THEN false
          ELSE true
        END AS is_matched_elsewhere,

        other_recon.reconciliation_no AS matched_elsewhere_reconciliation_no

      FROM fin.v_reconciliation_system_transaction vst

      LEFT JOIN fin.reconciliation_match rm
        ON rm.journal_line_id = vst.journal_line_id
       AND rm.reconciliation_id = $1::uuid

      LEFT JOIN fin.reconciliation_match other_match
        ON other_match.journal_line_id = vst.journal_line_id
       AND other_match.reconciliation_id <> $1::uuid

      LEFT JOIN fin.reconciliation other_recon
        ON other_recon.reconciliation_id = other_match.reconciliation_id
       AND other_recon.status <> 'CANCELLED'

      WHERE vst.payment_account_id = $2::uuid
        AND ($3::date IS NULL OR vst.journal_date >= $3::date)
        AND ($4::date IS NULL OR vst.journal_date <= $4::date)
        AND (
          rm.reconciliation_match_id IS NOT NULL
          OR other_match.reconciliation_match_id IS NULL
        )
      ORDER BY vst.journal_date DESC, vst.created_at DESC, vst.journal_no;
      `,
      [
        header.reconciliation_id,
        header.payment_account_id,
        header.period_from || null,
        header.period_to || null,
      ]
    );

    res.json({
      success: true,
      data: {
        ...header,
        statement_lines: statementLinesResult.rows,
        system_transactions: systemTransactionsResult.rows,
      },
    });
  } catch (error) {
    return sendReconciliationError(
      res,
      error,
      "Failed to load reconciliation document.",
      500
    );
  }
});

/**
 * POST /api/reconciliations
 * Creates reconciliation header and statement lines.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_RECONCILIATION"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        reconciliation_no,
        statement_date,
        period_from = null,
        period_to = null,
        payment_account_id,
        opening_statement_balance = 0,
        closing_statement_balance = 0,
        notes = null,
        created_by = null,
        statement_lines = [],
      } = req.body || {};

      if (!statement_date) {
        return res.status(400).json({
          success: false,
          message: "statement_date is required.",
        });
      }

      if (!payment_account_id) {
        return res.status(400).json({
          success: false,
          message: "payment_account_id is required.",
        });
      }

      if (!Array.isArray(statement_lines) || statement_lines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one statement line is required.",
        });
      }

      for (const line of statement_lines) {
        if (!line.transaction_date) {
          return res.status(400).json({
            success: false,
            message: "Each statement line requires transaction_date.",
          });
        }

        if (!line.description) {
          return res.status(400).json({
            success: false,
            message: "Each statement line requires description.",
          });
        }

        const moneyIn = Number(line.money_in || 0);
        const moneyOut = Number(line.money_out || 0);

        if (moneyIn < 0 || moneyOut < 0) {
          return res.status(400).json({
            success: false,
            message: "Statement line money_in and money_out cannot be negative.",
          });
        }

        if (moneyIn > 0 && moneyOut > 0) {
          return res.status(400).json({
            success: false,
            message: "A statement line cannot have both money_in and money_out.",
          });
        }

        if (moneyIn <= 0 && moneyOut <= 0) {
          return res.status(400).json({
            success: false,
            message: "Each statement line must have either money_in or money_out.",
          });
        }
      }

      await client.query("BEGIN");

      const paymentAccountCheck = await client.query(
        `
        SELECT
          pac.account_id,
          pac.is_payment_account,
          pac.is_active,
          pac.channel_type,
          ga.account_code,
          ga.account_name,
          ga.account_type
        FROM fin.payment_account_control pac
        JOIN fin.gl_account ga
          ON ga.account_id = pac.account_id
        WHERE pac.account_id = $1;
        `,
        [payment_account_id]
      );

      if (paymentAccountCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Payment account control not found.",
        });
      }

      const paymentAccount = paymentAccountCheck.rows[0];

      if (paymentAccount.is_payment_account !== true) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Selected account is not configured as a payment account.",
        });
      }

      if (paymentAccount.is_active !== true) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Selected payment account is inactive.",
        });
      }

      if (!["CASH", "BANK", "MOBILE_MONEY"].includes(paymentAccount.channel_type)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Only CASH, BANK, and MOBILE_MONEY accounts can be reconciled in Version 1.",
        });
      }

      const noResult = await client.query(`
        SELECT fin.next_reconciliation_no() AS reconciliation_no;
      `);

      const finalNo = reconciliation_no || noResult.rows[0]?.reconciliation_no;

      const duplicateCheck = await client.query(
        `
        SELECT reconciliation_id, reconciliation_no
        FROM fin.reconciliation
        WHERE reconciliation_no = $1
        LIMIT 1;
        `,
        [finalNo]
      );

      if (duplicateCheck.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Reconciliation document number already exists.",
          existing_document: duplicateCheck.rows[0],
        });
      }

      const userId = req.user?.user_id || req.body?.user_id || created_by || null;

      const headerResult = await client.query(
        `
        INSERT INTO fin.reconciliation (
          reconciliation_id,
          reconciliation_no,
          statement_date,
          period_from,
          period_to,
          payment_account_id,
          opening_statement_balance,
          closing_statement_balance,
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
          $6,
          $7,
          'DRAFT',
          $8,
          $9,
          now(),
          now()
        )
        RETURNING *;
        `,
        [
          finalNo,
          statement_date,
          period_from || null,
          period_to || null,
          payment_account_id,
          Number(opening_statement_balance || 0),
          Number(closing_statement_balance || 0),
          notes,
          userId,
        ]
      );

      const header = headerResult.rows[0];
      const createdLines = [];

      for (let i = 0; i < statement_lines.length; i += 1) {
        const line = statement_lines[i];

        const lineResult = await client.query(
          `
          INSERT INTO fin.reconciliation_statement_line (
            statement_line_id,
            reconciliation_id,
            line_no,
            transaction_date,
            reference_no,
            description,
            money_in,
            money_out,
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
          RETURNING *;
          `,
          [
            header.reconciliation_id,
            Number(line.line_no || i + 1),
            line.transaction_date,
            line.reference_no || null,
            line.description,
            Number(line.money_in || 0),
            Number(line.money_out || 0),
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Reconciliation created successfully.",
        data: {
          ...header,
          statement_lines: createdLines,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendReconciliationError(
        res,
        error,
        "Failed to create reconciliation.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/reconciliations/:reconciliationNo/matches
 * Saves/replaces matches for a draft reconciliation.
 *
 * Payload:
 * {
 *   matches: [
 *     { statement_line_id, journal_line_id, matched_amount, match_note }
 *   ]
 * }
 */
router.post(
  "/:reconciliationNo/matches",
  requireAuth,
  requirePermission("CREATE_RECONCILIATION"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { reconciliationNo } = req.params;
      const { matches = [] } = req.body || {};

      if (!Array.isArray(matches)) {
        return res.status(400).json({
          success: false,
          message: "matches must be an array.",
        });
      }

      await client.query("BEGIN");

      const headerResult = await client.query(
        `
        SELECT *
        FROM fin.reconciliation
        WHERE reconciliation_no = $1
        FOR UPDATE;
        `,
        [reconciliationNo]
      );

      if (headerResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Reconciliation document not found.",
        });
      }

      const header = headerResult.rows[0];

      if (header.status !== "DRAFT") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Only DRAFT reconciliations can be matched.",
        });
      }

      await client.query(
        `
        DELETE FROM fin.reconciliation_match
        WHERE reconciliation_id = $1;
        `,
        [header.reconciliation_id]
      );

      const createdMatches = [];
      const userId = req.user?.user_id || req.body?.user_id || null;

      for (const match of matches) {
        if (!match.statement_line_id || !match.journal_line_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Each match requires statement_line_id and journal_line_id.",
          });
        }

        const statementCheck = await client.query(
          `
          SELECT
            statement_line_id,
            reconciliation_id,
            money_in,
            money_out
          FROM fin.reconciliation_statement_line
          WHERE statement_line_id = $1
            AND reconciliation_id = $2;
          `,
          [match.statement_line_id, header.reconciliation_id]
        );

        if (statementCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "One selected statement line does not belong to this reconciliation.",
          });
        }

        const systemCheck = await client.query(
          `
          SELECT
            vst.journal_line_id,
            vst.payment_account_id,
            vst.money_in,
            vst.money_out,
            vst.signed_amount
          FROM fin.v_reconciliation_system_transaction vst
          WHERE vst.journal_line_id = $1
            AND vst.payment_account_id = $2;
          `,
          [match.journal_line_id, header.payment_account_id]
        );

        if (systemCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "One selected system transaction does not belong to this payment account.",
          });
        }

        const alreadyMatchedElsewhere = await client.query(
          `
          SELECT
            r.reconciliation_no
          FROM fin.reconciliation_match rm
          JOIN fin.reconciliation r
            ON r.reconciliation_id = rm.reconciliation_id
          WHERE rm.journal_line_id = $1
            AND rm.reconciliation_id <> $2
            AND r.status <> 'CANCELLED'
          LIMIT 1;
          `,
          [match.journal_line_id, header.reconciliation_id]
        );

        if (alreadyMatchedElsewhere.rowCount > 0) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            success: false,
            message: `System transaction is already matched in reconciliation ${alreadyMatchedElsewhere.rows[0].reconciliation_no}.`,
          });
        }

        const statement = statementCheck.rows[0];
        const system = systemCheck.rows[0];

        const statementSigned =
          Number(statement.money_in || 0) - Number(statement.money_out || 0);
        const systemSigned =
          Number(system.money_in || 0) - Number(system.money_out || 0);

        const matchedAmount =
          match.matched_amount !== undefined && match.matched_amount !== null
            ? Number(match.matched_amount)
            : statementSigned;

        if (Math.round((statementSigned - systemSigned) * 100) !== 0) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: `Statement amount ${statementSigned} does not match system amount ${systemSigned}.`,
          });
        }

        if (Math.round((matchedAmount - statementSigned) * 100) !== 0) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "matched_amount must equal the statement line amount in Version 1.",
          });
        }

        const insertResult = await client.query(
          `
          INSERT INTO fin.reconciliation_match (
            reconciliation_match_id,
            reconciliation_id,
            statement_line_id,
            journal_line_id,
            matched_amount,
            match_note,
            matched_by,
            matched_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            now()
          )
          RETURNING *;
          `,
          [
            header.reconciliation_id,
            match.statement_line_id,
            match.journal_line_id,
            matchedAmount,
            match.match_note || null,
            userId,
          ]
        );

        createdMatches.push(insertResult.rows[0]);
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Reconciliation matches saved successfully.",
        count: createdMatches.length,
        data: createdMatches,
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendReconciliationError(
        res,
        error,
        "Failed to save reconciliation matches.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/reconciliations/:reconciliationNo/confirm
 * Confirms and locks reconciliation.
 */
router.post(
  "/:reconciliationNo/confirm",
  requireAuth,
  requirePermission("CONFIRM_RECONCILIATION"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { reconciliationNo } = req.params;
      const userId = req.user?.user_id || req.body?.user_id || null;

      await client.query("BEGIN");

      const confirmResult = await client.query(
        `
        SELECT fin.confirm_reconciliation_by_no($1::text, $2::uuid) AS reconciliation_id;
        `,
        [reconciliationNo, userId]
      );

      const confirmedDocument = await client.query(
        `
        SELECT *
        FROM fin.v_reconciliation_summary
        WHERE reconciliation_no = $1;
        `,
        [reconciliationNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Reconciliation confirmed successfully.",
        reconciliation_id: confirmResult.rows[0]?.reconciliation_id,
        data: confirmedDocument.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendReconciliationError(
        res,
        error,
        "Failed to confirm reconciliation.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/reconciliations/:reconciliationNo/cancel
 * Cancels draft reconciliation.
 */
router.post(
  "/:reconciliationNo/cancel",
  requireAuth,
  requirePermission("CANCEL_RECONCILIATION"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { reconciliationNo } = req.params;
      const { cancel_reason = null } = req.body || {};
      const userId = req.user?.user_id || req.body?.user_id || null;

      await client.query("BEGIN");

      const cancelResult = await client.query(
        `
        SELECT fin.cancel_reconciliation_by_no(
          $1::text,
          $2::text,
          $3::uuid
        ) AS reconciliation_id;
        `,
        [reconciliationNo, cancel_reason || null, userId]
      );

      const cancelledDocument = await client.query(
        `
        SELECT *
        FROM fin.v_reconciliation_summary
        WHERE reconciliation_no = $1;
        `,
        [reconciliationNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Reconciliation cancelled successfully.",
        reconciliation_id: cancelResult.rows[0]?.reconciliation_id,
        data: cancelledDocument.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendReconciliationError(
        res,
        error,
        "Failed to cancel reconciliation.",
        500
      );
    } finally {
      client.release();
    }
  }
);

export default router;