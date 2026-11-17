# Phase 62/63 Production Deployment Record

## Status

- Phase 62 production deployment: **COMPLETE**
- Phase 63 production deployment: **COMPLETE**
- POS production smoke test: **PASS** (`POS-20261117-000081`)
- Normal-sales production smoke test after security hardening: **PASS**
- Shared stock-concurrency protection: **ACTIVE**
- Reservation-aware stock validation: **ACTIVE**
- Production application role: `kam_grains_app`
- Protected POS function owner: `kam_grains_pos_fn_owner`
- Fixed-IP networking dependency: **REMOVED**

This document records the completed production rollout. It documents deployed behavior and evidence only; it does not authorize replaying migrations or production transactions.

## Environments and roles

- Production database: `kam_grains_db`
- Test/staging database: `kam_grains_staging`
- Production runtime role: `kam_grains_app`
- Protected POS function-owner role: `kam_grains_pos_fn_owner`
- Administrative/migration role: `postgres`

`postgres` is reserved for administration, backups, schema changes, migrations, and emergency privileged maintenance. It is not the normal application runtime role.

`kam_grains_app` is a non-superuser LOGIN role with `NOCREATEDB`, `NOCREATEROLE`, and `NOREPLICATION`. It has the approved runtime schema, table, sequence, and function privileges across `app`, `audit`, `fin`, `inv`, `mfg`, `pur`, `reporting`, `sal`, and `sec`; PostgreSQL default privileges also grant future objects created by `postgres` the normal runtime access.

`kam_grains_pos_fn_owner` is a `NOLOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION` role used only as the protected POS execution owner. It has the required read, restricted write, sequence, and supporting-function privileges, with no blanket DELETE and no general application login capability.

## Phase 62 — POS stock-concurrency protection

Migration: `database/migrations/phase_62_pos_location_stock_enforcement.sql`.

POS stock posting is location-aware and reservation-aware. Conflicting stock operations use transaction-scoped PostgreSQL advisory locks in the shared namespace:

```text
stock-fulfil:<location_id>:<product_id>
```

Products and locations are locked in deterministic order to reduce deadlock risk. Available stock is checked after the lock is acquired and before mutation. The guarded application entry point is `sal.post_pos_sale(uuid)`; the legacy/internal implementation is `sal.post_pos_sale_unscoped(uuid)`.

`sal.post_pos_sale(uuid)` is `SECURITY DEFINER`, owned by `kam_grains_pos_fn_owner`, uses a safe `search_path`, and is executable by `kam_grains_app`. The unscoped function is executable internally by the owner only; it is not executable by `kam_grains_app` or `PUBLIC`.

## Shared application stock locking

The backend helper `backend/src/services/stockLock.service.js` provides the shared location-plus-product lock used by POS, deliveries, internal stock requests, stock transfers, goods receipts, customer returns, and stock adjustments.

The lock is scoped to a location and product rather than the entire ERP. Unrelated stock buckets can therefore proceed concurrently while transactions affecting the same bucket serialize and revalidate availability.

## Phase 63 — normal delivery reservation safety

Migration: `database/migrations/phase_63_normal_delivery_reservation_safety.sql`.

Normal delivery posting uses the same `stock-fulfil` advisory-lock namespace, performs final reservation-aware validation, and checks location, product, and lot before stock mutation. It prevents overselling stock reserved for active transfers while preserving existing `SALE_ISSUE`, COGS, inventory, journal, and delivery-posting behavior.

`sal.v_delivery_line_lot_options` exposes `qty_on_hand`, `reserved_qty`, and `available_qty`. Reservation rules are:

- `DRAFT`: reserved.
- `PARTIALLY_DISPATCHED`: undispatched balance reserved.
- `IN_TRANSIT`, `RECEIVED`, and `RECEIVED_WITH_VARIANCE`: not reserved.
- Cancelled and other non-active statuses: not reserved.

## Staging validation

Phase 62/63 was validated in `kam_grains_staging` using real concurrent sessions for delivery-versus-delivery, delivery-versus-POS, delivery-versus-stock-transfer, and multi-product scenarios. Conflicting transactions waited on PostgreSQL advisory locks; only one transaction consumed insufficient shared stock; losing transactions revalidated after lock release; and no overselling or deadlock was observed in the tested multi-product ordering. Rejected transactions left no partial stock movements, journals, invoices, or posting state.

POS coverage included no reservation, full reservation rejection, partial reservation, exact available quantity, other-lot isolation, other-location isolation, raw-stock-sufficient/available-stock-insufficient rejection, transaction atomicity, and direct unscoped-bypass denial.

## Backup and rollout safety

The verified production backup created before rollout was:

`C:\BusinessSystems\KamGrainsBackups\kam_grains_db-pre-phase62-63-20261114-073942.backup`

It is a PostgreSQL custom-format backup from PostgreSQL 18.1, approximately 1.75 MB, with 1,346 TOC entries. `pg_restore` list verification succeeded. The production API was stopped during the database migration window.

## Privilege-remediation sequence

- `phase_62b_pos_function_owner_privileges.sql` — initial POS function-owner privilege closure.
- `phase_62c_pos_complete_privilege_closure.sql` — added invoker audit writes, backdated AR audit-event sequence access, and transfer-reservation reads required by the actual call chain.
- `phase_62d_pos_runtime_privilege_stabilization.sql` — stabilized read dependencies of shared accounting and branch-resolution functions, including customer-return and purchase-source lookups, while keeping writes restricted.
- `phase_62e_pos_journal_branch_update_privilege.sql` — granted only column-level `UPDATE` on `fin.gl_journal.branch_id` for `fin.assign_pos_journal_branch()`; DELETE remained unnecessary.

Running the backend as `postgres` previously hid these dependencies because that role bypassed normal permission checks. Switching runtime execution to `kam_grains_app` exposed the real dependency closure and produced the secure production role model.

## Production smoke evidence

POS transaction `POS-20261117-000081` completed successfully. A `SALE_ISSUE` movement was created, stock quantity reduced correctly, a balanced GL journal was created, and the stock movement was audited. No permission error remained after Phase 62E, and the guarded POS function remained the only application posting entry point.

The normal Sales Order → Delivery → AR Invoice → Payment/Receipt → Stock/GL workflow also completed successfully after Phase 63B security hardening. The hardening migration `database/migrations/phase_63b_normal_sales_security_hardening.sql` revoked unsafe `PUBLIC` EXECUTE on normal-sales entry points and internal mutating helpers, granted explicit execution to `kam_grains_app`, preserved internal trigger/function execution, and changed ACLs only.

## Networking and services

The corrected defaults are documented in [NETWORKING.md](NETWORKING.md): frontend `http://localhost:5173`, backend `http://localhost:3000/api`, backend listener `0.0.0.0:3000`, and optional LAN/phone access resolved from the browser hostname. `VITE_API_BASE_URL` remains authoritative; no fixed Wi-Fi or hotspot IP is required.

Production services are NSSM-managed:

- `KamGrainsAPI` — `C:\BusinessSystems\KamGrainsWeb\backend`, startup `node src/server.js`, port 3000.
- `KamGrainsFrontend` — deployed directory `C:\BusinessSystems\KamGrainsDeploy\frontend\dist`, port 5173.

Building `C:\BusinessSystems\KamGrainsWeb\frontend\dist` does not update the deployed frontend. The rebuilt `dist` must be copied to `C:\BusinessSystems\KamGrainsDeploy\frontend\dist` before restarting `KamGrainsFrontend`.

## Engineering lessons

- Validate concurrency in staging before production.
- Verify a recoverable backup before database migrations.
- Keep migrations transaction-safe and separate application and administrative roles.
- Use `SECURITY DEFINER` only for controlled privileged operations.
- Apply least privilege and close trigger/function dependencies explicitly.
- Use shared advisory locks and real database sessions for concurrency tests.
- Reject losing transactions atomically after revalidation.
- Avoid hardcoded LAN addresses.
- Distinguish source build directories from deployed runtime directories.

## Remaining non-blocking risk

Unrelated ERP functions outside the audited POS and normal-sales chains may still have `PUBLIC` EXECUTE privileges. They can be audited separately as future security hardening; this does not block the Phase 62/63 production status recorded here.
