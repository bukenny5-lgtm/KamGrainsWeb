# Phase 3 — Feature Flags / Business Profiles Inspection

**Date:** 2026-09-18  
**Scope:** Step 1 capability inspection and design-gap analysis only  
**Reference tenant:** KAM GRAINS  
**Status:** Inspection complete; implementation approval required

## 1. Current company-profile model

`app.company_profile` is the current company identity/configuration record. The Phase 1 migration added `timezone` and preserved the existing KAM identity. The application currently reads these fields:

| Field | Current use |
|---|---|
| `company_id` | Identity returned by the profile API |
| `company_name` | Formal/company branding and document text |
| `business_name` | Shell branding and document-facing business name |
| `business_type` | Editable descriptive text only |
| `currency_code` | Read-only display and financial context |
| `phone`, `email`, `address` | Company contact/branding data |
| `logo_path` | Reserved branding value |
| `timezone` | Profile value used as configuration metadata |
| `is_active`, `created_at` | Selection of the active record; not exposed as editable profile fields |

The current profile implementation is in `backend/src/routes/businessProfile.routes.js`, with `GET /api/business-profile` and protected `PATCH /api/business-profile`. GET selects the first active company ordered by creation time and ID. PATCH allows only the eight editable profile fields and requires authentication plus `EDIT_SETUP`.

The frontend contract is `BusinessProfile` in `frontend/src/types/api.ts`; `getBusinessProfile` and `updateBusinessProfile` are in `frontend/src/api/client.ts`; `useBusinessProfile` in `frontend/src/lib/businessProfile.ts` loads the data through TanStack Query using the `business-profile` query key.

The hook merges API data onto a KAM-safe fallback. The backend GET also returns HTTP success with fallback profile data when the database query fails. Current fallback values are KAM GRAINS SUPPLIES, KAM GRAINS, Grain Wholesale and Cleaning, UGX, Kampala, Uganda, and Africa/Kampala.

The profile is consumed by `AppLayout.tsx` for the business name, document title, and subtitle replacement, and by `Setup.tsx` for the profile editor. It is also available to print/document-facing code through the shared API/client usage. There is no separate feature-configuration hook or provider today.

### Does `business_type` affect runtime behavior?

No. Repository inspection found `business_type` only in the profile response/type, fallback, Setup editor, and PATCH allowlist. No navigation, route, query, report, posting, or authorization branch currently evaluates it. It must not become an implicit runtime switch by string comparison.

## 2. Navigation and routing

`frontend/src/App.tsx` contains the React Router route tree. `frontend/src/layout/AppLayout.tsx` contains the `navItems` sidebar/menu list and page subtitles. The same module set is represented in both places, so there is duplication and a future risk of route/menu drift.

Currently exposed modules are:

- Dashboard
- Inventory, Stock Movements, Stock Count, and Stock Adjustments
- Purchasing and GRN
- Cleaning Batches
- Sales, Deliveries, and AR Invoices
- Receipts
- AP Invoices and AP Payments
- Expense Vouchers, Payment Accounts, Reconciliation, API Payment Channels, Opening Balances, and Accrued Expenses
- Finance and Journals
- Reports
- Setup
- Users & Roles
- Audit Log

Visibility is mixed, but currently configuration-free:

- Menu visibility is hardcoded in `navItems`, filtered by frontend role groups.
- Route authorization is declared per route with `ProtectedRoute allowedRoles`.
- Component actions use the role-based `Can` component and duplicated frontend `ACTION_ROLES`.
- There is no business-feature check.
- There is no server-side feature gate.
- Dashboard and some read-only route modules are less consistently protected in the backend than mutating endpoints.

The eventual decision rule should be `feature enabled AND user authorized`, applied centrally to menu visibility, route guards, backend route access, and relevant deep links.

## 3. Authorization model

Authentication is JWT-based. `backend/src/middleware/auth.js` verifies the bearer token and assigns `req.user`. `backend/src/middleware/permissions.js` maps action codes to role lists in `ACTION_ROLES` and exposes `requirePermission(action)`. The current model is role-to-action authorization, not a normalized permission lookup service.

Current role codes are `ADMIN`, `MANAGER`, `PURCHASING`, `INVENTORY`, `SALES`, `FINANCE`, `AUDITOR`, and `VIEWER`. Backend action codes cover setup, users, purchasing/GRN, cleaning/production, sales/delivery, AR, AP, expenses/finance, reconciliation, stock counts, stock adjustments, backdated actions, and lot lifecycle.

The frontend mirrors role groups and action-role mappings in `frontend/src/lib/permissions.ts`. `AuthProvider` exposes `hasRole`; `ProtectedRoute` protects routes; `Can` protects action controls. The authenticated user and roles are established in `frontend/src/lib/auth.tsx` from the login response and token-backed session.

There is no independent backend permission table or general permission middleware beyond the role map. Some GET route groups use `requireAuth`; some master-data/report/inventory/dashboard GET endpoints currently have no explicit backend auth middleware and appear to depend on frontend protection. This should be hardened or explicitly reviewed before server-side feature gates are introduced.

Feature flags must not replace authorization:

> Feature flag: does this business use this capability?  
> Permission: can this user perform this action?

For example, Cleaning enabled + user has cleaning permission permits access. Cleaning enabled + user lacks permission denies access. Cleaning disabled must deny/hide the capability even if the user's role contains cleaning permissions.

## 4. Backend route structure

`backend/src/server.js` mounts these route groups:

| Area | Mounted paths |
|---|---|
| Auth/setup/master data | `/api/auth`, `/api/users`, `/api/products`, `/api/locations`, `/api/parties`, `/api/uoms`, `/api/lots`, `/api/gl-accounts`, `/api/payment-accounts`, `/api/opening-balances`, `/api/accrued-expenses`, `/api/api-payment-channels`, `/api/business-profile`, `/api/product-categories` |
| Operations | `/api/purchase-orders`, `/api/goods-receipts`, `/api/inventory`, `/api/sales-orders`, `/api/deliveries`, `/api/cleaning-batches`, `/api/stock-adjustments` |
| Finance | `/api/ar-invoices`, `/api/ar-payments`, `/api/ap-invoices`, `/api/ap-payments`, `/api/finance` |
| Reporting/control | `/api/reports`, `/api/inventory-reports`, `/api/stock-counts`, `/api/audit-events`, `/api/dashboard`, `/api/reconciliations` |

Routes are mounted as ordinary Express routers, not conditionally by profile. This is a good future boundary: a feature middleware can be applied at a route-group boundary once the feature state is authoritative and the route's authentication behavior is consistent. It must not be added by changing SQL/posting logic indiscriminately, and it must preserve KAM's enabled baseline.

## 5. Industry-specific capability analysis

### A. Universal ERP capabilities

Company/profile identity, users and roles, parties/customers/suppliers, products, UOMs, product categories, locations, purchasing, goods receipt, inventory, sales orders, deliveries, AR, AP, payments, expenses, finance, journals, reconciliation, reports, audit viewing, stock counts, and stock adjustments are broadly reusable ERP capabilities.

Lot and expiry support is a reusable inventory capability, but it must be optional per product/business workflow. The current product model already carries `track_lots` and `track_expiry`.

### B. Grain-specific/current KAM capabilities

Cleaning Batches are strongly grain-oriented: input/output/waste, yield, batch costing, and reclassification assumptions are visible in the cleaning UI/service/controller. Product/report logic also assumes `RAW`, `CLEAN`, and `FINISHED` product types or name/type conventions. Several current reports select products using `RAW`/`FINISHED` filters and express quantities as kilograms. These are not safe universal assumptions.

Current grain-associated areas include Cleaning Batches, manufacturing/reclassification, grain-oriented product types and UOM/quantity semantics, grain customer-performance reports, and the current packaging fields/assumptions.

### C. Future POS/retail capabilities

POS/Quick Sale, till/register sessions, barcode scanning, thermal receipts, returns/refunds/exchanges, promotions/discounts, offline POS, and retail pricing are future capabilities. POS should coexist with the established Sales Order → Delivery → AR Invoice → Receipt workflow. Approved receipt direction is 80 mm thermal by default, with possible 58 mm profiles later. No POS printer configuration is required for this inspection.

### D. Future beverage capabilities

Beverage packaging, bottle/crate/container custody, deposits, returns, pack-size/volume semantics, and a separate returnable-container ledger are future extensions. Existing packaging fields are only a partial representation and should not be treated as a complete beverage model.

### E. Future spare-parts capabilities

Spare-parts extensions may include fitment/compatibility, make/model/application, alternate parts, serial/asset references, and richer location/bin semantics. They are not present today and should remain future extensions rather than speculative Phase 3 flags.

## 6. Feature-flag options considered

| Option | Assessment |
|---|---|
| A. Boolean columns on `app.company_profile` | Simple and type-obvious for a handful of permanent flags; becomes schema-heavy, migration-heavy, and hard to audit as the catalogue evolves. Couples identity with capability state. Not recommended as the main design. |
| B. Generic feature catalogue plus company-feature rows | Queryable, auditable, extensible, and independent of company identity. Supports enabled state, source, timestamps, and overrides without adding columns for every capability. Best smallest foundation. |
| C. Industry templates plus per-company overrides | Strong onboarding and SaaS scaling, but introduces precedence/template lifecycle complexity. Valuable after the basic feature state is proven. |
| D. JSON configuration | Flexible for nested settings and fast experimentation, but weaker type safety, constraints, queryability, audit clarity, and admin usability. Better for bounded settings payloads, not the primary feature-state model. |

### Recommendation

Use Option B first, with a small controlled catalogue and one row per company/feature. Keep `company_profile` for identity. Add template/preset support later as an onboarding layer (Option C), where applying a named profile writes explicit company-feature defaults/overrides. Do not make `business_type` strings the runtime policy engine. Use JSON only for future feature-specific settings that genuinely need structured values, such as POS receipt preferences.

This is the smallest design that supports queryability, auditability, database-per-business operation, and backwards-compatible growth without prematurely building a full SaaS entitlement system.

## 7. Industry profiles

Named profiles such as `GRAIN`, `SUPERMARKET`, `BEVERAGE`, `SPARE_PARTS`, `GENERAL_RETAIL`, and `WHOLESALE` are useful as onboarding presets and reporting metadata. Initially they should not directly control behavior at runtime. A profile selection may seed a company's explicit feature rows, after which per-company overrides are authoritative.

The profile should be a controlled code/record, not arbitrary display text. Runtime checks should use stable feature codes and, where necessary, capability-specific settings. `business_type` can remain a human-editable identity label during the transition.

## 8. Minimal initial feature catalogue

The first catalogue should be intentionally small:

| Class | Initial feature codes | Rationale |
|---|---|---|
| CORE | `inventory`, `sales_orders`, `purchasing`, `finance`, `reports` | Existing platform foundations and KAM baseline |
| OPTIONAL | `deliveries`, `ar`, `grn`, `ap`, `stock_control` | Existing modules that may not be needed by every future business |
| INDUSTRY-SPECIFIC | `lot_tracking`, `cleaning`, `manufacturing` | Current grain/production capabilities with clear non-universal assumptions |
| FUTURE | `pos`, `barcode`, `beverage_packaging`, `returns`, `promotions`, `offline_pos`, `spare_parts` | Roadmap capabilities not to be implemented or enabled in Phase 3 |

`deliveries`, `ar`, `grn`, and `ap` can be represented separately even though they participate in current end-to-end workflows. `stock_control` is preferable to prematurely creating flags for every stock-count/adjustment screen. Do not create flags for every page or report.

KAM's initial state must explicitly or effectively enable all currently used capabilities: sales orders, deliveries, AR, purchasing, GRN, AP, inventory, cleaning, finance, reports, and supporting stock control.

## 9. Recommended database/API shape (future implementation)

Recommended first objects, to be designed and migrated only after approval:

- `app.feature`: stable `feature_code`, display name, class, description, active/deprecated state, and ordering metadata.
- `app.company_feature`: company ID, feature ID/code, enabled state, source (`DEFAULT`, `PROFILE`, `OVERRIDE`), optional settings JSON, updated by, updated at, and a uniqueness constraint per company/feature.
- Optional later `app.business_profile_template` and template-feature rows for named presets. Do not add these until the first company-feature flow is validated.

The API should eventually provide one authenticated read endpoint returning the effective feature map and metadata, for example `GET /api/business-configuration` or `GET /api/company-features`, plus an admin-only mutation endpoint for explicit overrides. The response should include effective values and profile/source metadata, not require each page to fetch individual flags. Mutations should validate feature codes server-side, be idempotent, and return the complete effective configuration after update.

No schema or endpoint changes were made in this step.

## 10. Frontend configuration pattern

Load effective business configuration once through TanStack Query near the authenticated application shell. Expose it through a dedicated `useBusinessConfiguration` hook (or provider backed by the query), with a stable query key and explicit loading/error state. `AppLayout`, route guards, and feature-aware components should consume that shared result and combine it with `useAuth` authorization.

Avoid fetching feature state independently in every page. The hook should expose a safe `isFeatureEnabled(code)` helper, but it must not imply permission. A future route guard should require both feature enabled and role/permission allowed.

## 11. Safe fallback and backwards compatibility

For the current KAM live reference, configuration API failure must preserve the current visible modules and workflows rather than hide the entire application. The initial fallback should be a KAM-compatible baseline with all currently exposed KAM capabilities enabled, while still requiring normal user authorization.

For future tenants, a missing/invalid configuration should be observable and should fail closed for capabilities that have never been provisioned, after an explicit provisioning step. That stricter behavior should not be introduced by silently changing KAM's default.

Feature state should affect presentation and route/API eligibility only after the state is loaded and validated. Existing transaction SQL and posting behavior must remain unchanged. Feature disablement should not delete data; it should block new use and preserve historical reporting/access rules through a documented transition policy.

## 12. Setup/admin recommendation

Do not redesign `Setup.tsx` now. The first implementation should expose a read-only feature/configuration summary to authorized setup administrators, followed by explicit per-feature toggles only after the backend model and audit behavior are approved. Profile selection should be a later preset action, not an uncontrolled free-text replacement for `business_type`.

The existing `EDIT_SETUP` authorization is the right starting boundary for configuration administration, but feature changes should have a dedicated permission/action if they become operationally distinct from identity editing.

## 13. Audit and safety

Feature changes require audit data for who, when, old value, and new value, plus feature/company identifiers and source. Existing `audit.event` infrastructure and the audit viewer should be reused; a new audit framework is not needed. The feature mutation should write the audit event transactionally with the configuration update or use the existing established audit trigger/service pattern.

## 14. Files likely to require modification after approval

- Database migration(s) under `database/migrations/` for the catalogue, company-feature state, constraints, seed/defaults, and audit integration.
- `backend/src/routes/server.js` or a dedicated business-configuration route plus feature middleware/service.
- `backend/src/middleware/auth.js`/`permissions.js` only if a dedicated configuration permission or shared feature middleware is introduced.
- `frontend/src/types/api.ts`, `frontend/src/api/client.ts`, and a new/extended configuration hook/provider.
- `frontend/src/App.tsx`, `frontend/src/layout/AppLayout.tsx`, and `frontend/src/components/ProtectedRoute.tsx` for combined feature + permission checks.
- `frontend/src/pages/Setup.tsx` for the minimal admin/read-only configuration surface.
- Relevant backend route groups and their read-endpoint auth consistency, after an explicit gating plan is approved.
- Documentation and test logs.

## 15. Migration risks and runtime/test requirements

Primary risks are hiding KAM modules because of a missing/false default, coupling feature state to `business_type`, bypassing backend authorization through direct API calls, route/menu drift, inconsistent unauthenticated GET behavior, changing existing grain reports, and disabling a capability while existing transactions still depend on it.

Before implementation is approved, tests should cover:

- KAM configuration seed/effective-state compatibility for every current module.
- Profile/configuration GET fallback behavior and cache refresh after an update.
- Admin-only mutation, invalid feature codes, idempotence, audit old/new values, and unauthorized access.
- Feature disabled + user permission present: denied/not visible.
- Feature enabled + user permission absent: denied/not visible.
- Feature enabled + user permission present: existing route/API behavior unchanged.
- Direct backend requests, deep links, refreshes, login/logout, and configuration API failure.
- Regression of sales orders, deliveries, AR, purchasing, GRN, AP, inventory, cleaning, finance, reports, and existing accounting/posting workflows.

## 16. Required confirmations

- Current company profile, navigation, authorization, route mounting, and industry assumptions were inspected.
- No schema change was implemented.
- No migration was created.
- No POS was started.
- No existing KAM functionality was hidden or disabled.
- No deployment or service restart occurred.
- No Git commit occurred.

## Conclusion

The current platform has a usable identity/profile foundation but no feature configuration layer. `business_type` is metadata only. The recommended next implementation is a small, explicit feature catalogue plus per-company feature state, with KAM-safe defaults, centralized cached frontend consumption, backend enforcement after auth hardening, and reuse of existing audit infrastructure. Named industry profiles should initially be onboarding presets rather than runtime string-driven behavior.

**PHASE 3 INSPECTION COMPLETE — IMPLEMENTATION APPROVAL REQUIRED**
