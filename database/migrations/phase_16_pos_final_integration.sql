-- PHASE 4 FINAL POS INTEGRATION
-- Additive migration: POS credit uses the existing AR open-item/payment engine.

ALTER TABLE app.company_profile
  ADD COLUMN IF NOT EXISTS pos_pricing_mode text NOT NULL DEFAULT 'FIXED';

ALTER TABLE app.company_profile
  DROP CONSTRAINT IF EXISTS company_profile_pos_pricing_mode_check;
ALTER TABLE app.company_profile
  ADD CONSTRAINT company_profile_pos_pricing_mode_check
  CHECK (pos_pricing_mode IN ('FIXED', 'MANUAL', 'HYBRID'));

ALTER TABLE sal.pos_sale
  DROP CONSTRAINT IF EXISTS pos_sale_payment_method_check;
ALTER TABLE sal.pos_sale
  ADD CONSTRAINT pos_sale_payment_method_check
  CHECK (payment_method IN ('CASH', 'MOBILE_MONEY', 'CARD', 'BANK', 'BANK_TRANSFER', 'CREDIT'));

ALTER TABLE sal.pos_sale
  ADD COLUMN IF NOT EXISTS due_date date NULL,
  ADD COLUMN IF NOT EXISTS credit_ar_invoice_id uuid NULL REFERENCES sal.ar_invoice(ar_invoice_id);

ALTER TABLE sal.pos_sale_line
  ADD COLUMN IF NOT EXISTS reference_price numeric(18,2) NULL CHECK (reference_price IS NULL OR reference_price >= 0),
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'CONFIGURED',
  ADD COLUMN IF NOT EXISTS price_override_reason text NULL;

ALTER TABLE sal.pos_sale_line
  DROP CONSTRAINT IF EXISTS pos_sale_line_price_source_check;
ALTER TABLE sal.pos_sale_line
  ADD CONSTRAINT pos_sale_line_price_source_check
  CHECK (price_source IN ('CONFIGURED', 'MANUAL', 'OVERRIDE'));

CREATE TABLE IF NOT EXISTS inv.product_barcode (
  barcode_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES inv.product(product_id),
  barcode text NOT NULL,
  uom_code text NULL,
  qty_per_scan numeric(18,3) NOT NULL DEFAULT 1 CHECK (qty_per_scan > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_barcode_value
  ON inv.product_barcode(barcode);
CREATE INDEX IF NOT EXISTS ix_product_barcode_product
  ON inv.product_barcode(product_id) WHERE is_active = true;

INSERT INTO app.feature(feature_code, feature_name, feature_group, description, default_enabled, is_active)
VALUES ('barcode', 'Barcode Scanning', 'CURRENT', 'Keyboard-wedge barcode lookup and product barcode administration.', false, true)
ON CONFLICT (feature_code) DO UPDATE
SET feature_group = 'CURRENT',
    description = EXCLUDED.description,
    is_active = true;

INSERT INTO fin.posting_setup(setup_key, account_id)
SELECT 'CARD', account_id FROM fin.posting_setup WHERE setup_key = 'BANK'
ON CONFLICT (setup_key) DO NOTHING;

INSERT INTO inv.adjustment_reason(reason_code, reason_name)
VALUES
  ('PHYSICAL_COUNT_CORRECTION', 'Physical count correction'),
  ('DAMAGE', 'Damage'),
  ('EXPIRY', 'Expiry'),
  ('BREAKAGE', 'Breakage'),
  ('SHRINKAGE', 'Shrinkage'),
  ('THEFT_LOSS', 'Theft / loss'),
  ('FOUND_STOCK', 'Found stock'),
  ('DATA_CORRECTION', 'Data correction'),
  ('WRITE_OFF', 'Write-off'),
  ('OTHER', 'Other')
ON CONFLICT (reason_code) DO NOTHING;

CREATE OR REPLACE FUNCTION sal.post_pos_sale(p_pos_sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
    v_sale sal.pos_sale%ROWTYPE;
    v_line record;
    v_movement_id uuid;
    v_journal_id uuid;
    v_tender_account uuid;
    v_sales_account uuid;
    v_inventory_account uuid;
    v_cogs_account uuid;
    v_ar_account uuid;
    v_cogs numeric(18,2) := 0;
    v_line_count integer;
    v_available numeric;
    v_cost numeric;
    v_pricing_mode text;
    v_ar_invoice_id uuid;
BEGIN
    SELECT * INTO v_sale FROM sal.pos_sale WHERE pos_sale_id = p_pos_sale_id FOR UPDATE;
    IF v_sale.pos_sale_id IS NULL THEN RAISE EXCEPTION 'POS sale not found: %', p_pos_sale_id; END IF;
    IF v_sale.status = 'POSTED' THEN RETURN v_sale.pos_sale_id; END IF;
    IF v_sale.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT POS sales can be posted. Current status: %', v_sale.status; END IF;

    SELECT pos_pricing_mode INTO v_pricing_mode FROM app.company_profile WHERE is_active = true ORDER BY created_at, company_id LIMIT 1;
    v_pricing_mode := COALESCE(v_pricing_mode, 'FIXED');
    SELECT COUNT(*) INTO v_line_count FROM sal.pos_sale_line WHERE pos_sale_id = v_sale.pos_sale_id;
    IF v_line_count = 0 THEN RAISE EXCEPTION 'POS sale must contain at least one line.'; END IF;
    SELECT COALESCE(SUM(line_total), 0) INTO v_sale.total_amount FROM sal.pos_sale_line WHERE pos_sale_id = v_sale.pos_sale_id;
    v_sale.subtotal := v_sale.total_amount;
    IF v_sale.payment_method = 'CASH' THEN
      IF v_sale.amount_tendered IS NULL OR v_sale.amount_tendered < v_sale.total_amount THEN RAISE EXCEPTION 'Cash tendered cannot be less than the POS sale total.'; END IF;
      v_sale.change_amount := round(v_sale.amount_tendered - v_sale.total_amount, 2);
    ELSE
      v_sale.amount_tendered := CASE WHEN v_sale.payment_method = 'CREDIT' THEN NULL ELSE v_sale.total_amount END;
      v_sale.change_amount := 0;
    END IF;

    FOR v_line IN SELECT l.*, p.product_name, p.is_active, p.is_saleable, p.is_stock_item, p.track_lots
      FROM sal.pos_sale_line l JOIN inv.product p ON p.product_id = l.product_id WHERE l.pos_sale_id = v_sale.pos_sale_id ORDER BY l.pos_sale_line_id LOOP
      IF NOT v_line.is_active OR NOT v_line.is_saleable THEN RAISE EXCEPTION 'Product % is not active and saleable.', v_line.product_name; END IF;
      IF v_pricing_mode = 'FIXED' AND v_line.price_source <> 'CONFIGURED' THEN RAISE EXCEPTION 'Configured pricing is required for %.', v_line.product_name; END IF;
      IF v_line.price_source IN ('CONFIGURED', 'OVERRIDE') AND v_line.unit_price <> COALESCE((SELECT pp.unit_price FROM sal.pos_product_price pp WHERE pp.product_id = v_line.product_id AND pp.is_active), -1) THEN
        RAISE EXCEPTION 'No matching active POS price for product %.', v_line.product_name;
      END IF;
      IF v_line.is_stock_item THEN
        IF v_line.track_lots AND v_line.lot_id IS NULL THEN RAISE EXCEPTION 'A lot is required for product %.', v_line.product_name; END IF;
        SELECT COALESCE(SUM(CASE WHEN sml.to_location_id = v_sale.location_id THEN sml.qty WHEN sml.from_location_id = v_sale.location_id THEN -sml.qty ELSE 0 END), 0)
          INTO v_available FROM inv.stock_movement_line sml JOIN inv.stock_movement sm ON sm.movement_id = sml.movement_id
          WHERE sml.product_id = v_line.product_id AND sml.lot_id IS NOT DISTINCT FROM v_line.lot_id;
        IF v_available < v_line.qty THEN RAISE EXCEPTION 'Insufficient stock for product %. Available: %, requested: %', v_line.product_name, v_available, v_line.qty; END IF;
        v_cost := inv.get_default_unit_cost(v_line.product_id, v_line.lot_id);
        v_cogs := v_cogs + round(v_line.qty * COALESCE(v_cost, 0), 2);
      END IF;
    END LOOP;

    INSERT INTO inv.stock_movement(movement_type, document_no, party_id, from_location_id, notes, created_by)
      VALUES ('SALE_ISSUE', v_sale.sale_no, v_sale.customer_id, v_sale.location_id, 'POS sale ' || v_sale.sale_no, sec.current_user_id()) RETURNING movement_id INTO v_movement_id;
    FOR v_line IN SELECT l.*, p.is_stock_item FROM sal.pos_sale_line l JOIN inv.product p ON p.product_id = l.product_id WHERE l.pos_sale_id = v_sale.pos_sale_id ORDER BY l.pos_sale_line_id LOOP
      IF v_line.is_stock_item THEN
        INSERT INTO inv.stock_movement_line(movement_id, product_id, lot_id, qty, unit_cost, from_location_id)
          VALUES (v_movement_id, v_line.product_id, v_line.lot_id, v_line.qty, inv.get_default_unit_cost(v_line.product_id, v_line.lot_id), v_sale.location_id);
      END IF;
    END LOOP;

    v_sales_account := fin.get_account_id('SALES_REVENUE');
    v_inventory_account := fin.get_account_id('INVENTORY');
    v_cogs_account := fin.get_account_id('COGS');
    v_journal_id := fin.create_journal('POS', v_sale.transaction_date, 'POS sale ' || v_sale.sale_no, 'SAL', v_sale.pos_sale_id);
    IF v_sale.payment_method = 'CREDIT' THEN
      v_ar_account := fin.get_account_id('AR_CONTROL');
      PERFORM fin.add_journal_line(v_journal_id, v_ar_account, v_sale.customer_id, 'POS credit ' || v_sale.sale_no, v_sale.total_amount, 0);
    ELSE
      v_tender_account := fin.get_account_id(CASE v_sale.payment_method WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY' WHEN 'BANK' THEN 'BANK' WHEN 'BANK_TRANSFER' THEN 'BANK' WHEN 'CARD' THEN 'CARD' ELSE 'CASH' END);
      PERFORM fin.add_journal_line(v_journal_id, v_tender_account, v_sale.customer_id, 'POS tender ' || v_sale.sale_no, v_sale.total_amount, 0);
    END IF;
    PERFORM fin.add_journal_line(v_journal_id, v_sales_account, NULL, 'POS revenue ' || v_sale.sale_no, 0, v_sale.total_amount);
    PERFORM fin.add_journal_line(v_journal_id, v_cogs_account, NULL, 'POS COGS ' || v_sale.sale_no, v_cogs, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_inventory_account, NULL, 'POS inventory ' || v_sale.sale_no, 0, v_cogs);
    PERFORM fin.assert_balanced(v_journal_id);

    IF v_sale.payment_method = 'CREDIT' THEN
      IF v_sale.customer_id IS NULL THEN RAISE EXCEPTION 'Customer is required for CREDIT POS sales.'; END IF;
      INSERT INTO sal.ar_invoice(ar_invoice_id, invoice_no, customer_id, invoice_date, due_date, status, delivery_id, created_at, posted_journal_id, transaction_date)
        VALUES (gen_random_uuid(), v_sale.sale_no, v_sale.customer_id, v_sale.transaction_date, v_sale.due_date, 'OPEN', NULL, now(), v_journal_id, v_sale.transaction_date)
        RETURNING ar_invoice_id INTO v_ar_invoice_id;
      FOR v_line IN SELECT l.*, p.product_name, p.uom_code FROM sal.pos_sale_line l JOIN inv.product p ON p.product_id=l.product_id WHERE l.pos_sale_id=v_sale.pos_sale_id LOOP
        INSERT INTO sal.ar_invoice_line(ar_invoice_line_id, ar_invoice_id, product_id, description, qty, unit_price, sell_qty, sell_uom_code, base_qty)
          VALUES (gen_random_uuid(), v_ar_invoice_id, v_line.product_id, v_line.product_name, v_line.qty, v_line.unit_price, v_line.qty, v_line.uom_code, v_line.qty);
      END LOOP;
    END IF;

    UPDATE sal.pos_sale SET subtotal=v_sale.subtotal,total_amount=v_sale.total_amount,amount_tendered=v_sale.amount_tendered,change_amount=v_sale.change_amount,status='POSTED',posted_at=now(),posted_by=sec.current_user_id(),posted_movement_id=v_movement_id,posted_journal_id=v_journal_id,credit_ar_invoice_id=v_ar_invoice_id WHERE pos_sale_id=v_sale.pos_sale_id;
    RETURN v_sale.pos_sale_id;
END;
$function$;
