-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 18)
-- Add columns to payments and subscriptions for UPI verification and subscriptions
-- ============================================================================

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS plan_name TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS billing_interval TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transaction_reference TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON public.payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_plan_id ON public.payments(plan_id);

-- Subscriptions adaptations
ALTER TABLE public.subscriptions ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PAID';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS transaction_reference TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'ACTIVE';
