import { query } from "../db.js";
import { getUserRoles } from "../middleware/permissions.js";
import { getActiveCompanyId } from "./businessFeatures.service.js";

export function canManageAllBranches(req) {
  return getUserRoles(req).some((role) => ["ADMIN", "HEAD_OFFICE"].includes(role));
}

export async function resolveManagementScope(req, { branchId, locationId = null, requireLocation = false } = {}) {
  const companyId = await getActiveCompanyId();
  const targetBranchId = branchId || req.branchId;
  if (!targetBranchId || (requireLocation && !locationId)) throw Object.assign(new Error("A management branch and location are required."), { statusCode: 400 });
  const branch = await query(`SELECT branch_id,company_id,branch_code,branch_name,is_active FROM app.branch WHERE branch_id=$1 AND company_id=$2 AND is_active`, [targetBranchId, companyId]);
  if (!branch.rowCount) throw Object.assign(new Error("You are not authorized to manage this branch."), { statusCode: 403 });
  if (!canManageAllBranches(req)) {
    const access = await query(`SELECT 1 FROM sec.user_branch WHERE user_id=$1 AND branch_id=$2 AND is_active`, [req.user?.user_id, targetBranchId]);
    if (!access.rowCount) throw Object.assign(new Error("You are not authorized to manage this branch."), { statusCode: 403 });
  }
  let location = null;
  if (locationId) {
    const locations = await query(`SELECT location_id,branch_id,location_code,location_name,is_active FROM app.location WHERE location_id=$1 AND branch_id=$2 AND company_id=$3 AND is_active`, [locationId, targetBranchId, companyId]);
    if (!locations.rowCount) throw Object.assign(new Error("Select a location belonging to the managed branch."), { statusCode: 400 });
    if (!canManageAllBranches(req)) {
      const access = await query(`SELECT 1 FROM sec.user_location WHERE user_id=$1 AND location_id=$2 AND is_active`, [req.user?.user_id, locationId]);
      if (!access.rowCount) throw Object.assign(new Error("You are not authorized to manage this location."), { statusCode: 403 });
    }
    location = locations.rows[0];
  }
  return { companyId, branch: branch.rows[0], location, central: canManageAllBranches(req) };
}
