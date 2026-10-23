import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserRoles, requirePermission } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

const router = express.Router();
router.use(requireAuth, requireLocationAccessWhenSpecified, requirePermission("VIEW_POS"));
router.use((req, res, next) => {
  if (req.query.from && req.query.to && String(req.query.from) > String(req.query.to)) {
    return res.status(400).json({ success: false, message: "Date From cannot be after Date To." });
  }
  next();
});
const allBranches = (req) => getUserRoles(req).includes("HEAD_OFFICE");
const allLocations = (req) => getUserRoles(req).some((role) => ["ADMIN", "MANAGER", "AUDITOR", "HEAD_OFFICE"].includes(role));

function addScope(req, values, filters, alias = "ps") {
  values.push(req.branchId, allBranches(req), req.user?.user_id, allLocations(req));
  filters.push(`(loc.branch_id=$${values.length - 3} OR $${values.length - 2}::boolean)`);
  filters.push(`($${values.length}::boolean OR EXISTS (SELECT 1 FROM sec.user_location ul WHERE ul.user_id=$${values.length - 1} AND ul.location_id=${alias}.location_id AND ul.is_active))`);
}

const baseFrom = `FROM sal.pos_sale ps JOIN app.location loc ON loc.location_id=ps.location_id JOIN app.branch b ON b.branch_id=loc.branch_id LEFT JOIN app.party c ON c.party_id=ps.customer_id LEFT JOIN sec.app_user cashier ON cashier.user_id=ps.created_by LEFT JOIN app.cashier_session cs ON cs.session_id=ps.session_id LEFT JOIN app.till t ON t.till_id=ps.till_id`;
const returnState = `CASE WHEN COALESCE(ret.returned_qty,0)=0 THEN 'NONE' WHEN COALESCE(ret.returned_qty,0) >= COALESCE((SELECT SUM(l.qty) FROM sal.pos_sale_line l WHERE l.pos_sale_id=ps.pos_sale_id),0) THEN 'FULL' ELSE 'PARTIAL' END`;
const refundState = `CASE WHEN COALESCE(ret.return_count,0)=0 THEN 'NONE' WHEN COALESCE(ret.refund_settled,0) >= COALESCE(ret.refund_due,0) THEN 'SETTLED' WHEN COALESCE(ret.refund_settled,0)>0 THEN 'PARTIAL' ELSE 'DUE' END`;
const returnsJoin = `LEFT JOIN LATERAL (SELECT COALESCE(SUM(crl.qty_returned),0) AS returned_qty, COUNT(DISTINCT cr.customer_return_id)::int AS return_count, COALESCE(SUM(cr.refund_due_amount),0) AS refund_due, COALESCE(SUM(cr.refund_settled_amount),0) AS refund_settled, COALESCE(SUM(crl.returned_taxable_amount),0) AS return_net, COALESCE(SUM(crl.returned_tax_amount),0) AS return_vat FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id=cr.customer_return_id WHERE cr.status='POSTED' AND cr.source_type='POS' AND cr.source_id=ps.pos_sale_id) ret ON true`;

function filters(req, values) {
  const result = ["ps.status <> 'DRAFT'"];
  addScope(req, values, result);
  const add = (value) => { values.push(value); return `$${values.length}`; };
  if (req.query.from) result.push(`ps.transaction_date >= ${add(req.query.from)}::date`);
  if (req.query.to) result.push(`ps.transaction_date < (${add(req.query.to)}::date + 1)`);
  if (req.query.location_id) result.push(`ps.location_id=${add(req.query.location_id)}`);
  if (req.query.customer_id) result.push(`ps.customer_id=${add(req.query.customer_id)}`);
  if (req.query.cashier_id) result.push(`ps.created_by=${add(req.query.cashier_id)}`);
  if (req.query.payment_method) result.push(`ps.payment_method=${add(String(req.query.payment_method).toUpperCase())}`);
  if (req.query.status) result.push(`ps.status=${add(String(req.query.status).toUpperCase())}`);
  if (req.query.return_status) result.push(`(${returnState})=${add(String(req.query.return_status).toUpperCase())}`);
  if (req.query.refund_status) result.push(`(${refundState})=${add(String(req.query.refund_status).toUpperCase())}`);
  if (req.query.search) { const p = add(`%${String(req.query.search).trim()}%`); result.push(`(ps.sale_no ILIKE ${p} OR c.party_name ILIKE ${p} OR cashier.full_name ILIKE ${p})`); }
  return result;
}

router.get("/", async (req, res) => {
  try {
    const values = [], where = filters(req, values), limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200), offset = Math.max(Number(req.query.offset || 0), 0);
    values.push(limit, offset);
    const result = await query(`SELECT ps.pos_sale_id,ps.sale_no,ps.sale_ts,ps.transaction_date,COALESCE(c.party_name,'Walk-in') AS customer_name,b.branch_name,b.branch_code,loc.location_name,loc.location_code,cashier.full_name AS cashier_name,t.till_code,cs.session_no,ps.payment_method,ps.status,ps.taxable_subtotal AS net_amount,ps.tax_total AS vat_amount,ps.total_amount AS gross_amount,ps.amount_tendered,ps.change_amount,ps.posted_journal_id,ps.posted_movement_id,${returnState} AS return_status,${refundState} AS refund_status,COALESCE(ret.returned_qty,0) AS returned_qty,COALESCE(ret.refund_due,0) AS refund_due,COALESCE(ret.refund_settled,0) AS refund_settled,COUNT(*) OVER()::int AS total_count ${baseFrom} ${returnsJoin} WHERE ${where.join(" AND ")} ORDER BY ps.sale_ts DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return res.json({ success: true, sales: result.rows, data: result.rows, total: result.rows[0]?.total_count || 0, limit, offset });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load POS sales.", error: error.message }); }
});

router.get("/summary", async (req, res) => {
  try {
    const values = [], where = filters(req, values);
    const result = await query(`SELECT COALESCE(SUM(ps.total_amount),0) AS gross_sales,COALESCE(SUM(ps.taxable_subtotal),0) AS net_sales,COALESCE(SUM(ps.tax_total),0) AS vat,COUNT(*)::int AS transactions,COALESCE(SUM((SELECT SUM(l.qty) FROM sal.pos_sale_line l WHERE l.pos_sale_id=ps.pos_sale_id)),0) AS quantity_sold,COUNT(*) FILTER(WHERE ps.customer_id IS NULL OR lower(COALESCE(c.party_name,'')) LIKE 'walk-in%')::int AS walk_in_transactions,COUNT(*) FILTER(WHERE ps.customer_id IS NOT NULL AND lower(COALESCE(c.party_name,'')) NOT LIKE 'walk-in%')::int AS named_customer_transactions,COALESCE(SUM(ps.total_amount) FILTER(WHERE ps.payment_method='CASH'),0) AS cash,COALESCE(SUM(ps.total_amount) FILTER(WHERE ps.payment_method='MOBILE_MONEY'),0) AS mobile_money,COALESCE(SUM(ps.total_amount) FILTER(WHERE ps.payment_method='CARD'),0) AS card,COALESCE(SUM(ps.total_amount) FILTER(WHERE ps.payment_method='BANK_TRANSFER'),0) AS bank_transfer,COALESCE(SUM(ps.total_amount) FILTER(WHERE ps.payment_method='CREDIT'),0) AS credit,COALESCE(SUM(ret.return_net),0) AS return_net_value,COALESCE(SUM(ret.return_vat),0) AS return_vat,COALESCE(SUM(ret.refund_due),0) AS refund_due,COALESCE(SUM(ret.refund_settled),0) AS refund_settled,COALESCE(SUM(ps.total_amount),0)-COALESCE(SUM(ret.return_net+ret.return_vat),0) AS net_after_returns ${baseFrom} ${returnsJoin} WHERE ${where.join(" AND ")}`, values);
    return res.json({ success: true, summary: result.rows[0] || {} });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load POS sales summary.", error: error.message }); }
});

const scopedSales = (where) => `WITH scoped_sales AS (SELECT ps.*,COALESCE(c.party_name,'Walk-in') AS customer_name,cashier.full_name AS cashier_name,ret.returned_qty,ret.return_count,ret.refund_due,ret.refund_settled,ret.return_net,ret.return_vat ${baseFrom} ${returnsJoin} WHERE ${where.join(" AND ")})`;

router.get("/by-product", async (req, res) => {
  try {
    const values = [], where = filters(req, values);
    const result = await query(`${scopedSales(where)}, returned AS (SELECT crl.source_line_id, SUM(crl.qty_returned) returned_qty, SUM(crl.returned_taxable_amount) return_net, SUM(crl.returned_tax_amount) return_vat, SUM(crl.returned_gross_amount) refund_gross FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id=cr.customer_return_id WHERE cr.status='POSTED' AND cr.source_type='POS' GROUP BY crl.source_line_id) SELECT p.sku,p.product_name,COALESCE(SUM(l.qty),0) qty_sold,COALESCE(SUM(l.taxable_amount),0) net_sales,COALESCE(SUM(l.tax_amount),0) vat,COALESCE(SUM(l.gross_amount),0) gross_sales,COALESCE(SUM(r.returned_qty),0) returned_qty,COALESCE(SUM(r.return_net),0) return_net,COALESCE(SUM(r.refund_gross),0) refund_gross,COALESCE(SUM(l.qty),0)-COALESCE(SUM(r.returned_qty),0) net_qty FROM scoped_sales s JOIN sal.pos_sale_line l ON l.pos_sale_id=s.pos_sale_id JOIN inv.product p ON p.product_id=l.product_id LEFT JOIN returned r ON r.source_line_id=l.pos_sale_line_id GROUP BY p.product_id,p.sku,p.product_name ORDER BY p.product_name`, values);
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error("POS by-product report failed:", error); res.status(500).json({ success: false, message: "Failed to load POS sales by product report." }); }
});

router.get("/by-customer", async (req, res) => {
  try {
    const values = [], where = filters(req, values);
    const result = await query(`${scopedSales(where)} SELECT COALESCE(customer_name,'Walk-in') AS customer,COUNT(*)::int transactions,COALESCE(SUM((SELECT SUM(l.qty) FROM sal.pos_sale_line l WHERE l.pos_sale_id=s.pos_sale_id)),0) qty,COALESCE(SUM(taxable_subtotal),0) net,COALESCE(SUM(tax_total),0) vat,COALESCE(SUM(total_amount),0) gross,COALESCE(SUM(s.return_net+s.return_vat),0) returned_value,COALESCE(SUM(s.refund_settled),0) refunded FROM scoped_sales s GROUP BY COALESCE(customer_name,'Walk-in') ORDER BY gross DESC`, values);
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error("POS by-customer report failed:", error); res.status(500).json({ success: false, message: "Failed to load POS sales by customer report." }); }
});

router.get("/by-cashier", async (req, res) => {
  try {
    const values = [], where = filters(req, values);
    const result = await query(`${scopedSales(where)} SELECT COALESCE(cashier_name,'Unknown') cashier,COUNT(*)::int transactions,COALESCE(SUM((SELECT SUM(l.qty) FROM sal.pos_sale_line l WHERE l.pos_sale_id=s.pos_sale_id)),0) qty,COALESCE(SUM(taxable_subtotal),0) net,COALESCE(SUM(tax_total),0) vat,COALESCE(SUM(total_amount),0) gross,COALESCE(SUM(s.return_net+s.return_vat),0) returns,COALESCE(SUM(s.refund_settled),0) refunds FROM scoped_sales s GROUP BY COALESCE(cashier_name,'Unknown') ORDER BY gross DESC`, values);
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error("POS by-cashier report failed:", error); res.status(500).json({ success: false, message: "Failed to load POS sales by cashier report." }); }
});

router.get("/by-payment", async (req, res) => {
  try {
    const values = [], where = filters(req, values);
    const result = await query(`${scopedSales(where)} SELECT payment_method,COUNT(*)::int transactions,COALESCE(SUM(total_amount),0) gross_amount,COALESCE(SUM(s.refund_settled),0) refunded,COALESCE(SUM(total_amount),0)-COALESCE(SUM(s.refund_settled),0) net_collected FROM scoped_sales s GROUP BY payment_method ORDER BY gross_amount DESC`, values);
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error("POS by-payment report failed:", error); res.status(500).json({ success: false, message: "Failed to load POS sales by payment method report." }); }
});

router.get("/returns", async (req, res) => {
  try {
    const values = [], where = filters(req, values);
    const result = await query(`${scopedSales(where)} SELECT cr.return_no,s.sale_no,cr.transaction_date,COALESCE(s.customer_name,'Walk-in') customer,COALESCE(s.cashier_name,'Unknown') cashier,COALESCE(SUM(crl.qty_returned),0) qty,COALESCE(SUM(crl.returned_taxable_amount),0) return_net,COALESCE(SUM(crl.returned_tax_amount),0) vat_reversal,COALESCE(cr.refund_due_amount,0) refund_due,COALESCE(cr.refund_settled_amount,0) refund_settled,COALESCE(cr.refund_due_amount,0)-COALESCE(cr.refund_settled_amount,0) refund_remaining,cr.refund_status FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id=cr.customer_return_id JOIN scoped_sales s ON s.pos_sale_id=cr.source_id WHERE cr.status='POSTED' AND cr.source_type='POS' GROUP BY cr.customer_return_id,cr.return_no,s.sale_no,cr.transaction_date,s.customer_name,s.cashier_name,cr.refund_due_amount,cr.refund_settled_amount,cr.refund_status ORDER BY cr.transaction_date DESC`, values);
    res.json({ success: true, data: result.rows });
  } catch (error) { console.error("POS returns report failed:", error); res.status(500).json({ success: false, message: "Failed to load POS returns and refunds report." }); }
});

router.get("/:saleNo", async (req, res) => {
  try {
    const values = [req.params.saleNo], where = [];
    addScope(req, values, where);
    const header = await query(`SELECT ps.*,COALESCE(c.party_name,'Walk-in') AS customer_name,b.branch_name,b.branch_code,loc.location_name,loc.location_code,cashier.full_name AS cashier_name,cs.session_no,t.till_code,${returnState} AS return_status,${refundState} AS refund_status ${baseFrom} ${returnsJoin} WHERE ps.sale_no=$1 AND ${where.join(" AND ")}`, values);
    if (!header.rowCount) return res.status(404).json({ success: false, message: "POS sale not found." });
    const id = header.rows[0].pos_sale_id;
    const lines = await query("SELECT l.pos_sale_line_id,l.product_id,p.product_name,p.sku,p.uom_code,lot.lot_code,l.qty,l.unit_price,l.line_total,l.taxable_amount,l.tax_amount,l.gross_amount,l.tax_rate,l.tax_treatment FROM sal.pos_sale_line l JOIN inv.product p ON p.product_id=l.product_id LEFT JOIN inv.lot lot ON lot.lot_id=l.lot_id WHERE l.pos_sale_id=$1 ORDER BY l.created_at,l.pos_sale_line_id", [id]);
    const returns = await query("SELECT cr.customer_return_id,cr.return_no,cr.transaction_date,cr.status,cr.refund_status,COALESCE(cr.refund_due_amount,0) AS refund_due_amount,COALESCE(cr.refund_settled_amount,0) AS refund_settled_amount,COALESCE(SUM(crl.qty_returned*crl.original_unit_price),0) AS return_value FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id=cr.customer_return_id WHERE cr.source_type='POS' AND cr.source_id=$1 GROUP BY cr.customer_return_id ORDER BY cr.transaction_date", [id]);
    return res.json({ success: true, sale: header.rows[0], lines: lines.rows, returns: returns.rows });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to load POS sale.", error: error.message }); }
});

export default router;
