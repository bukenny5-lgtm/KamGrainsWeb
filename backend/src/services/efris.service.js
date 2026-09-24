import { resolveBusinessFeatureMap } from "./businessFeatures.service.js";

export async function isEfrisEnabled(client) {
  const company = await client.query(`SELECT company_id FROM app.company_profile WHERE is_active ORDER BY created_at, company_id LIMIT 1`);
  const companyId = company.rows[0]?.company_id;
  if (!companyId) return { enabled: false, companyId: null };
  const features = await resolveBusinessFeatureMap(companyId);
  const config = await client.query(`SELECT * FROM app.efris_configuration WHERE company_id=$1`, [companyId]);
  return { enabled: Boolean(features.efris) && Boolean(config.rows[0]?.efris_enabled), companyId, config: config.rows[0] || null };
}

export async function queueEfrisPosSale(client, saleId, userId) {
  const state = await isEfrisEnabled(client);
  if (!state.enabled) return null;
  if (!state.config || state.config.environment === "NOT_CONFIGURED") {
    throw new Error("EFRIS is enabled but its configuration is not ready.");
  }

  const source = await client.query(`
    SELECT ps.pos_sale_id, ps.sale_no, ps.transaction_date, ps.location_id, l.branch_id,
           ps.customer_id, ps.subtotal, ps.taxable_subtotal, ps.tax_total, ps.total_amount,
           ps.payment_method, ps.tax_snapshot_at,
           COALESCE((SELECT json_agg(json_build_object(
             'product_id', sl.product_id, 'qty', sl.qty, 'unit_price', sl.unit_price,
             'tax_code_id', sl.tax_code_id, 'tax_code', sl.tax_code,
             'tax_treatment', sl.tax_treatment, 'tax_rate', sl.tax_rate,
             'taxable_amount', sl.taxable_amount, 'tax_amount', sl.tax_amount,
             'gross_amount', sl.gross_amount, 'uom_code', p.uom_code,
             'description', p.product_name) ORDER BY sl.created_at, sl.pos_sale_line_id)
             FROM sal.pos_sale_line sl JOIN inv.product p ON p.product_id=sl.product_id
             WHERE sl.pos_sale_id=ps.pos_sale_id), '[]'::json) AS lines
    FROM sal.pos_sale ps JOIN app.location l ON l.location_id=ps.location_id
    WHERE ps.pos_sale_id=$1 AND ps.status='POSTED'`, [saleId]);
  if (!source.rowCount) throw new Error("Posted POS sale was not found for EFRIS queueing.");
  const sale = source.rows[0];
  const reference = `ERP-${sale.sale_no}`;
  const inserted = await client.query(`
    INSERT INTO app.efris_document(
      company_id, branch_id, location_id, source_document_type, source_document_id,
      source_document_number, document_kind, internal_reference, transaction_date,
      status, submission_mode, snapshot_payload
    ) VALUES ($1,$2,$3,'POS_SALE',$4,$5,'SALE_RECEIPT',$6,$7,'QUEUED', $8, $9::jsonb)
    ON CONFLICT (source_document_type, source_document_id, document_kind)
    DO UPDATE SET updated_at=now()
    RETURNING *`, [state.companyId, sale.branch_id, sale.location_id, sale.pos_sale_id, sale.sale_no,
    reference, sale.transaction_date, state.config.offline_enabled ? "OFFLINE_ALLOWED" : "STRICT_ONLINE",
    JSON.stringify({ sale_no: sale.sale_no, customer_id: sale.customer_id, subtotal: sale.subtotal, taxable_subtotal: sale.taxable_subtotal, tax_total: sale.tax_total, total_amount: sale.total_amount, payment_method: sale.payment_method, tax_snapshot_at: sale.tax_snapshot_at, lines: sale.lines })]);
  const document = inserted.rows[0];
  await client.query(`INSERT INTO app.efris_document_event(efris_document_id,event_type,new_status,event_metadata,created_by) VALUES($1,'QUEUED',$2,$3,$4)`, [document.efris_document_id, document.status, JSON.stringify({ adapter: "NOT_CONFIGURED", message: "Awaiting EFRIS technical system-to-system transport." }), userId || null]);
  return document;
}

export async function queueEfrisCreditNoteForReturn(client, returnId, userId) {
  const state = await isEfrisEnabled(client);
  if (!state.enabled) return null;
  const source = await client.query(`SELECT r.*, l.branch_id FROM sal.customer_return r JOIN app.location l ON l.location_id=r.location_id WHERE r.customer_return_id=$1 AND r.status='POSTED'`, [returnId]);
  if (!source.rowCount) throw new Error("Posted customer return was not found for EFRIS credit-note queueing.");
  const original = await client.query(`SELECT * FROM app.efris_document WHERE source_document_type=$1 AND source_document_id=$2 AND document_kind IN ('SALE_RECEIPT','SALE_INVOICE') ORDER BY created_at LIMIT 1`, [source.rows[0].source_type === "POS" ? "POS_SALE" : "AR_INVOICE", source.rows[0].source_id]);
  if (!original.rowCount || original.rows[0].status !== "ACCEPTED") return null;
  const returnedLines = await client.query(`SELECT product_id, qty_returned, original_unit_price, tax_code_id, tax_code, tax_treatment, tax_rate, returned_taxable_amount, returned_tax_amount, returned_gross_amount FROM sal.customer_return_line WHERE customer_return_id=$1 ORDER BY customer_return_line_id`, [returnId]);
  const reference = `ERP-CN-${source.rows[0].return_no}`;
  const inserted = await client.query(`INSERT INTO app.efris_document(company_id,branch_id,location_id,source_document_type,source_document_id,source_document_number,document_kind,internal_reference,transaction_date,status,submission_mode,original_efris_document_id,snapshot_payload) VALUES($1,$2,$3,'CUSTOMER_RETURN',$4,$5,'CREDIT_NOTE',$6,$7,'QUEUED',$8,$9,$10::jsonb) ON CONFLICT(source_document_type,source_document_id,document_kind) DO UPDATE SET updated_at=now() RETURNING *`, [state.companyId, source.rows[0].branch_id, source.rows[0].location_id, returnId, source.rows[0].return_no, reference, source.rows[0].transaction_date, state.config.offline_enabled ? "OFFLINE_ALLOWED" : "STRICT_ONLINE", original.rows[0].efris_document_id, JSON.stringify({ original_efris_document_id: original.rows[0].efris_document_id, source_document_number: source.rows[0].source_document_no, lines: returnedLines.rows })]);
  await client.query(`INSERT INTO app.efris_document_event(efris_document_id,event_type,new_status,event_metadata,created_by) VALUES($1,'CREDIT_NOTE_CREATED',$2,$3,$4)`, [inserted.rows[0].efris_document_id, inserted.rows[0].status, JSON.stringify({ original_efris_document_id: original.rows[0].efris_document_id }), userId || null]);
  return inserted.rows[0];
}

export const EFRIS_ADAPTER_CONTRACT = Object.freeze([
  "validateConfiguration", "buildFiscalDocument", "submitInvoice", "submitReceipt",
  "submitCreditNote", "submitDebitNote", "queryStatus", "verifyResponse",
]);

export const NotConfiguredEfrisAdapter = Object.freeze({
  name: "NOT_CONFIGURED",
  async validateConfiguration() { return { ready: false, reason: "URA technical system-to-system specification required." }; },
  async submit() { throw new Error("URA technical system-to-system specification required; no transport is configured."); },
});
