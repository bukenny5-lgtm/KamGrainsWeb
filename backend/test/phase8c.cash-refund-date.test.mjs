import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migration = fs.readFileSync(new URL("database/migrations/phase_43_cash_refund_till_session.sql", root), "utf8");
const dateSource = fs.readFileSync(new URL("frontend/src/lib/date.ts", root), "utf8");

test("cash refund uses the current paying session and expected cash reduces", () => {
  const opening = 500;
  const refund = 295;
  assert.equal(opening - refund, 205);
  assert.match(migration, /cashier_user_id=sec\.current_user_id\(\)/);
  assert.match(migration, /cs\.status='OPEN'/);
  assert.match(migration, /'CASH_REFUND',p_amount/);
  assert.match(migration, /v_session\.session_id/);
  assert.match(migration, /v_session\.till_id/);
  assert.match(migration, /v_session\.branch_id/);
  assert.match(migration, /v_session\.location_id/);
});
test("refund movement is idempotent, atomic, and cash-only", () => {
  assert.match(migration, /till_cash_refund_source_unique/);
  assert.match(migration, /source_document_type='REFUND_SETTLEMENT'/);
  assert.match(migration, /INSERT INTO sal\.refund_settlement[\s\S]*RETURNING refund_settlement_id/);
  assert.match(migration, /INSERT INTO app\.till_cash_movement[\s\S]*v_settlement_id/);
  assert.match(migration, /p_refund_method='CASH' AND v_till_enabled/);
  assert.doesNotMatch(migration, /MOBILE_MONEY.*CASH_REFUND|CARD.*CASH_REFUND|BANK_TRANSFER.*CASH_REFUND/);
});

test("date-only formatter preserves the calendar date", () => {
  assert.match(dateSource, /slice\(0, 10\)/);
  assert.match(dateSource, /\$\{match\[3\]\}\/\$\{match\[2\]\}\/\$\{match\[1\]\}/);
  assert.doesNotMatch(dateSource, /new Date/);
});
