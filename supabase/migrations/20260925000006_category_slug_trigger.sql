-- ============================================================================
-- Auto-generate slug for product_categories if omitted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_category_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.slug IS NULL OR TRIM(NEW.slug) = '' THEN
        NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_set_category_slug
BEFORE INSERT ON public.product_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_category_slug();
