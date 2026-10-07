# Branch Operating Context

Phase 8L architectural rule:

- **Role** = what a user may do.
- **Branch/location grant** = where the user may do it.
- **Default branch/location** = the initial operating context after normal username/password login.
- **Persisted transaction branch/location** = the financial and operational source of truth; changing context never rewrites history.

The authorization tables are `sec.user_branch` and `sec.user_location`. They are independent of `sec.user_role`. A location grant is valid only when its parent branch is actively granted. One active default branch and one active default location are maintained per user; the default location must belong to the default branch.

Login resolves the user's active default grant and returns it as `operating_context`. `/api/branches/context` returns only authorized branches and locations (subject to explicit read-only cross-branch permissions). The frontend persists the selected context for refreshes and sends `x-branch-id`/`x-location-id`; server middleware validates those identifiers on branch-sensitive requests.

`STOCK_VISIBILITY` is read-only cross-branch stock visibility. It does not grant mutation authority, till use, petty cash use, or transaction authority in another branch.

## Existing architecture inspection

| Concern | Current implementation |
|---|---|
| User status | `sec.app_user.is_active`; login rejects inactive users |
| Roles | `sec.role`, `sec.user_role`; capability-only |
| Branch grants | `sec.user_branch` |
| Location grants | `sec.user_location` |
| Default branch | active `sec.user_branch.is_default` |
| Default location | active `sec.user_location.is_default`, constrained to default branch |
| Login | `sec.login`, then user/role/context resolution |
| Server authority | `requireLocationAccessWhenSpecified` plus route-level document guards |
| Frontend context | `OperatingContextProvider`, React Query key `operating-context`, local storage only as a refresh hint |
| Switcher | authorized branches/locations returned by `/api/branches/context`; switch invalidates branch-sensitive queries |

## User creation onboarding

The Create User Account modal may optionally assign one active operating branch and one active location. The selected branch becomes the user's default branch; the selected location becomes the user's default location. Both are validated and persisted in the same transaction as the user and initial role. Additional branches and locations remain managed through Branch & Location Access.

Manage User now displays active branch/location grants and links to the authoritative Branch & Location Access screen with the selected user preloaded. This does not create a second access-management system.
# Phase 8L Till Eligibility Correction

Phase 8M adds a separate Till Management target for authorized Admin/HEAD_OFFICE users. `Operating Context` remains the login user's normal site; `Management Target` is explicit module state used for branch administration. Selecting TEST_B does not change the global header, user defaults, Quick Sale, Inventory, or unrelated transactions.

Quick Sale uses the authenticated user's current operating branch/location and the canonical Till Management `my-session` lookup. A non-saleable location is still used for session discovery; POS product eligibility separately requires an active saleable location.

Till cashier eligibility is resolved from the selected till's persisted `branch_id` and `location_id`, then restricted to active users with active grants at both dimensions and a cashier-capable role (`ADMIN`, `MANAGER`, `SALES`, or `FINANCE`). Assignment candidates do not require a prior `sec.user_till` row; the opening-session list additionally requires an active assignment with `can_open=true`.

Till creation persists the selected operating branch/location only after validating the location and the creator's authorized branch/location context. HEAD_OFFICE is the explicit cross-branch management mode; ordinary Admin/Manager operation remains scoped.

Location Setup uses a management target and never changes the authenticated operating context.

User location grants and defaults remain subject to active location grant, active branch grant, and default-branch validation. Default changes unset the previous location default and write the access mutation plus audit event atomically.
