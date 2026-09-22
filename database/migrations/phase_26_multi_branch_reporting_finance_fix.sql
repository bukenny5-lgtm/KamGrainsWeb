-- Phase 26: expose authoritative source branch on the unified sales-event view.
-- Existing eight columns remain in order; branch_id is appended for consumers.
CREATE OR REPLACE VIEW reporting.v_sales_event_lines AS
WITH delivery_cogs AS (
  SELECT d.delivery_id, sml.product_id,
         SUM(sml.qty * COALESCE(sml.unit_cost, 0)) AS cogs
  FROM sal.delivery d
  JOIN inv.stock_movement_line sml ON sml.movement_id = d.posted_movement_id
  GROUP BY d.delivery_id, sml.product_id
), pos_cogs AS (
  SELECT ps.pos_sale_id, sml.product_id,
         SUM(sml.qty * COALESCE(sml.unit_cost, 0)) AS cogs
  FROM sal.pos_sale ps
  JOIN inv.stock_movement_line sml ON sml.movement_id = ps.posted_movement_id
  WHERE ps.status = 'POSTED'
  GROUP BY ps.pos_sale_id, sml.product_id
)
SELECT 'DELIVERY'::text AS source,
       d.delivery_id AS event_id,
       d.transaction_date::date AS event_date,
       d.customer_id,
       dl.product_id,
       COALESCE(dl.sell_qty, dl.qty, 0) AS qty,
       COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0) AS revenue,
       COALESCE(dc.cogs, 0) AS cogs,
       loc.branch_id
FROM sal.delivery d
JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
JOIN app.location loc ON loc.location_id = d.location_id
LEFT JOIN delivery_cogs dc ON dc.delivery_id = d.delivery_id AND dc.product_id = dl.product_id
UNION ALL
SELECT 'POS'::text,
       ps.pos_sale_id,
       ps.transaction_date::date,
       ps.customer_id,
       psl.product_id,
       psl.qty,
       psl.line_total,
       COALESCE(pc.cogs, 0),
       loc.branch_id
FROM sal.pos_sale ps
JOIN sal.pos_sale_line psl ON psl.pos_sale_id = ps.pos_sale_id
JOIN app.location loc ON loc.location_id = ps.location_id
LEFT JOIN pos_cogs pc ON pc.pos_sale_id = ps.pos_sale_id AND pc.product_id = psl.product_id
WHERE ps.status = 'POSTED'
UNION ALL
SELECT 'RETURN'::text,
       crl.customer_return_line_id,
       cr.transaction_date::date,
       cr.customer_id,
       crl.product_id,
       -crl.qty_returned,
       -(crl.qty_returned * crl.original_unit_price),
       -(crl.qty_returned * crl.original_unit_cost),
       loc.branch_id
FROM sal.customer_return cr
JOIN sal.customer_return_line crl ON crl.customer_return_id = cr.customer_return_id
JOIN app.location loc ON loc.location_id = cr.location_id
WHERE cr.status = 'POSTED';

-- Ensure POS posting and reversal journals carry the branch of their sale location.
CREATE OR REPLACE FUNCTION sal.assign_pos_journal_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_branch_id uuid;
BEGIN
  SELECT branch_id INTO v_branch_id
  FROM app.location
  WHERE location_id=NEW.location_id;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'POS sale location must belong to a branch.';
  END IF;
  IF NEW.posted_journal_id IS NOT NULL THEN
    UPDATE fin.gl_journal SET branch_id=v_branch_id
    WHERE journal_id=NEW.posted_journal_id AND branch_id IS DISTINCT FROM v_branch_id;
  END IF;
  IF NEW.reversal_journal_id IS NOT NULL THEN
    UPDATE fin.gl_journal SET branch_id=v_branch_id
    WHERE journal_id=NEW.reversal_journal_id AND branch_id IS DISTINCT FROM v_branch_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_pos_journal_branch ON sal.pos_sale;
CREATE TRIGGER trg_assign_pos_journal_branch
AFTER INSERT OR UPDATE OF location_id,posted_journal_id,reversal_journal_id ON sal.pos_sale
FOR EACH ROW
WHEN (NEW.posted_journal_id IS NOT NULL OR NEW.reversal_journal_id IS NOT NULL)
EXECUTE FUNCTION sal.assign_pos_journal_branch();

UPDATE fin.gl_journal gj
SET branch_id=loc.branch_id
FROM sal.pos_sale ps
JOIN app.location loc ON loc.location_id=ps.location_id
WHERE gj.journal_id IN (ps.posted_journal_id,ps.reversal_journal_id)
  AND gj.branch_id IS DISTINCT FROM loc.branch_id;
