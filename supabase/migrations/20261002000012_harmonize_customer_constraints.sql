-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 12)
-- Harmonize customer name/full_name constraints
-- ============================================================================

ALTER TABLE public.customers ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.customers ALTER COLUMN full_name SET DEFAULT 'Customer';
