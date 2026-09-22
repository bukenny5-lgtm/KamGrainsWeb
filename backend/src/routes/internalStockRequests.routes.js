import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ACTION_ROLES, getUserRoles, requirePermission } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";
import { getActiveCompanyId } from "../services/businessFeatures.service.js";
import { setDatabaseUserContext } from "../utils/uuid.js";

const router=express.Router();
router.use(requireAuth,requireLocationAccessWhenSpecified);
const hasRole=(req,action)=>ACTION_ROLES[action].some(role=>getUserRoles(req).includes(role));
const allowedBranch=async(userId,branchId)=>Boolean((await query(`SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active`,[userId,branchId])).rowCount);
async function audit(client,req,action,id,data){await client.query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,$2,'inv.stock_request',jsonb_build_object('request_id',$3::text),$4::jsonb,txid_current())`,[req.user?.user_id||null,action,id,JSON.stringify(data)]);}

router.get("/",async(req,res)=>{
  try{
    const all=hasRole(req,"VIEW_ALL_STOCK_REQUESTS");
    const r=await query(`SELECT r.*,rb.branch_name AS requesting_branch_name,rloc.location_name AS receiving_location_name,sb.branch_name AS source_branch_name,rl.lines,rl.requested_qty,rl.approved_qty,rl.supplied_qty,(rl.approved_qty-rl.supplied_qty) AS outstanding_qty,u.full_name AS requested_by_name FROM inv.stock_request r JOIN app.branch rb ON rb.branch_id=r.requesting_branch_id JOIN app.location rloc ON rloc.location_id=r.requesting_location_id LEFT JOIN app.branch sb ON sb.branch_id=r.preferred_source_branch_id JOIN sec.app_user u ON u.user_id=r.requested_by LEFT JOIN LATERAL(SELECT count(*)::int AS lines,COALESCE(sum(requested_qty),0) AS requested_qty,COALESCE(sum(approved_qty),0) AS approved_qty,COALESCE(sum(supplied_qty),0) AS supplied_qty FROM inv.stock_request_line WHERE request_id=r.request_id) rl ON true WHERE ($2::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.is_active AND ub.branch_id IN(r.requesting_branch_id,r.preferred_source_branch_id))) AND ($3::uuid IS NULL OR r.requesting_branch_id=$3 OR r.preferred_source_branch_id=$3) ORDER BY r.created_at DESC`,[req.user?.user_id,all,req.query.branch_id||req.branchId||null]);
    res.json({success:true,count:r.rowCount,data:r.rows});
  }catch(e){res.status(500).json({success:false,message:"Failed to load internal stock requests.",error:e.message});}
});

router.get("/:id",async(req,res)=>{
  try{
    const h=await query(`SELECT r.*,rb.branch_name AS requesting_branch_name,rloc.location_name AS receiving_location_name,sb.branch_name AS source_branch_name,ru.full_name AS requested_by_name,su.full_name AS submitted_by_name,au.full_name AS approved_by_name FROM inv.stock_request r JOIN app.branch rb ON rb.branch_id=r.requesting_branch_id JOIN app.location rloc ON rloc.location_id=r.requesting_location_id LEFT JOIN app.branch sb ON sb.branch_id=r.preferred_source_branch_id LEFT JOIN sec.app_user ru ON ru.user_id=r.requested_by LEFT JOIN sec.app_user su ON su.user_id=r.submitted_by LEFT JOIN sec.app_user au ON au.user_id=r.approved_by WHERE r.request_id=$1 AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$2 AND ub.is_active AND ub.branch_id IN(r.requesting_branch_id,r.preferred_source_branch_id)))`,[req.params.id,req.user?.user_id,hasRole(req,"VIEW_ALL_STOCK_REQUESTS")]);
    if(!h.rowCount)return res.status(404).json({success:false,message:"Stock request not found."});
    const lines=await query(`SELECT l.*,p.sku,p.product_name,COALESCE((SELECT sum(tl.qty) FROM inv.stock_transfer_line tl JOIN inv.stock_transfer t ON t.stock_transfer_id=tl.stock_transfer_id WHERE tl.request_line_id=l.request_line_id AND t.status='DRAFT'),0) AS reserved_qty FROM inv.stock_request_line l JOIN inv.product p ON p.product_id=l.product_id WHERE l.request_id=$1 ORDER BY p.product_name`,[req.params.id]);
    res.json({success:true,data:{...h.rows[0],lines:lines.rows.map(l=>({...l,outstanding_qty:Number(l.approved_qty)-Number(l.supplied_qty)}))}});
  }catch(e){res.status(500).json({success:false,message:"Failed to load stock request.",error:e.message});}
});

router.post("/",requirePermission("CREATE_STOCK_REQUEST"),async(req,res)=>{
  const b=req.body||{};const lines=Array.isArray(b.lines)?b.lines:[];const branchId=b.requesting_branch_id||req.branchId;
  if(!branchId||!b.requesting_location_id||!lines.length)return res.status(400).json({success:false,message:"Request branch, location and at least one line are required."});
  const headOffice=getUserRoles(req).includes("HEAD_OFFICE");
  if(req.branchId!==branchId||(!headOffice&&!(await allowedBranch(req.user?.user_id,branchId))))return res.status(403).json({success:false,message:"Stock requests must be created for an assigned operating branch."});
  if(b.preferred_source_branch_id&&b.preferred_source_branch_id===branchId)return res.status(400).json({success:false,message:"Choose another branch as the preferred source."});
  const client=await pool.connect();try{
    await client.query("BEGIN");await setDatabaseUserContext(client,req);
    const loc=await client.query(`SELECT l.branch_id,b.company_id FROM app.location l JOIN app.branch b ON b.branch_id=l.branch_id WHERE l.location_id=$1 AND l.is_active AND l.is_stock_holding`,[b.requesting_location_id]);
    if(!loc.rowCount||loc.rows[0].branch_id!==branchId)throw Object.assign(new Error("Request location must be an active stock-holding location in the requesting branch."),{status:400});
    const companyId=loc.rows[0].company_id;
    if(b.preferred_source_branch_id){const source=await client.query(`SELECT branch_id FROM app.branch WHERE branch_id=$1 AND company_id=$2 AND is_active`,[b.preferred_source_branch_id,companyId]);if(!source.rowCount)throw Object.assign(new Error("Preferred source must be an active branch in this company."),{status:400});}
    if(b.preferred_source_location_id){const sourceLocation=await client.query(`SELECT branch_id,is_stock_holding FROM app.location WHERE location_id=$1 AND is_active`,[b.preferred_source_location_id]);if(!sourceLocation.rowCount||sourceLocation.rows[0].branch_id!==b.preferred_source_branch_id||!sourceLocation.rows[0].is_stock_holding)throw Object.assign(new Error("Preferred source location must be an active stock-holding location in the selected source branch."),{status:400});}
    const h=await client.query(`INSERT INTO inv.stock_request(company_id,requesting_branch_id,requesting_location_id,preferred_source_branch_id,preferred_source_location_id,required_date,priority,request_type,notes,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[companyId,branchId,b.requesting_location_id,b.preferred_source_branch_id||null,b.preferred_source_location_id||null,b.required_date||null,b.priority||"NORMAL",b.request_type||"REPLENISHMENT",b.notes||null,req.user.user_id]);
    for(const line of lines){if(!line.product_id||!Number.isFinite(Number(line.requested_qty))||Number(line.requested_qty)<=0)throw Object.assign(new Error("Each line requires product and positive requested quantity."),{status:400});const p=await client.query(`SELECT uom_code FROM inv.product WHERE product_id=$1 AND is_active`,[line.product_id]);if(!p.rowCount)throw Object.assign(new Error("Request product is not active."),{status:400});await client.query(`INSERT INTO inv.stock_request_line(request_id,product_id,uom_code,requested_qty,notes) VALUES($1,$2,$3,$4,$5)`,[h.rows[0].request_id,line.product_id,line.uom_code||p.rows[0].uom_code,Number(line.requested_qty),line.notes||null]);}
    await audit(client,req,"I",h.rows[0].request_id,{operation:"CREATE",request:h.rows[0]});await client.query("COMMIT");res.status(201).json({success:true,data:h.rows[0]});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});res.status(e.status||500).json({success:false,message:e.message,error:e.message});}finally{client.release();}
});

router.post("/:id/submit",requirePermission("CREATE_STOCK_REQUEST"),async(req,res)=>{
  try{const r=await query(`UPDATE inv.stock_request SET status='SUBMITTED',submitted_by=$2,submitted_at=now(),updated_at=now() WHERE request_id=$1 AND status='DRAFT' AND requesting_branch_id=$3 RETURNING *`,[req.params.id,req.user?.user_id,req.branchId]);if(!r.rowCount)return res.status(409).json({success:false,message:"Only a DRAFT request in the active branch can be submitted."});await query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,'U','inv.stock_request',jsonb_build_object('request_id',$2::text),$3::jsonb,txid_current())`,[req.user?.user_id,req.params.id,JSON.stringify({operation:"SUBMIT",request:r.rows[0]})]);res.json({success:true,data:r.rows[0]});}catch(e){res.status(500).json({success:false,message:"Failed to submit stock request.",error:e.message});}
});

router.post("/:id/approve",requirePermission("APPROVE_STOCK_REQUEST"),async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");await setDatabaseUserContext(client,req);
    const h=await client.query(`SELECT * FROM inv.stock_request WHERE request_id=$1 FOR UPDATE`,[req.params.id]);
    if(!h.rowCount)throw Object.assign(new Error("Stock request not found."),{status:404});
    const r=h.rows[0];
    if(r.status!=="SUBMITTED")throw Object.assign(new Error("Only submitted requests can be approved."),{status:409});
    const isHeadOffice=getUserRoles(req).includes("HEAD_OFFICE");
    if(!isHeadOffice&&!(await allowedBranch(req.user.user_id,r.requesting_branch_id))&&!(r.preferred_source_branch_id&&await allowedBranch(req.user.user_id,r.preferred_source_branch_id)))throw Object.assign(new Error("Approval requires access to the requesting or source branch."),{status:403});
    const approvals=Array.isArray(req.body?.lines)?req.body.lines:[];
    if(!approvals.length)throw Object.assign(new Error("Approved quantities are required for each request line."),{status:400});
    const ids=approvals.map(a=>String(a.request_line_id));
    if(new Set(ids).size!==ids.length)throw Object.assign(new Error("Each request line may be approved only once."),{status:400});
    for(const a of approvals){
      const qty=Number(a.approved_qty);if(!Number.isFinite(qty))throw Object.assign(new Error("Approved quantities must be numeric."),{status:400});
      const u=await client.query(`UPDATE inv.stock_request_line SET approved_qty=$3::numeric WHERE request_id=$1 AND request_line_id=$2 AND $3::numeric>=0 AND $3::numeric<=requested_qty RETURNING request_line_id`,[r.request_id,a.request_line_id,qty]);
      if(!u.rowCount)throw Object.assign(new Error("Approved quantity must be between zero and requested quantity for a request line."),{status:400});
    }
    const count=await client.query(`SELECT count(*)::int AS n FROM inv.stock_request_line WHERE request_id=$1`,[r.request_id]);
    if(Number(count.rows[0].n)!==approvals.length)throw Object.assign(new Error("Approval must specify every request line exactly once."),{status:400});
    const up=await client.query(`UPDATE inv.stock_request SET status='APPROVED',approved_by=$2,approved_at=now() WHERE request_id=$1 RETURNING *`,[r.request_id,req.user.user_id]);
    await audit(client,req,"U",r.request_id,{operation:"APPROVE",request:up.rows[0],lines:approvals});await client.query("COMMIT");res.json({success:true,data:up.rows[0]});
  }catch(e){await client.query("ROLLBACK").catch(()=>{});res.status(e.status||500).json({success:false,message:e.message,error:e.message});}finally{client.release();}
});

router.post("/:id/reject",requirePermission("APPROVE_STOCK_REQUEST"),async(req,res)=>{try{const reason=String(req.body?.reason||"").trim();if(!reason)return res.status(400).json({success:false,message:"A rejection reason is required."});const h=await query(`SELECT requesting_branch_id,preferred_source_branch_id FROM inv.stock_request WHERE request_id=$1`,[req.params.id]);if(!h.rowCount)return res.status(404).json({success:false,message:"Stock request not found."});if(!(await allowedBranch(req.user.user_id,h.rows[0].requesting_branch_id))&&!(h.rows[0].preferred_source_branch_id&&await allowedBranch(req.user.user_id,h.rows[0].preferred_source_branch_id)))return res.status(403).json({success:false,message:"Approval requires access to the requesting or source branch."});const r=await query(`UPDATE inv.stock_request SET status='REJECTED',rejected_by=$2,rejected_at=now(),rejection_reason=$3 WHERE request_id=$1 AND status='SUBMITTED' RETURNING *`,[req.params.id,req.user.user_id,reason]);if(!r.rowCount)return res.status(409).json({success:false,message:"Only submitted requests can be rejected."});await query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,'U','inv.stock_request',jsonb_build_object('request_id',$2::text),$3::jsonb,txid_current())`,[req.user.user_id,req.params.id,JSON.stringify({operation:"REJECT",reason,request:r.rows[0]})]);res.json({success:true,data:r.rows[0]});}catch(e){res.status(500).json({success:false,message:"Failed to reject stock request.",error:e.message});}});

export default router;
