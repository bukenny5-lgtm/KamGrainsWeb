import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../../database/migrations/phase_47_payment_account_transfers.sql", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/routes/paymentAccountTransfers.routes.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../frontend/src/components/PaymentAccountTransfers.tsx", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/middleware/permissions.js", import.meta.url), "utf8");

test("Phase 8G has durable transfer, journal, reversal, and idempotency fields", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS fin\.payment_account_transfer/);
  assert.match(migration, /idempotency_key uuid NOT NULL UNIQUE/);
  assert.match(migration, /journal_id uuid NULL REFERENCES fin\.gl_journal/);
  assert.match(migration, /reversal_journal_id uuid NULL REFERENCES fin\.gl_journal/);
  assert.match(migration, /status text NOT NULL DEFAULT 'POSTED'/);
});

test("Phase 8G route validates accounts, locks source records, journals atomically, and supports void", () => {
  assert.match(route, /accountForUpdate/);
  assert.match(route, /Source account has insufficient available balance/);
  assert.match(route, /CASH->CASH.*CASH->BANK.*BANK->CASH/s);
  assert.match(route, /fin\.create_journal\('TRF'/);
  assert.match(route, /fin\.assert_balanced/);
  assert.match(route, /idempotency_key/);
  assert.match(route, /\/:transferId\/void/);
  assert.doesNotMatch(route, /1000|1110|1120/);
});

test("Phase 8G permissions exclude ordinary cashier and sales roles", () => {
  assert.match(permissions, /VIEW_PAYMENT_ACCOUNT_TRANSFERS: \["ADMIN", "MANAGER", "FINANCE", "AUDITOR"\]/);
  assert.match(permissions, /POST_PAYMENT_ACCOUNT_TRANSFER: \["ADMIN", "MANAGER", "FINANCE"\]/);
  assert.match(permissions, /VOID_PAYMENT_ACCOUNT_TRANSFER: \["ADMIN", "MANAGER", "FINANCE"\]/);
});

test("Phase 8G UI provides human-readable transfer preview and history", () => {
  assert.match(page, /Source after/);
  assert.match(page, /Destination after/);
  assert.match(page, /Confirm Transfer/);
  assert.match(page, /Payment Account Transfer History/);
  assert.match(page, /crypto\.randomUUID\(\)/);
});
