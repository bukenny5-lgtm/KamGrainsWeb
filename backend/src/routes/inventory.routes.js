import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ACTION_ROLES, getUserRoles } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

const router = express.Router();
router.use(requireAuth, requireLocationAccessWhenSpecified);
router.get("/stock-on-hand", requireAuth, async (req, res) => {
  try {
    const { product_id, location_id, category_id, saleable, include_closed } = req.query;
    const roles=getUserRoles(req);
    const canViewAllStock=ACTION_ROLES.VIEW_ALL_BRANCH_STOCK.some((role)=>roles.includes(role));
    const canViewCost=ACTION_ROLES.VIEW_TRANSFER_COST.some((role)=>roles.includes(role));
    const selectedBranch=req.query.branch_id||req.branchId;
    const params = [req.user?.user_id, canViewAllStock, selectedBranch];
    const conditions = [];
    conditions.push("loc.branch_id = $3");

    // Choose view based on include_closed
    const viewName = include_closed === 'true'
      ? 'inv.v_stock_on_hand_all'
      : 'inv.v_stock_on_hand_active';


    if (product_id) {
      params.push(product_id);
      conditions.push(`soh.product_id = $${params.length}`);
    }

    if (location_id) {
      const allowed = canViewAllStock || (await query(`SELECT 1 FROM sec.user_location WHERE user_id=$1 AND location_id=$2 AND is_active`, [req.user?.user_id, location_id])).rowCount > 0;
      if (!allowed) return res.status(403).json({ success: false, message: "You are not allowed to view stock at this location." });
      params.push(location_id);
      conditions.push(`soh.location_id = $${params.length}`);
    }

    if (category_id) {
      params.push(category_id);
      conditions.push(`p.category_id = $${params.length}`);
    }

    conditions.push(`($2::boolean OR (EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$1 AND ub.branch_id=loc.branch_id AND ub.is_active) AND EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$1 AND ul.location_id=soh.location_id AND ul.is_active)))`);

    if (saleable !== undefined) {
      params.push(saleable === "true");
      conditions.push(`p.is_saleable = $${params.length}`);
      if (saleable === "true") conditions.push("loc.is_saleable = true");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

   const result = await query(
  `
  SELECT
    loc.branch_id,
    b.branch_code,
    b.branch_name,
    soh.product_id,
    p.sku,
    p.product_name,
    p.category_id,
    pc.category_code,
    pc.category_name,
    p.product_type,
    p.uom_code,
    p.is_saleable,

    soh.location_id,
    loc.location_code,
    loc.location_name,
    loc.location_type,
    loc.is_saleable AS location_is_saleable,

    soh.lot_id,
    l.lot_code,
    l.expiry_date,
    l.lot_status,

    ${canViewCost ? "vuc.unit_cost" : "NULL::numeric AS unit_cost"},
    soh.qty_on_hand
  FROM ${viewName} soh
  JOIN inv.product p
    ON p.product_id = soh.product_id
  LEFT JOIN inv.product_category pc
    ON pc.category_id = p.category_id
  LEFT JOIN app.location loc
    ON loc.location_id = soh.location_id
  LEFT JOIN app.branch b ON b.branch_id=loc.branch_id
  LEFT JOIN inv.lot l
    ON l.lot_id = soh.lot_id
  LEFT JOIN inv.v_lot_unit_cost vuc
    ON vuc.lot_id = soh.lot_id
  ${whereClause}
  ORDER BY
    p.product_name,
    loc.location_name,
    l.lot_code;
  `,
  params
);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load stock on hand.",
      error: error.message
    });
  }
});

router.get("/stock-detail",async(req,res)=>{
  try{
    const {product_id,location_id,lot_id}=req.query;if(!product_id||!location_id)return res.status(400).json({success:false,message:"Product and location are required."});
    const roles=getUserRoles(req);const visible=ACTION_ROLES.VIEW_ALL_BRANCH_STOCK.some(role=>roles.includes(role));const cost=ACTION_ROLES.VIEW_TRANSFER_COST.some(role=>roles.includes(role));
    const scope=await query(`SELECT l.branch_id,l.location_type,l.is_saleable,b.branch_name FROM app.location l JOIN app.branch b ON b.branch_id=l.branch_id WHERE l.location_id=$1 AND l.is_active AND ($2::boolean OR (EXISTS(SELECT 1 FROM sec.user_branch ub WHERE ub.user_id=$3 AND ub.branch_id=l.branch_id AND ub.is_active) AND EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$3 AND ul.location_id=l.location_id AND ul.is_active)))`,[location_id,visible,req.user?.user_id]);
    if(!scope.rowCount)return res.status(403).json({success:false,message:"You are not allowed to view stock at this location."});
    const stock=await query(`SELECT soh.qty_on_hand,l.lot_code,l.expiry_date,l.lot_status,${cost?"vc.unit_cost":"NULL::numeric AS unit_cost"} FROM inv.v_stock_on_hand_active soh LEFT JOIN inv.lot l ON l.lot_id=soh.lot_id LEFT JOIN inv.v_lot_unit_cost vc ON vc.lot_id=soh.lot_id WHERE soh.product_id=$1 AND soh.location_id=$2 AND soh.lot_id IS NOT DISTINCT FROM $3::uuid`,[product_id,location_id,lot_id||null]);
    const movements=await query(`SELECT sm.movement_id,sm.movement_type,sm.document_no,sm.created_at,sm.created_by,sm.notes,sml.qty,sml.unit_cost FROM inv.stock_movement_line sml JOIN inv.stock_movement sm ON sm.movement_id=sml.movement_id WHERE sml.product_id=$1 AND sml.lot_id IS NOT DISTINCT FROM $2::uuid AND (sml.from_location_id=$3 OR sml.to_location_id=$3) ORDER BY sm.created_at DESC LIMIT 10`,[product_id,lot_id||null,location_id]);
    res.json({success:true,data:{branch_name:scope.rows[0].branch_name,branch_id:scope.rows[0].branch_id,location_type:scope.rows[0].location_type,location_is_saleable:scope.rows[0].is_saleable,stock:stock.rows[0]||null,recent_movements:movements.rows.map(row=>({...row,unit_cost:cost?row.unit_cost:null}))}});
  }catch(e){res.status(500).json({success:false,message:"Failed to load stock detail."});}
});
/**
 * GET /api/inventory/lots
 * Optional filters: product_id, active
 */
router.get("/lots", async (req, res) => {
  try {
    const { product_id, active } = req.query;

    const params = [];
    const conditions = [];

    if (product_id) {
      params.push(product_id);
      conditions.push(`l.product_id = $${params.length}`);
    }

    if (active !== undefined) {
      params.push(active === "true");
      conditions.push(`l.is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `
      SELECT
        l.lot_id,
        l.lot_code,
        l.product_id,
        p.sku,
        p.product_name,
        p.uom_code,
        l.received_date,
        l.expiry_date,
        l.is_active
      FROM inv.lot l
      JOIN inv.product p
        ON p.product_id = l.product_id
      ${whereClause}
      ORDER BY
        p.product_name,
        l.received_date DESC,
        l.lot_code;
      `,
      params
    );

    res.json({
      success: true,
      count: result.rowCount,
      lots: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load lots.",
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/products-summary
 * Summarizes total stock by product.
 */
router.get("/products-summary", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable,
        COALESCE(SUM(CASE WHEN loc.location_id IS NOT NULL THEN soh.qty_on_hand ELSE 0 END), 0) AS total_qty_on_hand
      FROM inv.product p
      LEFT JOIN inv.v_stock_on_hand_active soh
        ON soh.product_id = p.product_id
      LEFT JOIN app.location loc ON loc.location_id=soh.location_id AND loc.branch_id=$1
      WHERE p.is_active = true
      GROUP BY
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable
      ORDER BY p.product_name;
    `,[req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      products_summary: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load product stock summary.",
      error: error.message
    });
  }
});

/**
 * GET /api/inventory/low-stock
 * Returns products with zero or negative stock.
 */
router.get("/low-stock", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable,
        COALESCE(SUM(CASE WHEN loc.location_id IS NOT NULL THEN soh.qty_on_hand ELSE 0 END), 0) AS total_qty_on_hand
      FROM inv.product p
      LEFT JOIN inv.v_stock_on_hand_active soh
        ON soh.product_id = p.product_id
      LEFT JOIN app.location loc ON loc.location_id=soh.location_id AND loc.branch_id=$1
      WHERE p.is_active = true
      GROUP BY
        p.product_id,
        p.sku,
        p.product_name,
        p.product_type,
        p.uom_code,
        p.is_saleable
      HAVING COALESCE(SUM(CASE WHEN loc.location_id IS NOT NULL THEN soh.qty_on_hand ELSE 0 END), 0) <= 0
      ORDER BY p.product_name;
    `,[req.branchId]);

    res.json({
      success: true,
      count: result.rowCount,
      low_stock: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load low stock products.",
      error: error.message
    });
  }
});

export default router;
