-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 9)
-- Complete Image System, Business Cover, Gallery & Storage Policies
-- ============================================================================

-- 1. ADD IMAGE & GALLERY COLUMNS TO TABLES
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS cover_photo_url TEXT,
    ADD COLUMN IF NOT EXISTS gallery JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Sync cover_url if exists
UPDATE public.stores
SET cover_photo_url = cover_url
WHERE cover_photo_url IS NULL AND cover_url IS NOT NULL;

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

UPDATE public.customers
SET profile_image_url = avatar_url
WHERE profile_image_url IS NULL AND avatar_url IS NOT NULL;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

UPDATE public.profiles
SET profile_image_url = avatar_url
WHERE profile_image_url IS NULL AND avatar_url IS NOT NULL;

ALTER TABLE public.store_staff
    ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'offers') THEN
        ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS image_url TEXT;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rewards') THEN
        ALTER TABLE public.rewards ADD COLUMN IF NOT EXISTS image_url TEXT;
    END IF;
END $$;

-- 2. CREATE STORAGE BUCKETS FOR GALLERY & MEDIA
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('business-gallery', 'business-gallery', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
    ('staff-avatars', 'staff-avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']),
    ('offer-images', 'offer-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']),
    ('reward-images', 'reward-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. STORAGE POLICIES
DO $$ BEGIN
    CREATE POLICY "Public can view business gallery"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-gallery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Public can view staff avatars"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'staff-avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Public can view offer images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'offer-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Public can view reward images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'reward-images');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. FUNCTION TO VALIDATE AND UPDATE STORE GALLERY WITH PLAN LIMITS
CREATE OR REPLACE FUNCTION public.update_store_gallery(
    p_store_id UUID,
    p_gallery JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_plan_id TEXT;
    v_max_items INTEGER := 2;
    v_item_count INTEGER;
BEGIN
    -- Verify caller access
    IF NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'Access denied for store %', p_store_id;
    END IF;

    -- Get current store plan
    SELECT plan INTO v_plan_id
    FROM public.subscriptions
    WHERE store_id = p_store_id
    LIMIT 1;

    v_plan_id := COALESCE(v_plan_id, 'FREE');

    -- Calculate plan gallery limit
    IF v_plan_id = 'PRO' THEN
        v_max_items := 50;
    ELSIF v_plan_id = 'GROWTH' THEN
        v_max_items := 15;
    ELSIF v_plan_id = 'STARTER' OR v_plan_id = 'BASIC' THEN
        v_max_items := 5;
    ELSE
        v_max_items := 2;
    END IF;

    v_item_count := jsonb_array_length(p_gallery);

    IF v_item_count > v_max_items THEN
        RAISE EXCEPTION 'Plan % allows up to % gallery images. You submitted %.', v_plan_id, v_max_items, v_item_count;
    END IF;

    UPDATE public.stores
    SET gallery = p_gallery,
        updated_at = NOW()
    WHERE id = p_store_id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', p_store_id,
        'plan', v_plan_id,
        'max_allowed', v_max_items,
        'current_count', v_item_count,
        'gallery', p_gallery
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
