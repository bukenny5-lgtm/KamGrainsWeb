import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { pool } from "../src/db.js";
import { fulfilStockRequestHandler } from "../src/routes/internalStockRequests.routes.js";

const userId = "99999999-9999-4999-8999-999999999999";
const sourceLocation = "11111111-1111-4111-8111-111111111111";
const destinationLocation = "22222222-2222-4222-8222-222222222222";
const transitLocation = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const requestLineId = "55555555-5555-4555-8555-555555555555";
const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function clientFor({ stock = [], reserved = "0", failOn = null } = {}) {
  const calls = [];
  const preparedLines = [];
  const client = {
    calls,
    preparedLines,
    release() { calls.push({ type: "release" }); },
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ type: "query", sql: text, params });
      if (failOn && text.includes(failOn)) throw new Error(`${failOn} failed`);
      if (text === "SELECT set_config('app.current_user_id', $1, true);") return { rowCount: 1, rows: [] };
      if (text.includes("SELECT r.* FROM inv.stock_request")) return { rowCount: 1, rows: [{ request_id: requestId, status: "APPROVED", preferred_source_branch_id: "branch", preferred_source_location_id: sourceLocation, requesting_branch_id: "dest-branch", requesting_location_id: destinationLocation, company_id: "company", request_no: "ISR-1" }] };
      if (text.includes("SELECT location_name,branch_id,company_id")) return { rowCount: 1, rows: [{ location_name: "Source", branch_id: "branch", company_id: "company", is_active: true, is_stock_holding: true }] };
      if (text.includes("SELECT is_active,is_stock_holding")) return { rowCount: 1, rows: [{ is_active: true, is_stock_holding: true }] };
      if (text.includes("SELECT location_id FROM app.location")) return { rowCount: 1, rows: [{ location_id: transitLocation }] };
      if (text.includes("SELECT request_line_id,product_id FROM inv.stock_request_line")) return { rowCount: 1, rows: [{ request_line_id: requestLineId, product_id: productId }] };
      if (text.includes("SELECT * FROM inv.stock_request_line")) return { rowCount: 1, rows: [{ request_line_id: requestLineId, product_id: productId, approved_qty: "100.000", supplied_qty: "0.000" }] };
      if (text.includes("SELECT COALESCE(sum(tl.qty),0) AS qty")) return { rowCount: 1, rows: [{ qty: reserved }] };
      if (text.includes("SELECT soh.lot_id,soh.qty_on_hand")) return { rowCount: stock.length, rows: stock };
      if (text.includes("INSERT INTO inv.stock_transfer(company_id")) return { rowCount: 1, rows: [{ stock_transfer_id: "transfer", transfer_no: "TRF-1" }] };
      if (text.includes("INSERT INTO inv.stock_transfer_line")) { preparedLines.push(params); return { rowCount: 1, rows: [] }; }
      if (text.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [] };
      if (text.includes("audit.log_business_event")) return { rowCount: 1, rows: [] };
      return { rowCount: 1, rows: [] };
    }
  };
  return client;
}

async function run(client, body = { lines: [{ request_line_id: requestLineId, qty: 6 }] }) {
  const restoreConnect = mock.method(pool, "connect", async () => client);
  const restoreQuery = mock.method(pool, "query", async () => ({ rowCount: 1, rows: [{ preferred_source_branch_id: "branch" }] }));
  try {
    const res = response();
    await fulfilStockRequestHandler({ params: { id: requestId }, body, user: { user_id: userId, roles: ["HEAD_OFFICE"] } }, res);
    return res;
  } finally {
    restoreConnect.mock.restore();
    restoreQuery.mock.restore();
  }
}

function texts(client) { return client.calls.filter((call) => call.type === "query").map((call) => call.sql); }

test("fulfilment allocates requested quantity when no stock is reserved", async () => {
  const client = clientFor({ stock: [{ lot_id: "lot-a", qty_on_hand: "10.000", available_qty: "10.000", unit_cost: "2.00" }] });
  const res = await run(client);
  assert.equal(res.statusCode, 201);
  assert.equal(client.preparedLines[0][3], 6);
});

test("fulfilment never allocates the reserved portion of a lot", async () => {
  const client = clientFor({ reserved: "6.000", stock: [{ lot_id: "lot-a", qty_on_hand: "10.000", available_qty: "4.000", unit_cost: "2.00" }] });
  const res = await run(client, { lines: [{ request_line_id: requestLineId, qty: 4 }] });
  assert.equal(res.statusCode, 201);
  assert.equal(client.preparedLines[0][3], 4);
});

test("multi-lot preparation consumes each lot only from its reservation-safe availability", async () => {
  const client = clientFor({ stock: [
    { lot_id: "lot-a", qty_on_hand: "10.000", available_qty: "2.000", unit_cost: "2.00" },
    { lot_id: "lot-b", qty_on_hand: "6.000", available_qty: "6.000", unit_cost: "2.50" }
  ] });
  const res = await run(client, { lines: [{ request_line_id: requestLineId, qty: 7 }] });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(client.preparedLines.map((line) => [line[2], line[3]]), [["lot-a", 2], ["lot-b", 5]]);
});

test("fulfilment fails before mutation when aggregate available stock is insufficient", async () => {
  const client = clientFor({ stock: [{ lot_id: "lot-a", qty_on_hand: "20.000", available_qty: "5.000", unit_cost: "2.00" }] });
  const res = await run(client, { lines: [{ request_line_id: requestLineId, qty: 8 }] });
  const sql = texts(client);
  assert.equal(res.statusCode, 409);
  assert.equal(client.preparedLines.length, 0);
  assert.equal(sql.some((item) => item.includes("INSERT INTO inv.stock_transfer")), false);
  assert.equal(sql.includes("COMMIT"), false);
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(client.calls.filter((call) => call.type === "release").length, 1);
});

test("fully reserved lot contributes zero to allocation", async () => {
  const client = clientFor({ reserved: "10.000", stock: [{ lot_id: "lot-a", qty_on_hand: "10.000", available_qty: "0.000", unit_cost: "2.00" }, { lot_id: "lot-b", qty_on_hand: "6.000", available_qty: "6.000", unit_cost: "2.50" }] });
  const res = await run(client, { lines: [{ request_line_id: requestLineId, qty: 4 }] });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(client.preparedLines.map((line) => [line[2], line[3]]), [["lot-b", 4]]);
});

test("lock failure rolls back without preparing a transfer", async () => {
  const client = clientFor({ failOn: "pg_advisory_xact_lock", stock: [{ lot_id: "lot-a", qty_on_hand: "10.000", available_qty: "10.000", unit_cost: "2.00" }] });
  const res = await run(client);
  const sql = texts(client);
  assert.equal(res.statusCode, 500);
  assert.equal(client.preparedLines.length, 0);
  assert.equal(sql.some((item) => item.includes("INSERT INTO inv.stock_transfer")), false);
  assert.equal(sql.includes("COMMIT"), false);
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(client.calls.filter((call) => call.type === "release").length, 1);
});

test("allocation uses one client from BEGIN through commit", async () => {
  const client = clientFor({ stock: [{ lot_id: "lot-a", qty_on_hand: "10.000", available_qty: "10.000", unit_cost: "2.00" }] });
  const res = await run(client);
  assert.equal(res.statusCode, 201);
  const sql = texts(client);
  const begin = sql.indexOf("BEGIN");
  const lock = sql.findIndex((item) => item.includes("pg_advisory_xact_lock"));
  const stock = sql.findIndex((item) => item.includes("SELECT soh.lot_id,soh.qty_on_hand"));
  const mutation = sql.findIndex((item) => item.includes("INSERT INTO inv.stock_transfer(company_id"));
  assert.ok(begin >= 0 && begin < lock && lock < stock && stock < mutation && mutation < sql.indexOf("COMMIT"));
  assert.equal(client.calls.filter((call) => call.type === "release").length, 1);
});
