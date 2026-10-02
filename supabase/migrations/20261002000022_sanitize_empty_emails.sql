-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 22)
-- Convert empty string emails to NULL to uphold PostgreSQL UNIQUE constraints
-- ============================================================================

UPDATE public.users SET email = NULL WHERE email = '' OR trim(email) = '';
UPDATE public.customers SET login_email = NULL WHERE login_email = '' OR trim(login_email) = '';
UPDATE public.customers SET email = NULL WHERE email = '' OR trim(email) = '';
