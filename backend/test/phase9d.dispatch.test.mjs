import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/stockTransfers.routes.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_59_stock_transfer_dispatch_executions.sql", import.meta.url), "utf8");
const inventory = fs.readFileSync(new URL("../src/routes/inventory.routes.js", import.meta.url), "utf8");
const tasks = fs.readFileSync(new URL("../../frontend/src/pages/StockTransferTasks.tsx", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../../frontend/src/api/client.ts", import.meta.url), "utf8");

test("Phase 9D uses durable dispatch executions and supports partial dispatch", () => {
  assert.match(migration, /stock_transfer_dispatch/);
  assert.match(migration, /stock_transfer_dispatch_line/);
  assert.match(migration, /TEX-/);
  assert.match(migration, /PARTIALLY_DISPATCHED/);
  assert.match(route, /router\.post\("\/:id\/dispatch"/);
  assert.match(route, /idempotency_key/);
  assert.match(route, /TRANSFER_DISPATCHED/);
  assert.match(route, /stock_transfer_dispatch_line/);
  assert.match(route, /movement_type,document_no/);
  assert.match(route, /source location/);
  assert.match(route, /incoming-receipts/);
});

test("dispatch preserves inventory semantics and defers receipt posting", () => {
  assert.match(inventory, /PARTIALLY_DISPATCHED/);
  assert.match(inventory, /dispatched\.dispatched_qty/);
  assert.match(route, /source_location_id,t\.transit_location_id/);
  assert.match(route, /unit_cost/);
  assert.match(tasks, /Awaiting Dispatch/);
  assert.match(tasks, /Incoming Receipts/);
  assert.match(tasks, /Execute Dispatch/);
  assert.match(client, /getIncomingReceiptTasks/);
  assert.doesNotMatch(migration, /destination.*saleable/i);
});

test("dispatch path contains no GL posting", () => {
  const dispatchStart = route.indexOf('router.post("/:id/dispatch"');
  const receiveStart = route.indexOf('router.post("/:id/receive"');
  const dispatchSection = route.slice(dispatchStart, receiveStart);
  assert.doesNotMatch(dispatchSection, /INSERT INTO fin\.journal/);
  assert.doesNotMatch(dispatchSection, /INSERT INTO fin\.journal/);
});
