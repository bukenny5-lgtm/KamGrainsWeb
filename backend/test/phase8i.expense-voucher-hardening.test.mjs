import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/finance.routes.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_49_expense_voucher_payment_account_hardening.sql", import.meta.url), "utf8");
const frontend = fs.readFileSync(new URL("../../frontend/src/pages/ExpenseVouchers.tsx", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/middleware/permissions.js", import.meta.url), "utf8");

test("voucher creation uses controlled payment accounts and validates expense lines", () => {
  assert.match(route, /fin\.payment_account_control pac/);
  assert.match(route, /account\.is_payment_account/);
  assert.match(route, /account\.account_type !== "ASSET"/);
  assert.match(route, /validateExpenseLines/);
  assert.match(migration, /fin\.assert_payment_account_can_pay/);
  assert.match(migration, /ea\.account_type<>'EXPENSE'/);
});

test("posted voucher journal uses persisted branch and voucher date", () => {
  assert.match(migration, /v_voucher\.voucher_date/);
  assert.match(migration, /v_voucher\.branch_id/);
  assert.match(migration, /source_module.*EXP/);
  assert.match(migration, /Expense voucher .*already posted/);
});

test("void preserves original and creates one balanced reversal", () => {
  assert.match(permissions, /VOID_EXPENSE_VOUCHER: \["ADMIN", "MANAGER", "FINANCE"\]/);
  assert.match(route, /\/expense-vouchers\/:voucherNo\/void/);
  assert.match(migration, /void_expense_voucher_by_no/);
  assert.match(migration, /credit,debit/);
  assert.match(migration, /already reversed/);
  assert.match(frontend, /getPaymentAccounts/);
  assert.match(frontend, /VOID_EXPENSE_VOUCHER/);
});

test("cashbook uses active controlled payment accounts and classifies transfers", () => {
  assert.match(route, /fin\.payment_account_control pac/);
  assert.match(route, /INTERNAL_TRANSFER/);
  assert.doesNotMatch(route, /ga\.account_code IN \('1000', '1010'\)/);
});
