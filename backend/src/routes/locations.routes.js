import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ACTION_ROLES, getUserRoles, requirePermission } from "../middleware/permissions.js";
import { getActiveCompanyId } from "../services/businessFeatures.service.js";

const router = express.Router();
const TYPES = new Set(["HEAD_OFFICE", "BRANCH", "SHOP", "WAREHOUSE", "STOCK_ROOM", "PRODUCTION", "QUARANTINE", "DAMAGED", "TRANSIT", "VIRTUAL"]);
const columns = `location_id,company_id,branch_id,location_code,location_name,location_type,is_active,is_saleable,is_stock_holding,is_system,parent_location_id,address,phone,email,notes,created_at,updated_at`;
const locationColumns = `l.location_id,l.company_id,l.branch_id,l.location_code,l.location_name,l.location_type,l.is_active,l.is_saleable,l.is_stock_holding,l.is_system,l.parent_location_id,l.address,l.phone,l.email,l.notes,l.created_at,l.updated_at`;
const canViewAll = (req) => ACTION_ROLES.VIEW_ALL_LOCATIONS.some((r) => getUserRoles(req).includes(r));
const canViewBranches = (req) => ACTION_ROLES.VIEW_ALL_BRANCHES.some((r) => getUserRoles(req).includes(r));
const canViewStockBranches = (req) => req.query.stock_visibility === "true" && ACTION_ROLES.VIEW_ALL_BRANCH_STOCK.some((r) => getUserRoles(req).includes(r));
async function audit(req, action, id, data) {
  await query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,$2,'app.location',jsonb_build_object('location_id',$3::text),$4::jsonb,txid_current())`, [req.user?.user_id || null, action, id, JSON.stringify(data)]);
}
router.get("/", requireAuth, async (req, res) => {
  try {
    const branchId=(req.query.stock_visibility==="true"?req.query.branch_id:null)||req.headers["x-branch-id"]||req.query.branch_id||null;
    if(branchId&&!canViewBranches(req)&&!canViewStockBranches(req)&&!(await query(`SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active`,[req.user?.user_id,branchId])).rowCount)return res.status(403).json({success:false,message:"You are not authorized for this branch."});
    const r = await query(`SELECT ${locationColumns},b.branch_code,b.branch_name FROM app.location l JOIN app.branch b ON b.branch_id=l.branch_id WHERE ($2::uuid IS NULL OR l.branch_id=$2::uuid) AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.branch_id=l.branch_id AND ub.is_active)) AND ($4::boolean OR (l.is_active AND EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$1 AND ul.location_id=l.location_id AND ul.is_active))) ORDER BY l.location_name`, [req.user?.user_id, branchId, canViewBranches(req)||canViewStockBranches(req), canViewAll(req)||canViewStockBranches(req)]);
    const profile = await query(`SELECT default_location_id,default_branch_id FROM app.company_profile WHERE is_active=true ORDER BY created_at,company_id LIMIT 1`);
    res.json({ success: true, count: r.rowCount, locations: r.rows, data: r.rows, default_location_id: profile.rows[0]?.default_location_id || null });
  } catch (_e) { res.status(500).json({ success: false, message: "Failed to load locations." }); }
});
router.get("/:locationId", requireAuth, async (req, res) => {
  try {
    const r = await query(`SELECT ${locationColumns} FROM app.location l WHERE l.location_id=$1 AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$2 AND ul.location_id=l.location_id AND ul.is_active)) AND ($4::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$2 AND ub.branch_id=l.branch_id AND ub.is_active))`, [req.params.locationId, req.user?.user_id, canViewAll(req),canViewBranches(req)]);
    if (!r.rowCount) {
      const exists = await query(`SELECT 1 FROM app.location WHERE location_id=$1`, [req.params.locationId]);
      if (exists.rowCount) return res.status(403).json({ success: false, message: "You are not allowed to access this location." });
      return res.status(404).json({ success: false, message: "Location not found." });
    }
    res.json({ success: true, data: r.rows[0], location: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: "Failed to load location.", error: e.message }); }
});
router.post("/", requireAuth, requirePermission("CREATE_SETUP"), async (req, res) => {
  try {
    const b = req.body || {}; const type = String(b.location_type || "WAREHOUSE").toUpperCase();
    if (!b.location_code || !b.location_name) return res.status(400).json({ success: false, message: "location_code and location_name are required." });
    if (!TYPES.has(type)) return res.status(400).json({ success: false, message: "Unsupported location_type." });
    const companyId = await getActiveCompanyId();
    const branchId=b.branch_id||req.headers["x-branch-id"]||(await query(`SELECT default_branch_id FROM app.company_profile WHERE company_id=$1`,[companyId])).rows[0]?.default_branch_id;
    if(!branchId)return res.status(400).json({success:false,message:"A branch is required for this location."});
    if(!canViewBranches(req)&&!(await query(`SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active`,[req.user?.user_id,branchId])).rowCount)return res.status(403).json({success:false,message:"You are not authorized for this branch."});
    const r = await query(`INSERT INTO app.location(location_id,company_id,branch_id,location_code,location_name,location_type,is_active,is_saleable,is_stock_holding,is_system,parent_location_id,address,phone,email,notes,created_at,updated_at) VALUES(gen_random_uuid(),$1,$2,upper($3),$4,$5,COALESCE($6,true),COALESCE($7,true),COALESCE($8,true),false,$9,$10,$11,$12,$13,now(),now()) RETURNING ${columns}`, [companyId,branchId,b.location_code,String(b.location_name).trim(),type,b.is_active,b.is_saleable,b.is_stock_holding,b.parent_location_id||null,b.address||null,b.phone||null,b.email||null,b.notes||null]);
    await audit(req,"I",r.rows[0].location_id,r.rows[0]);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { res.status(e.code === "23514" ? 409 : 500).json({ success: false, message: e.code === "23514" ? e.message : "Failed to create location.", error: e.message }); }
});
router.patch("/:locationId", requireAuth, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const b=req.body||{}; const type=String(b.location_type||"WAREHOUSE").toUpperCase();
    if (!b.location_code || !b.location_name) return res.status(400).json({success:false,message:"location_code and location_name are required."});
    if (!TYPES.has(type)) return res.status(400).json({success:false,message:"Unsupported location_type."});
    const before=await query(`SELECT ${columns} FROM app.location WHERE location_id=$1`,[req.params.locationId]);
    if(!before.rowCount) return res.status(404).json({success:false,message:"Location not found."});
    if(!canViewBranches(req)&&!(await query(`SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active`,[req.user?.user_id,before.rows[0].branch_id])).rowCount)return res.status(403).json({success:false,message:"You are not authorized for this branch."});
    if(before.rows[0].is_system && String(b.location_code).toUpperCase()!==before.rows[0].location_code) return res.status(409).json({success:false,message:"System location code cannot be changed."});
    if(before.rows[0].location_code==="RETURN_QUARANTINE" && (b.is_active===false || b.is_saleable===true)) return res.status(409).json({success:false,message:"RETURN_QUARANTINE must remain active and non-saleable."});
    const r=await query(`UPDATE app.location SET location_code=upper($2),location_name=$3,location_type=$4,is_active=$5,is_saleable=$6,is_stock_holding=$7,parent_location_id=$8,address=$9,phone=$10,email=$11,notes=$12,updated_at=now() WHERE location_id=$1 RETURNING ${columns}`,[req.params.locationId,b.location_code,String(b.location_name).trim(),type,b.is_active!==false,b.is_saleable!==false,b.is_stock_holding!==false,b.parent_location_id||null,b.address||null,b.phone||null,b.email||null,b.notes||null]);
    await audit(req,"U",req.params.locationId,{old:before.rows[0],new:r.rows[0]});
    res.json({success:true,data:r.rows[0]});
  } catch(e) { res.status(e.code==="23514"?409:500).json({success:false,message:e.message,error:e.message}); }
});
router.delete("/:locationId", requireAuth, requirePermission("DELETE"), async (_req,res)=>res.status(409).json({success:false,message:"Locations cannot be deleted. Deactivate them instead."}));

router.put("/:locationId/access/:userId",requireAuth,requirePermission("EDIT_SETUP"),async(req,res)=>{
  try {
    const {locationId,userId}=req.params; const active=req.body?.is_active!==false; const isDefault=req.body?.is_default===true;
    const found=await query(`SELECT location_id FROM app.location WHERE location_id=$1`,[locationId]); if(!found.rowCount)return res.status(404).json({success:false,message:"Location not found."});
    if(isDefault) await query(`UPDATE sec.user_location SET is_default=false,updated_at=now() WHERE user_id=$1`,[userId]);
    const r=await query(`INSERT INTO sec.user_location(user_id,location_id,is_default,is_active) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,location_id) DO UPDATE SET is_default=EXCLUDED.is_default,is_active=EXCLUDED.is_active,updated_at=now() RETURNING *`,[userId,locationId,isDefault,active]);
    await query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,'U','sec.user_location',jsonb_build_object('user_id',$2::text,'location_id',$3::text),$4::jsonb,txid_current())`,[req.user?.user_id||null,userId,locationId,JSON.stringify(r.rows[0])]);
    res.json({success:true,data:r.rows[0]});
  } catch(e){res.status(500).json({success:false,message:"Failed to update user location access.",error:e.message});}
});

router.put("/default/:locationId",requireAuth,requirePermission("EDIT_SETUP"),async(req,res)=>{
  try {
    const r=await query(`UPDATE app.company_profile cp SET default_location_id=l.location_id FROM app.location l WHERE cp.company_id=(SELECT company_id FROM app.company_profile WHERE is_active=true ORDER BY created_at,company_id LIMIT 1) AND l.location_id=$1 AND l.is_active AND l.company_id=cp.company_id AND l.branch_id=cp.default_branch_id RETURNING cp.company_id,cp.default_branch_id,cp.default_location_id`,[req.params.locationId]);
    if(!r.rowCount)return res.status(400).json({success:false,message:"Default location must be active and belong to the business."});
    await query(`UPDATE app.branch SET default_location_id=$2,updated_at=now() WHERE branch_id=$1`,[r.rows[0].default_branch_id,r.rows[0].default_location_id]);
    await query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,'U','app.company_profile',jsonb_build_object('company_id',$2::text),$3::jsonb,txid_current())`,[req.user?.user_id||null,r.rows[0].company_id,JSON.stringify(r.rows[0])]);
    res.json({success:true,data:r.rows[0]});
  }catch(e){res.status(500).json({success:false,message:"Failed to change default location.",error:e.message});}
});
export default router;
