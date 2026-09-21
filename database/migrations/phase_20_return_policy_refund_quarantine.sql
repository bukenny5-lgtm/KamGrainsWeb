-- Phase 20: configurable return policy, quarantine inventory, refund records.
-- Forward-only; apply to development before production review.

CREATE SEQUENCE IF NOT EXISTS sal.refund_no_seq;

CREATE TABLE IF NOT EXISTS sal.return_policy (
    return_policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL UNIQUE REFERENCES app.company_profile(company_id),
    returns_enabled boolean NOT NULL DEFAULT true,
    default_return_window_days integer NOT NULL DEFAULT 30 CHECK (default_return_window_days >= 0),
    proof_of_purchase_required boolean NOT NULL DEFAULT true,
    allow_return_without_receipt boolean NOT NULL DEFAULT false,
    refund_to_original_method boolean NOT NULL DEFAULT true,
    allow_customer_credit boolean NOT NULL DEFAULT true,
    allow_exchange boolean NOT NULL DEFAULT false,
    inspection_required boolean NOT NULL DEFAULT true,
    manager_approval_required boolean NOT NULL DEFAULT true,
    allow_partial_returns boolean NOT NULL DEFAULT true,
    allow_damaged_returns boolean NOT NULL DEFAULT true,
    allow_change_of_mind_returns boolean NOT NULL DEFAULT false,
    restocking_fee_enabled boolean NOT NULL DEFAULT false,
    restocking_fee_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (restocking_fee_percent >= 0 AND restocking_fee_percent <= 100),
    refund_processing_days integer NOT NULL DEFAULT 0 CHECK (refund_processing_days >= 0),
    policy_notes text,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sal.return_policy(company_id)
SELECT company_id FROM app.company_profile WHERE is_active = true
ON CONFLICT (company_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS sal.customer_return_reason (
    reason_code text PRIMARY KEY,
    reason_name text NOT NULL,
    requires_explanation boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true
);

INSERT INTO sal.customer_return_reason(reason_code, reason_name, requires_explanation) VALUES
('DAMAGED','Damaged',false),('DEFECTIVE','Defective',false),('WRONG_ITEM','Wrong item',false),
('QUALITY_ISSUE','Quality issue',false),('CUSTOMER_REJECTION','Customer rejection',false),
('EXCESS_QUANTITY','Excess quantity',false),('EXPIRED','Expired',false),
('NOT_AS_DESCRIBED','Not as described',false),('CHANGE_OF_MIND','Change of mind',false),
('OTHER','Other',true)
ON CONFLICT (reason_code) DO NOTHING;

ALTER TABLE sal.customer_return
    ADD COLUMN IF NOT EXISTS condition_code text NOT NULL DEFAULT 'GOOD',
    ADD COLUMN IF NOT EXISTS policy_override boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS policy_override_reason text,
    ADD COLUMN IF NOT EXISTS inspected_by uuid,
    ADD COLUMN IF NOT EXISTS inspected_at timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by uuid,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS refund_due_amount numeric(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refund_settled_amount numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE sal.customer_return_line DROP CONSTRAINT IF EXISTS customer_return_line_return_disposition_check;
ALTER TABLE sal.customer_return_line
    ADD CONSTRAINT customer_return_line_return_disposition_check
    CHECK (return_disposition IN ('RESTOCK','QUARANTINE','WRITE_OFF'));

ALTER TABLE sal.customer_return
    DROP CONSTRAINT IF EXISTS customer_return_condition_code_check;
ALTER TABLE sal.customer_return
    ADD CONSTRAINT customer_return_condition_code_check
    CHECK (condition_code IN ('GOOD','DAMAGED','DEFECTIVE','EXPIRED','OPENED_USED','OTHER'));

CREATE TABLE IF NOT EXISTS sal.refund_settlement (
    refund_settlement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_no text NOT NULL UNIQUE,
    customer_return_id uuid NOT NULL REFERENCES sal.customer_return(customer_return_id),
    amount numeric(18,2) NOT NULL CHECK (amount > 0),
    refund_method text NOT NULL CHECK (refund_method IN ('CASH','MOBILE_MONEY','CARD','BANK_TRANSFER','CUSTOMER_CREDIT')),
    status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','VOID')),
    reference text,
    notes text,
    journal_id uuid,
    settled_by uuid,
    settled_at timestamptz NOT NULL DEFAULT now(),
    voided_by uuid,
    voided_at timestamptz,
    void_reason text
);

CREATE INDEX IF NOT EXISTS ix_refund_settlement_return ON sal.refund_settlement(customer_return_id);

INSERT INTO app.location(location_id, location_code, location_name, is_active, created_at)
SELECT gen_random_uuid(), 'RETURN_QUARANTINE', 'Return quarantine (non-saleable)', true, now()
WHERE NOT EXISTS (SELECT 1 FROM app.location WHERE location_code = 'RETURN_QUARANTINE');

CREATE OR REPLACE FUNCTION sal.next_refund_no()
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
    RETURN 'RFD-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('sal.refund_no_seq')::text, 6, '0');
END;
$$;

-- Move QUARANTINE/WRITE_OFF lines to the controlled non-saleable location
-- after the existing Phase 19 posting function creates the movement.
CREATE OR REPLACE FUNCTION sal.route_customer_return_non_saleable()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_location uuid;
BEGIN
    IF NEW.status = 'POSTED' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.posted_movement_id IS NOT NULL THEN
        SELECT location_id INTO v_location FROM app.location WHERE location_code = 'RETURN_QUARANTINE' AND is_active = true LIMIT 1;
        IF v_location IS NULL THEN RAISE EXCEPTION 'RETURN_QUARANTINE location is not configured'; END IF;
        UPDATE inv.stock_movement_line sml
        SET to_location_id = v_location
        WHERE sml.movement_id = NEW.posted_movement_id
          AND EXISTS (
              SELECT 1 FROM sal.customer_return_line crl
              WHERE crl.customer_return_id = NEW.customer_return_id
                AND crl.return_disposition IN ('QUARANTINE','WRITE_OFF')
                AND crl.product_id = sml.product_id
                AND COALESCE(crl.lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(sml.lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
          );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_customer_return_non_saleable ON sal.customer_return;
CREATE TRIGGER trg_route_customer_return_non_saleable
AFTER UPDATE OF status ON sal.customer_return
FOR EACH ROW EXECUTE FUNCTION sal.route_customer_return_non_saleable();
