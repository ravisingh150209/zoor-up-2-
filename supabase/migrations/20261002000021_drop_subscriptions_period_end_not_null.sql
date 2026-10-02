-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 21)
-- Drop NOT NULL on subscriptions.current_period_end to support free lifetime plans
-- ============================================================================

ALTER TABLE public.subscriptions ALTER COLUMN current_period_end DROP NOT NULL;
