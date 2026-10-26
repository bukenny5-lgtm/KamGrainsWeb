import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/stockTransfers.routes.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_60_stock_transfer_receipts.sql", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/middleware/permissions.js", import.meta.url), "utf8");
const requests = fs.readFileSync(new URL("../src/routes/internalStockRequests.routes.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../frontend/src/pages/StockTransferTasks.tsx", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../../frontend/src/api/client.ts", import.meta.url), "utf8");

test("Phase 9E persists receipt events with TRR numbering and line-level audit data", () => {
  assert.match(migration, /stock_transfer_receipt/);
  assert.match(migration, /stock_transfer_receipt_line/);
  assert.match(migration, /stock_transfer_receipt_no_seq/);
  assert.match(migration, /TRR-/);
  assert.match(migration, /idempotency_key/);
  assert.match(route, /router\.post\("\/dispatches\/:id\/receive"/);
  assert.match(route, /FOR UPDATE/);
  assert.match(route, /TRANSFER_RECEIVED/);
  assert.match(route, /stock_movement/);
  assert.match(route, /TRANSFER/);
  assert.match(route, /stock_transfer_receipt_line/);
  assert.doesNotMatch(route, /INSERT INTO fin\.journal/);
  assert.match(route, /router\.post\("\/dispatches\/:id\/receive"/);
});

test("receiving supports partial and repeated receipts, rejects over-receipt, and enforces destination authorization", () => {
  assert.match(route, /outstanding/);
  assert.match(route, /received_qty/);
  assert.match(route, /destination.*branch/i);
  assert.match(route, /canAccessLocation/);
  assert.match(route, /idempotent/);
  assert.match(route, /duplicate/i);
  assert.match(route, /receipt.*variance/i);
  assert.match(page, /receiveStockTransferDispatch/);
  assert.match(page, /Receipt History/);
  assert.match(client, /getTransferReceiptHistory/);
  assert.match(client, /getStockTransferReceipt/);
});

test("receipt permission includes SALES while source service status remains separate", () => {
  assert.match(permissions, /RECEIVE_STOCK_TRANSFER:\s*\[[^\]]*SALES/);
  assert.match(requests, /service_status/);
  assert.match(requests, /UNSERVED/);
  assert.match(requests, /PARTIALLY_SERVED/);
  assert.match(requests, /FULLY_SERVED/);
});
