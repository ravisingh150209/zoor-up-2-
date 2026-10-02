-- Migration 26: Add extra columns for orders, vouchers, and customer_vouchers
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_user_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'TAKEAWAY';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS minimum_order_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS total_usage_limit INTEGER DEFAULT 100;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS audience_type TEXT DEFAULT 'ALL_ELIGIBLE';

ALTER TABLE public.customer_vouchers ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON public.orders(idempotency_key);
