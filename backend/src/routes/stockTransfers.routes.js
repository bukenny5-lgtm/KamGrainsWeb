import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ACTION_ROLES, getUserRoles, requirePermission } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";
import { setDatabaseUserContext } from "../utils/uuid.js";

const router=express.Router();
router.use(requireAuth,requireLocationAccessWhenSpecified);

async function canAccessBranch(userId,branchId){
  const r=await query(`SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active`,[userId,branchId]);
  return r.rowCount>0;
}
function canSeeAllBranches(req){return getUserRoles(req).includes("HEAD_OFFICE");}
function canSeeTransferCost(req){return ACTION_ROLES.VIEW_TRANSFER_COST.some(role=>getUserRoles(req).includes(role));}
async function audit(client,req,action,transferId,data){
  await client.query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,$2,'inv.stock_transfer',jsonb_build_object('stock_transfer_id',$3::text),$4::jsonb,txid_current())`,[req.user?.user_id||null,action,transferId,JSON.stringify(data)]);
}

router.get("/",async(req,res)=>{
  try{
    const branchId=req.headers["x-branch-id"]||req.query.branch_id||null;
    const r=await query(`SELECT t.*,sb.branch_name AS source_branch_name,db.branch_name AS destination_branch_name,sl.location_name AS source_location_name,dl.location_name AS destination_location_name,COUNT(tl.stock_transfer_line_id)::int AS line_count FROM inv.stock_transfer t JOIN app.branch sb ON sb.branch_id=t.source_branch_id JOIN app.branch db ON db.branch_id=t.destination_branch_id JOIN app.location sl ON sl.location_id=t.source_location_id JOIN app.location dl ON dl.location_id=t.destination_location_id LEFT JOIN inv.stock_transfer_line tl ON tl.stock_transfer_id=t.stock_transfer_id WHERE ($2::uuid IS NULL OR t.source_branch_id=$2 OR t.destination_branch_id=$2) AND ((EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.branch_id IN(t.source_branch_id,t.destination_branch_id) AND ub.is_active)) OR $3::boolean) GROUP BY t.stock_transfer_id,sb.branch_name,db.branch_name,sl.location_name,dl.location_name ORDER BY t.created_at DESC`,[req.user?.user_id,branchId,getUserRoles(req).includes("HEAD_OFFICE")]);
    res.json({success:true,count:r.rowCount,data:r.rows,transfers:r.rows});
  }catch(e){res.status(500).json({success:false,message:"Failed to load stock transfers.",error:e.message});}
});

router.get("/:id",async(req,res)=>{
  try{
    const r=await query(`SELECT t.*,sb.branch_name AS source_branch_name,db.branch_name AS destination_branch_name,sl.location_name AS source_location_name,dl.location_name AS destination_location_name,cu.full_name AS created_by_name,au.full_name AS approved_by_name,du.full_name AS dispatched_by_name,ru.full_name AS received_by_name FROM inv.stock_transfer t JOIN app.branch sb ON sb.branch_id=t.source_branch_id JOIN app.branch db ON db.branch_id=t.destination_branch_id JOIN app.location sl ON sl.location_id=t.source_location_id JOIN app.location dl ON dl.location_id=t.destination_location_id LEFT JOIN sec.app_user cu ON cu.user_id=t.created_by LEFT JOIN sec.app_user au ON au.user_id=t.approved_by LEFT JOIN sec.app_user du ON du.user_id=t.dispatched_by LEFT JOIN sec.app_user ru ON ru.user_id=t.received_by WHERE t.stock_transfer_id=$1 AND ((EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$2 AND ub.branch_id IN(t.source_branch_id,t.destination_branch_id) AND ub.is_active)) OR $3::boolean)`,[req.params.id,req.user?.user_id,getUserRoles(req).includes("HEAD_OFFICE")]);
    if(!r.rowCount)return res.status(403).json({success:false,message:"Transfer not found or branch access denied."});
    const lines=await query(`SELECT tl.stock_transfer_line_id,tl.stock_transfer_id,tl.product_id,tl.lot_id,tl.qty,COALESCE(tl.received_qty,0) AS received_qty,tl.qty-COALESCE(tl.received_qty,0) AS remaining_in_transit,tl.qty-COALESCE(tl.received_qty,0) AS variance_qty,tl.variance_reason,tl.variance_notes,tl.request_line_id,CASE WHEN $2::boolean THEN tl.unit_cost ELSE NULL END AS unit_cost,CASE WHEN $2::boolean THEN tl.qty*tl.unit_cost ELSE NULL END AS inventory_value,p.sku,p.product_name,p.uom_code,l.lot_code,rl.requested_qty,rl.approved_qty FROM inv.stock_transfer_line tl JOIN inv.product p ON p.product_id=tl.product_id LEFT JOIN inv.lot l ON l.lot_id=tl.lot_id LEFT JOIN inv.stock_request_line rl ON rl.request_line_id=tl.request_line_id WHERE tl.stock_transfer_id=$1 ORDER BY p.product_name,l.lot_code`,[req.params.id,canSeeTransferCost(req)]);
    res.json({success:true,data:{...r.rows[0],lines:lines.rows}});
  }catch(e){res.status(500).json({success:false,message:"Failed to load stock transfer.",error:e.message});}
});

router.post("/",requirePermission("TRANSFER_STOCK"),async(req,res)=>{
  const b=req.body||{};const lines=Array.isArray(b.lines)?b.lines:[];
  if(!b.source_branch_id||!b.destination_branch_id||!b.source_location_id||!b.destination_location_id||!lines.length)return res.status(400).json({success:false,message:"Source/destination branch, location, and at least one line are required."});
  const userId=req.user?.user_id;
  const sourceAccess=await canAccessBranch(userId,b.source_branch_id);const destinationAccess=await canAccessBranch(userId,b.destination_branch_id);
  if((!sourceAccess||(!destinationAccess&&!b.stock_request_id))&&!canSeeAllBranches(req))return res.status(403).json({success:false,message:"You need source branch access and either destination branch access or an approved stock request."});
  if(req.branchId&&req.branchId!==b.source_branch_id)return res.status(403).json({success:false,message:"Dispatch branch must match the active branch."});
  const c=await pool.connect();
  try{
    await c.query("BEGIN");await setDatabaseUserContext(c,req);
    const loc=await c.query(`SELECT l.location_id,l.branch_id,l.company_id,l.is_stock_holding,l.is_active,b.default_location_id FROM app.location l JOIN app.branch b ON b.branch_id=l.branch_id WHERE l.location_id=ANY($1::uuid[]) AND l.is_active`,[[b.source_location_id,b.destination_location_id]]);
    if(loc.rowCount!==2||loc.rows.find((x)=>x.location_id===b.source_location_id)?.branch_id!==b.source_branch_id||loc.rows.find((x)=>x.location_id===b.destination_location_id)?.branch_id!==b.destination_branch_id)throw Object.assign(new Error("Transfer locations must belong to their selected branches."),{status:400});
    if(loc.rows.some((x)=>!x.is_stock_holding))throw Object.assign(new Error("Both transfer locations must hold stock."),{status:400});
    const transit=await c.query(`SELECT location_id FROM app.location WHERE branch_id=$1 AND location_type='TRANSIT' AND is_system AND is_active AND NOT is_saleable LIMIT 1`,[b.source_branch_id]);
    if(!transit.rowCount)throw Object.assign(new Error("Source branch transit location is not configured."),{status:409});
    const company=loc.rows[0].company_id;
    let stockRequest=null;
    if(b.stock_request_id){const request=await c.query(`SELECT * FROM inv.stock_request WHERE request_id=$1 FOR UPDATE`,[b.stock_request_id]);if(!request.rowCount)throw Object.assign(new Error("Linked internal stock request not found."),{status:404});stockRequest=request.rows[0];if(!["APPROVED","PARTIALLY_SUPPLIED"].includes(stockRequest.status)||stockRequest.requesting_branch_id!==b.destination_branch_id||(stockRequest.preferred_source_branch_id&&stockRequest.preferred_source_branch_id!==b.source_branch_id)||(stockRequest.preferred_source_location_id&&stockRequest.preferred_source_location_id!==b.source_location_id)||stockRequest.requesting_location_id!==b.destination_location_id)throw Object.assign(new Error("Transfer does not match an approved stock request and its selected branches/locations."),{status:409});}
    const header=await c.query(`INSERT INTO inv.stock_transfer(company_id,source_branch_id,destination_branch_id,source_location_id,transit_location_id,destination_location_id,stock_request_id,expected_arrival_date,transport_method,waybill_reference,dispatch_reference,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[company,b.source_branch_id,b.destination_branch_id,b.source_location_id,transit.rows[0].location_id,b.destination_location_id,stockRequest?.request_id||null,b.expected_arrival_date||null,b.transport_method||null,b.waybill_reference||null,b.dispatch_reference||null,b.notes||null,userId]);
    for(const line of lines){
      const qty=Number(line.qty);if(!line.product_id||!Number.isFinite(qty)||qty<=0)throw Object.assign(new Error("Every transfer line needs a product and positive quantity."),{status:400});
      const stock=await c.query(`SELECT soh.qty_on_hand,COALESCE(vc.unit_cost,0) AS unit_cost FROM inv.v_stock_on_hand_active soh LEFT JOIN inv.v_lot_unit_cost vc ON vc.lot_id=soh.lot_id WHERE soh.product_id=$1 AND soh.lot_id IS NOT DISTINCT FROM $2::uuid AND soh.location_id=$3 AND soh.qty_on_hand>0`,[line.product_id,line.lot_id||null,b.source_location_id]);
      const available=stock.rows.reduce((sum,row)=>sum+Number(row.qty_on_hand),0);if(available<qty)throw Object.assign(new Error(`Insufficient stock for product ${line.product_id}; available ${available}.`),{status:409});
      const cost=stock.rows[0]?.unit_cost||0;
      let requestLineId=null;
      if(stockRequest){requestLineId=line.request_line_id;if(!requestLineId)throw Object.assign(new Error("Every linked transfer line must reference a request line."),{status:400});const available=await c.query(`SELECT l.approved_qty-l.supplied_qty-COALESCE((SELECT sum(tl.qty) FROM inv.stock_transfer_line tl JOIN inv.stock_transfer t ON t.stock_transfer_id=tl.stock_transfer_id WHERE tl.request_line_id=l.request_line_id AND t.status IN ('DRAFT','IN_TRANSIT')),0) AS remaining,l.product_id FROM inv.stock_request_line l WHERE l.request_line_id=$1 AND l.request_id=$2 FOR UPDATE`,[requestLineId,stockRequest.request_id]);if(!available.rowCount||available.rows[0].product_id!==line.product_id||Number(available.rows[0].remaining)<qty)throw Object.assign(new Error("Transfer line exceeds the approved, unreserved request quantity."),{status:409});}
      await c.query(`INSERT INTO inv.stock_transfer_line(stock_transfer_id,product_id,lot_id,qty,unit_cost,request_line_id) VALUES($1,$2,$3,$4,$5,$6)`,[header.rows[0].stock_transfer_id,line.product_id,line.lot_id||null,qty,cost,requestLineId]);
    }
    await audit(c,req,"I",header.rows[0].stock_transfer_id,header.rows[0]);await c.query("COMMIT");
    res.status(201).json({success:true,data:header.rows[0]});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});res.status(e.status|| (e.code==="23514"?409:500)).json({success:false,message:e.message,error:e.message});}finally{c.release();}
});

router.post("/:id/dispatch",requirePermission("TRANSFER_STOCK"),async(req,res)=>{
  const c=await pool.connect();try{
    await c.query("BEGIN");await setDatabaseUserContext(c,req);
    const h=await c.query(`SELECT * FROM inv.stock_transfer WHERE stock_transfer_id=$1 FOR UPDATE`,[req.params.id]);if(!h.rowCount)throw Object.assign(new Error("Stock transfer not found."),{status:404});
    const t=h.rows[0];if(!(await canAccessBranch(req.user?.user_id,t.source_branch_id))&&!canSeeAllBranches(req))throw Object.assign(new Error("You are not authorized for the source branch."),{status:403});if(req.branchId!==t.source_branch_id)throw Object.assign(new Error("Select the source branch before dispatching."),{status:403});if(t.status!=="DRAFT")throw Object.assign(new Error("Only DRAFT transfers can be dispatched."),{status:409});
    const lines=await c.query(`SELECT * FROM inv.stock_transfer_line WHERE stock_transfer_id=$1`,[t.stock_transfer_id]);
    for(const line of lines.rows){const r=await c.query(`SELECT COALESCE(SUM(CASE WHEN sml.to_location_id=$1 THEN sml.qty WHEN sml.from_location_id=$1 THEN -sml.qty ELSE 0 END),0) AS qty FROM inv.stock_movement_line sml JOIN inv.stock_movement sm ON sm.movement_id=sml.movement_id WHERE sml.product_id=$2 AND sml.lot_id IS NOT DISTINCT FROM $3::uuid`,[t.source_location_id,line.product_id,line.lot_id]);if(Number(r.rows[0].qty)<Number(line.qty))throw Object.assign(new Error("Source stock changed; the transfer cannot be dispatched at the requested quantity."),{status:409});}
    const movement=await c.query(`INSERT INTO inv.stock_movement(movement_type,document_no,from_location_id,to_location_id,notes,created_by) VALUES('TRANSFER',$1,$2,$3,$4,$5) RETURNING movement_id`,[`${t.transfer_no}-OUT`,t.source_location_id,t.transit_location_id,`Dispatch ${t.transfer_no}`,req.user?.user_id||null]);
    for(const line of lines.rows)await c.query(`INSERT INTO inv.stock_movement_line(movement_id,product_id,lot_id,qty,unit_cost,from_location_id,to_location_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[movement.rows[0].movement_id,line.product_id,line.lot_id,line.qty,line.unit_cost,t.source_location_id,t.transit_location_id]);
    const updated=await c.query(`UPDATE inv.stock_transfer SET status='IN_TRANSIT',dispatch_movement_id=$2,dispatched_by=$3,dispatched_at=now() WHERE stock_transfer_id=$1 RETURNING *`,[t.stock_transfer_id,movement.rows[0].movement_id,req.user?.user_id||null]);await audit(c,req,"U",t.stock_transfer_id,{operation:"DISPATCH",transfer:updated.rows[0]});await c.query("COMMIT");res.json({success:true,data:updated.rows[0]});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});res.status(e.status||500).json({success:false,message:e.message,error:e.message});}finally{c.release();}
});

router.post("/:id/receive",requirePermission("RECEIVE_STOCK_TRANSFER"),async(req,res)=>{
  const c=await pool.connect();try{
    await c.query("BEGIN");await setDatabaseUserContext(c,req);
    const h=await c.query(`SELECT * FROM inv.stock_transfer WHERE stock_transfer_id=$1 FOR UPDATE`,[req.params.id]);if(!h.rowCount)throw Object.assign(new Error("Stock transfer not found."),{status:404});
    const t=h.rows[0];if(!(await canAccessBranch(req.user?.user_id,t.destination_branch_id))&&!canSeeAllBranches(req))throw Object.assign(new Error("You are not authorized for the destination branch."),{status:403});if(req.branchId!==t.destination_branch_id)throw Object.assign(new Error("Select the destination branch before receiving."),{status:403});if(!["IN_TRANSIT","RECEIVED_WITH_VARIANCE"].includes(t.status))throw Object.assign(new Error("Only IN_TRANSIT or unresolved variance transfers can be received."),{status:409});
    const lines=await c.query(`SELECT * FROM inv.stock_transfer_line WHERE stock_transfer_id=$1`,[t.stock_transfer_id]);
    const requestedReceipts=Array.isArray(req.body?.lines)?req.body.lines:[];
    const receiveByLine=new Map(requestedReceipts.map(line=>[String(line.stock_transfer_line_id),line]));
    const receiptLines=lines.rows.map(line=>{const requested=receiveByLine.get(String(line.stock_transfer_line_id));const rawReceived=requested?Number(requested.received_qty):Number(line.qty)-Number(line.received_qty||0);const received=Number.isFinite(rawReceived)?Math.round(rawReceived*1000)/1000:rawReceived;const dispatched=Number(line.qty);const alreadyReceived=Number(line.received_qty||0);const remaining=dispatched-alreadyReceived;const reason=requested?.variance_reason||line.variance_reason||null;if(!Number.isFinite(received)||received<0||received>remaining)throw Object.assign(new Error("Received quantity must be between zero and the remaining in-transit quantity."),{status:400});if(received<remaining&&!['DAMAGED_IN_TRANSIT','SHORT_DELIVERY','SPILLAGE','LOST_IN_TRANSIT','COUNT_DIFFERENCE','OTHER'].includes(reason))throw Object.assign(new Error("A valid variance reason is required when received quantity is below the remaining in-transit quantity."),{status:400});return {...line,received_qty:received,total_received:alreadyReceived+received,remaining_after:remaining-received,variance_reason:reason,variance_notes:requested?.variance_notes||line.variance_notes||null};});
    if(receiptLines.reduce((sum,line)=>sum+line.received_qty,0)<=0)throw Object.assign(new Error("At least some positive quantity must be received."),{status:400});
    for(const line of receiptLines){const r=await c.query(`SELECT COALESCE(SUM(CASE WHEN sml.to_location_id=$1 THEN sml.qty WHEN sml.from_location_id=$1 THEN -sml.qty ELSE 0 END),0) AS qty FROM inv.stock_movement_line sml JOIN inv.stock_movement sm ON sm.movement_id=sml.movement_id WHERE sml.product_id=$2 AND sml.lot_id IS NOT DISTINCT FROM $3::uuid`,[t.transit_location_id,line.product_id,line.lot_id]);if(Number(r.rows[0].qty)<line.received_qty)throw Object.assign(new Error("Received transfer quantity is not present in transit."),{status:409});}
    const movement=await c.query(`INSERT INTO inv.stock_movement(movement_type,document_no,from_location_id,to_location_id,notes,created_by) VALUES('TRANSFER',$1,$2,$3,$4,$5) RETURNING movement_id`,[`${t.transfer_no}-IN`,t.transit_location_id,t.destination_location_id,`Receive ${t.transfer_no}`,req.user?.user_id||null]);
    for(const line of receiptLines){if(line.received_qty>0)await c.query(`INSERT INTO inv.stock_movement_line(movement_id,product_id,lot_id,qty,unit_cost,from_location_id,to_location_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[movement.rows[0].movement_id,line.product_id,line.lot_id,line.received_qty,line.unit_cost,t.transit_location_id,t.destination_location_id]);await c.query(`UPDATE inv.stock_transfer_line SET received_qty=$2,variance_reason=$3,variance_notes=$4 WHERE stock_transfer_line_id=$1`,[line.stock_transfer_line_id,line.total_received,line.remaining_after>0?line.variance_reason:null,line.remaining_after>0?line.variance_notes:null]);if(line.request_line_id)await c.query(`UPDATE inv.stock_request_line SET supplied_qty=supplied_qty+$2 WHERE request_line_id=$1`,[line.request_line_id,line.received_qty]);}
    const hasVariance=receiptLines.some(line=>line.remaining_after>0);
    const nextStatus=hasVariance?"RECEIVED_WITH_VARIANCE":"RECEIVED";
    const updated=await c.query(`UPDATE inv.stock_transfer SET status=$2,receipt_movement_id=$3,received_by=$4,received_at=now() WHERE stock_transfer_id=$1 RETURNING *`,[t.stock_transfer_id,nextStatus,movement.rows[0].movement_id,req.user?.user_id||null]);
    if(t.stock_request_id)await c.query(`UPDATE inv.stock_request r SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM inv.stock_request_line l WHERE l.request_id=r.request_id AND l.supplied_qty<l.approved_qty) THEN 'FULFILLED' ELSE 'PARTIALLY_SUPPLIED' END WHERE r.request_id=$1`,[t.stock_request_id]);
    await audit(c,req,"U",t.stock_transfer_id,{operation:"RECEIVE",transfer:updated.rows[0],lines:receiptLines});await c.query("COMMIT");res.json({success:true,data:updated.rows[0],received_lines:receiptLines});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});res.status(e.status||500).json({success:false,message:e.message,error:e.message});}finally{c.release();}
});

router.post("/:id/cancel",requirePermission("TRANSFER_STOCK"),async(req,res)=>{
  try{const t=await query(`SELECT * FROM inv.stock_transfer WHERE stock_transfer_id=$1`,[req.params.id]);if(!t.rowCount)return res.status(404).json({success:false,message:"Stock transfer not found."});if(t.rows[0].status!=="DRAFT")return res.status(409).json({success:false,message:"Only DRAFT transfers can be cancelled."});if(!(await canAccessBranch(req.user?.user_id,t.rows[0].source_branch_id)))return res.status(403).json({success:false,message:"You are not authorized for the source branch."});const r=await query(`UPDATE inv.stock_transfer SET status='CANCELLED' WHERE stock_transfer_id=$1 RETURNING *`,[req.params.id]);res.json({success:true,data:r.rows[0]});}catch(e){res.status(500).json({success:false,message:"Failed to cancel transfer.",error:e.message});}
});
export default router;
