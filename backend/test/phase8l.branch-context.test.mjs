import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../../database/migrations/phase_53_branch_user_operating_context.sql", import.meta.url), "utf8");
const branches = fs.readFileSync(new URL("../src/routes/branches.routes.js", import.meta.url), "utf8");
const locations = fs.readFileSync(new URL("../src/routes/locations.routes.js", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../src/routes/auth.routes.js", import.meta.url), "utf8");
const users = fs.readFileSync(new URL("../src/routes/users.routes.js", import.meta.url), "utf8");
const usersPage = fs.readFileSync(new URL("../../frontend/src/pages/Users.tsx", import.meta.url), "utf8");
const tills = fs.readFileSync(new URL("../src/routes/tillSessions.routes.js", import.meta.url), "utf8");
const tillPage = fs.readFileSync(new URL("../../frontend/src/pages/TillManagement.tsx", import.meta.url), "utf8");
const quickSale = fs.readFileSync(new URL("../../frontend/src/pages/PosQuickSale.tsx", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../src/routes/dashboard.routes.js", import.meta.url), "utf8");
const dashboardPage = fs.readFileSync(new URL("../../frontend/src/pages/Dashboard.tsx", import.meta.url), "utf8");
const accessPanel = fs.readFileSync(new URL("../../frontend/src/components/BranchAccessPanel.tsx", import.meta.url), "utf8");
const setupPage = fs.readFileSync(new URL("../../frontend/src/pages/Setup.tsx", import.meta.url), "utf8");
const permissions = fs.readFileSync(new URL("../src/middleware/permissions.js", import.meta.url), "utf8");
const auditMigration = fs.readFileSync(new URL("../../database/migrations/phase_54_expand_audit_event_actions.sql", import.meta.url), "utf8");

test("phase 8N exposes branch-scoped location setup management", () => {
  assert.match(branches, /router\.get\("\/management"/);
  assert.match(branches, /is_saleable/);
  assert.match(branches, /is_stock_holding/);
  assert.match(locations, /resolveManagementScope/);
  assert.match(locations, /v_stock_on_hand_active/);
  assert.match(locations, /LOCATION_UPDATED/);
  assert.match(locations, /inactive location cannot be enabled for sales/);
  assert.match(permissions, /EDIT_SETUP: \["ADMIN", "MANAGER", "HEAD_OFFICE"\]/);
});

test("phase 8N setup UX shows management branch and location operational flags", () => {
  assert.match(setupPage, /getManagementBranches/);
  assert.match(setupPage, /Management Branch/);
  assert.match(setupPage, /managedLocations/);
  assert.match(setupPage, /Stock Holding/);
  assert.match(setupPage, /Deactivate this location/);
});

test("phase 8N keeps audit actions controlled and forward-only", () => {
  assert.match(auditMigration, /DROP CONSTRAINT IF EXISTS event_action_check/);
  assert.match(auditMigration, /USER_DEFAULT_LOCATION_CHANGED/);
  assert.match(auditMigration, /LOCATION_ACCESS_GRANTED/);
  assert.match(auditMigration, /LOCATION_ACCESS_REVOKED/);
  assert.match(auditMigration, /LOCATION_UPDATED/);
  assert.match(auditMigration, /table_name='business\.event'/);
  assert.doesNotMatch(auditMigration, /CHECK \(true\)/);
  assert.match(locations, /await client\.query\("BEGIN"\)/);
  assert.match(locations, /Failed to update user location access\./);
});

test("phase 8N access UI surfaces backend messages and avoids selector collision", () => {
  assert.match(setupPage, /Stock Holding/);
  assert.match(fs.readFileSync(new URL("../../frontend/src/components/BranchAccessPanel.tsx", import.meta.url), "utf8"), /mutation\.error.*response.*data.*message/);
  assert.match(fs.readFileSync(new URL("../../frontend/src/components/BranchAccessPanel.tsx", import.meta.url), "utf8"), /sm:grid-cols-2 lg:grid-cols-3/);
  assert.match(fs.readFileSync(new URL("../../frontend/src/components/BranchAccessPanel.tsx", import.meta.url), "utf8"), /min-w-0/);
});

test("phase 8N Setup resolves the declared management branch safely", () => {
  assert.match(setupPage, /const managedBranch=managementBranches\.find/);
  assert.match(setupPage, /branch_id:managedBranch\?\.branch_id/);
  assert.doesNotMatch(setupPage, /branch_id:managementBranch\?\.branch_id/);
  assert.match(setupPage, /No management branch is available/);
  assert.match(setupPage, /No locations are configured for this branch/);
  assert.match(setupPage, /managementBranchesQuery\.refetch/);
});

test("phase 8O-A keeps POS journals linked to cash movements and labels activity distinctly", () => {
  const pos = fs.readFileSync(new URL("../src/routes/pos.routes.js", import.meta.url), "utf8");
  assert.match(pos, /posted_journal_id/);
  assert.match(pos, /UPDATE app\.till_cash_movement SET journal_id/);
  assert.match(tills, /'POS_SALE','POS_SALE'/);
  assert.match(tills, /ps\.posted_journal_id/);
});

test("phase 8O-A cashier close uses a supported non-manager disposition", () => {
  assert.match(tillPage, /cashDisposition.*CARRY_FORWARD/);
  assert.match(tillPage, /closeTillSession\(session\.session_id/);
  assert.match(tillPage, /Close My Session/);
  assert.match(tillPage, /You do not have permission to close this till session/);
  assert.doesNotMatch(tillPage, /cash_disposition: "LEAVE_IN_TILL"/);
});

test("phase 8O-A central session detail query follows the management target", () => {
  assert.match(tillPage, /till-session-detail.*selectedSessionId.*managementBranchId.*managementLocationId.*selected/);
  assert.match(tills, /management_branch_id/);
  assert.match(tills, /management_location_id/);
});

test("phase 8L keeps role and operating scope separate", () => {
  assert.match(migration, /sec\.user_branch/);
  assert.match(migration, /sec\.user_location/);
  assert.match(migration, /validate_user_default_location/);
  assert.match(branches, /USER_BRANCH_GRANTED/);
  assert.match(branches, /USER_DEFAULT_BRANCH_CHANGED/);
  assert.match(locations, /Assign branch access before granting a location/);
  assert.match(locations, /USER_DEFAULT_LOCATION_CHANGED/);
});

test("login resolves the user's default operating context", () => {
  assert.match(auth, /operatingContext/);
  assert.match(auth, /ub\.is_default/);
  assert.match(auth, /ul\.is_default/);
});

test("user creation can atomically onboard an optional operating context", () => {
  assert.match(users, /branch_id = null/);
  assert.match(users, /location_id = null/);
  assert.match(users, /INSERT INTO sec\.user_branch/);
  assert.match(users, /INSERT INTO sec\.user_location/);
  assert.match(users, /await client\.query\("BEGIN"\)/);
  assert.match(users, /USER_CREATED/);
  assert.match(users, /USER_ROLE_ASSIGNED/);
  assert.match(users, /USER_DEFAULT_LOCATION_CHANGED/);
});

test("create-user UX keeps branch and location optional and filters locations by branch", () => {
  assert.match(usersPage, /Operating Branch/);
  assert.match(usersPage, /Default Location/);
  assert.match(usersPage, /location\.branch_id === newUser\.branch_id/);
  assert.match(usersPage, /disabled={!newUser\.branch_id}/);
  assert.match(usersPage, /branch_name} \({branch\.branch_code}\)/);
});

test("manage-user reuses the authoritative branch-access workflow", () => {
  assert.match(usersPage, /Branch &amp; Location Access/);
  assert.match(usersPage, /setup\?user_id=/);
  assert.match(usersPage, /selectedUserBranchGrants/);
  assert.match(usersPage, /selectedUserLocationGrants/);
  assert.match(accessPanel, /useSearchParams/);
  assert.match(accessPanel, /user_id/);
});

test("operational till register is branch-scoped by default", () => {
  assert.match(tills, /management_branch_id/);
  assert.match(tills, /resolveManagementScope/);
});

test("till eligibility follows persisted till scope and cashier permissions", () => {
  assert.match(tills, /till_id is required/);
  assert.match(tills, /t\.branch_id/);
  assert.match(tills, /t\.location_id/);
  assert.match(tills, /ur\.role_code IN \('ADMIN','MANAGER','SALES','FINANCE'\)/);
  assert.match(tills, /require_assignment/);
  assert.match(tills, /ut\.can_open/);
  assert.match(tills, /resolveManagementScope/);
});

test("till UI refetches users for the selected till", () => {
  assert.match(tillPage, /\["till-users", "assignment", managementBranchId, managementLocationId, selectedAssignmentTillId\]/);
  assert.match(tillPage, /\["till-users", "opening", managementBranchId, managementLocationId, selected\]/);
  assert.match(tillPage, /getTillEligibleUsers\(selectedAssignmentTillId, false, managementBranchId, managementLocationId\)/);
  assert.match(tillPage, /getTillEligibleUsers\(selected, true, managementBranchId, managementLocationId\)/);
});

test("central till management never falls back to the administrator session", () => {
  assert.match(tillPage, /enabled: ready && !manager/);
  assert.doesNotMatch(tillPage, /active\.data\?\.data\?\.session_id.*setSelectedSessionId/);
  assert.match(tillPage, /targetActiveSession/);
  assert.match(tillPage, /No active session for the selected management target/);
  assert.match(tillPage, /setSelectedSessionId\(""\)/);
});

test("central session detail and force-close enforce branch and location target", () => {
  assert.match(tills, /s\.till_id,s\.branch_id,s\.location_id/);
  assert.match(tills, /session management target/);
  assert.match(tills, /management_location_id.*requireLocation:true/);
  assert.match(tills, /AND location_id=\$5/);
  assert.match(tillPage, /getTillSession\(selectedSessionId, managementBranchId, managementLocationId\)/);
  assert.match(tillPage, /forceCloseTillSession\(managerSession\.session_id.*managementLocationId/);
});

test("till target data endpoints validate the selected management scope", () => {
  assert.match(tills, /async function resolveTillScope/);
  assert.match(tills, /outside the selected management branch\/location/);
  assert.match(tills, /router\.get\("\/opening-options"[\s\S]*resolveTillScope/);
  assert.match(tills, /router\.get\("\/eligible-users"[\s\S]*resolveTillScope/);
  assert.match(tills, /router\.post\("\/tills\/:tillId\/assignments"[\s\S]*resolveTillScope/);
});

test("Quick Sale discovers the cashier session at the operating location", () => {
  assert.match(quickSale, /const locationId = operating\.currentLocation\?\.location_id/);
  assert.match(quickSale, /\["my-session", operating\.currentBranch\?\.branch_id, locationId, user\?\.user_id\]/);
  assert.match(tills, /cashier_user_id=\$2 AND branch_id=\$3 AND location_id=\$4/);
  assert.doesNotMatch(quickSale, /currentLocation\?\.is_saleable \? operating\.currentLocation/);
});

test("Dashboard stock cards include the operating location", () => {
  assert.match(dashboard, /location_id/);
  assert.match(dashboard, /loc\.location_id=\$2/);
  assert.match(dashboardPage, /\["dashboard-summary", branchId, locationId\]/);
  assert.match(dashboardPage, /getDashboardSummary\(branchId, locationId\)/);
});
