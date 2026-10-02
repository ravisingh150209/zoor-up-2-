-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 14)
-- Dedicated Business Staff table with string IDs and real RBAC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.business_staff (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    business_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'Staff Member',
    permissions JSONB DEFAULT '["dashboard", "orders", "billing"]'::jsonb,
    status TEXT DEFAULT 'ACTIVE',
    is_active BOOLEAN DEFAULT true,
    profile_image_url TEXT,
    avatar TEXT,
    joined_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bs_biz ON public.business_staff(business_id);
CREATE INDEX IF NOT EXISTS idx_bs_user ON public.business_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_bs_email ON public.business_staff(email);
