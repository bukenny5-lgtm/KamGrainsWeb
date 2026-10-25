import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/stockTransfers.routes.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../frontend/src/pages/StockTransferTasks.tsx", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../../frontend/src/api/client.ts", import.meta.url), "utf8");

test("receipt tasks use persisted destination scope and business references", () => {
  assert.match(route, /incoming-receipts/);
  assert.match(route, /o\.destination_branch_id=\$1/);
  assert.match(route, /o\.destination_location_id/);
  assert.match(route, /user_location/);
  assert.match(route, /rq\.request_no/);
  assert.match(route, /source_branch_id/);
  assert.match(route, /source_location_id/);
  assert.match(route, /date_from/);
  assert.match(route, /date_to/);
  assert.match(route, /dispatches\/:id/);
});

test("receipt UI keeps NEW RECEIPT read-only and avoids UUID references", () => {
  assert.match(page, /NEW RECEIPT/);
  assert.match(page, /Legacy \/ No Stock Request/);
  assert.match(page, /getStockTransferDispatch/);
  assert.match(page, /No receipt is posted from this view/);
  assert.doesNotMatch(page, /window\.alert\(`Dispatch/);
  assert.match(page, /stock-transfer-dispatch/);
  assert.match(page, /incoming-receipts/);
});

test("receipt detail API is exposed to the frontend", () => {
  assert.match(client, /getStockTransferDispatch/);
  assert.match(client, /stock-transfers\/dispatches/);
});
