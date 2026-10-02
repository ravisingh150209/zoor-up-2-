-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 19)
-- Add customer profile and user detail columns for complete CRM profile persistence
-- ============================================================================

-- 1. CUSTOMERS
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS dob TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birthday TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS stamps INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS lifetime_points INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_visits INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'BASIC';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT 'NEW';

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);

-- 2. USERS
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dob TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
