-- PHASE 18: FORWARD POS INTEGRATION CORRECTIONS
-- Phase 16 and 17 are assumed to be applied. This migration is additive and
-- preserves all POS sales, AR records, barcodes, reasons, and audit history.

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

    SELECT COALESCE(pos_pricing_mode, 'FIXED')
    INTO v_pricing_mode
    FROM app.company_profile
    WHERE is_active = true
    ORDER BY created_at, company_id
    LIMIT 1;
    v_pricing_mode := COALESCE(v_pricing_mode, 'FIXED');

    -- Validate all sale-level rules before any inventory, journal, or AR write.
    IF v_sale.payment_method = 'CREDIT' THEN
        IF v_sale.customer_id IS NULL THEN
            RAISE EXCEPTION 'Customer is required for CREDIT POS sales.';
        END IF;
        IF v_sale.credit_ar_invoice_id IS NOT NULL THEN
            RAISE EXCEPTION 'CREDIT POS sale already has an AR linkage.';
        END IF;
        v_sale.due_date := COALESCE(v_sale.due_date, v_sale.transaction_date);
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
        v_sale.amount_tendered := CASE WHEN v_sale.payment_method = 'CREDIT' THEN NULL ELSE v_sale.total_amount END;
        v_sale.change_amount := 0;
    END IF;

    FOR v_line IN
        SELECT l.*, p.product_name, p.is_active, p.is_saleable, p.is_stock_item, p.track_lots
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        WHERE l.pos_sale_id = v_sale.pos_sale_id
        ORDER BY l.pos_sale_line_id
    LOOP
        IF NOT v_line.is_active OR NOT v_line.is_saleable THEN
            RAISE EXCEPTION 'Product % is not active and saleable.', v_line.product_name;
        END IF;

        IF v_line.price_source = 'CONFIGURED' THEN
            IF v_pricing_mode NOT IN ('FIXED', 'HYBRID') THEN
                RAISE EXCEPTION 'Configured pricing is not valid in MANUAL mode for %.', v_line.product_name;
            END IF;
            IF v_line.unit_price <> COALESCE((
                SELECT pp.unit_price
                FROM sal.pos_product_price pp
                WHERE pp.product_id = v_line.product_id AND pp.is_active
            ), -1) THEN
                RAISE EXCEPTION 'No matching active POS price for product %.', v_line.product_name;
            END IF;
        ELSIF v_line.price_source = 'MANUAL' THEN
            IF v_pricing_mode NOT IN ('MANUAL', 'HYBRID') THEN
                RAISE EXCEPTION 'Manual pricing is not allowed in FIXED mode for %.', v_line.product_name;
            END IF;
            IF v_line.unit_price IS NULL OR v_line.unit_price < 0 THEN
                RAISE EXCEPTION 'A valid manual POS price is required for %.', v_line.product_name;
            END IF;
        ELSIF v_line.price_source = 'OVERRIDE' THEN
            IF v_pricing_mode <> 'HYBRID' THEN
                RAISE EXCEPTION 'POS price overrides are allowed only in HYBRID mode.';
            END IF;
            IF NULLIF(trim(v_line.price_override_reason), '') IS NULL THEN
                RAISE EXCEPTION 'A price override reason is required for %.', v_line.product_name;
            END IF;
            IF v_line.reference_price IS NULL OR v_line.reference_price <> COALESCE((
                SELECT pp.unit_price
                FROM sal.pos_product_price pp
                WHERE pp.product_id = v_line.product_id AND pp.is_active
            ), -1) THEN
                RAISE EXCEPTION 'The POS reference price is no longer current for %.', v_line.product_name;
            END IF;
            -- The actual override is intentionally allowed to differ from the
            -- configured/reference price; the line stores both values.
        ELSE
            RAISE EXCEPTION 'Unsupported POS price source for %.', v_line.product_name;
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
                RAISE EXCEPTION 'Insufficient stock for product %. Available: %, requested: %', v_line.product_name, v_available, v_line.qty;
            END IF;
            v_cost := inv.get_default_unit_cost(v_line.product_id, v_line.lot_id);
            v_cogs := v_cogs + round(v_line.qty * COALESCE(v_cost, 0), 2);
        END IF;
    END LOOP;

    INSERT INTO inv.stock_movement(movement_type, document_no, party_id, from_location_id, notes, created_by)
    VALUES ('SALE_ISSUE', v_sale.sale_no, v_sale.customer_id, v_sale.location_id, 'POS sale ' || v_sale.sale_no, sec.current_user_id())
    RETURNING movement_id INTO v_movement_id;

    FOR v_line IN
        SELECT l.*, p.is_stock_item
        FROM sal.pos_sale_line l
        JOIN inv.product p ON p.product_id = l.product_id
        WHERE l.pos_sale_id = v_sale.pos_sale_id
        ORDER BY l.pos_sale_line_id
    LOOP
        IF v_line.is_stock_item THEN
            INSERT INTO inv.stock_movement_line(movement_id, product_id, lot_id, qty, unit_cost, from_location_id)
            VALUES (v_movement_id, v_line.product_id, v_line.lot_id, v_line.qty,
                    inv.get_default_unit_cost(v_line.product_id, v_line.lot_id), v_sale.location_id);
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
        v_tender_account := fin.get_account_id(
            CASE v_sale.payment_method
                WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY'
                WHEN 'BANK' THEN 'BANK'
                WHEN 'BANK_TRANSFER' THEN 'BANK'
                WHEN 'CARD' THEN 'CARD'
                ELSE 'CASH'
            END
        );
        PERFORM fin.add_journal_line(v_journal_id, v_tender_account, v_sale.customer_id, 'POS tender ' || v_sale.sale_no, v_sale.total_amount, 0);
    END IF;
    PERFORM fin.add_journal_line(v_journal_id, v_sales_account, NULL, 'POS revenue ' || v_sale.sale_no, 0, v_sale.total_amount);
    PERFORM fin.add_journal_line(v_journal_id, v_cogs_account, NULL, 'POS COGS ' || v_sale.sale_no, v_cogs, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_inventory_account, NULL, 'POS inventory ' || v_sale.sale_no, 0, v_cogs);
    PERFORM fin.assert_balanced(v_journal_id);

    IF v_sale.payment_method = 'CREDIT' THEN
        INSERT INTO sal.ar_invoice(ar_invoice_id, invoice_no, customer_id, invoice_date, due_date, status, delivery_id, created_at, posted_journal_id, transaction_date)
        VALUES (gen_random_uuid(), v_sale.sale_no, v_sale.customer_id, v_sale.transaction_date, v_sale.due_date, 'OPEN', NULL, now(), v_journal_id, v_sale.transaction_date)
        RETURNING ar_invoice_id INTO v_ar_invoice_id;
        FOR v_line IN
            SELECT l.*, p.product_name, p.uom_code
            FROM sal.pos_sale_line l
            JOIN inv.product p ON p.product_id = l.product_id
            WHERE l.pos_sale_id = v_sale.pos_sale_id
        LOOP
            INSERT INTO sal.ar_invoice_line(ar_invoice_line_id, ar_invoice_id, product_id, description, qty, unit_price, sell_qty, sell_uom_code, base_qty)
            VALUES (gen_random_uuid(), v_ar_invoice_id, v_line.product_id, v_line.product_name, v_line.qty, v_line.unit_price, v_line.qty, v_line.uom_code, v_line.qty);
        END LOOP;
    END IF;

    UPDATE sal.pos_sale
    SET subtotal = v_sale.subtotal,
        total_amount = v_sale.total_amount,
        amount_tendered = v_sale.amount_tendered,
        change_amount = v_sale.change_amount,
        due_date = CASE WHEN v_sale.payment_method = 'CREDIT' THEN v_sale.due_date ELSE due_date END,
        status = 'POSTED',
        posted_at = now(),
        posted_by = sec.current_user_id(),
        posted_movement_id = v_movement_id,
        posted_journal_id = v_journal_id,
        credit_ar_invoice_id = v_ar_invoice_id
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
    v_original_movement_id uuid;
    v_original_line record;
    v_return_movement_id uuid;
    v_journal_id uuid;
    v_tender_account uuid;
    v_sales_account uuid;
    v_inventory_account uuid;
    v_cogs_account uuid;
    v_ar_account uuid;
    v_cogs numeric(18,2) := 0;
BEGIN
    SELECT * INTO v_sale
    FROM sal.pos_sale
    WHERE pos_sale_id = p_pos_sale_id
    FOR UPDATE;

    IF v_sale.pos_sale_id IS NULL THEN RAISE EXCEPTION 'POS sale not found: %', p_pos_sale_id; END IF;
    IF v_sale.status = 'VOID' THEN RETURN v_sale.pos_sale_id; END IF;
    IF v_sale.status <> 'POSTED' THEN RAISE EXCEPTION 'Only POSTED POS sales can be voided.'; END IF;
    IF NULLIF(trim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A void reason is required.'; END IF;

    IF v_sale.payment_method = 'CREDIT' THEN
        IF v_sale.credit_ar_invoice_id IS NULL THEN
            RAISE EXCEPTION 'CREDIT POS sale has no AR linkage.';
        END IF;
        IF EXISTS (SELECT 1 FROM sal.ar_payment_apply WHERE ar_invoice_id = v_sale.credit_ar_invoice_id) THEN
            RAISE EXCEPTION 'A POS credit sale with receipts cannot be voided.';
        END IF;
    END IF;

    v_original_movement_id := v_sale.posted_movement_id;
    IF v_original_movement_id IS NULL THEN
        SELECT movement_id INTO v_original_movement_id
        FROM inv.stock_movement
        WHERE movement_type = 'SALE_ISSUE'
          AND document_no = v_sale.sale_no
        ORDER BY created_at, movement_id
        LIMIT 1;
    END IF;
    IF v_original_movement_id IS NULL THEN
        RAISE EXCEPTION 'Original POS SALE_ISSUE movement not found for %.', v_sale.sale_no;
    END IF;

    INSERT INTO inv.stock_movement(movement_type, document_no, party_id, to_location_id, notes, created_by)
    VALUES ('CUSTOMER_RETURN', v_sale.sale_no, v_sale.customer_id, v_sale.location_id, 'Void POS sale ' || v_sale.sale_no, sec.current_user_id())
    RETURNING movement_id INTO v_return_movement_id;

    -- Reverse the exact original movement valuation, including its lot and cost.
    FOR v_original_line IN
        SELECT sml.product_id, sml.lot_id, sml.qty, sml.unit_cost
        FROM inv.stock_movement_line sml
        WHERE sml.movement_id = v_original_movement_id
        ORDER BY sml.movement_line_id
    LOOP
        INSERT INTO inv.stock_movement_line(movement_id, product_id, lot_id, qty, unit_cost, to_location_id)
        VALUES (v_return_movement_id, v_original_line.product_id, v_original_line.lot_id,
                v_original_line.qty, v_original_line.unit_cost, v_sale.location_id);
        v_cogs := v_cogs + round(v_original_line.qty * COALESCE(v_original_line.unit_cost, 0), 2);
    END LOOP;

    v_sales_account := fin.get_account_id('SALES_REVENUE');
    v_inventory_account := fin.get_account_id('INVENTORY');
    v_cogs_account := fin.get_account_id('COGS');
    v_journal_id := fin.create_journal('POSV', current_date, 'Void POS sale ' || v_sale.sale_no, 'SAL', v_sale.pos_sale_id);
    PERFORM fin.add_journal_line(v_journal_id, v_sales_account, NULL, 'Reverse POS revenue ' || v_sale.sale_no, v_sale.total_amount, 0);
    IF v_sale.payment_method = 'CREDIT' THEN
        v_ar_account := fin.get_account_id('AR_CONTROL');
        PERFORM fin.add_journal_line(v_journal_id, v_ar_account, v_sale.customer_id, 'Reverse POS credit ' || v_sale.sale_no, 0, v_sale.total_amount);
    ELSE
        v_tender_account := fin.get_account_id(
            CASE v_sale.payment_method
                WHEN 'MOBILE_MONEY' THEN 'MOBILE_MONEY'
                WHEN 'BANK' THEN 'BANK'
                WHEN 'BANK_TRANSFER' THEN 'BANK'
                WHEN 'CARD' THEN 'CARD'
                ELSE 'CASH'
            END
        );
        PERFORM fin.add_journal_line(v_journal_id, v_tender_account, v_sale.customer_id, 'Reverse POS tender ' || v_sale.sale_no, 0, v_sale.total_amount);
    END IF;
    PERFORM fin.add_journal_line(v_journal_id, v_inventory_account, NULL, 'Reverse POS inventory ' || v_sale.sale_no, v_cogs, 0);
    PERFORM fin.add_journal_line(v_journal_id, v_cogs_account, NULL, 'Reverse POS COGS ' || v_sale.sale_no, 0, v_cogs);
    PERFORM fin.assert_balanced(v_journal_id);

    IF v_sale.payment_method = 'CREDIT' THEN
        UPDATE sal.ar_invoice
        SET status = 'VOID', voided_at = now(), voided_by = sec.current_user_id(),
            void_reason = trim(p_reason), reversal_journal_id = v_journal_id
        WHERE ar_invoice_id = v_sale.credit_ar_invoice_id;
    END IF;

    UPDATE sal.pos_sale
    SET status = 'VOID', voided_at = now(), voided_by = sec.current_user_id(),
        void_reason = trim(p_reason), reversal_movement_id = v_return_movement_id,
        reversal_journal_id = v_journal_id
    WHERE pos_sale_id = v_sale.pos_sale_id;
    RETURN v_sale.pos_sale_id;
END;
$function$;
