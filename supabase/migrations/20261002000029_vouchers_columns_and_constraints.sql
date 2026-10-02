-- Migration 29: vouchers and customer_vouchers constraints and columns
ALTER TABLE public.vouchers ALTER COLUMN code DROP NOT NULL;
ALTER TABLE public.vouchers ALTER COLUMN code SET DEFAULT ('VCH-' || substr(md5(random()::text), 1, 8));

ALTER TABLE public.customer_vouchers ALTER COLUMN code DROP NOT NULL;
ALTER TABLE public.customer_vouchers ALTER COLUMN code SET DEFAULT ('CVC-' || substr(md5(random()::text), 1, 8));
ALTER TABLE public.customer_vouchers ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;
ALTER TABLE public.customer_vouchers ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
