import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /api/audit-events
 * Reads from existing audit.event table.
 */
router.get("/", async (req, res) => {
  try {
    const {
      search,
      table_name,
      action,
      user_id,
      limit = 300,
    } = req.query;

    const params = [];
    const conditions = [];

    if (table_name && table_name !== "ALL") {
      params.push(String(table_name));
      conditions.push(`e.table_name = $${params.length}`);
    }

    if (action && action !== "ALL") {
      params.push(String(action));
      conditions.push(`e.action = $${params.length}`);
    }

    if (user_id && user_id !== "ALL") {
      params.push(String(user_id));
      conditions.push(`e.user_id::text = $${params.length}`);
    }

    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      conditions.push(`
        (
          LOWER(e.action) LIKE $${params.length}
          OR LOWER(e.table_name) LIKE $${params.length}
          OR LOWER(e.row_pk::text) LIKE $${params.length}
          OR LOWER(e.row_data::text) LIKE $${params.length}
          OR LOWER(COALESCE(e.user_id::text, '')) LIKE $${params.length}
          OR LOWER(COALESCE(e.client_addr::text, '')) LIKE $${params.length}
          OR LOWER(COALESCE(e.txid::text, '')) LIKE $${params.length}
        )
      `);
    }

    const safeLimit = Math.min(Number(limit) || 300, 1000);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `
      SELECT
        e.event_id,
        e.event_ts,
        e.user_id,
        e.action,
        CASE
          WHEN e.action = 'I' THEN 'INSERT'
          WHEN e.action = 'U' THEN 'UPDATE'
          WHEN e.action = 'D' THEN 'DELETE'
          ELSE e.action
        END AS action_label,
        e.table_name,
        split_part(e.table_name, '.', 1) AS schema_name,
        split_part(e.table_name, '.', 2) AS object_name,
        e.row_pk,
        e.row_data,
        e.client_addr,
        e.txid
      FROM audit.event e
      ${whereClause}
      ORDER BY e.event_ts DESC
      LIMIT ${safeLimit};
      `,
      params
    );

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load audit events.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/audit-events/backdate
 * Lists backdated events from audit.backdate_event
 */
router.get("/backdate", requireAuth, async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const result = await query(
      `
      SELECT
        backdate_event_id,
        table_name,
        record_id,
        created_by,
        (SELECT username FROM sec.app_user WHERE user_id = created_by) AS created_by_username,
        created_date,
        system_date,
        days_backdated,
        backdate_reason,
        approved_by,
        (SELECT username FROM sec.app_user WHERE user_id = approved_by) AS approved_by_username,
        approved_at,
        change_type,
        created_at
      FROM audit.backdate_event
      ORDER BY created_at DESC
      LIMIT $1::int;
      `,
      [limit || 100]
    );

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load backdated events.",
      error: error.message,
    });
  }
});

/**
 * GET /api/audit-events/backdate/:eventId
 * Gets one backdated event by ID
 */
router.get("/backdate/:eventId", requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `
      SELECT
        backdate_event_id,
        table_name,
        record_id,
        created_by,
        (SELECT username FROM sec.app_user WHERE user_id = created_by) AS created_by_username,
        created_date,
        system_date,
        days_backdated,
        backdate_reason,
        approved_by,
        (SELECT username FROM sec.app_user WHERE user_id = approved_by) AS approved_by_username,
        approved_at,
        change_type,
        created_at
      FROM audit.backdate_event
      WHERE backdate_event_id = $1::bigint;
      `,
      [eventId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Backdated event not found.",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load backdated event.",
      error: error.message,
    });
  }
});
/**
 * GET /api/audit-events/tables
 * Returns audited table names.
 */
router.get("/tables", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        table_name,
        COUNT(*) AS event_count,
        MAX(event_ts) AS last_event_ts
      FROM audit.event
      GROUP BY table_name
      ORDER BY table_name;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load audited tables.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/audit-events/actions
 * Returns action counts.
 */
router.get("/actions", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        action,
        CASE
          WHEN action = 'I' THEN 'INSERT'
          WHEN action = 'U' THEN 'UPDATE'
          WHEN action = 'D' THEN 'DELETE'
          ELSE action
        END AS action_label,
        COUNT(*) AS event_count
      FROM audit.event
      GROUP BY action
      ORDER BY event_count DESC;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load audit actions.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

/**
 * GET /api/audit-events/:eventId
 * Get one audit event.
 */
router.get("/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `
      SELECT
        e.event_id,
        e.event_ts,
        e.user_id,
        e.action,
        CASE
          WHEN e.action = 'I' THEN 'INSERT'
          WHEN e.action = 'U' THEN 'UPDATE'
          WHEN e.action = 'D' THEN 'DELETE'
          ELSE e.action
        END AS action_label,
        e.table_name,
        split_part(e.table_name, '.', 1) AS schema_name,
        split_part(e.table_name, '.', 2) AS object_name,
        e.row_pk,
        e.row_data,
        e.client_addr,
        e.txid
      FROM audit.event e
      WHERE e.event_id = $1;
      `,
      [eventId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Audit event not found.",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load audit event.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

export default router;