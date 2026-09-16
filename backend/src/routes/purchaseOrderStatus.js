/**
 * Refreshes purchase order lifecycle status based on receiving, supplier invoice,
 * and supplier payment completion.
 *
 * Status rules:
 * - OPEN      = not fully received
 * - RECEIVED  = fully received but no supplier invoice yet
 * - INVOICED  = fully received and supplier invoice exists but not fully paid
 * - CLOSED    = fully received and supplier invoice is fully paid
 * - CANCELLED = preserved and never overwritten
 */
export async function refreshPurchaseOrderStatus(db, poId) {
  if (!poId) return null;

  const result = await db.query(
    `
    WITH order_totals AS (
      SELECT
        po.po_id,
        po.status AS current_status,
        COALESCE(SUM(pol.qty), 0)::numeric AS ordered_qty
      FROM pur.purchase_order po
      LEFT JOIN pur.purchase_order_line pol
        ON pol.po_id = po.po_id
      WHERE po.po_id = $1::uuid
      GROUP BY po.po_id, po.status
    ),
    receipt_totals AS (
      SELECT
        gr.po_id,
        COALESCE(SUM(grl.qty_received), 0)::numeric AS received_qty
      FROM pur.goods_receipt gr
      JOIN pur.goods_receipt_line grl
        ON grl.grn_id = gr.grn_id
      WHERE gr.po_id = $1::uuid
        AND COALESCE(gr.is_posted, false) = true
        AND COALESCE(UPPER(gr.status), '') NOT IN ('CANCELLED', 'CANCELED')
      GROUP BY gr.po_id
    ),
    invoice_totals AS (
      SELECT
        gr.po_id,
        COUNT(DISTINCT api.ap_invoice_id) AS invoice_count,
        COALESCE(SUM(apil.qty * apil.unit_price), 0)::numeric AS invoice_total
      FROM pur.goods_receipt gr
      JOIN pur.ap_invoice api
        ON api.grn_id = gr.grn_id
      LEFT JOIN pur.ap_invoice_line apil
        ON apil.ap_invoice_id = api.ap_invoice_id
      WHERE gr.po_id = $1::uuid
      GROUP BY gr.po_id
    ),
    paid_totals AS (
      SELECT
        gr.po_id,
        COALESCE(SUM(apa.amount), 0)::numeric AS amount_paid
      FROM pur.goods_receipt gr
      JOIN pur.ap_invoice api
        ON api.grn_id = gr.grn_id
      LEFT JOIN pur.ap_payment_apply apa
        ON apa.ap_invoice_id = api.ap_invoice_id
      LEFT JOIN pur.ap_payment p
        ON p.ap_payment_id = apa.ap_payment_id
      WHERE gr.po_id = $1::uuid
        AND (p.ap_payment_id IS NULL OR (p.posted_journal_id IS NOT NULL AND p.reversal_journal_id IS NULL))
      GROUP BY gr.po_id
    ),
    metrics AS (
      SELECT
        ot.po_id,
        ot.current_status,
        ot.ordered_qty,
        COALESCE(rt.received_qty, 0)::numeric AS received_qty,
        COALESCE(it.invoice_count, 0)::int AS invoice_count,
        COALESCE(it.invoice_total, 0)::numeric AS invoice_total,
        COALESCE(pt.amount_paid, 0)::numeric AS amount_paid
      FROM order_totals ot
      LEFT JOIN receipt_totals rt
        ON rt.po_id = ot.po_id
      LEFT JOIN invoice_totals it
        ON it.po_id = ot.po_id
      LEFT JOIN paid_totals pt
        ON pt.po_id = ot.po_id
    ),
    status_calc AS (
      SELECT
        po_id,
        current_status,
        ordered_qty,
        received_qty,
        invoice_count,
        invoice_total,
        amount_paid,
        CASE
          WHEN UPPER(COALESCE(current_status, '')) IN ('CANCELLED', 'CANCELED') THEN current_status
          WHEN ordered_qty <= 0 THEN 'OPEN'
          WHEN received_qty + 0.000001 < ordered_qty THEN 'OPEN'
          WHEN invoice_count <= 0 THEN 'RECEIVED'
          WHEN invoice_total <= 0 THEN 'INVOICED'
          WHEN amount_paid + 0.000001 >= invoice_total THEN 'CLOSED'
          ELSE 'INVOICED'
        END AS next_status
      FROM metrics
    )
    UPDATE pur.purchase_order po
    SET status = sc.next_status
    FROM status_calc sc
    WHERE po.po_id = sc.po_id
      AND UPPER(COALESCE(po.status, '')) NOT IN ('CANCELLED', 'CANCELED')
      AND po.status IS DISTINCT FROM sc.next_status
    RETURNING
      po.po_id,
      po.po_no,
      po.status,
      sc.ordered_qty,
      sc.received_qty,
      sc.invoice_count,
      sc.invoice_total,
      sc.amount_paid;
    `,
    [poId]
  );

  if (result.rowCount > 0) {
    return result.rows[0];
  }

  const current = await db.query(
    `
    SELECT po_id, po_no, status
    FROM pur.purchase_order
    WHERE po_id = $1::uuid;
    `,
    [poId]
  );

  return current.rows[0] || null;
}

export async function refreshPurchaseOrderStatusByGrnId(db, grnId) {
  if (!grnId) return null;

  const poResult = await db.query(
    `
    SELECT po_id
    FROM pur.goods_receipt
    WHERE grn_id = $1::uuid;
    `,
    [grnId]
  );

  const poId = poResult.rows[0]?.po_id;
  if (!poId) return null;

  return refreshPurchaseOrderStatus(db, poId);
}

export async function refreshPurchaseOrderStatusesByApPaymentId(db, paymentId) {
  if (!paymentId) return [];

  const poResult = await db.query(
    `
    SELECT DISTINCT gr.po_id
    FROM pur.ap_payment_apply apa
    JOIN pur.ap_payment p
      ON p.ap_payment_id = apa.ap_payment_id
    JOIN pur.ap_invoice api
      ON api.ap_invoice_id = apa.ap_invoice_id
    JOIN pur.goods_receipt gr
      ON gr.grn_id = api.grn_id
    WHERE apa.ap_payment_id = $1::uuid
      AND p.posted_journal_id IS NOT NULL
      AND p.reversal_journal_id IS NULL
      AND gr.po_id IS NOT NULL;
    `,
    [paymentId]
  );

  const refreshed = [];

  for (const row of poResult.rows) {
    const updated = await refreshPurchaseOrderStatus(db, row.po_id);
    if (updated) refreshed.push(updated);
  }

  return refreshed;
}
