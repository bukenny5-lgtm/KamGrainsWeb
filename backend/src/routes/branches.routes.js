import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ACTION_ROLES, getUserRoles, requirePermission } from "../middleware/permissions.js";
import { getActiveCompanyId } from "../services/businessFeatures.service.js";

const router = express.Router();
const allBranch = (req) => getUserRoles(req).includes("HEAD_OFFICE");
const stockVisibleBranch = (req) => req.query.stock_visibility === "true" && ACTION_ROLES.VIEW_ALL_BRANCH_STOCK.some((r) => getUserRoles(req).includes(r));
const requestSourceBranch = (req) => req.query.request_sources === "true" && ACTION_ROLES.CREATE_STOCK_REQUEST.some((r) => getUserRoles(req).includes(r));
const allLocations = (req) => getUserRoles(req).some((role) => ["ADMIN", "MANAGER", "AUDITOR", "HEAD_OFFICE"].includes(role));
const branchColumns = "b.branch_id,b.company_id,b.branch_code,b.branch_name,b.branch_type,b.is_active,b.is_head_office,b.procurement_mode,b.address,b.phone,b.email,b.default_location_id,b.created_at,b.updated_at";
const branchReturningColumns = branchColumns.replaceAll("b.", "");

async function audit(req, action, branchId, data) {
  await query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,$2,'app.branch',jsonb_build_object('branch_id',$3::text),$4::jsonb,txid_current())`, [req.user?.user_id || null, action, branchId, JSON.stringify(data)]);
}

router.get("/context", requireAuth, async (req,res) => {
  try {
    const branchId = req.query.branch_id || null;
    const branchPerm = allBranch(req);
    const locPerm = allLocations(req);
    if (branchId && !branchPerm) {
      const allowed = await query(`SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active`,[req.user?.user_id,branchId]);
      if (!allowed.rowCount) return res.status(403).json({success:false,message:"You are not authorized for this branch."});
    }
    const branches = await query(`
      SELECT ${branchColumns},
        COALESCE(json_agg(json_build_object('location_id',l.location_id,'location_code',l.location_code,'location_name',l.location_name,'location_type',l.location_type,'is_saleable',l.is_saleable,'is_stock_holding',l.is_stock_holding,'is_system',l.is_system,'is_default',l.location_id=b.default_location_id) ORDER BY l.location_name) FILTER(WHERE l.location_id IS NOT NULL),'[]'::json) AS locations
      FROM app.branch b
      LEFT JOIN app.location l ON l.branch_id=b.branch_id AND l.is_active
        AND ($4::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$1 AND ul.location_id=l.location_id AND ul.is_active))
      WHERE b.company_id=$3 AND b.is_active AND ($2::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.branch_id=b.branch_id AND ub.is_active))
        AND ($5::uuid IS NULL OR b.branch_id=$5::uuid)
      GROUP BY b.branch_id ORDER BY b.branch_name`,[req.user?.user_id,branchPerm,await getActiveCompanyId(),locPerm,branchId]);
    const defaults = await query(`SELECT default_branch_id,default_location_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1`);
    if (branchId && !branches.rowCount) return res.status(403).json({success:false,message:"You are not authorized for this branch."});
    const branch = branches.rows.find((row)=>row.branch_id===branchId) || branches.rows.find((row)=>row.branch_id===defaults.rows[0]?.default_branch_id) || branches.rows[0] || null;
    const authorizedLocations = branch?.locations || [];
    const currentLocation = authorizedLocations.find((location)=>location.location_id===defaults.rows[0]?.default_location_id) || authorizedLocations.find((location)=>location.is_default) || authorizedLocations.find((location)=>location.is_saleable) || authorizedLocations[0] || null;
    res.json({success:true,company_id:defaults.rows[0] ? (await getActiveCompanyId()) : null,default_branch_id:defaults.rows[0]?.default_branch_id||null,default_location_id:defaults.rows[0]?.default_location_id||null,all_branches:branchPerm,branches:branches.rows,current_branch:branch,current_location:currentLocation});
  } catch(e){res.status(500).json({success:false,message:"Failed to load operating context.",error:e.message});}
});

router.get("/",requireAuth,async(req,res)=>{
  try{
    const companyId=await getActiveCompanyId();
    const result=await query(`SELECT ${branchColumns} FROM app.branch b WHERE b.company_id=$2 AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.branch_id=b.branch_id AND ub.is_active)) ORDER BY b.branch_name`,[req.user?.user_id,companyId,allBranch(req)||stockVisibleBranch(req)||requestSourceBranch(req)]);
    res.json({success:true,count:result.rowCount,branches:result.rows,data:result.rows});
  }catch(e){res.status(500).json({success:false,message:"Failed to load branches.",error:e.message});}
});

router.get("/access-admin",requireAuth,requirePermission("ASSIGN_ROLE"),async(req,res)=>{
  try{
    const [users,branches,locations,userBranches,userLocations,defaults]=await Promise.all([
      query(`SELECT user_id,username,full_name,is_active FROM sec.app_user ORDER BY full_name,username`),
      query(`SELECT branch_id,branch_code,branch_name,is_active,is_head_office,default_location_id,procurement_mode FROM app.branch WHERE is_active ORDER BY branch_name`),
      query(`SELECT location_id,branch_id,location_code,location_name,is_active FROM app.location WHERE is_active ORDER BY location_name`),
      query(`SELECT user_id,branch_id,is_default,is_active FROM sec.user_branch`),
      query(`SELECT user_id,location_id,is_default,is_active FROM sec.user_location`),
      query(`SELECT default_branch_id,default_location_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1`)
    ]);
    res.json({success:true,users:users.rows,branches:branches.rows,locations:locations.rows,user_branches:userBranches.rows,user_locations:userLocations.rows,defaults:defaults.rows[0]||null});
  }catch(e){res.status(500).json({success:false,message:"Failed to load branch access administration.",error:e.message});}
});

router.post("/",requireAuth,requirePermission("EDIT_LOCATIONS"),async(req,res)=>{
  try{
    const b=req.body||{};const code=String(b.branch_code||"").trim().toUpperCase();const name=String(b.branch_name||"").trim();
    if(!/^[A-Z0-9_-]{2,16}$/.test(code)||!name)return res.status(400).json({success:false,message:"A branch code (2-16 letters, digits, _ or -) and branch name are required."});
    const companyId=await getActiveCompanyId();
    const r=await query(`INSERT INTO app.branch(company_id,branch_code,branch_name,branch_type,is_active,is_head_office,address,phone,email,default_location_id) VALUES($1,$2,$3,$4,COALESCE($5,true),false,$6,$7,$8,$9) RETURNING branch_id,company_id,branch_code,branch_name,branch_type,is_active,is_head_office,address,phone,email,default_location_id,created_at,updated_at`,[companyId,code,name,b.branch_type||"BRANCH",b.is_active,b.address||null,b.phone||null,b.email||null,b.default_location_id||null]);
    await audit(req,"I",r.rows[0].branch_id,r.rows[0]);res.status(201).json({success:true,data:r.rows[0]});
  }catch(e){res.status(e.code==="23514"?409:500).json({success:false,message:e.message,error:e.message});}
});

router.patch("/:branchId",requireAuth,requirePermission("EDIT_LOCATIONS"),async(req,res)=>{
  try{
    const b=req.body||{};const old=await query(`SELECT ${branchColumns} FROM app.branch b WHERE branch_id=$1`,[req.params.branchId]);
    if(!old.rowCount)return res.status(404).json({success:false,message:"Branch not found."});
    if(String(b.branch_code||old.rows[0].branch_code).toUpperCase()!==old.rows[0].branch_code)return res.status(409).json({success:false,message:"Branch code is immutable."});
    const procurementMode=b.procurement_mode||old.rows[0].procurement_mode||"HYBRID";
    if(!["CENTRAL_ONLY","LOCAL_ALLOWED","LOCAL_WITH_APPROVAL","HYBRID"].includes(procurementMode))return res.status(400).json({success:false,message:"Unsupported branch procurement mode."});
    const r=await query(`UPDATE app.branch SET branch_name=$2,branch_type=$3,is_active=$4,address=$5,phone=$6,email=$7,default_location_id=$8,procurement_mode=$9,updated_at=now() WHERE branch_id=$1 RETURNING ${branchReturningColumns}`,[req.params.branchId,String(b.branch_name||old.rows[0].branch_name).trim(),b.branch_type||old.rows[0].branch_type,b.is_active!==false,b.address??old.rows[0].address,b.phone??old.rows[0].phone,b.email??old.rows[0].email,b.default_location_id??old.rows[0].default_location_id,procurementMode]);
    await audit(req,"U",req.params.branchId,{old:old.rows[0],new:r.rows[0]});res.json({success:true,data:r.rows[0]});
  }catch(e){res.status(e.code==="23514"?409:500).json({success:false,message:e.message,error:e.message});}
});

router.delete("/:branchId",requireAuth,requirePermission("EDIT_LOCATIONS"),async(_req,res)=>res.status(409).json({success:false,message:"Branches cannot be deleted. Deactivate them after moving their default and operational records."}));

router.put("/:branchId/users/:userId",requireAuth,requirePermission("ASSIGN_ROLE"),async(req,res)=>{
  try{
    const {branchId,userId}=req.params;const active=req.body?.is_active!==false;const isDefault=req.body?.is_default===true;
    const exists=await query(`SELECT 1 FROM app.branch WHERE branch_id=$1`,[branchId]);if(!exists.rowCount)return res.status(404).json({success:false,message:"Branch not found."});
    if(isDefault)await query(`UPDATE sec.user_branch SET is_default=false,updated_at=now() WHERE user_id=$1`,[userId]);
    const r=await query(`INSERT INTO sec.user_branch(user_id,branch_id,is_default,is_active) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,branch_id) DO UPDATE SET is_default=EXCLUDED.is_default,is_active=EXCLUDED.is_active,updated_at=now() RETURNING *`,[userId,branchId,isDefault,active]);
    await query(`INSERT INTO audit.event(event_id,event_ts,user_id,action,table_name,row_pk,row_data,txid) VALUES(gen_random_uuid(),now(),$1,'U','sec.user_branch',jsonb_build_object('user_id',$2::text,'branch_id',$3::text),$4::jsonb,txid_current())`,[req.user?.user_id||null,userId,branchId,JSON.stringify(r.rows[0])]);
    res.json({success:true,data:r.rows[0]});
  }catch(e){res.status(500).json({success:false,message:"Failed to update branch access.",error:e.message});}
});

router.put("/default/:branchId",requireAuth,requirePermission("EDIT_LOCATIONS"),async(req,res)=>{
  try{
    const r=await query(`UPDATE app.company_profile cp SET default_branch_id=b.branch_id,default_location_id=COALESCE(b.default_location_id,cp.default_location_id) FROM app.branch b WHERE cp.is_active AND cp.company_id=b.company_id AND b.branch_id=$1 AND b.is_active RETURNING cp.company_id,cp.default_branch_id,cp.default_location_id`,[req.params.branchId]);
    if(!r.rowCount)return res.status(400).json({success:false,message:"Default branch must be active and belong to this business."});
    await audit(req,"U",req.params.branchId,r.rows[0]);res.json({success:true,data:r.rows[0]});
  }catch(e){res.status(500).json({success:false,message:"Failed to update default branch.",error:e.message});}
});

export default router;
