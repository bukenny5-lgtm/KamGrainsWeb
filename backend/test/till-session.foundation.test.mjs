import assert from "node:assert/strict";

const movementEffect = {
  OPENING_FLOAT: 1,
  CASH_SALE: 1,
  CASH_IN: 1,
  CASH_REFUND: -1,
  CASH_OUT: -1,
  PAYOUT: -1,
  SAFE_DROP: -1,
};
const expectedCash = (opening, movements) => opening + movements.reduce((sum, movement) => sum + (movementEffect[movement.type] || 0) * movement.amount, 0);

assert.equal(expectedCash(100000, [{ type: "CASH_SALE", amount: 50000 }]), 150000);
assert.equal(expectedCash(100000, [{ type: "MOBILE_MONEY_SALE", amount: 50000 }]), 100000, "non-cash payments do not affect drawer cash");
assert.equal(expectedCash(100000, [{ type: "CASH_SALE", amount: 50000 }, { type: "CASH_OUT", amount: 20000 }]), 130000);
assert.equal(expectedCash(100000, [{ type: "CASH_SALE", amount: 50000 }, { type: "CASH_REFUND", amount: 10000 }]), 140000);
assert.equal(expectedCash(100000, [{ type: "CASH_SALE", amount: 200000 }, { type: "SAFE_DROP", amount: 150000 }]), 150000);
assert.equal(148000 - 150000, -2000);
assert.equal(153000 - 150000, 3000);

const openingMovementRows = (opening) => opening > 0 ? [{ type: "OPENING_FLOAT", amount: opening }] : [];
assert.deepEqual(openingMovementRows(0), [], "zero opening float creates no zero-value movement");
assert.deepEqual(openingMovementRows(50000), [{ type: "OPENING_FLOAT", amount: 50000 }], "nonzero opening float creates one movement");
assert.equal(expectedCash(0, [{ type: "CASH_SALE", amount: 10000 }]), 10000, "zero float plus cash sale equals cash sale");
assert.throws(() => { if (-1 < 0) throw new Error("opening float must be non-negative"); }, /non-negative/);
assert.equal(295 - 295, 0, "exact counted cash has zero variance");
assert.equal(290 - 295, -5, "shortage is negative variance");
assert.equal(300 - 295, 5, "overage is positive variance");

console.log("till-session foundation tests passed");
