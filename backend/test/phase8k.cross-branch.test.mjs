import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../../database/migrations/phase_52_cross_branch_cash_transfers.sql", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/routes/paymentAccountTransfers.routes.js", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/middleware/permissions.js", import.meta.url), "utf8");

test("phase 8K migration defines reusable cross-branch state and transit configuration", () => {
  for (const field of ["source_branch_id", "destination_branch_id", "transfer_type", "submitted_by", "approved_by", "dispatched_at", "received_at", "received_amount", "source_journal_id", "destination_journal_id"]) assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`));
  assert.match(migration, /cross_branch_account_configuration/);
  assert.match(migration, /Cash in Transit/);
  assert.match(migration, /allow_cross_branch_funding/);
});

test("phase 8K route preserves same-branch path and implements controlled lifecycle", () => {
  assert.match(route, /router\.post\("\/cross-branch"/);
  for (const action of ["submit", "approve", "dispatch", "receive", "cancel", "reverse"]) assert.match(route, new RegExp(`router\.post\\\("/:transferId/${action}`));
  for (const event of ["CROSS_BRANCH_TRANSFER_CREATED", "CROSS_BRANCH_TRANSFER_SUBMITTED", "CROSS_BRANCH_TRANSFER_APPROVED", "CROSS_BRANCH_TRANSFER_DISPATCHED", "CROSS_BRANCH_TRANSFER_RECEIVED", "CROSS_BRANCH_TRANSFER_RECEIPT_VARIANCE", "CROSS_BRANCH_TRANSFER_CANCELLED", "CROSS_BRANCH_TRANSFER_REVERSED"]) assert.match(route, new RegExp(event));
  assert.match(route, /Only the maker cannot approve|maker cannot approve/);
  assert.match(route, /Active tills cannot receive/);
  assert.match(route, /receivedAmount !== Number\(transfer\.amount\)/);
  assert.match(route, /CASH_IN_TRANSIT|cash_in_transit_account_id/);
});

test("phase 8K permissions exclude sales and cashier roles", () => {
  for (const action of ["VIEW_CROSS_BRANCH_TRANSFERS", "CREATE_CROSS_BRANCH_TRANSFER", "APPROVE_CROSS_BRANCH_TRANSFER", "DISPATCH_CROSS_BRANCH_TRANSFER", "RECEIVE_CROSS_BRANCH_TRANSFER", "CANCEL_CROSS_BRANCH_TRANSFER", "REVERSE_CROSS_BRANCH_TRANSFER"]) {
    const line = permissions.split("\n").find((value) => value.includes(`${action}:`));
    assert.ok(line);
    assert.doesNotMatch(line, /SALES|CASHIER/);
  }
});
