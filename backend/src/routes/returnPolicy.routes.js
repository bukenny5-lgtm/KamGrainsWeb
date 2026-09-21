import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
const EDITABLE = [
  "returns_enabled", "default_return_window_days", "proof_of_purchase_required",
  "allow_return_without_receipt", "refund_to_original_method", "allow_customer_credit",
  "allow_exchange", "inspection_required", "manager_approval_required",
  "allow_partial_returns", "allow_damaged_returns", "allow_change_of_mind_returns",
  "restocking_fee_enabled", "restocking_fee_percent", "refund_processing_days", "policy_notes", "is_active"
];

router.get("/", requireAuth, requirePermission("VIEW_RETURN_POLICY"), async (_req, res) => {
  try {
    const result = await query("SELECT * FROM sal.return_policy WHERE is_active = true ORDER BY created_at LIMIT 1");
    return res.json({ success: true, data: result.rows[0] || null, policy: result.rows[0] || null });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load return policy.", error: error.message }); }
});

router.patch("/", requireAuth, requirePermission("EDIT_RETURN_POLICY"), async (req, res) => {
  try {
    const body = req.body || {};
    const fields = Object.keys(body).filter((field) => EDITABLE.includes(field));
    if (!fields.length) return res.status(400).json({ success: false, message: "At least one supported policy field is required." });
    if (body.default_return_window_days != null && (!Number.isInteger(Number(body.default_return_window_days)) || Number(body.default_return_window_days) < 0)) return res.status(400).json({ success: false, message: "default_return_window_days must be a non-negative integer." });
    if (body.restocking_fee_percent != null && (Number(body.restocking_fee_percent) < 0 || Number(body.restocking_fee_percent) > 100)) return res.status(400).json({ success: false, message: "restocking_fee_percent must be between 0 and 100." });
    const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(", ");
    const values = fields.map((field) => body[field]);
    const result = await query(`UPDATE sal.return_policy SET ${assignments}, updated_by=$${fields.length + 1}, updated_at=now() WHERE is_active=true RETURNING *`, [...values, req.user?.user_id || null]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Active return policy not found." });
    return res.json({ success: true, data: result.rows[0], policy: result.rows[0] });
  } catch (error) { return res.status(400).json({ success: false, message: "Failed to update return policy.", error: error.message }); }
});

export default router;
