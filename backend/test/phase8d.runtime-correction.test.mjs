import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/routes/tillSessions.routes.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../../frontend/src/pages/TillManagement.tsx", import.meta.url), "utf8");
const paymentPage = fs.readFileSync(new URL("../../frontend/src/pages/PaymentAccounts.tsx", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../database/migrations/phase_45_payment_account_cash_controls.sql", import.meta.url), "utf8");
const phase8fMigration = fs.readFileSync(new URL("../../database/migrations/phase_46_till_cash_carry_forward_handover.sql", import.meta.url), "utf8");

test("my-session activity SQL qualifies created_at", () => {
  assert.match(route, /ps\.created_at AS activity_created_at/);
  assert.match(route, /ORDER BY activity_created_at/);
  assert.doesNotMatch(route, /SELECT 'POS_SALE',[^`]*,created_at,pu\.full_name/);
});

test("till account edits validate CASH accounts and preserve partial mappings", () => {
  assert.match(route, /Till cash account must be an active CASH payment account/);
  assert.match(route, /cash_payment_account_id === undefined/);
  assert.match(route, /Close the active till session before changing the till cash account/);
});

test("manager UI exposes existing till editing and occupied empty state", () => {
  assert.match(page, /Edit Till/);
  assert.match(page, /cash_payment_account_id/);
  assert.match(page, /No available tills\. All eligible tills currently have active sessions\./);
  assert.match(page, /Active Session — \{session\.session_no\}/);
  assert.match(page, /Force Close Session/);
  assert.match(page, /session\.status === "OPEN"/);
});

test("Phase 8E cash controls use shared operational accounts", () => {
  assert.match(migration, /'1110', 'Cash in Tills'/);
  assert.match(migration, /'1120', 'Main Cash Safe'/);
  assert.match(migration, /'TILL-CASH'/);
  assert.match(migration, /'MAIN-SAFE'/);
  assert.match(route, /Till Cash and Safe\/Main Cash must use different GL accounts/);
  assert.match(route, /sourceAccount/);
  assert.match(route, /destinationAccount/);
  assert.match(paymentPage, /Create Payment Account/);
  assert.match(paymentPage, /getAvailablePaymentAccountGlAccounts/);
});

test("Phase 8E separates the session lock from nullable account joins", () => {
  assert.match(route, /SELECT \* FROM app\.cashier_session WHERE session_id=\$1 AND status='OPEN' FOR UPDATE/);
  assert.match(route, /LEFT JOIN fin\.payment_account_control tc/);
  assert.match(route, /WHERE s\.session_id=\$1"/);
});

test("Phase 8E manager session selection and fresh submission keys are explicit", () => {
  assert.match(page, /selectedAssignmentTillId/);
  assert.match(page, /selectedSessionId/);
  assert.match(page, /setSelectedSessionId\(active\.data\.data\.session_id\)/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /View Session/);
  assert.match(page, /Record Cash In/);
  assert.match(page, /Record Safe Drop/);
});

test("Phase 8F persists opening sources, dispositions, and handover workflow", () => {
  assert.match(phase8fMigration, /opening_source/);
  assert.match(phase8fMigration, /MAIN_SAFE.*CARRY_FORWARD.*EXISTING_TILL_BALANCE/s);
  assert.match(phase8fMigration, /cash_disposition/);
  assert.match(phase8fMigration, /CREATE TABLE IF NOT EXISTS app\.till_cash_handover/);
  assert.match(route, /opening-options/);
  assert.match(route, /opening_source_session_id/);
  assert.match(route, /SAFE_TRANSFER.*CARRY_FORWARD.*LEAVE_IN_TILL.*HANDOVER/s);
  assert.match(route, /handovers\/:handoverId\/accept/);
  assert.match(route, /Accepted cashier handover/);
});

test("Phase 8F UI exposes source and close disposition controls", () => {
  assert.match(page, /getTillOpeningOptions/);
  assert.match(page, /Main Safe funding/);
  assert.match(page, /Carry-forward/);
  assert.match(page, /openingSource/);
  assert.match(page, /cashDisposition/);
  assert.match(page, /handover_to_user_id/);
});
