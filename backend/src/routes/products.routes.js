import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
const fields = `p.product_id, p.sku, p.product_name, p.description, p.product_type,
  p.uom_code, p.track_lots, p.track_expiry, p.shelf_life_days, p.is_active,
  p.lot_prefix, p.is_saleable, p.is_purchasable, p.is_stock_item,
  p.bottle_volume_l, p.pieces_per_carton, p.pack_size_qty, p.pack_size_uom_code,
  p.category_id, pc.category_code, pc.category_name`;
const from = `FROM inv.product p LEFT JOIN inv.product_category pc ON pc.category_id = p.category_id`;

function delErr(res, error, label) {
  if (error?.code === "23503") return res.status(409).json({ success: false, message: `${label} is already used in transactions. Deactivate it instead of deleting.`, error: error.message, detail: error.detail || null });
  return res.status(500).json({ success: false, message: `Failed to delete ${label.toLowerCase()}.`, error: error.message, detail: error.detail || null });
}
function booleanError(body) {
  for (const field of ["is_purchasable", "is_stock_item"]) if (field in body && typeof body[field] !== "boolean") return `${field} must be boolean.`;
  return null;
}
async function categoryError(categoryId) {
  if (categoryId == null || categoryId === "") return null;
  const result = await query("SELECT category_id FROM inv.product_category WHERE category_id=$1 AND is_active=true;", [categoryId]);
  return result.rowCount ? null : "category_id must reference an active product category.";
}

router.get("/", async (req, res) => {
  try { const result = await query(`SELECT ${fields} ${from} ORDER BY p.product_name;`); res.json({ success: true, count: result.rowCount, products: result.rows, data: result.rows }); }
  catch (error) { res.status(500).json({ success: false, message: "Failed to load products.", error: error.message, detail: error.detail || null }); }
});
router.get("/:productId", async (req, res) => {
  try { const result = await query(`SELECT ${fields} ${from} WHERE p.product_id=$1;`, [req.params.productId]); if (!result.rowCount) return res.status(404).json({ success: false, message: "Product not found." }); res.json({ success: true, data: result.rows[0], product: result.rows[0] }); }
  catch (error) { res.status(500).json({ success: false, message: "Failed to load product.", error: error.message, detail: error.detail || null }); }
});
router.post("/", requireAuth, requirePermission("CREATE_SETUP"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.sku) return res.status(400).json({ success: false, message: "sku is required." });
    if (!b.product_name) return res.status(400).json({ success: false, message: "product_name is required." });
    if (!b.product_type) return res.status(400).json({ success: false, message: "product_type is required." });
    if (!b.uom_code) return res.status(400).json({ success: false, message: "uom_code is required." });
    const boolError = booleanError(b); if (boolError) return res.status(400).json({ success: false, message: boolError });
    const catError = await categoryError(b.category_id); if (catError) return res.status(400).json({ success: false, message: catError });
    const inserted = await query(`INSERT INTO inv.product (product_id,sku,product_name,description,product_type,uom_code,track_lots,track_expiry,shelf_life_days,is_active,created_at,lot_prefix,is_saleable,is_purchasable,is_stock_item,bottle_volume_l,pieces_per_carton,pack_size_qty,pack_size_uom_code,category_id) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING product_id;`, [String(b.sku).toUpperCase(), b.product_name, b.description || null, String(b.product_type).toUpperCase(), String(b.uom_code).toUpperCase(), b.track_lots ?? true, b.track_expiry ?? false, b.shelf_life_days || null, b.is_active ?? true, b.lot_prefix || null, b.is_saleable ?? true, b.is_purchasable ?? true, b.is_stock_item ?? true, b.bottle_volume_l || null, b.pieces_per_carton || null, b.pack_size_qty || null, b.pack_size_uom_code || null, b.category_id || null]);
    const result = await query(`SELECT ${fields} ${from} WHERE p.product_id=$1;`, [inserted.rows[0].product_id]); return res.status(201).json({ success: true, message: "Product created successfully.", data: result.rows[0] });
  } catch (error) { res.status(error.code === "23505" ? 409 : 500).json({ success: false, message: error.code === "23505" ? "SKU already exists." : "Failed to create product.", error: error.message, detail: error.detail || null }); }
});
router.patch("/:productId", requireAuth, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.sku || !b.product_name || !b.product_type || !b.uom_code) return res.status(400).json({ success: false, message: "sku, product_name, product_type and uom_code are required." });
    const boolError = booleanError(b); if (boolError) return res.status(400).json({ success: false, message: boolError });
    const catError = await categoryError(b.category_id); if (catError) return res.status(400).json({ success: false, message: catError });
    const updated = await query(`UPDATE inv.product SET sku=$2,product_name=$3,description=$4,product_type=$5,uom_code=$6,track_lots=$7,track_expiry=$8,shelf_life_days=$9,is_active=$10,lot_prefix=$11,is_saleable=$12,is_purchasable=$13,is_stock_item=$14,bottle_volume_l=$15,pieces_per_carton=$16,pack_size_qty=$17,pack_size_uom_code=$18,category_id=$19 WHERE product_id=$1 RETURNING product_id;`, [req.params.productId, String(b.sku).toUpperCase(), b.product_name, b.description || null, String(b.product_type).toUpperCase(), String(b.uom_code).toUpperCase(), !!b.track_lots, !!b.track_expiry, b.shelf_life_days || null, b.is_active !== false, b.lot_prefix || null, b.is_saleable !== false, b.is_purchasable ?? true, b.is_stock_item ?? true, b.bottle_volume_l || null, b.pieces_per_carton || null, b.pack_size_qty || null, b.pack_size_uom_code || null, b.category_id || null]);
    if (!updated.rowCount) return res.status(404).json({ success: false, message: "Product not found." }); const result = await query(`SELECT ${fields} ${from} WHERE p.product_id=$1;`, [req.params.productId]); return res.json({ success: true, message: "Product updated successfully.", data: result.rows[0] });
  } catch (error) { res.status(error.code === "23505" ? 409 : 500).json({ success: false, message: error.code === "23505" ? "SKU already exists." : "Failed to update product.", error: error.message, detail: error.detail || null }); }
});
router.delete("/:productId", requireAuth, requirePermission("DELETE"), async (req, res) => {
  try { const result = await query("DELETE FROM inv.product WHERE product_id=$1 RETURNING product_id,sku,product_name;", [req.params.productId]); if (!result.rowCount) return res.status(404).json({ success: false, message: "Product not found." }); res.json({ success: true, message: "Product deleted successfully.", data: result.rows[0] }); }
  catch (error) { return delErr(res, error, "Product"); }
});
export default router;
