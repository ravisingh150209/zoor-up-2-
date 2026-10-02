-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 13)
-- Adapt otp_codes table for float timestamps and secure salt attributes
-- ============================================================================

ALTER TABLE public.otp_codes ALTER COLUMN expires_at TYPE NUMERIC USING EXTRACT(EPOCH FROM expires_at);
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS salt TEXT;
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 5;
