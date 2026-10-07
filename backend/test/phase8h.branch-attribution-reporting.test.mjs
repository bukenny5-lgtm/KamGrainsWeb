import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/tillSessions.routes.js", import.meta.url), "utf8");
const reports = fs.readFileSync(new URL("../src/routes/reports.routes.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_48_branch_financial_attribution_reporting.sql", import.meta.url), "utf8");

test("TILL_CASH attribution uses persisted session branch", () => {
  assert.match(migration, /resolve_till_cash_journal_branch/);
  assert.match(migration, /m\.branch_id, s\.branch_id/);
  assert.match(route, /UPDATE fin\.gl_journal SET branch_id=\$2/);
  assert.match(route, /FROM app\.cashier_session WHERE session_id=\$1/);
});

test("reporting separates business revenue from till movements", () => {
  assert.match(reports, /router\.get\("\/branch-performance"/);
  assert.match(reports, /reporting\.v_sales_event_lines/);
  assert.match(reports, /router\.get\("\/till-performance"/);
  assert.match(reports, /movement_type='SAFE_DROP'/);
  assert.match(reports, /s\.cash_variance/);
});

test("reports enforce branch scope for non-global roles", () => {
  assert.match(reports, /You are not authorized for the requested branch/);
  assert.match(reports, /roles\.some\(\(role\) => \["ADMIN", "HEAD_OFFICE", "AUDITOR"\]/);
});
