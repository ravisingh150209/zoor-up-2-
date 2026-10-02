-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 4/4)
-- Storage Buckets, Storage RLS Policies, Realtime Publication & Master Seed
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. STORAGE BUCKETS INITIALIZATION
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('business-logos', 'business-logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
    ('business-covers', 'business-covers', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
    ('product-images', 'product-images', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
    ('customer-avatars', 'customer-avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']),
    ('invoice-attachments', 'invoice-attachments', false, 10485760, ARRAY['application/pdf', 'image/png', 'image/jpeg']),
    ('chat-attachments', 'chat-attachments', false, 15728640, ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
    ('expense-receipts', 'expense-receipts', false, 10485760, ARRAY['image/png', 'image/jpeg', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. STORAGE ROW LEVEL SECURITY POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view business logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'business-logos');

CREATE POLICY "Public can view business covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'business-covers');

CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Public can view customer avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'customer-avatars');

CREATE POLICY "Authenticated users can upload customer avatars to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'customer-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

CREATE POLICY "Store owners and staff can upload store media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id IN ('business-logos', 'business-covers', 'product-images', 'expense-receipts', 'invoice-attachments')
    AND public.has_store_access(((storage.foldername(name))[1])::UUID)
);

CREATE POLICY "Authorized members can view and upload chat attachments"
ON storage.objects FOR ALL
USING (
    bucket_id = 'chat-attachments'
    AND auth.uid() IS NOT NULL
);

-- ----------------------------------------------------------------------------
-- 3. SUPABASE REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Ensure publication exists
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ----------------------------------------------------------------------------
-- 4. MASTER SEED DATA
-- ----------------------------------------------------------------------------

-- A. Subscription Plans
INSERT INTO public.subscription_plans (id, name, price_monthly, max_customers, max_products, max_staff, analytics_enabled, inventory_enabled, loyalty_enabled, chat_enabled, advanced_reports, features)
VALUES
    ('FREE', 'Starter Free', 0.00, 50, 20, 1, false, false, false, false, false, '["Digital Menu QR", "Basic Orders", "1 Staff Account"]'::jsonb),
    ('BASIC', 'Growth Essentials', 299.00, 250, 100, 3, true, true, false, false, false, '["Digital Menu QR", "Inventory Stock Alerts", "POS Billing", "Up to 3 Staff"]'::jsonb),
    ('PRO', 'Professional Business', 799.00, 1000, 500, 10, true, true, true, true, true, '["Customer Loyalty Program", "VIP Reward Tiers", "Direct Customer Chat", "Full Analytics", "Coupons & Discounts"]'::jsonb),
    ('PREMIUM', 'Enterprise VIP', 1499.00, 999999, 999999, 999999, true, true, true, true, true, '["Unlimited Customers", "Unlimited Products", "Custom Domain", "Priority 24/7 SLA", "Dedicated Account Manager"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price_monthly = EXCLUDED.price_monthly,
    max_customers = EXCLUDED.max_customers,
    max_products = EXCLUDED.max_products,
    max_staff = EXCLUDED.max_staff,
    analytics_enabled = EXCLUDED.analytics_enabled,
    inventory_enabled = EXCLUDED.inventory_enabled,
    loyalty_enabled = EXCLUDED.loyalty_enabled,
    chat_enabled = EXCLUDED.chat_enabled,
    advanced_reports = EXCLUDED.advanced_reports,
    features = EXCLUDED.features;

-- B. Business Categories
INSERT INTO public.business_categories (name, slug, description, icon)
VALUES
    ('Grocery & Supermarket', 'grocery-supermarket', 'Daily essentials, fresh vegetables, organic and FMCG goods.', 'ShoppingBag'),
    ('Cafes & Restaurants', 'cafes-restaurants', 'Dining, specialty beverages, bistro treats, and cloud kitchens.', 'Utensils'),
    ('Salons & Spas', 'salons-spas', 'Hair care, skin wellness, grooming, therapy and beauty appointments.', 'Scissors'),
    ('Clothing & Fashion', 'clothing-fashion', 'Ethnic wear, casual outfits, boutique apparel and accessories.', 'Shirt'),
    ('Electronics & Mobiles', 'electronics-mobiles', 'Smartphones, gadgets, computing hardware and consumer tech.', 'Smartphone'),
    ('Bakeries & Cakes', 'bakeries-cakes', 'Artisanal breads, custom designer cakes, pastries and baked goods.', 'Cake'),
    ('Pharmacy & Health', 'pharmacy-health', 'Medicines, first aid, supplements and healthcare supplies.', 'Pill'),
    ('Services & Repair', 'services-repair', 'Electronics servicing, appliance diagnostics and home repairs.', 'Wrench')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon;

-- C. Platform Settings
INSERT INTO public.platform_settings (key, value)
VALUES
    ('general', '{"platform_name": "ZOORUP", "tagline": "Smart Business. Simple Management.", "support_phone": "+91 98000 00000", "support_email": "support@zoorup.com", "currency": "INR", "currency_symbol": "₹"}'::jsonb),
    ('loyalty_defaults', '{"points_per_100_currency": 10, "min_order_for_points": 100, "bronze_threshold": 0, "silver_threshold": 500, "gold_threshold": 1500, "platinum_threshold": 5000, "vip_threshold": 10000}'::jsonb),
    ('feature_flags', '{"enable_customer_qr": true, "enable_digital_menu": true, "enable_online_ordering": true, "enable_razorpay": true, "enable_delivery_tracking": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value;
