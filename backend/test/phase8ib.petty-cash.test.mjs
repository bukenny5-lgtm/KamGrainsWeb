import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../../database/migrations/phase_50_branch_petty_cash.sql", import.meta.url), "utf8");
const paymentAccounts = fs.readFileSync(new URL("../src/routes/paymentAccounts.routes.js", import.meta.url), "utf8");
const transfers = fs.readFileSync(new URL("../src/routes/paymentAccountTransfers.routes.js", import.meta.url), "utf8");
const reports = fs.readFileSync(new URL("../src/routes/reports.routes.js", import.meta.url), "utf8");
const vouchers = fs.readFileSync(new URL("../src/routes/finance.routes.js", import.meta.url), "utf8");
const till = fs.readFileSync(new URL("../../frontend/src/pages/TillManagement.tsx", import.meta.url), "utf8");

assert.match(migration, /account_role text NOT NULL DEFAULT 'GENERAL'/);
assert.match(migration, /account_role = 'PETTY_CASH'/);
assert.match(migration, /account_code, account_name, account_type, is_control, is_active/);
assert.match(paymentAccounts, /PETTY_CASH requires a branch/);
assert.match(transfers, /Cross-branch payment-account transfers are not supported/);
assert.match(transfers, /Petty Cash can only be funded from a same-branch source/);
assert.match(reports, /\/petty-cash-activity/);
assert.match(vouchers, /reversal_journal_no/);
assert.match(vouchers, /Petty Cash payment accounts can only be used by their owning branch/);
assert.doesNotMatch(till, /Record Cash Out/);
console.log("phase8ib.petty-cash.test: PASS");
