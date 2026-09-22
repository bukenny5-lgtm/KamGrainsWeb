import { query } from "../db.js";

export const KAM_FEATURE_FALLBACK = {
  sales: true,
  purchasing: true,
  inventory: true,
  cleaning: true,
  finance: true,
  reports: true,
  pos: false,
  barcode: false,
  MULTI_LOCATION: false,
};

export async function getActiveCompanyId() {
  const result = await query(`
    SELECT company_id
    FROM app.company_profile
    WHERE is_active = true
    ORDER BY created_at, company_id
    LIMIT 1;
  `);

  return result.rows[0]?.company_id || null;
}

export async function resolveBusinessFeatures(companyId = null) {
  const activeCompanyId = companyId || await getActiveCompanyId();
  if (!activeCompanyId) return [];

  const result = await query(`
    SELECT f.feature_code,
           f.feature_name,
           f.feature_group,
           f.description,
           COALESCE(cf.is_enabled, f.default_enabled) AS is_enabled,
           cf.is_enabled AS override_enabled,
           cf.updated_at,
           cf.updated_by
    FROM app.feature f
    LEFT JOIN app.company_feature cf
      ON cf.feature_code = f.feature_code
     AND cf.company_id = $1
    WHERE f.is_active = true
    ORDER BY f.feature_group NULLS LAST, f.feature_name;
  `, [activeCompanyId]);

  return result.rows;
}

export async function resolveBusinessFeatureMap(companyId = null) {
  const rows = await resolveBusinessFeatures(companyId);
  return Object.fromEntries(rows.map((row) => [row.feature_code, Boolean(row.is_enabled)]));
}
