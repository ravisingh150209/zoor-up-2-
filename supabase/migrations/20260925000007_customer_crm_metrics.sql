-- ============================================================================
-- Add CRM Analytics Metrics to Customers Table
-- ============================================================================

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS total_orders INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent NUMERIC(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS last_visit TIMESTAMPTZ DEFAULT NOW();
