import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const route = fs.readFileSync(new URL("backend/src/routes/customerReturns.routes.js", root), "utf8");
const migration = fs.readFileSync(new URL("database/migrations/phase_56_finance_refund_paying_session.sql", root), "utf8");
const page = fs.readFileSync(new URL("frontend/src/pages/CustomerReturns.tsx", root), "utf8");

test("Phase 8R exposes a permission-protected paying-session selector", () => {
  assert.match(route, /refund-sessions.*PROCESS_REFUND/s);
  assert.match(route, /s\.status='OPEN'/);
  assert.match(route, /s\.location_id=r\.location_id/);
  assert.match(route, /paying_session_id/);
  assert.match(migration, /p_paying_session_id uuid/);
  assert.match(migration, /'CASH_REFUND'/);
  assert.match(migration, /status='OPEN'/);
  assert.match(page, /Paying Till Session/);
  assert.match(page, /Settle Refund/);
});

test("Phase 8R leaves void policy and posted return state intact", () => {
  assert.match(route, /requirePermission\("VOID_CUSTOMER_RETURN"\)/);
  assert.match(migration, /v_return\.status<>'POSTED'/);
  assert.match(migration, /refund_status=CASE/);
  assert.doesNotMatch(migration, /UPDATE sal\.customer_return[\s\S]*\bstatus\s*=/);
});
