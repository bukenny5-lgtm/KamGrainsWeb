import express from "express";
import { query } from "../db.js";

const router = express.Router();

async function safeQuery(sql) {
  const result = await query(sql);
  return result.rows;
}

/**
 * GET /api/dashboard/summary
 * Rich dashboard summary for KAM GRAINS.
 */
router.get("/summary", async (req, res) => {
  try {
    const [
      stockRows,
      stockByProductRows,
      salesRows,
      arRows,
      apRows,
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
      safeQuery(
        `
        SELECT
          COUNT(DISTINCT product_id) AS product_count,
          COUNT(DISTINCT lot_id) AS lot_count,
          COUNT(DISTINCT location_id) AS location_count,
          COALESCE(SUM(qty_on_hand), 0) AS total_stock_qty
        FROM inv.v_stock_on_hand;
        `
      ),

      safeQuery(
        `
        SELECT
          product_id,
          sku,
          product_name,
          COALESCE(SUM(qty_on_hand), 0) AS qty_on_hand,
          COUNT(DISTINCT lot_id) AS lot_count,
          COUNT(DISTINCT location_id) AS location_count
        FROM inv.v_stock_on_hand
        GROUP BY product_id, sku, product_name
        ORDER BY product_name
        LIMIT 12;
        `
      ),

      safeQuery(
        `
        SELECT
          COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0) AS total_sales,
          COUNT(DISTINCT ai.ar_invoice_id) AS posted_invoice_count
        FROM sal.ar_invoice ai
        JOIN sal.ar_invoice_line ail
          ON ail.ar_invoice_id = ai.ar_invoice_id
        WHERE ai.posted_journal_id IS NOT NULL;
        `,
        [{}]
      ),

      safeQuery(
        `
        WITH invoice_totals AS (
          SELECT
            ai.ar_invoice_id,
            COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0) AS invoice_total
          FROM sal.ar_invoice ai
          LEFT JOIN sal.ar_invoice_line ail
            ON ail.ar_invoice_id = ai.ar_invoice_id
          GROUP BY ai.ar_invoice_id
        ),
        paid_totals AS (
          SELECT
            ar_invoice_id,
            COALESCE(SUM(amount), 0) AS amount_paid
          FROM sal.ar_payment_apply
          GROUP BY ar_invoice_id
        )
        SELECT
          COALESCE(SUM(it.invoice_total), 0) AS total_ar_invoiced,
          COALESCE(SUM(COALESCE(pt.amount_paid, 0)), 0) AS total_ar_paid,
          COALESCE(SUM(it.invoice_total - COALESCE(pt.amount_paid, 0)), 0) AS ar_balance,
          COUNT(*) FILTER (WHERE it.invoice_total - COALESCE(pt.amount_paid, 0) > 0) AS open_invoice_count
        FROM sal.ar_invoice ai
        JOIN invoice_totals it
          ON it.ar_invoice_id = ai.ar_invoice_id
        LEFT JOIN paid_totals pt
          ON pt.ar_invoice_id = ai.ar_invoice_id;
        `,
        [{}]
      ),

      safeQuery(
        `
        WITH invoice_totals AS (
          SELECT
            api.ap_invoice_id,
            COALESCE(SUM(apil.qty * apil.unit_price), 0) AS invoice_total
          FROM pur.ap_invoice api
          LEFT JOIN pur.ap_invoice_line apil
            ON apil.ap_invoice_id = api.ap_invoice_id
          GROUP BY api.ap_invoice_id
        ),
        paid_totals AS (
          SELECT
            apa.ap_invoice_id,
            COALESCE(SUM(apa.amount), 0) AS amount_paid
          FROM pur.ap_payment_apply apa
          JOIN pur.ap_payment p
            ON p.ap_payment_id = apa.ap_payment_id
          WHERE p.posted_journal_id IS NOT NULL
            AND p.reversal_journal_id IS NULL
          GROUP BY apa.ap_invoice_id
        )
        SELECT
          COALESCE(SUM(it.invoice_total), 0) AS total_ap_invoiced,
          COALESCE(SUM(COALESCE(pt.amount_paid, 0)), 0) AS total_ap_paid,
          COALESCE(SUM(it.invoice_total - COALESCE(pt.amount_paid, 0)), 0) AS ap_balance,
          COUNT(*) FILTER (WHERE it.invoice_total - COALESCE(pt.amount_paid, 0) > 0) AS open_invoice_count
        FROM pur.ap_invoice api
        JOIN invoice_totals it
          ON it.ap_invoice_id = api.ap_invoice_id
        LEFT JOIN paid_totals pt
          ON pt.ap_invoice_id = api.ap_invoice_id;
        `,
        [{}]
      ),

      safeQuery(
        `
        SELECT
          COALESCE(SUM(gjl.debit), 0) AS cash_in,
          COALESCE(SUM(gjl.credit), 0) AS cash_out,
          COALESCE(SUM(gjl.debit), 0) - COALESCE(SUM(gjl.credit), 0) AS cash_balance
        FROM fin.gl_journal_line gjl
        JOIN fin.gl_account ga
          ON ga.account_id = gjl.account_id
        WHERE ga.account_code IN ('1000', '1010');
        `,
        [{}]
      ),

      safeQuery(
        `
        SELECT
          COALESCE(SUM(CASE WHEN ga.account_type = 'INCOME' THEN gjl.credit - gjl.debit ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN ga.account_type = 'EXPENSE' THEN gjl.debit - gjl.credit ELSE 0 END), 0) AS expenses
        FROM fin.gl_journal_line gjl
        JOIN fin.gl_account ga
          ON ga.account_id = gjl.account_id
        WHERE ga.account_type IN ('INCOME', 'EXPENSE');
        `,
        [{}]
      ),

      safeQuery(
        `
        SELECT
          COUNT(*) AS batch_count,
          COALESCE(SUM(input_qty), 0) AS total_raw_used,
          COALESCE(SUM(output_qty), 0) AS total_clean_produced,
          COALESCE(SUM(input_qty - output_qty), 0) AS total_loss
        FROM (
          SELECT
            b.batch_id,
            COALESCE(SUM(DISTINCT bi.qty_used), 0) AS input_qty,
            COALESCE(SUM(DISTINCT bo.qty_produced), 0) AS output_qty
          FROM mfg.batch b
          LEFT JOIN mfg.batch_input bi
            ON bi.batch_id = b.batch_id
          LEFT JOIN mfg.batch_output bo
            ON bo.batch_id = b.batch_id
          GROUP BY b.batch_id
        ) x;
        `,
        [{}]
      ),

      safeQuery(
        `
        SELECT
          COUNT(*) AS po_count,
          COUNT(*) FILTER (WHERE UPPER(status) = 'OPEN') AS open_po_count,
          COALESCE(SUM(pol.qty * pol.unit_price), 0) AS po_value
        FROM pur.purchase_order po
        LEFT JOIN pur.purchase_order_line pol
          ON pol.po_id = po.po_id;
        `,
        [{}]
      ),

      safeQuery(
        `
        SELECT
          COUNT(*) AS grn_count,
          COUNT(*) FILTER (WHERE is_posted IS TRUE) AS posted_grn_count,
          COALESCE(SUM(grl.qty_received * grl.unit_cost), 0) AS grn_value
        FROM pur.goods_receipt gr
        LEFT JOIN pur.goods_receipt_line grl
          ON grl.grn_id = gr.grn_id;
        `,
        [{}]
      ),

      safeQuery(
        `
        SELECT
          COUNT(*) AS delivery_count,
          COUNT(*) FILTER (WHERE is_posted IS TRUE) AS posted_delivery_count,
          COUNT(*) FILTER (WHERE is_posted IS NOT TRUE) AS unposted_delivery_count,
          COALESCE(SUM(COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0)), 0) AS delivery_value
        FROM sal.delivery d
        LEFT JOIN sal.delivery_line dl
          ON dl.delivery_id = d.delivery_id;
        `,
        [{}]
      ),

      safeQuery(
        `
        SELECT
          sm.movement_id,
          sm.movement_ts,
          sm.movement_type,
          sm.document_no,
          sm.reason_code,
          sm.notes,
          u.full_name AS created_by_name,
          COUNT(sml.movement_line_id) AS line_count,
          COALESCE(SUM(sml.qty), 0) AS total_qty
        FROM inv.stock_movement sm
        LEFT JOIN inv.stock_movement_line sml
          ON sml.movement_id = sm.movement_id
        LEFT JOIN sec.app_user u
          ON u.user_id = sm.created_by
        GROUP BY
          sm.movement_id,
          sm.movement_ts,
          sm.movement_type,
          sm.document_no,
          sm.reason_code,
          sm.notes,
          u.full_name
        ORDER BY sm.movement_ts DESC, sm.created_at DESC
        LIMIT 8;
        `,
        []
      ),

      safeQuery(
        `
        SELECT
          ai.ar_invoice_id,
          ai.invoice_no,
          c.party_name AS customer_name,
          ai.invoice_date,
          ai.status,
          ai.posted_journal_id,
          COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * COALESCE(ail.unit_price, 0)), 0) AS invoice_total
        FROM sal.ar_invoice ai
        LEFT JOIN app.party c
          ON c.party_id = ai.customer_id
        LEFT JOIN sal.ar_invoice_line ail
          ON ail.ar_invoice_id = ai.ar_invoice_id
        GROUP BY ai.ar_invoice_id, ai.invoice_no, c.party_name, ai.invoice_date, ai.status, ai.posted_journal_id
        ORDER BY ai.created_at DESC
        LIMIT 8;
        `,
        []
      ),

      safeQuery(
        `
        SELECT
          p.ar_payment_id,
          p.receipt_no,
          c.party_name AS customer_name,
          p.payment_date,
          p.amount,
          p.method,
          p.posted_journal_id
        FROM sal.ar_payment p
        LEFT JOIN app.party c
          ON c.party_id = p.customer_id
        ORDER BY p.created_at DESC
        LIMIT 8;
        `,
        []
      ),

      safeQuery(
        `
        SELECT 'Unposted Deliveries' AS alert_label, COUNT(*)::numeric AS alert_value
        FROM sal.delivery
        WHERE is_posted IS NOT TRUE
        UNION ALL
        SELECT 'Open Sales Orders' AS alert_label, COUNT(*)::numeric AS alert_value
        FROM sal.sales_order
        WHERE UPPER(status) = 'OPEN'
        UNION ALL
        SELECT 'Open Purchase Orders' AS alert_label, COUNT(*)::numeric AS alert_value
        FROM pur.purchase_order
        WHERE UPPER(status) = 'OPEN'
        UNION ALL
        SELECT 'Unposted GRNs' AS alert_label, COUNT(*)::numeric AS alert_value
        FROM pur.goods_receipt
        WHERE is_posted IS NOT TRUE;
        `,
        []
      ),
    ]);

    const profit = profitRows[0] || {};

    res.json({
      success: true,
      data: {
        inventory: stockRows[0] || {},
        stock_by_product: stockByProductRows,
        sales: salesRows[0] || {},
        receivables: arRows[0] || {},
        payables: apRows[0] || {},
        cash: cashRows[0] || {},
        profit_and_loss: {
          income: Number(profit.income || 0),
          expenses: Number(profit.expenses || 0),
          net_profit: Number(profit.income || 0) - Number(profit.expenses || 0),
        },
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
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard summary.",
      error: error.message,
      detail: error.detail || null,
    });
  }
});

export default router;
