# Branch & Location Setup Management

Phase 8N adds a central setup workflow for maintaining locations within an explicitly selected management branch.

## Scope

- ADMIN and HEAD_OFFICE users can select any active branch in the active company.
- Other authorized managers remain limited to granted branches and locations.
- The selected management branch is separate from the signed-in user's operating context.
- Location listing includes inactive records and shows code, name, type, active status, saleability, and stock-holding status.

## Location rules

- `is_saleable=true` requires `is_active=true`.
- A non-saleable location remains visible to Inventory and may hold stock, but POS cannot sell from it.
- Locations are never deleted by this workflow.
- Deactivation is rejected when positive active stock, OPEN/CLOSING till sessions, active tills, or active users with the location as their default exist.
- Successful edits are audited atomically as `LOCATION_UPDATED` events.
- TEST_B location configuration is changed through the Setup UI; no location is hardcoded in application logic.

## Acceptance notes

Use Setup → Locations → Management Branch, select `TEST_B`, and edit `TEST_B_STORE` to enable saleability only after its stock and operational dependencies have been reviewed. Existing inventory remains preserved and remains visible while the location is non-saleable.

## Acceptance correction

Phase 54 (`phase_54_expand_audit_event_actions.sql`) preserves the original `I/U/D` and `business.event` rule while explicitly allowing the application access/setup actions. It was applied to the local development database only. The access UI displays safe backend validation/internal messages and uses a responsive three-column/two-column/one-column selector layout so long branch and location names do not overlap.

The Setup UI correction uses the existing `managedBranch` derived from `managementBranchId`; no duplicate or undeclared management state is used. Empty branch and empty-location states are rendered safely, and successful location edits refetch the selected branch's locations while keeping the authenticated operating context unchanged.
