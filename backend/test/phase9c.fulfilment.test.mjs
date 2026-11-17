import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/internalStockRequests.routes.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_58_stock_fulfilment_preparation.sql", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../frontend/src/pages/StockTransferTasks.tsx", import.meta.url), "utf8");
const historyPage = fs.readFileSync(new URL("../../frontend/src/pages/InternalStockRequests.tsx", import.meta.url), "utf8");
const reservationsRoute = fs.readFileSync(new URL("../src/routes/stockReservations.routes.js", import.meta.url), "utf8");

test("Phase 9C preparation is transactional, linked, partial, and idempotent", () => {
  assert.match(route, /router\.post\("\/:id\/fulfil"/);
  assert.match(route, /REQUEST_OUTSTANDING_EXCEEDED/);
  assert.match(route, /lockStockItems\(c,/);
  assert.match(route, /TRANSFER_PREPARED/);
  assert.match(route, /request_line_id/);
  assert.match(route, /lot_id/);
  assert.match(migration, /idempotency_key/);
  assert.match(page, /Prepare transfer draft/);
  assert.match(page, /Current Availability/);
  assert.match(page, /internal-stock-requests/);
  assert.match(page, /stock-transfers/);
  assert.match(historyPage, /qty_allocated/);
  assert.match(route, /FILTER \(WHERE t\.status IN\('DRAFT','PARTIALLY_DISPATCHED','IN_TRANSIT'\)\)/);
  assert.match(reservationsRoute, /status = 'DRAFT'/);
});

test("fulfilment does not post stock movement or accounting", () => {
  assert.doesNotMatch(route, /INSERT INTO inv\.stock_movement/);
  assert.doesNotMatch(route, /INSERT INTO fin\.journal/);
});
