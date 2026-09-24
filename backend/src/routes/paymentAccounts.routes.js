import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

/**
 * GET /api/payment-accounts
 * Lists controlled payment accounts with current and available balances.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        payment_account_control_id,
        account_id,
        account_code,
        account_name,
        account_type,
        channel_type,
        provider_name,
        account_number_masked,
        is_payment_account,
        allow_negative,
        overdraft_limit,
        overdraft_expiry_date,
        is_active,
        total_debit,
        total_credit,
        current_balance,
        available_balance
      FROM fin.v_payment_account_balance
      ORDER BY
        CASE channel_type
          WHEN 'CASH' THEN 1
          WHEN 'BANK' THEN 2
          WHEN 'MOBILE_MONEY' THEN 3
          ELSE 9
        END,
        account_code;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load payment accounts.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/payment-accounts/available-gl-accounts
 * Lists active asset GL accounts that can be configured as payment accounts.
 */
router.get("/available-gl-accounts", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ga.account_id,
        ga.account_code,
        ga.account_name,
        ga.account_type,
        ga.is_control,
        ga.is_active,
        pac.payment_account_control_id,
        pac.channel_type,
        pac.is_payment_account
      FROM fin.gl_account ga
      LEFT JOIN fin.payment_account_control pac
        ON pac.account_id = ga.account_id
      WHERE ga.is_active = true
        AND ga.account_type = 'ASSET'
      ORDER BY ga.account_code;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load available GL accounts.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * POST /api/payment-accounts
 * Adds an existing GL account to payment account control.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("CREATE_SETUP"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        account_id,
        channel_type,
        provider_name = null,
        account_number_masked = null,
        is_payment_account = true,
        allow_negative = false,
        overdraft_limit = 0,
        overdraft_expiry_date = null,
        is_active = true,
        notes = null,
      } = req.body || {};

      if (!account_id) {
        return res.status(400).json({
          success: false,
          message: "account_id is required.",
        });
      }

      if (!channel_type) {
        return res.status(400).json({
          success: false,
          message: "channel_type is required.",
        });
      }

      const normalizedChannelType = String(channel_type).trim().toUpperCase();

      if (!["CASH", "BANK", "MOBILE_MONEY", "CARD", "BANK_TRANSFER"].includes(normalizedChannelType)) {
        return res.status(400).json({
          success: false,
          message: "channel_type must be CASH, BANK, MOBILE_MONEY, CARD, or BANK_TRANSFER.",
        });
      }

      if (Number(overdraft_limit || 0) < 0) {
        return res.status(400).json({
          success: false,
          message: "overdraft_limit cannot be negative.",
        });
      }

      if (
        normalizedChannelType !== "BANK" &&
        Boolean(allow_negative) === true
      ) {
        return res.status(400).json({
          success: false,
          message: "Only BANK accounts can allow overdraft/negative balance.",
        });
      }

      await client.query("BEGIN");

      const accountCheck = await client.query(
        `
        SELECT account_id, account_code, account_name, account_type, is_active
        FROM fin.gl_account
        WHERE account_id = $1;
        `,
        [account_id]
      );

      if (accountCheck.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "GL account not found.",
        });
      }

      const account = accountCheck.rows[0];

      if (account.is_active === false) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Inactive GL account cannot be used as payment account.",
        });
      }

      if (account.account_type !== "ASSET") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Only ASSET accounts can be used as payment accounts.",
        });
      }

      const result = await client.query(
        `
        INSERT INTO fin.payment_account_control (
          account_id,
          channel_type,
          provider_name,
          account_number_masked,
          is_payment_account,
          allow_negative,
          overdraft_limit,
          overdraft_expiry_date,
          is_active,
          notes,
          created_at,
          updated_at
        )
        VALUES (
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
          now(),
          now()
        )
        ON CONFLICT (account_id)
        DO UPDATE SET
          channel_type = EXCLUDED.channel_type,
          provider_name = EXCLUDED.provider_name,
          account_number_masked = EXCLUDED.account_number_masked,
          is_payment_account = EXCLUDED.is_payment_account,
          allow_negative = EXCLUDED.allow_negative,
          overdraft_limit = EXCLUDED.overdraft_limit,
          overdraft_expiry_date = EXCLUDED.overdraft_expiry_date,
          is_active = EXCLUDED.is_active,
          notes = EXCLUDED.notes,
          updated_at = now()
        RETURNING *;
        `,
        [
          account_id,
          normalizedChannelType,
          provider_name,
          account_number_masked,
          Boolean(is_payment_account),
          Boolean(allow_negative),
          Number(overdraft_limit || 0),
          overdraft_expiry_date || null,
          Boolean(is_active),
          notes,
        ]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Payment account control saved successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to save payment account control.",
        error: error.message,
        detail: error.detail || null,
      });
    } finally {
      client.release();
    }
  }
);

/**
 * PATCH /api/payment-accounts/:accountId
 * Updates payment account control settings.
 */
router.patch(
  "/:accountId",
  requireAuth,
  requirePermission("CREATE_SETUP"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { accountId } = req.params;

      const {
        channel_type,
        provider_name,
        account_number_masked,
        is_payment_account,
        allow_negative,
        overdraft_limit,
        overdraft_expiry_date,
        is_active,
        notes,
      } = req.body || {};

      if (!accountId) {
        return res.status(400).json({
          success: false,
          message: "accountId is required.",
        });
      }

      const normalizedChannelType =
        channel_type === undefined || channel_type === null
          ? null
          : String(channel_type).trim().toUpperCase();

      if (
        normalizedChannelType &&
        !["CASH", "BANK", "MOBILE_MONEY", "CARD", "BANK_TRANSFER"].includes(normalizedChannelType)
      ) {
        return res.status(400).json({
          success: false,
          message: "channel_type must be CASH, BANK, MOBILE_MONEY, CARD, or BANK_TRANSFER.",
        });
      }

      if (
        overdraft_limit !== undefined &&
        overdraft_limit !== null &&
        Number(overdraft_limit) < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "overdraft_limit cannot be negative.",
        });
      }

      await client.query("BEGIN");

      const currentResult = await client.query(
        `
        SELECT
          pac.*,
          ga.account_code,
          ga.account_name
        FROM fin.payment_account_control pac
        JOIN fin.gl_account ga
          ON ga.account_id = pac.account_id
        WHERE pac.account_id = $1
        FOR UPDATE;
        `,
        [accountId]
      );

      if (currentResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Payment account control not found.",
        });
      }

      const current = currentResult.rows[0];

      const finalChannelType = normalizedChannelType || current.channel_type;
      const finalAllowNegative =
        allow_negative === undefined || allow_negative === null
          ? current.allow_negative
          : Boolean(allow_negative);

      if (finalChannelType !== "BANK" && finalAllowNegative === true) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Only BANK accounts can allow overdraft/negative balance.",
        });
      }

      const result = await client.query(
        `
        UPDATE fin.payment_account_control
        SET
          channel_type = COALESCE($2, channel_type),
          provider_name = COALESCE($3, provider_name),
          account_number_masked = COALESCE($4, account_number_masked),
          is_payment_account = COALESCE($5, is_payment_account),
          allow_negative = COALESCE($6, allow_negative),
          overdraft_limit = COALESCE($7, overdraft_limit),
          overdraft_expiry_date = $8,
          is_active = COALESCE($9, is_active),
          notes = COALESCE($10, notes),
          updated_at = now()
        WHERE account_id = $1
        RETURNING *;
        `,
        [
          accountId,
          normalizedChannelType,
          provider_name ?? null,
          account_number_masked ?? null,
          is_payment_account === undefined || is_payment_account === null
            ? null
            : Boolean(is_payment_account),
          allow_negative === undefined || allow_negative === null
            ? null
            : Boolean(allow_negative),
          overdraft_limit === undefined || overdraft_limit === null
            ? null
            : Number(overdraft_limit),
          overdraft_expiry_date || null,
          is_active === undefined || is_active === null
            ? null
            : Boolean(is_active),
          notes ?? null,
        ]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Payment account control updated successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      res.status(500).json({
        success: false,
        message: "Failed to update payment account control.",
        error: error.message,
        detail: error.detail || null,
      });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/payment-accounts/:accountId/test-payment
 * Tests whether the selected account can pay a given amount.
 */
router.post("/:accountId/test-payment", requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { amount } = req.body || {};

    await query(
      `
      SELECT fin.assert_payment_account_can_pay($1::uuid, $2::numeric);
      `,
      [accountId, Number(amount || 0)]
    );

    res.json({
      success: true,
      message: "Payment account can pay this amount.",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Payment account cannot pay this amount.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

export default router;
