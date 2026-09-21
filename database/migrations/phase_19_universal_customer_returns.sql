-- PHASE 19: UNIVERSAL CUSTOMER RETURNS
-- Forward-only foundation for delivery/AR and POS return workflows.

CREATE SEQUENCE IF NOT EXISTS sal.customer_return_no_seq;

CREATE TABLE IF NOT EXISTS sal.customer_return (
    customer_return_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_no text NOT NULL UNIQUE,
    transaction_date date NOT NULL DEFAULT current_date,
    return_ts timestamptz NOT NULL DEFAULT now(),
    customer_id uuid NULL REFERENCES app.party(party_id),
    source_type text NOT NULL CHECK (source_type IN ('POS', 'DELIVERY')),
    source_id uuid NOT NULL,
    source_document_no text NOT NULL,
    location_id uuid NOT NULL REFERENCES app.location(location_id),
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
    reason_code text NOT NULL,
    notes text NULL,
    refund_method text NULL,
    refund_status text NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK (refund_status IN ('NOT_APPLICABLE', 'REFUND_DUE', 'REFUNDED', 'CREDIT_DUE')),
    refund_due numeric(18,2) NOT NULL DEFAULT 0 CHECK (refund_due >= 0),
    posted_movement_id uuid NULL REFERENCES inv.stock_movement(movement_id),
    posted_journal_id uuid NULL REFERENCES fin.gl_journal(journal_id),
    created_by uuid NULL REFERENCES sec.app_user(user_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    posted_by uuid NULL REFERENCES sec.app_user(user_id),
    posted_at timestamptz NULL,
    voided_by uuid NULL REFERENCES sec.app_user(user_id),
    voided_at timestamptz NULL,
    void_reason text NULL
);

CREATE TABLE IF NOT EXISTS sal.customer_return_line (
    customer_return_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_return_id uuid NOT NULL REFERENCES sal.customer_return(customer_return_id) ON DELETE CASCADE,
    source_line_id uuid NOT NULL,
    product_id uuid NOT NULL REFERENCES inv.product(product_id),
    lot_id uuid NULL REFERENCES inv.lot(lot_id),
    qty_returned numeric(18,3) NOT NULL CHECK (qty_returned > 0),
    original_sale_qty numeric(18,3) NOT NULL CHECK (original_sale_qty > 0),
    original_unit_price numeric(18,2) NOT NULL CHECK (original_unit_price >= 0),
    original_unit_cost numeric(18,4) NOT NULL DEFAULT 0 CHECK (original_unit_cost >= 0),
    return_disposition text NOT NULL DEFAULT 'RESTOCK' CHECK (return_disposition IN ('RESTOCK', 'DAMAGED')),
    reason text NULL
);

CREATE INDEX IF NOT EXISTS ix_customer_return_source ON sal.customer_return(source_type, source_id);
CREATE INDEX IF NOT EXISTS ix_customer_return_line_source ON sal.customer_return_line(source_line_id);

INSERT INTO inv.adjustment_reason(reason_code, reason_name)
VALUES ('CUSTOMER_RETURN', 'Customer return')
ON CONFLICT (reason_code) DO UPDATE SET reason_name = EXCLUDED.reason_name;

CREATE OR REPLACE VIEW reporting.v_sales_event_lines AS
WITH delivery_cogs AS (
    SELECT d.delivery_id, sml.product_id, SUM(sml.qty * COALESCE(sml.unit_cost, 0)) AS cogs
    FROM sal.delivery d JOIN inv.stock_movement_line sml ON sml.movement_id = d.posted_movement_id
    GROUP BY d.delivery_id, sml.product_id
), pos_cogs AS (
    SELECT ps.pos_sale_id, sml.product_id, SUM(sml.qty * COALESCE(sml.unit_cost, 0)) AS cogs
    FROM sal.pos_sale ps JOIN inv.stock_movement_line sml ON sml.movement_id = ps.posted_movement_id
    WHERE ps.status = 'POSTED' GROUP BY ps.pos_sale_id, sml.product_id
)
SELECT 'DELIVERY'::text AS source, d.delivery_id AS event_id, d.transaction_date::date AS event_date,
       d.customer_id, dl.product_id, COALESCE(dl.sell_qty, dl.qty, 0) AS qty,
       COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0) AS revenue, COALESCE(dc.cogs, 0) AS cogs
FROM sal.delivery d JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
LEFT JOIN delivery_cogs dc ON dc.delivery_id = d.delivery_id AND dc.product_id = dl.product_id
UNION ALL
SELECT 'POS'::text, ps.pos_sale_id, ps.transaction_date, ps.customer_id, psl.product_id, psl.qty,
       psl.line_total, COALESCE(pc.cogs, 0)
FROM sal.pos_sale ps JOIN sal.pos_sale_line psl ON psl.pos_sale_id = ps.pos_sale_id
LEFT JOIN pos_cogs pc ON pc.pos_sale_id = ps.pos_sale_id AND pc.product_id = psl.product_id
WHERE ps.status = 'POSTED'
UNION ALL
SELECT 'RETURN'::text, crl.customer_return_line_id, cr.transaction_date, cr.customer_id,
       crl.product_id, -crl.qty_returned, -(crl.qty_returned * crl.original_unit_price),
       -(crl.qty_returned * crl.original_unit_cost)
FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id = cr.customer_return_id
WHERE cr.status = 'POSTED';

CREATE OR REPLACE FUNCTION sal.next_customer_return_no()
RETURNS text LANGUAGE plpgsql AS $function$
BEGIN
    RETURN 'RET-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('sal.customer_return_no_seq')::text, 6, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION sal.block_direct_pos_ar_void()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
    v_sale_no text;
BEGIN
    IF NEW.status = 'VOID' AND COALESCE(OLD.status, '') <> 'VOID' THEN
        SELECT ps.sale_no INTO v_sale_no
        FROM sal.pos_sale ps
        WHERE ps.credit_ar_invoice_id = NEW.ar_invoice_id;
        IF v_sale_no IS NOT NULL THEN
            RAISE EXCEPTION 'This receivable was created from POS sale %. Void the originating POS sale or use Customer Returns.', v_sale_no;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_direct_pos_ar_void ON sal.ar_invoice;
CREATE TRIGGER trg_block_direct_pos_ar_void
BEFORE UPDATE OF status ON sal.ar_invoice
FOR EACH ROW EXECUTE FUNCTION sal.block_direct_pos_ar_void();

CREATE OR REPLACE FUNCTION sal.post_customer_return(p_customer_return_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $function$
DECLARE
    v_return sal.customer_return%ROWTYPE;
    v_line record;
    v_source_line record;
    v_movement_id uuid;
    v_journal_id uuid;
    v_sales_account uuid;
    v_inventory_account uuid;
    v_cogs_account uuid;
    v_ar_account uuid;
    v_damage_account uuid;
    v_return_value numeric(18,2) := 0;
    v_cogs numeric(18,2) := 0;
    v_returned numeric(18,3);
    v_source_movement_id uuid;
    v_source_customer uuid;
    v_source_location uuid;
    v_source_status text;
BEGIN
    SELECT * INTO v_return FROM sal.customer_return WHERE customer_return_id = p_customer_return_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer return not found: %', p_customer_return_id; END IF;
    IF v_return.status = 'POSTED' THEN RETURN v_return.customer_return_id; END IF;
    IF v_return.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT customer returns can be posted.'; END IF;

    IF v_return.source_type = 'POS' THEN
        SELECT ps.customer_id, ps.location_id, ps.status, ps.posted_movement_id
        INTO v_source_customer, v_source_location, v_source_status, v_source_movement_id
        FROM sal.pos_sale ps WHERE ps.pos_sale_id = v_return.source_id FOR SHARE;
    ELSE
        SELECT d.customer_id, d.location_id, d.status, d.posted_movement_id
        INTO v_source_customer, v_source_location, v_source_status, v_source_movement_id
        FROM sal.delivery d WHERE d.delivery_id = v_return.source_id FOR SHARE;
    END IF;
    IF v_source_status IS NULL THEN RAISE EXCEPTION 'Return source was not found.'; END IF;
    IF v_source_status IN ('VOID', 'CANCELLED') THEN RAISE EXCEPTION 'A VOID/CANCELLED source cannot be returned.'; END IF;
    IF v_source_movement_id IS NULL THEN RAISE EXCEPTION 'Return source has no posted stock movement.'; END IF;

    IF v_return.customer_id IS NULL THEN v_return.customer_id := v_source_customer; END IF;
    IF v_return.location_id IS NULL THEN v_return.location_id := v_source_location; END IF;

    FOR v_line IN SELECT * FROM sal.customer_return_line WHERE customer_return_id = v_return.customer_return_id FOR UPDATE LOOP
        IF v_return.source_type = 'POS' THEN
            SELECT l.pos_sale_line_id AS source_line_id, l.product_id, l.lot_id, l.qty AS sold_qty,
                   l.unit_price, sml.unit_cost
            INTO v_source_line
            FROM sal.pos_sale_line l
            JOIN inv.stock_movement_line sml ON sml.movement_id = v_source_movement_id
                AND sml.product_id = l.product_id AND sml.lot_id IS NOT DISTINCT FROM l.lot_id
            WHERE l.pos_sale_line_id = v_line.source_line_id;
        ELSE
            SELECT l.delivery_line_id AS source_line_id, l.product_id, l.lot_id,
                   COALESCE(l.sell_qty, l.qty) AS sold_qty, l.unit_price, sml.unit_cost
            INTO v_source_line
            FROM sal.delivery_line l
            JOIN inv.stock_movement_line sml ON sml.movement_id = v_source_movement_id
                AND sml.product_id = l.product_id AND sml.lot_id IS NOT DISTINCT FROM l.lot_id
            WHERE l.delivery_line_id = v_line.source_line_id;
        END IF;
        IF NOT FOUND THEN RAISE EXCEPTION 'Source line % was not found on the posted movement.', v_line.source_line_id; END IF;
        IF v_line.qty_returned > v_source_line.sold_qty THEN RAISE EXCEPTION 'Return quantity exceeds sold quantity.'; END IF;

        SELECT COALESCE(SUM(crl.qty_returned), 0) INTO v_returned
        FROM sal.customer_return cr JOIN sal.customer_return_line crl ON crl.customer_return_id = cr.customer_return_id
        WHERE cr.status = 'POSTED' AND cr.source_type = v_return.source_type
          AND cr.source_id = v_return.source_id AND crl.source_line_id = v_line.source_line_id;
        IF v_returned + v_line.qty_returned > v_source_line.sold_qty THEN
            RAISE EXCEPTION 'Return quantity exceeds remaining returnable quantity.';
        END IF;

        UPDATE sal.customer_return_line
        SET product_id = v_source_line.product_id, lot_id = v_source_line.lot_id,
            original_sale_qty = v_source_line.sold_qty, original_unit_price = v_source_line.unit_price,
            original_unit_cost = COALESCE(v_source_line.unit_cost, 0)
        WHERE customer_return_line_id = v_line.customer_return_line_id;
        v_return_value := v_return_value + round(v_line.qty_returned * v_source_line.unit_price, 2);
        v_cogs := v_cogs + round(v_line.qty_returned * COALESCE(v_source_line.unit_cost, 0), 2);
    END LOOP;

    IF v_return_value <= 0 THEN RAISE EXCEPTION 'Customer return must contain at least one valued line.'; END IF;

    INSERT INTO inv.stock_movement(movement_type, document_no, party_id, from_location_id, to_location_id, notes, created_by, reason_code)
    VALUES ('CUSTOMER_RETURN', v_return.return_no, v_return.customer_id,
            NULL, v_return.location_id, 'Customer return ' || v_return.return_no, sec.current_user_id(), 'CUSTOMER_RETURN')
    RETURNING movement_id INTO v_movement_id;

    FOR v_line IN SELECT * FROM sal.customer_return_line WHERE customer_return_id = v_return.customer_return_id LOOP
        IF v_line.return_disposition = 'RESTOCK' THEN
            INSERT INTO inv.stock_movement_line(movement_id, product_id, lot_id, qty, unit_cost, to_location_id)
            VALUES (v_movement_id, v_line.product_id, v_line.lot_id, v_line.qty_returned, v_line.original_unit_cost, v_return.location_id);
        ELSE
            INSERT INTO inv.stock_movement_line(movement_id, product_id, lot_id, qty, unit_cost, to_location_id)
            VALUES (v_movement_id, v_line.product_id, v_line.lot_id, v_line.qty_returned, v_line.original_unit_cost, NULL);
        END IF;
    END LOOP;

    v_sales_account := fin.get_account_id('SALES_REVENUE');
    v_inventory_account := fin.get_account_id('INVENTORY');
    v_cogs_account := fin.get_account_id('COGS');
    v_journal_id := fin.create_journal('RET', v_return.transaction_date, 'Customer return ' || v_return.return_no, 'SAL', v_return.customer_return_id);
    PERFORM fin.add_journal_line(v_journal_id, v_sales_account, NULL, 'Sales return ' || v_return.return_no, v_return_value, 0);
    IF v_return.source_type = 'POS' THEN
        SELECT ps.payment_method INTO v_source_status FROM sal.pos_sale ps WHERE ps.pos_sale_id = v_return.source_id;
    END IF;
    IF v_return.source_type = 'POS' AND v_source_status = 'CREDIT' THEN
        v_ar_account := fin.get_account_id('AR_CONTROL');
        PERFORM fin.add_journal_line(v_journal_id, v_ar_account, v_return.customer_id, 'Credit return ' || v_return.return_no, 0, v_return_value);
        UPDATE sal.ar_invoice ai SET status = CASE WHEN ai.status = 'PAID' THEN 'PAID' ELSE ai.status END
        WHERE ai.invoice_no = v_return.source_document_no;
        UPDATE sal.customer_return SET refund_status = 'CREDIT_DUE' WHERE customer_return_id = v_return.customer_return_id;
    ELSE
        v_damage_account := fin.get_account_id('SALES_REVENUE');
        PERFORM fin.add_journal_line(v_journal_id, v_damage_account, v_return.customer_id, 'Refund due ' || v_return.return_no, 0, v_return_value);
        UPDATE sal.customer_return SET refund_status = 'REFUND_DUE', refund_due = v_return_value WHERE customer_return_id = v_return.customer_return_id;
    END IF;
    PERFORM fin.add_journal_line(v_journal_id, v_inventory_account, NULL, 'Return inventory ' || v_return.return_no, v_cogs, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_cogs_account, NULL, 'Reverse returned COGS ' || v_return.return_no, 0, v_cogs);
    PERFORM fin.assert_balanced(v_journal_id);

    UPDATE sal.customer_return SET customer_id = v_return.customer_id, location_id = v_return.location_id,
        posted_movement_id = v_movement_id, posted_journal_id = v_journal_id, status = 'POSTED',
        posted_by = sec.current_user_id(), posted_at = now() WHERE customer_return_id = v_return.customer_return_id;
    RETURN v_return.customer_return_id;
END;
$function$;
