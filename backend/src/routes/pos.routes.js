import express from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, getUserRoles, ACTION_ROLES } from "../middleware/permissions.js";
import { getActiveCompanyId, resolveBusinessFeatureMap } from "../services/businessFeatures.service.js";
import { setDatabaseUserContext } from "../utils/uuid.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";
import { calculateDocumentTotals, calculateTaxLine } from "../services/tax.service.js";
import { queueEfrisPosSale } from "../services/efris.service.js";

const router = express.Router();
router.use(requireAuth,requireLocationAccessWhenSpecified);
const allLocations=(req)=>getUserRoles(req).some((role)=>["ADMIN","MANAGER","AUDITOR","HEAD_OFFICE"].includes(role));
async function guardSale(req,res,next,value,column){try{const r=await query(`SELECT s.location_id,l.branch_id FROM sal.pos_sale s JOIN app.location l ON l.location_id=s.location_id WHERE s.${column}=$1`,[value]);if(!r.rowCount)return res.status(404).json({success:false,message:"POS sale not found."});if(r.rows[0].branch_id!==req.branchId)return res.status(403).json({success:false,message:"You are not authorized for this sale branch."});if(!allLocations(req)&&!(await query(`SELECT 1 FROM sec.user_location WHERE user_id=$1 AND location_id=$2 AND is_active`,[req.user?.user_id,r.rows[0].location_id])).rowCount)return res.status(403).json({success:false,message:"You are not authorized for this sale location."});next();}catch(error){next(error);}}
router.param("saleId",(req,res,next,value)=>guardSale(req,res,next,value,"pos_sale_id"));
router.param("saleNo",(req,res,next,value)=>guardSale(req,res,next,value,"sale_no"));

async function requirePosFeature(req, res, next) {
  try {
    const companyId = await getActiveCompanyId();
    const features = await resolveBusinessFeatureMap(companyId);
    if (!features.pos) {
      return res.status(404).json({ success: false, message: "POS is not enabled for this business." });
    }
    return next();
  } catch (error) {
    return res.status(503).json({ success: false, message: "POS feature state is unavailable.", error: error.message });
  }
}

async function requireBarcodeFeature(req, res, next) {
  try {
    const companyId = await getActiveCompanyId();
    const features = await resolveBusinessFeatureMap(companyId);
    if (!features.barcode) return res.status(404).json({ success: false, message: "Barcode is not enabled for this business." });
    return next();
  } catch (error) {
    return res.status(503).json({ success: false, message: "Barcode feature state is unavailable.", error: error.message });
  }
}

function normalizePaymentMethod(value) {
  const method = String(value || "CASH").trim().toUpperCase();
  if (method === "MOBILE") return "MOBILE_MONEY";
  if (method === "BANK TRANSFER") return "BANK_TRANSFER";
  return method;
}

function paymentChannelTypes(method) {
  if (method === "MOBILE_MONEY") return ["MTN_MOMO", "AIRTEL_MONEY"];
  if (method === "CARD") return ["CARD"];
  if (method === "BANK_TRANSFER") return ["BANK_TRANSFER", "BANK"];
  if (method === "CASH") return ["CASH"];
  return [];
}

function hasAction(req, action) {
  const roles = getUserRoles(req);
  return (ACTION_ROLES[action] || []).some((role) => roles.includes(role));
}

async function getPricingMode() {
  const result = await query("SELECT COALESCE(pos_pricing_mode, 'FIXED') AS pos_pricing_mode FROM app.company_profile WHERE is_active = true ORDER BY created_at, company_id LIMIT 1;");
  return result.rows[0]?.pos_pricing_mode || "FIXED";
}

async function resolveLocationId(locationId, req) {
  const roles = getUserRoles(req);
  const all = roles.some((role) => ["ADMIN", "MANAGER", "AUDITOR"].includes(role));
  const result = await query(`
    SELECT l.location_id
    FROM app.location l
    WHERE l.is_active AND l.is_saleable AND l.branch_id=$4
      AND ($1::uuid IS NULL OR l.location_id=$1::uuid)
      AND ($3::boolean OR EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$2 AND ul.location_id=l.location_id AND ul.is_active))
    ORDER BY CASE WHEN EXISTS(SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$2 AND ul.location_id=l.location_id AND ul.is_default AND ul.is_active) THEN 0 ELSE 1 END,
      CASE WHEN l.location_id=(SELECT default_location_id FROM app.branch WHERE branch_id=$4 AND is_active) THEN 0 ELSE 1 END,
      CASE WHEN l.location_id=(SELECT default_location_id FROM app.company_profile WHERE is_active=true ORDER BY created_at,company_id LIMIT 1) THEN 0 ELSE 1 END,
      l.location_name
    LIMIT 1;`, [locationId || null, req.user?.user_id, all, req.branchId]);
  return { locationId: result.rows[0]?.location_id || null, forbidden: Boolean(locationId && !result.rowCount) };
}

async function loadSaleById(saleId) {
  const result = await query(`
    SELECT
      ps.pos_sale_id,
      ps.sale_no,
      ps.transaction_date,
      ps.sale_ts,
      ps.location_id,
      loc.location_name,
      ps.customer_id,
      customer.party_name AS customer_name,
      ps.payment_method,
      ps.due_date,
      ps.credit_ar_invoice_id,
      ps.amount_tendered,
      ps.change_amount,
      ps.subtotal,
      ps.taxable_subtotal,
      ps.tax_total,
      ps.total_amount,
      ps.status,
      ps.posted_at,
      ps.posted_by,
      ps.voided_at,
      ps.voided_by,
      ps.void_reason,
      ps.posted_movement_id,
      ps.posted_journal_id,
      ps.reversal_movement_id,
      ps.reversal_journal_id,
      (SELECT row_to_json(pt) FROM (
        SELECT pt.payment_transaction_id, pt.channel_id, c.channel_code, c.channel_name,
               c.channel_type, c.provider_name, pt.provider_reference, pt.amount,
               pt.currency_code, pt.status, pt.confirmation_mode, pt.confirmed_by,
               pt.confirmed_at
        FROM app.payment_transaction pt
        JOIN fin.api_payment_channel c ON c.api_payment_channel_id = pt.channel_id
        WHERE pt.document_type='POS_SALE' AND pt.document_id=ps.pos_sale_id
        ORDER BY pt.created_at DESC LIMIT 1
      ) pt) AS payment_transaction,
      ps.created_at,
      ps.created_by,
      u.full_name AS cashier_name,
      COALESCE((
        SELECT json_agg(json_build_object(
          'pos_sale_line_id', l.pos_sale_line_id,
          'product_id', l.product_id,
          'sku', p.sku,
          'product_name', p.product_name,
          'qty', l.qty,
          'unit_price', l.unit_price,
          'line_total', l.line_total,
          'tax_code', l.tax_code,
          'tax_treatment', l.tax_treatment,
          'tax_rate', l.tax_rate,
          'taxable_amount', l.taxable_amount,
          'tax_amount', l.tax_amount,
          'gross_amount', l.gross_amount,
          'lot_id', l.lot_id,
          'lot_code', lot.lot_code
        ) ORDER BY l.created_at, l.pos_sale_line_id)
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        LEFT JOIN inv.lot lot ON lot.lot_id = l.lot_id
        WHERE l.pos_sale_id = ps.pos_sale_id
      ), '[]'::json) AS lines
    FROM sal.pos_sale ps
    JOIN app.location loc ON loc.location_id = ps.location_id
    LEFT JOIN app.party customer ON customer.party_id = ps.customer_id
    LEFT JOIN sec.app_user u ON u.user_id = ps.created_by
    WHERE ps.pos_sale_id = $1;`,
    [saleId]
  );
  return result.rows[0] || null;
}

async function savePosPrice(productId, unitPrice, userId) {
  const result = await query(`
    INSERT INTO sal.pos_product_price(product_id, unit_price, is_active, created_by, updated_by, updated_at)
    VALUES ($1, $2, true, $3, $3, now())
    ON CONFLICT (product_id) DO UPDATE
      SET unit_price = EXCLUDED.unit_price,
          is_active = true,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
    RETURNING product_id, unit_price, is_active, created_at, updated_at;`,
    [productId, unitPrice, userId || null]
  );
  return result.rows[0];
}

router.get("/prices", requireAuth, requirePosFeature, requirePermission("VIEW_POS"), async (req, res) => {
  try {
    const search = String(req.query.q || "").trim();
    const result = await query(`
      SELECT p.product_id, p.sku, p.product_name, p.is_active AS product_active,
             p.is_saleable, pp.unit_price, COALESCE(pp.is_active, false) AS price_active,
             tc.tax_code_id, tc.code AS tax_code, tc.name AS tax_name, tc.treatment AS tax_treatment, tc.rate AS tax_rate,
             pp.created_at AS price_created_at, pp.updated_at AS price_updated_at
      FROM inv.product p
      LEFT JOIN sal.pos_product_price pp ON pp.product_id = p.product_id
      LEFT JOIN app.tax_code assigned_tc ON assigned_tc.tax_code_id=p.tax_code_id
      LEFT JOIN app.tax_code tc ON tc.company_id=assigned_tc.company_id AND tc.code=assigned_tc.code
        AND tc.is_active AND tc.effective_from <= current_date AND (tc.effective_to IS NULL OR tc.effective_to >= current_date)
      WHERE ($1 = '' OR p.sku ILIKE '%' || $1 || '%' OR p.product_name ILIKE '%' || $1 || '%')
      ORDER BY p.product_name LIMIT 500;`, [search]);
    return res.json({ success: true, count: result.rowCount, prices: result.rows, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load product prices.", error: error.message });
  }
});

router.get("/prices/:productId", requireAuth, requirePosFeature, requirePermission("VIEW_POS"), async (req, res) => {
  try {
    const result = await query(`
      SELECT p.product_id, p.sku, p.product_name, p.is_active AS product_active,
             p.is_saleable, pp.unit_price, COALESCE(pp.is_active, false) AS price_active,
             tc.tax_code_id, tc.code AS tax_code, tc.name AS tax_name, tc.treatment AS tax_treatment, tc.rate AS tax_rate,
             pp.created_at AS price_created_at, pp.updated_at AS price_updated_at
      FROM inv.product p LEFT JOIN sal.pos_product_price pp ON pp.product_id = p.product_id
      LEFT JOIN app.tax_code assigned_tc ON assigned_tc.tax_code_id=p.tax_code_id
      LEFT JOIN app.tax_code tc ON tc.company_id=assigned_tc.company_id AND tc.code=assigned_tc.code
        AND tc.is_active AND tc.effective_from <= current_date AND (tc.effective_to IS NULL OR tc.effective_to >= current_date)
      WHERE p.product_id = $1;`, [req.params.productId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Product not found." });
    return res.json({ success: true, data: result.rows[0], price: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load product price.", error: error.message });
  }
});

router.post("/prices", requireAuth, requirePosFeature, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const price = Number(req.body?.unit_price);
    if (!req.body?.product_id) return res.status(400).json({ success: false, message: "product_id is required." });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ success: false, message: "unit_price must be a non-negative number." });
    const data = await savePosPrice(req.body.product_id, price, req.user?.user_id);
    return res.status(201).json({ success: true, message: "POS price saved.", data, price: data });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Failed to save POS price.", error: error.message });
  }
});

router.get(
  "/products",
  requireAuth,
  requirePosFeature,
  requirePermission("VIEW_POS"),
  async (req, res) => {
    try {
      const search = String(req.query.q || "").trim();
      const resolved = await resolveLocationId(req.query.location_id || req.headers["x-location-id"] || null, req);
      const locationId = resolved.locationId;
      if (resolved.forbidden) return res.status(403).json({ success: false, message: "You are not allowed to operate at this saleable location." });
      if (!locationId) return res.status(409).json({ success: false, message: "Select an active saleable location before using POS." });

      const result = await query(`
        WITH stock AS (
          SELECT
            sml.product_id,
            SUM(CASE
              WHEN sml.to_location_id = $1 THEN sml.qty
              WHEN sml.from_location_id = $1 THEN -sml.qty
              ELSE 0
            END) AS qty_on_hand
          FROM inv.stock_movement_line sml
          JOIN inv.stock_movement sm ON sm.movement_id = sml.movement_id
          WHERE sml.from_location_id=$1 OR sml.to_location_id=$1
          GROUP BY sml.product_id
        )
    SELECT
          p.product_id,
          p.sku,
          p.product_name,
          p.product_type,
          p.uom_code,
          p.is_stock_item,
          p.track_lots,
          p.track_expiry,
          pp.unit_price,
          COALESCE(cp.pos_pricing_mode, 'FIXED') AS pricing_mode,
          tc.tax_code_id, tc.code AS tax_code, tc.name AS tax_name, tc.treatment AS tax_treatment, tc.rate AS tax_rate,
          COALESCE((SELECT json_agg(json_build_object('barcode_id', pb.barcode_id, 'barcode', pb.barcode, 'uom_code', pb.uom_code, 'qty_per_scan', pb.qty_per_scan) ORDER BY pb.barcode) FROM inv.product_barcode pb WHERE pb.product_id = p.product_id AND pb.is_active), '[]'::json) AS barcodes,
          COALESCE(stock.qty_on_hand, 0) AS qty_on_hand,
          COALESCE((
            SELECT json_agg(json_build_object(
              'lot_id', lots.lot_id,
              'lot_code', lots.lot_code,
              'expiry_date', lots.expiry_date,
              'qty_on_hand', lots.qty_on_hand
            ) ORDER BY lots.expiry_date NULLS LAST, lots.lot_code)
            FROM (
              SELECT soh.lot_id, l.lot_code, l.expiry_date, SUM(soh.qty_on_hand) AS qty_on_hand
              FROM inv.v_stock_on_hand_active soh
              JOIN inv.lot l ON l.lot_id = soh.lot_id
              WHERE soh.product_id = p.product_id
                AND soh.location_id = $1
                AND soh.qty_on_hand > 0
              GROUP BY soh.lot_id, l.lot_code, l.expiry_date
            ) lots
          ), '[]'::json) AS lots
        FROM inv.product p
        CROSS JOIN (SELECT pos_pricing_mode FROM app.company_profile WHERE is_active = true ORDER BY created_at, company_id LIMIT 1) cp
        LEFT JOIN sal.pos_product_price pp ON pp.product_id = p.product_id AND pp.is_active
        LEFT JOIN app.tax_code assigned_tc ON assigned_tc.tax_code_id=p.tax_code_id
        LEFT JOIN app.tax_code tc ON tc.company_id=assigned_tc.company_id AND tc.code=assigned_tc.code AND tc.is_active AND tc.effective_from <= current_date AND (tc.effective_to IS NULL OR tc.effective_to >= current_date)
        LEFT JOIN stock ON stock.product_id = p.product_id
          WHERE p.is_active = true
          AND p.is_saleable = true
          AND ($2 = '' OR p.sku ILIKE '%' || $2 || '%' OR p.product_name ILIKE '%' || $2 || '%' OR EXISTS (SELECT 1 FROM inv.product_barcode pb WHERE pb.product_id = p.product_id AND pb.is_active AND pb.barcode ILIKE '%' || $2 || '%'))
        ORDER BY p.product_name
        LIMIT 100;`,
        [locationId, search]
      );

      return res.json({ success: true, location_id: locationId, count: result.rowCount, products: result.rows, data: result.rows });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Failed to load POS products.", error: error.message });
    }
  }
);

router.put(
  "/prices/:productId",
  requireAuth,
  requirePosFeature,
  requirePermission("EDIT_SETUP"),
  async (req, res) => {
    try {
      const price = Number(req.body?.unit_price);
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ success: false, message: "unit_price must be a non-negative number." });
      const data = await savePosPrice(req.params.productId, price, req.user?.user_id);
      return res.json({ success: true, data, price: data });
    } catch (error) {
      return res.status(400).json({ success: false, message: "Failed to save POS price.", error: error.message });
    }
  }
);

router.patch("/prices/:productId", requireAuth, requirePosFeature, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const price = Number(req.body?.unit_price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ success: false, message: "unit_price must be a non-negative number." });
    const data = await savePosPrice(req.params.productId, price, req.user?.user_id);
    return res.json({ success: true, message: "POS price updated.", data, price: data });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Failed to update POS price.", error: error.message });
  }
});

router.delete("/prices/:productId", requireAuth, requirePosFeature, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const result = await query(`
      UPDATE sal.pos_product_price
      SET is_active = false, updated_by = $2, updated_at = now()
      WHERE product_id = $1
      RETURNING product_id, unit_price, is_active, updated_at;`,
      [req.params.productId, req.user?.user_id || null]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "POS price not found." });
    return res.json({ success: true, message: "POS price deactivated.", data: result.rows[0], price: result.rows[0] });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Failed to deactivate POS price.", error: error.message });
  }
});

router.get("/barcodes", requireAuth, requirePosFeature, requireBarcodeFeature, requirePermission("VIEW_POS"), async (req, res) => {
  try {
    const search = String(req.query.q || "").trim();
    const result = await query(`
      SELECT pb.barcode_id, pb.barcode, pb.product_id, pb.uom_code, pb.qty_per_scan, pb.is_active,
             p.sku, p.product_name
      FROM inv.product_barcode pb
      JOIN inv.product p ON p.product_id = pb.product_id
      WHERE ($1 = '' OR pb.barcode ILIKE '%' || $1 || '%' OR p.sku ILIKE '%' || $1 || '%' OR p.product_name ILIKE '%' || $1 || '%')
      ORDER BY p.product_name, pb.barcode;`, [search]);
    return res.json({ success: true, count: result.rowCount, barcodes: result.rows, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load product barcodes.", error: error.message });
  }
});

router.post("/barcodes", requireAuth, requirePosFeature, requireBarcodeFeature, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const barcode = String(req.body?.barcode || "").trim();
    const productId = req.body?.product_id;
    const qtyPerScan = Number(req.body?.qty_per_scan || 1);
    if (!productId || !barcode) return res.status(400).json({ success: false, message: "product_id and barcode are required." });
    if (!Number.isFinite(qtyPerScan) || qtyPerScan <= 0) return res.status(400).json({ success: false, message: "qty_per_scan must be greater than zero." });
    const result = await query(`INSERT INTO inv.product_barcode(product_id, barcode, uom_code, qty_per_scan) VALUES ($1, $2, $3, $4) RETURNING *;`, [productId, barcode, req.body?.uom_code || null, qtyPerScan]);
    return res.status(201).json({ success: true, message: "Barcode assigned.", data: result.rows[0], barcode: result.rows[0] });
  } catch (error) {
    return res.status(error.code === "23505" ? 409 : 400).json({ success: false, message: error.code === "23505" ? "Barcode is already assigned." : "Failed to assign barcode.", error: error.message });
  }
});

router.patch("/barcodes/:barcodeId", requireAuth, requirePosFeature, requireBarcodeFeature, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const barcode = String(req.body?.barcode || "").trim();
    const result = await query(`UPDATE inv.product_barcode SET barcode = COALESCE(NULLIF($2, ''), barcode), uom_code = COALESCE($3, uom_code), qty_per_scan = COALESCE($4, qty_per_scan), is_active = COALESCE($5, is_active), updated_at = now() WHERE barcode_id = $1 RETURNING *;`, [req.params.barcodeId, barcode, req.body?.uom_code ?? null, req.body?.qty_per_scan ? Number(req.body.qty_per_scan) : null, req.body?.is_active]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Barcode not found." });
    return res.json({ success: true, data: result.rows[0], barcode: result.rows[0] });
  } catch (error) {
    return res.status(error.code === "23505" ? 409 : 400).json({ success: false, message: error.code === "23505" ? "Barcode is already assigned." : "Failed to update barcode.", error: error.message });
  }
});

router.delete("/barcodes/:barcodeId", requireAuth, requirePosFeature, requireBarcodeFeature, requirePermission("EDIT_SETUP"), async (req, res) => {
  try {
    const result = await query("UPDATE inv.product_barcode SET is_active = false, updated_at = now() WHERE barcode_id = $1 RETURNING *;", [req.params.barcodeId]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Barcode not found." });
    return res.json({ success: true, data: result.rows[0], barcode: result.rows[0] });
  } catch (error) {
    return res.status(400).json({ success: false, message: "Failed to deactivate barcode.", error: error.message });
  }
});

router.post(
  "/sales",
  requireAuth,
  requirePosFeature,
  requirePermission("CREATE_POS_SALE"),
  async (req, res) => {
    const body = req.body || {};
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const saleOverrideReason = String(body.price_override_reason || "").trim();
    const method = normalizePaymentMethod(body.payment_method);
    const idempotencyKey = String(body.idempotency_key || "").trim();
    const externalReference = String(body.payment_reference || body.external_reference || "").trim();

    if (!lines.length) return res.status(400).json({ success: false, message: "At least one POS line is required." });
    if (!idempotencyKey) return res.status(400).json({ success: false, message: "idempotency_key is required." });
    if (!["CASH", "BANK", "BANK_TRANSFER", "MOBILE_MONEY", "CARD", "CREDIT"].includes(method)) return res.status(400).json({ success: false, message: "payment_method must be CASH, BANK_TRANSFER, MOBILE_MONEY, CARD, or CREDIT." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setDatabaseUserContext(client, req);

      const existing = await client.query("SELECT pos_sale_id FROM sal.pos_sale WHERE idempotency_key = $1 FOR UPDATE;", [idempotencyKey]);
      if (existing.rowCount) {
        await client.query("COMMIT");
        const sale = await loadSaleById(existing.rows[0].pos_sale_id);
        return res.status(200).json({ success: true, duplicate: true, message: "POS request already processed.", sale });
      }

      const resolved = await resolveLocationId(body.location_id || req.headers["x-location-id"] || null, req);
      const locationId = resolved.locationId;
      if (resolved.forbidden) {
        await client.query("ROLLBACK");
        return res.status(403).json({ success: false, message: "You are not allowed to operate at this saleable location." });
      }
      if (!locationId) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "An active POS location is required." });
      }

      let paymentChannel = null;
      const channelTypes = paymentChannelTypes(method);
      if (channelTypes.length && method !== "CREDIT") {
        const candidates = await client.query(`
          SELECT c.* FROM fin.api_payment_channel c
          WHERE c.api_payment_channel_id = COALESCE($1::uuid, c.api_payment_channel_id)
            AND c.channel_type = ANY($2::text[])
            AND c.status = 'ACTIVE' AND c.collection_enabled = true AND c.mode = 'MANUAL'
            AND (c.branch_id IS NULL OR c.branch_id = $3)
            AND (c.location_id IS NULL OR c.location_id = $4)
          ORDER BY c.channel_name;`, [body.payment_channel_id || null, channelTypes, req.branchId, locationId]);
        if (body.payment_channel_id && !candidates.rowCount) {
          await client.query("ROLLBACK");
          return res.status(403).json({ success: false, message: "Selected payment channel is inactive, not enabled for collection, or outside this branch/location." });
        }
        if (candidates.rowCount === 1) paymentChannel = candidates.rows[0];
        if (candidates.rowCount > 1 && body.payment_channel_id) paymentChannel = candidates.rows[0];
        if (paymentChannel && method !== "CASH" && !externalReference) {
          await client.query("ROLLBACK");
          return res.status(400).json({ success: false, message: "A manual external payment reference is required." });
        }
      }

      const customerId = body.customer_id || null;
      if (method === "CREDIT" && !customerId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Customer is required for CREDIT POS sales; walk-in credit is not permitted." });
      }
      if (customerId) {
        const customer = await client.query("SELECT 1 FROM app.party WHERE party_id = $1 AND party_type IN ('CUSTOMER', 'BOTH') AND is_active = true;", [customerId]);
        if (!customer.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({ success: false, message: "Selected customer is not an active customer." });
        }
      }

      const productIds = lines.map((line) => line.product_id);
      const pricingMode = await getPricingMode();
      const taxConfig = await client.query(`SELECT cp.tax_engine_enabled AND COALESCE(cf.is_enabled,false) AS tax_enabled,
        COALESCE(cp.tax_pricing_mode,'TAX_EXCLUSIVE') AS tax_pricing_mode
        FROM app.company_profile cp LEFT JOIN app.company_feature cf ON cf.company_id=cp.company_id AND cf.feature_code='tax_engine'
        WHERE cp.is_active ORDER BY cp.created_at,cp.company_id LIMIT 1`);
      const taxEnabled = Boolean(taxConfig.rows[0]?.tax_enabled);
      const taxPricingMode = taxConfig.rows[0]?.tax_pricing_mode || "TAX_EXCLUSIVE";
      const products = await client.query(`
        SELECT p.product_id, p.product_name, p.is_active, p.is_saleable, p.is_stock_item, p.track_lots,
               pp.unit_price, tc.tax_code_id, tc.code AS tax_code, tc.treatment AS tax_treatment, tc.rate AS tax_rate
        FROM inv.product p
        LEFT JOIN sal.pos_product_price pp ON pp.product_id = p.product_id AND pp.is_active
        LEFT JOIN app.tax_code assigned_tc ON assigned_tc.tax_code_id = p.tax_code_id
        LEFT JOIN app.tax_code tc ON tc.company_id=assigned_tc.company_id AND tc.code=assigned_tc.code AND tc.is_active AND tc.effective_from <= current_date AND (tc.effective_to IS NULL OR tc.effective_to >= current_date)
        WHERE p.product_id = ANY($1::uuid[]);`, [productIds]);
      const productMap = new Map(products.rows.map((row) => [row.product_id, row]));
      const seen = new Set();
      let subtotal = 0;
      const taxLines = [];
      for (const line of lines) {
        const product = productMap.get(line.product_id);
        const qty = Number(line.qty);
        const key = `${line.product_id}:${line.lot_id || ""}`;
        if (seen.has(key)) throw new Error("Duplicate POS product/lot lines are not allowed.");
        seen.add(key);
        if (!product || !product.is_active || !product.is_saleable) throw new Error("Product is not active and saleable.");
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Invalid quantity for ${product.product_name}.`);
        const configuredPrice = product.unit_price === null || product.unit_price === undefined ? null : Number(product.unit_price);
        const submittedPrice = line.unit_price === undefined || line.unit_price === null || line.unit_price === "" ? null : Number(line.unit_price);
        let unitPrice = configuredPrice;
        let priceSource = "CONFIGURED";
        if (pricingMode === "MANUAL") {
          if (!hasAction(req, "ENTER_POS_PRICE")) throw new Error("You do not have permission to enter POS prices.");
          if (!Number.isFinite(submittedPrice) || submittedPrice < 0) throw new Error(`A valid selling price is required for ${product.product_name}.`);
          unitPrice = submittedPrice;
          priceSource = "MANUAL";
        } else if (pricingMode === "FIXED" && submittedPrice !== null && configuredPrice !== null && submittedPrice !== configuredPrice) {
          throw new Error(`Submitted price does not match the configured POS price for ${product.product_name}.`);
        } else if (pricingMode === "HYBRID" && submittedPrice !== null && configuredPrice !== null && submittedPrice !== configuredPrice) {
          if (!hasAction(req, "OVERRIDE_POS_PRICE")) throw new Error("You do not have permission to override POS prices.");
          const overrideReason = String(line.price_override_reason || saleOverrideReason).trim();
          if (!overrideReason) throw new Error(`An override reason is required for ${product.product_name}.`);
          unitPrice = submittedPrice;
          priceSource = "OVERRIDE";
          line._overrideReason = overrideReason;
        } else if (pricingMode === "HYBRID" && submittedPrice !== null && configuredPrice === null) {
          if (!hasAction(req, "ENTER_POS_PRICE")) throw new Error("You do not have permission to enter POS prices.");
          unitPrice = submittedPrice;
          priceSource = "MANUAL";
        } else if (pricingMode === "FIXED" && configuredPrice === null) {
          throw new Error(`No active POS price is configured for ${product.product_name}.`);
        }
        if (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`No valid POS price is configured for ${product.product_name}.`);
        if (taxEnabled && !product.tax_code_id) throw new Error(`Product ${product.product_name} lacks tax configuration.`);
        if (product.track_lots && !line.lot_id) throw new Error(`A lot is required for ${product.product_name}.`);
        line._unitPrice = unitPrice;
        line._priceSource = priceSource;
        line._referencePrice = configuredPrice;
        line._tax = taxEnabled ? calculateTaxLine({ amount: (qty * unitPrice).toFixed(2), rate: product.tax_rate || 0, treatment: product.tax_treatment || "OUT_OF_SCOPE", pricingMode: taxPricingMode }) : { taxableAmount: (qty * unitPrice).toFixed(2), taxAmount: "0.00", grossAmount: (qty * unitPrice).toFixed(2) };
        line._tax.tax_code_id = product.tax_code_id || null;
        line._tax.tax_code = product.tax_code || null;
        line._tax.tax_treatment = product.tax_treatment || null;
        line._tax.tax_rate = product.tax_rate || 0;
        taxLines.push(line._tax);
        subtotal += Number(line._tax.grossAmount);
      }
      subtotal = Number(subtotal.toFixed(2));
      const taxTotals = calculateDocumentTotals(taxLines);
      const tendered = body.amount_tendered === null || body.amount_tendered === undefined || body.amount_tendered === ""
        ? (method === "CASH" ? null : method === "CREDIT" ? null : subtotal)
        : Number(body.amount_tendered);
      if (method === "CASH" && (!Number.isFinite(tendered) || tendered < subtotal)) throw new Error("Cash tendered cannot be less than the sale total.");

      const saleResult = await client.query(`
        INSERT INTO sal.pos_sale (
          sale_no, transaction_date, location_id, customer_id, payment_method,
          amount_tendered, change_amount, subtotal, total_amount, taxable_subtotal, tax_total, tax_snapshot_at, status,
          idempotency_key, created_by, due_date
        )
        VALUES (sal.next_pos_sale_no(), current_date, $1, $2, $3, $4, $5, $6, $6, $10, $11, now(), 'DRAFT', $7, $8, $9)
        RETURNING pos_sale_id, sale_no;`,
        [locationId, customerId, method, tendered, method === "CASH" ? Number((tendered - subtotal).toFixed(2)) : 0, subtotal, idempotencyKey, req.user?.user_id || null, method === "CREDIT" ? (body.due_date || null) : null, taxTotals.taxableAmount, taxTotals.taxAmount]
      );
      const saleId = saleResult.rows[0].pos_sale_id;
      if (paymentChannel) {
        const transaction = await client.query(`
          INSERT INTO app.payment_transaction(
            company_id, branch_id, location_id, channel_id, document_type, document_id,
            internal_reference, provider_reference, amount, currency_code, status,
            confirmation_mode, initiated_by, confirmed_by, confirmed_at, idempotency_key
          )
          SELECT cp.company_id, $2, $3, $4, 'POS_SALE', $5, $6, $7, $8,
                 COALESCE(NULLIF($9, ''), cp.currency_code, 'UGX'), 'CONFIRMED', 'MANUAL',
                 $10, $10, now(), $11
          FROM app.company_profile cp WHERE cp.is_active
          ORDER BY cp.created_at, cp.company_id LIMIT 1
          RETURNING *;`, [
            null, req.branchId, locationId, paymentChannel.api_payment_channel_id, saleId,
            saleResult.rows[0].sale_no, externalReference || null, subtotal,
            paymentChannel.currency_code || "UGX", req.user?.user_id || null, `${idempotencyKey}:payment`
          ]);
        await client.query("INSERT INTO app.payment_transaction_event(payment_transaction_id,new_status,event_type,actor_user_id,event_metadata) VALUES($1,'CONFIRMED','MANUAL_CONFIRMATION',$2,$3)", [transaction.rows[0].payment_transaction_id, req.user?.user_id || null, JSON.stringify({ provider_reference: externalReference || null })]);
      }
      for (const line of lines) {
        const product = productMap.get(line.product_id);
        const qty = Number(line.qty);
        const unitPrice = Number(line._unitPrice);
        await client.query(`
          INSERT INTO sal.pos_sale_line(pos_sale_id, product_id, qty, unit_price, line_total, lot_id, reference_price, price_source, price_override_reason,
            tax_code_id, tax_code, tax_treatment, tax_rate, taxable_amount, tax_amount, gross_amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16);`,
          [saleId, line.product_id, qty, unitPrice, Number(line._tax.grossAmount), line.lot_id || null, line._referencePrice, line._priceSource, line._overrideReason || null,
            line._tax.tax_code_id, line._tax.tax_code, line._tax.tax_treatment, line._tax.tax_rate, line._tax.taxableAmount, line._tax.taxAmount, line._tax.grossAmount]
        );
      }
      await client.query("SELECT sal.post_pos_sale($1::uuid);", [saleId]);
      if (taxEnabled && Number(taxTotals.taxAmount) > 0) {
        const account = await client.query("SELECT output_vat_account_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1");
        if (!account.rows[0]?.output_vat_account_id) throw new Error("Output VAT Payable account is not configured.");
        const journal = await client.query("SELECT ps.posted_journal_id,ps.sale_no FROM sal.pos_sale ps WHERE ps.pos_sale_id=$1", [saleId]);
        await client.query("UPDATE fin.gl_journal_line SET credit=$2, debit=0 WHERE journal_id=$1 AND memo=$3", [journal.rows[0].posted_journal_id, taxTotals.taxableAmount, `POS revenue ${journal.rows[0].sale_no}`]);
        await client.query("INSERT INTO fin.gl_journal_line(journal_id,account_id,party_id,memo,debit,credit) VALUES($1,$2,NULL,$3,0,$4)", [journal.rows[0].posted_journal_id, account.rows[0].output_vat_account_id, `POS output VAT ${journal.rows[0].sale_no}`, taxTotals.taxAmount]);
        await client.query("SELECT fin.assert_balanced($1::uuid)", [journal.rows[0].posted_journal_id]);
      }
      if (taxEnabled) {
        await client.query(`UPDATE sal.ar_invoice ai SET taxable_subtotal=ps.taxable_subtotal,tax_total=ps.tax_total,gross_total=ps.total_amount,tax_snapshot_at=ps.tax_snapshot_at
          FROM sal.pos_sale ps WHERE ai.ar_invoice_id=ps.credit_ar_invoice_id AND ps.pos_sale_id=$1`, [saleId]);
        await client.query(`UPDATE sal.ar_invoice_line al SET tax_code_id=pl.tax_code_id,tax_code=pl.tax_code,tax_treatment=pl.tax_treatment,tax_rate=pl.tax_rate,taxable_amount=pl.taxable_amount,tax_amount=pl.tax_amount,gross_amount=pl.gross_amount
          FROM sal.pos_sale ps JOIN sal.pos_sale_line pl ON pl.pos_sale_id=ps.pos_sale_id WHERE al.ar_invoice_id=ps.credit_ar_invoice_id AND al.product_id=pl.product_id AND ps.pos_sale_id=$1`, [saleId]);
      }
      await queueEfrisPosSale(client, saleId, req.user?.user_id || null);
      await client.query("COMMIT");
      const sale = await loadSaleById(saleId);
      return res.status(201).json({ success: true, message: "POS sale completed.", sale, receipt: sale });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error.code === "23505" && idempotencyKey) return res.status(200).json({ success: true, duplicate: true, message: "POS request already processed." });
      return res.status(400).json({ success: false, message: error.message || "Failed to complete POS sale.", error: error.message });
    } finally {
      client.release();
    }
  }
);

router.get("/sales/by-no/:saleNo", requireAuth, requirePosFeature, requirePermission("VIEW_POS"), async (req, res) => {
  try {
    const result = await query("SELECT pos_sale_id FROM sal.pos_sale WHERE sale_no = $1;", [req.params.saleNo]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "POS sale not found." });
    const sale = await loadSaleById(result.rows[0].pos_sale_id);
    return res.json({ success: true, sale, data: sale, receipt: sale });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load POS sale.", error: error.message });
  }
});

router.get("/sales/:saleId", requireAuth, requirePosFeature, requirePermission("VIEW_POS"), async (req, res) => {
  try {
    const sale = await loadSaleById(req.params.saleId);
    if (!sale) return res.status(404).json({ success: false, message: "POS sale not found." });
    return res.json({ success: true, sale, data: sale, receipt: sale });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load POS sale.", error: error.message });
  }
});

router.post("/sales/:saleId/void", requireAuth, requirePosFeature, requirePermission("VOID_POS_SALE"), async (req, res) => {
  const client = await pool.connect();
  try {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ success: false, message: "A void reason is required." });
    await client.query("BEGIN");
    await setDatabaseUserContext(client, req);
    await client.query("SELECT sal.void_pos_sale($1::uuid, $2::text);", [req.params.saleId, reason]);
    await client.query("COMMIT");
    const sale = await loadSaleById(req.params.saleId);
    return res.json({ success: true, message: "POS sale voided with reversal entries.", sale, data: sale });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(400).json({ success: false, message: error.message || "Failed to void POS sale.", error: error.message });
  } finally {
    client.release();
  }
});

export default router;
