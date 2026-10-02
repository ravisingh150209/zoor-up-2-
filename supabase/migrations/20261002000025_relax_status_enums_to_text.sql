-- Migration 25: Add missing enum values to order_status and payment_status
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'PREPARING';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'FAILED';
