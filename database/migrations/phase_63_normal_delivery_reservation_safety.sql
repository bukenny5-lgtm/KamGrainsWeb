-- PHASE 63: NORMAL DELIVERY RESERVATION-AWARE STOCK SAFETY
-- Staging validation target: kam_grains_staging.
-- Reuses the established stock-fulfil lock namespace and transfer reservation rule.

CREATE OR REPLACE VIEW sal.v_delivery_line_lot_options AS
SELECT
    dl.delivery_line_id,
    dl.delivery_line_id::text AS delivery_line_id_text,
    d.delivery_id,
    d.delivery_no,
    d.location_id,
    dl.product_id,
    p.product_name,
    soh.lot_id,
    l.lot_code,
    ('{'::text || soh.lot_id::text) || '}'::text AS lot_id_key,
    soh.expiry_date,
    soh.qty_on_hand,
    dl.qty AS required_qty,
    COALESCE(reserved.reserved_qty, 0) AS reserved_qty,
    soh.qty_on_hand - COALESCE(reserved.reserved_qty, 0) AS available_qty
FROM sal.delivery_line dl
JOIN sal.delivery d ON d.delivery_id = dl.delivery_id
JOIN inv.product p ON p.product_id = dl.product_id
JOIN inv.v_stock_on_hand soh
  ON soh.product_id = dl.product_id
 AND soh.location_id = d.location_id
LEFT JOIN inv.lot l ON l.lot_id = soh.lot_id
LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(CASE
        WHEN t.status = 'DRAFT' THEN tl.qty
        WHEN t.status = 'PARTIALLY_DISPATCHED' THEN tl.qty - COALESCE(dispatched.dispatched_qty, 0)
        ELSE 0
    END), 0) AS reserved_qty
    FROM inv.stock_transfer t
    JOIN inv.stock_transfer_line tl ON tl.stock_transfer_id = t.stock_transfer_id
    LEFT JOIN LATERAL (
        SELECT SUM(dl2.qty) AS dispatched_qty
        FROM inv.stock_transfer_dispatch_line dl2
        JOIN inv.stock_transfer_dispatch d2 ON d2.dispatch_id = dl2.dispatch_id
        WHERE dl2.stock_transfer_line_id = tl.stock_transfer_line_id
          AND d2.status = 'DISPATCHED'
    ) dispatched ON true
    WHERE t.source_location_id = soh.location_id
      AND t.status IN ('DRAFT', 'PARTIALLY_DISPATCHED')
      AND tl.product_id = soh.product_id
      AND tl.lot_id IS NOT DISTINCT FROM soh.lot_id
) reserved ON true
WHERE COALESCE(soh.qty_on_hand, 0) > 0
  AND (soh.expiry_date IS NULL OR soh.expiry_date >= CURRENT_DATE)
  AND soh.qty_on_hand - COALESCE(reserved.reserved_qty, 0) >= COALESCE(dl.qty, 0);

CREATE OR REPLACE FUNCTION sal.post_delivery(p_delivery_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
    v_del sal.delivery%ROWTYPE;
    v_line record;
    v_movement_id uuid;
    v_journal_id uuid;
    v_total_cost numeric(18,2);
    v_inventory_account uuid;
    v_cogs_account uuid;
    v_on_hand numeric;
    v_reserved numeric;
BEGIN
    SELECT * INTO v_del
    FROM sal.delivery
    WHERE delivery_id = p_delivery_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Delivery not found';
    END IF;
    IF v_del.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Cannot post cancelled delivery';
    END IF;
    IF v_del.is_posted THEN
        RAISE EXCEPTION 'Delivery already posted';
    END IF;
    IF v_del.location_id IS NULL THEN
        RAISE EXCEPTION 'Delivery.location_id is required to post';
    END IF;

    -- Match POS and transfer fulfilment. Every affected pair is locked in a
    -- deterministic order before availability validation or mutation.
    FOR v_line IN
        SELECT DISTINCT v_del.location_id AS location_id, dl.product_id
        FROM sal.delivery_line dl
        JOIN inv.product p ON p.product_id = dl.product_id
        WHERE dl.delivery_id = v_del.delivery_id
          AND p.is_stock_item
        ORDER BY v_del.location_id, dl.product_id
    LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended(
            'stock-fulfil:' || v_line.location_id::text || ':' || v_line.product_id::text,
            0
        ));
    END LOOP;

    -- Revalidate the exact delivery lines after the shared locks are held.
    FOR v_line IN
        SELECT dl.product_id, dl.lot_id, dl.qty,
               p.product_name, p.is_stock_item, p.track_lots,
               lot.product_id AS lot_product_id, lot.lot_status, lot.expiry_date
        FROM sal.delivery_line dl
        JOIN inv.product p ON p.product_id = dl.product_id
        LEFT JOIN inv.lot lot ON lot.lot_id = dl.lot_id
        WHERE dl.delivery_id = v_del.delivery_id
        ORDER BY dl.delivery_line_id
    LOOP
        IF v_line.lot_id IS NOT NULL
           AND (v_line.lot_product_id IS NULL OR v_line.lot_product_id <> v_line.product_id) THEN
            RAISE EXCEPTION 'Selected lot does not belong to product %.', v_line.product_name;
        END IF;
        IF v_line.track_lots AND v_line.lot_id IS NULL THEN
            RAISE EXCEPTION 'A lot is required for product %.', v_line.product_name;
        END IF;
        IF v_line.lot_id IS NOT NULL
           AND (v_line.lot_status <> 'ACTIVE'
                OR (v_line.expiry_date IS NOT NULL AND v_line.expiry_date < current_date)) THEN
            RAISE EXCEPTION 'Selected lot is not eligible for product %.', v_line.product_name;
        END IF;

        IF v_line.is_stock_item THEN
            SELECT COALESCE(SUM(soh.qty_on_hand), 0)
            INTO v_on_hand
            FROM inv.v_stock_on_hand soh
            WHERE soh.product_id = v_line.product_id
              AND soh.location_id = v_del.location_id
              AND soh.lot_id IS NOT DISTINCT FROM v_line.lot_id;

            SELECT COALESCE(SUM(CASE
                WHEN t.status = 'DRAFT' THEN tl.qty
                WHEN t.status = 'PARTIALLY_DISPATCHED' THEN tl.qty - COALESCE(dispatched.dispatched_qty, 0)
                ELSE 0
            END), 0)
            INTO v_reserved
            FROM inv.stock_transfer t
            JOIN inv.stock_transfer_line tl ON tl.stock_transfer_id = t.stock_transfer_id
            LEFT JOIN LATERAL (
                SELECT SUM(dl2.qty) AS dispatched_qty
                FROM inv.stock_transfer_dispatch_line dl2
                JOIN inv.stock_transfer_dispatch d2 ON d2.dispatch_id = dl2.dispatch_id
                WHERE dl2.stock_transfer_line_id = tl.stock_transfer_line_id
                  AND d2.status = 'DISPATCHED'
            ) dispatched ON true
            WHERE t.source_location_id = v_del.location_id
              AND t.status IN ('DRAFT', 'PARTIALLY_DISPATCHED')
              AND tl.product_id = v_line.product_id
              AND tl.lot_id IS NOT DISTINCT FROM v_line.lot_id;

            IF v_on_hand - v_reserved < v_line.qty THEN
                RAISE EXCEPTION 'Insufficient stock for product %. Available: %, requested: %',
                    v_line.product_name, GREATEST(v_on_hand - v_reserved, 0), v_line.qty;
            END IF;
        END IF;
    END LOOP;

    INSERT INTO inv.stock_movement(
        movement_ts, movement_type, document_no, party_id, from_location_id, notes, created_by
    ) VALUES (
        now(), 'SALE_ISSUE', v_del.delivery_no, v_del.customer_id, v_del.location_id,
        'Auto-posted from Delivery', sec.current_user_id()
    ) RETURNING movement_id INTO v_movement_id;

    INSERT INTO inv.stock_movement_line(
        movement_id, product_id, lot_id, qty, unit_cost, from_location_id
    )
    SELECT v_movement_id, dl.product_id, dl.lot_id, dl.qty,
           COALESCE(lc.unit_cost, 0), v_del.location_id
    FROM sal.delivery_line dl
    LEFT JOIN inv.v_lot_unit_cost lc ON lc.lot_id = dl.lot_id
    WHERE dl.delivery_id = v_del.delivery_id;

    SELECT round(COALESCE(SUM(qty * unit_cost), 0), 2)
    INTO v_total_cost
    FROM inv.stock_movement_line
    WHERE movement_id = v_movement_id;

    v_inventory_account := fin.get_account_id('INVENTORY');
    v_cogs_account := fin.get_account_id('COGS');
    v_journal_id := fin.create_journal('SHP', v_del.delivery_date,
                                       'Delivery ' || v_del.delivery_no || ' (COGS)',
                                       'SAL', v_del.delivery_id);
    PERFORM fin.add_journal_line(v_journal_id, v_cogs_account, NULL,
                                 'COGS ' || v_del.delivery_no, v_total_cost, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_inventory_account, NULL,
                                 'Inventory issue ' || v_del.delivery_no, 0, v_total_cost);
    PERFORM fin.assert_balanced(v_journal_id);

    UPDATE sal.delivery
    SET is_posted = true, posted_movement_id = v_movement_id, posted_journal_id = v_journal_id
    WHERE delivery_id = v_del.delivery_id;

    RETURN v_movement_id;
END;
$function$;

-- The existing wrapper remains the single normal-delivery-by-number entrypoint.
-- Ownership and ACL are intentionally not changed by this migration.
