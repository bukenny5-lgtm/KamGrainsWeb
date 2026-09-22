-- Phase 33: allow locally created purchase orders to wait for branch approval.
ALTER TABLE pur.purchase_order DROP CONSTRAINT IF EXISTS purchase_order_status_check;
ALTER TABLE pur.purchase_order ADD CONSTRAINT purchase_order_status_check
  CHECK(status IN ('OPEN','PENDING_APPROVAL','RECEIVED','INVOICED','CLOSED','CANCELLED'));
