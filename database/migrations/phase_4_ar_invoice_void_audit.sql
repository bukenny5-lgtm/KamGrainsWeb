/**
 * PHASE 4: POSTED AR INVOICE VOID / REVERSAL AUDIT
 *
 * Adds a minimal, nullable audit link to sal.ar_invoice so a posted invoice can
 * be voided without destroying its original document or GL journal.
 */

ALTER TABLE sal.ar_invoice
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ NULL;

ALTER TABLE sal.ar_invoice
  ADD COLUMN IF NOT EXISTS voided_by UUID NULL
  REFERENCES sec.app_user(user_id);

ALTER TABLE sal.ar_invoice
  ADD COLUMN IF NOT EXISTS void_reason TEXT NULL;

ALTER TABLE sal.ar_invoice
  ADD COLUMN IF NOT EXISTS reversal_journal_id UUID NULL
  REFERENCES fin.gl_journal(journal_id);

COMMENT ON COLUMN sal.ar_invoice.voided_at IS
  'Timestamp when the posted AR invoice was voided';

COMMENT ON COLUMN sal.ar_invoice.voided_by IS
  'User who voided the posted AR invoice';

COMMENT ON COLUMN sal.ar_invoice.void_reason IS
  'Business reason for the invoice void';

COMMENT ON COLUMN sal.ar_invoice.reversal_journal_id IS
  'Reversal journal created to offset the original posted journal';

CREATE OR REPLACE FUNCTION sal.void_ar_invoice_by_no(
  p_invoice_no text,
  p_void_reason text,
  p_user_id uuid
)
RETURNS TABLE (
  invoice_no text,
  status text,
  reversal_journal_id uuid,
  original_journal_id uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_invoice sal.ar_invoice%ROWTYPE;
  v_original_journal fin.gl_journal%ROWTYPE;
  v_reversal_journal_id uuid;
  v_payment_total numeric := 0;
  v_user_valid boolean;
BEGIN
  IF p_invoice_no IS NULL OR btrim(p_invoice_no) = '' THEN
    RAISE EXCEPTION 'Invoice number is required';
  END IF;

  IF p_void_reason IS NULL OR btrim(p_void_reason) = '' THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM sec.app_user
    WHERE user_id = p_user_id
  )
  INTO v_user_valid;

  IF NOT v_user_valid THEN
    RAISE EXCEPTION 'User % is not a valid application user', p_user_id;
  END IF;

  SELECT ai.*
  INTO v_invoice
  FROM sal.ar_invoice ai
  WHERE ai.invoice_no = p_invoice_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AR invoice % not found', p_invoice_no;
  END IF;

  IF v_invoice.status = 'VOID' THEN
    IF v_invoice.reversal_journal_id IS NOT NULL THEN
      RETURN QUERY
      SELECT
        v_invoice.invoice_no,
        v_invoice.status,
        v_invoice.reversal_journal_id,
        v_invoice.posted_journal_id,
        v_invoice.voided_at,
        v_invoice.voided_by,
        v_invoice.void_reason;
      RETURN;
    END IF;

    RAISE EXCEPTION 'AR invoice % is already VOID and has no recorded reversal journal', p_invoice_no;
  END IF;

  IF v_invoice.posted_journal_id IS NULL THEN
    RAISE EXCEPTION 'AR invoice % is not posted and cannot be voided', p_invoice_no;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_payment_total
  FROM sal.ar_payment_apply
  WHERE ar_invoice_id = v_invoice.ar_invoice_id;

  IF v_payment_total > 0 THEN
    RAISE EXCEPTION 'Invoice % has applied payment(s) and requires the payment/credit-note/refund workflow', p_invoice_no;
  END IF;

  SELECT gj.*
  INTO v_original_journal
  FROM fin.gl_journal gj
  WHERE gj.journal_id = v_invoice.posted_journal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posted journal % for invoice % not found', v_invoice.posted_journal_id, p_invoice_no;
  END IF;

  PERFORM set_config('app.current_user_id', p_user_id::text, true);

  v_reversal_journal_id := fin.create_journal(
    'ARV',
    current_date,
    'Reversal of ' || v_original_journal.journal_no || ' for Invoice ' || v_invoice.invoice_no || ' - ' || p_void_reason,
    'SAL',
    v_invoice.ar_invoice_id
  );

  INSERT INTO fin.gl_journal_line (
    journal_id,
    account_id,
    party_id,
    memo,
    debit,
    credit
  )
  SELECT
    v_reversal_journal_id,
    j.account_id,
    j.party_id,
    COALESCE(j.memo, '') || ' [VOID REVERSAL]',
    j.credit,
    j.debit
  FROM fin.gl_journal_line j
  WHERE j.journal_id = v_invoice.posted_journal_id;

  PERFORM fin.assert_balanced(v_reversal_journal_id);

  INSERT INTO audit.event (
    event_id,
    event_ts,
    user_id,
    action,
    table_name,
    row_pk,
    row_data,
    txid
  )
  VALUES (
    gen_random_uuid(),
    now(),
    p_user_id,
    'U',
    'sal.ar_invoice',
    jsonb_build_object(
      'ar_invoice_id', v_invoice.ar_invoice_id,
      'invoice_no', v_invoice.invoice_no
    ),
    jsonb_build_object(
      'operation', 'VOID_AR_INVOICE',
      'void_reason', p_void_reason,
      'original_journal_id', v_invoice.posted_journal_id,
      'reversal_journal_id', v_reversal_journal_id,
      'original_invoice_total', (
        SELECT COALESCE(SUM(COALESCE(ail.sell_qty, ail.qty, ail.base_qty, 0) * ail.unit_price), 0)
        FROM sal.ar_invoice_line ail
        WHERE ail.ar_invoice_id = v_invoice.ar_invoice_id
      )
    ),
    txid_current()
  );

  UPDATE sal.ar_invoice
  SET
    status = 'VOID',
    voided_at = now(),
    voided_by = p_user_id,
    void_reason = p_void_reason,
    reversal_journal_id = v_reversal_journal_id
  WHERE ar_invoice_id = v_invoice.ar_invoice_id;

  RETURN QUERY
  SELECT
    v_invoice.invoice_no,
    'VOID',
    v_reversal_journal_id,
    v_invoice.posted_journal_id,
    (SELECT ai.voided_at FROM sal.ar_invoice ai WHERE ai.ar_invoice_id = v_invoice.ar_invoice_id),
    p_user_id,
    p_void_reason;
END;
$function$;
