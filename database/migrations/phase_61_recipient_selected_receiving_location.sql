-- Phase 9E-D: receipt.destination_location_id is the recipient-selected
-- physical receiving location. The API validates that it is active,
-- stock-holding, belongs to the persisted destination branch, and is within
-- the recipient's location access before creating the movement.
COMMENT ON COLUMN inv.stock_transfer_receipt.destination_location_id IS
  'Recipient-selected active stock-holding location within destination_branch_id.';
