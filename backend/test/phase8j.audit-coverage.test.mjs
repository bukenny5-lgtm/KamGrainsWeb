import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../../database/migrations/phase_51_audit_coverage_hardening.sql", import.meta.url), "utf8");
const auditRoute = fs.readFileSync(new URL("../src/routes/auditEvents.routes.js", import.meta.url), "utf8");
const auditService = fs.readFileSync(new URL("../src/services/audit.service.js", import.meta.url), "utf8");
const finance = fs.readFileSync(new URL("../src/routes/finance.routes.js", import.meta.url), "utf8");
const transfers = fs.readFileSync(new URL("../src/routes/paymentAccountTransfers.routes.js", import.meta.url), "utf8");

assert.match(migration, /CREATE OR REPLACE FUNCTION audit\.log_business_event/);
assert.match(migration, /CREATE OR REPLACE FUNCTION audit\.log_business_event_from_row/);
assert.match(migration, /audit_business_event_trg/);
assert.match(migration, /audit_event_business_event_idempotency_idx/);
assert.match(auditService, /audit\.log_business_event/);
assert.match(auditRoute, /requirePermission\("VIEW_AUDIT"\)/);
assert.match(auditRoute, /authorized branch context is required to view audit events/);
assert.match(finance, /EXPENSE_VOUCHER_CREATED/);
assert.match(finance, /EXPENSE_VOUCHER_POSTED/);
assert.match(finance, /EXPENSE_VOUCHER_REVERSED/);
assert.match(transfers, /PAYMENT_ACCOUNT_TRANSFER_POSTED/);
assert.match(transfers, /PAYMENT_ACCOUNT_TRANSFER_REVERSED/);
console.log("phase8j.audit-coverage.test: PASS");
