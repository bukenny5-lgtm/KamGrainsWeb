import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import {
  KAM_FEATURE_FALLBACK,
  getActiveCompanyId,
  resolveBusinessFeatureMap,
  resolveBusinessFeatures,
} from "../services/businessFeatures.service.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = await getActiveCompanyId();
    const definitions = await resolveBusinessFeatures(companyId);
    const features = Object.fromEntries(
      definitions.map((feature) => [feature.feature_code, Boolean(feature.is_enabled)])
    );

    res.json({ success: true, company_id: companyId, features, definitions });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: "Business features are temporarily unavailable.",
      fallback: true,
      features: KAM_FEATURE_FALLBACK,
      error: error.message,
    });
  }
});

router.patch(
  "/",
  requireAuth,
  requirePermission("EDIT_SETUP"),
  async (req, res) => {
    const updates = req.body?.features;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: "features must be an object." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const companyResult = await client.query(`
        SELECT company_id
        FROM app.company_profile
        WHERE is_active = true
        ORDER BY created_at, company_id
        LIMIT 1
        FOR UPDATE;
      `);
      const companyId = companyResult.rows[0]?.company_id;
      if (!companyId) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Active business profile not found." });
      }

      const codes = Object.keys(updates);
      if (!codes.length || codes.some((code) => typeof updates[code] !== "boolean")) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Feature values must be booleans." });
      }

      const catalogue = await client.query(
        `SELECT feature_code, feature_group FROM app.feature WHERE is_active = true AND feature_code = ANY($1::text[])`,
        [codes]
      );
      const known = new Map(catalogue.rows.map((row) => [row.feature_code, row]));
      const unknown = codes.filter((code) => !known.has(code));
      if (unknown.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: `Unknown feature code(s): ${unknown.join(", ")}.` });
      }

      const previous = await client.query(
        `SELECT feature_code, is_enabled FROM app.company_feature WHERE company_id = $1 AND feature_code = ANY($2::text[])`,
        [companyId, codes]
      );
      const previousMap = new Map(previous.rows.map((row) => [row.feature_code, row.is_enabled]));

      for (const code of codes) {
        const nextValue = updates[code];
        await client.query(`
          INSERT INTO app.company_feature (company_id, feature_code, is_enabled, updated_at, updated_by)
          VALUES ($1, $2, $3, now(), $4)
          ON CONFLICT (company_id, feature_code) DO UPDATE
          SET is_enabled = EXCLUDED.is_enabled,
              updated_at = EXCLUDED.updated_at,
              updated_by = EXCLUDED.updated_by;
        `, [companyId, code, nextValue, req.user?.user_id || null]);

        await client.query(`
          INSERT INTO audit.event (event_id, event_ts, user_id, action, table_name, row_pk, row_data, txid)
          VALUES (gen_random_uuid(), now(), $1, 'U', 'app.company_feature',
                  jsonb_build_object('company_id', $2::text, 'feature_code', $3::text),
                  jsonb_build_object('old_value', $4::boolean, 'new_value', $5::boolean), txid_current());
        `, [req.user?.user_id || null, companyId, code, previousMap.get(code) ?? null, nextValue]);
      }

      await client.query("COMMIT");
      const definitions = await resolveBusinessFeatures(companyId);
      return res.json({
        success: true,
        company_id: companyId,
        features: Object.fromEntries(definitions.map((feature) => [feature.feature_code, Boolean(feature.is_enabled)])),
        definitions,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({ success: false, message: "Failed to update business features.", error: error.message });
    } finally {
      client.release();
    }
  }
);

export default router;
