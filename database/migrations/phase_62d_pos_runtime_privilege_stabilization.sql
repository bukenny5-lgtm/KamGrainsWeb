-- PHASE 62D: POS RUNTIME PRIVILEGE STABILIZATION
--
-- Read-only catalog audit found shared invoker trigger functions that inspect
-- business-source tables while a POS journal is inserted.  This migration
-- stabilizes reads broadly, keeps writes explicit, and excludes administrative
-- or business-posting entry points from blanket EXECUTE.
--
-- Generated for kam_grains_db.  Do not execute automatically.

BEGIN;

DO $preflight$
DECLARE
    v_owner pg_roles%ROWTYPE;
    v_app pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO v_owner FROM pg_roles WHERE rolname = 'kam_grains_pos_fn_owner';
    SELECT * INTO v_app FROM pg_roles WHERE rolname = 'kam_grains_app';

    IF v_owner.rolname IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper
       OR v_owner.rolcreatedb OR v_owner.rolcreaterole OR v_owner.rolreplication THEN
        RAISE EXCEPTION 'kam_grains_pos_fn_owner must remain NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION';
    END IF;
    IF v_app.rolname IS NULL OR v_app.rolsuper OR v_app.rolcreatedb
       OR v_app.rolcreaterole OR v_app.rolreplication THEN
        RAISE EXCEPTION 'kam_grains_app has unexpected elevated role attributes';
    END IF;
END;
$preflight$;

-- The guarded POS entry point remains the only application POS entry point.
REVOKE EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) FROM kam_grains_app;
REVOKE EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sal.post_pos_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sal.post_pos_sale(uuid) TO kam_grains_app;
GRANT EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) TO kam_grains_pos_fn_owner;

-- Broad read-only access used by generic source-document and audit functions.
-- ALL TABLES includes ordinary tables and views in PostgreSQL's GRANT syntax.
GRANT USAGE ON SCHEMA app, audit, fin, inv, sal, sec, pur TO kam_grains_pos_fn_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA app, audit, fin, inv, sal, sec
TO kam_grains_pos_fn_owner;

-- Narrow additional schema access justified by the generic PUR journal trigger:
-- fin.assign_purchase_source_journal_branch() reads these only when the
-- journal source module is PUR.
GRANT SELECT ON TABLE
    pur.goods_receipt,
    pur.ap_invoice,
    pur.ap_payment,
    pur.ap_payment_apply
TO kam_grains_pos_fn_owner;

-- Remove any non-POS writes from this role, then restore only actual POS
-- transaction targets.  No business data is touched by REVOKE/GRANT.
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app, audit, fin, inv, sal, sec, pur
FROM kam_grains_pos_fn_owner;

GRANT UPDATE ON TABLE sal.pos_sale TO kam_grains_pos_fn_owner;
GRANT INSERT ON TABLE
    inv.stock_movement,
    inv.stock_movement_line,
    fin.gl_journal,
    fin.gl_journal_line,
    sal.ar_invoice,
    sal.ar_invoice_line,
    audit.event,
    audit.backdate_event
TO kam_grains_pos_fn_owner;

-- Shared numbering functions can consume any sequence in these transaction
-- schemas.  No app, public, mfg, or reporting sequence access is added.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit, fin, inv, sal
TO kam_grains_pos_fn_owner;

-- POS's complete direct/indirect support closure.  The audit found dangerous
-- administrative/business-posting functions (password/login, posting, void,
-- settlement, maintenance, and lot-creation entry points), so execution is
-- granted explicitly rather than blanket-granted.
GRANT EXECUTE ON FUNCTION
    sal.post_pos_sale(uuid),
    sal.post_pos_sale_unscoped(uuid),
    inv.get_default_unit_cost(uuid, uuid),
    sec.current_user_id(),
    fin.get_account_id(text),
    fin.next_journal_no(text),
    fin.create_journal(text, date, text, text, uuid),
    fin.add_journal_line(uuid, uuid, uuid, text, numeric, numeric),
    fin.assert_balanced(uuid),
    audit.log_row_change(),
    audit.fn_log_backdate_event(),
    inv.enforce_lot_rules(),
    inv.enforce_movement_header_rules(),
    sal.fill_ar_invoice_line_from_delivery(),
    sal.block_direct_pos_ar_void(),
    sal.assign_pos_journal_branch(),
    fin.assign_inventory_adjustment_journal_branch(),
    fin.assign_customer_return_journal_branch(),
    fin.assign_sales_source_journal_branch(),
    fin.assign_purchase_source_journal_branch(),
    fin.resolve_till_cash_journal_branch(),
    fin.resolve_expense_voucher_journal_branch()
TO kam_grains_pos_fn_owner;

-- Read-only verification.
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication
FROM pg_roles
WHERE rolname IN ('kam_grains_app','kam_grains_pos_fn_owner')
ORDER BY 1;

SELECT p.oid::regprocedure AS function_name,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
       has_function_privilege('kam_grains_app', p.oid, 'EXECUTE') AS app_execute,
       has_function_privilege('kam_grains_pos_fn_owner', p.oid, 'EXECUTE') AS owner_execute
FROM pg_proc p
WHERE p.oid IN ('sal.post_pos_sale(uuid)'::regprocedure,
                'sal.post_pos_sale_unscoped(uuid)'::regprocedure)
ORDER BY 1;

SELECT n.nspname AS schema_name,
       count(*) FILTER (WHERE NOT has_table_privilege('kam_grains_pos_fn_owner', c.oid, 'SELECT')) AS missing_select_tables,
       count(*) FILTER (WHERE c.relkind = 'r') AS tables_including_views_check
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','v','m','f')
  AND n.nspname IN ('app','audit','fin','inv','sal','sec')
GROUP BY n.nspname
ORDER BY 1;

SELECT n.nspname||'.'||c.relname AS object_name,
       has_table_privilege('kam_grains_pos_fn_owner', c.oid, 'INSERT') AS can_insert,
       has_table_privilege('kam_grains_pos_fn_owner', c.oid, 'UPDATE') AS can_update,
       has_table_privilege('kam_grains_pos_fn_owner', c.oid, 'DELETE') AS can_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname IN ('app','audit','fin','inv','sal','sec','pur')
  AND (has_table_privilege('kam_grains_pos_fn_owner', c.oid, 'INSERT')
    OR has_table_privilege('kam_grains_pos_fn_owner', c.oid, 'UPDATE')
    OR has_table_privilege('kam_grains_pos_fn_owner', c.oid, 'DELETE'))
ORDER BY 1;

SELECT n.nspname||'.'||c.relname AS sequence_name,
       has_sequence_privilege('kam_grains_pos_fn_owner', c.oid, 'USAGE') AS usage_privilege,
       has_sequence_privilege('kam_grains_pos_fn_owner', c.oid, 'SELECT') AS select_privilege
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'S' AND n.nspname IN ('audit','fin','inv','sal')
ORDER BY 1;

SELECT has_function_privilege('kam_grains_app','sal.post_pos_sale(uuid)'::regprocedure,'EXECUTE') AS app_guarded_execute,
       has_function_privilege('kam_grains_app','sal.post_pos_sale_unscoped(uuid)'::regprocedure,'EXECUTE') AS app_unscoped_execute,
       has_function_privilege('public','sal.post_pos_sale(uuid)'::regprocedure,'EXECUTE') AS public_guarded_execute,
       has_function_privilege('public','sal.post_pos_sale_unscoped(uuid)'::regprocedure,'EXECUTE') AS public_unscoped_execute,
       has_function_privilege('kam_grains_pos_fn_owner','sal.post_pos_sale_unscoped(uuid)'::regprocedure,'EXECUTE') AS owner_unscoped_execute;

COMMIT;
