-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 17)
-- Harmonize payments table for multi-tenant business subscriptions & UPI payments
-- ============================================================================

ALTER TABLE public.payments ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS verified_utr TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_biz ON public.payments(business_id);
CREATE INDEX IF NOT EXISTS idx_payments_utr ON public.payments(verified_utr);
