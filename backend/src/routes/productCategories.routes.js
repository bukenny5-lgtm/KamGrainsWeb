import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
const fields = "category_id, category_code, category_name, description, is_active, created_at";

router.get("/", async (req, res) => {
  try {
    const result = await query(`SELECT ${fields} FROM inv.product_category ORDER BY category_name, category_code;`);
    res.json({ success: true, count: result.rowCount, data: result.rows, categories: result.rows });
  } catch (error) { res.status(500).json({ success: false, message: "Failed to load product categories.", error: error.message, detail: error.detail || null }); }
});

router.post("/", requireAuth, requirePermission("CREATE_SETUP"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.category_code || "").trim() || !String(b.category_name || "").trim()) return res.status(400).json({ success: false, message: "category_code and category_name are required." });
    const result = await query(`INSERT INTO inv.product_category (category_code, category_name, description, is_active) VALUES ($1,$2,$3,$4) RETURNING ${fields};`, [String(b.category_code).trim().toUpperCase(), String(b.category_name).trim(), b.description || null, b.is_active !== false]);
    return res.status(201).json({ success: true, message: "Product category created successfully.", data: result.rows[0] });
  } catch (error) { return res.status(error.code === "23505" ? 409 : 500).json({ success: false, message: error.code === "23505" ? "Category code already exists." : "Failed to create product category.", error: error.message, detail: error.detail || null }); }
});

router.patch("/:categoryId", requireAuth, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!String(b.category_code || "").trim() || !String(b.category_name || "").trim()) return res.status(400).json({ success: false, message: "category_code and category_name are required." });
    const result = await query(`UPDATE inv.product_category SET category_code=$2, category_name=$3, description=$4, is_active=$5 WHERE category_id=$1 RETURNING ${fields};`, [req.params.categoryId, String(b.category_code).trim().toUpperCase(), String(b.category_name).trim(), b.description || null, b.is_active !== false]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Product category not found." });
    return res.json({ success: true, message: "Product category updated successfully.", data: result.rows[0] });
  } catch (error) { return res.status(error.code === "23505" ? 409 : 500).json({ success: false, message: error.code === "23505" ? "Category code already exists." : "Failed to update product category.", error: error.message, detail: error.detail || null }); }
});

router.delete("/:categoryId", requireAuth, requirePermission("DELETE"), async (req, res) => {
  try {
    const result = await query("DELETE FROM inv.product_category WHERE category_id=$1 RETURNING category_id, category_code, category_name;", [req.params.categoryId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Product category not found." });
    return res.json({ success: true, message: "Product category deleted successfully.", data: result.rows[0] });
  } catch (error) { return res.status(error.code === "23503" ? 409 : 500).json({ success: false, message: error.code === "23503" ? "Category is assigned to products. Deactivate it instead of deleting." : "Failed to delete product category.", error: error.message, detail: error.detail || null }); }
});

export default router;
