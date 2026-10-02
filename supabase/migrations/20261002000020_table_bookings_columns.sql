-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 20)
-- Harmonize table_bookings and table_reservations columns for seamless booking
-- ============================================================================

ALTER TABLE public.table_bookings ALTER COLUMN time_slot DROP NOT NULL;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS booking_time TEXT;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS table_name TEXT;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS party_size INTEGER DEFAULT 2;
ALTER TABLE public.table_bookings ADD COLUMN IF NOT EXISTS special_notes TEXT;

-- Recreate view with updated columns
CREATE OR REPLACE VIEW public.table_reservations AS SELECT * FROM public.table_bookings;
