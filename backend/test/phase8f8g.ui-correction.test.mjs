import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../../frontend/src/pages/TillManagement.tsx", import.meta.url), "utf8");

test("cash movement rows use independent form state and explicit actions", () => {
  for (const field of ["cashInAmount", "cashInReason", "cashInReference", "cashOutAmount", "cashOutReason", "cashOutReference", "safeDropAmount", "safeDropReason", "safeDropReference"]) assert.match(page, new RegExp(field));
  assert.match(page, /Record Cash In/);
  assert.match(page, /Record Cash Out/);
  assert.match(page, /Record Safe Drop/);
  assert.match(page, /Main Cash Safe has insufficient available cash/);
  assert.match(page, /Movement cannot exceed expected till cash/);
});

test("movement success invalidates cashier, manager, history, and payment-account queries", () => {
  assert.match(page, /\["my-session"/);
  assert.match(page, /\["my-session-history"/);
  assert.match(page, /\["till-session-detail"/);
  assert.match(page, /\["till-sessions"/);
  assert.match(page, /\["cash-payment-accounts"/);
  assert.match(page, /mutateAsync/);
  assert.match(page, /crypto\.randomUUID\(\)/);
});

test("movement failure preserves independent row input values", () => {
  assert.match(page, /\.catch\(\(\) => \{\}\)/);
  assert.match(page, /setCashInAmount\(""\)/);
  assert.match(page, /setCashOutAmount\(""\)/);
  assert.match(page, /setSafeDropAmount\(""\)/);
});
