-- Reuse the existing 5110 loss account for inventory damage / write-off posting.
ALTER TABLE inv.damage_adjustment
    DROP CONSTRAINT IF EXISTS damage_adjustment_movement_type_check;
ALTER TABLE inv.damage_adjustment
    ADD CONSTRAINT damage_adjustment_movement_type_check
    CHECK (movement_type = ANY (ARRAY[
        'DAMAGE'::text,
        'ADJUSTMENT'::text,
        'PRODUCT_RECLASSIFICATION'::text,
        'RECEIPT_REVERSAL'::text
    ]));

ALTER TABLE inv.stock_movement
    DROP CONSTRAINT IF EXISTS stock_movement_movement_type_check;
ALTER TABLE inv.stock_movement
    ADD CONSTRAINT stock_movement_movement_type_check
    CHECK (movement_type = ANY (ARRAY[
        'PURCHASE_RECEIPT'::text,
        'PRODUCTION_INPUT'::text,
        'PRODUCTION_OUTPUT'::text,
        'SALE_ISSUE'::text,
        'CUSTOMER_RETURN'::text,
        'SUPPLIER_RETURN'::text,
        'DAMAGE'::text,
        'ADJUSTMENT'::text,
        'RECEIPT_REVERSAL'::text,
        'TRANSFER'::text,
        'STOCKCOUNT'::text,
        'COUNT_VARIANCE'::text,
        'FOUND_STOCK'::text,
        'PRODUCT_RECLASSIFICATION'::text
    ]));

SELECT fin.set_posting_setup('INVENTORY_DAMAGE_LOSS', '5110');
INSERT INTO inv.adjustment_reason (reason_code, reason_name)
VALUES ('RECEIPT_REVERSAL', 'Goods Receipt Reversal')
ON CONFLICT (reason_code) DO UPDATE
SET reason_name = EXCLUDED.reason_name;

CREATE OR REPLACE FUNCTION inv.post_damage_adjustment_by_no(p_document_no text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_adjustment_id uuid;
    v_movement_id uuid;
    v_journal_id uuid;
    v_document_no text;
    v_movement_ts timestamptz;
    v_movement_type text;
    v_status text;
    v_from_location_id uuid;
    v_to_location_id uuid;
    v_reason_code text;
    v_notes text;
    v_reference_document_no text;
    v_line_count integer;
    v_available_qty numeric(18,3);
    v_total_value numeric(18,2);
    v_target_lot_id uuid;
    v_target_lot_code text;
    v_target_lot_prefix text;
    v_unit_cost numeric;
    v_inventory_account uuid;
    v_damage_loss_account uuid;
    v_grni_account uuid;
    v_is_location_transfer boolean := false;
    v_receipt_reversal boolean := false;
    r record;
BEGIN
    SELECT
        damage_adjustment_id,
        document_no,
        movement_type,
        movement_ts,
        status,
        from_location_id,
        to_location_id,
        reason_code,
        notes,
        reference_document_no
    INTO
        v_adjustment_id,
        v_document_no,
        v_movement_type,
        v_movement_ts,
        v_status,
        v_from_location_id,
        v_to_location_id,
        v_reason_code,
        v_notes,
        v_reference_document_no
    FROM inv.damage_adjustment
    WHERE document_no = p_document_no
    FOR UPDATE;

    IF v_adjustment_id IS NULL THEN
        RAISE EXCEPTION 'Damage/Adjustment document not found: %', p_document_no;
    END IF;

    IF v_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Only DRAFT damage/adjustment documents can be posted. Current status: %', v_status;
    END IF;

    IF v_from_location_id IS NULL THEN
        RAISE EXCEPTION 'From Location is required.';
    END IF;

    IF v_reason_code IS NULL OR length(trim(v_reason_code)) = 0 THEN
        RAISE EXCEPTION 'Reason code is required for movement type %.', v_movement_type;
    END IF;

    IF v_movement_type NOT IN ('DAMAGE', 'ADJUSTMENT', 'PRODUCT_RECLASSIFICATION', 'RECEIPT_REVERSAL') THEN
        RAISE EXCEPTION 'Invalid movement type: %', v_movement_type;
    END IF;

    SELECT COUNT(*)
    INTO v_line_count
    FROM inv.damage_adjustment_line
    WHERE damage_adjustment_id = v_adjustment_id;

    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'Cannot post document %. No stock lines found.', p_document_no;
    END IF;

    v_receipt_reversal := v_movement_type = 'RECEIPT_REVERSAL';

    -- ADJUSTMENT can be a location transfer when a destination location is provided.
    v_is_location_transfer :=
        v_movement_type = 'ADJUSTMENT'
        AND v_to_location_id IS NOT NULL
        AND v_to_location_id IS DISTINCT FROM v_from_location_id;

    -- =====================================================
    -- Validate source stock availability
    -- =====================================================
    FOR r IN
        SELECT
            l.damage_adjustment_line_id,
            l.product_id,
            l.lot_id,
            l.target_product_id,
            l.target_lot_id,
            l.qty,
            l.unit_cost,
            p.product_name,
            p.sku,
            lot.lot_code,
            tp.product_name AS target_product_name,
            tp.sku AS target_sku
        FROM inv.damage_adjustment_line l
        JOIN inv.product p
            ON p.product_id = l.product_id
        LEFT JOIN inv.lot lot
            ON lot.lot_id = l.lot_id
        LEFT JOIN inv.product tp
            ON tp.product_id = l.target_product_id
        WHERE l.damage_adjustment_id = v_adjustment_id
    LOOP
        IF r.qty <= 0 THEN
            RAISE EXCEPTION 'Quantity must be greater than zero for product %.', r.product_name;
        END IF;

        IF r.lot_id IS NULL THEN
            RAISE EXCEPTION 'Source lot is required for product %.', r.product_name;
        END IF;

        IF v_movement_type = 'PRODUCT_RECLASSIFICATION' THEN
            IF r.target_product_id IS NULL THEN
                RAISE EXCEPTION 'Target product is required for product reclassification.';
            END IF;

            IF r.target_product_id = r.product_id THEN
                RAISE EXCEPTION 'Target product must be different from source product for product reclassification.';
            END IF;
        END IF;

        IF v_receipt_reversal THEN
            IF EXISTS (
                SELECT 1
                FROM inv.stock_movement_line sml
                JOIN inv.stock_movement sm
                    ON sm.movement_id = sml.movement_id
                WHERE sml.product_id = r.product_id
                  AND sml.lot_id IS NOT DISTINCT FROM r.lot_id
                  AND sm.movement_type <> 'PURCHASE_RECEIPT'
            ) THEN
                RAISE EXCEPTION
                    'Receipt reversal cannot be posted because inventory from this lot has already been consumed.';
            END IF;
        END IF;

        SELECT COALESCE(SUM(
            CASE
                WHEN sml.to_location_id = v_from_location_id THEN sml.qty
                WHEN sml.from_location_id = v_from_location_id THEN -sml.qty
                ELSE 0
            END
        ), 0)
        INTO v_available_qty
        FROM inv.stock_movement_line sml
        JOIN inv.stock_movement sm
            ON sm.movement_id = sml.movement_id
        WHERE sml.product_id = r.product_id
          AND sml.lot_id IS NOT DISTINCT FROM r.lot_id;

        IF v_available_qty < r.qty THEN
            RAISE EXCEPTION
                'Insufficient stock for product %, lot %. Available: %, requested: %',
                r.product_name,
                COALESCE(r.lot_code, 'NO LOT'),
                v_available_qty,
                r.qty;
        END IF;
    END LOOP;

    -- =====================================================
    -- Create stock movement header
    -- =====================================================
    INSERT INTO inv.stock_movement (
        movement_type,
        document_no,
        reason_code,
        from_location_id,
        to_location_id,
        notes,
        movement_ts
    )
    VALUES (
        v_movement_type,
        v_document_no,
        v_reason_code,
        v_from_location_id,
        CASE
            WHEN v_movement_type = 'ADJUSTMENT' THEN v_to_location_id
            WHEN v_movement_type = 'PRODUCT_RECLASSIFICATION' THEN v_from_location_id
            ELSE NULL
        END,
        CASE
            WHEN v_reference_document_no IS NOT NULL THEN
                COALESCE(v_notes, '') || E'\nReference: ' || v_reference_document_no
            ELSE
                v_notes
        END,
        now()
    )
    RETURNING movement_id INTO v_movement_id;

    -- =====================================================
    -- Normal DAMAGE / ADJUSTMENT posting
    -- Existing movement behavior preserved.
    -- =====================================================
    IF v_movement_type IN ('DAMAGE', 'ADJUSTMENT') THEN
        INSERT INTO inv.stock_movement_line (
            movement_id,
            product_id,
            lot_id,
            qty,
            unit_cost,
            from_location_id,
            to_location_id
        )
        SELECT
            v_movement_id,
            l.product_id,
            l.lot_id,
            l.qty,
            COALESCE(l.unit_cost, 0),
            v_from_location_id,
            CASE
                WHEN v_movement_type = 'ADJUSTMENT' THEN v_to_location_id
                ELSE NULL
            END
        FROM inv.damage_adjustment_line l
        WHERE l.damage_adjustment_id = v_adjustment_id;
    END IF;

    IF v_receipt_reversal THEN
        INSERT INTO inv.stock_movement_line (
            movement_id,
            product_id,
            lot_id,
            qty,
            unit_cost,
            from_location_id,
            to_location_id
        )
        SELECT
            v_movement_id,
            l.product_id,
            l.lot_id,
            l.qty,
            COALESCE(l.unit_cost, 0),
            v_from_location_id,
            NULL
        FROM inv.damage_adjustment_line l
        WHERE l.damage_adjustment_id = v_adjustment_id;
    END IF;

    -- =====================================================
    -- PRODUCT_RECLASSIFICATION posting
    -- OUT wrong product, IN correct product.
    -- Target lot is auto-created if missing.
    -- =====================================================
    IF v_movement_type = 'PRODUCT_RECLASSIFICATION' THEN
        FOR r IN
            SELECT
                l.damage_adjustment_line_id,
                l.product_id,
                l.lot_id,
                l.target_product_id,
                l.target_lot_id,
                l.qty,
                l.unit_cost,
                p.product_name,
                p.sku,
                src_lot.lot_code AS source_lot_code,
                src_lot.manufacture_date,
                src_lot.expiry_date,
                tp.product_name AS target_product_name,
                tp.sku AS target_sku,
                tp.lot_prefix AS target_lot_prefix
            FROM inv.damage_adjustment_line l
            JOIN inv.product p
                ON p.product_id = l.product_id
            JOIN inv.product tp
                ON tp.product_id = l.target_product_id
            LEFT JOIN inv.lot src_lot
                ON src_lot.lot_id = l.lot_id
            WHERE l.damage_adjustment_id = v_adjustment_id
            ORDER BY l.damage_adjustment_line_id
        LOOP
            v_target_lot_id := r.target_lot_id;

            -- Carry source cost. If line cost is missing, calculate from existing movements.
            v_unit_cost := COALESCE(r.unit_cost, 0);

            IF v_unit_cost = 0 THEN
                SELECT COALESCE(
                    AVG(NULLIF(sml.unit_cost, 0)),
                    0
                )
                INTO v_unit_cost
                FROM inv.stock_movement_line sml
                WHERE sml.product_id = r.product_id
                  AND sml.lot_id IS NOT DISTINCT FROM r.lot_id
                  AND sml.unit_cost IS NOT NULL;
            END IF;

            -- Auto-create target lot if missing
            IF v_target_lot_id IS NULL THEN
                v_target_lot_prefix := COALESCE(NULLIF(trim(r.target_lot_prefix), ''), 'RCL');

                v_target_lot_code :=
                    v_target_lot_prefix ||
                    '-RCL-' ||
                    regexp_replace(v_document_no, '[^A-Za-z0-9]+', '-', 'g') ||
                    '-' ||
                    substring(r.damage_adjustment_line_id::text from 1 for 4);

                INSERT INTO inv.lot (
                    lot_id,
                    product_id,
                    lot_code,
                    manufacture_date,
                    expiry_date,
                    source_module,
                    source_id,
                    created_at
                )
                VALUES (
                    gen_random_uuid(),
                    r.target_product_id,
                    upper(v_target_lot_code),
                    r.manufacture_date,
                    r.expiry_date,
                    'PRODUCT_RECLASSIFICATION',
                    v_adjustment_id,
                    now()
                )
                RETURNING lot_id INTO v_target_lot_id;

                UPDATE inv.damage_adjustment_line
                SET target_lot_id = v_target_lot_id
                WHERE damage_adjustment_line_id = r.damage_adjustment_line_id;
            END IF;

            -- OUT line: wrong product leaves stock
            INSERT INTO inv.stock_movement_line (
                movement_id,
                product_id,
                lot_id,
                qty,
                unit_cost,
                from_location_id,
                to_location_id
            )
            VALUES (
                v_movement_id,
                r.product_id,
                r.lot_id,
                r.qty,
                v_unit_cost,
                v_from_location_id,
                NULL
            );

            -- IN line: correct product enters stock
            INSERT INTO inv.stock_movement_line (
                movement_id,
                product_id,
                lot_id,
                qty,
                unit_cost,
                from_location_id,
                to_location_id
            )
            VALUES (
                v_movement_id,
                r.target_product_id,
                v_target_lot_id,
                r.qty,
                v_unit_cost,
                NULL,
                v_from_location_id
            );
        END LOOP;
    END IF;

    -- =====================================================
    -- Financial posting
    -- DAMAGE always posts to GL.
    -- ADJUSTMENT only posts when it is a quantity correction.
    -- PRODUCT_RECLASSIFICATION stays value-neutral and does not post GL.
    -- =====================================================
    SELECT COALESCE(ROUND(SUM(l.qty * COALESCE(l.unit_cost, 0)), 2), 0)
    INTO v_total_value
    FROM inv.damage_adjustment_line l
    WHERE l.damage_adjustment_id = v_adjustment_id;

    IF v_total_value <> 0
       AND (
           v_movement_type = 'DAMAGE'
           OR (v_movement_type = 'ADJUSTMENT' AND NOT v_is_location_transfer)
           OR v_receipt_reversal
       ) THEN
        v_inventory_account := fin.get_account_id('INVENTORY');

        IF v_receipt_reversal THEN
            v_grni_account := fin.get_account_id('GRNI');

            v_journal_id := fin.create_journal(
                'RGR',
                COALESCE(v_movement_ts::date, current_date),
                'Goods Receipt Reversal ' || COALESCE(NULLIF(trim(v_reference_document_no), ''), v_document_no),
                'INV',
                v_adjustment_id
            );

            PERFORM fin.add_journal_line(
                v_journal_id,
                v_grni_account,
                NULL,
                'GRNI reversal ' || v_document_no,
                v_total_value,
                0
            );

            PERFORM fin.add_journal_line(
                v_journal_id,
                v_inventory_account,
                NULL,
                'Inventory reversal ' || v_document_no,
                0,
                v_total_value
            );
        ELSE
            v_damage_loss_account := fin.get_account_id('INVENTORY_DAMAGE_LOSS');

            v_journal_id := fin.create_journal(
                'ADJ',
                COALESCE(v_movement_ts::date, current_date),
                CASE
                    WHEN v_movement_type = 'DAMAGE' THEN 'Damage adjustment ' || v_document_no
                    ELSE 'Stock adjustment ' || v_document_no
                END,
                'INV',
                v_adjustment_id
            );

            PERFORM fin.add_journal_line(
                v_journal_id,
                v_damage_loss_account,
                NULL,
                CASE
                    WHEN v_movement_type = 'DAMAGE' THEN 'Damage write-off ' || v_document_no
                    ELSE 'Inventory adjustment ' || v_document_no
                END,
                v_total_value,
                0
            );

            PERFORM fin.add_journal_line(
                v_journal_id,
                v_inventory_account,
                NULL,
                CASE
                    WHEN v_movement_type = 'DAMAGE' THEN 'Inventory reduction ' || v_document_no
                    ELSE 'Inventory correction ' || v_document_no
                END,
                0,
                v_total_value
            );
        END IF;

        PERFORM fin.assert_balanced(v_journal_id);
    END IF;

    -- =====================================================
    -- Mark document posted
    -- =====================================================
    UPDATE inv.damage_adjustment
    SET
        status = 'POSTED',
        posted_movement_id = v_movement_id
    WHERE damage_adjustment_id = v_adjustment_id;

    RETURN v_movement_id;
END;
$function$;
