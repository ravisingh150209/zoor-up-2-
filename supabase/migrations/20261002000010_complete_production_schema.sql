-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 10)
-- Complete Production PostgreSQL Schema for all Backend Collections
-- ============================================================================

-- 1. USERS & AUTH IDENTITY MAPPING
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT UNIQUE,
    phone TEXT,
    password_hash TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'CUSTOMER',
    business_id TEXT,
    customer_id TEXT,
    provider_user_id TEXT,
    permissions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_provider ON public.users(provider_user_id);
CREATE INDEX IF NOT EXISTS idx_users_business ON public.users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_customer ON public.users(customer_id);

-- 2. BUSINESSES (Master Business Table)
CREATE TABLE IF NOT EXISTS public.businesses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    slug TEXT UNIQUE,
    category TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    cover_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON public.businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses(slug);

-- 3. CUSTOMER-BUSINESS RELATIONSHIPS (Multi-tenant Isolation)
CREATE TABLE IF NOT EXISTS public.customer_businesses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    customer_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_customer_business UNIQUE (customer_id, business_id)
);
CREATE INDEX IF NOT EXISTS idx_cb_customer_id ON public.customer_businesses(customer_id);
CREATE INDEX IF NOT EXISTS idx_cb_business_id ON public.customer_businesses(business_id);

-- 4. LOYALTY (Per customer + business point/stamp balances)
CREATE TABLE IF NOT EXISTS public.loyalty (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    customer_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    points NUMERIC(12,2) DEFAULT 0,
    stamps INTEGER DEFAULT 0,
    total_spent NUMERIC(12,2) DEFAULT 0,
    tier TEXT DEFAULT 'Bronze',
    visit_count INTEGER DEFAULT 0,
    last_visit TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_loyalty_customer_business UNIQUE (customer_id, business_id)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON public.loyalty(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_business ON public.loyalty(business_id);

-- 5. LOYALTY TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    customer_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    stamps INTEGER DEFAULT 0,
    balance_after NUMERIC(12,2) DEFAULT 0,
    description TEXT,
    reference_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lt_customer_business ON public.loyalty_transactions(customer_id, business_id);
CREATE INDEX IF NOT EXISTS idx_lt_reference ON public.loyalty_transactions(reference_id);

-- 6. LOYALTY SETTINGS
CREATE TABLE IF NOT EXISTS public.loyalty_settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    business_id TEXT NOT NULL UNIQUE,
    program_type TEXT DEFAULT 'points',
    points_per_currency NUMERIC(10,2) DEFAULT 1.0,
    points_redeem_rate NUMERIC(10,2) DEFAULT 0.1,
    stamp_threshold INTEGER DEFAULT 10,
    reward_description TEXT DEFAULT 'Free Reward on 10 stamps',
    minimum_order_amount NUMERIC(10,2) DEFAULT 0,
    tier_thresholds JSONB DEFAULT '{"Silver": 100, "Gold": 500, "Platinum": 1000}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_settings_biz ON public.loyalty_settings(business_id);

-- 7. VISITS
CREATE TABLE IF NOT EXISTS public.visits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    customer_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'qr_scan',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visits_biz_cust ON public.visits(business_id, customer_id, timestamp DESC);

-- 8. VOUCHERS / OFFERS
CREATE TABLE IF NOT EXISTS public.vouchers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    voucher_id TEXT,
    business_id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    discount_type TEXT DEFAULT 'percentage',
    discount_value NUMERIC(10,2) DEFAULT 0,
    min_spend NUMERIC(10,2) DEFAULT 0,
    max_discount NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    usage_limit INTEGER DEFAULT 100,
    total_claimed INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vouchers_biz ON public.vouchers(business_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON public.vouchers(code);

-- 9. CUSTOMER VOUCHERS
CREATE TABLE IF NOT EXISTS public.customer_vouchers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    customer_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    voucher_id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT,
    discount_type TEXT DEFAULT 'percentage',
    discount_value NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_cust ON public.customer_vouchers(customer_id);
CREATE INDEX IF NOT EXISTS idx_cv_biz ON public.customer_vouchers(business_id);
CREATE INDEX IF NOT EXISTS idx_cv_voucher ON public.customer_vouchers(voucher_id);

-- 10. BUSINESS INVITES (QR Connect & Join)
CREATE TABLE IF NOT EXISTS public.business_invites (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token TEXT NOT NULL UNIQUE,
    business_id TEXT NOT NULL,
    type TEXT DEFAULT 'qr_connect',
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    scan_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.business_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_biz ON public.business_invites(business_id);

-- 11. OTP CODES
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    phone TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON public.otp_codes(phone);

-- 12. TABLES (Restaurant / Service Seating)
CREATE TABLE IF NOT EXISTS public.tables (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    business_id TEXT NOT NULL,
    table_number TEXT NOT NULL,
    capacity INTEGER DEFAULT 4,
    section TEXT DEFAULT 'Main Hall',
    status TEXT DEFAULT 'available',
    qr_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_business_table UNIQUE (business_id, table_number)
);
CREATE INDEX IF NOT EXISTS idx_tables_biz ON public.tables(business_id);

-- 13. TABLE SETTINGS
CREATE TABLE IF NOT EXISTS public.table_settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    business_id TEXT NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT true,
    opening_time TEXT DEFAULT '09:00',
    closing_time TEXT DEFAULT '22:00',
    slot_duration_minutes INTEGER DEFAULT 60,
    max_advance_days INTEGER DEFAULT 7,
    auto_confirm BOOLEAN DEFAULT true,
    min_guests INTEGER DEFAULT 1,
    max_guests INTEGER DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_table_settings_biz ON public.table_settings(business_id);

-- 14. TABLE BOOKINGS & RESERVATIONS
CREATE TABLE IF NOT EXISTS public.table_bookings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    business_id TEXT NOT NULL,
    customer_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    table_id TEXT,
    table_number TEXT,
    booking_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    guests INTEGER DEFAULT 2,
    status TEXT DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tb_biz_date ON public.table_bookings(business_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_tb_cust ON public.table_bookings(customer_id);

-- Alias view for table_reservations pointing to table_bookings
CREATE OR REPLACE VIEW public.table_reservations AS SELECT * FROM public.table_bookings;

-- 15. NOTIFICATION PREFERENCES
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL UNIQUE,
    push_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT true,
    order_updates BOOLEAN DEFAULT true,
    promotions BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON public.notification_preferences(user_id);

-- 16. PUSH TOKENS
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    device_type TEXT DEFAULT 'web',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

-- 17. REMINDERS
CREATE TABLE IF NOT EXISTS public.reminders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    business_id TEXT NOT NULL,
    customer_id TEXT,
    type TEXT DEFAULT 'booking',
    message TEXT,
    remind_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_biz ON public.reminders(business_id);

-- 18. UPLOAD ASSETS
CREATE TABLE IF NOT EXISTS public.upload_assets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT,
    business_id TEXT,
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    size_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_user ON public.upload_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_biz ON public.upload_assets(business_id);

-- 19. ENHANCE EXISTING TABLES WITH BACKEND COMPATIBILITY COLUMNS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS business_id TEXT;
CREATE INDEX IF NOT EXISTS idx_products_biz ON public.products(business_id);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_biz ON public.orders(business_id);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PAID';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'UPI';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'DINE_IN';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS table_id TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_invoices_biz ON public.invoices(business_id);

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Other';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt TEXT;
CREATE INDEX IF NOT EXISTS idx_expenses_biz ON public.expenses(business_id);

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS products TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS outstanding_payment NUMERIC(12,2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_suppliers_biz ON public.suppliers(business_id);

ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.store_staff ADD COLUMN IF NOT EXISTS joined_date TEXT;
CREATE INDEX IF NOT EXISTS idx_staff_biz ON public.store_staff(business_id);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_role TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_messages_biz ON public.messages(business_id, customer_id);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id TEXT;
