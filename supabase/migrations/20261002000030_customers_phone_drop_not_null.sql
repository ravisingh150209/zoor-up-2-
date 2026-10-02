-- Migration 30: Drop NOT NULL constraint on phone for customers and users
ALTER TABLE public.customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
