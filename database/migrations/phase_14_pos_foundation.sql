-- PHASE 4 / STEP 2: Minimal online POS foundation.
-- POS is a complementary transaction path. Existing sales/delivery/AR objects
-- and their posting functions are intentionally unchanged.

CREATE SEQUENCE IF NOT EXISTS sal.pos_sale_no_seq;

CREATE TABLE IF NOT EXISTS sal.pos_product_price (
    product_id uuid PRIMARY KEY REFERENCES inv.product(product_id),
    unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES sec.app_user(user_id),
    updated_by uuid REFERENCES sec.app_user(user_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sal.pos_sale (
    pos_sale_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_no text NOT NULL UNIQUE,
    transaction_date date NOT NULL DEFAULT current_date,
    sale_ts timestamptz NOT NULL DEFAULT now(),
    location_id uuid NOT NULL REFERENCES app.location(location_id),
    customer_id uuid NULL REFERENCES app.party(party_id),
    payment_method text NOT NULL CHECK (payment_method IN ('CASH', 'BANK', 'MOBILE_MONEY')),
    amount_tendered numeric(18,2) NULL CHECK (amount_tendered IS NULL OR amount_tendered >= 0),
    change_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
    subtotal numeric(18,2) NOT NULL CHECK (subtotal >= 0),
    total_amount numeric(18,2) NOT NULL CHECK (total_amount >= 0),
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
    posted_at timestamptz NULL,
    posted_by uuid NULL REFERENCES sec.app_user(user_id),
    voided_at timestamptz NULL,
    voided_by uuid NULL REFERENCES sec.app_user(user_id),
    void_reason text NULL,
    idempotency_key text NULL,
    posted_movement_id uuid NULL REFERENCES inv.stock_movement(movement_id),
    posted_journal_id uuid NULL REFERENCES fin.gl_journal(journal_id),
    reversal_movement_id uuid NULL REFERENCES inv.stock_movement(movement_id),
    reversal_journal_id uuid NULL REFERENCES fin.gl_journal(journal_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NULL REFERENCES sec.app_user(user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_sale_idempotency_key
    ON sal.pos_sale(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_pos_sale_transaction_date
    ON sal.pos_sale(transaction_date, status);

CREATE TABLE IF NOT EXISTS sal.pos_sale_line (
    pos_sale_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pos_sale_id uuid NOT NULL REFERENCES sal.pos_sale(pos_sale_id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES inv.product(product_id),
    qty numeric(18,3) NOT NULL CHECK (qty > 0),
    unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
    line_total numeric(18,2) NOT NULL CHECK (line_total >= 0),
    lot_id uuid NULL REFERENCES inv.lot(lot_id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pos_sale_line_product
    ON sal.pos_sale_line(product_id);

CREATE OR REPLACE FUNCTION sal.next_pos_sale_no()
RETURNS text
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN 'POS-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('sal.pos_sale_no_seq')::text, 6, '0');
END;
$function$;

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
    v_cogs numeric(18,2) := 0;
    v_line_count integer;
    v_available numeric;
    v_cost numeric;
BEGIN
    SELECT * INTO v_sale
    FROM sal.pos_sale
    WHERE pos_sale_id = p_pos_sale_id
    FOR UPDATE;

    IF v_sale.pos_sale_id IS NULL THEN
        RAISE EXCEPTION 'POS sale not found: %', p_pos_sale_id;
    END IF;

    IF v_sale.status = 'POSTED' THEN
        RETURN v_sale.pos_sale_id;
    END IF;

    IF v_sale.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Only DRAFT POS sales can be posted. Current status: %', v_sale.status;
    END IF;

    SELECT COUNT(*) INTO v_line_count
    FROM sal.pos_sale_line
    WHERE pos_sale_id = v_sale.pos_sale_id;

    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'POS sale must contain at least one line.';
    END IF;

    SELECT COALESCE(SUM(line_total), 0)
    INTO v_sale.total_amount
    FROM sal.pos_sale_line
    WHERE pos_sale_id = v_sale.pos_sale_id;

    v_sale.subtotal := v_sale.total_amount;

    IF v_sale.payment_method = 'CASH' THEN
        IF v_sale.amount_tendered IS NULL OR v_sale.amount_tendered < v_sale.total_amount THEN
            RAISE EXCEPTION 'Cash tendered cannot be less than the POS sale total.';
        END IF;
        v_sale.change_amount := round(v_sale.amount_tendered - v_sale.total_amount, 2);
    ELSE
        v_sale.amount_tendered := v_sale.total_amount;
        v_sale.change_amount := 0;
    END IF;

    -- Validate price source, product state, lot rules, and available stock before
    -- writing any stock or accounting effect.
    FOR v_line IN
        SELECT l.*, p.product_name, p.is_active, p.is_saleable, p.is_stock_item,
               p.track_lots, p.track_expiry
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        WHERE l.pos_sale_id = v_sale.pos_sale_id
        ORDER BY l.pos_sale_line_id
    LOOP
        IF NOT v_line.is_active OR NOT v_line.is_saleable THEN
            RAISE EXCEPTION 'Product % is not active and saleable.', v_line.product_name;
        END IF;

        IF v_line.unit_price <> COALESCE((
            SELECT pp.unit_price
            FROM sal.pos_product_price pp
            WHERE pp.product_id = v_line.product_id AND pp.is_active
        ), -1) THEN
            RAISE EXCEPTION 'No matching active POS price for product %.', v_line.product_name;
        END IF;

        IF v_line.is_stock_item THEN
            IF v_line.track_lots AND v_line.lot_id IS NULL THEN
                RAISE EXCEPTION 'A lot is required for product %.', v_line.product_name;
            END IF;

            SELECT COALESCE(SUM(
                CASE
                    WHEN sml.to_location_id = v_sale.location_id THEN sml.qty
                    WHEN sml.from_location_id = v_sale.location_id THEN -sml.qty
                    ELSE 0
                END
            ), 0)
            INTO v_available
            FROM inv.stock_movement_line sml
            JOIN inv.stock_movement sm ON sm.movement_id = sml.movement_id
            WHERE sml.product_id = v_line.product_id
              AND sml.lot_id IS NOT DISTINCT FROM v_line.lot_id;

            IF v_available < v_line.qty THEN
                RAISE EXCEPTION 'Insufficient stock for product %. Available: %, requested: %',
                    v_line.product_name, v_available, v_line.qty;
            END IF;

            v_cost := inv.get_default_unit_cost(v_line.product_id, v_line.lot_id);
            v_cogs := v_cogs + round(v_line.qty * COALESCE(v_cost, 0), 2);
        END IF;
    END LOOP;

    INSERT INTO inv.stock_movement (
        movement_type, document_no, party_id, from_location_id, notes, created_by
    )
    VALUES (
        'SALE_ISSUE', v_sale.sale_no, v_sale.customer_id,
        v_sale.location_id, 'POS sale ' || v_sale.sale_no, sec.current_user_id()
    )
    RETURNING movement_id INTO v_movement_id;

    FOR v_line IN
        SELECT l.*, p.is_stock_item
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        WHERE l.pos_sale_id = v_sale.pos_sale_id
        ORDER BY l.pos_sale_line_id
    LOOP
        IF v_line.is_stock_item THEN
            INSERT INTO inv.stock_movement_line (
                movement_id, product_id, lot_id, qty, unit_cost, from_location_id
            )
            VALUES (
                v_movement_id, v_line.product_id, v_line.lot_id, v_line.qty,
                inv.get_default_unit_cost(v_line.product_id, v_line.lot_id),
                v_sale.location_id
            );
        END IF;
    END LOOP;

    v_tender_account := fin.get_account_id(
        CASE v_sale.payment_method
            WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY'
            WHEN 'BANK' THEN 'BANK'
            ELSE 'CASH'
        END
    );
    v_sales_account := fin.get_account_id('SALES_REVENUE');
    v_inventory_account := fin.get_account_id('INVENTORY');
    v_cogs_account := fin.get_account_id('COGS');

    v_journal_id := fin.create_journal(
        'POS', v_sale.transaction_date, 'POS sale ' || v_sale.sale_no, 'SAL', v_sale.pos_sale_id
    );
    PERFORM fin.add_journal_line(v_journal_id, v_tender_account, v_sale.customer_id,
        'POS tender ' || v_sale.sale_no, v_sale.total_amount, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_sales_account, NULL,
        'POS revenue ' || v_sale.sale_no, 0, v_sale.total_amount);
    PERFORM fin.add_journal_line(v_journal_id, v_cogs_account, NULL,
        'POS COGS ' || v_sale.sale_no, v_cogs, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_inventory_account, NULL,
        'POS inventory ' || v_sale.sale_no, 0, v_cogs);
    PERFORM fin.assert_balanced(v_journal_id);

    UPDATE sal.pos_sale
    SET subtotal = v_sale.subtotal,
        total_amount = v_sale.total_amount,
        amount_tendered = v_sale.amount_tendered,
        change_amount = v_sale.change_amount,
        status = 'POSTED',
        posted_at = now(),
        posted_by = sec.current_user_id(),
        posted_movement_id = v_movement_id,
        posted_journal_id = v_journal_id
    WHERE pos_sale_id = v_sale.pos_sale_id;

    RETURN v_sale.pos_sale_id;
END;
$function$;

CREATE OR REPLACE FUNCTION sal.void_pos_sale(p_pos_sale_id uuid, p_reason text)
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
    v_cogs numeric(18,2) := 0;
BEGIN
    SELECT * INTO v_sale
    FROM sal.pos_sale
    WHERE pos_sale_id = p_pos_sale_id
    FOR UPDATE;

    IF v_sale.pos_sale_id IS NULL THEN
        RAISE EXCEPTION 'POS sale not found: %', p_pos_sale_id;
    END IF;
    IF v_sale.status = 'VOID' THEN
        RETURN v_sale.pos_sale_id;
    END IF;
    IF v_sale.status <> 'POSTED' THEN
        RAISE EXCEPTION 'Only POSTED POS sales can be voided.';
    END IF;
    IF NULLIF(trim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'A void reason is required.';
    END IF;

    INSERT INTO inv.stock_movement (
        movement_type, document_no, party_id, to_location_id, notes, created_by
    )
    VALUES (
        'CUSTOMER_RETURN', v_sale.sale_no, v_sale.customer_id,
        v_sale.location_id, 'Void POS sale ' || v_sale.sale_no, sec.current_user_id()
    )
    RETURNING movement_id INTO v_movement_id;

    FOR v_line IN
        SELECT l.*, p.is_stock_item
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        WHERE l.pos_sale_id = v_sale.pos_sale_id
        ORDER BY l.pos_sale_line_id
    LOOP
        IF v_line.is_stock_item THEN
            INSERT INTO inv.stock_movement_line (
                movement_id, product_id, lot_id, qty, unit_cost, to_location_id
            )
            VALUES (
                v_movement_id, v_line.product_id, v_line.lot_id, v_line.qty,
                inv.get_default_unit_cost(v_line.product_id, v_line.lot_id),
                v_sale.location_id
            );
            v_cogs := v_cogs + round(v_line.qty * COALESCE(inv.get_default_unit_cost(v_line.product_id, v_line.lot_id), 0), 2);
        END IF;
    END LOOP;

    v_tender_account := fin.get_account_id(
        CASE v_sale.payment_method
            WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY'
            WHEN 'BANK' THEN 'BANK'
            ELSE 'CASH'
        END
    );
    v_sales_account := fin.get_account_id('SALES_REVENUE');
    v_inventory_account := fin.get_account_id('INVENTORY');
    v_cogs_account := fin.get_account_id('COGS');

    v_journal_id := fin.create_journal(
        'POSV', current_date, 'Void POS sale ' || v_sale.sale_no, 'SAL', v_sale.pos_sale_id
    );
    PERFORM fin.add_journal_line(v_journal_id, v_sales_account, NULL,
        'Reverse POS revenue ' || v_sale.sale_no, v_sale.total_amount, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_tender_account, v_sale.customer_id,
        'Reverse POS tender ' || v_sale.sale_no, 0, v_sale.total_amount);
    PERFORM fin.add_journal_line(v_journal_id, v_inventory_account, NULL,
        'Reverse POS inventory ' || v_sale.sale_no, v_cogs, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_cogs_account, NULL,
        'Reverse POS COGS ' || v_sale.sale_no, 0, v_cogs);
    PERFORM fin.assert_balanced(v_journal_id);

    UPDATE sal.pos_sale
    SET status = 'VOID', voided_at = now(), voided_by = sec.current_user_id(),
        void_reason = trim(p_reason), reversal_movement_id = v_movement_id,
        reversal_journal_id = v_journal_id
    WHERE pos_sale_id = v_sale.pos_sale_id;

    RETURN v_sale.pos_sale_id;
END;
$function$;

CREATE OR REPLACE VIEW reporting.v_sales_event_lines AS
WITH delivery_cogs AS (
    SELECT d.delivery_id, sml.product_id, SUM(sml.qty * COALESCE(sml.unit_cost, 0)) AS cogs
    FROM sal.delivery d
    JOIN inv.stock_movement_line sml ON sml.movement_id = d.posted_movement_id
    GROUP BY d.delivery_id, sml.product_id
), pos_cogs AS (
    SELECT ps.pos_sale_id, psl.product_id, SUM(psl.qty * COALESCE(inv.get_default_unit_cost(psl.product_id, psl.lot_id), 0)) AS cogs
    FROM sal.pos_sale ps
    JOIN sal.pos_sale_line psl ON psl.pos_sale_id = ps.pos_sale_id
    WHERE ps.status = 'POSTED'
    GROUP BY ps.pos_sale_id, psl.product_id
)
SELECT
    'DELIVERY'::text AS source,
    d.delivery_id AS event_id,
    d.transaction_date::date AS event_date,
    d.customer_id,
    dl.product_id,
    COALESCE(dl.sell_qty, dl.qty, 0) AS qty,
    COALESCE(dl.sell_qty, dl.qty, 0) * COALESCE(dl.unit_price, 0) AS revenue,
    COALESCE(dc.cogs, 0) AS cogs
FROM sal.delivery d
JOIN sal.delivery_line dl ON dl.delivery_id = d.delivery_id
LEFT JOIN delivery_cogs dc ON dc.delivery_id = d.delivery_id AND dc.product_id = dl.product_id
UNION ALL
SELECT
    'POS'::text,
    ps.pos_sale_id,
    ps.transaction_date,
    ps.customer_id,
    psl.product_id,
    psl.qty,
    psl.line_total,
    COALESCE(pc.cogs, 0)
FROM sal.pos_sale ps
JOIN sal.pos_sale_line psl ON psl.pos_sale_id = ps.pos_sale_id
LEFT JOIN pos_cogs pc ON pc.pos_sale_id = ps.pos_sale_id AND pc.product_id = psl.product_id
WHERE ps.status = 'POSTED';
