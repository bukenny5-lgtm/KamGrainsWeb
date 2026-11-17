-- PHASE 62C: COMPLETE POS PRIVILEGE CLOSURE
--
-- Generated from a read-only catalog audit of kam_grains_db.  This migration
-- grants only the privileges missing from the deployed guarded POS closure.
-- It does not post a sale, change data, alter function bodies, or change
-- Phase 62/63 locking/reservation logic.

BEGIN;

DO $preflight$
DECLARE
    v_owner pg_roles%ROWTYPE;
    v_app pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO v_owner FROM pg_roles WHERE rolname = 'kam_grains_pos_fn_owner';
    SELECT * INTO v_app FROM pg_roles WHERE rolname = 'kam_grains_app';
    IF v_owner.rolname IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper OR v_owner.rolcreatedb
       OR v_owner.rolcreaterole OR v_owner.rolreplication THEN
        RAISE EXCEPTION 'kam_grains_pos_fn_owner must remain NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION';
    END IF;
    IF v_app.rolname IS NULL OR v_app.rolcanlogin IS DISTINCT FROM true OR v_app.rolsuper
       OR v_app.rolcreatedb OR v_app.rolcreaterole OR v_app.rolreplication THEN
        RAISE EXCEPTION 'kam_grains_app has unexpected role attributes';
    END IF;
END;
$preflight$;

-- The guarded entry point remains the only application POS entry point.
REVOKE EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) FROM kam_grains_app;
REVOKE EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION sal.post_pos_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sal.post_pos_sale(uuid) TO kam_grains_app;
GRANT EXECUTE ON FUNCTION sal.post_pos_sale_unscoped(uuid) TO kam_grains_pos_fn_owner;

-- Schemas in the recursive POS closure.
GRANT USAGE ON SCHEMA app, audit, fin, inv, sal, sec TO kam_grains_pos_fn_owner;

-- Direct POS reads and writes, including the guarded reservation calculation,
-- accounting writes, and credit-sale AR creation.
GRANT SELECT ON TABLE
    app.company_profile,
    fin.posting_setup,
    fin.gl_journal,
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

GRANT SELECT, UPDATE ON TABLE sal.pos_sale TO kam_grains_pos_fn_owner;
GRANT SELECT, INSERT ON TABLE
    inv.stock_movement,
    inv.stock_movement_line,
    fin.gl_journal,
    fin.gl_journal_line,
    sal.ar_invoice,
    sal.ar_invoice_line
TO kam_grains_pos_fn_owner;

-- Invoker audit triggers run inside the protected posting transaction.
-- log_row_change() inserts audit.event for stock movement and AR rows.
-- fn_log_backdate_event() inserts audit.backdate_event when a credit AR row
-- is explicitly backdated; its identity default consumes this sequence.
GRANT INSERT ON TABLE audit.event, audit.backdate_event TO kam_grains_pos_fn_owner;
GRANT USAGE, SELECT ON SEQUENCE audit.backdate_event_backdate_event_id_seq TO kam_grains_pos_fn_owner;

-- Sequence/default closure for journal numbering and AR invoice numbering.
GRANT USAGE, SELECT ON SEQUENCE fin.journal_no_seq, sal.ar_invoice_no_seq
TO kam_grains_pos_fn_owner;

-- Explicitly retain EXECUTE on every function in the modified-table trigger
-- closure, plus the direct/indirect POS function calls.  These are idempotent
-- grants and do not expose either protected entry point to PUBLIC.
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

-- Read-only verification.  The VALUES matrix is the complete audited POS
-- closure; a false value identifies a failed remediation without executing a
-- business transaction.
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

SELECT object_name, required_privilege, has_privilege
FROM (
    VALUES
      ('app.company_profile','SELECT',has_table_privilege('kam_grains_pos_fn_owner','app.company_profile','SELECT')),
      ('audit.event','INSERT',has_table_privilege('kam_grains_pos_fn_owner','audit.event','INSERT')),
      ('audit.backdate_event','INSERT',has_table_privilege('kam_grains_pos_fn_owner','audit.backdate_event','INSERT')),
      ('fin.posting_setup','SELECT',has_table_privilege('kam_grains_pos_fn_owner','fin.posting_setup','SELECT')),
      ('fin.gl_journal','SELECT, INSERT',has_table_privilege('kam_grains_pos_fn_owner','fin.gl_journal','SELECT') AND has_table_privilege('kam_grains_pos_fn_owner','fin.gl_journal','INSERT')),
      ('fin.gl_journal_line','SELECT, INSERT',has_table_privilege('kam_grains_pos_fn_owner','fin.gl_journal_line','SELECT') AND has_table_privilege('kam_grains_pos_fn_owner','fin.gl_journal_line','INSERT')),
      ('inv.product','SELECT',has_table_privilege('kam_grains_pos_fn_owner','inv.product','SELECT')),
      ('inv.lot','SELECT',has_table_privilege('kam_grains_pos_fn_owner','inv.lot','SELECT')),
      ('inv.stock_movement','SELECT, INSERT',has_table_privilege('kam_grains_pos_fn_owner','inv.stock_movement','SELECT') AND has_table_privilege('kam_grains_pos_fn_owner','inv.stock_movement','INSERT')),
      ('inv.stock_movement_line','SELECT, INSERT',has_table_privilege('kam_grains_pos_fn_owner','inv.stock_movement_line','SELECT') AND has_table_privilege('kam_grains_pos_fn_owner','inv.stock_movement_line','INSERT')),
      ('inv.stock_transfer','SELECT',has_table_privilege('kam_grains_pos_fn_owner','inv.stock_transfer','SELECT')),
      ('inv.stock_transfer_line','SELECT',has_table_privilege('kam_grains_pos_fn_owner','inv.stock_transfer_line','SELECT')),
      ('inv.stock_transfer_dispatch','SELECT',has_table_privilege('kam_grains_pos_fn_owner','inv.stock_transfer_dispatch','SELECT')),
      ('inv.stock_transfer_dispatch_line','SELECT',has_table_privilege('kam_grains_pos_fn_owner','inv.stock_transfer_dispatch_line','SELECT')),
      ('inv.v_lot_unit_cost','SELECT',has_table_privilege('kam_grains_pos_fn_owner','inv.v_lot_unit_cost','SELECT')),
      ('sal.pos_sale','SELECT, UPDATE',has_table_privilege('kam_grains_pos_fn_owner','sal.pos_sale','SELECT') AND has_table_privilege('kam_grains_pos_fn_owner','sal.pos_sale','UPDATE')),
      ('sal.pos_sale_line','SELECT',has_table_privilege('kam_grains_pos_fn_owner','sal.pos_sale_line','SELECT')),
      ('sal.pos_product_price','SELECT',has_table_privilege('kam_grains_pos_fn_owner','sal.pos_product_price','SELECT')),
      ('sal.ar_invoice','SELECT, INSERT',has_table_privilege('kam_grains_pos_fn_owner','sal.ar_invoice','SELECT') AND has_table_privilege('kam_grains_pos_fn_owner','sal.ar_invoice','INSERT')),
      ('sal.ar_invoice_line','SELECT, INSERT',has_table_privilege('kam_grains_pos_fn_owner','sal.ar_invoice_line','SELECT') AND has_table_privilege('kam_grains_pos_fn_owner','sal.ar_invoice_line','INSERT'))
) AS v(object_name,required_privilege,has_privilege)
ORDER BY NOT has_privilege, object_name;

SELECT object_name, required_privilege, has_privilege
FROM (
    VALUES
      ('app','USAGE',has_schema_privilege('kam_grains_pos_fn_owner','app','USAGE')),
      ('audit','USAGE',has_schema_privilege('kam_grains_pos_fn_owner','audit','USAGE')),
      ('fin','USAGE',has_schema_privilege('kam_grains_pos_fn_owner','fin','USAGE')),
      ('inv','USAGE',has_schema_privilege('kam_grains_pos_fn_owner','inv','USAGE')),
      ('sal','USAGE',has_schema_privilege('kam_grains_pos_fn_owner','sal','USAGE')),
      ('sec','USAGE',has_schema_privilege('kam_grains_pos_fn_owner','sec','USAGE')),
      ('audit.backdate_event_backdate_event_id_seq','USAGE, SELECT',has_sequence_privilege('kam_grains_pos_fn_owner','audit.backdate_event_backdate_event_id_seq','USAGE') AND has_sequence_privilege('kam_grains_pos_fn_owner','audit.backdate_event_backdate_event_id_seq','SELECT')),
      ('fin.journal_no_seq','USAGE, SELECT',has_sequence_privilege('kam_grains_pos_fn_owner','fin.journal_no_seq','USAGE') AND has_sequence_privilege('kam_grains_pos_fn_owner','fin.journal_no_seq','SELECT')),
      ('sal.ar_invoice_no_seq','USAGE, SELECT',has_sequence_privilege('kam_grains_pos_fn_owner','sal.ar_invoice_no_seq','USAGE') AND has_sequence_privilege('kam_grains_pos_fn_owner','sal.ar_invoice_no_seq','SELECT'))
) AS v(object_name,required_privilege,has_privilege)
ORDER BY NOT has_privilege, object_name;

SELECT has_schema_privilege('kam_grains_app','app','USAGE')
   AND has_schema_privilege('kam_grains_app','audit','USAGE')
   AND has_schema_privilege('kam_grains_app','fin','USAGE')
   AND has_schema_privilege('kam_grains_app','inv','USAGE')
   AND has_schema_privilege('kam_grains_app','mfg','USAGE')
   AND has_schema_privilege('kam_grains_app','pur','USAGE')
   AND has_schema_privilege('kam_grains_app','reporting','USAGE')
   AND has_schema_privilege('kam_grains_app','sal','USAGE')
   AND has_schema_privilege('kam_grains_app','sec','USAGE') AS app_schema_closure,
       has_function_privilege('kam_grains_app','sal.post_pos_sale(uuid)'::regprocedure,'EXECUTE') AS app_guarded_pos,
       has_function_privilege('kam_grains_app','sal.post_pos_sale_unscoped(uuid)'::regprocedure,'EXECUTE') AS app_unscoped_pos;

SELECT has_function_privilege('public','sal.post_pos_sale(uuid)'::regprocedure,'EXECUTE') AS public_guarded_pos,
       has_function_privilege('public','sal.post_pos_sale_unscoped(uuid)'::regprocedure,'EXECUTE') AS public_unscoped_pos,
       has_function_privilege('kam_grains_pos_fn_owner','sal.post_pos_sale_unscoped(uuid)'::regprocedure,'EXECUTE') AS owner_unscoped_pos;

COMMIT;
