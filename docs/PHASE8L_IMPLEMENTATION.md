# Phase 8L implementation report

Phase 8L hardens user operating context and branch isolation without adding branch-specific roles or changing stable business modules.

Implemented:

- user-specific default branch/location resolution at login and in the operating-context endpoint;
- active parent-branch validation before location grants;
- default location validation against the user's default branch;
- one active default location index and forward database trigger hardening;
- branch/location grant audit actions: `USER_BRANCH_GRANTED`, `USER_BRANCH_REVOKED`, `USER_DEFAULT_BRANCH_CHANGED`, `LOCATION_ACCESS_GRANTED`, `LOCATION_ACCESS_REVOKED`, and `USER_DEFAULT_LOCATION_CHANGED`;
- documentation and a deterministic acceptance sequence.

No test user, branch, location, till, payment account, or live business record is created by migration. No production deployment or commit is part of this phase.

## Known acceptance prerequisites

TEST_B must be inspected in the local database before A-Z testing. Existing records are reported, not deleted. TEST_B payment accounts and tills must be provisioned through existing Setup workflows before POS and petty-cash tests.

## Local TEST_B inventory snapshot (2026-10-05)

- Branch: `TEST_B` — `KAM Test Branch B — DEVELOPMENT TEST DATA`
- Active locations: `TEST_B_STORE`, `TEST_B_SHOP`
- Users with active branch grant: 15
- Active stock-on-hand rows / quantity: 4 / 26.100
- Tills / open sessions: 0 / 0
- Payment accounts / petty-cash accounts: 0 / 0
- Purchase orders: 4
- GRNs: 1
- POS sales: 1
- Deliveries: 0
- Expense vouchers: 0

This confirms TEST_B is not clean or empty. The existing 26.100 stock and four POs, one GRN, and one POS sale must remain in the acceptance baseline; no cleanup was performed.
