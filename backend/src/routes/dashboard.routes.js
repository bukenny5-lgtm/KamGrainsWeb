import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireLocationAccessWhenSpecified } from "../middleware/locationAccess.js";

const router = express.Router();
router.use(requireAuth, requireLocationAccessWhenSpecified);

async function safeQuery(sql, params) {
  const result = await query(sql, params);
  return result.rows;
}

/** GET /api/dashboard/summary */
router.get("/summary", requirePermission("VIEW_ONLY"), async (req, res) => {
  const branchId = req.branchId;
  // The context middleware prefers the branch header. Reject contradictory
  // query/header values instead of silently showing data for a different branch.
  if (req.query.branch_id && String(req.query.branch_id) !== String(branchId)) {
    return res.status(403).json({ success: false, message: "Requested dashboard branch does not match the authorized active branch." });
  }

  try {
    const [
      stockRows,
      stockByProductRows,
      salesRows,
      arRows,
      apRows,
      financeCoverageRows,
      cashRows,
      profitRows,
      cleaningRows,
      purchaseRows,
      grnRows,
      deliveryRows,
      recentMovementRows,
      recentInvoiceRows,
      recentReceiptRows,
      alertRows,
    ] = await Promise.all([
      safeQuery(`
        SELECT COUNT(DISTINCT soh.product_id) AS product_count,
               COUNT(DISTINCT soh.lot_id) AS lot_count,
               COUNT(DISTINCT soh.location_id) AS location_count,
               COALESCE(SUM(soh.qty_on_hand),0) AS total_stock_qty
        FROM inv.v_stock_on_hand soh
        JOIN app.location loc ON loc.location_id=soh.location_id
        WHERE loc.branch_id=$1 AND loc.is_active AND loc.is_stock_holding AND loc.is_saleable;
      `, [branchId]),

      safeQuery(`
        SELECT soh.product_id,soh.sku,soh.product_name,
               COALESCE(SUM(soh.qty_on_hand),0) AS qty_on_hand,
               COUNT(DISTINCT soh.lot_id) AS lot_count,
               COUNT(DISTINCT soh.location_id) AS location_count
        FROM inv.v_stock_on_hand soh
        JOIN app.location loc ON loc.location_id=soh.location_id
        WHERE loc.branch_id=$1 AND loc.is_active AND loc.is_stock_holding AND loc.is_saleable
        GROUP BY soh.product_id,soh.sku,soh.product_name
        ORDER BY soh.product_name
        LIMIT 12;
      `, [branchId]),

      safeQuery(`
        SELECT COALESCE(SUM(COALESCE(ail.sell_qty,ail.qty,ail.base_qty,0)*COALESCE(ail.unit_price,0)),0) AS total_sales,
               COUNT(DISTINCT ai.ar_invoice_id) AS posted_invoice_count
        FROM sal.ar_invoice ai
        JOIN sal.ar_invoice_line ail ON ail.ar_invoice_id=ai.ar_invoice_id
        LEFT JOIN sal.delivery d ON d.delivery_id=ai.delivery_id
        LEFT JOIN sal.pos_sale ps ON ps.credit_ar_invoice_id=ai.ar_invoice_id
        JOIN app.location loc ON loc.location_id=COALESCE(d.location_id,ps.location_id)
        WHERE ai.posted_journal_id IS NOT NULL AND loc.branch_id=$1 AND loc.is_active;
      `, [branchId]),

      safeQuery(`
        WITH scoped_invoices AS (
          SELECT ai.ar_invoice_id
          FROM sal.ar_invoice ai
          LEFT JOIN sal.delivery d ON d.delivery_id=ai.delivery_id
          LEFT JOIN sal.pos_sale ps ON ps.credit_ar_invoice_id=ai.ar_invoice_id
          JOIN app.location loc ON loc.location_id=COALESCE(d.location_id,ps.location_id)
          WHERE loc.branch_id=$1 AND loc.is_active
        ), invoice_totals AS (
          SELECT ai.ar_invoice_id,
                 COALESCE(SUM(COALESCE(ail.sell_qty,ail.qty,ail.base_qty,0)*COALESCE(ail.unit_price,0)),0) AS invoice_total
          FROM scoped_invoices si
          JOIN sal.ar_invoice ai ON ai.ar_invoice_id=si.ar_invoice_id
          LEFT JOIN sal.ar_invoice_line ail ON ail.ar_invoice_id=ai.ar_invoice_id
          GROUP BY ai.ar_invoice_id
        ), paid_totals AS (
          SELECT pa.ar_invoice_id,COALESCE(SUM(pa.amount),0) AS amount_paid
          FROM sal.ar_payment_apply pa
          JOIN scoped_invoices si ON si.ar_invoice_id=pa.ar_invoice_id
          GROUP BY pa.ar_invoice_id
        )
        SELECT COALESCE(SUM(it.invoice_total),0) AS total_ar_invoiced,
               COALESCE(SUM(COALESCE(pt.amount_paid,0)),0) AS total_ar_paid,
               COALESCE(SUM(it.invoice_total-COALESCE(pt.amount_paid,0)),0) AS ar_balance,
               COUNT(*) FILTER(WHERE it.invoice_total-COALESCE(pt.amount_paid,0)>0) AS open_invoice_count
        FROM invoice_totals it LEFT JOIN paid_totals pt ON pt.ar_invoice_id=it.ar_invoice_id;
      `, [branchId]),

      safeQuery(`
        WITH scoped_invoices AS (
          SELECT api.ap_invoice_id
          FROM pur.ap_invoice api
          JOIN pur.goods_receipt gr ON gr.grn_id=api.grn_id
          JOIN app.location loc ON loc.location_id=gr.location_id
          WHERE loc.branch_id=$1 AND loc.is_active
        ), invoice_totals AS (
          SELECT api.ap_invoice_id,COALESCE(SUM(apil.qty*apil.unit_price),0) AS invoice_total
          FROM scoped_invoices si JOIN pur.ap_invoice api ON api.ap_invoice_id=si.ap_invoice_id
          LEFT JOIN pur.ap_invoice_line apil ON apil.ap_invoice_id=api.ap_invoice_id
          GROUP BY api.ap_invoice_id
        ), paid_totals AS (
          SELECT apa.ap_invoice_id,COALESCE(SUM(apa.amount),0) AS amount_paid
          FROM pur.ap_payment_apply apa
          JOIN pur.ap_payment p ON p.ap_payment_id=apa.ap_payment_id
          JOIN scoped_invoices si ON si.ap_invoice_id=apa.ap_invoice_id
          WHERE p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL
          GROUP BY apa.ap_invoice_id
        )
        SELECT COALESCE(SUM(it.invoice_total),0) AS total_ap_invoiced,
               COALESCE(SUM(COALESCE(pt.amount_paid,0)),0) AS total_ap_paid,
               COALESCE(SUM(it.invoice_total-COALESCE(pt.amount_paid,0)),0) AS ap_balance,
               COUNT(*) FILTER(WHERE it.invoice_total-COALESCE(pt.amount_paid,0)>0) AS open_invoice_count
        FROM invoice_totals it LEFT JOIN paid_totals pt ON pt.ap_invoice_id=it.ap_invoice_id;
      `, [branchId]),

      safeQuery(`
        SELECT COUNT(*) FILTER(WHERE branch_id IS NULL)::int AS unassigned_journal_count
        FROM fin.gl_journal;
      `, []),

      safeQuery(`
        SELECT COALESCE(SUM(gjl.debit),0) AS cash_in,
               COALESCE(SUM(gjl.credit),0) AS cash_out,
               COALESCE(SUM(gjl.debit),0)-COALESCE(SUM(gjl.credit),0) AS cash_balance
        FROM fin.gl_journal gj
        JOIN fin.gl_journal_line gjl ON gjl.journal_id=gj.journal_id
        JOIN fin.gl_account ga ON ga.account_id=gjl.account_id
        WHERE gj.branch_id=$1 AND ga.account_code IN ('1000','1010');
      `, [branchId]),

      safeQuery(`
        SELECT COALESCE(SUM(CASE WHEN ga.account_type='INCOME' THEN gjl.credit-gjl.debit ELSE 0 END),0) AS income,
               COALESCE(SUM(CASE WHEN ga.account_type='EXPENSE' THEN gjl.debit-gjl.credit ELSE 0 END),0) AS expenses
        FROM fin.gl_journal gj
        JOIN fin.gl_journal_line gjl ON gjl.journal_id=gj.journal_id
        JOIN fin.gl_account ga ON ga.account_id=gjl.account_id
        WHERE gj.branch_id=$1 AND ga.account_type IN ('INCOME','EXPENSE');
      `, [branchId]),

      safeQuery(`
        SELECT COUNT(*) AS batch_count,
               COALESCE(SUM(x.input_qty),0) AS total_raw_used,
               COALESCE(SUM(x.output_qty),0) AS total_clean_produced,
               COALESCE(SUM(x.input_qty-x.output_qty),0) AS total_loss
        FROM (
          SELECT b.batch_id,COALESCE(SUM(DISTINCT bi.qty_used),0) AS input_qty,
                 COALESCE(SUM(DISTINCT bo.qty_produced),0) AS output_qty
          FROM mfg.batch b
          JOIN app.location raw_loc ON raw_loc.location_id=b.raw_location_id
          JOIN app.location fg_loc ON fg_loc.location_id=b.fg_location_id
          LEFT JOIN mfg.batch_input bi ON bi.batch_id=b.batch_id
          LEFT JOIN mfg.batch_output bo ON bo.batch_id=b.batch_id
          WHERE raw_loc.branch_id=$1 AND fg_loc.branch_id=$1
          GROUP BY b.batch_id
        ) x;
      `, [branchId]),

      safeQuery(`
        SELECT COUNT(*) AS po_count,
               COUNT(*) FILTER(WHERE UPPER(po.status)='OPEN') AS open_po_count,
               COALESCE(SUM(pol.qty*pol.unit_price),0) AS po_value
        FROM pur.purchase_order po
        LEFT JOIN pur.purchase_order_line pol ON pol.po_id=po.po_id
        WHERE po.branch_id=$1;
      `, [branchId]),

      safeQuery(`
        SELECT COUNT(*) AS grn_count,
               COUNT(*) FILTER(WHERE gr.is_posted IS TRUE) AS posted_grn_count,
               COALESCE(SUM(grl.qty_received*grl.unit_cost),0) AS grn_value
        FROM pur.goods_receipt gr
        JOIN app.location loc ON loc.location_id=gr.location_id
        LEFT JOIN pur.goods_receipt_line grl ON grl.grn_id=gr.grn_id
        WHERE loc.branch_id=$1 AND loc.is_active;
      `, [branchId]),

      safeQuery(`
        SELECT COUNT(*) AS delivery_count,
               COUNT(*) FILTER(WHERE d.is_posted IS TRUE) AS posted_delivery_count,
               COUNT(*) FILTER(WHERE d.is_posted IS NOT TRUE) AS unposted_delivery_count,
               COALESCE(SUM(COALESCE(dl.sell_qty,dl.qty,0)*COALESCE(dl.unit_price,0)),0) AS delivery_value
        FROM sal.delivery d
        JOIN app.location loc ON loc.location_id=d.location_id
        LEFT JOIN sal.delivery_line dl ON dl.delivery_id=d.delivery_id
        WHERE loc.branch_id=$1 AND loc.is_active;
      `, [branchId]),

      safeQuery(`
        SELECT sm.movement_id,sm.movement_ts,sm.movement_type,sm.document_no,sm.reason_code,sm.notes,
               u.full_name AS created_by_name,COUNT(sml.movement_line_id) AS line_count,COALESCE(SUM(sml.qty),0) AS total_qty
        FROM inv.stock_movement sm
        JOIN inv.stock_movement_line sml ON sml.movement_id=sm.movement_id
        LEFT JOIN app.location from_loc ON from_loc.location_id=sml.from_location_id
        LEFT JOIN app.location to_loc ON to_loc.location_id=sml.to_location_id
        LEFT JOIN sec.app_user u ON u.user_id=sm.created_by
        WHERE from_loc.branch_id=$1 OR to_loc.branch_id=$1
        GROUP BY sm.movement_id,sm.movement_ts,sm.movement_type,sm.document_no,sm.reason_code,sm.notes,u.full_name,sm.created_at
        ORDER BY sm.movement_ts DESC,sm.created_at DESC
        LIMIT 8;
      `, [branchId]),

      safeQuery(`
        SELECT ai.ar_invoice_id,ai.invoice_no,c.party_name AS customer_name,ai.invoice_date,ai.status,ai.posted_journal_id,
               COALESCE(SUM(COALESCE(ail.sell_qty,ail.qty,ail.base_qty,0)*COALESCE(ail.unit_price,0)),0) AS invoice_total
        FROM sal.ar_invoice ai
        LEFT JOIN sal.delivery d ON d.delivery_id=ai.delivery_id
        LEFT JOIN sal.pos_sale ps ON ps.credit_ar_invoice_id=ai.ar_invoice_id
        JOIN app.location loc ON loc.location_id=COALESCE(d.location_id,ps.location_id)
        LEFT JOIN app.party c ON c.party_id=ai.customer_id
        LEFT JOIN sal.ar_invoice_line ail ON ail.ar_invoice_id=ai.ar_invoice_id
        WHERE loc.branch_id=$1 AND loc.is_active
        GROUP BY ai.ar_invoice_id,ai.invoice_no,c.party_name,ai.invoice_date,ai.status,ai.posted_journal_id,ai.created_at
        ORDER BY ai.created_at DESC LIMIT 8;
      `, [branchId]),

      safeQuery(`
        SELECT p.ar_payment_id,p.receipt_no,c.party_name AS customer_name,p.payment_date,p.amount,p.method,p.posted_journal_id
        FROM sal.ar_payment p
        LEFT JOIN app.party c ON c.party_id=p.customer_id
        WHERE p.branch_id=$1
        ORDER BY p.created_at DESC LIMIT 8;
      `, [branchId]),

      safeQuery(`
        SELECT 'Unposted Deliveries' AS alert_label,COUNT(*)::numeric AS alert_value
        FROM sal.delivery d JOIN app.location loc ON loc.location_id=d.location_id
        WHERE loc.branch_id=$1 AND loc.is_active AND d.is_posted IS NOT TRUE
        UNION ALL
        SELECT 'Open Sales Orders',COUNT(*)::numeric
        FROM sal.sales_order WHERE branch_id=$1 AND UPPER(status)='OPEN'
        UNION ALL
        SELECT 'Open Purchase Orders',COUNT(*)::numeric
        FROM pur.purchase_order WHERE branch_id=$1 AND UPPER(status)='OPEN'
        UNION ALL
        SELECT 'Unposted GRNs',COUNT(*)::numeric
        FROM pur.goods_receipt gr JOIN app.location loc ON loc.location_id=gr.location_id
        WHERE loc.branch_id=$1 AND loc.is_active AND gr.is_posted IS NOT TRUE;
      `, [branchId]),
    ]);

    const financeComplete = Number(financeCoverageRows[0]?.unassigned_journal_count || 0) === 0;
    const profit = profitRows[0] || {};
    return res.json({
      success: true,
      scope: { branch_id: branchId, mode: "BRANCH" },
      data: {
        inventory: stockRows[0] || {},
        stock_by_product: stockByProductRows,
        sales: salesRows[0] || {},
        receivables: arRows[0] || {},
        payables: apRows[0] || {},
        cash: financeComplete ? (cashRows[0] || {}) : null,
        profit_and_loss: financeComplete ? {
          income: Number(profit.income || 0),
          expenses: Number(profit.expenses || 0),
          net_profit: Number(profit.income || 0) - Number(profit.expenses || 0),
        } : null,
        finance_attribution_complete: financeComplete,
        cleaning: cleaningRows[0] || {},
        purchasing: purchaseRows[0] || {},
        goods_receipts: grnRows[0] || {},
        deliveries: deliveryRows[0] || {},
        recent_stock_movements: recentMovementRows,
        recent_invoices: recentInvoiceRows,
        recent_receipts: recentReceiptRows,
        alerts: alertRows,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard summary.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

export default router;
