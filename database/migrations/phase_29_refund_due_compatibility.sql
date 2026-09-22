-- Phase 29: Keep legacy refund_due writers compatible with the newer settlement field.
CREATE OR REPLACE FUNCTION sal.sync_customer_return_refund_due_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.refund_due_amount=0
     AND NEW.refund_due>0
     AND OLD.refund_due_amount=0 THEN
    NEW.refund_due_amount:=NEW.refund_due;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_customer_return_refund_due_amount ON sal.customer_return;
CREATE TRIGGER trg_sync_customer_return_refund_due_amount
BEFORE UPDATE OF refund_due,refund_due_amount ON sal.customer_return
FOR EACH ROW
EXECUTE FUNCTION sal.sync_customer_return_refund_due_amount();

UPDATE sal.customer_return
SET refund_due_amount=refund_due
WHERE refund_due_amount=0 AND refund_due>0;
