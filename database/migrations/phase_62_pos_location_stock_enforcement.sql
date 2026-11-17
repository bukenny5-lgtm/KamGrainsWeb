-- PHASE 62: POS LOCATION-SPECIFIC STOCK ENFORCEMENT
-- Keep the existing POS posting implementation and accounting behaviour, but
-- place an authoritative location/availability guard in front of it.

-- SECURITY PREREQUISITES (intentionally fail closed):
--   * kam_grains_pos_fn_owner must already exist as a NOLOGIN, non-superuser
--     role with only the privileges required by the legacy posting function.
--   * Set kam_grains.application_role to the actual application DB role for
--     this migration session. Do not guess this role from Windows services.
--   * The migration runner must be authorized to transfer function ownership
--     to kam_grains_pos_fn_owner and grant the wrapper to the application role.
-- No role is created and no broad table privilege is granted here.
DO $preflight$
DECLARE
    v_owner_role name := 'kam_grains_pos_fn_owner';
    v_app_role name := NULLIF(current_setting('kam_grains.application_role', true), '');
    v_owner pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO v_owner FROM pg_roles WHERE rolname = v_owner_role;
    IF NOT FOUND OR v_owner.rolcanlogin OR v_owner.rolsuper THEN
        RAISE EXCEPTION 'Phase 62 requires existing NOLOGIN non-superuser role %.', v_owner_role;
    END IF;
    IF v_app_role IS NULL OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_app_role) THEN
        RAISE EXCEPTION 'Phase 62 requires SET kam_grains.application_role to an existing application DB role.';
    END IF;
END;
$preflight$;

ALTER FUNCTION sal.post_pos_sale(uuid) RENAME TO post_pos_sale_unscoped;
ALTER FUNCTION sal.post_pos_sale_unscoped(uuid) OWNER TO kam_grains_pos_fn_owner;

-- RENAME preserves the old function's ACL. Remove the legacy public bypass
-- before exposing the guarded entry point.
REVOKE ALL ON FUNCTION sal.post_pos_sale_unscoped(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) TO kam_grains_pos_fn_owner;

CREATE OR REPLACE FUNCTION sal.post_pos_sale(p_pos_sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_sale sal.pos_sale%ROWTYPE;
    v_line record;
    v_on_hand numeric;
    v_reserved numeric;
BEGIN
    SELECT * INTO v_sale
    FROM sal.pos_sale
    WHERE pos_sale_id = p_pos_sale_id
    FOR UPDATE;

    IF v_sale.pos_sale_id IS NULL THEN
        RAISE EXCEPTION 'POS sale not found: %', p_pos_sale_id;
    END IF;
    IF v_sale.status = 'POSTED' THEN
        RETURN v_sale.pos_sale_id;
    END IF;
    IF v_sale.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Only DRAFT POS sales can be posted. Current status: %', v_sale.status;
    END IF;
    IF v_sale.location_id IS NULL THEN
        RAISE EXCEPTION 'POS sale location is required.';
    END IF;

    -- Acquire every stock lock in product-id order so concurrent multi-line
    -- sales cannot deadlock by taking the same locks in different orders.
    FOR v_line IN
        SELECT DISTINCT l.product_id
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        WHERE l.pos_sale_id = v_sale.pos_sale_id
          AND p.is_stock_item
        ORDER BY l.product_id
    LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(
            'stock-fulfil:' || v_sale.location_id::text || ':' || v_line.product_id::text,
            0
        ));
    END LOOP;

    FOR v_line IN
        SELECT l.product_id, l.lot_id, l.qty,
               p.product_name, p.is_stock_item, p.track_lots,
               lot.product_id AS lot_product_id, lot.lot_status, lot.expiry_date
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        LEFT JOIN inv.lot lot ON lot.lot_id = l.lot_id
        WHERE l.pos_sale_id = v_sale.pos_sale_id
        ORDER BY l.pos_sale_line_id
    LOOP
        IF v_line.lot_id IS NOT NULL
           AND (v_line.lot_product_id IS NULL OR v_line.lot_product_id <> v_line.product_id) THEN
            RAISE EXCEPTION 'Selected lot does not belong to product %.', v_line.product_name;
        END IF;
        IF v_line.track_lots AND v_line.lot_id IS NULL THEN
            RAISE EXCEPTION 'A lot is required for product %.', v_line.product_name;
        END IF;
        IF v_line.lot_id IS NOT NULL
           AND (v_line.lot_status <> 'ACTIVE'
                OR (v_line.expiry_date IS NOT NULL AND v_line.expiry_date < current_date)) THEN
            RAISE EXCEPTION 'Selected lot is not eligible for product %.', v_line.product_name;
        END IF;

        IF v_line.is_stock_item THEN
            SELECT COALESCE(SUM(
                CASE
                    WHEN sml.to_location_id = v_sale.location_id THEN sml.qty
                    WHEN sml.from_location_id = v_sale.location_id THEN -sml.qty
                    ELSE 0
                END
            ), 0)
            INTO v_on_hand
            FROM inv.stock_movement_line sml
            JOIN inv.stock_movement sm ON sm.movement_id = sml.movement_id
            WHERE sml.product_id = v_line.product_id
              AND sml.lot_id IS NOT DISTINCT FROM v_line.lot_id
              AND (sml.to_location_id = v_sale.location_id
                   OR sml.from_location_id = v_sale.location_id);

            SELECT COALESCE(SUM(CASE
                WHEN t.status = 'DRAFT' THEN tl.qty
                WHEN t.status = 'PARTIALLY_DISPATCHED' THEN tl.qty - COALESCE(dispatched.dispatched_qty, 0)
                ELSE 0
            END), 0)
            INTO v_reserved
            FROM inv.stock_transfer t
            JOIN inv.stock_transfer_line tl ON tl.stock_transfer_id = t.stock_transfer_id
            LEFT JOIN LATERAL (
                SELECT SUM(dl.qty) AS dispatched_qty
                FROM inv.stock_transfer_dispatch_line dl
                JOIN inv.stock_transfer_dispatch d ON d.dispatch_id = dl.dispatch_id
                WHERE dl.stock_transfer_line_id = tl.stock_transfer_line_id
                  AND d.status = 'DISPATCHED'
            ) dispatched ON true
            WHERE t.source_location_id = v_sale.location_id
              AND t.status IN ('DRAFT', 'PARTIALLY_DISPATCHED')
              AND tl.product_id = v_line.product_id
              AND tl.lot_id IS NOT DISTINCT FROM v_line.lot_id;

            IF v_on_hand - v_reserved < v_line.qty THEN
                RAISE EXCEPTION 'Insufficient stock for product %. Available: %, requested: %',
                    v_line.product_name, GREATEST(v_on_hand - v_reserved, 0), v_line.qty;
            END IF;
        END IF;
    END LOOP;

    RETURN sal.post_pos_sale_unscoped(p_pos_sale_id);
END;
$function$;

ALTER FUNCTION sal.post_pos_sale(uuid) OWNER TO kam_grains_pos_fn_owner;

REVOKE ALL ON FUNCTION sal.post_pos_sale(uuid) FROM PUBLIC;
DO $grants$
DECLARE
    v_app_role name := current_setting('kam_grains.application_role');
BEGIN
    EXECUTE format('GRANT EXECUTE ON FUNCTION sal.post_pos_sale(uuid) TO %I', v_app_role);
END;
$grants$;

-- Verification queries for the controlled migration runbook (read-only).
SELECT p.oid::regprocedure AS function_name,
       pg_get_userbyid(p.proowner) AS owner_name,
       p.prosecdef AS security_definer,
       p.proconfig AS function_config
FROM pg_proc p
WHERE p.oid IN ('sal.post_pos_sale(uuid)'::regprocedure,
                'sal.post_pos_sale_unscoped(uuid)'::regprocedure)
ORDER BY 1;

SELECT routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'sal'
  AND routine_name IN ('post_pos_sale', 'post_pos_sale_unscoped')
ORDER BY routine_name, grantee, privilege_type;

SELECT has_function_privilege(current_user, 'sal.post_pos_sale(uuid)'::regprocedure, 'EXECUTE') AS guarded_callable,
       has_function_privilege(current_user, 'sal.post_pos_sale_unscoped(uuid)'::regprocedure, 'EXECUTE') AS legacy_callable;

SELECT current_setting('kam_grains.application_role', true) AS application_role,
       has_function_privilege(current_setting('kam_grains.application_role'), 'sal.post_pos_sale(uuid)'::regprocedure, 'EXECUTE') AS application_guarded_allowed,
       has_function_privilege(current_setting('kam_grains.application_role'), 'sal.post_pos_sale_unscoped(uuid)'::regprocedure, 'EXECUTE') AS application_legacy_denied;

SELECT has_function_privilege('kam_grains_pos_fn_owner', 'sal.post_pos_sale_unscoped(uuid)'::regprocedure, 'EXECUTE') AS owner_legacy_allowed,
       has_function_privilege('public', 'sal.post_pos_sale(uuid)'::regprocedure, 'EXECUTE') AS public_guarded_allowed,
       has_function_privilege('public', 'sal.post_pos_sale_unscoped(uuid)'::regprocedure, 'EXECUTE') AS public_legacy_allowed;
