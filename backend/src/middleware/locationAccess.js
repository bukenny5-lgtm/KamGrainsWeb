import { query } from "../db.js";
import { ACTION_ROLES, getUserRoles } from "./permissions.js";

const LOCATION_FIELDS = ["location_id", "requesting_location_id", "from_location_id", "to_location_id", "raw_location_id", "fg_location_id", "source_location_id", "destination_location_id"];
function hasAction(req, action) {
  const roles=getUserRoles(req);
  return (ACTION_ROLES[action]||[]).some((role)=>roles.includes(role));
}

export async function requireLocationAccessWhenSpecified(req, res, next) {
  try {
    const userId=req.user?.user_id;
    const inventoryRead=req.method==="GET"&&req.baseUrl==="/api/inventory";
    const branchParam=(inventoryRead?req.query?.branch_id:null)||req.headers["x-branch-id"]||req.body?.branch_id||req.query?.branch_id||null;
    const requestedBranch=branchParam?String(branchParam):null;
    const stockReadWide=req.method==="GET"&&req.baseUrl==="/api/inventory"&&hasAction(req,"VIEW_ALL_BRANCH_STOCK");
    const branchWide=hasAction(req,"VIEW_ALL_BRANCHES")||stockReadWide;
    const locationWide=hasAction(req,"VIEW_ALL_LOCATIONS");
    const includeHeaderLocation=Boolean(req.headers["x-location-id"])&&!(inventoryRead&&requestedBranch&&req.headers["x-branch-id"]&&String(req.headers["x-branch-id"])!==requestedBranch);
    const locationIds=[...new Set([...([req.body,req.query].flatMap((source)=>LOCATION_FIELDS.map((key)=>source?.[key]).filter(Boolean).map(String))),...(includeHeaderLocation?[String(req.headers["x-location-id"])]:[])])];
    if(requestedBranch){
      const b=await query(`SELECT 1 FROM app.branch b WHERE b.branch_id=$2 AND b.is_active AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.branch_id=b.branch_id AND ub.is_active))`,[userId,requestedBranch,branchWide]);
      if(!b.rowCount)return res.status(403).json({success:false,message:"Branch is inactive or you are not authorized for it."});
    }
    if(locationIds.length){
      const scope=await query(`
        SELECT requested.location_id,loc.branch_id
        FROM unnest($1::uuid[]) requested(location_id)
        JOIN app.location loc ON loc.location_id=requested.location_id AND loc.is_active
        JOIN app.branch b ON b.branch_id=loc.branch_id AND b.is_active
        WHERE (($2::boolean OR $4::boolean OR (EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$3 AND ul.location_id=loc.location_id AND ul.is_active) AND EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$3 AND ub.branch_id=loc.branch_id AND ub.is_active)))
          OR ($5::uuid IS NOT NULL AND loc.location_id=$6::uuid AND EXISTS(SELECT 1 FROM inv.stock_request sr WHERE sr.request_id=$5::uuid AND sr.status IN ('APPROVED','PARTIALLY_SUPPLIED') AND sr.requesting_location_id=loc.location_id AND sr.requesting_branch_id=$8::uuid AND (sr.preferred_source_branch_id IS NULL OR sr.preferred_source_branch_id=$7::uuid)))
          OR ($9::boolean AND loc.branch_id=$10::uuid))`,[locationIds,locationWide,userId,branchWide,req.baseUrl==="/api/stock-transfers"&&req.method==="POST"?req.body?.stock_request_id||null:null,req.body?.destination_location_id||null,req.body?.source_branch_id||null,req.body?.destination_branch_id||null,stockReadWide,inventoryRead?requestedBranch:null]);
      if(scope.rowCount!==locationIds.length)return res.status(403).json({success:false,message:"You are not authorized for one or more locations or their branches."});
      const branches=new Set(scope.rows.map((row)=>row.branch_id));
      if(requestedBranch&&[...branches].some((branchId)=>branchId!==requestedBranch)){
        const sourceBranch=String(req.body?.source_branch_id||"");
        const destinationBranch=String(req.body?.destination_branch_id||"");
        const transferCreate=req.baseUrl==="/api/stock-transfers"&&req.method==="POST"&&req.path==="/"&&sourceBranch===requestedBranch&&destinationBranch&&destinationBranch!==sourceBranch;
        if(!transferCreate)return res.status(403).json({success:false,message:"The selected location does not belong to the active branch."});
        const linkedRequest=transferCreate&&req.body?.stock_request_id?await query(`SELECT request_id FROM inv.stock_request WHERE request_id=$1 AND status IN ('APPROVED','PARTIALLY_SUPPLIED') AND requesting_branch_id=$2 AND requesting_location_id=$3 AND (preferred_source_branch_id IS NULL OR preferred_source_branch_id=$4)`,[req.body.stock_request_id,destinationBranch,req.body.destination_location_id,sourceBranch]):{rowCount:0};
        const requiredBranches=linkedRequest.rowCount===1?[sourceBranch]:[sourceBranch,destinationBranch];
        const branchAccess=await query(`SELECT branch_id FROM app.branch b WHERE b.branch_id=ANY($2::uuid[]) AND b.is_active AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.branch_id=b.branch_id AND ub.is_active))`,[userId,requiredBranches,branchWide]);
        const sourceLocation=scope.rows.find((row)=>row.location_id===req.body?.source_location_id);
        const destinationLocation=scope.rows.find((row)=>row.location_id===req.body?.destination_location_id);
        if(branchAccess.rowCount!==requiredBranches.length||sourceLocation?.branch_id!==sourceBranch||destinationLocation?.branch_id!==destinationBranch)return res.status(403).json({success:false,message:"You are not authorized for the source branch and approved transfer destination."});
      }
      if(!requestedBranch&&branches.size===1)req.branchId=[...branches][0];
    }
    if(requestedBranch)req.branchId=requestedBranch;
    if(!req.branchId){
      const defaultBranch=await query(`SELECT COALESCE((SELECT ub.branch_id FROM sec.user_branch ub JOIN app.branch b ON b.branch_id=ub.branch_id AND b.is_active WHERE ub.user_id=$1 AND ub.is_active ORDER BY ub.is_default DESC,ub.branch_id LIMIT 1),CASE WHEN $2::boolean THEN (SELECT cp.default_branch_id FROM app.company_profile cp JOIN app.branch b ON b.branch_id=cp.default_branch_id AND b.is_active WHERE cp.is_active ORDER BY cp.created_at,cp.company_id LIMIT 1) ELSE NULL END) AS branch_id`,[userId,branchWide]);
      req.branchId=defaultBranch.rows[0]?.branch_id||null;
    }
    if(!req.branchId)return res.status(403).json({success:false,message:"No active branch access is assigned to your account."});
    return next();
  } catch (error) {
    if(error.code==="22P02")return res.status(400).json({success:false,message:"Invalid branch or location identifier."});
    return res.status(503).json({ success: false, message: "Branch/location access could not be verified.", error: error.message });
  }
}
