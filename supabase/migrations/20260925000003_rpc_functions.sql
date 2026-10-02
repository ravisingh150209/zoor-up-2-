-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 3/4)
-- Stored Procedures, Triggers, Financial Transactions & Secure RPCs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECURE ORDER PLACEMENT RPC (Database-Verified Totals & Atomic Inventory)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_customer_order(
    p_store_id UUID,
    p_delivery_address TEXT,
    p_payment_method TEXT DEFAULT 'UPI',
    p_coupon_code TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer_id UUID;
    v_cart RECORD;
    v_item RECORD;
    v_product RECORD;
    v_subtotal NUMERIC(12,2) := 0.00;
    v_discount NUMERIC(12,2) := 0.00;
    v_tax NUMERIC(12,2) := 0.00;
    v_delivery_fee NUMERIC(12,2) := 0.00;
    v_total NUMERIC(12,2) := 0.00;
    v_order_id UUID;
    v_order_number TEXT;
    v_coupon RECORD;
    v_coupon_discount NUMERIC(12,2) := 0.00;
    v_store RECORD;
    v_invoice_id UUID;
BEGIN
    -- 1. Identify Authenticated Customer
    v_customer_id := public.current_customer_id();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: You must be logged in as a registered customer to place an order.';
    END IF;

    -- 2. Verify Store Status
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id AND is_active = true AND is_approved = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store is not active or accepting orders.';
    END IF;

    -- 3. Read Customer Cart
    SELECT * INTO v_cart FROM public.carts WHERE customer_id = v_customer_id AND store_id = p_store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart is empty.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart.id) THEN
        RAISE EXCEPTION 'Your cart contains no items.';
    END IF;

    -- 4. Calculate Subtotal & Tax from database products directly (Never trust frontend)
    FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart.id LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        
        IF NOT FOUND OR NOT v_product.is_active THEN
            RAISE EXCEPTION 'Product "%" is currently unavailable.', COALESCE(v_product.name, 'Unknown');
        END IF;

        IF v_product.store_id != p_store_id THEN
            RAISE EXCEPTION 'Cross-store product detected in cart.';
        END IF;

        IF v_product.track_stock AND v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product "%" (Available: %, Requested: %).',
                v_product.name, v_product.stock, v_item.quantity;
        END IF;

        v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
        IF v_product.tax > 0 THEN
            v_tax := v_tax + ROUND((v_product.price * v_item.quantity * (v_product.tax / 100.0)), 2);
        END IF;
    END LOOP;

    -- 5. Validate Coupon if provided
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon FROM public.coupons
        WHERE store_id = p_store_id
          AND UPPER(code) = UPPER(TRIM(p_coupon_code))
          AND is_active = true
          AND (start_at IS NULL OR start_at <= NOW())
          AND (expires_at IS NULL OR expires_at >= NOW())
          AND used_count < usage_limit;

        IF FOUND THEN
            IF v_subtotal >= v_coupon.minimum_order THEN
                IF v_coupon.discount_type = 'percentage' THEN
                    v_coupon_discount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
                    IF v_coupon.maximum_discount > 0 AND v_coupon_discount > v_coupon.maximum_discount THEN
                        v_coupon_discount := v_coupon.maximum_discount;
                    END IF;
                ELSE
                    v_coupon_discount := v_coupon.discount_value;
                END IF;
                v_discount := LEAST(v_coupon_discount, v_subtotal);
            END IF;
        END IF;
    END IF;

    -- 6. Delivery Fee calculation
    IF p_delivery_address IS NOT NULL AND TRIM(p_delivery_address) != '' THEN
        v_delivery_fee := 40.00; -- Standard base delivery fee
    END IF;

    v_total := GREATEST(0.00, v_subtotal + v_tax + v_delivery_fee - v_discount);

    -- 7. Create Order Record
    INSERT INTO public.orders (
        customer_id,
        store_id,
        status,
        subtotal,
        discount,
        tax,
        delivery_fee,
        total,
        delivery_address,
        payment_status,
        notes
    ) VALUES (
        v_customer_id,
        p_store_id,
        'pending',
        v_subtotal,
        v_discount,
        v_tax,
        v_delivery_fee,
        v_total,
        p_delivery_address,
        CASE WHEN UPPER(p_payment_method) = 'CASH' THEN 'pending'::public.payment_status ELSE 'pending'::public.payment_status END,
        p_notes
    ) RETURNING id, order_number INTO v_order_id, v_order_number;

    -- 8. Insert Order Items Snapshot & Reduce Inventory
    FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart.id LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;

        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            discount,
            tax,
            total_price
        ) VALUES (
            v_order_id,
            v_product.id,
            v_product.name,
            v_item.quantity,
            v_product.price,
            v_product.discount,
            v_product.tax,
            ROUND((v_product.price * v_item.quantity), 2)
        );

        -- Atomically reduce product stock & record inventory audit
        IF v_product.track_stock THEN
            UPDATE public.products
            SET stock = stock - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_product.id;

            INSERT INTO public.inventory_transactions (
                store_id,
                product_id,
                type,
                quantity,
                reference_id,
                notes,
                created_by
            ) VALUES (
                p_store_id,
                v_product.id,
                'sale',
                -v_item.quantity,
                v_order_number,
                'Order Placed',
                auth.uid()
            );
        END IF;
    END LOOP;

    -- 9. Record Coupon Usage
    IF v_coupon.id IS NOT NULL THEN
        UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;
        INSERT INTO public.coupon_usage (
            coupon_id,
            customer_id,
            order_id,
            discount_amount
        ) VALUES (
            v_coupon.id,
            v_customer_id,
            v_order_id,
            v_discount
        );
    END IF;

    -- 10. Automatically Create Corresponding Invoice
    INSERT INTO public.invoices (
        store_id,
        customer_id,
        order_id,
        subtotal,
        tax,
        discount,
        total,
        balance,
        status
    ) VALUES (
        p_store_id,
        v_customer_id,
        v_order_id,
        v_subtotal,
        v_tax,
        v_discount,
        v_total,
        v_total,
        'issued'
    ) RETURNING id INTO v_invoice_id;

    -- Copy line items into invoice
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    SELECT v_invoice_id, product_name, quantity, unit_price, total_price
    FROM public.order_items WHERE order_id = v_order_id;

    -- 11. Ensure Store-Customer relationship exists
    INSERT INTO public.store_customers (store_id, customer_id, added_via)
    VALUES (p_store_id, v_customer_id, 'ORDER')
    ON CONFLICT (store_id, customer_id) DO NOTHING;

    -- 12. Clear Cart
    DELETE FROM public.cart_items WHERE cart_id = v_cart.id;

    -- 13. Audit Log
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, metadata)
    VALUES (auth.uid(), 'PLACE_ORDER', 'orders', v_order_id::TEXT, jsonb_build_object('order_number', v_order_number, 'total', v_total));

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'subtotal', v_subtotal,
        'tax', v_tax,
        'discount', v_discount,
        'delivery_fee', v_delivery_fee,
        'invoice_id', v_invoice_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 2. LOYALTY POINTS AWARD ON DELIVERY (Anti-Duplicate, Rank Progression)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_order_points(p_order_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_rule RECORD;
    v_points INTEGER := 0;
    v_customer RECORD;
    v_new_points INTEGER;
    v_new_rank public.customer_rank;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order.status != 'delivered' THEN
        RAISE EXCEPTION 'Loyalty points can only be awarded on delivered orders.';
    END IF;

    IF v_order.customer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Guest order has no customer record.');
    END IF;

    -- Prevent duplicate point award for this order
    IF EXISTS (SELECT 1 FROM public.customer_points WHERE order_id = p_order_id AND reason = 'ORDER_DELIVERY') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Loyalty points already awarded for this order.');
    END IF;

    -- Fetch store loyalty rule
    SELECT * INTO v_rule FROM public.loyalty_rules WHERE store_id = v_order.store_id AND is_active = true;
    IF FOUND AND v_order.total >= v_rule.min_order_for_points THEN
        v_points := FLOOR((v_order.total / 100.0) * v_rule.points_per_100_currency);
    ELSE
        -- Fallback platform rule: ₹100 = 10 pts
        IF v_order.total >= 100.00 THEN
            v_points := FLOOR((v_order.total / 100.0) * 10);
        END IF;
    END IF;

    IF v_points > 0 THEN
        -- Record Point Ledger
        INSERT INTO public.customer_points (
            customer_id,
            store_id,
            points,
            reason,
            order_id
        ) VALUES (
            v_order.customer_id,
            v_order.store_id,
            v_points,
            'ORDER_DELIVERY',
            p_order_id
        );

        -- Update Customer Points Balance & Rank
        SELECT * INTO v_customer FROM public.customers WHERE id = v_order.customer_id;
        v_new_points := v_customer.points + v_points;

        IF v_new_points >= 10000 THEN
            v_new_rank := 'VIP';
        ELSIF v_new_points >= 5000 THEN
            v_new_rank := 'Platinum';
        ELSIF v_new_points >= 1500 THEN
            v_new_rank := 'Gold';
        ELSIF v_new_points >= 500 THEN
            v_new_rank := 'Silver';
        ELSE
            v_new_rank := 'Bronze';
        END IF;

        UPDATE public.customers
        SET points = v_new_points,
            rank = v_new_rank,
            total_orders = total_orders + 1,
            total_spent = total_spent + v_order.total,
            last_visit = NOW(),
            updated_at = NOW()
        WHERE id = v_order.customer_id;

        -- Create Notification for Customer
        IF v_customer.profile_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (
                v_customer.profile_id,
                'loyalty',
                'Points Earned!',
                'You earned ' || v_points || ' points for Order #' || v_order.order_number,
                jsonb_build_object('points', v_points, 'order_id', p_order_id, 'rank', v_new_rank)
            );
        END IF;

        RETURN jsonb_build_object('success', true, 'points_awarded', v_points, 'new_total', v_new_points, 'rank', v_new_rank);
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Order value did not meet threshold for points.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 3. STORE ORDER STATUS UPDATE RPC (Auto triggers loyalty on DELIVERED)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_store_order_status(
    p_order_id UUID,
    p_new_status public.order_status
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- Verify access
    IF NOT public.has_store_access(v_order.store_id, 'orders') THEN
        RAISE EXCEPTION 'Unauthorized: You do not have permission to manage orders for this store.';
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Trigger Loyalty if delivered
    IF p_new_status = 'delivered' THEN
        PERFORM public.add_order_points(p_order_id);
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, metadata)
    VALUES (auth.uid(), 'UPDATE_ORDER_STATUS', 'orders', p_order_id::TEXT, jsonb_build_object('new_status', p_new_status));

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 4. DELIVERY PARTNER WORKFLOW RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_delivery_orders()
RETURNS SETOF public.orders AS $$
BEGIN
    IF public.current_user_role() != 'delivery_partner' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only registered delivery partners can query available deliveries.';
    END IF;

    RETURN QUERY
    SELECT * FROM public.orders
    WHERE (delivery_partner_id = auth.uid() AND status IN ('assigned', 'picked_up', 'out_for_delivery'))
       OR (status = 'ready' AND delivery_partner_id IS NULL)
    ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.accept_delivery_order(p_order_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF public.current_user_role() != 'delivery_partner' THEN
        RAISE EXCEPTION 'Unauthorized: Only delivery partners can accept orders.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order.delivery_partner_id IS NOT NULL THEN
        RAISE EXCEPTION 'Order is already assigned to another delivery partner.';
    END IF;

    UPDATE public.orders
    SET delivery_partner_id = auth.uid(),
        status = 'assigned',
        updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO public.deliveries (order_id, delivery_partner_id, status, assigned_at)
    VALUES (p_order_id, auth.uid(), 'accepted', NOW())
    ON CONFLICT (order_id) DO UPDATE SET delivery_partner_id = auth.uid(), status = 'accepted';

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'assigned');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_delivery_status(
    p_order_id UUID,
    p_status TEXT, -- 'picked_up', 'out_for_delivery', 'delivered'
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order.delivery_partner_id != auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: You are not assigned to deliver this order.';
    END IF;

    -- Update order status
    UPDATE public.orders
    SET status = p_status::public.order_status,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Update delivery timestamps
    UPDATE public.deliveries
    SET status = p_status,
        picked_up_at = CASE WHEN p_status = 'picked_up' THEN NOW() ELSE picked_up_at END,
        delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE delivered_at END
    WHERE order_id = p_order_id;

    -- Record GPS location coordinate if provided
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        INSERT INTO public.delivery_tracking (order_id, delivery_partner_id, status, latitude, longitude)
        VALUES (p_order_id, auth.uid(), p_status, p_latitude, p_longitude);
    END IF;

    -- Trigger Loyalty if order marked delivered
    IF p_status = 'delivered' THEN
        PERFORM public.add_order_points(p_order_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', p_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 5. SECURE QR TOKEN RESOLUTION RPC (Returns only safe, sanitized data)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_qr_token(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
    v_qr RECORD;
    v_store RECORD;
    v_customer RECORD;
BEGIN
    -- Check QR Codes Table
    SELECT * INTO v_qr FROM public.qr_codes WHERE token = p_token AND is_active = true;
    IF FOUND THEN
        SELECT id, store_id, business_name, slug, logo_url, description, phone, email, address, city, state, pincode
        INTO v_store FROM public.stores WHERE id = v_qr.store_id;

        -- Record Scan Hit
        INSERT INTO public.qr_scans (qr_code_id, scanned_by)
        VALUES (v_qr.id, auth.uid());

        RETURN jsonb_build_object(
            'success', true,
            'qr_type', v_qr.qr_type,
            'label', v_qr.label,
            'store', row_to_json(v_store)
        );
    END IF;

    -- Check Customer QR Token
    SELECT id, customer_id, full_name, avatar_url, rank, points, is_premium
    INTO v_customer FROM public.customers WHERE qr_token = p_token;
    IF FOUND THEN
        -- Strictly safe public customer badge: never expose phone or private login_email
        RETURN jsonb_build_object(
            'success', true,
            'qr_type', 'customer_id',
            'customer', jsonb_build_object(
                'customer_id', v_customer.customer_id,
                'name', v_customer.full_name,
                'rank', v_customer.rank,
                'is_premium', v_customer.is_premium
            )
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive QR code.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 6. REWARD REDEMPTION RPC (Atomic Server-Verified Point Deduction)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_reward(p_reward_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_customer_id UUID;
    v_customer RECORD;
    v_reward RECORD;
    v_voucher_code TEXT;
    v_redemption_id UUID;
BEGIN
    v_customer_id := public.current_customer_id();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Only registered customers can redeem rewards.';
    END IF;

    SELECT * INTO v_reward FROM public.rewards WHERE id = p_reward_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reward not found or is no longer active.';
    END IF;

    SELECT * INTO v_customer FROM public.customers WHERE id = v_customer_id FOR UPDATE;
    IF v_customer.points < v_reward.points_required THEN
        RAISE EXCEPTION 'Insufficient points: You have % points, but % points are required.',
            v_customer.points, v_reward.points_required;
    END IF;

    -- Deduct points
    UPDATE public.customers
    SET points = points - v_reward.points_required,
        updated_at = NOW()
    WHERE id = v_customer_id;

    -- Record in customer points ledger
    INSERT INTO public.customer_points (customer_id, store_id, points, reason)
    VALUES (v_customer_id, v_reward.store_id, -v_reward.points_required, 'REWARD_REDEMPTION: ' || v_reward.name);

    -- Generate Voucher
    v_voucher_code := 'ZUP-REW-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8));
    INSERT INTO public.reward_redemptions (
        reward_id,
        customer_id,
        store_id,
        voucher_code,
        points_spent
    ) VALUES (
        p_reward_id,
        v_customer_id,
        v_reward.store_id,
        v_voucher_code,
        v_reward.points_required
    ) RETURNING id INTO v_redemption_id;

    RETURN jsonb_build_object(
        'success', true,
        'voucher_code', v_voucher_code,
        'points_spent', v_reward.points_required,
        'remaining_points', v_customer.points - v_reward.points_required
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 7. COUPON VALIDATION & APPLICATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_coupon(
    p_store_id UUID,
    p_code TEXT,
    p_cart_subtotal NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_coupon RECORD;
    v_discount NUMERIC(12,2) := 0.00;
BEGIN
    SELECT * INTO v_coupon FROM public.coupons
    WHERE store_id = p_store_id
      AND UPPER(code) = UPPER(TRIM(p_code))
      AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid coupon code for this store.');
    END IF;

    IF v_coupon.start_at IS NOT NULL AND v_coupon.start_at > NOW() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon is not yet active.');
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon has expired.');
    END IF;

    IF v_coupon.used_count >= v_coupon.usage_limit THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Coupon usage limit has been reached.');
    END IF;

    IF p_cart_subtotal < v_coupon.minimum_order THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Minimum order amount of ₹' || v_coupon.minimum_order || ' required.');
    END IF;

    IF v_coupon.discount_type = 'percentage' THEN
        v_discount := ROUND((p_cart_subtotal * (v_coupon.discount_value / 100.0)), 2);
        IF v_coupon.maximum_discount > 0 AND v_discount > v_coupon.maximum_discount THEN
            v_discount := v_coupon.maximum_discount;
        END IF;
    ELSE
        v_discount := v_coupon.discount_value;
    END IF;

    v_discount := LEAST(v_discount, p_cart_subtotal);

    RETURN jsonb_build_object(
        'valid', true,
        'code', v_coupon.code,
        'discount_amount', v_discount,
        'discount_type', v_coupon.discount_type,
        'discount_value', v_coupon.discount_value
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 8. BUSINESS DASHBOARD & ANALYTICS RPCS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_dashboard(p_store_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_today_sales NUMERIC(12,2) := 0.00;
    v_today_orders INTEGER := 0;
    v_total_customers INTEGER := 0;
    v_total_revenue NUMERIC(12,2) := 0.00;
    v_pending_orders_count INTEGER := 0;
    v_low_stock_count INTEGER := 0;
BEGIN
    IF NOT public.has_store_access(p_store_id, 'dashboard') THEN
        RAISE EXCEPTION 'Unauthorized: You do not have access to this store dashboard.';
    END IF;

    -- Today sales
    SELECT COALESCE(SUM(total), 0.00), COUNT(*)
    INTO v_today_sales, v_today_orders
    FROM public.orders
    WHERE store_id = p_store_id
      AND status != 'cancelled'
      AND created_at >= CURRENT_DATE;

    -- Total customers
    SELECT COUNT(*) INTO v_total_customers
    FROM public.store_customers
    WHERE store_id = p_store_id;

    -- Total revenue
    SELECT COALESCE(SUM(total), 0.00) INTO v_total_revenue
    FROM public.orders
    WHERE store_id = p_store_id AND status != 'cancelled';

    -- Pending orders count
    SELECT COUNT(*) INTO v_pending_orders_count
    FROM public.orders
    WHERE store_id = p_store_id AND status IN ('pending', 'confirmed', 'preparing');

    -- Low stock items
    SELECT COUNT(*) INTO v_low_stock_count
    FROM public.products
    WHERE store_id = p_store_id AND track_stock = true AND stock <= 10;

    RETURN jsonb_build_object(
        'today_sales', v_today_sales,
        'today_orders', v_today_orders,
        'total_customers', v_total_customers,
        'total_revenue', v_total_revenue,
        'pending_orders', v_pending_orders_count,
        'low_stock_items', v_low_stock_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_business_analytics(p_store_id UUID, p_timeframe TEXT DEFAULT '30days')
RETURNS JSONB AS $$
DECLARE
    v_since_date TIMESTAMPTZ;
    v_revenue NUMERIC(12,2) := 0.00;
    v_orders INTEGER := 0;
    v_expenses NUMERIC(12,2) := 0.00;
    v_top_products JSONB;
BEGIN
    IF NOT public.has_store_access(p_store_id, 'reports') THEN
        RAISE EXCEPTION 'Unauthorized: Permission denied for reports & analytics.';
    END IF;

    IF p_timeframe = 'today' THEN
        v_since_date := CURRENT_DATE;
    ELSIF p_timeframe = '7days' THEN
        v_since_date := NOW() - INTERVAL '7 days';
    ELSIF p_timeframe = 'this_month' THEN
        v_since_date := DATE_TRUNC('month', CURRENT_DATE);
    ELSE
        v_since_date := NOW() - INTERVAL '30 days';
    END IF;

    SELECT COALESCE(SUM(total), 0.00), COUNT(*)
    INTO v_revenue, v_orders
    FROM public.orders
    WHERE store_id = p_store_id AND status != 'cancelled' AND created_at >= v_since_date;

    SELECT COALESCE(SUM(amount), 0.00) INTO v_expenses
    FROM public.expenses
    WHERE store_id = p_store_id AND expense_date >= v_since_date::DATE;

    -- Top 5 products
    SELECT json_agg(t) INTO v_top_products FROM (
        SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.total_price) as revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE o.store_id = p_store_id AND o.status != 'cancelled' AND o.created_at >= v_since_date
        GROUP BY oi.product_name
        ORDER BY total_sold DESC
        LIMIT 5
    ) t;

    RETURN jsonb_build_object(
        'timeframe', p_timeframe,
        'revenue', v_revenue,
        'orders_count', v_orders,
        'expenses', v_expenses,
        'net_profit', v_revenue - v_expenses,
        'top_products', COALESCE(v_top_products, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------------------------------
-- 9. NOTIFICATION MANAGEMENT RPCS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_notifications()
RETURNS SETOF public.notifications AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.notifications
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
