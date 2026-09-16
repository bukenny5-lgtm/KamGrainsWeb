import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
function getFinanceErrorStatus(error, fallbackStatus = 500) {
  const code = String(error?.code || "");

  if (Number(error?.status) >= 400) return Number(error.status);
  if (Number(error?.statusCode) >= 400) return Number(error.statusCode);

  // PostgreSQL RAISE EXCEPTION from business-rule functions normally returns P0001.
  // These are user-correctable validation/business-rule failures, not server crashes.
  if (code === "P0001") return 400;

  // Unique violation.
  if (code === "23505") return 409;

  // Common user/data errors.
  if (["23502", "23503", "22P02", "22003"].includes(code)) return 400;

  return fallbackStatus;
}

function getFinanceErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();

  if (message) return message;

  return fallbackMessage;
}

function sendFinanceError(res, error, fallbackMessage, fallbackStatus = 500) {
  const status = getFinanceErrorStatus(error, fallbackStatus);
  const message = getFinanceErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null
  });
}

/**
 * GET /api/finance/gl-accounts
 */
router.get("/gl-accounts", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        account_id,
        account_code,
        account_name,
        account_type,
        is_control,
        is_active
      FROM fin.gl_account
      ORDER BY account_code;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load GL accounts.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/finance/journals
 */
router.get("/journals", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        gj.journal_id,
        gj.journal_no,
        gj.journal_date,
        gj.description,
        gj.source_module,
        gj.source_id,
        gj.created_by,
        gj.created_at,
        COALESCE(SUM(gjl.debit), 0) AS total_debit,
        COALESCE(SUM(gjl.credit), 0) AS total_credit,
        COALESCE(SUM(gjl.debit), 0) - COALESCE(SUM(gjl.credit), 0) AS difference
      FROM fin.gl_journal gj
      LEFT JOIN fin.gl_journal_line gjl
        ON gjl.journal_id = gj.journal_id
      GROUP BY
        gj.journal_id,
        gj.journal_no,
        gj.journal_date,
        gj.description,
        gj.source_module,
        gj.source_id,
        gj.created_by,
        gj.created_at
      ORDER BY gj.journal_date DESC, gj.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load journals.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/finance/journals/:journalNo
 */
router.get("/journals/:journalNo", async (req, res) => {
  try {
    const { journalNo } = req.params;

    const headerResult = await query(
      `
      SELECT
        journal_id,
        journal_no,
        journal_date,
        description,
        source_module,
        source_id,
        created_by,
        created_at
      FROM fin.gl_journal
      WHERE journal_no = $1;
      `,
      [journalNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Journal not found."
      });
    }

    const journal = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        gjl.journal_line_id,
        gjl.journal_id,
        gjl.account_id,
        ga.account_code,
        ga.account_name,
        ga.account_type,
        gjl.party_id,
        p.party_name,
        gjl.memo,
        gjl.debit,
        gjl.credit
      FROM fin.gl_journal_line gjl
      JOIN fin.gl_account ga
        ON ga.account_id = gjl.account_id
      LEFT JOIN app.party p
        ON p.party_id = gjl.party_id
      WHERE gjl.journal_id = $1
      ORDER BY ga.account_code;
      `,
      [journal.journal_id]
    );

    res.json({
      success: true,
      data: {
        ...journal,
        lines: linesResult.rows,
        totals: {
          total_debit: linesResult.rows.reduce(
            (s, r) => s + Number(r.debit || 0),
            0
          ),
          total_credit: linesResult.rows.reduce(
            (s, r) => s + Number(r.credit || 0),
            0
          ),
          difference:
            linesResult.rows.reduce((s, r) => s + Number(r.debit || 0), 0) -
            linesResult.rows.reduce((s, r) => s + Number(r.credit || 0), 0)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load journal.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * POST /api/finance/manual-journals
 * Creates a balanced manual journal.
 */
router.post(
  "/manual-journals",
  requireAuth,
  requirePermission("CREATE_JOURNAL"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        journal_date,
        description,
        source_module = "MANUAL",
        created_by = null,
        lines
      } = req.body || {};

      if (!journal_date) {
        return res.status(400).json({
          success: false,
          message: "journal_date is required."
        });
      }

      if (!description) {
        return res.status(400).json({
          success: false,
          message: "description is required."
        });
      }

      if (!Array.isArray(lines) || lines.length < 2) {
        return res.status(400).json({
          success: false,
          message: "At least two journal lines are required."
        });
      }

      const totalDebit = lines.reduce(
        (sum, line) => sum + Number(line.debit || 0),
        0
      );
      const totalCredit = lines.reduce(
        (sum, line) => sum + Number(line.credit || 0),
        0
      );

      if (totalDebit <= 0 || totalCredit <= 0) {
        return res.status(400).json({
          success: false,
          message: "Journal must have both debit and credit amounts."
        });
      }

      if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
        return res.status(400).json({
          success: false,
          message: "Journal is not balanced.",
          total_debit: totalDebit,
          total_credit: totalCredit,
          difference: totalDebit - totalCredit
        });
      }

      for (const line of lines) {
        if (!line.account_id) {
          return res.status(400).json({
            success: false,
            message: "Each journal line requires account_id."
          });
        }

        if (Number(line.debit || 0) < 0 || Number(line.credit || 0) < 0) {
          return res.status(400).json({
            success: false,
            message: "Debit and credit cannot be negative."
          });
        }

        if (Number(line.debit || 0) > 0 && Number(line.credit || 0) > 0) {
          return res.status(400).json({
            success: false,
            message: "A journal line cannot have both debit and credit."
          });
        }
      }

      await client.query("BEGIN");

      const journalResult = await client.query(
        `
        SELECT fin.create_journal(
          'JV',
          $1::date,
          $2::text,
          $3::text,
          NULL::uuid
        ) AS journal_id;
        `,
        [journal_date, description, source_module]
      );

      const journalId = journalResult.rows[0].journal_id;

      for (const line of lines) {
        await client.query(
          `
          SELECT fin.add_journal_line(
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::text,
            $5::numeric,
            $6::numeric
          );
          `,
          [
            journalId,
            line.account_id,
            line.party_id || null,
            line.memo || null,
            Number(line.debit || 0),
            Number(line.credit || 0)
          ]
        );
      }

      await client.query(
        `
        SELECT fin.assert_balanced($1::uuid);
        `,
        [journalId]
      );

      const createdJournal = await client.query(
        `
        SELECT
          journal_id,
          journal_no,
          journal_date,
          description,
          source_module,
          source_id,
          created_by,
          created_at
        FROM fin.gl_journal
        WHERE journal_id = $1;
        `,
        [journalId]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Manual journal created successfully.",
        data: createdJournal.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create manual journal.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * GET /api/finance/reports/general-ledger
 */
router.get("/reports/general-ledger", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        gj.journal_no,
        gj.journal_date,
        gj.description,
        gj.source_module,
        ga.account_code,
        ga.account_name,
        ga.account_type,
        gjl.party_id,
        p.party_name,
        gjl.memo,
        gjl.debit,
        gjl.credit
      FROM fin.gl_journal gj
      JOIN fin.gl_journal_line gjl
        ON gjl.journal_id = gj.journal_id
      JOIN fin.gl_account ga
        ON ga.account_id = gjl.account_id
      LEFT JOIN app.party p
        ON p.party_id = gjl.party_id
      ORDER BY gj.journal_date DESC, gj.journal_no, ga.account_code;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load general ledger.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/finance/reports/trial-balance
 */
router.get("/reports/trial-balance", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ga.account_id,
        ga.account_code,
        ga.account_name,
        ga.account_type,
        COALESCE(SUM(gjl.debit), 0) AS debit,
        COALESCE(SUM(gjl.credit), 0) AS credit,
        COALESCE(SUM(gjl.debit), 0) - COALESCE(SUM(gjl.credit), 0) AS net_balance
      FROM fin.gl_account ga
      LEFT JOIN fin.gl_journal_line gjl
        ON gjl.account_id = ga.account_id
      WHERE ga.is_active = true
      GROUP BY
        ga.account_id,
        ga.account_code,
        ga.account_name,
        ga.account_type
      ORDER BY ga.account_code;
    `);

    const totalDebit = result.rows.reduce(
      (sum, row) => sum + Number(row.debit || 0),
      0
    );
    const totalCredit = result.rows.reduce(
      (sum, row) => sum + Number(row.credit || 0),
      0
    );

    res.json({
      success: true,
      count: result.rowCount,
      totals: {
        total_debit: totalDebit,
        total_credit: totalCredit,
        difference: totalDebit - totalCredit
      },
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load trial balance.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/finance/reports/profit-and-loss
 */
router.get("/reports/profit-and-loss", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ga.account_type,
        ga.account_code,
        ga.account_name,
        COALESCE(SUM(gjl.debit), 0) AS debit,
        COALESCE(SUM(gjl.credit), 0) AS credit,
        CASE
          WHEN ga.account_type = 'INCOME'
            THEN COALESCE(SUM(gjl.credit), 0) - COALESCE(SUM(gjl.debit), 0)
          WHEN ga.account_type = 'EXPENSE'
            THEN COALESCE(SUM(gjl.debit), 0) - COALESCE(SUM(gjl.credit), 0)
          ELSE 0
        END AS amount
      FROM fin.gl_account ga
      LEFT JOIN fin.gl_journal_line gjl
        ON gjl.account_id = ga.account_id
      WHERE ga.account_type IN ('INCOME', 'EXPENSE')
        AND ga.is_active = true
      GROUP BY
        ga.account_type,
        ga.account_code,
        ga.account_name
      ORDER BY
        CASE ga.account_type
          WHEN 'INCOME' THEN 1
          WHEN 'EXPENSE' THEN 2
          ELSE 3
        END,
        ga.account_code;
    `);

    const income = result.rows
      .filter((row) => row.account_type === "INCOME")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const expenses = result.rows
      .filter((row) => row.account_type === "EXPENSE")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    res.json({
      success: true,
      summary: {
        income,
        expenses,
        net_profit: income - expenses
      },
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load profit and loss report.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/finance/reports/balance-sheet
 */
router.get("/reports/balance-sheet", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ga.account_type,
        ga.account_code,
        ga.account_name,
        COALESCE(SUM(gjl.debit), 0) AS debit,
        COALESCE(SUM(gjl.credit), 0) AS credit,
        CASE
          WHEN ga.account_type = 'ASSET'
            THEN COALESCE(SUM(gjl.debit), 0) - COALESCE(SUM(gjl.credit), 0)
          WHEN ga.account_type IN ('LIABILITY', 'EQUITY')
            THEN COALESCE(SUM(gjl.credit), 0) - COALESCE(SUM(gjl.debit), 0)
          ELSE 0
        END AS amount
      FROM fin.gl_account ga
      LEFT JOIN fin.gl_journal_line gjl
        ON gjl.account_id = ga.account_id
      WHERE ga.account_type IN ('ASSET', 'LIABILITY', 'EQUITY')
        AND ga.is_active = true
      GROUP BY
        ga.account_type,
        ga.account_code,
        ga.account_name
      ORDER BY
        CASE ga.account_type
          WHEN 'ASSET' THEN 1
          WHEN 'LIABILITY' THEN 2
          WHEN 'EQUITY' THEN 3
          ELSE 4
        END,
        ga.account_code;
    `);

    const assets = result.rows
      .filter((row) => row.account_type === "ASSET")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const liabilities = result.rows
      .filter((row) => row.account_type === "LIABILITY")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const equity = result.rows
      .filter((row) => row.account_type === "EQUITY")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    res.json({
      success: true,
      summary: {
        assets,
        liabilities,
        equity,
        liabilities_plus_equity: liabilities + equity,
        difference: assets - (liabilities + equity)
      },
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load balance sheet.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/finance/reports/cashbook
 */
router.get("/reports/cashbook", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        gj.journal_no,
        gj.journal_date,
        gj.description,
        gj.source_module,
        ga.account_code,
        ga.account_name,
        gjl.memo,
        gjl.debit AS cash_in,
        gjl.credit AS cash_out,
        gjl.debit - gjl.credit AS net_cash_movement
      FROM fin.gl_journal gj
      JOIN fin.gl_journal_line gjl
        ON gjl.journal_id = gj.journal_id
      JOIN fin.gl_account ga
        ON ga.account_id = gjl.account_id
      WHERE ga.account_code IN ('1000', '1010')
      ORDER BY gj.journal_date DESC, gj.journal_no;
    `);

    const cashIn = result.rows.reduce(
      (sum, row) => sum + Number(row.cash_in || 0),
      0
    );
    const cashOut = result.rows.reduce(
      (sum, row) => sum + Number(row.cash_out || 0),
      0
    );

    res.json({
      success: true,
      count: result.rowCount,
      summary: {
        cash_in: cashIn,
        cash_out: cashOut,
        net_cash_movement: cashIn - cashOut
      },
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load cashbook.",
      error: error.message,
      detail: error.detail || null
    });
  }
});
/**
 * GET /api/finance/reports/accrued-expense-aging
 *
 * Default:
 *   Shows unpaid posted accrued expenses only.
 *
 * Optional:
 *   ?include_closed=true
 *   Shows posted, paid, and cancelled/canceled items.
 */
router.get("/reports/accrued-expense-aging", async (req, res) => {
  try {
    const includeClosed =
      String(req.query.include_closed || "false").toLowerCase() === "true";

    const result = await query(
      `
      SELECT
        accrued_expense_id,
        document_no,
        document_date,
        due_date,
        party,
        payable_account,
        status,
        total_amount,
        days_outstanding,
        aging_bucket,
        posted_journal_id,
        posted_journal,
        paid_journal_id,
        paid_journal,
        posted_at,
        paid_at,
        created_at
      FROM fin.v_accrued_expense_aging
      WHERE
        (
          $1::boolean = true
          AND UPPER(COALESCE(status, '')) IN ('POSTED', 'PAID', 'CANCELLED', 'CANCELED')
        )
        OR
        (
          $1::boolean = false
          AND UPPER(COALESCE(status, '')) = 'POSTED'
        )
      ORDER BY
        CASE aging_bucket
          WHEN 'Over 90 Days' THEN 1
          WHEN '61-90 Days' THEN 2
          WHEN '31-60 Days' THEN 3
          WHEN '0-30 Days' THEN 4
          WHEN 'Not Due' THEN 5
          ELSE 6
        END,
        days_outstanding DESC,
        document_date DESC,
        document_no DESC;
      `,
      [includeClosed]
    );

    const totalAmount = result.rows.reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0
    );

    const bucketSummary = result.rows.reduce((summary, row) => {
      const bucket = row.aging_bucket || "Unknown";

      if (!summary[bucket]) {
        summary[bucket] = {
          bucket,
          count: 0,
          total_amount: 0,
        };
      }

      summary[bucket].count += 1;
      summary[bucket].total_amount += Number(row.total_amount || 0);

      return summary;
    }, {});

    res.json({
      success: true,
      count: result.rowCount,
      filters: {
        include_closed: includeClosed,
      },
      summary: {
        total_amount: totalAmount,
        bucket_summary: Object.values(bucketSummary),
      },
      data: result.rows,
    });
  } catch (error) {
    return sendFinanceError(
      res,
      error,
      "Failed to load accrued expense aging report.",
      500
    );
  }
});
/**
 * GET /api/finance/reports/customer-receivables-aging
 *
 * Default:
 *   Shows posted unpaid customer invoices only.
 *
 * Optional:
 *   ?include_closed=true
 *   Shows posted invoices, including fully paid / closed items.
 */
router.get("/reports/customer-receivables-aging", async (req, res) => {
  try {
    const includeClosed =
      String(req.query.include_closed || "false").toLowerCase() === "true";

    const result = await query(
      `
      SELECT
        ar_invoice_id,
        invoice_no,
        invoice_date,
        due_date,
        customer,
        delivery_no,
        so_no,
        status,
        line_count,
        invoice_total,
        total_paid,
        balance_due,
        days_outstanding,
        aging_bucket,
        posted_journal_id,
        posted_journal,
        created_at
      FROM fin.v_customer_receivables_aging
      WHERE
        (
          $1::boolean = true
          AND posted_journal_id IS NOT NULL
        )
        OR
        (
          $1::boolean = false
          AND posted_journal_id IS NOT NULL
          AND balance_due > 0
        )
      ORDER BY
        CASE aging_bucket
          WHEN 'Over 90 Days' THEN 1
          WHEN '61-90 Days' THEN 2
          WHEN '31-60 Days' THEN 3
          WHEN '0-30 Days' THEN 4
          WHEN 'Not Due' THEN 5
          ELSE 6
        END,
        days_outstanding DESC,
        invoice_date DESC,
        invoice_no DESC;
      `,
      [includeClosed]
    );

    const totalInvoiceAmount = result.rows.reduce(
      (sum, row) => sum + Number(row.invoice_total || 0),
      0
    );

    const totalPaid = result.rows.reduce(
      (sum, row) => sum + Number(row.total_paid || 0),
      0
    );

    const totalBalanceDue = result.rows.reduce(
      (sum, row) => sum + Number(row.balance_due || 0),
      0
    );

    const bucketSummary = result.rows.reduce((summary, row) => {
      const bucket = row.aging_bucket || "Unknown";

      if (!summary[bucket]) {
        summary[bucket] = {
          bucket,
          count: 0,
          invoice_total: 0,
          total_paid: 0,
          balance_due: 0,
        };
      }

      summary[bucket].count += 1;
      summary[bucket].invoice_total += Number(row.invoice_total || 0);
      summary[bucket].total_paid += Number(row.total_paid || 0);
      summary[bucket].balance_due += Number(row.balance_due || 0);

      return summary;
    }, {});

    res.json({
      success: true,
      count: result.rowCount,
      filters: {
        include_closed: includeClosed,
      },
      summary: {
        invoice_total: totalInvoiceAmount,
        total_paid: totalPaid,
        balance_due: totalBalanceDue,
        bucket_summary: Object.values(bucketSummary),
      },
      data: result.rows,
    });
  } catch (error) {
    return sendFinanceError(
      res,
      error,
      "Failed to load customer receivables aging report.",
      500
    );
  }
});
/**
 * GET /api/finance/reports/supplier-payables-aging
 *
 * Default:
 *   Shows posted unpaid supplier invoices only.
 *
 * Optional:
 *   ?include_closed=true
 *   Shows posted invoices, including fully paid / closed items.
 */
router.get("/reports/supplier-payables-aging", async (req, res) => {
  try {
    const includeClosed =
      String(req.query.include_closed || "false").toLowerCase() === "true";

    const result = await query(
      `
      SELECT
        ap_invoice_id,
        invoice_no,
        invoice_date,
        due_date,
        supplier,
        grn_no,
        status,
        line_count,
        invoice_total,
        total_paid,
        balance_due,
        days_outstanding,
        aging_bucket,
        posted_journal_id,
        posted_journal,
        created_at
      FROM fin.v_supplier_payables_aging
      WHERE
        (
          $1::boolean = true
          AND posted_journal_id IS NOT NULL
        )
        OR
        (
          $1::boolean = false
          AND posted_journal_id IS NOT NULL
          AND balance_due > 0
        )
      ORDER BY
        CASE aging_bucket
          WHEN 'Over 90 Days' THEN 1
          WHEN '61-90 Days' THEN 2
          WHEN '31-60 Days' THEN 3
          WHEN '0-30 Days' THEN 4
          WHEN 'Not Due' THEN 5
          ELSE 6
        END,
        days_outstanding DESC,
        invoice_date DESC,
        invoice_no DESC;
      `,
      [includeClosed]
    );

    const totalInvoiceAmount = result.rows.reduce(
      (sum, row) => sum + Number(row.invoice_total || 0),
      0
    );

    const totalPaid = result.rows.reduce(
      (sum, row) => sum + Number(row.total_paid || 0),
      0
    );

    const totalBalanceDue = result.rows.reduce(
      (sum, row) => sum + Number(row.balance_due || 0),
      0
    );

    const bucketSummary = result.rows.reduce((summary, row) => {
      const bucket = row.aging_bucket || "Unknown";

      if (!summary[bucket]) {
        summary[bucket] = {
          bucket,
          count: 0,
          invoice_total: 0,
          total_paid: 0,
          balance_due: 0,
        };
      }

      summary[bucket].count += 1;
      summary[bucket].invoice_total += Number(row.invoice_total || 0);
      summary[bucket].total_paid += Number(row.total_paid || 0);
      summary[bucket].balance_due += Number(row.balance_due || 0);

      return summary;
    }, {});

    res.json({
      success: true,
      count: result.rowCount,
      filters: {
        include_closed: includeClosed,
      },
      summary: {
        invoice_total: totalInvoiceAmount,
        total_paid: totalPaid,
        balance_due: totalBalanceDue,
        bucket_summary: Object.values(bucketSummary),
      },
      data: result.rows,
    });
  } catch (error) {
    return sendFinanceError(
      res,
      error,
      "Failed to load supplier payables aging report.",
      500
    );
  }
});
/**
 * GET /api/finance/expense-vouchers
 * Lists expense vouchers with totals.
 */
router.get("/expense-vouchers", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ev.expense_voucher_id,
        ev.voucher_no,
        ev.voucher_date,
        ev.payee_id,
        p.party_name AS payee_name,
        ev.payment_account_id,
        pa.account_code AS payment_account_code,
        pa.account_name AS payment_account_name,
        ev.payment_method,
        ev.reference_no,
        ev.notes,
        ev.status,
        ev.posted_journal_id,
        ev.posted_at,
        ev.posted_by,
        ev.created_by,
        ev.created_at,
        COUNT(evl.expense_voucher_line_id) AS line_count,
        COALESCE(SUM(evl.amount), 0) AS total_amount
      FROM fin.expense_voucher ev
      LEFT JOIN app.party p
        ON p.party_id = ev.payee_id
      LEFT JOIN fin.gl_account pa
        ON pa.account_id = ev.payment_account_id
      LEFT JOIN fin.expense_voucher_line evl
        ON evl.expense_voucher_id = ev.expense_voucher_id
      GROUP BY
        ev.expense_voucher_id,
        ev.voucher_no,
        ev.voucher_date,
        ev.payee_id,
        p.party_name,
        ev.payment_account_id,
        pa.account_code,
        pa.account_name,
        ev.payment_method,
        ev.reference_no,
        ev.notes,
        ev.status,
        ev.posted_journal_id,
        ev.posted_at,
        ev.posted_by,
        ev.created_by,
        ev.created_at
      ORDER BY ev.created_at DESC, ev.voucher_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load expense vouchers.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * GET /api/finance/expense-vouchers/:voucherNo
 * Gets one expense voucher with lines.
 */
router.get("/expense-vouchers/:voucherNo", async (req, res) => {
  try {
    const { voucherNo } = req.params;

    const headerResult = await query(
      `
      SELECT
        ev.expense_voucher_id,
        ev.voucher_no,
        ev.voucher_date,
        ev.payee_id,
        p.party_name AS payee_name,
        ev.payment_account_id,
        pa.account_code AS payment_account_code,
        pa.account_name AS payment_account_name,
        ev.payment_method,
        ev.reference_no,
        ev.notes,
        ev.status,
        ev.posted_journal_id,
        ev.posted_at,
        ev.posted_by,
        ev.created_by,
        ev.created_at
      FROM fin.expense_voucher ev
      LEFT JOIN app.party p
        ON p.party_id = ev.payee_id
      LEFT JOIN fin.gl_account pa
        ON pa.account_id = ev.payment_account_id
      WHERE ev.voucher_no = $1;
      `,
      [voucherNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Expense voucher not found."
      });
    }

    const voucher = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        evl.expense_voucher_line_id,
        evl.expense_voucher_id,
        evl.expense_account_id,
        ea.account_code AS expense_account_code,
        ea.account_name AS expense_account_name,
        ea.account_type AS expense_account_type,
        evl.description,
        evl.amount
      FROM fin.expense_voucher_line evl
      JOIN fin.gl_account ea
        ON ea.account_id = evl.expense_account_id
      WHERE evl.expense_voucher_id = $1
      ORDER BY ea.account_code, evl.description;
      `,
      [voucher.expense_voucher_id]
    );

    res.json({
      success: true,
      data: {
        ...voucher,
        lines: linesResult.rows,
        totals: {
          line_count: linesResult.rowCount,
          total_amount: linesResult.rows.reduce(
            (sum, row) => sum + Number(row.amount || 0),
            0
          )
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load expense voucher.",
      error: error.message,
      detail: error.detail || null
    });
  }
});

/**
 * POST /api/finance/expense-vouchers
 * Creates an expense voucher.
 */
router.post(
  "/expense-vouchers",
  requireAuth,
  requirePermission("CREATE_EXPENSE_VOUCHER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        voucher_no,
        voucher_date,
        payee_id = null,
        payment_account_id,
        payment_method = "CASH",
        reference_no = null,
        notes = null,
        created_by = null,
        lines
      } = req.body || {};

      if (!voucher_date) {
        return res.status(400).json({
          success: false,
          message: "voucher_date is required."
        });
      }

      if (!payment_account_id) {
        return res.status(400).json({
          success: false,
          message: "payment_account_id is required."
        });
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one expense voucher line is required."
        });
      }

      for (const line of lines) {
        if (!line.expense_account_id) {
          return res.status(400).json({
            success: false,
            message: "Each line requires expense_account_id."
          });
        }

        if (!line.description) {
          return res.status(400).json({
            success: false,
            message: "Each line requires description."
          });
        }

        if (Number(line.amount) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Each line amount must be greater than zero."
          });
        }
      }

      await client.query("BEGIN");

      const finalVoucherNo =
        voucher_no ||
        `EV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Date.now()}`;

      const duplicateCheck = await client.query(
        `
        SELECT expense_voucher_id
        FROM fin.expense_voucher
        WHERE voucher_no = $1
        LIMIT 1;
        `,
        [finalVoucherNo]
      );

      if (duplicateCheck.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Expense voucher number already exists."
        });
      }

      const headerResult = await client.query(
        `
        INSERT INTO fin.expense_voucher (
          expense_voucher_id,
          voucher_no,
          voucher_date,
          payee_id,
          payment_account_id,
          payment_method,
          reference_no,
          notes,
          status,
          created_by,
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
          'DRAFT',
          $8,
          now()
        )
        RETURNING *;
        `,
        [
          finalVoucherNo,
          voucher_date,
          payee_id,
          payment_account_id,
          payment_method,
          reference_no,
          notes,
          created_by
        ]
      );

      const voucher = headerResult.rows[0];
      const createdLines = [];

      for (const line of lines) {
        const lineResult = await client.query(
          `
          INSERT INTO fin.expense_voucher_line (
            expense_voucher_line_id,
            expense_voucher_id,
            expense_account_id,
            description,
            amount
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4
          )
          RETURNING *;
          `,
          [
            voucher.expense_voucher_id,
            line.expense_account_id,
            line.description,
            Number(line.amount)
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Expense voucher created successfully.",
        data: {
          ...voucher,
          lines: createdLines
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create expense voucher.",
        error: error.message,
        detail: error.detail || null
      });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/finance/expense-vouchers/:voucherNo/post
 * Posts an expense voucher.
 */
router.post(
  "/expense-vouchers/:voucherNo/post",
  requireAuth,
  requirePermission("POST_EXPENSE_VOUCHER"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { voucherNo } = req.params;
      const user_id = req.user?.user_id || req.body?.user_id || null;

      await client.query("BEGIN");

      const voucherCheck = await client.query(
        `
        SELECT
          expense_voucher_id,
          voucher_no,
          status,
          posted_journal_id
        FROM fin.expense_voucher
        WHERE voucher_no = $1
        FOR UPDATE;
        `,
        [voucherNo]
      );

      if (voucherCheck.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Expense voucher not found."
        });
      }

      const voucher = voucherCheck.rows[0];

      if (voucher.posted_journal_id) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Expense voucher is already posted.",
          data: voucher
        });
      }

      if (voucher.status !== "DRAFT") {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Only DRAFT expense vouchers can be posted."
        });
      }

      const postResult = await client.query(
        `
        SELECT fin.post_expense_voucher_by_no($1, $2::uuid) AS posted_result;
        `,
        [voucherNo, user_id]
      );

      const postedVoucher = await client.query(
        `
        SELECT
          ev.expense_voucher_id,
          ev.voucher_no,
          ev.voucher_date,
          ev.payee_id,
          p.party_name AS payee_name,
          ev.payment_account_id,
          pa.account_code AS payment_account_code,
          pa.account_name AS payment_account_name,
          ev.payment_method,
          ev.reference_no,
          ev.notes,
          ev.status,
          ev.posted_journal_id,
          ev.posted_at,
          ev.posted_by,
          ev.created_by,
          ev.created_at
        FROM fin.expense_voucher ev
        LEFT JOIN app.party p
          ON p.party_id = ev.payee_id
        LEFT JOIN fin.gl_account pa
          ON pa.account_id = ev.payment_account_id
        WHERE ev.voucher_no = $1;
        `,
        [voucherNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Expense voucher posted successfully.",
        result: postResult.rows[0]?.posted_result ?? null,
        data: postedVoucher.rows[0]
      });
        } catch (error) {
      await client.query("ROLLBACK");

      return sendFinanceError(
        res,
        error,
        "Failed to post expense voucher.",
        500
      );
    } finally {
      client.release();
    }
  }
);

export default router;