-- Phase 55: company-wide customer identities with branch visibility.
ALTER TABLE audit.event DROP CONSTRAINT IF EXISTS event_action_check;
ALTER TABLE audit.event ADD CONSTRAINT event_action_check CHECK (
  action IN ('I','U','D','USER_CREATED','USER_ROLE_ASSIGNED','USER_BRANCH_GRANTED','USER_BRANCH_REVOKED','USER_DEFAULT_BRANCH_CHANGED','LOCATION_ACCESS_GRANTED','LOCATION_ACCESS_REVOKED','USER_DEFAULT_LOCATION_CHANGED','LOCATION_UPDATED','CUSTOMER_BRANCH_GRANTED','CUSTOMER_BRANCH_REVOKED')
  OR (table_name='business.event' AND action ~ '^[A-Z][A-Z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS sal.customer_branch (
  customer_id uuid NOT NULL REFERENCES app.party(party_id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES app.branch(branch_id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES sec.app_user(user_id),
  PRIMARY KEY (customer_id, branch_id)
);

CREATE INDEX IF NOT EXISTS ix_customer_branch_branch_active
  ON sal.customer_branch(branch_id, is_active, customer_id);

-- Backfill only from documents whose branch is persisted or safely derivable.
INSERT INTO sal.customer_branch(customer_id, branch_id)
SELECT DISTINCT so.customer_id, so.branch_id
FROM sal.sales_order so JOIN app.party p ON p.party_id=so.customer_id
WHERE so.customer_id IS NOT NULL AND p.party_type IN ('CUSTOMER','BOTH')
ON CONFLICT (customer_id, branch_id) DO NOTHING;

INSERT INTO sal.customer_branch(customer_id, branch_id)
SELECT DISTINCT ps.customer_id, l.branch_id
FROM sal.pos_sale ps JOIN app.location l ON l.location_id=ps.location_id
JOIN app.party p ON p.party_id=ps.customer_id
WHERE ps.customer_id IS NOT NULL AND p.party_type IN ('CUSTOMER','BOTH')
ON CONFLICT (customer_id, branch_id) DO NOTHING;

INSERT INTO sal.customer_branch(customer_id, branch_id)
SELECT DISTINCT d.customer_id, l.branch_id
FROM sal.delivery d JOIN app.location l ON l.location_id=d.location_id
JOIN app.party p ON p.party_id=d.customer_id
WHERE d.customer_id IS NOT NULL AND p.party_type IN ('CUSTOMER','BOTH')
ON CONFLICT (customer_id, branch_id) DO NOTHING;

INSERT INTO sal.customer_branch(customer_id, branch_id)
SELECT DISTINCT ai.customer_id, l.branch_id
FROM sal.ar_invoice ai JOIN sal.delivery d ON d.delivery_id=ai.delivery_id
JOIN app.location l ON l.location_id=d.location_id
JOIN app.party p ON p.party_id=ai.customer_id
WHERE ai.customer_id IS NOT NULL AND p.party_type IN ('CUSTOMER','BOTH')
ON CONFLICT (customer_id, branch_id) DO NOTHING;

-- Walk-in remains available at every active branch without duplicating identity.
INSERT INTO sal.customer_branch(customer_id, branch_id)
SELECT p.party_id, b.branch_id
FROM app.party p CROSS JOIN app.branch b
WHERE p.party_type IN ('CUSTOMER','BOTH')
  AND lower(p.party_name) LIKE 'walk-in%'
  AND b.is_active
ON CONFLICT (customer_id, branch_id) DO NOTHING;
