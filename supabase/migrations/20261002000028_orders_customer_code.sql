-- Migration 28: Add customer_code and metadata to public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
