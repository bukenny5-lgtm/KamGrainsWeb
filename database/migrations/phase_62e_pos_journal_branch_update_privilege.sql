-- PHASE 62E: POS JOURNAL BRANCH TRIGGER PRIVILEGE
--
-- The Phase 62D broad write revocation correctly removed blanket UPDATE, but
-- the POS completion trigger sal.assign_pos_journal_branch() legitimately
-- updates only fin.gl_journal.branch_id after sal.pos_sale is posted.
-- This migration grants only that column-level UPDATE privilege.

BEGIN;

DO $preflight$
DECLARE
    v_owner pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO v_owner
    FROM pg_roles
    WHERE rolname = 'kam_grains_pos_fn_owner';

    IF v_owner.rolname IS NULL OR v_owner.rolcanlogin OR v_owner.rolsuper
       OR v_owner.rolcreatedb OR v_owner.rolcreaterole OR v_owner.rolreplication THEN
        RAISE EXCEPTION 'kam_grains_pos_fn_owner must remain NOLOGIN and non-superuser';
    END IF;
END;
$preflight$;

GRANT UPDATE (branch_id)
ON TABLE fin.gl_journal
TO kam_grains_pos_fn_owner;

SELECT has_column_privilege(
           'kam_grains_pos_fn_owner',
           'fin.gl_journal',
           'branch_id',
           'UPDATE'
       ) AS owner_can_update_journal_branch,
       has_table_privilege(
           'kam_grains_pos_fn_owner',
           'fin.gl_journal',
           'DELETE'
       ) AS owner_can_delete_journal,
       has_function_privilege(
           'kam_grains_app',
           'sal.post_pos_sale(uuid)'::regprocedure,
           'EXECUTE'
       ) AS app_guarded_pos_execute,
       has_function_privilege(
           'kam_grains_app',
           'sal.post_pos_sale_unscoped(uuid)'::regprocedure,
           'EXECUTE'
       ) AS app_unscoped_pos_execute;

COMMIT;
