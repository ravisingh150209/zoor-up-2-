-- Migration 24: Add missing columns to public.visits
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS stamps_awarded INTEGER DEFAULT 0;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS table_id TEXT;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed';

CREATE INDEX IF NOT EXISTS idx_visits_reference_id ON public.visits(reference_id);
