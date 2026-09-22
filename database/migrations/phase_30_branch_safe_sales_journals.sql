-- Phase 30: Attribute legacy SAL journals from their originating document branch.
CREATE OR REPLACE FUNCTION fin.assign_sales_source_journal_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  IF NEW.source_module='SAL' AND NEW.source_id IS NOT NULL THEN
    SELECT loc.branch_id INTO v_branch_id
    FROM sal.customer_return cr JOIN app.location loc ON loc.location_id=cr.location_id
    WHERE cr.customer_return_id=NEW.source_id;
    IF v_branch_id IS NULL THEN
      SELECT loc.branch_id INTO v_branch_id
      FROM sal.pos_sale ps JOIN app.location loc ON loc.location_id=ps.location_id
      WHERE ps.pos_sale_id=NEW.source_id;
    END IF;
    IF v_branch_id IS NULL THEN
      SELECT loc.branch_id INTO v_branch_id
      FROM sal.delivery d JOIN app.location loc ON loc.location_id=d.location_id
      WHERE d.delivery_id=NEW.source_id;
    END IF;
    IF v_branch_id IS NULL THEN
      SELECT loc.branch_id INTO v_branch_id
      FROM sal.ar_invoice ai
      JOIN sal.delivery d ON d.delivery_id=ai.delivery_id
      JOIN app.location loc ON loc.location_id=d.location_id
      WHERE ai.ar_invoice_id=NEW.source_id;
    END IF;
    IF v_branch_id IS NULL THEN
      SELECT COALESCE(ap.branch_id,loc.branch_id) INTO v_branch_id
      FROM sal.ar_payment ap
      LEFT JOIN sal.ar_payment_apply apa ON apa.ar_payment_id=ap.ar_payment_id
      LEFT JOIN sal.ar_invoice ai ON ai.ar_invoice_id=apa.ar_invoice_id
      LEFT JOIN sal.delivery d ON d.delivery_id=ai.delivery_id
      LEFT JOIN app.location loc ON loc.location_id=d.location_id
      WHERE ap.ar_payment_id=NEW.source_id
      LIMIT 1;
    END IF;
    IF v_branch_id IS NOT NULL THEN NEW.branch_id:=v_branch_id; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_sales_source_journal_branch ON fin.gl_journal;
CREATE TRIGGER trg_assign_sales_source_journal_branch
BEFORE INSERT OR UPDATE OF source_module,source_id,branch_id ON fin.gl_journal
FOR EACH ROW
WHEN (NEW.source_module='SAL' AND NEW.source_id IS NOT NULL)
EXECUTE FUNCTION fin.assign_sales_source_journal_branch();

UPDATE fin.gl_journal gj
SET branch_id=src.branch_id
FROM (
  SELECT DISTINCT ON (gj0.journal_id) gj0.journal_id,COALESCE(crloc.branch_id,psloc.branch_id,dloc.branch_id,ailoc.branch_id,aploc.branch_id) AS branch_id
  FROM fin.gl_journal gj0
  LEFT JOIN sal.customer_return cr ON cr.customer_return_id=gj0.source_id AND gj0.source_module='SAL'
  LEFT JOIN app.location crloc ON crloc.location_id=cr.location_id
  LEFT JOIN sal.pos_sale ps ON ps.pos_sale_id=gj0.source_id AND gj0.source_module='SAL'
  LEFT JOIN app.location psloc ON psloc.location_id=ps.location_id
  LEFT JOIN sal.delivery d ON d.delivery_id=gj0.source_id AND gj0.source_module='SAL'
  LEFT JOIN app.location dloc ON dloc.location_id=d.location_id
  LEFT JOIN sal.ar_invoice ai ON ai.ar_invoice_id=gj0.source_id AND gj0.source_module='SAL'
  LEFT JOIN sal.delivery aid ON aid.delivery_id=ai.delivery_id
  LEFT JOIN app.location ailoc ON ailoc.location_id=aid.location_id
  LEFT JOIN sal.ar_payment ap ON ap.ar_payment_id=gj0.source_id AND gj0.source_module='SAL'
  LEFT JOIN sal.ar_payment_apply apa ON apa.ar_payment_id=ap.ar_payment_id
  LEFT JOIN sal.ar_invoice api ON api.ar_invoice_id=apa.ar_invoice_id
  LEFT JOIN sal.delivery apd ON apd.delivery_id=api.delivery_id
  LEFT JOIN app.location aploc ON aploc.location_id=apd.location_id
  WHERE gj0.source_module='SAL' AND gj0.branch_id IS NULL
  ORDER BY gj0.journal_id
) src
WHERE gj.journal_id=src.journal_id AND src.branch_id IS NOT NULL;
