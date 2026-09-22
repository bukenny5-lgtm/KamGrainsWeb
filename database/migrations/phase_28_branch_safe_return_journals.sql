-- Phase 28: Attribute customer-return journals to the return's source location.
-- Some legacy SAL journal writers do not populate the branch dimension.
CREATE OR REPLACE FUNCTION fin.assign_customer_return_journal_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  IF NEW.source_module='SAL' AND NEW.source_id IS NOT NULL THEN
    SELECT loc.branch_id INTO v_branch_id
    FROM sal.customer_return cr
    JOIN app.location loc ON loc.location_id=cr.location_id
    WHERE cr.customer_return_id=NEW.source_id;
    IF v_branch_id IS NOT NULL THEN NEW.branch_id:=v_branch_id; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_customer_return_journal_branch ON fin.gl_journal;
CREATE TRIGGER trg_assign_customer_return_journal_branch
BEFORE INSERT OR UPDATE OF source_module,source_id,branch_id ON fin.gl_journal
FOR EACH ROW
WHEN (NEW.source_module='SAL' AND NEW.source_id IS NOT NULL)
EXECUTE FUNCTION fin.assign_customer_return_journal_branch();

UPDATE fin.gl_journal gj
SET branch_id=loc.branch_id
FROM sal.customer_return cr
JOIN app.location loc ON loc.location_id=cr.location_id
WHERE gj.source_module='SAL'
  AND gj.source_id=cr.customer_return_id
  AND gj.branch_id IS NULL;
