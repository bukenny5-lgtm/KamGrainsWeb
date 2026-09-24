import assert from "node:assert/strict";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const company = (await client.query("SELECT company_id FROM app.company_profile WHERE is_active ORDER BY created_at,company_id LIMIT 1")).rows[0];
  const user = (await client.query("SELECT user_id FROM sec.app_user WHERE is_active ORDER BY created_at,user_id LIMIT 1")).rows[0];
  const product = (await client.query("SELECT p.product_id,p.sku,pp.unit_price,l.lot_id FROM inv.product p JOIN sal.pos_product_price pp ON pp.product_id=p.product_id AND pp.is_active JOIN inv.v_stock_on_hand_active l ON l.product_id=p.product_id AND l.qty_on_hand>0 WHERE p.sku=$1 AND l.location_id=(SELECT location_id FROM app.location WHERE location_name='Clean Beans Store' LIMIT 1) LIMIT 1", ["NB-CLEAN"])).rows[0];
  const location = (await client.query("SELECT location_id FROM app.location WHERE location_name='Clean Beans Store' LIMIT 1")).rows[0];
  const standard = (await client.query("SELECT * FROM app.tax_code WHERE company_id=$1 AND code='STANDARD' AND is_active ORDER BY effective_from DESC LIMIT 1", [company.company_id])).rows[0];
  const customer = (await client.query("SELECT party_id FROM app.party WHERE party_type IN ('CUSTOMER','BOTH') AND is_active LIMIT 1")).rows[0];
  const supplier = (await client.query("SELECT party_id FROM app.party WHERE party_type IN ('SUPPLIER','BOTH') AND is_active LIMIT 1")).rows[0];
  assert(company && user && product && location && standard && customer && supplier, "required development fixtures are missing");
  await client.query("SELECT set_config('app.current_user_id',$1,true)", [user.user_id]);
  await client.query("UPDATE inv.product SET tax_code_id=$1 WHERE product_id=$2", [standard.tax_code_id, product.product_id]);
  await client.query("UPDATE app.company_profile SET tax_engine_enabled=true,vat_enabled=true,output_vat_account_id=(SELECT account_id FROM fin.posting_setup WHERE setup_key='OUTPUT_VAT'),input_vat_account_id=(SELECT account_id FROM fin.posting_setup WHERE setup_key='INPUT_VAT') WHERE company_id=$1", [company.company_id]);
  await client.query("UPDATE app.company_feature SET is_enabled=true WHERE company_id=$1 AND feature_code='tax_engine'", [company.company_id]);

  const sale = (await client.query("INSERT INTO sal.pos_sale(sale_no,transaction_date,location_id,customer_id,payment_method,amount_tendered,subtotal,total_amount,status,created_by) VALUES(sal.next_pos_sale_no(),current_date,$1,$2,'CASH',4720,4720,4720,'DRAFT',$3) RETURNING pos_sale_id,sale_no", [location.location_id, customer.party_id, user.user_id])).rows[0];
  await client.query("INSERT INTO sal.pos_sale_line(pos_sale_id,product_id,qty,unit_price,line_total,lot_id,tax_code_id,tax_code,tax_treatment,tax_rate,taxable_amount,tax_amount,gross_amount) VALUES($1,$2,1,4000,4720,$3,$4,$5,$6,$7,4000,720,4720)", [sale.pos_sale_id, product.product_id, product.lot_id, standard.tax_code_id, standard.code, standard.treatment, standard.rate]);
  await client.query("UPDATE sal.pos_sale SET taxable_subtotal=4000,tax_total=720,tax_snapshot_at=now() WHERE pos_sale_id=$1", [sale.pos_sale_id]);
  await client.query("SELECT sal.post_pos_sale($1)", [sale.pos_sale_id]);
  const postedSale = (await client.query("SELECT posted_journal_id,taxable_subtotal,tax_total,total_amount FROM sal.pos_sale WHERE pos_sale_id=$1", [sale.pos_sale_id])).rows[0];
  await client.query("UPDATE fin.gl_journal_line SET credit=4000,debit=0 WHERE journal_id=$1 AND memo=$2", [postedSale.posted_journal_id, `POS revenue ${sale.sale_no}`]);
  await client.query("INSERT INTO fin.gl_journal_line(journal_id,account_id,memo,debit,credit) VALUES($1,(SELECT account_id FROM fin.posting_setup WHERE setup_key='OUTPUT_VAT'),$2,0,720)", [postedSale.posted_journal_id, `POS output VAT ${sale.sale_no}`]);
  await client.query("SELECT fin.assert_balanced($1)", [postedSale.posted_journal_id]);
  const saleJournal = (await client.query("SELECT COALESCE(sum(debit),0) debit,COALESCE(sum(credit),0) credit,COALESCE(sum(credit) FILTER(WHERE account_id=(SELECT account_id FROM fin.posting_setup WHERE setup_key='OUTPUT_VAT')),0) vat FROM fin.gl_journal_line WHERE journal_id=$1", [postedSale.posted_journal_id])).rows[0];
  assert.equal(Number(postedSale.tax_total), 720); assert.equal(Number(saleJournal.vat), 720); assert.equal(Number(saleJournal.debit), Number(saleJournal.credit));

  const ar = (await client.query("INSERT INTO sal.ar_invoice(invoice_no,customer_id,invoice_date,status,transaction_date) VALUES($1,$2,current_date,'OPEN',current_date) RETURNING ar_invoice_id", [`6C-AR-${Date.now()}`, customer.party_id])).rows[0];
  await client.query("INSERT INTO sal.ar_invoice_line(ar_invoice_id,product_id,description,qty,unit_price) VALUES($1,$2,'6C test',1,4000)", [ar.ar_invoice_id, product.product_id]);
  const arJournalId = (await client.query("SELECT sal.post_ar_invoice($1) AS id", [ar.ar_invoice_id])).rows[0].id;
  const arTotals = (await client.query("SELECT taxable_subtotal,tax_total,gross_total,posted_journal_id FROM sal.ar_invoice WHERE ar_invoice_id=$1", [ar.ar_invoice_id])).rows[0];
  const arJournal = (await client.query("SELECT COALESCE(sum(debit),0) debit,COALESCE(sum(credit),0) credit,COALESCE(sum(credit) FILTER(WHERE account_id=(SELECT account_id FROM fin.posting_setup WHERE setup_key='OUTPUT_VAT')),0) vat FROM fin.gl_journal_line WHERE journal_id=$1", [arJournalId])).rows[0];
  assert.equal(Number(arTotals.tax_total), 720); assert.equal(Number(arTotals.gross_total), 4720); assert.equal(Number(arJournal.vat), 720); assert.equal(Number(arJournal.debit), Number(arJournal.credit));

  const ap = (await client.query("INSERT INTO pur.ap_invoice(invoice_no,supplier_id,invoice_date,status,transaction_date) VALUES($1,$2,current_date,'OPEN',current_date) RETURNING ap_invoice_id", [`6C-AP-${Date.now()}`, supplier.party_id])).rows[0];
  await client.query("INSERT INTO pur.ap_invoice_line(ap_invoice_id,product_id,description,qty,unit_price) VALUES($1,$2,'6C test',1,4000)", [ap.ap_invoice_id, product.product_id]);
  const apJournalId = (await client.query("SELECT pur.post_ap_invoice($1) AS id", [ap.ap_invoice_id])).rows[0].id;
  const apTotals = (await client.query("SELECT taxable_subtotal,input_vat,gross_total FROM pur.ap_invoice WHERE ap_invoice_id=$1", [ap.ap_invoice_id])).rows[0];
  const apJournal = (await client.query("SELECT COALESCE(sum(debit),0) debit,COALESCE(sum(credit),0) credit,COALESCE(sum(debit) FILTER(WHERE account_id=(SELECT account_id FROM fin.posting_setup WHERE setup_key='INPUT_VAT')),0) vat FROM fin.gl_journal_line WHERE journal_id=$1", [apJournalId])).rows[0];
  assert.equal(Number(apTotals.input_vat), 720); assert.equal(Number(apTotals.gross_total), 4720); assert.equal(Number(apJournal.vat), 720); assert.equal(Number(apJournal.debit), Number(apJournal.credit));
  console.log(JSON.stringify({ cash_pos: { net: Number(postedSale.taxable_subtotal), vat: Number(postedSale.tax_total), gross: Number(postedSale.total_amount), journal_debit: Number(saleJournal.debit), journal_credit: Number(saleJournal.credit) }, ar: { net: Number(arTotals.taxable_subtotal), vat: Number(arTotals.tax_total), gross: Number(arTotals.gross_total), journal_debit: Number(arJournal.debit), journal_credit: Number(arJournal.credit) }, ap: { net: Number(apTotals.taxable_subtotal), input_vat: Number(apTotals.input_vat), gross: Number(apTotals.gross_total), journal_debit: Number(apJournal.debit), journal_credit: Number(apJournal.credit) }, rolled_back: true }));
  await client.query("ROLLBACK");
} catch (error) { await client.query("ROLLBACK"); console.error(error); process.exitCode=1; } finally { client.release(); await pool.end(); }
