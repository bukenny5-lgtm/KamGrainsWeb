import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

/**
 * GET /api/opening-balances
 * Lists opening balance documents with totals.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ob.opening_balance_id,
        ob.document_no,
        ob.opening_date,
        ob.description,
        ob.status,
        ob.posted_journal_id,
        gj.journal_no AS posted_journal_no,
        ob.posted_at,
        ob.posted_by,
        ob.created_by,
        ob.created_at,
        COUNT(obl.opening_balance_line_id) AS line_count,
        COALESCE(SUM(obl.debit), 0) AS total_debit,
        COALESCE(SUM(obl.credit), 0) AS total_credit,
        COALESCE(SUM(obl.debit), 0) - COALESCE(SUM(obl.credit), 0) AS difference
      FROM fin.opening_balance ob
      LEFT JOIN fin.opening_balance_line obl
        ON obl.opening_balance_id = ob.opening_balance_id
      LEFT JOIN fin.gl_journal gj
        ON gj.journal_id = ob.posted_journal_id
      GROUP BY
        ob.opening_balance_id,
        ob.document_no,
        ob.opening_date,
        ob.description,
        ob.status,
        ob.posted_journal_id,
        gj.journal_no,
        ob.posted_at,
        ob.posted_by,
        ob.created_by,
        ob.created_at
      ORDER BY ob.created_at DESC, ob.document_no DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load opening balances.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/opening-balances/next-no
 */
router.get("/next-no", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT fin.next_opening_balance_no() AS document_no;
    `);

    res.json({
      success: true,
      document_no: result.rows[0]?.document_no,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate opening balance number.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/opening-balances/:documentNo
 * Gets one opening balance with lines.
 */
router.get("/:documentNo", requireAuth, async (req, res) => {
  try {
    const { documentNo } = req.params;

    const headerResult = await query(
      `
      SELECT
        ob.opening_balance_id,
        ob.document_no,
        ob.opening_date,
        ob.description,
        ob.status,
        ob.posted_journal_id,
        gj.journal_no AS posted_journal_no,
        ob.posted_at,
        ob.posted_by,
        ob.created_by,
        ob.created_at,
        ob.updated_at
      FROM fin.opening_balance ob
      LEFT JOIN fin.gl_journal gj
        ON gj.journal_id = ob.posted_journal_id
      WHERE ob.document_no = $1;
      `,
      [documentNo]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Opening balance document not found.",
      });
    }

    const header = headerResult.rows[0];

    const linesResult = await query(
      `
      SELECT
        obl.opening_balance_line_id,
        obl.opening_balance_id,
        obl.account_id,
        ga.account_code,
        ga.account_name,
        ga.account_type,
        obl.party_id,
        p.party_name,
        obl.memo,
        obl.debit,
        obl.credit,
        obl.created_at
      FROM fin.opening_balance_line obl
      JOIN fin.gl_account ga
        ON ga.account_id = obl.account_id
      LEFT JOIN app.party p
        ON p.party_id = obl.party_id
      WHERE obl.opening_balance_id = $1
      ORDER BY ga.account_code, obl.created_at;
      `,
      [header.opening_balance_id]
    );

    const totalDebit = linesResult.rows.reduce(
      (sum, row) => sum + Number(row.debit || 0),
      0
    );

    const totalCredit = linesResult.rows.reduce(
      (sum, row) => sum + Number(row.credit || 0),
      0
    );

    res.json({
      success: true,
      data: {
        ...header,
        lines: linesResult.rows,
        totals: {
          line_count: linesResult.rowCount,
          total_debit: totalDebit,
          total_credit: totalCredit,
          difference: totalDebit - totalCredit,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load opening balance document.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * POST /api/opening-balances
 * Creates opening balance document with lines.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_JOURNAL"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        document_no,
        opening_date,
        description,
        created_by = null,
        lines,
      } = req.body || {};

      if (!opening_date) {
        return res.status(400).json({
          success: false,
          message: "opening_date is required.",
        });
      }

      if (!description) {
        return res.status(400).json({
          success: false,
          message: "description is required.",
        });
      }

      if (!Array.isArray(lines) || lines.length < 2) {
        return res.status(400).json({
          success: false,
          message: "At least two opening balance lines are required.",
        });
      }

      let totalDebit = 0;
      let totalCredit = 0;

      for (const line of lines) {
        if (!line.account_id) {
          return res.status(400).json({
            success: false,
            message: "Each line requires account_id.",
          });
        }

        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);

        if (debit < 0 || credit < 0) {
          return res.status(400).json({
            success: false,
            message: "Debit and credit cannot be negative.",
          });
        }

        if (debit > 0 && credit > 0) {
          return res.status(400).json({
            success: false,
            message: "A line cannot have both debit and credit.",
          });
        }

        if (debit <= 0 && credit <= 0) {
          return res.status(400).json({
            success: false,
            message: "Each line must have either debit or credit.",
          });
        }

        totalDebit += debit;
        totalCredit += credit;
      }

      if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
        return res.status(400).json({
          success: false,
          message: "Opening balance is not balanced.",
          total_debit: totalDebit,
          total_credit: totalCredit,
          difference: totalDebit - totalCredit,
        });
      }

      await client.query("BEGIN");

      const docNoResult = await client.query(`
        SELECT fin.next_opening_balance_no() AS document_no;
      `);

      const finalDocumentNo = document_no || docNoResult.rows[0]?.document_no;

      const duplicateCheck = await client.query(
        `
        SELECT opening_balance_id
        FROM fin.opening_balance
        WHERE document_no = $1
        LIMIT 1;
        `,
        [finalDocumentNo]
      );

      if (duplicateCheck.rowCount > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Opening balance document number already exists.",
        });
      }

      const userId = req.user?.user_id || req.body?.user_id || created_by || null;

      const headerResult = await client.query(
        `
        INSERT INTO fin.opening_balance (
          opening_balance_id,
          document_no,
          opening_date,
          description,
          status,
          created_by,
          created_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          'DRAFT',
          $4,
          now()
        )
        RETURNING *;
        `,
        [finalDocumentNo, opening_date, description, userId]
      );

      const header = headerResult.rows[0];
      const createdLines = [];

      for (const line of lines) {
        const lineResult = await client.query(
          `
          INSERT INTO fin.opening_balance_line (
            opening_balance_line_id,
            opening_balance_id,
            account_id,
            party_id,
            memo,
            debit,
            credit,
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
            now()
          )
          RETURNING *;
          `,
          [
            header.opening_balance_id,
            line.account_id,
            line.party_id || null,
            line.memo || null,
            Number(line.debit || 0),
            Number(line.credit || 0),
          ]
        );

        createdLines.push(lineResult.rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Opening balance created successfully.",
        data: {
          ...header,
          lines: createdLines,
          totals: {
            line_count: createdLines.length,
            total_debit: totalDebit,
            total_credit: totalCredit,
            difference: totalDebit - totalCredit,
          },
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to create opening balance.",
        error: error.message,
        detail: error.detail || null,
      });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/opening-balances/:documentNo/post
 * Posts opening balance document.
 */
router.post(
  "/:documentNo/post",
  requireAuth,
  requirePermission("CREATE_JOURNAL"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { documentNo } = req.params;
      const userId = req.user?.user_id || req.body?.user_id || null;

      await client.query("BEGIN");

      const postResult = await client.query(
        `
        SELECT fin.post_opening_balance_by_no($1, $2::uuid) AS journal_id;
        `,
        [documentNo, userId]
      );

      const postedResult = await client.query(
        `
        SELECT
          ob.opening_balance_id,
          ob.document_no,
          ob.opening_date,
          ob.description,
          ob.status,
          ob.posted_journal_id,
          gj.journal_no AS posted_journal_no,
          ob.posted_at,
          ob.created_at
        FROM fin.opening_balance ob
        LEFT JOIN fin.gl_journal gj
          ON gj.journal_id = ob.posted_journal_id
        WHERE ob.document_no = $1;
        `,
        [documentNo]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Opening balance posted successfully.",
        journal_id: postResult.rows[0]?.journal_id,
        data: postedResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to post opening balance.",
        error: error.message,
        detail: error.detail || null,
      });
    } finally {
      client.release();
    }
  }
);

export default router;