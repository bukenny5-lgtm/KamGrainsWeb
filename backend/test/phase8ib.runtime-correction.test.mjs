import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/routes/finance.routes.js", import.meta.url), "utf8");
const createRoute = source;

assert.match(createRoute, /const branch_id = req\.branchId/);
assert.match(createRoute, /validateExpensePaymentAccount\(client, payment_account_id, normalizedMethod, branch_id\)/);
assert.match(createRoute, /INSERT INTO fin\.expense_voucher/);
assert.match(createRoute, /req\.branchId,\s*\n\s*finalVoucherNo/);
console.log("phase8ib.runtime-correction.test: PASS");
