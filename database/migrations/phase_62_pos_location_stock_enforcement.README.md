# Phase 62 migration readiness

Purpose: add the location- and lot-specific POS stock guard while preserving the existing POS posting implementation.

This file is source documentation only. The migration is not approved for execution against `kam_grains_db` or any unapproved database.

## Security prerequisites

- `kam_grains_pos_fn_owner` must already exist as `NOLOGIN` and `NOSUPERUSER`.
- The role must have only the table, sequence, and function privileges required by the existing legacy POS posting implementation. Those privileges must be inventoried on approved staging; this migration intentionally does not issue broad schema or table grants.
- The migration session must set `kam_grains.application_role` to the actual application database role. The role is not inferred from Windows services or repository usernames.
- The migration runner must be authorized to transfer ownership to `kam_grains_pos_fn_owner`.
- The application role receives `EXECUTE` only on `sal.post_pos_sale(uuid)`. `PUBLIC` and the application role receive no execute privilege on `sal.post_pos_sale_unscoped(uuid)`.

If any prerequisite is absent, the migration fails closed before changing the functions.

## Objects and behavior

- Renames the existing implementation to `sal.post_pos_sale_unscoped(uuid)`.
- Creates the guarded `sal.post_pos_sale(uuid)` wrapper as `SECURITY DEFINER` with `SET search_path = pg_catalog, public`.
- Validates sale location, selected lot eligibility, location-specific on-hand quantity, and transfer reservations.
- Uses transaction-scoped `stock-fulfil:<location_id>:<product_id>` advisory locks in product order.
- Calls the legacy implementation exactly once after successful validation.

## Rollback and verification

Rollback requires an approved database-specific plan because renaming the function back and restoring its ACLs must be coordinated with the application role and any dependent grants. Do not use an ad-hoc rollback in production.

The migration ends with read-only verification queries for function existence, owner, security mode, `search_path`, ACLs, and the expected application/function-owner/PUBLIC privilege matrix. Runtime security, posting, rollback, and concurrency tests must run only on isolated staging.

## Readiness

Status: **blocked pending role and environment confirmation**. No production or configured local database execution is authorized by this task.
