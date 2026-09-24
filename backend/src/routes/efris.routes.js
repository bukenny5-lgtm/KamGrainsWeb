import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserRoles, requirePermission } from "../middleware/permissions.js";
import { getActiveCompanyId } from "../services/businessFeatures.service.js";

const router = express.Router();
router.use(requireAuth);

const allBranches = (req) => getUserRoles(req).some((role) => ["ADMIN", "MANAGER", "AUDITOR", "HEAD_OFFICE"].includes(role));

async function precheck(companyId) {
  const result = await query("SELECT * FROM app.efris_activation_precheck($1)", [companyId]);
  return result.rows;
}

router.get("/settings", requirePermission("VIEW_EFRIS_CONFIGURATION"), async (req, res) => {
  try {
    const companyId = await getActiveCompanyId();
    const result = await query(`SELECT cp.company_id, cp.company_name, cp.business_name, cp.tin, cp.tax_country_code,
      ec.* FROM app.company_profile cp LEFT JOIN app.efris_configuration ec ON ec.company_id=cp.company_id
      WHERE cp.company_id=$1`, [companyId]);
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to load EFRIS settings.", error: error.message }); }
});

router.get("/precheck", requirePermission("VIEW_EFRIS_CONFIGURATION"), async (req, res) => {
  try { const companyId = await getActiveCompanyId(); const checks = await precheck(companyId); res.json({ success: true, ready: checks.every((row) => row.is_valid), checks }); }
  catch (error) { res.status(500).json({ success: false, message: "Failed to load EFRIS activation precheck.", error: error.message }); }
});

router.patch("/settings", requirePermission("MANAGE_EFRIS_CONFIGURATION"), async (req, res) => {
  const client = await pool.connect();
  try {
    const companyId = await getActiveCompanyId();
    const body = req.body || {};
    await client.query("BEGIN");
    if (body.tin !== undefined || body.tax_country_code !== undefined) {
      await client.query("UPDATE app.company_profile SET tin=COALESCE($2,tin), tax_country_code=COALESCE($3,tax_country_code) WHERE company_id=$1", [companyId, body.tin ?? null, body.tax_country_code ?? null]);
    }
    const fields = ["environment", "registration_status", "system_to_system_enabled", "place_of_business_identifier", "device_identifier", "offline_enabled", "credentials_configured", "credential_reference", "technical_spec_version", "transport_configured"];
    const assignments = []; const values = [];
    for (const field of fields) if (body[field] !== undefined) { values.push(body[field]); assignments.push(`${field}=$${values.length}`); }
    if (body.efris_enabled === true) {
      const checks = await client.query("SELECT * FROM app.efris_activation_precheck($1)", [companyId]);
      const failed = checks.rows.filter((row) => !row.is_valid);
      if (failed.length) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "EFRIS activation precheck failed.", checks: checks.rows }); }
      values.push(true); assignments.push(`efris_enabled=$${values.length}`);
    } else if (body.efris_enabled === false) { values.push(false); assignments.push(`efris_enabled=$${values.length}`); }
    if (assignments.length) { values.push(companyId); await client.query(`UPDATE app.efris_configuration SET ${assignments.join(",")}, updated_at=now() WHERE company_id=$${values.length}`, values); }
    if (body.efris_enabled !== undefined) await client.query(`INSERT INTO app.company_feature(company_id,feature_code,is_enabled,updated_at,updated_by) VALUES($1,'efris',$2,now(),$3) ON CONFLICT(company_id,feature_code) DO UPDATE SET is_enabled=EXCLUDED.is_enabled,updated_at=now(),updated_by=EXCLUDED.updated_by`, [companyId, Boolean(body.efris_enabled), req.user?.user_id || null]);
    await client.query("COMMIT");
    const current = await query("SELECT * FROM app.efris_configuration WHERE company_id=$1", [companyId]);
    res.json({ success: true, data: current.rows[0] });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(400).json({ success: false, message: "Failed to update EFRIS settings.", error: error.message }); }
  finally { client.release(); }
});

router.get("/documents", requirePermission("VIEW_EFRIS_DOCUMENTS"), async (req, res) => {
  try {
    const values = [req.branchId, allBranches(req)];
    const result = await query(`SELECT d.*, b.branch_name FROM app.efris_document d LEFT JOIN app.branch b ON b.branch_id=d.branch_id WHERE ($2::boolean OR d.branch_id=$1) ORDER BY d.created_at DESC LIMIT 500`, values);
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to load EFRIS documents.", error: error.message }); }
});

router.post("/documents/:id/retry", requirePermission("RETRY_EFRIS_DOCUMENT"), async (req, res) => {
  try {
    const result = await query(`UPDATE app.efris_document SET status=CASE WHEN submission_mode='OFFLINE_ALLOWED' THEN 'OFFLINE_PENDING' ELSE 'RETRY_PENDING' END, next_retry_at=now(), updated_at=now(), last_error_message=NULL WHERE efris_document_id=$1 AND status IN ('REJECTED','RETRY_PENDING','OFFLINE_PENDING') RETURNING *`, [req.params.id]);
    if (!result.rowCount) return res.status(409).json({ success: false, message: "Document is not eligible for retry." });
    await query("INSERT INTO app.efris_document_event(efris_document_id,event_type,new_status,created_by) VALUES($1,'MANUAL_RETRY',$2,$3)", [req.params.id, result.rows[0].status, req.user?.user_id || null]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(400).json({ success: false, message: "Failed to queue EFRIS retry.", error: error.message }); }
});

router.post("/documents/:id/internal-mock-submit", requirePermission("RETRY_EFRIS_DOCUMENT"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM app.efris_document WHERE efris_document_id=$1 FOR UPDATE", [req.params.id]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "EFRIS document not found." }); }
    const document = current.rows[0];
    if (["ACCEPTED", "CANCELLED", "CREDITED"].includes(document.status)) { await client.query("ROLLBACK"); return res.status(409).json({ success: false, message: "Fiscal document is not eligible for another submission." }); }
    const attempt = Number(document.attempt_count || 0) + 1;
    const outcome = String(req.body?.outcome || "ACCEPT").toUpperCase();
    const status = outcome === "REJECT" ? "REJECTED" : outcome === "TRANSIENT" ? (document.submission_mode === "OFFLINE_ALLOWED" ? "OFFLINE_PENDING" : "RETRY_PENDING") : "ACCEPTED";
    const fdn = status === "ACCEPTED" ? `INTERNAL-MOCK-FDN-${document.source_document_number}` : null;
    const updated = await client.query(`UPDATE app.efris_document SET status=$2, attempt_count=$3, fdn=$4, verification_code=$5, last_error_code=$6, last_error_message=$7, submitted_at=now(), accepted_at=CASE WHEN $2='ACCEPTED' THEN now() ELSE accepted_at END, rejected_at=CASE WHEN $2='REJECTED' THEN now() ELSE rejected_at END, updated_at=now() WHERE efris_document_id=$1 RETURNING *`, [document.efris_document_id, status, attempt, fdn, status === "ACCEPTED" ? `INTERNAL-MOCK-VERIFICATION-${document.source_document_number}` : null, status === "REJECTED" ? "INTERNAL_MOCK_VALIDATION" : status === "RETRY_PENDING" || status === "OFFLINE_PENDING" ? "INTERNAL_MOCK_TRANSIENT" : null, status === "REJECTED" ? "INTERNAL MOCK rejection; not a URA response." : null]);
    await client.query("INSERT INTO app.efris_submission_attempt(efris_document_id,attempt_number,environment,operation,provider_status,external_reference,sanitized_response,error_code,error_message) VALUES($1,$2,'INTERNAL_MOCK','SUBMIT',$3,$4,$5,$6,$7)", [document.efris_document_id, attempt, status, fdn, JSON.stringify({ status, label: "INTERNAL MOCK — NOT URA" }), updated.rows[0].last_error_code, updated.rows[0].last_error_message]);
    await client.query("INSERT INTO app.efris_document_event(efris_document_id,event_type,old_status,new_status,event_metadata,created_by) VALUES($1,$2,$3,$4,$5,$6)", [document.efris_document_id, status === "ACCEPTED" ? "ACCEPTED" : status === "REJECTED" ? "REJECTED" : "RETRY_SCHEDULED", document.status, status, JSON.stringify({ adapter: "INTERNAL_MOCK", not_ura: true }), req.user?.user_id || null]);
    await client.query("COMMIT");
    res.json({ success: true, internal_mock: true, message: "Internal mock only; this is not a URA submission.", data: updated.rows[0] });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); res.status(400).json({ success: false, message: "Internal mock submission failed.", error: error.message }); }
  finally { client.release(); }
});

async function upsertMapping(req, res, table, keyFields, fields, permission = "MANAGE_EFRIS_MAPPINGS") {
  try {
    const body = req.body || {}; const companyId = await getActiveCompanyId();
    const names = ["company_id", ...keyFields, ...fields]; const values = [companyId, ...keyFields.map((key) => body[key] || null), ...fields.map((key) => body[key] ?? null)];
    const placeholders = names.map((_, i) => `$${i + 1}`).join(","); const updates = fields.map((field) => `${field}=EXCLUDED.${field}`).concat(["updated_at=now()"]).join(",");
    const result = await query(`INSERT INTO ${table}(${names.join(",")}) VALUES(${placeholders}) ON CONFLICT(${["company_id", ...keyFields].join(",")}) DO UPDATE SET ${updates} RETURNING *`, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(400).json({ success: false, message: "Failed to save EFRIS mapping.", error: error.message }); }
}

router.post("/mappings/product", requirePermission("MANAGE_EFRIS_MAPPINGS"), (req, res) => upsertMapping(req, res, "app.efris_product_mapping", ["product_id"], ["commodity_code", "item_classification", "efris_uom_code", "description_override", "is_active", "effective_from", "effective_to"]));
router.post("/mappings/uom", requirePermission("MANAGE_EFRIS_MAPPINGS"), (req, res) => upsertMapping(req, res, "app.efris_uom_mapping", ["uom_code"], ["efris_uom_code", "is_active", "effective_from", "effective_to"]));
router.post("/mappings/tax", requirePermission("MANAGE_EFRIS_MAPPINGS"), (req, res) => upsertMapping(req, res, "app.efris_tax_mapping", ["tax_code_id"], ["efris_tax_category_code", "is_active", "effective_from", "effective_to"]));
router.post("/mappings/branch", requirePermission("MANAGE_EFRIS_MAPPINGS"), (req, res) => upsertMapping(req, res, "app.efris_branch_mapping", ["branch_id", "location_id"], ["efris_place_of_business_code", "is_active", "effective_from", "effective_to"]));

router.get("/mappings", requirePermission("VIEW_EFRIS_CONFIGURATION"), async (req, res) => {
  try {
    const companyId = await getActiveCompanyId();
    const [products, uoms, taxes, branches] = await Promise.all([
      query(`SELECT p.product_id,p.sku,p.product_name,p.uom_code,m.* FROM inv.product p LEFT JOIN app.efris_product_mapping m ON m.product_id=p.product_id AND m.company_id=$1 WHERE p.is_active AND p.is_saleable ORDER BY p.product_name`, [companyId]),
      query(`SELECT u.uom_code,u.uom_name,m.efris_uom_code,m.is_active FROM inv.uom u LEFT JOIN app.efris_uom_mapping m ON m.uom_code=u.uom_code AND m.company_id=$1 ORDER BY u.uom_code`, [companyId]),
      query(`SELECT t.tax_code_id,t.code,t.treatment,t.rate,m.efris_tax_category_code,m.is_active FROM app.tax_code t LEFT JOIN app.efris_tax_mapping m ON m.tax_code_id=t.tax_code_id AND m.company_id=$1 WHERE t.company_id=$1 ORDER BY t.code`, [companyId]),
      query(`SELECT b.branch_id,b.branch_name,m.location_id,m.efris_place_of_business_code,m.is_active FROM app.branch b LEFT JOIN app.efris_branch_mapping m ON m.branch_id=b.branch_id AND m.company_id=$1 WHERE b.company_id=$1 ORDER BY b.branch_name`, [companyId]),
    ]);
    res.json({ success: true, products: products.rows, uoms: uoms.rows, taxes: taxes.rows, branches: branches.rows });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to load EFRIS mappings.", error: error.message }); }
});

export default router;
