export async function refreshPurchaseOrderStatus(client, poId) {
  if (!poId) return null;

  const statusResult = await client.query(
    `
    WITH po_lines AS (
      SELECT
        po.po_id,
        po.status,
        COALESCE(SUM(pol.qty), 0)::numeric AS ordered_qty
      FROM pur.purchase_order po
      LEFT JOIN pur.purchase_order_line pol
        ON pol.po_id = po.po_id
      WHERE po.po_id = $1::uuid
      GROUP BY po.po_id, po.status
    ),
    received AS (
      SELECT
        gr.po_id,
        COALESCE(SUM(grl.qty_received), 0)::numeric AS received_qty
      FROM pur.goods_receipt gr
      JOIN pur.goods_receipt_line grl
        ON grl.grn_id = gr.grn_id
      WHERE gr.po_id = $1::uuid
        AND COALESCE(gr.is_posted, false) = true
        AND COALESCE(UPPER(gr.status), '') <> 'CANCELLED'
      GROUP BY gr.po_id
    ),
    invoice_totals AS (
      SELECT
        gr.po_id,
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
    calculated AS (
      SELECT
        pl.po_id,
        pl.status AS old_status,
        pl.ordered_qty,
        COALESCE(r.received_qty, 0)::numeric AS received_qty,
        COALESCE(it.invoice_total, 0)::numeric AS invoice_total,
        COALESCE(pt.amount_paid, 0)::numeric AS amount_paid,
        CASE
          WHEN UPPER(COALESCE(pl.status, '')) IN ('CANCELLED', 'CANCELED') THEN pl.status
          WHEN COALESCE(r.received_qty, 0) < pl.ordered_qty THEN 'OPEN'
          WHEN COALESCE(it.invoice_total, 0) <= 0 THEN 'RECEIVED'
          WHEN COALESCE(pt.amount_paid, 0) < COALESCE(it.invoice_total, 0) THEN 'INVOICED'
          ELSE 'CLOSED'
        END AS new_status
      FROM po_lines pl
      LEFT JOIN received r
        ON r.po_id = pl.po_id
      LEFT JOIN invoice_totals it
        ON it.po_id = pl.po_id
      LEFT JOIN paid_totals pt
        ON pt.po_id = pl.po_id
    )
    UPDATE pur.purchase_order po
    SET status = calculated.new_status
    FROM calculated
    WHERE po.po_id = calculated.po_id
    RETURNING
      po.po_id,
      po.po_no,
      calculated.old_status,
      po.status AS new_status,
      calculated.ordered_qty,
      calculated.received_qty,
      calculated.invoice_total,
      calculated.amount_paid;
    `,
    [poId]
  );

  return statusResult.rows[0] || null;
}

export async function refreshPurchaseOrderStatusByPoId(client, poId) {
  return refreshPurchaseOrderStatus(client, poId);
}

export async function refreshPurchaseOrderStatusByGrnId(client, grnId) {
  const result = await client.query(
    `
    SELECT po_id
    FROM pur.goods_receipt
    WHERE grn_id = $1::uuid;
    `,
    [grnId]
  );

  const poId = result.rows[0]?.po_id;
  if (!poId) return null;

  return refreshPurchaseOrderStatus(client, poId);
}

export async function refreshPurchaseOrderStatusByApInvoiceId(client, apInvoiceId) {
  const result = await client.query(
    `
    SELECT gr.po_id
    FROM pur.ap_invoice api
    JOIN pur.goods_receipt gr
      ON gr.grn_id = api.grn_id
    WHERE api.ap_invoice_id = $1::uuid;
    `,
    [apInvoiceId]
  );

  const poId = result.rows[0]?.po_id;
  if (!poId) return null;

  return refreshPurchaseOrderStatus(client, poId);
}

export async function refreshPurchaseOrderStatusByApPaymentId(client, apPaymentId) {
  const result = await client.query(
    `
    SELECT DISTINCT gr.po_id
    FROM pur.ap_payment_apply apa
    JOIN pur.ap_invoice api
      ON api.ap_invoice_id = apa.ap_invoice_id
    JOIN pur.goods_receipt gr
      ON gr.grn_id = api.grn_id
    WHERE apa.ap_payment_id = $1::uuid
      AND gr.po_id IS NOT NULL;
    `,
    [apPaymentId]
  );

  const refreshed = [];

  for (const row of result.rows) {
    const status = await refreshPurchaseOrderStatus(client, row.po_id);
    if (status) refreshed.push(status);
  }

  return refreshed;
}
export async function refreshPurchaseOrderStatusesByApPaymentId(client, apPaymentId) {
  return refreshPurchaseOrderStatusByApPaymentId(client, apPaymentId);
}