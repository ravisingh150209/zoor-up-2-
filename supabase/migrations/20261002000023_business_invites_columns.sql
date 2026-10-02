-- Migration 23: Add columns to business_invites and relax token NOT NULL
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS invited_by_user_id TEXT;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS used_by_customer_id TEXT;
ALTER TABLE public.business_invites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.business_invites ALTER COLUMN token DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON public.business_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_invite_token ON public.business_invites(invite_token);
