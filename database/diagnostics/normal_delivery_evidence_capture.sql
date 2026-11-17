-- Normal delivery database evidence capture.
-- READ-ONLY: catalog metadata and object definitions only.
-- No business rows are selected and no application posting routine is invoked.

-- ==================================================
-- A. Environment identity
-- ==================================================
SELECT version() AS server_version,
       current_database() AS database_name,
       current_user AS executing_role;

SHOW server_version;

-- ==================================================
-- B. Delivery posting function inventory
-- ==================================================
SELECT p.oid,
       n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_result(p.oid) AS result_type,
       l.lanname AS language_name,
       r.rolname AS owner_role,
       p.prokind,
       p.provolatile,
       p.prosecdef AS security_definer,
       p.proconfig,
       p.proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'sal'
  AND p.proname IN ('post_delivery_by_no', 'post_delivery')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- ==================================================
-- C. Complete delivery posting function definitions
-- ==================================================
SELECT p.oid,
       n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_function_result(p.oid) AS result_type,
       l.lanname AS language_name,
       p.provolatile,
       p.prosecdef AS security_definer,
       r.rolname AS owner_role,
       p.proconfig,
       p.proacl,
       pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'sal'
  AND p.proname IN ('post_delivery_by_no', 'post_delivery')
  AND p.prokind IN ('f', 'p', 'w')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- ==================================================
-- D. Lot-options view definition and privileges
-- ==================================================
SELECT c.oid,
       n.nspname AS schema_name,
       c.relname AS view_name,
       r.rolname AS owner_role,
       c.relkind,
       c.relacl,
       EXISTS (
         SELECT 1
         FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
         WHERE x.grantee = 0 AND x.privilege_type = 'SELECT'
       ) AS public_select,
       has_table_privilege(current_user, n.nspname || '.' || c.relname, 'SELECT') AS current_role_select,
       pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE n.nspname = 'sal'
  AND c.relname = 'v_delivery_line_lot_options'
  AND c.relkind IN ('v', 'm');

-- ==================================================
-- E. Delivery and sales-order column metadata
-- ==================================================
WITH wanted(schema_name, relation_name) AS (
  VALUES
    ('sal', 'delivery'),
    ('sal', 'delivery_line'),
    ('sal', 'sales_order'),
    ('sal', 'sales_order_line')
)
SELECT w.schema_name,
       w.relation_name,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       NOT a.attnotnull AS is_nullable,
       pg_get_expr(ad.adbin, ad.adrelid) AS column_default
FROM wanted w
LEFT JOIN pg_namespace n ON n.nspname = w.schema_name
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = w.relation_name
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
ORDER BY w.relation_name, a.attnum;

-- ==================================================
-- F. Inventory movement column metadata
-- ==================================================
WITH wanted(schema_name, relation_name) AS (
  VALUES
    ('inv', 'stock_movement'),
    ('inv', 'stock_movement_line')
)
SELECT w.schema_name,
       w.relation_name,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       NOT a.attnotnull AS is_nullable,
       pg_get_expr(ad.adbin, ad.adrelid) AS column_default
FROM wanted w
LEFT JOIN pg_namespace n ON n.nspname = w.schema_name
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = w.relation_name
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
ORDER BY w.relation_name, a.attnum;

-- ==================================================
-- G. Reservation-related object definitions
-- ==================================================
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END AS relation_kind,
       r.rolname AS owner_role,
       c.relacl,
       pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE n.nspname IN ('sal', 'inv')
  AND c.relkind IN ('v', 'm')
  AND (
    pg_get_viewdef(c.oid, true) ILIKE '%reserved_qty%'
    OR pg_get_viewdef(c.oid, true) ILIKE '%available_qty%'
    OR pg_get_viewdef(c.oid, true) ILIKE '%qty_on_hand%'
    OR pg_get_viewdef(c.oid, true) ILIKE '%stock_transfer%'
    OR pg_get_viewdef(c.oid, true) ILIKE '%delivery%'
  )
ORDER BY n.nspname, c.relname;

SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       r.rolname AS owner_role,
       p.proacl,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname IN ('sal', 'inv')
  AND p.prokind IN ('f', 'p', 'w')
  AND (
    pg_get_functiondef(p.oid) ILIKE '%reserved_qty%'
    OR pg_get_functiondef(p.oid) ILIKE '%available_qty%'
    OR pg_get_functiondef(p.oid) ILIKE '%qty_on_hand%'
    OR pg_get_functiondef(p.oid) ILIKE '%stock_transfer%'
    OR pg_get_functiondef(p.oid) ILIKE '%delivery%'
  )
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       c.relkind,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       NOT a.attnotnull AS is_nullable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'inv'
  AND c.relname IN ('stock_transfer', 'stock_transfer_line')
ORDER BY c.relname, a.attnum;

-- ==================================================
-- H. Direct dependencies
-- ==================================================
SELECT p.oid AS function_oid,
       n.nspname AS function_schema,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       'relation' AS dependency_kind,
       rn.nspname AS referenced_schema,
       rc.relname AS referenced_relation,
       rc.relkind::text AS referenced_kind,
       d.deptype
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
JOIN pg_class rc ON d.refclassid = 'pg_class'::regclass AND d.refobjid = rc.oid
JOIN pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'sal'
  AND p.proname IN ('post_delivery_by_no', 'post_delivery')
UNION ALL
SELECT p.oid,
       n.nspname,
       p.proname,
       pg_get_function_identity_arguments(p.oid),
       'function',
       rn.nspname,
       rp.proname,
       rp.prokind::text,
       d.deptype
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid
JOIN pg_proc rp ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = rp.oid
JOIN pg_namespace rn ON rn.oid = rp.pronamespace
WHERE n.nspname = 'sal'
  AND p.proname IN ('post_delivery_by_no', 'post_delivery')
ORDER BY 2, 3, 4, 5, 6, 7;

SELECT v.oid AS view_oid,
       vn.nspname AS view_schema,
       v.relname AS view_name,
       rn.nspname AS referenced_schema,
       rc.relname AS referenced_relation,
       rc.relkind::text AS referenced_kind,
       d.deptype
FROM pg_class v
JOIN pg_namespace vn ON vn.oid = v.relnamespace
JOIN pg_rewrite rw ON rw.ev_class = v.oid
JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
JOIN pg_class rc ON d.refclassid = 'pg_class'::regclass AND d.refobjid = rc.oid
JOIN pg_namespace rn ON rn.oid = rc.relnamespace
WHERE vn.nspname = 'sal'
  AND v.relname = 'v_delivery_line_lot_options'
ORDER BY referenced_schema, referenced_relation;

-- ==================================================
-- I. Function ACL, security, and locking indicators
-- ==================================================
SELECT p.oid,
       n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       r.rolname AS owner_role,
       p.prosecdef AS security_definer,
       p.proconfig AS function_configuration,
       p.proacl AS raw_acl,
       EXISTS (
         SELECT 1
         FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
         WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE'
       ) AS public_execute,
       has_function_privilege(current_user, p.oid, 'EXECUTE') AS current_role_execute,
       pg_get_functiondef(p.oid) ILIKE '%pg_advisory_xact_lock%' AS contains_advisory_xact_lock,
       pg_get_functiondef(p.oid) ILIKE '%pg_advisory_lock%' AS contains_session_advisory_lock,
       pg_get_functiondef(p.oid) ILIKE '%stock-fulfil:%' AS contains_stock_fulfil_key
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'sal'
  AND p.proname IN ('post_delivery_by_no', 'post_delivery')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT p.oid,
       n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       grantor.rolname AS grantor_role,
       grantee.rolname AS grantee_role,
       x.privilege_type,
       x.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
LEFT JOIN pg_roles grantor ON grantor.oid = x.grantor
LEFT JOIN pg_roles grantee ON grantee.oid = x.grantee
WHERE n.nspname = 'sal'
  AND p.proname IN ('post_delivery_by_no', 'post_delivery')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid), grantee_role, x.privilege_type;

-- ==================================================
-- J. Schema security
-- ==================================================
SELECT n.oid AS schema_oid,
       n.nspname AS schema_name,
       r.rolname AS owner_role,
       n.nspacl,
       EXISTS (
         SELECT 1
         FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) x
         WHERE x.grantee = 0 AND x.privilege_type = 'CREATE'
       ) AS public_create,
       has_schema_privilege(current_user, n.nspname, 'CREATE') AS current_role_create,
       has_schema_privilege(current_user, n.nspname, 'USAGE') AS current_role_usage
FROM pg_namespace n
JOIN pg_roles r ON r.oid = n.nspowner
WHERE n.nspname IN ('sal', 'inv')
ORDER BY n.nspname;

SELECT n.nspname AS schema_name,
       r.rolname AS owner_role,
       c.relname AS relation_name,
       c.relkind,
       c.relacl,
       EXISTS (
         SELECT 1
         FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
         WHERE x.grantee = 0 AND x.privilege_type = 'SELECT'
       ) AS public_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.oid = c.relowner
WHERE n.nspname IN ('sal', 'inv')
  AND c.relname IN ('delivery', 'delivery_line', 'sales_order', 'sales_order_line', 'stock_movement', 'stock_movement_line', 'stock_transfer', 'stock_transfer_line', 'v_delivery_line_lot_options')
ORDER BY n.nspname, c.relname;
