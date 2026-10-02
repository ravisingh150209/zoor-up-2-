-- ============================================================================
-- ZOORUP SAAS PLATFORM - 30-DAY FREE TRIAL SYSTEM (MIGRATION 8)
-- Server-side authoritative trial timer, status machine, and feature checks
-- ============================================================================

-- 1. Ensure Standard Subscription Plans Exist
INSERT INTO public.subscription_plans (
    id, name, price_monthly, max_customers, max_products, max_staff, 
    analytics_enabled, inventory_enabled, loyalty_enabled, chat_enabled, advanced_reports, features
) VALUES 
    ('FREE', 'Free Starter', 0.00, 50, 20, 1, false, false, false, false, false, '["Digital QR Menu", "Basic Billing", "Up to 50 Customers"]'::jsonb),
    ('STARTER', 'Starter Tier', 299.00, 250, 100, 3, true, false, true, false, false, '["Loyalty System", "Coupon Management", "Up to 250 Customers", "Basic Analytics"]'::jsonb),
    ('GROWTH', 'Growth Tier', 799.00, 1000, 500, 10, true, true, true, true, true, '["Inventory Tracking", "Realtime Chat", "Delivery Management", "Expense Tracking", "Advanced Analytics"]'::jsonb),
    ('PRO', 'Professional Business', 1499.00, 10000, 5000, 50, true, true, true, true, true, '["Unlimited Scalability", "Dedicated Support", "Priority Realtime", "Custom Domain", "Full Audit Logs", "API Access"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price_monthly = EXCLUDED.price_monthly,
    features = EXCLUDED.features;

-- 2. Extend Subscriptions Table with Authoritative Trial Attributes
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'TRIAL',
    ADD COLUMN IF NOT EXISTS trial_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'FREE',
    ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS last_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ends ON public.subscriptions(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(subscription_status, trial_status);

-- 3. Stored Procedure: get_store_subscription (Server Time Authoritative)
CREATE OR REPLACE FUNCTION public.get_store_subscription(p_store_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_is_expired BOOLEAN := false;
    v_days_left INT := 0;
    v_trial_active BOOLEAN := false;
    v_can_access BOOLEAN := false;
BEGIN
    SELECT * INTO v_sub FROM public.subscriptions WHERE store_id = p_store_id;
    
    -- If no subscription record found, auto-create a default Free subscription
    IF NOT FOUND THEN
        INSERT INTO public.subscriptions (
            store_id, plan_id, subscription_status, trial_status, payment_status, created_at, updated_at
        ) VALUES (
            p_store_id, 'FREE', 'ACTIVE', 'NOT_APPLICABLE', 'FREE', v_now, v_now
        ) RETURNING * INTO v_sub;
    END IF;

    -- Fetch Plan Metadata
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;
    IF NOT FOUND THEN
        SELECT * INTO v_plan FROM public.subscription_plans WHERE id = 'FREE';
    END IF;

    -- Evaluate Trial Expiration against authoritative database server clock
    IF v_sub.trial_status = 'ACTIVE' AND v_sub.trial_ends_at IS NOT NULL THEN
        IF v_now >= v_sub.trial_ends_at THEN
            v_is_expired := true;
            -- Update database state to EXPIRED
            UPDATE public.subscriptions
            SET subscription_status = 'EXPIRED',
                trial_status = 'EXPIRED',
                payment_status = 'UNPAID',
                updated_at = v_now
            WHERE id = v_sub.id
            RETURNING * INTO v_sub;
        ELSE
            -- Trial is still ongoing
            v_days_left := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_sub.trial_ends_at - v_now)) / 86400.0))::INT;
            v_trial_active := true;
        END IF;
    ELSIF v_sub.trial_status = 'EXPIRED' OR v_sub.subscription_status = 'EXPIRED' THEN
        v_is_expired := true;
        v_days_left := 0;
    END IF;

    -- Authorize Premium Features:
    -- Allowed if: Paid ACTIVE subscription OR Active Trial
    IF v_sub.subscription_status = 'ACTIVE' THEN
        v_can_access := true;
    ELSIF v_sub.subscription_status = 'TRIAL' AND v_sub.trial_status = 'ACTIVE' AND NOT v_is_expired THEN
        v_can_access := true;
    ELSE
        -- FREE plan allows free features only, EXPIRED denies premium
        v_can_access := (v_sub.plan_id = 'FREE');
    END IF;

    RETURN jsonb_build_object(
        'store_id', p_store_id,
        'plan', v_sub.plan_id,
        'status', v_sub.subscription_status,
        'subscription_status', v_sub.subscription_status,
        'trial_status', v_sub.trial_status,
        'trial_active', v_trial_active,
        'trial_days_remaining', v_days_left,
        'trial_started_at', v_sub.trial_started_at,
        'trial_ends_at', v_sub.trial_ends_at,
        'trial_used', v_sub.trial_used,
        'payment_status', v_sub.payment_status,
        'can_access_premium', v_can_access,
        'server_time', v_now,
        'plan_details', jsonb_build_object(
            'id', v_plan.id,
            'name', v_plan.name,
            'price', v_plan.price_monthly,
            'max_customers', v_plan.max_customers,
            'max_products', v_plan.max_products,
            'max_staff', v_plan.max_staff,
            'features', v_plan.features
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Stored Procedure: start_or_upgrade_trial (Anti-Abuse & Single Trial Guarantee)
CREATE OR REPLACE FUNCTION public.start_or_upgrade_trial(
    p_store_id UUID,
    p_plan_id TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_sub RECORD;
    v_target_plan TEXT := UPPER(TRIM(p_plan_id));
    v_now TIMESTAMPTZ := NOW();
    v_trial_end TIMESTAMPTZ := v_now + INTERVAL '30 days';
BEGIN
    -- Verify plan exists
    IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = v_target_plan) THEN
        RAISE EXCEPTION 'Invalid subscription plan: %', v_target_plan;
    END IF;

    SELECT * INTO v_sub FROM public.subscriptions WHERE store_id = p_store_id FOR UPDATE;

    IF v_target_plan = 'FREE' THEN
        -- If choosing FREE, no trial needed
        IF NOT FOUND THEN
            INSERT INTO public.subscriptions (
                store_id, plan_id, subscription_status, trial_status, payment_status, created_at, updated_at
            ) VALUES (
                p_store_id, 'FREE', 'ACTIVE', 'NOT_APPLICABLE', 'FREE', v_now, v_now
            );
        ELSE
            UPDATE public.subscriptions
            SET plan_id = 'FREE',
                subscription_status = 'ACTIVE',
                payment_status = 'FREE',
                updated_at = v_now
            WHERE id = v_sub.id;
        END IF;

        RETURN jsonb_build_object('success', true, 'message', 'Switched to Free plan', 'plan', 'FREE');
    END IF;

    -- Paid Plan: STARTER, GROWTH, PRO, BASIC, PREMIUM
    IF NOT FOUND THEN
        -- Brand new subscription: grant 30-day trial with ₹0 charged
        INSERT INTO public.subscriptions (
            store_id, plan_id, subscription_status, trial_status, trial_started_at, trial_ends_at,
            trial_used, payment_status, subscription_started_at, subscription_ends_at, created_at, updated_at
        ) VALUES (
            p_store_id, v_target_plan, 'TRIAL', 'ACTIVE', v_now, v_trial_end,
            true, 'TRIAL', v_now, v_trial_end, v_now, v_now
        );

        RETURN jsonb_build_object(
            'success', true,
            'message', '30-day Free Trial started successfully',
            'plan', v_target_plan,
            'trial_ends_at', v_trial_end,
            'days_remaining', 30
        );
    END IF;

    -- Existing Subscription: Check trial abuse protection (Rule 13 & Rule 23)
    IF v_sub.trial_used IS TRUE THEN
        -- If trial is currently active (now < trial_ends_at), allow plan change WITHOUT resetting trial date!
        IF v_sub.trial_status = 'ACTIVE' AND v_now < v_sub.trial_ends_at THEN
            UPDATE public.subscriptions
            SET plan_id = v_target_plan,
                updated_at = v_now
            WHERE id = v_sub.id;

            RETURN jsonb_build_object(
                'success', true,
                'message', 'Plan updated within active trial period',
                'plan', v_target_plan,
                'trial_ends_at', v_sub.trial_ends_at,
                'days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_sub.trial_ends_at - v_now)) / 86400.0))::INT
            );
        ELSE
            -- Trial has already expired. Do NOT restart trial!
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Free trial has already been used for this business account. Payment required to subscribe.',
                'requires_payment', true,
                'plan', v_target_plan
            );
        END IF;
    ELSE
        -- Store previously was on FREE and never used their trial yet:
        UPDATE public.subscriptions
        SET plan_id = v_target_plan,
            subscription_status = 'TRIAL',
            trial_status = 'ACTIVE',
            trial_started_at = v_now,
            trial_ends_at = v_trial_end,
            trial_used = true,
            payment_status = 'TRIAL',
            subscription_started_at = v_now,
            subscription_ends_at = v_trial_end,
            updated_at = v_now
        WHERE id = v_sub.id;

        RETURN jsonb_build_object(
            'success', true,
            'message', '30-day Free Trial activated',
            'plan', v_target_plan,
            'trial_ends_at', v_trial_end,
            'days_remaining', 30
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Stored Procedure: check_store_feature_access
CREATE OR REPLACE FUNCTION public.check_store_feature_access(
    p_store_id UUID,
    p_feature_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_sub_info JSONB;
BEGIN
    v_sub_info := public.get_store_subscription(p_store_id);
    IF (v_sub_info->>'can_access_premium')::boolean IS TRUE THEN
        RETURN true;
    END IF;

    -- If not premium, only allow core free features
    IF p_feature_name IN ('basic_menu', 'orders', 'basic_billing') THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
