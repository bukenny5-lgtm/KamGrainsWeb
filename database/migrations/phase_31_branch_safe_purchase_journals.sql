-- Phase 31: Attribute PUR journals to the originating development branch.
CREATE OR REPLACE FUNCTION fin.assign_purchase_source_journal_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  IF NEW.source_module='PUR' AND NEW.source_id IS NOT NULL THEN
    SELECT loc.branch_id INTO v_branch_id
    FROM pur.goods_receipt gr
    JOIN app.location loc ON loc.location_id=gr.location_id
    WHERE gr.grn_id=NEW.source_id;
    IF v_branch_id IS NULL THEN
      SELECT loc.branch_id INTO v_branch_id
      FROM pur.ap_invoice ai
      JOIN pur.goods_receipt gr ON gr.grn_id=ai.grn_id
      JOIN app.location loc ON loc.location_id=gr.location_id
      WHERE ai.ap_invoice_id=NEW.source_id;
    END IF;
    IF v_branch_id IS NULL THEN
      SELECT COALESCE(ap.branch_id,loc.branch_id) INTO v_branch_id
      FROM pur.ap_payment ap
      LEFT JOIN pur.ap_payment_apply apa ON apa.ap_payment_id=ap.ap_payment_id
      LEFT JOIN pur.ap_invoice ai ON ai.ap_invoice_id=apa.ap_invoice_id
      LEFT JOIN pur.goods_receipt gr ON gr.grn_id=ai.grn_id
      LEFT JOIN app.location loc ON loc.location_id=gr.location_id
      WHERE ap.ap_payment_id=NEW.source_id
      LIMIT 1;
    END IF;
    IF v_branch_id IS NOT NULL THEN NEW.branch_id:=v_branch_id; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_purchase_source_journal_branch ON fin.gl_journal;
CREATE TRIGGER trg_assign_purchase_source_journal_branch
BEFORE INSERT OR UPDATE OF source_module,source_id,branch_id ON fin.gl_journal
FOR EACH ROW
WHEN (NEW.source_module='PUR' AND NEW.source_id IS NOT NULL)
EXECUTE FUNCTION fin.assign_purchase_source_journal_branch();

UPDATE fin.gl_journal gj
SET branch_id=src.branch_id
FROM (
  SELECT gj0.journal_id,COALESCE(grloc.branch_id,ailoc.branch_id,aploc.branch_id) AS branch_id
  FROM fin.gl_journal gj0
  LEFT JOIN pur.goods_receipt gr ON gr.grn_id=gj0.source_id AND gj0.source_module='PUR'
  LEFT JOIN app.location grloc ON grloc.location_id=gr.location_id
  LEFT JOIN pur.ap_invoice ai ON ai.ap_invoice_id=gj0.source_id AND gj0.source_module='PUR'
  LEFT JOIN pur.goods_receipt agr ON agr.grn_id=ai.grn_id
  LEFT JOIN app.location ailoc ON ailoc.location_id=agr.location_id
  LEFT JOIN pur.ap_payment ap ON ap.ap_payment_id=gj0.source_id AND gj0.source_module='PUR'
  LEFT JOIN pur.ap_payment_apply apa ON apa.ap_payment_id=ap.ap_payment_id
  LEFT JOIN pur.ap_invoice api ON api.ap_invoice_id=apa.ap_invoice_id
  LEFT JOIN pur.goods_receipt apgr ON apgr.grn_id=api.grn_id
  LEFT JOIN app.location aploc ON aploc.location_id=apgr.location_id
  WHERE gj0.source_module='PUR' AND gj0.branch_id IS NULL
) src
WHERE gj.journal_id=src.journal_id AND src.branch_id IS NOT NULL;
