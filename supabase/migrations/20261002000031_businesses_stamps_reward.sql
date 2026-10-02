-- Migration 31: Add stamps_required, reward_description, and metadata to businesses
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS stamps_required INTEGER DEFAULT 10;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS reward_description TEXT DEFAULT '';
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
