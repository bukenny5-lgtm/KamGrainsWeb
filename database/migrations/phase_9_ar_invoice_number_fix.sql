-- Migration: phase_9_ar_invoice_number_fix.sql
-- Purpose: Ensure sal.create_ar_invoice_from_delivery_no generates a non-NULL invoice_no
-- before inserting into sal.ar_invoice. This avoids a NOT NULL violation and preserves
-- the Phase 8 transaction_date/backdate behavior.
--
-- Safety: This migration only creates a sequence (if needed) and replaces the function
-- implementation. It does not modify existing ar_invoice rows, posted journals, or
-- historical data. It is idempotent where practical.

-- 1) Create a dedicated sequence for AR invoice numeric suffix if it doesn't exist.
CREATE SEQUENCE IF NOT EXISTS sal.ar_invoice_no_seq;

-- 2) Initialize the sequence based on the existing numeric suffix used by the ERP's
--    established invoice format: 'ARI-YYYYMMDD-NNNNNN'.
--    The sequence stores only the numeric suffix, so we parse the final six-digit number
--    from existing records and set the sequence to a safe value without modifying invoices.
DO $$
DECLARE
  max_n bigint;
  seq_current bigint;
BEGIN
  SELECT MAX((regexp_replace(invoice_no, '^ARI-[0-9]{8}-([0-9]+)$', '\1'))::bigint)
    INTO max_n
    FROM sal.ar_invoice
    WHERE invoice_no ~ '^ARI-[0-9]{8}-[0-9]+$';

  SELECT last_value
    INTO seq_current
    FROM pg_sequences
    WHERE schemaname = 'sal' AND sequencename = 'ar_invoice_no_seq';

  IF max_n IS NULL THEN
    -- No matching legacy/current invoice numbers exist; start clean at 1.
    PERFORM setval('sal.ar_invoice_no_seq', 1, false);
  ELSIF seq_current IS NULL OR seq_current < max_n THEN
    -- Ensure the next generated suffix is max_n + 1 and never reset backwards.
    PERFORM setval('sal.ar_invoice_no_seq', max_n, true);
  END IF;
END
$$;

-- 3) Replace the invoice-creation function so invoice_no is generated BEFORE INSERT.
CREATE OR REPLACE FUNCTION sal.create_ar_invoice_from_delivery_no(p_delivery_no text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_delivery sal.delivery%ROWTYPE;
  v_invoice_no text;
  v_invoice_date date;
  v_transaction_date date;
  v_due_date date;
  v_ar_invoice_id uuid;
BEGIN
  -- load delivery
  SELECT * INTO v_delivery FROM sal.delivery WHERE delivery_no = p_delivery_no;

  IF v_delivery.delivery_id IS NULL THEN
    RAISE EXCEPTION 'Delivery % not found.', p_delivery_no;
  END IF;

  IF COALESCE(v_delivery.is_posted, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Delivery % must be posted before creating an AR invoice.', p_delivery_no;
  END IF;

  IF EXISTS (
    SELECT 1 FROM sal.ar_invoice ai
     WHERE ai.delivery_id = v_delivery.delivery_id
       AND COALESCE(ai.status, 'OPEN') <> 'VOID'
  ) THEN
    RAISE EXCEPTION 'AR invoice already exists for delivery %.', p_delivery_no;
  END IF;

  -- business date logic preserved from Phase 8
  v_transaction_date := COALESCE(v_delivery.transaction_date, v_delivery.delivery_date, CURRENT_DATE);
  v_invoice_date := COALESCE(v_delivery.delivery_date, v_transaction_date, CURRENT_DATE);
  v_due_date := v_invoice_date + 30;

  -- Generate invoice_no BEFORE inserting to satisfy NOT NULL constraint.
  -- Use the existing ERP format: 'ARI-YYYYMMDD-NNNNNN'. The sequence stores only the
  -- numeric suffix and nextval() produces the next suffix safely in concurrent workloads.
  v_invoice_no := 'ARI-' || to_char(v_invoice_date, 'YYYYMMDD') || '-' || lpad(nextval('sal.ar_invoice_no_seq')::text, 6, '0');

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
    v_invoice_no,
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

  RETURN v_invoice_no;
END;
$$;

-- End of migration
