import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();

function getApiChannelErrorStatus(error, fallbackStatus = 500) {
  const code = String(error?.code || "");

  if (Number(error?.status) >= 400) return Number(error.status);
  if (Number(error?.statusCode) >= 400) return Number(error.statusCode);

  if (code === "P0001") return 400;
  if (code === "23505") return 409;
  if (["23502", "23503", "22P02", "22003", "23514"].includes(code)) {
    return 400;
  }

  return fallbackStatus;
}

function getApiChannelErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();
  return message || fallbackMessage;
}

function sendApiChannelError(res, error, fallbackMessage, fallbackStatus = 500) {
  const status = getApiChannelErrorStatus(error, fallbackStatus);
  const message = getApiChannelErrorMessage(error, fallbackMessage);

  return res.status(status).json({
    success: false,
    message,
    error: message,
    detail: error?.detail || null,
    code: error?.code || null,
  });
}

/**
 * GET /api/api-payment-channels
 * Lists inactive/future API payment channels.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        api_payment_channel_id,
        channel_code,
        channel_name,
        channel_type,
        provider_name,
        linked_payment_account_id,
        payment_account_code,
        payment_account_name,
        linked_gl_account_id,
        gl_account_code,
        gl_account_name,
        account_number_masked,
        wallet_number_masked,
        currency_code,
        mode,
        branch_id,
        location_id,
        merchant_code,
        merchant_name,
        terminal_id,
        terminal_name,
        bank_name,
        account_name,
        credential_status,
        credentials_configured,
        credentials_last_verified_at,
        api_enabled,
        collection_enabled,
        disbursement_enabled,
        base_url,
        webhook_url,
        status,
        notes,
        created_by,
        created_at,
        updated_at,
        total_queue_count,
        success_count,
        failed_count,
        pending_count,
        webhook_count
      FROM fin.v_api_payment_channel_summary
      ORDER BY
        CASE channel_type
          WHEN 'CASH' THEN 1
          WHEN 'BANK' THEN 2
          WHEN 'MTN_MOMO' THEN 3
          WHEN 'AIRTEL_MONEY' THEN 4
          WHEN 'PAYMENT_GATEWAY' THEN 5
          ELSE 9
        END,
        channel_code;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    return sendApiChannelError(
      res,
      error,
      "Failed to load API payment channels.",
      500
    );
  }
});

function channelTypesForPaymentMethod(method) {
  if (method === "MOBILE_MONEY") return ["MTN_MOMO", "AIRTEL_MONEY"];
  if (method === "CARD") return ["CARD"];
  if (method === "BANK_TRANSFER") return ["BANK_TRANSFER", "BANK"];
  if (method === "CASH") return ["CASH"];
  return [];
}

function channelScopeSql() {
  return `
    c.status = 'ACTIVE'
    AND c.collection_enabled = true
    AND c.mode = 'MANUAL'
    AND ($2::uuid IS NULL OR c.branch_id IS NULL OR c.branch_id = $2::uuid)
    AND ($3::uuid IS NULL OR c.location_id IS NULL OR c.location_id = $3::uuid)`;
}

/** GET /api/api-payment-channels/available?payment_method=MOBILE_MONEY&branch_id=...&location_id=... */
router.get("/available", requireAuth, async (req, res) => {
  try {
    const method = String(req.query.payment_method || "").trim().toUpperCase();
    const types = channelTypesForPaymentMethod(method);
    if (!types.length) return res.status(400).json({ success: false, message: "A supported payment_method is required." });
    const result = await query(`
      SELECT c.api_payment_channel_id, c.channel_code, c.channel_name, c.channel_type,
             c.provider_name, c.currency_code, c.mode, c.merchant_code, c.merchant_name,
             c.account_number_masked, c.wallet_number_masked, c.bank_name, c.account_name,
             c.terminal_id, c.terminal_name, c.branch_id, c.location_id,
             c.linked_payment_account_id, c.linked_gl_account_id
      FROM fin.api_payment_channel c
      WHERE c.channel_type = ANY($1::text[])
        AND ${channelScopeSql()}
      ORDER BY c.channel_name;`, [types, req.query.branch_id || null, req.query.location_id || null]);
    return res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    return sendApiChannelError(res, error, "Failed to load available payment channels.", 500);
  }
});

/** GET /api/api-payment-channels/transactions/:transactionId */
router.get("/transactions/:transactionId", requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT pt.*, c.channel_code, c.channel_name, c.channel_type, c.provider_name
      FROM app.payment_transaction pt
      JOIN fin.api_payment_channel c ON c.api_payment_channel_id = pt.channel_id
      WHERE pt.payment_transaction_id = $1;`, [req.params.transactionId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Payment transaction not found." });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) { return sendApiChannelError(res, error, "Failed to load payment transaction.", 500); }
});

/** PATCH /api/api-payment-channels/transactions/:transactionId/status */
router.patch("/transactions/:transactionId/status", requireAuth, requirePermission("CONFIRM_MANUAL_PAYMENT"), async (req, res) => {
  const client = await pool.connect();
  try {
    const nextStatus = String(req.body?.status || "").trim().toUpperCase();
    if (!["CONFIRMED", "FAILED", "CANCELLED", "REVERSED", "PENDING"].includes(nextStatus)) return res.status(400).json({ success: false, message: "Invalid payment transaction status." });
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM app.payment_transaction WHERE payment_transaction_id=$1 FOR UPDATE", [req.params.transactionId]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Payment transaction not found." }); }
    const oldStatus = current.rows[0].status;
    const allowed = { INITIATED: ["PENDING", "CONFIRMED", "FAILED", "CANCELLED"], PENDING: ["CONFIRMED", "FAILED", "CANCELLED"], CONFIRMED: ["REVERSED"], FAILED: [], CANCELLED: [], REVERSED: [] };
    if (!allowed[oldStatus]?.includes(nextStatus)) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: `Invalid payment status transition ${oldStatus} -> ${nextStatus}.` }); }
    const result = await client.query(`UPDATE app.payment_transaction SET status=$2, confirmed_by=CASE WHEN $2='CONFIRMED' THEN $3 ELSE confirmed_by END, confirmed_at=CASE WHEN $2='CONFIRMED' THEN now() ELSE confirmed_at END, updated_at=now() WHERE payment_transaction_id=$1 RETURNING *`, [req.params.transactionId, nextStatus, req.user?.user_id || null]);
    await client.query("INSERT INTO app.payment_transaction_event(payment_transaction_id,old_status,new_status,event_type,actor_user_id) VALUES($1,$2,$3,'STATUS_CHANGE',$4)", [req.params.transactionId, oldStatus, nextStatus, req.user?.user_id || null]);
    await client.query("COMMIT");
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); return sendApiChannelError(res, error, "Failed to update payment transaction status.", 400); }
  finally { client.release(); }
});

/**
 * GET /api/api-payment-channels/:channelId
 * Gets one API payment channel with queue and webhook logs.
 */
router.get("/:channelId", requireAuth, async (req, res) => {
  try {
    const { channelId } = req.params;

    const headerResult = await query(
      `
      SELECT *
      FROM fin.v_api_payment_channel_summary
      WHERE api_payment_channel_id = $1;
      `,
      [channelId]
    );

    if (headerResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "API payment channel not found.",
      });
    }

    const queueResult = await query(
      `
      SELECT
        api_payment_transaction_queue_id,
        api_payment_channel_id,
        channel_code,
        channel_name,
        channel_type,
        provider_name,
        transaction_type,
        direction,
        source_module,
        source_id,
        document_no,
        external_reference,
        internal_reference,
        payer_name,
        payer_phone_masked,
        payer_account_masked,
        payee_name,
        payee_phone_masked,
        payee_account_masked,
        amount,
        currency_code,
        status,
        failure_message,
        queued_at,
        processed_at,
        failed_at,
        created_by,
        created_at,
        updated_at
      FROM fin.v_api_payment_transaction_queue
      WHERE api_payment_channel_id = $1
      ORDER BY created_at DESC
      LIMIT 100;
      `,
      [channelId]
    );

    const webhookResult = await query(
      `
      SELECT
        api_payment_webhook_log_id,
        api_payment_channel_id,
        provider_name,
        webhook_event_type,
        external_reference,
        internal_reference,
        http_method,
        response_status,
        processing_status,
        processing_message,
        received_at,
        processed_at
      FROM fin.api_payment_webhook_log
      WHERE api_payment_channel_id = $1
      ORDER BY received_at DESC
      LIMIT 100;
      `,
      [channelId]
    );

    res.json({
      success: true,
      data: {
        ...headerResult.rows[0],
        queue: queueResult.rows,
        webhook_logs: webhookResult.rows,
      },
    });
  } catch (error) {
    return sendApiChannelError(
      res,
      error,
      "Failed to load API payment channel.",
      500
    );
  }
});

/**
 * POST /api/api-payment-channels
 * Creates a future/inactive API payment channel.
 * Version 1 safety: api_enabled is forced to false.
 */
router.post(
  "/",
  requireAuth,
  requirePermission("MANAGE_PAYMENT_CHANNELS"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        channel_code,
        channel_name,
        channel_type,
        provider_name,
        linked_payment_account_id = null,
        linked_gl_account_id = null,
        account_number_masked = null,
        wallet_number_masked = null,
        collection_enabled = false,
        disbursement_enabled = false,
        currency_code = "UGX",
        mode = "MANUAL",
        branch_id = null,
        location_id = null,
        merchant_code = null,
        merchant_name = null,
        terminal_id = null,
        terminal_name = null,
        bank_name = null,
        account_name = null,
        credential_status = "NOT_CONFIGURED",
        credentials_configured = false,
        credentials_last_verified_at = null,
        base_url = null,
        webhook_url = null,
        public_key_ref = null,
        secret_key_ref = null,
        api_key_ref = null,
        status = "INACTIVE",
        notes = null,
        created_by = null,
      } = req.body || {};

      if (!channel_code) {
        return res.status(400).json({
          success: false,
          message: "channel_code is required.",
        });
      }

      if (!channel_name) {
        return res.status(400).json({
          success: false,
          message: "channel_name is required.",
        });
      }

      if (!channel_type) {
        return res.status(400).json({
          success: false,
          message: "channel_type is required.",
        });
      }

      if (!provider_name) {
        return res.status(400).json({
          success: false,
          message: "provider_name is required.",
        });
      }

      const normalizedChannelType = String(channel_type).trim().toUpperCase();
      const normalizedStatus = String(status || "INACTIVE").trim().toUpperCase();

      if (
        ![
          "CASH",
          "BANK",
          "MTN_MOMO",
          "AIRTEL_MONEY",
          "PAYMENT_GATEWAY",
          "CARD",
          "BANK_TRANSFER",
        ].includes(normalizedChannelType)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "channel_type must be CASH, BANK, MTN_MOMO, AIRTEL_MONEY, or PAYMENT_GATEWAY.",
        });
      }

      if (!["INACTIVE", "ACTIVE", "SUSPENDED", "TESTING", "API_ENABLED"].includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message:
            "status must be INACTIVE, ACTIVE, TESTING, SUSPENDED, or API_ENABLED.",
        });
      }

      await client.query("BEGIN");

      if (linked_payment_account_id) {
        const paymentAccountCheck = await client.query(
          `
          SELECT account_id
          FROM fin.payment_account_control
          WHERE account_id = $1;
          `,
          [linked_payment_account_id]
        );

        if (paymentAccountCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            message: "Linked payment account was not found.",
          });
        }
      }

      if (linked_gl_account_id) {
        const glAccountCheck = await client.query(
          `
          SELECT account_id
          FROM fin.gl_account
          WHERE account_id = $1;
          `,
          [linked_gl_account_id]
        );

        if (glAccountCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            message: "Linked GL account was not found.",
          });
        }
      }

      const userId = req.user?.user_id || req.body?.user_id || created_by || null;

      const result = await client.query(
        `
        INSERT INTO fin.api_payment_channel (
          api_payment_channel_id,
          channel_code,
          channel_name,
          channel_type,
          provider_name,
          linked_payment_account_id,
          linked_gl_account_id,
          account_number_masked,
          wallet_number_masked,
          currency_code,
          mode,
          branch_id,
          location_id,
          merchant_code,
          merchant_name,
          terminal_id,
          terminal_name,
          bank_name,
          account_name,
          credential_status,
          credentials_configured,
          credentials_last_verified_at,
          api_enabled,
          collection_enabled,
          disbursement_enabled,
          base_url,
          webhook_url,
          public_key_ref,
          secret_key_ref,
          api_key_ref,
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
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          false,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27,
          $28,
          $29,
          $30,
          $31,
          $32,
          $33,
          now(),
          now()
        )
        RETURNING *;
        `,
        [
          String(channel_code).trim().toUpperCase(),
          channel_name,
          normalizedChannelType,
          provider_name,
          linked_payment_account_id || null,
          linked_gl_account_id || null,
          account_number_masked || null,
          wallet_number_masked || null,
          String(currency_code || "UGX").trim().toUpperCase(),
          String(mode || "MANUAL").trim().toUpperCase(),
          branch_id || null,
          location_id || null,
          merchant_code || null,
          merchant_name || null,
          terminal_id || null,
          terminal_name || null,
          bank_name || null,
          account_name || null,
          String(credential_status || "NOT_CONFIGURED").trim().toUpperCase(),
          Boolean(credentials_configured),
          credentials_last_verified_at || null,
          Boolean(collection_enabled),
          Boolean(disbursement_enabled),
          base_url || null,
          webhook_url || null,
          public_key_ref || null,
          secret_key_ref || null,
          api_key_ref || null,
          normalizedStatus,
          notes,
          userId,
        ]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message:
          "API payment channel created as inactive future integration successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendApiChannelError(
        res,
        error,
        "Failed to create API payment channel.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * PATCH /api/api-payment-channels/:channelId
 * Updates a future/inactive API payment channel.
 * Version 1 safety: api_enabled remains false.
 */
router.patch(
  "/:channelId",
  requireAuth,
  requirePermission("MANAGE_PAYMENT_CHANNELS"),
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { channelId } = req.params;

      const {
        channel_name,
        channel_type,
        provider_name,
        linked_payment_account_id,
        linked_gl_account_id,
        account_number_masked,
        wallet_number_masked,
        currency_code,
        mode,
        branch_id,
        location_id,
        merchant_code,
        merchant_name,
        terminal_id,
        terminal_name,
        bank_name,
        account_name,
        credential_status,
        credentials_configured,
        credentials_last_verified_at,
        collection_enabled,
        disbursement_enabled,
        base_url,
        webhook_url,
        public_key_ref,
        secret_key_ref,
        api_key_ref,
        status,
        notes,
      } = req.body || {};

      await client.query("BEGIN");

      const currentResult = await client.query(
        `
        SELECT *
        FROM fin.api_payment_channel
        WHERE api_payment_channel_id = $1
        FOR UPDATE;
        `,
        [channelId]
      );

      if (currentResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "API payment channel not found.",
        });
      }

      const normalizedChannelType =
        channel_type === undefined || channel_type === null
          ? null
          : String(channel_type).trim().toUpperCase();

      const normalizedStatus =
        status === undefined || status === null
          ? null
          : String(status).trim().toUpperCase();

      if (
        normalizedChannelType &&
        ![
          "CASH",
          "BANK",
          "MTN_MOMO",
          "AIRTEL_MONEY",
          "PAYMENT_GATEWAY",
          "CARD",
          "BANK_TRANSFER",
        ].includes(normalizedChannelType)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "channel_type must be CASH, BANK, MTN_MOMO, AIRTEL_MONEY, or PAYMENT_GATEWAY.",
        });
      }

      if (
        normalizedStatus &&
        !["INACTIVE", "ACTIVE", "SUSPENDED", "TESTING", "API_ENABLED"].includes(normalizedStatus)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "status must be INACTIVE, ACTIVE, TESTING, SUSPENDED, or API_ENABLED.",
        });
      }

      if (linked_payment_account_id) {
        const paymentAccountCheck = await client.query(
          `
          SELECT account_id
          FROM fin.payment_account_control
          WHERE account_id = $1;
          `,
          [linked_payment_account_id]
        );

        if (paymentAccountCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            message: "Linked payment account was not found.",
          });
        }
      }

      if (linked_gl_account_id) {
        const glAccountCheck = await client.query(
          `
          SELECT account_id
          FROM fin.gl_account
          WHERE account_id = $1;
          `,
          [linked_gl_account_id]
        );

        if (glAccountCheck.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(404).json({
            success: false,
            message: "Linked GL account was not found.",
          });
        }
      }

      const result = await client.query(
        `
        UPDATE fin.api_payment_channel
        SET
          channel_name = COALESCE($2, channel_name),
          channel_type = COALESCE($3, channel_type),
          provider_name = COALESCE($4, provider_name),
          linked_payment_account_id = $5,
          linked_gl_account_id = $6,
          account_number_masked = $7,
          wallet_number_masked = $8,
          currency_code = COALESCE($9, currency_code),
          mode = COALESCE($10, mode),
          branch_id = $11,
          location_id = $12,
          merchant_code = $13,
          merchant_name = $14,
          terminal_id = $15,
          terminal_name = $16,
          bank_name = $17,
          account_name = $18,
          credential_status = COALESCE($19, credential_status),
          credentials_configured = COALESCE($20, credentials_configured),
          credentials_last_verified_at = $21,
          api_enabled = false,
          collection_enabled = COALESCE($22, collection_enabled),
          disbursement_enabled = COALESCE($23, disbursement_enabled),
          base_url = $24,
          webhook_url = $25,
          public_key_ref = $26,
          secret_key_ref = $27,
          api_key_ref = $28,
          status = COALESCE($29, status),
          notes = $30,
          updated_at = now()
        WHERE api_payment_channel_id = $1
        RETURNING *;
        `,
        [
          channelId,
          channel_name ?? null,
          normalizedChannelType,
          provider_name ?? null,
          linked_payment_account_id || null,
          linked_gl_account_id || null,
          account_number_masked ?? null,
          wallet_number_masked ?? null,
          currency_code ?? null,
          mode === undefined || mode === null ? null : String(mode).trim().toUpperCase(),
          branch_id ?? null,
          location_id ?? null,
          merchant_code ?? null,
          merchant_name ?? null,
          terminal_id ?? null,
          terminal_name ?? null,
          bank_name ?? null,
          account_name ?? null,
          credential_status === undefined || credential_status === null ? null : String(credential_status).trim().toUpperCase(),
          credentials_configured === undefined || credentials_configured === null ? null : Boolean(credentials_configured),
          credentials_last_verified_at ?? null,
          collection_enabled === undefined || collection_enabled === null
            ? null
            : Boolean(collection_enabled),
          disbursement_enabled === undefined || disbursement_enabled === null
            ? null
            : Boolean(disbursement_enabled),
          base_url ?? null,
          webhook_url ?? null,
          public_key_ref ?? null,
          secret_key_ref ?? null,
          api_key_ref ?? null,
          normalizedStatus,
          notes ?? null,
        ]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message:
          "API payment channel updated. Live API remains disabled in Version 1.",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");

      return sendApiChannelError(
        res,
        error,
        "Failed to update API payment channel.",
        500
      );
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/api-payment-channels/:channelId/test-action
 * Safety endpoint.
 * It always blocks live API action in Version 1.
 */
router.post(
  "/:channelId/test-action",
  requireAuth,
  requirePermission("MANAGE_PAYMENT_CHANNELS"),
  async (req, res) => {
    try {
      const { channelId } = req.params;

      await query(
        `
        SELECT fin.assert_api_channel_inactive_v1($1::uuid);
        `,
        [channelId]
      );

      return res.status(400).json({
        success: false,
        message:
          "Live API actions are intentionally disabled in Version 1. This channel is stored for future integration only.",
      });
    } catch (error) {
      return sendApiChannelError(
        res,
        error,
        "Live API actions are disabled in Version 1.",
        400
      );
    }
  }
);

/**
 * GET /api/api-payment-channels/:channelId/queue
 */
router.get("/:channelId/queue", requireAuth, async (req, res) => {
  try {
    const { channelId } = req.params;

    const result = await query(
      `
      SELECT *
      FROM fin.v_api_payment_transaction_queue
      WHERE api_payment_channel_id = $1
      ORDER BY created_at DESC
      LIMIT 200;
      `,
      [channelId]
    );

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    return sendApiChannelError(
      res,
      error,
      "Failed to load API transaction queue.",
      500
    );
  }
});

/**
 * GET /api/api-payment-channels/:channelId/webhook-logs
 */
router.get("/:channelId/webhook-logs", requireAuth, async (req, res) => {
  try {
    const { channelId } = req.params;

    const result = await query(
      `
      SELECT
        api_payment_webhook_log_id,
        api_payment_channel_id,
        provider_name,
        webhook_event_type,
        external_reference,
        internal_reference,
        http_method,
        response_status,
        processing_status,
        processing_message,
        received_at,
        processed_at
      FROM fin.api_payment_webhook_log
      WHERE api_payment_channel_id = $1
      ORDER BY received_at DESC
      LIMIT 200;
      `,
      [channelId]
    );

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    return sendApiChannelError(
      res,
      error,
      "Failed to load webhook logs.",
      500
    );
  }
});

export default router;
