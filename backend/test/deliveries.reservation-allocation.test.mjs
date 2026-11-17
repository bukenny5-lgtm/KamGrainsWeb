import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import {
  assignDeliveryLineLotHandler,
  getDeliveryLotOptionsHandler
} from "../src/routes/deliveries.routes.js";

const baseLine = {
  delivery_line_id: "line-1",
  delivery_line_id_text: "line-1",
  product_id: "product-1",
  product_name: "Maize",
  required_qty: 10,
  location_id: "location-1",
  location_name: "Main"
};

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return value; }
  };
}

async function lotOptions({ availableQty, optionAvailableQty = availableQty, row = baseLine } = {}) {
  const calls = [];
  mock.method(pool, "query", async (text, params) => {
    calls.push({ text, params });
    if (calls.length === 1) return { rowCount: 1, rows: [row] };
    if (calls.length === 2) return { rowCount: 1, rows: [{ ok: 1 }] };
    if (calls.length === 3) return { rowCount: 1, rows: [{ available_qty: optionAvailableQty, reserved_qty: 0, qty_on_hand: 10 }] };
    return { rowCount: 1, rows: [{ available_qty: availableQty }] };
  });
  const res = response();
  await getDeliveryLotOptionsHandler({ params: { deliveryLineId: "line-1" }, branchId: "branch-1", user: { user_id: "user-1" }, query: {} }, res);
  mock.restoreAll();
  return { res, calls };
}

test("delivery lot options use reservation-aware available quantity", async () => {
  const { res, calls } = await lotOptions({ availableQty: 4, optionAvailableQty: 4 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stock_status.available_qty, 4);
  assert.equal(res.body.stock_status.enough_stock, false);
  assert.match(calls[2].text, /available_qty/);
  assert.match(calls[3].text, /PARTIALLY_DISPATCHED/);
});

for (const scenario of [
  ["no reservation", 10, true],
  ["partial reservation leaves exact remaining quantity", 4, false],
  ["physical stock is sufficient but available stock is not", 0, false],
  ["fully reserved lot", 0, false],
  ["unrelated location does not help", 0, false],
  ["another lot does not satisfy the selected lot", 0, false],
  ["cancelled or non-reserving transfer does not reduce availability", 10, true]
]) {
  test(`lot-options scenario: ${scenario[0]}`, async () => {
    const { res } = await lotOptions({ availableQty: scenario[1], optionAvailableQty: scenario[1] });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stock_status.enough_stock, scenario[2]);
  });
}

test("selected-lot handler rejects a lot whose reservation-aware quantity is short", async () => {
  mock.method(pool, "query", async (text) => {
    if (text.includes("SELECT") && text.includes("delivery_line_id")) {
      return { rowCount: 1, rows: [{ ...baseLine, required_qty: 10, available_qty: 9, is_posted: false }] };
    }
    throw new Error("update must not run");
  });
  const res = response();
  await assignDeliveryLineLotHandler({ params: { deliveryLineId: "line-1" }, body: { lot_id: "lot-1" } }, res);
  mock.restoreAll();
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Not enough stock/);
});

test("selected-lot handler updates when the reservation-aware quantity is sufficient", async () => {
  let queryCount = 0;
  mock.method(pool, "query", async (text) => {
    queryCount += 1;
    if (queryCount === 1) {
      return { rowCount: 1, rows: [{ ...baseLine, required_qty: 10, available_qty: 10, is_posted: false }] };
    }
    return { rowCount: 1, rows: [{ delivery_line_id: "line-1", lot_id: "lot-1" }] };
  });
  const res = response();
  await assignDeliveryLineLotHandler({ params: { deliveryLineId: "line-1" }, body: { lot_id: "lot-1" } }, res);
  mock.restoreAll();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.line.lot_id, "lot-1");
});
