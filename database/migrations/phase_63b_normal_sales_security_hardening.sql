-- PHASE 63B: NORMAL SALES SECURITY HARDENING
--
-- Read-only audit result: kam_grains_app already has the required runtime
-- schema/table/sequence privileges.  The deployed normal-sales entry points
-- and their internal posting helpers were also executable by PUBLIC.
-- This migration changes ACLs only; it does not change business logic or data.

BEGIN;

DO $preflight$
DECLARE
    v_app pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO v_app FROM pg_roles WHERE rolname = 'kam_grains_app';
    IF v_app.rolname IS NULL OR v_app.rolcanlogin IS DISTINCT FROM true
       OR v_app.rolsuper OR v_app.rolcreatedb OR v_app.rolcreaterole
       OR v_app.rolreplication THEN
        RAISE EXCEPTION 'kam_grains_app must remain LOGIN and non-superuser';
    END IF;
END;
$preflight$;

-- Normal-sales entry points and internal helpers.  PUBLIC must not be able to
-- post deliveries, create/post AR documents, write journals, or invoke the
-- mutating loaders directly.  The application role receives explicit access.
REVOKE EXECUTE ON FUNCTION
    sal.create_delivery_from_so_no(text),
    sal.post_delivery(uuid),
    sal.post_delivery_by_no(text),
    sal.create_ar_invoice_from_delivery_no(text),
    sal.load_ar_invoice_lines_from_delivery_by_no(text, text, boolean),
    sal.post_ar_invoice(uuid),
    sal.post_ar_invoice_by_no(text),
    sal.post_ar_payment(uuid),
    sal.post_ar_payment_by_receipt_no(text),
    sal.ar_payment_applied_total_by_receipt_no(text),
    sal.ar_payment_unapplied_by_receipt_no(text),
    sal.refresh_ar_invoice_status(uuid),
    sal.next_delivery_no(text),
    sal.next_ar_invoice_no(text),
    sal.next_receipt_no(),
    fin.next_journal_no(text),
    fin.create_journal(text, date, text, text, uuid),
    fin.add_journal_line(uuid, uuid, uuid, text, numeric, numeric),
    fin.assert_balanced(uuid),
    fin.get_account_id(text),
    inv.get_default_unit_cost(uuid, uuid),
    sec.current_user_id(),
    audit.log_row_change(),
    audit.fn_log_backdate_event(),
    inv.enforce_lot_rules(),
    inv.enforce_movement_header_rules(),
    sal.fill_ar_invoice_line_from_delivery(),
    sal.fill_delivery_line_from_sales_order(),
    sal.block_direct_pos_ar_void(),
    sal.trg_refresh_ar_invoice_status_after_payment_apply(),
    fin.assign_customer_return_journal_branch(),
    fin.assign_inventory_adjustment_journal_branch(),
    fin.assign_purchase_source_journal_branch(),
    fin.assign_sales_source_journal_branch(),
    fin.resolve_expense_voucher_journal_branch(),
    fin.resolve_till_cash_journal_branch(),
    public.update_row_version()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    sal.create_delivery_from_so_no(text),
    sal.post_delivery(uuid),
    sal.post_delivery_by_no(text),
    sal.create_ar_invoice_from_delivery_no(text),
    sal.load_ar_invoice_lines_from_delivery_by_no(text, text, boolean),
    sal.post_ar_invoice(uuid),
    sal.post_ar_invoice_by_no(text),
    sal.post_ar_payment(uuid),
    sal.post_ar_payment_by_receipt_no(text),
    sal.ar_payment_applied_total_by_receipt_no(text),
    sal.ar_payment_unapplied_by_receipt_no(text),
    sal.refresh_ar_invoice_status(uuid),
    sal.next_delivery_no(text),
    sal.next_ar_invoice_no(text),
    sal.next_receipt_no(),
    fin.next_journal_no(text),
    fin.create_journal(text, date, text, text, uuid),
    fin.add_journal_line(uuid, uuid, uuid, text, numeric, numeric),
    fin.assert_balanced(uuid),
    fin.get_account_id(text),
    inv.get_default_unit_cost(uuid, uuid),
    sec.current_user_id(),
    audit.log_row_change(),
    audit.fn_log_backdate_event(),
    inv.enforce_lot_rules(),
    inv.enforce_movement_header_rules(),
    sal.fill_ar_invoice_line_from_delivery(),
    sal.fill_delivery_line_from_sales_order(),
    sal.block_direct_pos_ar_void(),
    sal.trg_refresh_ar_invoice_status_after_payment_apply(),
    fin.assign_customer_return_journal_branch(),
    fin.assign_inventory_adjustment_journal_branch(),
    fin.assign_purchase_source_journal_branch(),
    fin.assign_sales_source_journal_branch(),
    fin.resolve_expense_voucher_journal_branch(),
    fin.resolve_till_cash_journal_branch(),
    public.update_row_version()
TO kam_grains_app;

-- Read-only verification of the complete hardened chain.
WITH chain(fn) AS (
    VALUES
      ('sal.create_delivery_from_so_no(text)'::regprocedure),
      ('sal.post_delivery(uuid)'::regprocedure),
      ('sal.post_delivery_by_no(text)'::regprocedure),
      ('sal.create_ar_invoice_from_delivery_no(text)'::regprocedure),
      ('sal.load_ar_invoice_lines_from_delivery_by_no(text,text,boolean)'::regprocedure),
      ('sal.post_ar_invoice(uuid)'::regprocedure),
      ('sal.post_ar_invoice_by_no(text)'::regprocedure),
      ('sal.post_ar_payment(uuid)'::regprocedure),
      ('sal.post_ar_payment_by_receipt_no(text)'::regprocedure),
      ('sal.ar_payment_applied_total_by_receipt_no(text)'::regprocedure),
      ('sal.ar_payment_unapplied_by_receipt_no(text)'::regprocedure),
      ('sal.refresh_ar_invoice_status(uuid)'::regprocedure),
      ('sal.next_delivery_no(text)'::regprocedure),
      ('sal.next_ar_invoice_no(text)'::regprocedure),
      ('sal.next_receipt_no()'::regprocedure),
      ('fin.next_journal_no(text)'::regprocedure),
      ('fin.create_journal(text,date,text,text,uuid)'::regprocedure),
      ('fin.add_journal_line(uuid,uuid,uuid,text,numeric,numeric)'::regprocedure),
      ('fin.assert_balanced(uuid)'::regprocedure),
      ('fin.get_account_id(text)'::regprocedure),
      ('inv.get_default_unit_cost(uuid,uuid)'::regprocedure),
      ('sec.current_user_id()'::regprocedure),
      ('audit.log_row_change()'::regprocedure),
      ('audit.fn_log_backdate_event()'::regprocedure),
      ('inv.enforce_lot_rules()'::regprocedure),
      ('inv.enforce_movement_header_rules()'::regprocedure),
      ('sal.fill_ar_invoice_line_from_delivery()'::regprocedure),
      ('sal.fill_delivery_line_from_sales_order()'::regprocedure),
      ('sal.block_direct_pos_ar_void()'::regprocedure),
      ('sal.trg_refresh_ar_invoice_status_after_payment_apply()'::regprocedure),
      ('fin.assign_customer_return_journal_branch()'::regprocedure),
      ('fin.assign_inventory_adjustment_journal_branch()'::regprocedure),
      ('fin.assign_purchase_source_journal_branch()'::regprocedure),
      ('fin.assign_sales_source_journal_branch()'::regprocedure),
      ('fin.resolve_expense_voucher_journal_branch()'::regprocedure),
      ('fin.resolve_till_cash_journal_branch()'::regprocedure),
      ('public.update_row_version()'::regprocedure)
)
SELECT c.fn,
       has_function_privilege('public', c.fn, 'EXECUTE') AS public_execute,
       has_function_privilege('kam_grains_app', c.fn, 'EXECUTE') AS app_execute
FROM chain c
ORDER BY 1;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication
FROM pg_roles
WHERE rolname = 'kam_grains_app';

SELECT has_schema_privilege('kam_grains_app','sal','USAGE') AS sal_usage,
       has_schema_privilege('kam_grains_app','inv','USAGE') AS inv_usage,
       has_schema_privilege('kam_grains_app','fin','USAGE') AS fin_usage,
       has_schema_privilege('kam_grains_app','audit','USAGE') AS audit_usage,
       has_sequence_privilege('kam_grains_app','sal.delivery_no_seq','USAGE') AS delivery_seq_usage,
       has_sequence_privilege('kam_grains_app','sal.ar_invoice_no_seq','USAGE') AS invoice_seq_usage,
       has_sequence_privilege('kam_grains_app','sal.receipt_no_seq','USAGE') AS receipt_seq_usage,
       has_sequence_privilege('kam_grains_app','fin.journal_no_seq','USAGE') AS journal_seq_usage;

SELECT
    pg_get_functiondef('sal.post_delivery(uuid)'::regprocedure) ILIKE '%pg_advisory_xact_lock%' AS has_stock_fulfil_lock,
    pg_get_functiondef('sal.post_delivery(uuid)'::regprocedure) ILIKE '%v_reserved%' AS has_reservation_validation,
    pg_get_viewdef('sal.v_delivery_line_lot_options'::regclass,true) ILIKE '%reserved_qty%' AS view_is_reservation_aware,
    pg_get_viewdef('sal.v_delivery_line_lot_options'::regclass,true) ILIKE '%available_qty%' AS view_exposes_available_stock;

COMMIT;
