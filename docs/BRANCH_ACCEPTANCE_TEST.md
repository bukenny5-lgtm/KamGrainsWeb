# TEST_B branch acceptance test

## Phase 8S acceptance additions

Print a tax-inclusive POS sale and confirm net/VAT/gross separately; confirm posted/void returns cannot be reposted; filter Finance returns by DUE and SETTLED; confirm settled returns cannot be settled again; verify a 1.000 KG sale with 0.500 KG returned leaves 0.500 KG returnable and rejects cumulative over-return.

Use local development data only. Do not delete existing records automatically.

1. Admin creates `test.branch.user` with a development password, Active status, and role `SALES`.
2. Admin grants branch `TEST_B` and location `TEST_B_STORE`; set both as the user's defaults.
3. Log in normally. Confirm the header shows `TEST_B` and `TEST_B_STORE` without a branch-selection screen.
4. Refresh. Confirm the context remains. Log out and in again; confirm the saved default is resolved again.
5. Confirm TEST_B stock-on-hand contains only TEST_B locations. Record the initial quantity before receiving or transferring anything.
6. Create a small PO according to TEST_B procurement mode, receive a GRN, and confirm the receiving location and stock movement are TEST_B dimensions.
7. Alternatively, use the approved internal stock transfer workflow and verify source decrease, destination increase, and dimensioned movements.
8. Provision a TEST_B-owned petty-cash account and till through normal Setup. Never reuse KAM petty cash or tills.
9. Open a TEST_B till session and process one small Quick Sale. Confirm POS, till, stock, journal, VAT, audit, and reports all retain TEST_B.
10. Fund TEST_B petty cash through the approved transfer flow and post a small TEST_B expense voucher. Confirm KAM cash and P&L are unchanged.
11. Run branch-performance and till-performance for KAM and TEST_B, then company-wide totals. Internal transfers must not inflate revenue, expense, or profit.
12. Negative tests: deny KAM stock mutation, KAM till use, KAM petty cash, KAM expense payment, KAM stock issue, and an ungranted location.

For a multi-branch user, grant KAM as a second branch and confirm only granted branches appear. Switching branch changes current operating context only and never changes historical document attribution.

## Create-user onboarding acceptance

1. Confirm Operating Branch and Default Location are optional.
2. Select `TEST_B`; confirm only active TEST_B locations appear with names/codes.
3. Select `TEST_B_STORE` and create a SALES user. Confirm user, role, grants, defaults, and audit events are created together.
4. Create a central user without branch/location and confirm creation remains allowed.
5. Confirm inactive branches, inactive locations, and wrong-branch locations are rejected by the API.

## Till and stock scope acceptance

- In TEST_B context, Till Register must show only active TEST_B tills. The local snapshot currently has no TEST_B tills, so an empty register is expected.
- Sophia is eligible for a TEST_B/TEST_B_STORE till because she is active, SALES, and has both active grants. She cannot appear for KAM tills.
- Dashboard stock is branch-wide across active saleable TEST_B locations. Inventory can be filtered to a location; compare like-for-like branch/location scope before treating totals as a defect.
# Till ownership and cashier eligibility acceptance

Admin management acceptance: keep the Admin logged in at KAM / Clean Beans Store, select Management Branch TEST_B and Management Location TEST_B_STORE in Till Management, then create and supervise TESTB-TILL-01. Switch back to KAM and confirm only KAM tills are shown. The global operating context must remain KAM throughout.

Runtime correction acceptance: session `TSE-20261006-000010` is persisted for cashier Sophia at TEST_B / TEST_B_STORE and opened by `kam.admin`; Quick Sale must discover it by `cashier_user_id`, not `opened_by`. The current local TEST_B_STORE location is `is_saleable=false`, so its 6.3 KG inventory is not POS-saleable until authorized location configuration changes.

The verified local data is: `TILL-01` = KAM / FG_STORE, active, open under Alinaitwe Kenneth; `TILL-02` = KAM / FG_STORE, active, open under KAM GRAINS Administrator; `TILL-01-BRANCH` = KAM / FG_STORE, inactive, with no session. It is not a TEST_B till, so Sophia is correctly excluded from those KAM tills.

Create `TESTB-TILL-01` while operating in TEST_B / TEST_B_STORE, then verify the selected-till assignment list includes Sophia, assign her, and verify the opening list includes her with `can_open=true`. Verify Sophia is absent for KAM / FG_STORE, and that wrong-location or inactive users are excluded.

For Phase 8N, select TEST_B in Setup → Locations and verify TEST_B_STORE and TEST_B_SHOP list their status, saleability, and stock-holding flags. Edit saleability through the UI only. Attempting to deactivate a location with positive stock, active tills, open/closing sessions, or default users must be blocked.

UI correction acceptance: Setup → Branches & Locations must load without a `managementBranch` reference error. Select TEST_B, open either location, edit Saleable, save, and confirm the list refetches. The branch/location access selectors must remain non-overlapping for long TEST_B names.

Phase 8O-A acceptance evidence: trace `POS-20261007-000053` without recreating it; verify journal `POS-20261007-001048`, TEST_B branch attribution, balanced lines, UGX 1,250 net + UGX 225 VAT, UGX 500 COGS, and the linked TESTB-SHOP-T01 cash movement. Admin central management should select TEST_B / TEST_B_SHOP and refetch the existing OPEN Sophia session. Sophia's own close must use counted cash and carry-forward; do not select manager-only leave-in-till.

Phase 8O-A2 acceptance: while operating as Admin in KAM/Clean Beans Store, open Till Management, select TEST_B / TEST_B_SHOP, and confirm the Active Session panel shows only the TEST_B target or `No active session for the selected management target.` Session History must include Sophia's closed TEST_B session, and View Session, cash movement, and Force Close must remain within TEST_B/TEST_B_SHOP. Switching back to KAM must clear the selected till/session before refetching.

Phase 8P acceptance: Admin selects TEST_B / TEST_B_SHOP and sees Sophia's closed session as a reconciliation row with expected, counted, variance, disposition, and View Session. KAM sessions are excluded when the target is TEST_B. A normal TEST_B user sees only TEST_B-associated customers plus Walk-in; KAM-only customers are not selectable. No returns/refunds are modified in this phase.
# Phase 8Q acceptance

Central opening must identify the selected cashier and show the committed session number, till, and location; cashier history must show only that cashier's reconciliation summaries; posted return `RET-20261008-000034` must remain immutable and reject reposting; Finance refund acceptance must use an authorized user with an OPEN paying till session.
### Finance refund acceptance

In a Finance session, Customer Returns must show only posted returns in the operating branch/location. A cash refund must offer only eligible OPEN paying sessions at that location, permit a Finance processor to select another cashier's session, create one `CASH_REFUND`, and reduce expected cash by the settled amount.
