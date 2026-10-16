import { query } from "../db.js";
import { getUserRoles } from "../middleware/permissions.js";

export function canViewAllCustomers(req) {
  return getUserRoles(req).some((role) => ["ADMIN", "HEAD_OFFICE"].includes(role));
}

export async function assertCustomerVisible(req, customerId, executor = query) {
  if (!customerId) return;
  if (canViewAllCustomers(req)) return;
  if (!req.branchId) throw Object.assign(new Error("Operating branch is required."), { statusCode: 403 });
  const result = await executor(
    "SELECT 1 FROM sal.customer_branch WHERE customer_id=$1 AND branch_id=$2 AND is_active",
    [customerId, req.branchId]
  );
  if (!result.rowCount) throw Object.assign(new Error("Selected customer is not available in your operating branch."), { statusCode: 403 });
}
