import express from "express";
import { query } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { type, active } = req.query;

    const params = [];
    const conditions = [];

    if (type) {
      params.push(type.toUpperCase());
      conditions.push(`UPPER(account_type) = $${params.length}`);
    }

    if (active !== undefined) {
      params.push(active === "true");
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `
      SELECT
        account_id,
        account_code,
        account_name,
        account_type,
        is_control,
        is_active
      FROM fin.gl_account
      ${whereClause}
      ORDER BY account_code;
      `,
      params
    );

    res.json({
      success: true,
      count: result.rowCount,
      accounts: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load GL accounts.",
      error: error.message
    });
  }
});

router.get("/posting-setup", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        ps.setup_key,
        ga.account_code,
        ga.account_name,
        ga.account_type
      FROM fin.posting_setup ps
      JOIN fin.gl_account ga
        ON ga.account_id = ps.account_id
      ORDER BY ps.setup_key;
    `);

    res.json({
      success: true,
      count: result.rowCount,
      posting_setup: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load posting setup.",
      error: error.message
    });
  }
});

export default router;