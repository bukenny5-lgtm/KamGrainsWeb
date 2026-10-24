import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/internalStockRequests.routes.js", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/middleware/permissions.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_57_stock_request_hardening.sql", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../frontend/src/pages/InternalStockRequests.tsx", import.meta.url), "utf8");

test("stock request lifecycle has separated submit/cancel permissions and guarded cancellation", () => {
  assert.match(permissions, /SUBMIT_STOCK_REQUEST/);
  assert.match(permissions, /CANCEL_STOCK_REQUEST/);
  assert.match(route, /requirePermission\("SUBMIT_STOCK_REQUEST"\)/);
  assert.match(route, /requirePermission\("CANCEL_STOCK_REQUEST"\)/);
  assert.match(route, /cancellation_reason/);
  assert.match(route, /transfer reservations, dispatches, or supplied quantity/);
});

test("stock request read model exposes linked transfer progress and filters", () => {
  assert.match(route, /qty_allocated/);
  assert.match(route, /qty_dispatched/);
  assert.match(route, /qty_received/);
  assert.match(route, /requesting_location_id/);
  assert.match(route, /source_location_id/);
  assert.match(route, /request_date>=/);
  assert.match(route, /product_names/);
});

test("stock request UI uses shared row interaction and wide progress modal", () => {
  assert.match(page, /useRowInteraction/);
  assert.match(page, /getRowProps/);
  assert.match(page, /!w-\[92vw\] !max-w-6xl/);
  assert.match(page, /Linked transfer progress/);
  assert.doesNotMatch(page, /Create Transfer for Available Quantity/);
});

test("stock request hardening migration is forward-only and additive", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS cancelled_by/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS cancellation_reason/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS/);
});
