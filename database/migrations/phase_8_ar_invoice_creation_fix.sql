-- Migration: phase_8_ar_invoice_creation_fix.sql
-- Fixes the AR invoice-from-delivery creation flow.
--
-- Root cause:
-- The route created the invoice, then later selected invoice data using gj_post
-- without joining fin.gl_journal gj_post in the same SQL. PostgreSQL raised
-- "missing FROM-clause entry for table \"gj_post\"" while the invoice insert had
-- already succeeded. The route also lacked an explicit transactional wrapper,
-- so a later failure after invoice creation could leave a partially-created AR
-- invoice in an inconsistent state.
--
-- This migration preserves the existing ERP workflow: a posted delivery creates an
-- AR invoice in a pending-to-post state, but does not auto-post the invoice.
-- It does not modify historical accounting entries or existing posted journals.

CREATE OR REPLACE FUNCTION sal.create_ar_invoice_from_delivery_no(p_delivery_no text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_delivery sal.delivery%ROWTYPE;
  v_customer_id bigint;
  v_invoice_no text;
  v_invoice_date date;
  v_transaction_date date;
  v_due_date date;
  v_ar_invoice_id bigint;
BEGIN
  SELECT *
    INTO v_delivery
    FROM sal.delivery
   WHERE delivery_no = p_delivery_no;

  IF v_delivery.delivery_id IS NULL THEN
    RAISE EXCEPTION 'Delivery % not found.', p_delivery_no;
  END IF;

  IF COALESCE(v_delivery.is_posted, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Delivery % must be posted before creating an AR invoice.', p_delivery_no;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM sal.ar_invoice ai
     WHERE ai.delivery_id = v_delivery.delivery_id
       AND COALESCE(ai.status, 'OPEN') <> 'VOID'
  ) THEN
    RAISE EXCEPTION 'AR invoice already exists for delivery %.', p_delivery_no;
  END IF;

  v_transaction_date := COALESCE(v_delivery.transaction_date, v_delivery.delivery_date, CURRENT_DATE);
  v_invoice_date := COALESCE(v_delivery.delivery_date, v_transaction_date, CURRENT_DATE);
  v_due_date := v_invoice_date + 30;

  INSERT INTO sal.ar_invoice (
    customer_id,
    delivery_id,
    invoice_no,
    invoice_date,
    transaction_date,
    due_date,
    status,
    backdate_flag,
    backdate_reason,
    backdate_approved_by,
    backdate_approved_at,
    created_at
  )
  VALUES (
    v_delivery.customer_id,
    v_delivery.delivery_id,
    NULL,
    v_invoice_date,
    v_transaction_date,
    v_due_date,
    'OPEN',
    v_delivery.backdate_flag,
    v_delivery.backdate_reason,
    v_delivery.backdate_approved_by,
    v_delivery.backdate_approved_at,
    CURRENT_TIMESTAMP
  )
  RETURNING ar_invoice_id INTO v_ar_invoice_id;

  v_invoice_no := 'AR-' || v_ar_invoice_id;

  UPDATE sal.ar_invoice
     SET invoice_no = v_invoice_no
   WHERE ar_invoice_id = v_ar_invoice_id;

  RETURN v_invoice_no;
END;
$$;
