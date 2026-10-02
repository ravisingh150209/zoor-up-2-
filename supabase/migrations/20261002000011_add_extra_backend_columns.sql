-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 11)
-- Add extra backend attributes to support full auth, onboarding and subscriptions
-- ============================================================================

-- 1. USERS
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';

-- 2. BUSINESSES
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS gst_number TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS tax_number TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'FREE';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'NOT_REQUIRED';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1;

-- 3. SUBSCRIPTIONS
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'FREE';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;

-- 4. CUSTOMERS
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS login_method TEXT DEFAULT 'email';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 5. OTP_CODES
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'LOGIN';
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 6. UPLOAD_ASSETS
ALTER TABLE public.upload_assets ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();
