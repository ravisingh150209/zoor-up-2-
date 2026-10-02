-- ============================================================================
-- ZOORUP - MULTI-BUSINESS SAAS PLATFORM
-- COMPLETE PRODUCTION POSTGRESQL & SUPABASE MASTER SCHEMA
-- ============================================================================

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('admin', 'store_owner', 'store_staff', 'customer', 'delivery_partner');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.inventory_tx_type AS ENUM ('purchase', 'sale', 'manual_adjustment', 'damaged', 'returned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.customer_rank AS ENUM ('Bronze', 'Silver', 'Gold', 'Platinum', 'VIP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.qr_type AS ENUM ('store_profile', 'digital_menu', 'catalogue', 'loyalty_checkin', 'customer_id', 'table');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.coupon_discount_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'canceled', 'incomplete', 'trialing');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- SEQUENCES
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.seq_store_id START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_customer_id START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_order_number START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_invoice_number START WITH 1;

-- ----------------------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------------------

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    role public.user_role NOT NULL DEFAULT 'customer',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Business Categories
CREATE TABLE IF NOT EXISTS public.business_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Subscription Plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_monthly NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    max_customers INTEGER NOT NULL DEFAULT 50,
    max_products INTEGER NOT NULL DEFAULT 20,
    max_staff INTEGER NOT NULL DEFAULT 1,
    analytics_enabled BOOLEAN NOT NULL DEFAULT false,
    inventory_enabled BOOLEAN NOT NULL DEFAULT false,
    loyalty_enabled BOOLEAN NOT NULL DEFAULT false,
    chat_enabled BOOLEAN NOT NULL DEFAULT false,
    advanced_reports BOOLEAN NOT NULL DEFAULT false,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Stores
CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT UNIQUE NOT NULL DEFAULT ('ZUP-STORE-' || LPAD(nextval('public.seq_store_id')::TEXT, 4, '0')),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    business_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    business_category_id UUID REFERENCES public.business_categories(id) ON DELETE SET NULL,
    logo_url TEXT,
    cover_url TEXT,
    description TEXT,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_approved BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Store Staff
CREATE TABLE IF NOT EXISTS public.store_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'Staff Member',
    permissions JSONB NOT NULL DEFAULT '["dashboard", "orders", "billing"]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_staff UNIQUE (store_id, profile_id)
);

-- 6. Customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id TEXT UNIQUE NOT NULL DEFAULT ('ZUP-CUS-' || LPAD(nextval('public.seq_customer_id')::TEXT, 6, '0')),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    avatar_url TEXT,
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    rank public.customer_rank NOT NULL DEFAULT 'Bronze',
    is_premium BOOLEAN NOT NULL DEFAULT false,
    login_email TEXT,
    qr_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Store Customers
CREATE TABLE IF NOT EXISTS public.store_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    added_via TEXT NOT NULL DEFAULT 'QR_SCAN',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_customer UNIQUE (store_id, customer_id)
);

-- 8. Product Categories
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_category_slug UNIQUE (store_id, slug)
);

-- 9. Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    sku TEXT,
    barcode TEXT,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    tax NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
    image_url TEXT,
    stock INTEGER NOT NULL DEFAULT 0,
    track_stock BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Services
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Carts & Cart Items
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_store_cart UNIQUE (customer_id, store_id)
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cart_product UNIQUE (cart_id, product_id)
);

-- 12. Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL DEFAULT ('ZUP-ORD-' || LPAD(nextval('public.seq_order_number')::TEXT, 6, '0')),
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    delivery_partner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status public.order_status NOT NULL DEFAULT 'pending',
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
    delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    delivery_address TEXT,
    payment_status public.payment_status NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
    total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_method TEXT NOT NULL DEFAULT 'RAZORPAY',
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT UNIQUE,
    razorpay_signature TEXT,
    status public.payment_status NOT NULL DEFAULT 'pending',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Invoices & Invoice Items
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT UNIQUE NOT NULL DEFAULT ('INV-' || LPAD(nextval('public.seq_invoice_number')::TEXT, 6, '0')),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status public.invoice_status NOT NULL DEFAULT 'issued',
    due_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Inventory & Transactions
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 10,
    reorder_quantity INTEGER NOT NULL DEFAULT 50,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_product_inventory UNIQUE (store_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    type public.inventory_tx_type NOT NULL,
    quantity INTEGER NOT NULL,
    reference_id TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Expenses & Categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_expense_category UNIQUE (store_id, name)
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    receipt_url TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Suppliers & Products
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_products (
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (supplier_id, product_id)
);

-- 19. Deliveries & Tracking
CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID UNIQUE NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    delivery_partner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'assigned',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.delivery_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    delivery_partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Loyalty Rules & Points
CREATE TABLE IF NOT EXISTS public.loyalty_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    points_per_100_currency INTEGER NOT NULL DEFAULT 10 CHECK (points_per_100_currency >= 0),
    min_order_for_points NUMERIC(12,2) NOT NULL DEFAULT 100.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_loyalty_rule UNIQUE (store_id)
);

CREATE TABLE IF NOT EXISTS public.customer_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_order_point_award UNIQUE (order_id, reason)
);

-- 21. Rewards & Redemptions
CREATE TABLE IF NOT EXISTS public.rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    points_required INTEGER NOT NULL CHECK (points_required > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    voucher_code TEXT UNIQUE NOT NULL DEFAULT ('ZUP-REW-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8))),
    points_spent INTEGER NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT false,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. Coupons & Usage
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    discount_type public.coupon_discount_type NOT NULL DEFAULT 'percentage',
    discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
    minimum_order NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    maximum_discount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    usage_limit INTEGER NOT NULL DEFAULT 100,
    used_count INTEGER NOT NULL DEFAULT 0,
    start_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_coupon_code UNIQUE (store_id, code)
);

CREATE TABLE IF NOT EXISTS public.coupon_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    discount_amount NUMERIC(12,2) NOT NULL CHECK (discount_amount >= 0),
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_coupon_order_usage UNIQUE (coupon_id, order_id)
);

-- 23. Conversations & Messages
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_customer_convo UNIQUE (store_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    attachment_url TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. Subscriptions & Usage
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID UNIQUE NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
    status public.subscription_status NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    razorpay_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscription_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID UNIQUE NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customers_count INTEGER NOT NULL DEFAULT 0,
    products_count INTEGER NOT NULL DEFAULT 0,
    staff_count INTEGER NOT NULL DEFAULT 0,
    orders_count INTEGER NOT NULL DEFAULT 0,
    storage_mb NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. Business Settings, Hours & Social
CREATE TABLE IF NOT EXISTS public.business_settings (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'INR',
    tax_number TEXT,
    gst_number TEXT,
    invoice_prefix TEXT NOT NULL DEFAULT 'INV',
    auto_confirm_orders BOOLEAN NOT NULL DEFAULT false,
    delivery_radius_km NUMERIC(6,2) NOT NULL DEFAULT 10.0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.business_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME NOT NULL DEFAULT '09:00:00',
    close_time TIME NOT NULL DEFAULT '21:00:00',
    is_closed BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT uq_store_day_hours UNIQUE (store_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.business_social_links (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    website TEXT,
    instagram TEXT,
    facebook TEXT,
    whatsapp TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. QR Codes & Scans
CREATE TABLE IF NOT EXISTS public.qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    qr_type public.qr_type NOT NULL DEFAULT 'digital_menu',
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(20), 'hex'),
    label TEXT NOT NULL DEFAULT 'Main Digital QR',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qr_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id UUID NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
    scanned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ip_address TEXT,
    user_agent TEXT,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. Platform Settings
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- RLS FUNCTIONS & POLICIES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_store_owner(p_store_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_store_staff(p_store_id UUID, p_permission TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.store_staff
        WHERE store_id = p_store_id
          AND profile_id = auth.uid()
          AND is_active = true
          AND (p_permission IS NULL OR permissions ? p_permission)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id UUID, p_permission TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
    SELECT public.is_admin()
        OR public.is_store_owner(p_store_id)
        OR public.is_store_staff(p_store_id, p_permission);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS UUID AS $$
    SELECT id FROM public.customers
    WHERE auth_user_id = auth.uid() OR profile_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Profiles access" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "Profiles update" ON public.profiles FOR UPDATE USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "Categories view" ON public.business_categories FOR SELECT USING (true);
CREATE POLICY "Plans view" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "Stores view public" ON public.stores FOR SELECT USING (is_active = true AND is_approved = true);
CREATE POLICY "Stores manage owner" ON public.stores FOR ALL USING (owner_id = auth.uid() OR public.is_admin());
CREATE POLICY "Staff manage" ON public.store_staff FOR ALL USING (public.is_store_owner(store_id) OR public.is_admin());
CREATE POLICY "Customers view" ON public.customers FOR SELECT USING (auth_user_id = auth.uid() OR profile_id = auth.uid() OR public.is_admin());
CREATE POLICY "Customers update" ON public.customers FOR UPDATE USING (auth_user_id = auth.uid() OR profile_id = auth.uid());
CREATE POLICY "Products view public" ON public.products FOR SELECT USING (is_active = true OR public.has_store_access(store_id, 'products'));
CREATE POLICY "Products manage" ON public.products FOR ALL USING (public.has_store_access(store_id, 'products'));
CREATE POLICY "Services view public" ON public.services FOR SELECT USING (is_active = true OR public.has_store_access(store_id, 'services'));
CREATE POLICY "Services manage" ON public.services FOR ALL USING (public.has_store_access(store_id, 'services'));
CREATE POLICY "Orders customer view" ON public.orders FOR SELECT USING (customer_id = public.current_customer_id());
CREATE POLICY "Orders store manage" ON public.orders FOR ALL USING (public.has_store_access(store_id, 'orders'));
CREATE POLICY "Order items view" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (o.customer_id = public.current_customer_id() OR public.has_store_access(o.store_id, 'orders') OR o.delivery_partner_id = auth.uid())));
CREATE POLICY "Invoices manage" ON public.invoices FOR ALL USING (public.has_store_access(store_id, 'billing'));
CREATE POLICY "Inventory manage" ON public.inventory FOR ALL USING (public.has_store_access(store_id, 'inventory'));
CREATE POLICY "Expenses manage" ON public.expenses FOR ALL USING (public.has_store_access(store_id, 'expenses'));
CREATE POLICY "Notifications own" ON public.notifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Settings public view" ON public.platform_settings FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- RPCs & BUSINESS LOGIC
-- ----------------------------------------------------------------------------

-- Award Loyalty Points
CREATE OR REPLACE FUNCTION public.add_order_points(p_order_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_points INTEGER := 0;
    v_customer RECORD;
    v_new_points INTEGER;
    v_new_rank public.customer_rank;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND OR v_order.status != 'delivered' OR v_order.customer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ineligible order.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.customer_points WHERE order_id = p_order_id AND reason = 'ORDER_DELIVERY') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Points already awarded.');
    END IF;

    v_points := FLOOR((v_order.total / 100.0) * 10);
    IF v_points > 0 THEN
        INSERT INTO public.customer_points (customer_id, store_id, points, reason, order_id)
        VALUES (v_order.customer_id, v_order.store_id, v_points, 'ORDER_DELIVERY', p_order_id);

        SELECT * INTO v_customer FROM public.customers WHERE id = v_order.customer_id;
        v_new_points := v_customer.points + v_points;

        IF v_new_points >= 10000 THEN v_new_rank := 'VIP';
        ELSIF v_new_points >= 5000 THEN v_new_rank := 'Platinum';
        ELSIF v_new_points >= 1500 THEN v_new_rank := 'Gold';
        ELSIF v_new_points >= 500 THEN v_new_rank := 'Silver';
        ELSE v_new_rank := 'Bronze'; END IF;

        UPDATE public.customers
        SET points = v_new_points, rank = v_new_rank, total_orders = total_orders + 1, total_spent = total_spent + v_order.total, last_visit = NOW()
        WHERE id = v_order.customer_id;

        RETURN jsonb_build_object('success', true, 'points_awarded', v_points, 'new_total', v_new_points, 'rank', v_new_rank);
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Threshold not met.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Place Customer Order
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
    v_tax NUMERIC(12,2) := 0.00;
    v_delivery_fee NUMERIC(12,2) := 0.00;
    v_total NUMERIC(12,2) := 0.00;
    v_order_id UUID;
    v_order_number TEXT;
BEGIN
    v_customer_id := public.current_customer_id();
    IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Customer not authenticated.'; END IF;

    SELECT * INTO v_cart FROM public.carts WHERE customer_id = v_customer_id AND store_id = p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cart empty.'; END IF;

    FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart.id LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        IF v_product.track_stock AND v_product.stock < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_product.name;
        END IF;
        v_subtotal := v_subtotal + (v_product.price * v_item.quantity);
        IF v_product.tax > 0 THEN v_tax := v_tax + ROUND((v_product.price * v_item.quantity * (v_product.tax / 100.0)), 2); END IF;
    END LOOP;

    IF p_delivery_address IS NOT NULL AND TRIM(p_delivery_address) != '' THEN v_delivery_fee := 40.00; END IF;
    v_total := v_subtotal + v_tax + v_delivery_fee;

    INSERT INTO public.orders (customer_id, store_id, status, subtotal, tax, delivery_fee, total, delivery_address, payment_status, notes)
    VALUES (v_customer_id, p_store_id, 'pending', v_subtotal, v_tax, v_delivery_fee, v_total, p_delivery_address, 'pending', p_notes)
    RETURNING id, order_number INTO v_order_id, v_order_number;

    FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart.id LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, tax, total_price)
        VALUES (v_order_id, v_product.id, v_product.name, v_item.quantity, v_product.price, v_product.tax, ROUND(v_product.price * v_item.quantity, 2));

        IF v_product.track_stock THEN
            UPDATE public.products SET stock = stock - v_item.quantity WHERE id = v_product.id;
        END IF;
    END LOOP;

    DELETE FROM public.cart_items WHERE cart_id = v_cart.id;

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'order_number', v_order_number, 'total', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Resolve QR Token
CREATE OR REPLACE FUNCTION public.resolve_qr_token(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
    v_qr RECORD;
    v_store RECORD;
    v_customer RECORD;
BEGIN
    SELECT * INTO v_qr FROM public.qr_codes WHERE token = p_token AND is_active = true;
    IF FOUND THEN
        SELECT id, store_id, business_name, slug, logo_url, description, phone, email, address, city, state, pincode
        INTO v_store FROM public.stores WHERE id = v_qr.store_id;

        INSERT INTO public.qr_scans (qr_code_id, scanned_by) VALUES (v_qr.id, auth.uid());
        RETURN jsonb_build_object('success', true, 'qr_type', v_qr.qr_type, 'label', v_qr.label, 'store', row_to_json(v_store));
    END IF;

    SELECT customer_id, full_name, rank, is_premium INTO v_customer FROM public.customers WHERE qr_token = p_token;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'qr_type', 'customer_id', 'customer', row_to_json(v_customer));
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Invalid QR code.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
