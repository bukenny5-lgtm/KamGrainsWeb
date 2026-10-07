# Till / Cashier Session Management

## Phase 8C hardening

Till, assignment, and session remain separate concepts. Assignments persist in `sec.user_till`; sessions persist in `app.cashier_session` and survive logout, refresh, frontend restart, and backend restart while OPEN. Different tills may be OPEN concurrently, with one active session per till and cashier by the existing partial unique indexes unless shared-session configuration is explicitly enabled.

Cashier endpoints are user-scoped: `/my-tills` returns only active assignments for the authenticated user and `/my-session` returns only that user’s OPEN/CLOSING session in the authorized branch. Manager session listings remain separate and branch-authorized. Deactivation is blocked while a till has an OPEN/CLOSING session.

## Phase 8C — Cash refund integration

Cash refunds now require the authenticated operator's OPEN session when Till Management is enabled. The refund settlement snapshots session, till, branch, and location IDs and creates one `CASH_REFUND` movement against that paying session. Expected cash therefore reduces from 500 to 205 for a UGX 295 refund. The original sale session is never used. Cash-availability blocking remains a separate policy; current behavior does not block a refund solely because expected cash could become negative. Non-cash refunds do not create till movements.

Phase 8 adds a disabled-by-default till and cashier-session foundation for branch/location-scoped POS operations.

## Operating model

- `app.till` identifies a physical or logical till at a branch and location.
- `app.cashier_session` records the cashier, till, opening float, lifecycle, expected cash, counted cash, variance, and approvals.
- `app.till_cash_movement` records opening float, cash sales, refunds, cash in/out, payouts, safe drops, and closing adjustments.
- `app.till_cash_count` stores optional denomination counts.
- `sec.user_till` provides per-user till assignment and open/close/reconcile capabilities.
- Session numbers are generated as `TSE-YYYYMMDD-######`.

Expected cash is calculated from persisted movement rows: opening float + cash sales + cash in - cash out - payouts - safe drops - refunds. Non-cash payments never change drawer cash.

## Controls

The `till_management` feature is false by default. Activation requires at least one active till with a valid branch/location and a cash payment-account mapping. When enabled, POS requires the authenticated cashier to have an active session in the current branch/location; an optional client session identifier must match the server-selected session.

Opening, movement, closing, variance approval, reconciliation, and force-close actions are permission controlled and branch scoped. Partial unique indexes prevent conflicting active sessions for a cashier or non-shared till. All state-changing records retain actor and timestamp audit fields.

Variance tolerance, approval requirement, one-session-per-cashier, and optional maximum session duration are company configuration values. Closing with a variance beyond tolerance requires notes; configured approval leaves the session in `CLOSING` until an authorized reviewer approves it.

## UI and API

The Till Management page provides active-session visibility, opening, cash in/out, closing with counted cash, session history, and till registration. Quick Sale displays the current session and blocks completion when till management is enabled without an active session. API routes are mounted at `/api/till-management`.

Cash movements are operational records; existing POS accounting remains unchanged. Transfer journals for cash in/out, safe drops, and closing adjustments require the organisation's final chart-of-accounts policy and remain a follow-up. Cash refund/return integration remains a follow-up. User assignment administration is now available through the Till Management page and uses existing ERP users, branch access, location access, and role display data.

There is no separate cashier login. An admin/manager may open a session for another authorized ERP user; `cashier_user_id` identifies the operator and `opened_by` identifies the actor who created the session. Ordinary cashiers may open only their own assigned till.

The authoritative opening context is the authenticated operating branch/location carried by the request and explicitly echoed by the open form. The server validates the till, cashier account, branch authorization, location authorization, and active `sec.user_till.can_open` assignment. Managers may open configured tills for an authorized cashier without a pre-existing assignment; ordinary cashiers may not.

Quick Sale consumes only the minimal operational tax context (`tax_engine_enabled` and `tax_pricing_mode`) through `/api/tax/operational-context`. Administrative tax settings, activation checks, and tax-code management remain protected by `VIEW_TAX_CONFIGURATION` / `MANAGE_TAX_CONFIGURATION`.

Session opening uses explicit validated `branch_id` and `location_id` from the request. Till queries in the UI wait for authenticated operating-context hydration and include branch/location in their React Query keys, so the first render does not issue an undefined-context request.

The cash-movement constraint remains `amount > 0`. A zero opening float is represented by `cashier_session.opening_float = 0` and does not create an `OPENING_FLOAT` movement row; nonzero opening floats still create exactly one positive movement.

Closing authorization is session-based: the server loads the company/session record first, validates the cashier against its stored branch/location and active `sec.user_till.can_close` assignment, and does not require `can_reconcile` to close. Managers retain only their existing close/force-close permissions.

## Manual acceptance

1. Log in normally as an administrator, create an active till, select a cash payment account, and assign an existing salesperson.
2. Open and close an admin session with opening float `0`; verify a `10,000` cash sale closes at expected cash `10,000`.
3. Open a session for the salesperson with opening float `50,000`; verify cashier ownership and `opened_by` audit identity.
4. Log in normally as the salesperson, confirm only authorized tills are offered, open the session, and verify Quick Sale recognizes it.
5. Verify a non-cash sale does not increase expected drawer cash, duplicate till sessions are rejected, unauthorized branch/location operations are rejected, and restart preserves an open session.

## Verification

Migration 41 was applied to the local development database only. Deterministic tests cover opening float, cash sale, non-cash exclusion, cash out, refund, safe drop, shortage, and overage calculations. Backend syntax/build, frontend typecheck/build, and migration-state checks passed. No provider, production, deployment, or commit action was performed.
## Regression correction

Till routes normalize the selected branch/location from the authenticated request context headers because the route is not globally mounted behind the generic location middleware. Quick Sale consumes `/my-session` and includes branch, location, and user identity in its query key so an existing OPEN session resumes immediately.

## Phase 8D cash movements

Cash movements are session-owned and persisted in `app.till_cash_movement`. Safe drops use the configured till cash account and company Safe/Main Cash payment account and create a balanced journal atomically. Cash Out and Safe Drop cannot exceed expected physical cash. See [TILL_CASH_MOVEMENT_ACCOUNTING.md](TILL_CASH_MOVEMENT_ACCOUNTING.md).

## Phase 8E runtime correction

Till Management now auto-selects the authenticated manager/admin's OPEN session for the Active Session panel. Assignment selection and session inspection are separate UI state; managing assignments no longer controls session visibility. Other sessions remain explicitly selectable from the Till Register.

Cash movement locking first locks the authoritative OPEN `app.cashier_session` row, then loads optional account configuration without `FOR UPDATE`. This preserves concurrency protection while avoiding PostgreSQL's nullable outer-join lock error. Movement request keys are fresh UUIDs per submission and are reused for retries of that submission.

## Phase 8F opening, carry-forward, and handover

Opening options are session-scoped and include existing till balance, Main Safe funding, and an eligible closed-session carry-forward. Closing records the selected cash disposition. Safe transfer is journal-backed; carry-forward remains a same-till operational balance; leave-in-till requires manager authorization; and cashier handover creates a proposal that the receiving cashier or manager must accept against an OPEN receiving session on the same till. Variance approval blocks applying a disposition until the variance is approved.
## Phase 8D runtime correction (2026-09-25)

`/my-session` now qualifies the POS activity timestamp as `ps.created_at AS activity_created_at`; the previous unqualified `created_at` was ambiguous because `sal.pos_sale ps` was joined to `sec.app_user pu`. The manager register now supports editing an existing till's name, description, and cash/payment account without changing `till_id`, `till_code`, company, branch, or location. Account edits require an active CASH payment account and are rejected while an OPEN/CLOSING session exists with: `Close the active till session before changing the till cash account.`

The local runtime currently has `TSE-20260925-000006` OPEN on TILL-01 (Alinaitwe Kenneth) and `TSE-20260925-000005` OPEN on TILL-02 (KAM GRAINS Administrator), so no new till is eligible until one is closed. Cash movement controls remain rendered only for an authenticated OPEN session.
## Targeted active-session correction (2026-09-25)

Manager register selection now loads the authorized session detail in place. Active sessions expose session number, till, cashier, opening float, cash sales, cash in, cash refunds, cash out, safe drops, expected cash, movement history, and a permission-gated force-close action. Session History remains a separate session list.
## Phase 8E account setup (2026-09-26)

Till Cash and Safe/Main Cash selectors continue to accept only active CASH payment accounts. The local Phase 45 setup provides `TILL-CASH` (`1110`) and `MAIN-SAFE` (`1120`) without creating accounts per cashier or per till. TILL-01 and TILL-02 can share the same Till Cash control account while session and movement rows remain isolated.
## Phase 8F migration alignment (2026-09-28)

Phase 46 was missing from the local database even though its SQL file existed in the workspace. It was applied locally without redesigning session behavior. Existing OPEN sessions remain visible in the database, and the `/my-session` route no longer encounters the missing-handover-table schema error after the migration.
