-- Migration 27: Add discount_price, business_id and active columns to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS discount_price NUMERIC(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS business_id TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_business_id ON public.products(business_id);
