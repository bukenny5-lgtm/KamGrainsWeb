-- Phase 8H: persisted-source financial attribution and reusable reporting.
-- Forward-only. Debit/credit lines and posted accounting are not rewritten.

CREATE OR REPLACE FUNCTION fin.resolve_till_cash_journal_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  IF NEW.source_module = 'TILL_CASH' AND NEW.source_id IS NOT NULL AND NEW.branch_id IS NULL THEN
    SELECT COALESCE(m.branch_id, s.branch_id)
      INTO v_branch_id
    FROM app.till_cash_movement m
    LEFT JOIN app.cashier_session s ON s.session_id = m.session_id
    WHERE m.movement_id = NEW.source_id;
    IF v_branch_id IS NOT NULL THEN NEW.branch_id := v_branch_id; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_resolve_till_cash_journal_branch ON fin.gl_journal;
CREATE TRIGGER trg_resolve_till_cash_journal_branch
BEFORE INSERT OR UPDATE OF source_module, source_id, branch_id ON fin.gl_journal
FOR EACH ROW EXECUTE FUNCTION fin.resolve_till_cash_journal_branch();

UPDATE fin.gl_journal j
SET branch_id = COALESCE(m.branch_id, s.branch_id)
FROM app.till_cash_movement m
LEFT JOIN app.cashier_session s ON s.session_id = m.session_id
WHERE j.source_module = 'TILL_CASH'
  AND j.source_id = m.movement_id
  AND j.branch_id IS NULL
  AND COALESCE(m.branch_id, s.branch_id) IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_till_cash_movement_reporting
  ON app.till_cash_movement(branch_id, location_id, till_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS ix_cashier_session_reporting
  ON app.cashier_session(company_id, branch_id, location_id, till_id, opened_at);

COMMENT ON FUNCTION fin.resolve_till_cash_journal_branch() IS
  'TILL_CASH journals inherit branch from the persisted movement/session, never volatile request/UI context.';
