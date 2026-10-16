# Branch management scope

Operating context and management target are separate. The global header and ordinary transactional modules continue to use the authenticated user's operating branch/location. Till Management may use a module-local management target for authorized Admin and HEAD_OFFICE users.

The management target is resolved server-side. It must be an active branch in the actor's company; a selected location must be active and belong to that branch. Non-central managers remain limited to active branch/location grants. Central management does not change user defaults, browser operating headers, Quick Sale, Inventory, or persisted transaction dimensions.

Till register, sessions, creation, force-close, assignment eligibility, and audit-related actions use the persisted till/session branch and location. Switching the target changes only the Till Management queries.

Phase 8O-A2 requires every central Till Management operational query and sub-resource to carry the selected management branch/location. Active session state is derived from target-scoped session history; the authenticated Admin operating-context session is never a fallback. Closed target sessions remain history, while register active-session columns show only OPEN/CLOSING sessions.

Phase 8P keeps session history target-scoped and adds branch-scoped customer visibility. Customer identity remains company-wide, while `sal.customer_branch` controls ordinary branch-user visibility and manual customer-ID authorization.

The management target never feeds Sophia's Quick Sale or Dashboard. Those use Sophia's authenticated operating context.

Phase 8N extends the same explicit target to Setup location management. Central users can select an active company branch; other users must hold the corresponding branch and location grants.
