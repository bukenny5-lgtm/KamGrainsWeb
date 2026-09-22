-- Phase 27: Attribute inventory adjustment journals to their source location branch.
-- The legacy inventory posting function writes source_module='INV' and the
-- damage_adjustment_id as source_id but predates fin.gl_journal.branch_id.
CREATE OR REPLACE FUNCTION fin.assign_inventory_adjustment_journal_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.source_module='INV' AND NEW.source_id IS NOT NULL THEN
    SELECT COALESCE(from_loc.branch_id,to_loc.branch_id)
      INTO NEW.branch_id
    FROM inv.damage_adjustment da
    LEFT JOIN app.location from_loc ON from_loc.location_id=da.from_location_id
    LEFT JOIN app.location to_loc ON to_loc.location_id=da.to_location_id
    WHERE da.damage_adjustment_id=NEW.source_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_inventory_adjustment_journal_branch ON fin.gl_journal;
CREATE TRIGGER trg_assign_inventory_adjustment_journal_branch
BEFORE INSERT OR UPDATE OF source_module,source_id,branch_id ON fin.gl_journal
FOR EACH ROW
WHEN (NEW.source_module='INV' AND NEW.source_id IS NOT NULL)
EXECUTE FUNCTION fin.assign_inventory_adjustment_journal_branch();

UPDATE fin.gl_journal gj
SET branch_id=COALESCE(from_loc.branch_id,to_loc.branch_id)
FROM inv.damage_adjustment da
LEFT JOIN app.location from_loc ON from_loc.location_id=da.from_location_id
LEFT JOIN app.location to_loc ON to_loc.location_id=da.to_location_id
WHERE gj.source_module='INV'
  AND gj.source_id=da.damage_adjustment_id
  AND gj.branch_id IS NULL
  AND COALESCE(from_loc.branch_id,to_loc.branch_id) IS NOT NULL;
