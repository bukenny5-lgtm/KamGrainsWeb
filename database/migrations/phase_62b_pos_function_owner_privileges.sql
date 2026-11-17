-- PHASE 62B: POS protected-function owner privilege remediation
--
-- This migration is intentionally not executed by repository tooling.
-- Review the read-only catalog audit and apply manually as an authorized
-- PostgreSQL administrator only after confirming the target database.
--
-- Scope: privileges required by the deployed sal.post_pos_sale(uuid) security
-- definer wrapper and sal.post_pos_sale_unscoped(uuid) implementation.
-- No data, function bodies, role attributes, or stock/concurrency logic are
-- changed here.

BEGIN;

-- Fail closed if the protected execution role has drifted from its required
-- security posture. This does not alter role attributes.
DO $$
DECLARE
    v_can_login boolean;
    v_is_superuser boolean;
BEGIN
    SELECT rolcanlogin, rolsuper
      INTO v_can_login, v_is_superuser
      FROM pg_roles
     WHERE rolname = 'kam_grains_pos_fn_owner';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Required role kam_grains_pos_fn_owner does not exist';
    END IF;
    IF v_can_login OR v_is_superuser THEN
        RAISE EXCEPTION 'kam_grains_pos_fn_owner must remain NOLOGIN and NOSUPERUSER';
    END IF;
END $$;

-- Schemas used by the protected function chain.
GRANT USAGE ON SCHEMA app, fin, inv, sal, sec TO kam_grains_pos_fn_owner;

-- Direct reads performed by the guarded wrapper and unscoped implementation,
-- including the transfer-reservation check that previously failed at runtime.
GRANT SELECT ON TABLE
    app.company_profile,
    fin.posting_setup,
    fin.gl_journal_line,
    inv.product,
    inv.lot,
    inv.stock_movement,
    inv.stock_movement_line,
    inv.stock_transfer,
    inv.stock_transfer_line,
    inv.stock_transfer_dispatch,
    inv.stock_transfer_dispatch_line,
    inv.v_lot_unit_cost,
    sal.pos_sale,
    sal.pos_sale_line,
    sal.pos_product_price
TO kam_grains_pos_fn_owner;

-- The posting implementation locks and updates the sale, and uses RETURNING
-- on inserted rows; SELECT is therefore retained alongside write privileges.
GRANT SELECT, UPDATE ON TABLE sal.pos_sale TO kam_grains_pos_fn_owner;
GRANT SELECT, INSERT ON TABLE
    inv.stock_movement,
    inv.stock_movement_line,
    fin.gl_journal,
    fin.gl_journal_line,
    sal.ar_invoice,
    sal.ar_invoice_line
TO kam_grains_pos_fn_owner;

-- Sequences consumed by fin.create_journal and credit-sale AR invoice defaults.
GRANT USAGE, SELECT ON SEQUENCE
    fin.journal_no_seq,
    sal.ar_invoice_no_seq
TO kam_grains_pos_fn_owner;

-- Functions called directly or indirectly by the protected POS chain.
GRANT EXECUTE ON FUNCTION
    sal.post_pos_sale(uuid),
    sal.post_pos_sale_unscoped(uuid),
    inv.get_default_unit_cost(uuid, uuid),
    sec.current_user_id(),
    fin.get_account_id(text),
    fin.next_journal_no(text),
    fin.create_journal(text, date, text, text, uuid),
    fin.add_journal_line(uuid, uuid, uuid, text, numeric, numeric),
    fin.assert_balanced(uuid)
TO kam_grains_pos_fn_owner;

-- Preserve the guarded/unscoped boundary. The application may call only the
-- guarded wrapper; neither protected function is callable by PUBLIC.
REVOKE ALL ON FUNCTION sal.post_pos_sale(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION sal.post_pos_sale_unscoped(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) FROM kam_grains_app;
GRANT EXECUTE ON FUNCTION sal.post_pos_sale(uuid) TO kam_grains_app;
GRANT EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) TO kam_grains_pos_fn_owner;

-- Read-only verification: role posture, function security, ACL boundary, and
-- every privilege granted by this migration.
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication
FROM pg_roles
WHERE rolname IN ('kam_grains_app', 'kam_grains_pos_fn_owner')
ORDER BY rolname;

SELECT p.oid::regprocedure AS function_name,
       r.rolname AS owner,
       p.prosecdef AS security_definer,
       p.proconfig,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
       has_function_privilege('kam_grains_app', p.oid, 'EXECUTE') AS app_execute,
       has_function_privilege('kam_grains_pos_fn_owner', p.oid, 'EXECUTE') AS owner_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.oid IN (
    'sal.post_pos_sale(uuid)'::regprocedure,
    'sal.post_pos_sale_unscoped(uuid)'::regprocedure
)
ORDER BY 1;

SELECT object_name, required_privilege, owner_has_privilege
FROM (
    VALUES
      ('app.company_profile', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'app.company_profile', 'SELECT')),
      ('fin.posting_setup', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'fin.posting_setup', 'SELECT')),
      ('fin.gl_journal', 'SELECT, INSERT', has_table_privilege('kam_grains_pos_fn_owner', 'fin.gl_journal', 'SELECT') AND has_table_privilege('kam_grains_pos_fn_owner', 'fin.gl_journal', 'INSERT')),
      ('fin.gl_journal_line', 'SELECT, INSERT', has_table_privilege('kam_grains_pos_fn_owner', 'fin.gl_journal_line', 'SELECT') AND has_table_privilege('kam_grains_pos_fn_owner', 'fin.gl_journal_line', 'INSERT')),
      ('inv.product', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.product', 'SELECT')),
      ('inv.lot', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.lot', 'SELECT')),
      ('inv.stock_movement', 'SELECT, INSERT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_movement', 'SELECT') AND has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_movement', 'INSERT')),
      ('inv.stock_movement_line', 'SELECT, INSERT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_movement_line', 'SELECT') AND has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_movement_line', 'INSERT')),
      ('inv.stock_transfer', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_transfer', 'SELECT')),
      ('inv.stock_transfer_line', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_transfer_line', 'SELECT')),
      ('inv.stock_transfer_dispatch', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_transfer_dispatch', 'SELECT')),
      ('inv.stock_transfer_dispatch_line', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.stock_transfer_dispatch_line', 'SELECT')),
      ('inv.v_lot_unit_cost', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'inv.v_lot_unit_cost', 'SELECT')),
      ('sal.pos_sale', 'SELECT, UPDATE', has_table_privilege('kam_grains_pos_fn_owner', 'sal.pos_sale', 'SELECT') AND has_table_privilege('kam_grains_pos_fn_owner', 'sal.pos_sale', 'UPDATE')),
      ('sal.pos_sale_line', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'sal.pos_sale_line', 'SELECT')),
      ('sal.pos_product_price', 'SELECT', has_table_privilege('kam_grains_pos_fn_owner', 'sal.pos_product_price', 'SELECT')),
      ('sal.ar_invoice', 'SELECT, INSERT', has_table_privilege('kam_grains_pos_fn_owner', 'sal.ar_invoice', 'SELECT') AND has_table_privilege('kam_grains_pos_fn_owner', 'sal.ar_invoice', 'INSERT')),
      ('sal.ar_invoice_line', 'SELECT, INSERT', has_table_privilege('kam_grains_pos_fn_owner', 'sal.ar_invoice_line', 'SELECT') AND has_table_privilege('kam_grains_pos_fn_owner', 'sal.ar_invoice_line', 'INSERT'))
) AS audit(object_name, required_privilege, owner_has_privilege)
ORDER BY NOT owner_has_privilege, object_name;

SELECT object_name, required_privilege, owner_has_privilege
FROM (
    VALUES
      ('app', 'USAGE', has_schema_privilege('kam_grains_pos_fn_owner', 'app', 'USAGE')),
      ('fin', 'USAGE', has_schema_privilege('kam_grains_pos_fn_owner', 'fin', 'USAGE')),
      ('inv', 'USAGE', has_schema_privilege('kam_grains_pos_fn_owner', 'inv', 'USAGE')),
      ('sal', 'USAGE', has_schema_privilege('kam_grains_pos_fn_owner', 'sal', 'USAGE')),
      ('sec', 'USAGE', has_schema_privilege('kam_grains_pos_fn_owner', 'sec', 'USAGE')),
      ('fin.journal_no_seq', 'USAGE, SELECT', has_sequence_privilege('kam_grains_pos_fn_owner', 'fin.journal_no_seq', 'USAGE') AND has_sequence_privilege('kam_grains_pos_fn_owner', 'fin.journal_no_seq', 'SELECT')),
      ('sal.ar_invoice_no_seq', 'USAGE, SELECT', has_sequence_privilege('kam_grains_pos_fn_owner', 'sal.ar_invoice_no_seq', 'USAGE') AND has_sequence_privilege('kam_grains_pos_fn_owner', 'sal.ar_invoice_no_seq', 'SELECT'))
) AS audit(object_name, required_privilege, owner_has_privilege)
ORDER BY NOT owner_has_privilege, object_name;

COMMIT;
