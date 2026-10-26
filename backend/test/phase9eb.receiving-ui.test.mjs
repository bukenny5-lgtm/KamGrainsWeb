import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../../frontend/src/pages/StockTransferTasks.tsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/routes/stockTransfers.routes.js", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../../frontend/src/api/client.ts", import.meta.url), "utf8");

test("Phase 9E-B keeps receipt history independent from the active queue default", () => {
  assert.match(page, /setReceiptStatus\(""\)/);
  assert.match(page, /Receipt History/);
  assert.match(page, /getTransferReceiptHistory/);
  assert.match(page, /Receive Stock/);
});

test("Phase 9E-B defaults receipt inputs to execution outstanding quantities", () => {
  assert.match(page, /setReceiveQty\(Object\.fromEntries/);
  assert.match(page, /outstanding_qty/);
  assert.match(page, /Previously Received/);
  assert.match(page, /Outstanding/);
  assert.match(page, /Receive Now/);
});

test("Phase 9E-B keeps fully received executions out of active receipt work", () => {
  assert.match(page, /outstanding_qty/);
  assert.match(page, /Incoming Receipts/);
  assert.match(route, /FULLY RECEIVED/);
});

test("Phase 9E-C exposes authoritative receive capability and blocked-location UX", () => {
  assert.match(route, /receive-capability/);
  assert.match(route, /can_receive/);
  assert.match(route, /receive_block_reason/);
  assert.match(route, /receiving access to the destination location/);
  assert.match(page, /Receive Stock/);
  assert.match(page, /receive_block_reason/);
  assert.match(client, /getStockTransferDispatchCapability/);
  assert.match(client, /receive-capability/);
  assert.doesNotMatch(page, /receiveStockTransfer\(/);
});
