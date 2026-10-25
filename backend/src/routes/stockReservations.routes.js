import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ACTION_ROLES, getUserRoles } from "../middleware/permissions.js";

const router = express.Router();
router.use(requireAuth);
const canSeeAll = (req) => ACTION_ROLES.VIEW_ALL_BRANCH_STOCK.some((role) => getUserRoles(req).includes(role));
const canViewLocation = async (req, locationId) => canSeeAll(req) || (await query(`SELECT 1 FROM sec.user_location ul JOIN app.location l ON l.location_id=ul.location_id JOIN sec.user_branch ub ON ub.user_id=ul.user_id AND ub.branch_id=l.branch_id AND ub.is_active WHERE ul.user_id=$1 AND ul.location_id=$2 AND ul.is_active`, [req.user?.user_id, locationId])).rowCount > 0;

router.get("/", async (req, res) => {
  try {
    const { product_id, location_id, lot_id, include_history } = req.query;
    if (!product_id || !location_id) return res.status(400).json({ success: false, message: "Product and location are required." });
    if (!(await canViewLocation(req, location_id))) return res.status(403).json({ success: false, message: "You are not allowed to view reservations at this location." });
    const statusClause = include_history === "true" ? "" : "AND t.status = 'DRAFT'";
    const result = await query(`SELECT t.transfer_no,t.status,t.created_at AS prepared_at,sb.branch_name AS source_branch_name,db.branch_name AS destination_branch_name,sl.location_name AS source_location_name,dl.location_name AS destination_location_name,COALESCE(u.full_name,'—') AS prepared_by,COALESCE(r.request_no,'—') AS request_no,tl.qty AS reserved_qty,p.uom_code,l.lot_code FROM inv.stock_transfer t JOIN inv.stock_transfer_line tl ON tl.stock_transfer_id=t.stock_transfer_id JOIN inv.product p ON p.product_id=tl.product_id LEFT JOIN inv.lot l ON l.lot_id=tl.lot_id LEFT JOIN inv.stock_request r ON r.request_id=t.stock_request_id LEFT JOIN sec.app_user u ON u.user_id=t.created_by JOIN app.branch sb ON sb.branch_id=t.source_branch_id JOIN app.branch db ON db.branch_id=t.destination_branch_id JOIN app.location sl ON sl.location_id=t.source_location_id JOIN app.location dl ON dl.location_id=t.destination_location_id WHERE tl.product_id=$1 AND t.source_location_id=$2 AND tl.lot_id IS NOT DISTINCT FROM $3::uuid ${statusClause} ORDER BY t.created_at DESC`, [product_id, location_id, lot_id || null]);
    res.json({ success: true, data: result.rows });
  } catch (e) { res.status(500).json({ success: false, message: "Failed to load stock reservations." }); }
});

export default router;
