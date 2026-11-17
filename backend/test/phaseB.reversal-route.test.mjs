import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { pool } from "../src/db.js";
import { voidPosSaleHandler } from "../src/routes/pos.routes.js";
import { voidCustomerReturnHandler } from "../src/routes/customerReturns.routes.js";

const userId = "99999999-9999-4999-8999-999999999999";
const locationA = "11111111-1111-4111-8111-111111111111";
const locationB = "22222222-2222-4222-8222-222222222222";
const productA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const productD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const lotA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const lotB = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function posMovementLine({ product_id = productA, lot_id = null, qty = "1.000", from_location_id = locationA, to_location_id = null } = {}) { return { sale_no: "SALE-1", location_id: locationA, posted_movement_id: "movement", movement_id: "movement", movement_type: "SALE_ISSUE", document_no: "SALE-1", product_id, lot_id, qty, from_location_id, to_location_id }; }

function clientFor({ kind, rows = [], expectedRows = [], failOn = null } = {}) {
  const calls = [];
  return {
    calls,
    release() { calls.push({ type: "release" }); },
    async query(sql, params = []) {
      const text = String(sql); calls.push({ type: "query", sql: text, params });
      if (failOn && text.includes(failOn)) throw new Error(`${failOn} failed`);
      if (text === "SELECT set_config('app.current_user_id', $1, true);") return { rowCount: 1, rows: [] };
      if (kind === "pos" && text.includes("SELECT ps.sale_no")) return { rowCount: rows.length, rows };
      if (kind === "pos" && text.includes("SELECT psl.product_id")) return { rowCount: expectedRows.length, rows: expectedRows };
      if (kind === "return" && text.includes("SELECT cr.posted_movement_id")) return { rowCount: rows.length, rows };
      if (text.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [] };
      if (text.includes("sal.void_pos_sale") || text.includes("sal.void_customer_return")) return { rowCount: 1, rows: [{ reversal_journal_id: "journal" }] };
      return { rowCount: 1, rows: [] };
    }
  };
}

async function run(handler, client, req) {
  const restoreConnect = mock.method(pool, "connect", async () => client);
  const poolCalls = [];
  const restoreQuery = mock.method(pool, "query", async (sql, params = []) => { poolCalls.push({ sql: String(sql), params }); return { rowCount: 0, rows: [] }; });
  try { const res = response(); await handler(req, res); return { res, calls: client.calls, poolCalls }; }
  finally { restoreConnect.mock.restore(); restoreQuery.mock.restore(); }
}
function queryTexts(calls) { return calls.filter((call) => call.type === "query").map((call) => call.sql); }
function posRequest() { return { params: { saleId: "sale" }, body: { reason: "correction" }, user: { user_id: userId } }; }

test("POS void validates stock-only movement and keeps the protected sequence on one client", async () => {
  const client = clientFor({ kind: "pos", rows: [posMovementLine({ product_id: productA, qty: "1.250", lot_id: lotA })], expectedRows: [{ product_id: productA, lot_id: lotA, qty: "1.250" }] });
  const { res, calls, poolCalls } = await run(voidPosSaleHandler, client, posRequest());
  assert.equal(res.statusCode, 200); const texts = queryTexts(calls);
  assert.ok(texts.indexOf("BEGIN") < texts.findIndex((sql) => sql.includes("SELECT ps.sale_no")));
  assert.ok(texts.findIndex((sql) => sql.includes("SELECT ps.sale_no")) < texts.findIndex((sql) => sql.includes("SELECT psl.product_id")));
  assert.ok(texts.findIndex((sql) => sql.includes("SELECT psl.product_id")) < texts.findIndex((sql) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(texts.findIndex((sql) => sql.includes("pg_advisory_xact_lock")) < texts.findIndex((sql) => sql.includes("sal.void_pos_sale")));
  assert.ok(texts.findIndex((sql) => sql.includes("sal.void_pos_sale")) < texts.indexOf("COMMIT"));
  assert.equal(calls.filter((call) => call.type === "release").length, 1); assert.equal(poolCalls.length, 1);
});

test("POS void permits non-stock sale lines when stock movement covers only stock items", async () => {
  const client = clientFor({ kind: "pos", rows: [posMovementLine()], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] });
  const { res } = await run(voidPosSaleHandler, client, posRequest()); assert.equal(res.statusCode, 200);
});

test("POS void aggregates duplicate sale and movement lines by product and lot", async () => {
  const client = clientFor({ kind: "pos", rows: [posMovementLine({ product_id: productA, lot_id: lotA, qty: "0.500" }), posMovementLine({ product_id: productA, lot_id: lotA, qty: "0.750" }), posMovementLine({ product_id: productA, lot_id: lotB, qty: "2.000" })], expectedRows: [{ product_id: productA, lot_id: lotA, qty: "1.250" }, { product_id: productA, lot_id: lotB, qty: "2.000" }] });
  const { res } = await run(voidPosSaleHandler, client, posRequest()); assert.equal(res.statusCode, 200);
});

test("POS void rejects inconsistent movement content", async (t) => {
  const cases = [
    { name: "missing movement", rows: [], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] },
    { name: "empty movement", rows: [posMovementLine({ product_id: null })], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] },
    { name: "wrong movement type", rows: [{ ...posMovementLine(), movement_type: "TRANSFER" }], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] },
    { name: "wrong document", rows: [{ ...posMovementLine(), document_no: "OTHER" }], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] },
    { name: "missing expected product", rows: [posMovementLine({ product_id: productB })], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] },
    { name: "extra movement product", rows: [posMovementLine({ product_id: productA }), posMovementLine({ product_id: productB })], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] },
    { name: "quantity mismatch", rows: [posMovementLine({ qty: "2.000" })], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] },
    { name: "wrong lot", rows: [posMovementLine({ lot_id: lotB })], expectedRows: [{ product_id: productA, lot_id: lotA, qty: "1.000" }] },
    { name: "wrong location", rows: [posMovementLine({ from_location_id: locationB })], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] }
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const client = clientFor({ kind: "pos", rows: item.rows, expectedRows: item.expectedRows }); const { res, calls } = await run(voidPosSaleHandler, client, posRequest()); const texts = queryTexts(calls);
    assert.equal(res.statusCode, 400); assert.ok(texts.includes("ROLLBACK")); assert.equal(texts.includes("COMMIT"), false); assert.equal(texts.some((sql) => sql.includes("sal.void_pos_sale")), false); assert.equal(calls.filter((call) => call.type === "release").length, 1);
  });
});

test("POS void rolls back when lock or reversal fails and never completes", async (t) => {
  for (const failOn of ["pg_advisory_xact_lock", "sal.void_pos_sale"]) await t.test(failOn, async () => {
    const client = clientFor({ kind: "pos", failOn, rows: [posMovementLine()], expectedRows: [{ product_id: productA, lot_id: null, qty: "1.000" }] }); const { res, calls } = await run(voidPosSaleHandler, client, posRequest()); const texts = queryTexts(calls);
    assert.equal(res.statusCode, 400); assert.ok(texts.includes("ROLLBACK")); assert.equal(texts.includes("COMMIT"), false); if (failOn === "pg_advisory_xact_lock") assert.equal(texts.some((sql) => sql.includes("sal.void_pos_sale")), false); assert.equal(calls.filter((call) => call.type === "release").length, 1);
  });
});

test("customer-return void derives every non-null movement endpoint and preserves ordering", async () => {
  const client = clientFor({ kind: "return", rows: [{ posted_movement_id: "movement", product_id: productA, from_location_id: locationA, to_location_id: null }, { posted_movement_id: "movement", product_id: productB, from_location_id: null, to_location_id: locationB }, { posted_movement_id: "movement", product_id: productC, from_location_id: locationA, to_location_id: locationB }, { posted_movement_id: "movement", product_id: productD, from_location_id: null, to_location_id: null }] });
  const { res, calls } = await run(voidCustomerReturnHandler, client, { params: { id: "return" }, body: { reason: "correction" }, user: { user_id: userId } }); assert.equal(res.statusCode, 200); const texts = queryTexts(calls);
  const lookup = texts.findIndex((sql) => sql.includes("SELECT cr.posted_movement_id")); const firstLock = texts.findIndex((sql) => sql.includes("pg_advisory_xact_lock")); const reversal = texts.findIndex((sql) => sql.includes("sal.void_customer_return")); assert.ok(lookup < firstLock && firstLock < reversal && reversal < texts.indexOf("COMMIT"));
  assert.deepEqual(calls.filter((call) => call.type === "query" && call.sql.includes("pg_advisory_xact_lock")).map((call) => call.params[0]), [`stock-fulfil:${locationA}:${productA}`, `stock-fulfil:${locationA}:${productC}`, `stock-fulfil:${locationB}:${productB}`, `stock-fulfil:${locationB}:${productC}`]);
});

test("customer-return void rolls back for validation, lock, and reversal failures", async (t) => {
  const baseRows = [{ posted_movement_id: "movement", product_id: productA, from_location_id: locationA, to_location_id: null }];
  for (const item of [{ name: "missing movement", rows: [] }, { name: "missing product identifier", rows: [{ posted_movement_id: "movement", product_id: null, from_location_id: locationA, to_location_id: null }] }, { name: "lock failure", rows: baseRows, failOn: "pg_advisory_xact_lock" }, { name: "reversal failure", rows: baseRows, failOn: "sal.void_customer_return" }]) await t.test(item.name, async () => {
    const client = clientFor({ kind: "return", rows: item.rows, failOn: item.failOn }); const { res, calls } = await run(voidCustomerReturnHandler, client, { params: { id: "return" }, body: { reason: "correction" }, user: { user_id: userId } }); const texts = queryTexts(calls);
    assert.equal(res.statusCode, 400); assert.ok(texts.includes("ROLLBACK")); assert.equal(texts.includes("COMMIT"), false); assert.equal(calls.filter((call) => call.type === "release").length, 1);
  });
});
