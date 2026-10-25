import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/internalStockRequests.routes.js", import.meta.url), "utf8");
const historyRoute = route.split('router.get("/:id"')[0];
const page = fs.readFileSync(new URL("../../frontend/src/pages/InternalStockRequests.tsx", import.meta.url), "utf8");

test("request history keeps requesting-side and source-side authorization", () => {
  assert.match(route, /r\.requesting_branch_id,r\.preferred_source_branch_id/);
  assert.match(route, /VIEW_ALL_STOCK_REQUESTS/);
  assert.match(route, /requesting_branch_id/);
  assert.match(route, /source_branch_id/);
  assert.match(route, /date_from/);
  assert.match(route, /date_to/);
});

test("dispatch progress aggregation does not break historical request listing", () => {
  assert.match(historyRoute, /LEFT JOIN LATERAL\(SELECT SUM\(dl\.qty\)/);
  assert.match(historyRoute, /t2\.stock_request_id=r\.request_id/);
  assert.doesNotMatch(historyRoute, /WHERE d\.stock_transfer_id=t\.stock_transfer_id\),COALESCE/);
  assert.match(historyRoute, /PARTIALLY_DISPATCHED/);
});

test("history filters remain separate from active queues and expose API errors", () => {
  assert.match(page, /Request History/);
  assert.match(page, /All statuses/);
  assert.match(page, /Requesting Branch/);
  assert.match(page, /Receiving Location/);
  assert.match(page, /Source Branch/);
  assert.match(page, /Source Location/);
  assert.match(page, /Stock request history could not be loaded/);
  assert.match(page, /No stock requests match the current filters/);
});
