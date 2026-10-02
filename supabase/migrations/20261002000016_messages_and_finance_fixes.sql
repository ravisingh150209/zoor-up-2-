-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 16)
-- Harmonize messages constraints for business-customer chat
-- ============================================================================

ALTER TABLE public.messages ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;
