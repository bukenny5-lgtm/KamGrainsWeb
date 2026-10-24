import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/internalStockRequests.routes.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../frontend/src/pages/InternalStockRequests.tsx", import.meta.url), "utf8");
const tasks = fs.readFileSync(new URL("../../frontend/src/pages/StockTransferTasks.tsx", import.meta.url), "utf8");
const requests = fs.readFileSync(new URL("../../frontend/src/pages/InternalStockRequests.tsx", import.meta.url), "utf8");

test("approval is source-branch scoped with an explicit admin override", () => {
  assert.match(route, /selected source branch/);
  assert.match(route, /preferred_source_branch_id/);
  assert.match(route, /approval-scope/);
  assert.match(route, /\["ADMIN", "HEAD_OFFICE"\]/);
});

test("request creation exposes advisory positive-stock source availability", () => {
  assert.match(page, /Preferred Source Location/);
  assert.match(page, /availableProductIds/);
  assert.match(page, /Partial fulfilment may be required/);
  assert.match(page, /requesting_branch_id/);
});

test("task queue derives active work without adding persisted statuses", () => {
  assert.match(tasks, /NEW_REQUESTS/);
  assert.match(tasks, /READY_FOR_FULFILMENT/);
  assert.match(tasks, /outstanding_qty/);
  assert.match(tasks, /Stock Transfer Tasks/);
});

test("task detail is business-facing and submission resets the entry workflow", () => {
  assert.doesNotMatch(tasks, /JSON\.stringify/);
  assert.doesNotMatch(tasks, /<pre/);
  assert.match(tasks, /Requesting Branch/);
  assert.match(tasks, /Approve quantities/);
  assert.match(tasks, /Current Availability/);
  assert.match(requests, /submitted successfully/);
  assert.match(requests, /setSelectedId\(""\)/);
});
