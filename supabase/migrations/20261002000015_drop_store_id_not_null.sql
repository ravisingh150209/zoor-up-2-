-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 15)
-- Drop NOT NULL on store_id to support business_id multi-tenant routing
-- ============================================================================

ALTER TABLE public.invoices ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.expenses ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.products ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN store_id DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN store_id DROP NOT NULL;
