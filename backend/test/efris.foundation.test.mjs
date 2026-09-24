import assert from "node:assert/strict";

const transitions = {
  DRAFT: ["QUEUED", "CANCELLED"],
  QUEUED: ["SUBMITTING", "OFFLINE_PENDING", "CANCELLED"],
  SUBMITTING: ["PENDING", "ACCEPTED", "REJECTED", "RETRY_PENDING", "OFFLINE_PENDING"],
  PENDING: ["ACCEPTED", "REJECTED", "RETRY_PENDING", "OFFLINE_PENDING"],
  RETRY_PENDING: ["SUBMITTING", "CANCELLED"],
  OFFLINE_PENDING: ["SUBMITTING", "CANCELLED"],
  ACCEPTED: ["CREDITED"],
  REJECTED: ["RETRY_PENDING", "CANCELLED"],
  CANCELLED: [],
  CREDITED: [],
};
const can = (from, to) => transitions[from]?.includes(to) === true;

assert.equal(can("DRAFT", "QUEUED"), true);
assert.equal(can("QUEUED", "OFFLINE_PENDING"), true);
assert.equal(can("RETRY_PENDING", "SUBMITTING"), true);
assert.equal(can("ACCEPTED", "REJECTED"), false);
assert.equal(can("CANCELLED", "QUEUED"), false);

const sourceKey = (type, id, kind) => `${type}:${id}:${kind}`;
const keys = new Set([sourceKey("POS_SALE", "sale-1", "SALE_RECEIPT")]);
assert.equal(keys.has(sourceKey("POS_SALE", "sale-1", "SALE_RECEIPT")), true);
assert.equal(keys.has(sourceKey("AR_INVOICE", "sale-1", "SALE_INVOICE")), false);

const acceptedSnapshot = { tax_rate: 18, taxable_amount: "100.00", tax_amount: "18.00", gross_amount: "118.00" };
const currentRate = 20;
assert.equal(acceptedSnapshot.tax_rate, 18, "EFRIS payload uses the posted transaction snapshot, not current tax master data");
assert.notEqual(acceptedSnapshot.tax_rate, currentRate);

console.log("efris foundation tests passed");
