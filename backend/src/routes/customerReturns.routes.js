import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserRoles, requirePermission } from "../middleware/permissions.js";
import { setDatabaseUserContext, UUID_PATTERN } from "../utils/uuid.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

const router = express.Router();
router.use(requireAuth, requireLocationAccessWhenSpecified);
const allBranches=(req)=>getUserRoles(req).includes("HEAD_OFFICE");
const allLocations=(req)=>getUserRoles(req).some((role)=>["ADMIN","MANAGER","AUDITOR","HEAD_OFFICE"].includes(role));
async function canAccessReturnLocation(req,locationId){if(!locationId)return allBranches(req);const r=await query(`SELECT 1 FROM app.location l WHERE l.location_id=$1 AND (l.branch_id=$2 OR $3::boolean) AND ($4::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$5 AND ul.location_id=l.location_id AND ul.is_active))`,[locationId,req.branchId,allBranches(req),allLocations(req),req.user?.user_id]);return r.rowCount>0;}
router.param("id",async(req,res,next,value)=>{try{const r=await query(`SELECT location_id FROM sal.customer_return WHERE customer_return_id=$1`,[value]);if(!r.rowCount)return res.status(404).json({success:false,message:"Customer return not found."});if(!(await canAccessReturnLocation(req,r.rows[0].location_id)))return res.status(403).json({success:false,message:"You are not authorized for this return branch/location."});next();}catch(error){next(error);}});

async function resolveSourceId(sourceType, sourceIdentifier) {
  const identifier = String(sourceIdentifier || "").trim();
  if (!identifier) return null;
  if (UUID_PATTERN.test(identifier)) return identifier;
  const column = sourceType === "POS" ? "sale_no" : "delivery_no";
  const table = sourceType === "POS" ? "sal.pos_sale" : "sal.delivery";
  const result = await query(`SELECT ${sourceType === "POS" ? "pos_sale_id" : "delivery_id"} AS source_id FROM ${table} WHERE ${column}=$1 LIMIT 1`, [identifier]);
  return result.rows[0]?.source_id || null;
}

async function loadSource(sourceType, sourceId) {
  if (sourceType === "POS") {
    const result = await query(`
      SELECT ps.pos_sale_id AS source_id, ps.sale_no AS source_document_no, ps.customer_id,
             c.party_name AS customer_name, ps.location_id, ps.status, ps.total_amount,
             json_agg(json_build_object(
               'source_line_id', l.pos_sale_line_id, 'product_id', l.product_id,
               'product_name', p.product_name, 'sku', p.sku, 'uom', p.uom_code, 'lot_id', l.lot_id,
               'qty', l.qty, 'unit_price', l.unit_price,
               'tax_code_id', l.tax_code_id, 'tax_code', l.tax_code, 'tax_treatment', l.tax_treatment, 'tax_rate', l.tax_rate,
               'taxable_amount', l.taxable_amount, 'tax_amount', l.tax_amount, 'gross_amount', l.gross_amount,
               'returned_qty', COALESCE((SELECT SUM(crl.qty_returned) FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id=cr.customer_return_id WHERE cr.status='POSTED' AND cr.source_type='POS' AND cr.source_id=ps.pos_sale_id AND crl.source_line_id=l.pos_sale_line_id),0)
             ) ORDER BY l.created_at) AS lines
      FROM sal.pos_sale ps JOIN sal.pos_sale_line l ON l.pos_sale_id=ps.pos_sale_id
      JOIN inv.product p ON p.product_id=l.product_id LEFT JOIN app.party c ON c.party_id=ps.customer_id
      WHERE ps.status='POSTED' AND ps.pos_sale_id=$1 GROUP BY ps.pos_sale_id,c.party_name`, [sourceId]);
    return result.rows[0] || null;
  }
  const result = await query(`
    SELECT d.delivery_id AS source_id, d.delivery_no AS source_document_no, d.customer_id,
           c.party_name AS customer_name, d.location_id, d.status, d.is_posted,
           d.posted_movement_id, d.transaction_date,
           COALESCE(SUM(COALESCE(l.sell_qty,l.qty,0) * COALESCE(l.unit_price,0)),0) AS total_amount,
           json_agg(json_build_object(
             'source_line_id', l.delivery_line_id, 'product_id', l.product_id,
             'product_name', p.product_name, 'sku', p.sku, 'uom', p.uom_code, 'lot_id', l.lot_id,
             'qty', COALESCE(l.sell_qty,l.qty), 'unit_price', l.unit_price,
             'original_unit_cost', (SELECT sml.unit_cost FROM inv.stock_movement_line sml WHERE sml.movement_id=d.posted_movement_id AND sml.product_id=l.product_id AND sml.lot_id IS NOT DISTINCT FROM l.lot_id ORDER BY sml.movement_line_id LIMIT 1),
             'original_location_id', d.location_id,
             'returned_qty', COALESCE((SELECT SUM(crl.qty_returned) FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id=cr.customer_return_id WHERE cr.status='POSTED' AND cr.source_type='DELIVERY' AND cr.source_id=d.delivery_id AND crl.source_line_id=l.delivery_line_id),0)
           ) ORDER BY l.delivery_line_id) AS lines
    FROM sal.delivery d JOIN sal.delivery_line l ON l.delivery_id=d.delivery_id
    JOIN inv.product p ON p.product_id=l.product_id LEFT JOIN app.party c ON c.party_id=d.customer_id
    WHERE COALESCE(d.is_posted,false)=true
      AND d.posted_movement_id IS NOT NULL
      AND UPPER(COALESCE(d.status,'')) NOT IN ('VOID','VOIDED','CANCELLED','CANCELED')
      AND d.delivery_id=$1
    GROUP BY d.delivery_id,c.party_name`, [sourceId]);
  return result.rows[0] || null;
}

router.get("/", requireAuth, requirePermission("VIEW_CUSTOMER_RETURNS"), async (req, res) => {
  try {
    const values = [req.branchId,allBranches(req),req.user?.user_id,allLocations(req)];
    const filters = [`(loc.branch_id=$1 OR $2::boolean)`,`($4::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$3 AND ul.location_id=r.location_id AND ul.is_active))`];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    if (req.query.search) {
      const term = `%${String(req.query.search).trim()}%`;
      const placeholder = add(term);
      filters.push(`(r.return_no ILIKE ${placeholder} OR r.source_document_no ILIKE ${placeholder} OR p.party_name ILIKE ${placeholder})`);
    }
    if (req.query.status) filters.push(`r.status = ${add(String(req.query.status).toUpperCase())}`);
    if (req.query.source_type) filters.push(`r.source_type = ${add(String(req.query.source_type).toUpperCase())}`);
    if (req.query.refund_status) filters.push(`r.refund_status = ${add(String(req.query.refund_status).toUpperCase())}`);
    if (req.query.from) filters.push(`r.transaction_date >= ${add(req.query.from)}::date`);
    if (req.query.to) filters.push(`r.transaction_date <= ${add(req.query.to)}::date`);
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const result = await query(`
      SELECT r.customer_return_id, r.return_no, r.transaction_date, r.source_type, r.source_document_no,
             r.customer_id, p.party_name AS customer_name, r.status, r.reason_code, r.condition_code,
             r.refund_status, COALESCE(r.refund_due_amount,r.refund_due,0) AS refund_due_amount,
             COALESCE(r.refund_settled_amount,0) AS refund_settled_amount, r.created_at, r.posted_at,
             r.voided_at, r.void_reason, r.posted_movement_id, r.posted_journal_id,
             created_u.full_name AS created_by_name, posted_u.full_name AS posted_by_name,
             COUNT(l.customer_return_line_id)::int AS line_count,
             COALESCE(SUM(l.qty_returned * l.original_unit_price),0) AS return_value,
             CASE WHEN COUNT(DISTINCT l.return_disposition) = 1 THEN MAX(l.return_disposition) ELSE 'MIXED' END AS primary_disposition,
             BOOL_OR(l.return_disposition = 'QUARANTINE') AS has_quarantine
      FROM sal.customer_return r
      LEFT JOIN app.party p ON p.party_id=r.customer_id
      LEFT JOIN sec.app_user created_u ON created_u.user_id=r.created_by
      LEFT JOIN sec.app_user posted_u ON posted_u.user_id=r.posted_by
      LEFT JOIN app.location loc ON loc.location_id=r.location_id
      LEFT JOIN sal.customer_return_line l ON l.customer_return_id=r.customer_return_id
      ${where}
      GROUP BY r.customer_return_id,p.party_name,created_u.full_name,posted_u.full_name
      ORDER BY r.created_at DESC`, values);
    return res.json({ success: true, data: result.rows, returns: result.rows });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load customer returns.", error: error.message }); }
});

router.get("/summary", requireAuth, requirePermission("VIEW_CUSTOMER_RETURNS"), async (req, res) => {
  try {
    const result = await query(`
      SELECT COUNT(*)::int AS total_returns,
             COUNT(*) FILTER (WHERE status='POSTED')::int AS posted_returns,
             COUNT(*) FILTER (WHERE status='DRAFT')::int AS draft_returns,
             COUNT(*) FILTER (WHERE status='VOID')::int AS voided_returns,
             COALESCE(SUM(l.return_value),0) AS total_return_value,
             COALESCE(SUM(COALESCE(r.refund_due_amount,r.refund_due,0)),0) AS refund_due,
             COALESCE(SUM(r.refund_settled_amount),0) AS refund_settled,
             COALESCE(SUM(l.quarantine_qty),0) AS quarantine_qty,
             COALESCE(SUM(l.quarantine_value),0) AS quarantine_inventory_value
      FROM sal.customer_return r
      JOIN app.location loc ON loc.location_id=r.location_id
      LEFT JOIN LATERAL (
        SELECT SUM(crl.qty_returned * crl.original_unit_price) AS return_value,
               SUM(crl.qty_returned) FILTER (WHERE crl.return_disposition='QUARANTINE') AS quarantine_qty,
               SUM(crl.qty_returned * crl.original_unit_cost) FILTER (WHERE crl.return_disposition='QUARANTINE') AS quarantine_value
        FROM sal.customer_return_line crl
        WHERE crl.customer_return_id=r.customer_return_id
      ) l ON true
      WHERE (loc.branch_id=$1 OR $2::boolean) AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=r.location_id AND ul.is_active))`,[req.branchId,allBranches(req),allLocations(req),req.user?.user_id]);
    return res.json({ success: true, summary: result.rows[0] || {} });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load customer return summary.", error: error.message }); }
});

router.get("/quarantine", requireAuth, requirePermission("VIEW_QUARANTINE"), async (req, res) => {
  try {
    const result = await query(`
      SELECT sml.product_id, p.product_name, p.sku, sml.lot_id, SUM(sml.qty) AS qty,
             sml.unit_cost, SUM(sml.qty * sml.unit_cost) AS inventory_value,
             loc.location_code, loc.location_name, sm.document_no AS return_no,
             sm.created_at, sm.notes
      FROM inv.stock_movement sm
      JOIN inv.stock_movement_line sml ON sml.movement_id=sm.movement_id
      JOIN inv.product p ON p.product_id=sml.product_id
      JOIN app.location loc ON loc.location_id=sml.to_location_id
      WHERE loc.location_type='QUARANTINE' AND loc.is_system=true AND loc.is_saleable=false AND sm.movement_type='CUSTOMER_RETURN'
        AND (loc.branch_id=$1 OR $2::boolean)
        AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$4 AND ul.location_id=loc.location_id AND ul.is_active))
      GROUP BY sml.product_id,p.product_name,p.sku,sml.lot_id,sml.unit_cost,loc.location_code,loc.location_name,sm.document_no,sm.created_at,sm.notes
      ORDER BY sm.created_at DESC`,[req.branchId,allBranches(req),allLocations(req),req.user?.user_id]);
    return res.json({ success: true, data: result.rows, quarantine: result.rows });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load quarantine inventory.", error: error.message }); }
});

router.get("/source/:sourceType/:sourceId", requireAuth, requirePermission("VIEW_CUSTOMER_RETURNS"), async (req, res) => {
  try {
    const sourceType = String(req.params.sourceType).toUpperCase();
    if (!["POS", "DELIVERY"].includes(sourceType)) return res.status(400).json({ success: false, message: "sourceType must be POS or DELIVERY." });
    const sourceId = await resolveSourceId(sourceType, req.params.sourceId);
    if (!sourceId) return res.status(404).json({ success: false, message: `${sourceType === "POS" ? "POS sale" : "Delivery"} ${req.params.sourceId} was not found.` });
    const source = await loadSource(sourceType, sourceId);
    if (!source) return res.status(404).json({ success: false, message: `${sourceType === "POS" ? "POS sale" : "Delivery"} ${req.params.sourceId} was not found or is not eligible for return.` });
    if(!(await canAccessReturnLocation(req,source.location_id)))return res.status(403).json({success:false,message:"You are not authorized for this return source branch/location."});
    return res.json({ success: true, source });
  } catch (error) { return res.status(400).json({ success: false, message: "Failed to load return source.", error: error.message }); }
});

router.get("/:id/note", requireAuth, requirePermission("VIEW_CUSTOMER_RETURNS"), async (req, res) => {
  try {
    const result = await query(`
      SELECT r.return_no, r.transaction_date, r.source_type, r.source_document_no,
             r.reason_code, r.condition_code, r.refund_status, r.refund_due_amount,
             r.refund_settled_amount, r.notes, r.status, r.created_by, r.posted_by,
             p.party_name AS customer_name, cp.company_name, cp.business_name, cp.address, cp.phone,
             json_agg(json_build_object(
               'product_name', pr.product_name, 'sku', pr.sku, 'uom', pr.uom_code,
               'original_qty', l.original_sale_qty,
               'previously_returned_qty', COALESCE((SELECT SUM(prior_l.qty_returned) FROM sal.customer_return prior_r JOIN sal.customer_return_line prior_l ON prior_l.customer_return_id=prior_r.customer_return_id WHERE prior_r.status='POSTED' AND prior_r.source_type=r.source_type AND prior_r.source_id=r.source_id AND prior_l.source_line_id=l.source_line_id AND prior_r.customer_return_id<>r.customer_return_id),0),
               'returned_qty_this_return', l.qty_returned,
               'remaining_returnable_qty', GREATEST(0, l.original_sale_qty - COALESCE((SELECT SUM(prior_l.qty_returned) FROM sal.customer_return prior_r JOIN sal.customer_return_line prior_l ON prior_l.customer_return_id=prior_r.customer_return_id WHERE prior_r.status='POSTED' AND prior_r.source_type=r.source_type AND prior_r.source_id=r.source_id AND prior_l.source_line_id=l.source_line_id AND prior_r.customer_return_id<>r.customer_return_id),0) - l.qty_returned),
               'returned_qty', l.qty_returned,
               'unit_price', l.original_unit_price,
               'return_value', round(l.qty_returned * l.original_unit_price, 2),
               'reason', COALESCE(l.reason, r.reason_code), 'condition', r.condition_code,
               'disposition', l.return_disposition
             ) ORDER BY l.customer_return_line_id) AS lines
      FROM sal.customer_return r
      LEFT JOIN app.party p ON p.party_id=r.customer_id
      LEFT JOIN app.company_profile cp ON cp.is_active=true
      JOIN sal.customer_return_line l ON l.customer_return_id=r.customer_return_id
      JOIN inv.product pr ON pr.product_id=l.product_id
      WHERE r.customer_return_id=$1
      GROUP BY r.customer_return_id,p.party_name,cp.company_name,cp.business_name,cp.address,cp.phone`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Customer return not found." });
    return res.json({ success: true, note: result.rows[0] });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load Return Note.", error: error.message }); }
});

router.get("/:id/refunds", requireAuth, requirePermission("VIEW_CUSTOMER_RETURNS"), async (req, res) => {
  try {
    const result = await query("SELECT rs.*, r.return_no, r.source_document_no, p.party_name AS customer_name, u.full_name AS settled_by_name FROM sal.refund_settlement rs JOIN sal.customer_return r ON r.customer_return_id=rs.customer_return_id LEFT JOIN app.party p ON p.party_id=r.customer_id LEFT JOIN sec.app_user u ON u.user_id=rs.settled_by WHERE rs.customer_return_id=$1 ORDER BY rs.settled_at", [req.params.id]);
    return res.json({ success: true, refunds: result.rows, data: result.rows });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load refund settlements.", error: error.message }); }
});

router.get("/:id", requireAuth, requirePermission("VIEW_CUSTOMER_RETURNS"), async (req, res) => {
  try {
    const header = await query(`
      SELECT r.*, p.party_name AS customer_name,
             COALESCE(t.return_value,0) AS return_value,
             COALESCE(r.refund_due_amount,r.refund_due,0) AS refund_due_amount,
             COALESCE(r.refund_settled_amount,0) AS refund_settled_amount,
             COALESCE((SELECT SUM(a.amount) FROM sal.ar_credit_adjustment a WHERE a.customer_return_id=r.customer_return_id AND a.status='POSTED'),0) AS ar_reduction_amount,
             created_u.full_name AS created_by_name, posted_u.full_name AS posted_by_name
      FROM sal.customer_return r
      LEFT JOIN app.party p ON p.party_id=r.customer_id
      LEFT JOIN sec.app_user created_u ON created_u.user_id=r.created_by
      LEFT JOIN sec.app_user posted_u ON posted_u.user_id=r.posted_by
      LEFT JOIN LATERAL (SELECT SUM(l.qty_returned * l.original_unit_price) AS return_value FROM sal.customer_return_line l WHERE l.customer_return_id=r.customer_return_id) t ON true
      WHERE r.customer_return_id=$1`, [req.params.id]);
    if (!header.rowCount) return res.status(404).json({ success: false, message: "Customer return not found." });
    const lines = await query(`SELECT l.*, p.product_name, p.sku, p.uom_code AS uom, l.qty_returned * l.original_unit_price AS return_value FROM sal.customer_return_line l JOIN inv.product p ON p.product_id=l.product_id WHERE l.customer_return_id=$1 ORDER BY l.customer_return_line_id`, [req.params.id]);
    return res.json({ success: true, customer_return: header.rows[0], lines: lines.rows });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load customer return.", error: error.message }); }
});

router.post("/", requireAuth, requirePermission("CREATE_CUSTOMER_RETURN"), async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body || {};
    const sourceType = String(body.source_type || "").toUpperCase();
    if (!["POS", "DELIVERY"].includes(sourceType)) return res.status(400).json({ success: false, message: "source_type must be POS or DELIVERY." });
    const sourceId = await resolveSourceId(sourceType, body.source_id);
    if (!sourceId) return res.status(404).json({ success: false, message: `${sourceType === "POS" ? "POS sale" : "Delivery"} ${body.source_id} was not found.` });
    const source = await loadSource(sourceType, sourceId);
    if (!source) return res.status(404).json({ success: false, message: `${sourceType === "POS" ? "POS sale" : "Delivery"} ${body.source_id} was not found or is not eligible for return.` });
    if(!(await canAccessReturnLocation(req,source.location_id)))return res.status(403).json({success:false,message:"You are not authorized for this return source branch/location."});
    if (!Array.isArray(body.lines) || !body.lines.length) return res.status(400).json({ success: false, message: "At least one return line is required." });
    const policyResult = await query("SELECT * FROM sal.return_policy WHERE is_active=true ORDER BY created_at LIMIT 1");
    const policy = policyResult.rows[0];
    const reasonCode = String(body.reason_code || "OTHER").trim().toUpperCase();
    const reasonResult = await query("SELECT * FROM sal.customer_return_reason WHERE reason_code=$1 AND is_active=true", [reasonCode]);
    if (!reasonResult.rowCount) return res.status(400).json({ success: false, message: "Invalid or inactive customer-return reason." });
    if (reasonCode === "OTHER" && !String(body.notes || "").trim()) return res.status(400).json({ success: false, message: "OTHER return reason requires an explanation in notes." });
    const override = Boolean(body.policy_override);
    if (override && !["ADMIN", "MANAGER"].includes(req.user?.role)) return res.status(403).json({ success: false, message: "Only an authorized manager can approve a return-policy exception." });
    if (override && !String(body.policy_override_reason || "").trim()) return res.status(400).json({ success: false, message: "policy_override_reason is required for an exception." });
    if (!override && policy) {
      if (!policy.returns_enabled) return res.status(400).json({ success: false, message: "Customer returns are disabled by the active return policy." });
      if (reasonCode === "CHANGE_OF_MIND" && !policy.allow_change_of_mind_returns) return res.status(400).json({ success: false, message: "Change-of-mind returns are not allowed by the active policy." });
      if (body.lines.length > 1 && !policy.allow_partial_returns) return res.status(400).json({ success: false, message: "Partial/multi-line returns are not allowed by the active policy." });
    }
    await client.query("BEGIN");
    const header = await client.query(`INSERT INTO sal.customer_return(return_no,transaction_date,customer_id,source_type,source_id,source_document_no,location_id,reason_code,notes,created_by,condition_code,policy_override,policy_override_reason) VALUES (sal.next_customer_return_no(),COALESCE($1,current_date),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [body.transaction_date || null, source.customer_id, sourceType, source.source_id, source.source_document_no, source.location_id, reasonCode, body.notes || null, req.user?.user_id || null, String(body.condition_code || "GOOD").toUpperCase(), override, override ? String(body.policy_override_reason).trim() : null]);
    for (const line of body.lines) {
      if (!line.source_line_id || Number(line.qty_returned) <= 0) throw new Error("Each return line requires source_line_id and positive qty_returned.");
      const sourceLine = (source.lines || []).find((candidate) => String(candidate.source_line_id) === String(line.source_line_id));
      if (!sourceLine) throw new Error(`Source line ${line.source_line_id} was not found on the posted source.`);
      const requestedQty = Number(line.qty_returned);
      const remainingQty = Math.max(0, Number(sourceLine.qty) - Number(sourceLine.returned_qty || 0));
      if (requestedQty > remainingQty) throw new Error(`Return quantity cannot exceed the remaining returnable quantity of ${remainingQty} ${sourceLine.uom || "units"}.`);
      const disposition = String(line.return_disposition || (String(body.condition_code || "GOOD").toUpperCase() === "GOOD" ? "RESTOCK" : "QUARANTINE")).toUpperCase();
      if (!["RESTOCK", "QUARANTINE", "WRITE_OFF"].includes(disposition)) throw new Error("Invalid return disposition.");
      if (disposition === "RESTOCK" && ["DAMAGED", "DEFECTIVE", "EXPIRED"].includes(String(body.condition_code || "GOOD").toUpperCase())) throw new Error("Damaged, defective, or expired goods cannot be restocked.");
      await client.query(`INSERT INTO sal.customer_return_line(customer_return_id,source_line_id,product_id,lot_id,qty_returned,original_sale_qty,original_unit_price,original_unit_cost,return_disposition,reason,tax_code_id,tax_code,tax_treatment,tax_rate,original_taxable_amount,original_tax_amount,original_gross_amount,returned_taxable_amount,returned_tax_amount,returned_gross_amount)
        VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, [header.rows[0].customer_return_id, line.source_line_id, sourceLine.product_id, sourceLine.lot_id || null, requestedQty, Number(sourceLine.qty), Number(sourceLine.unit_price || 0), disposition, line.reason || null, sourceLine.tax_code_id || null, sourceLine.tax_code || null, sourceLine.tax_treatment || null, sourceLine.tax_rate || null, Number(sourceLine.taxable_amount || 0), Number(sourceLine.tax_amount || 0), Number(sourceLine.gross_amount || sourceLine.qty * sourceLine.unit_price || 0), Number(sourceLine.taxable_amount || 0) * requestedQty / Number(sourceLine.qty), Number(sourceLine.tax_amount || 0) * requestedQty / Number(sourceLine.qty), Number(sourceLine.gross_amount || sourceLine.qty * sourceLine.unit_price || 0) * requestedQty / Number(sourceLine.qty)]);
    }
    await client.query("COMMIT");
    return res.status(201).json({ success: true, customer_return: header.rows[0] });
  } catch (error) { await client.query("ROLLBACK"); return res.status(400).json({ success: false, message: error.message || "Failed to create customer return.", error: error.message }); }
  finally { client.release(); }
});

router.post("/:id/post", requireAuth, requirePermission("POST_CUSTOMER_RETURN"), async (req, res) => {
  const returnId = String(req.params.id || "").trim();
  if (!UUID_PATTERN.test(returnId)) return res.status(400).json({ success: false, message: "A valid customer return ID is required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setDatabaseUserContext(client, req);
    const result = await client.query("SELECT sal.post_customer_return($1::uuid) AS customer_return_id", [returnId]);
    const tax = await client.query(`SELECT r.return_no,r.posted_journal_id,COALESCE(SUM(l.returned_taxable_amount),0) AS net_amount,
      COALESCE(SUM(l.returned_tax_amount),0) AS tax_amount,COALESCE(SUM(l.returned_gross_amount),0) AS gross_amount
      FROM sal.customer_return r JOIN sal.customer_return_line l ON l.customer_return_id=r.customer_return_id
      WHERE r.customer_return_id=$1 GROUP BY r.return_no,r.posted_journal_id`, [returnId]);
    if (tax.rows[0] && Number(tax.rows[0].tax_amount) > 0) {
      const account = await client.query("SELECT output_vat_account_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1");
      if (!account.rows[0]?.output_vat_account_id) throw new Error("Output VAT Payable account is not configured.");
      await client.query("UPDATE fin.gl_journal_line SET debit=$2, credit=0 WHERE journal_id=$1 AND memo=$3", [tax.rows[0].posted_journal_id, tax.rows[0].net_amount, `Sales return ${tax.rows[0].return_no}`]);
      await client.query("INSERT INTO fin.gl_journal_line(journal_id,account_id,party_id,memo,debit,credit) VALUES($1,$2,NULL,$3,$4,0)", [tax.rows[0].posted_journal_id, account.rows[0].output_vat_account_id, `Output VAT reversal ${tax.rows[0].return_no}`, tax.rows[0].tax_amount]);
      await client.query("SELECT fin.assert_balanced($1::uuid)", [tax.rows[0].posted_journal_id]);
    }
    await client.query("COMMIT");
    return res.json({ success: true, customer_return_id: result.rows[0]?.customer_return_id, message: "Customer return posted." });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); console.error("Customer return post failed", { returnId, error }); return res.status(error.statusCode || 400).json({ success: false, message: error.statusCode === 401 ? error.message : "Failed to post customer return." }); }
  finally { client.release(); }
});

router.post("/:id/refund", requireAuth, requirePermission("PROCESS_REFUND"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setDatabaseUserContext(client, req);
    const result = await client.query("SELECT sal.settle_customer_return_refund($1::uuid,$2::numeric,$3::text,$4::text,$5::text) AS refund_no", [req.params.id, req.body?.amount, String(req.body?.refund_method || "").toUpperCase(), req.body?.reference || null, req.body?.notes || null]);
    await client.query("COMMIT");
    return res.json({ success: true, refund_no: result.rows[0].refund_no, message: "Refund settlement posted." });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); return res.status(error.statusCode || 400).json({ success: false, message: error.statusCode === 401 ? error.message : "Failed to settle refund." }); }
  finally { client.release(); }
});

router.post("/:id/void", requireAuth, requirePermission("VOID_CUSTOMER_RETURN"), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!String(req.body?.reason || "").trim()) return res.status(400).json({ success: false, message: "A void reason is required." });
    await client.query("BEGIN");
    await setDatabaseUserContext(client, req);
    const result = await client.query("SELECT sal.void_customer_return($1::uuid,$2::text) AS reversal_journal_id", [req.params.id, String(req.body.reason).trim()]);
    await client.query("COMMIT");
    return res.json({ success: true, reversal_journal_id: result.rows[0].reversal_journal_id, message: "Customer return voided with reversal records." });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); return res.status(error.statusCode || 400).json({ success: false, message: error.statusCode === 401 ? error.message : "Failed to void customer return." }); }
  finally { client.release(); }
});

export default router;
