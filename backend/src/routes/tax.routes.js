import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { getActiveCompanyId } from "../services/businessFeatures.service.js";

const router = express.Router();
router.use(requireAuth);

router.get("/settings", requirePermission("VIEW_TAX_CONFIGURATION"), async (req, res) => {
  try {
    const companyId = await getActiveCompanyId();
    const result = await query(`SELECT company_id,tax_engine_enabled,vat_enabled,vat_registered,tax_country_code,
      default_tax_code_id,tax_pricing_mode,tax_rounding_precision,output_vat_account_id,input_vat_account_id,
      tax_config_effective_from,tax_config_effective_to FROM app.company_profile WHERE company_id=$1`, [companyId]);
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to load tax settings.", error: error.message }); }
});

router.get("/activation-precheck", requirePermission("VIEW_TAX_CONFIGURATION"), async (req, res) => {
  try {
    const companyId = await getActiveCompanyId();
    const result = await query("SELECT check_code,is_valid,message FROM app.tax_activation_precheck($1)", [companyId]);
    res.json({ success: true, ready: result.rows.every((row) => row.is_valid), checks: result.rows });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to validate tax activation.", error: error.message }); }
});

router.patch("/settings", requirePermission("MANAGE_TAX_CONFIGURATION"), async (req, res) => {
  const allowed = ["tax_engine_enabled","vat_enabled","vat_registered","tax_country_code","default_tax_code_id","tax_pricing_mode","tax_rounding_precision","output_vat_account_id","input_vat_account_id","tax_config_effective_from","tax_config_effective_to"];
  const body = req.body || {}; const fields = Object.keys(body).filter((key) => allowed.includes(key));
  if (!fields.length || fields.some((key) => typeof body[key] === "undefined")) return res.status(400).json({ success: false, message: "At least one supported tax setting is required." });
  if (body.tax_pricing_mode && !["TAX_INCLUSIVE","TAX_EXCLUSIVE"].includes(String(body.tax_pricing_mode).toUpperCase())) return res.status(400).json({ success: false, message: "tax_pricing_mode must be TAX_INCLUSIVE or TAX_EXCLUSIVE." });
  try {
    const companyId = await getActiveCompanyId();
    if (body.tax_engine_enabled === true || body.vat_enabled === true) {
      const precheck = await query("SELECT check_code,is_valid,message FROM app.tax_activation_precheck($1)", [companyId]);
      const failed = precheck.rows.filter((row) => !row.is_valid);
      if (failed.length) return res.status(409).json({ success: false, message: "Tax activation precheck failed.", checks: precheck.rows });
    }
    const values = fields.map((field) => body[field] === "" ? null : body[field]);
    const assignments = fields.map((field, index) => `${field}=$${index + 1}`).join(",");
    const result = await query(`UPDATE app.company_profile SET ${assignments} WHERE company_id=$${values.length + 1}
      RETURNING company_id,tax_engine_enabled,vat_enabled,vat_registered,tax_country_code,default_tax_code_id,tax_pricing_mode,tax_rounding_precision,output_vat_account_id,input_vat_account_id,tax_config_effective_from,tax_config_effective_to`, [...values, companyId]);
    res.json({ success: true, message: "Tax settings updated.", data: result.rows[0] });
  } catch (error) { res.status(400).json({ success: false, message: "Failed to update tax settings.", error: error.message }); }
});

router.get("/codes", requirePermission("VIEW_TAX_CONFIGURATION"), async (req, res) => {
  try { const companyId = await getActiveCompanyId(); const result = await query(`SELECT * FROM app.tax_code WHERE company_id=$1 ORDER BY is_active DESC, code, effective_from DESC`, [companyId]); res.json({ success: true, tax_codes: result.rows, data: result.rows }); }
  catch (error) { res.status(500).json({ success: false, message: "Failed to load tax codes.", error: error.message }); }
});

router.post("/codes", requirePermission("MANAGE_TAX_CONFIGURATION"), async (req, res) => {
  try {
    const b=req.body||{}; const treatment=String(b.treatment||"").toUpperCase(); const rate=Number(b.rate ?? 0);
    if (!b.code || !b.name || !["STANDARD","ZERO_RATED","EXEMPT","OUT_OF_SCOPE"].includes(treatment)) return res.status(400).json({ success:false,message:"code, name, and a valid tax treatment are required." });
    if (!Number.isFinite(rate) || rate < 0 || rate > 100 || (treatment === "STANDARD" && rate <= 0) || (treatment === "ZERO_RATED" && rate !== 0)) return res.status(400).json({ success:false,message:"Tax rate must be between 0 and 100; Standard must be above 0 and Zero Rated must be 0." });
    const effectiveFrom=b.effective_from||new Date().toISOString().slice(0,10); const effectiveTo=b.effective_to||null;
    if (effectiveTo && effectiveTo < effectiveFrom) return res.status(400).json({ success:false,message:"effective_to cannot be before effective_from." });
    const companyId=await getActiveCompanyId();
    const overlap=await query(`SELECT 1 FROM app.tax_code WHERE company_id=$1 AND code=$2 AND is_active=true AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange($3::date,COALESCE($4::date,'infinity'::date),'[]') LIMIT 1`,[companyId,String(b.code).toUpperCase(),effectiveFrom,effectiveTo]);
    if (overlap.rowCount) return res.status(409).json({ success:false,message:"This tax code has an overlapping active effective period." });
    const result=await query(`INSERT INTO app.tax_code(company_id,code,name,description,treatment,rate,effective_from,effective_to,country_code,is_default,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,[companyId,String(b.code).toUpperCase(),b.name,b.description||null,treatment,rate,effectiveFrom,effectiveTo,b.country_code||"UG",Boolean(b.is_default),req.user?.user_id||null]);
    res.status(201).json({success:true,data:result.rows[0]});
  } catch(error) { res.status(error.code==="23505"?409:400).json({success:false,message:"Failed to create tax code.",error:error.message}); }
});

router.patch("/codes/:id", requirePermission("MANAGE_TAX_CONFIGURATION"), async (req,res)=>{
  try { const b=req.body||{}; const current=await query("SELECT * FROM app.tax_code WHERE tax_code_id=$1",[req.params.id]); if(!current.rowCount)return res.status(404).json({success:false,message:"Tax code not found."}); const row=current.rows[0]; const effectiveTo=b.effective_to===undefined?row.effective_to:(b.effective_to||null); if(effectiveTo && effectiveTo < row.effective_from)return res.status(400).json({success:false,message:"effective_to cannot be before effective_from."}); const nextActive=b.is_active===undefined?row.is_active:Boolean(b.is_active); if(nextActive){const overlap=await query(`SELECT 1 FROM app.tax_code WHERE company_id=$1 AND code=$2 AND tax_code_id<>$3 AND is_active=true AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange($4::date,COALESCE($5::date,'infinity'::date),'[]') LIMIT 1`,[row.company_id,row.code,row.tax_code_id,row.effective_from,effectiveTo]); if(overlap.rowCount)return res.status(409).json({success:false,message:"This tax code has an overlapping active effective period."});} const result=await query(`UPDATE app.tax_code SET name=COALESCE($2,name),description=COALESCE($3,description),effective_to=$4,is_active=$5,updated_at=now(),updated_by=$6 WHERE tax_code_id=$1 RETURNING *`,[req.params.id,b.name||null,b.description||null,effectiveTo,nextActive,req.user?.user_id||null]); res.json({success:true,data:result.rows[0]}); }
  catch(error){res.status(400).json({success:false,message:"Failed to update tax code.",error:error.message});}
});

router.get("/reports/summary", requirePermission("VIEW_VAT_REPORTS"), async (req,res)=>{
  try { const companyId=await getActiveCompanyId(); const from=req.query.from||"1900-01-01"; const to=req.query.to||"2999-12-31"; const branch=req.query.branch_id||null;
    const result=await query(`SELECT document_type,tax_code,tax_treatment,COALESCE(SUM(taxable_amount),0) AS net_amount,COALESCE(SUM(tax_amount),0) AS tax_amount,COALESCE(SUM(gross_amount),0) AS gross_amount FROM (
      SELECT 'SALE'::text AS document_type,l.tax_code,l.tax_treatment,l.taxable_amount,l.tax_amount,l.gross_amount FROM sal.pos_sale s JOIN sal.pos_sale_line l ON l.pos_sale_id=s.pos_sale_id JOIN app.location loc ON loc.location_id=s.location_id WHERE s.status='POSTED' AND s.transaction_date BETWEEN $1 AND $2 AND ($3::uuid IS NULL OR loc.branch_id=$3)
      UNION ALL SELECT 'SALE'::text,l.tax_code,l.tax_treatment,l.taxable_amount,l.tax_amount,l.gross_amount FROM sal.ar_invoice h JOIN sal.ar_invoice_line l ON l.ar_invoice_id=h.ar_invoice_id WHERE h.status='POSTED' AND h.transaction_date BETWEEN $1 AND $2
      UNION ALL SELECT 'PURCHASE'::text,l.tax_code,l.tax_treatment,l.taxable_amount,l.tax_amount,l.gross_amount FROM pur.ap_invoice h JOIN pur.ap_invoice_line l ON l.ap_invoice_id=h.ap_invoice_id WHERE h.status='POSTED' AND h.transaction_date BETWEEN $1 AND $2
    ) x GROUP BY document_type,tax_code,tax_treatment ORDER BY document_type,tax_code`,[from,to,branch]); res.json({success:true,report_type:"ERP VAT summary",from,to,branch_id:branch,rows:result.rows});
  } catch(error){res.status(500).json({success:false,message:"Failed to load VAT summary.",error:error.message});}
});
export default router;
