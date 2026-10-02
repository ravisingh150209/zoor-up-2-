-- ============================================================================
-- ZOORUP SAAS PLATFORM - PRODUCTION POSTGRESQL SCHEMA (MIGRATION 2/4)
-- Row Level Security (RLS) Helper Functions & Strict Multi-Tenant Policies
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER HELPER FUNCTIONS FOR RLS EVALUATION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_store_owner(p_store_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = p_store_id AND owner_id = auth.uid()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_store_staff(p_store_id UUID, p_permission TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.store_staff
        WHERE store_id = p_store_id
          AND profile_id = auth.uid()
          AND is_active = true
          AND (p_permission IS NULL OR permissions ? p_permission)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id UUID, p_permission TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
    SELECT public.is_admin()
        OR public.is_store_owner(p_store_id)
        OR public.is_store_staff(p_store_id, p_permission);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS UUID AS $$
    SELECT id FROM public.customers
    WHERE auth_user_id = auth.uid() OR profile_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Revoke default public execution & grant authenticated only
REVOKE EXECUTE ON FUNCTION public.current_user_role FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_store_owner FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_store_staff FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_store_access FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_customer_id FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_staff TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_customer_id TO authenticated;

-- ----------------------------------------------------------------------------
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. PROFILES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own profile or admins can view all"
ON public.profiles FOR SELECT
USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can update own non-role profile fields"
ON public.profiles FOR UPDATE
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. BUSINESS CATEGORIES POLICIES (Public read, admin write)
-- ----------------------------------------------------------------------------
CREATE POLICY "Public read business categories"
ON public.business_categories FOR SELECT
USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage business categories"
ON public.business_categories FOR ALL
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. SUBSCRIPTION PLANS POLICIES (Public read, admin write)
-- ----------------------------------------------------------------------------
CREATE POLICY "Public read subscription plans"
ON public.subscription_plans FOR SELECT
USING (is_active = true OR public.is_admin());

CREATE POLICY "Admin manage subscription plans"
ON public.subscription_plans FOR ALL
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. STORES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view approved active stores"
ON public.stores FOR SELECT
USING (is_active = true AND is_approved = true);

CREATE POLICY "Store owners view and update own store"
ON public.stores FOR SELECT
USING (owner_id = auth.uid() OR public.has_store_access(id));

CREATE POLICY "Store owners update own store"
ON public.stores FOR UPDATE
USING (owner_id = auth.uid() OR public.is_admin())
WITH CHECK (owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admin manage all stores"
ON public.stores FOR ALL
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. STORE STAFF POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store owners can manage their staff"
ON public.store_staff FOR ALL
USING (public.is_store_owner(store_id) OR public.is_admin());

CREATE POLICY "Staff can view own staff record"
ON public.store_staff FOR SELECT
USING (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. CUSTOMERS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Customer can view and update own record"
ON public.customers FOR SELECT
USING (auth_user_id = auth.uid() OR profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "Customer update own basic details"
ON public.customers FOR UPDATE
USING (auth_user_id = auth.uid() OR profile_id = auth.uid() OR public.is_admin())
WITH CHECK (auth_user_id = auth.uid() OR profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "Store owners and permitted staff can view connected customers"
ON public.customers FOR SELECT
USING (
    public.is_admin() OR
    EXISTS (
        SELECT 1 FROM public.store_customers sc
        WHERE sc.customer_id = customers.id
          AND public.has_store_access(sc.store_id, 'customers')
    )
);

-- ----------------------------------------------------------------------------
-- 7. STORE CUSTOMERS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store access to store_customers"
ON public.store_customers FOR ALL
USING (public.has_store_access(store_id, 'customers'));

CREATE POLICY "Customer view own store relationships"
ON public.store_customers FOR SELECT
USING (customer_id = public.current_customer_id());

-- ----------------------------------------------------------------------------
-- 8. PRODUCT CATEGORIES & PRODUCTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view active product categories"
ON public.product_categories FOR SELECT
USING (is_active = true OR public.has_store_access(store_id, 'products'));

CREATE POLICY "Store owners and staff can manage product categories"
ON public.product_categories FOR ALL
USING (public.has_store_access(store_id, 'products'));

CREATE POLICY "Public can view active products of active stores"
ON public.products FOR SELECT
USING (
    (is_active = true AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.is_active = true AND s.is_approved = true))
    OR public.has_store_access(store_id, 'products')
);

CREATE POLICY "Store owners and staff can manage products"
ON public.products FOR ALL
USING (public.has_store_access(store_id, 'products'));

-- ----------------------------------------------------------------------------
-- 9. SERVICES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can view active services"
ON public.services FOR SELECT
USING (
    (is_active = true AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = services.store_id AND s.is_active = true AND s.is_approved = true))
    OR public.has_store_access(store_id, 'services')
);

CREATE POLICY "Store owners and staff can manage services"
ON public.services FOR ALL
USING (public.has_store_access(store_id, 'services'));

-- ----------------------------------------------------------------------------
-- 10. CARTS & CART ITEMS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Customer manages own cart"
ON public.carts FOR ALL
USING (customer_id = public.current_customer_id() OR public.is_admin());

CREATE POLICY "Customer manages own cart items"
ON public.cart_items FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND (c.customer_id = public.current_customer_id() OR public.is_admin()))
);

-- ----------------------------------------------------------------------------
-- 11. ORDERS & ORDER ITEMS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Customer view own orders"
ON public.orders FOR SELECT
USING (customer_id = public.current_customer_id());

CREATE POLICY "Store owners and staff view and manage store orders"
ON public.orders FOR ALL
USING (public.has_store_access(store_id, 'orders'));

CREATE POLICY "Delivery partner view assigned or available orders"
ON public.orders FOR SELECT
USING (
    public.current_user_role() = 'delivery_partner'
    AND (delivery_partner_id = auth.uid() OR (status = 'ready' AND delivery_partner_id IS NULL))
);

CREATE POLICY "Delivery partner update assigned order status"
ON public.orders FOR UPDATE
USING (
    public.current_user_role() = 'delivery_partner'
    AND (delivery_partner_id = auth.uid() OR (status = 'ready' AND delivery_partner_id IS NULL))
)
WITH CHECK (
    public.current_user_role() = 'delivery_partner'
    AND delivery_partner_id = auth.uid()
);

CREATE POLICY "Order items viewable by order stakeholders"
ON public.order_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id
          AND (o.customer_id = public.current_customer_id() OR public.has_store_access(o.store_id, 'orders') OR o.delivery_partner_id = auth.uid() OR public.is_admin())
    )
);

CREATE POLICY "Store staff can manage order items"
ON public.order_items FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_store_access(o.store_id, 'orders'))
);

-- ----------------------------------------------------------------------------
-- 12. PAYMENTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store can view store payments"
ON public.payments FOR SELECT
USING (public.has_store_access(store_id, 'billing'));

CREATE POLICY "Customer can view own payments"
ON public.payments FOR SELECT
USING (customer_id = public.current_customer_id());

-- ----------------------------------------------------------------------------
-- 13. INVOICES & INVOICE ITEMS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store manage invoices"
ON public.invoices FOR ALL
USING (public.has_store_access(store_id, 'billing'));

CREATE POLICY "Customer view own invoices"
ON public.invoices FOR SELECT
USING (customer_id = public.current_customer_id());

CREATE POLICY "Store manage invoice items"
ON public.invoice_items FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.has_store_access(i.store_id, 'billing'))
);

CREATE POLICY "Customer view own invoice items"
ON public.invoice_items FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND i.customer_id = public.current_customer_id())
);

-- ----------------------------------------------------------------------------
-- 14. INVENTORY & TRANSACTIONS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store manage inventory"
ON public.inventory FOR ALL
USING (public.has_store_access(store_id, 'inventory'));

CREATE POLICY "Store manage inventory transactions"
ON public.inventory_transactions FOR ALL
USING (public.has_store_access(store_id, 'inventory'));

-- ----------------------------------------------------------------------------
-- 15. EXPENSES & EXPENSE CATEGORIES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store manage expense categories"
ON public.expense_categories FOR ALL
USING (public.has_store_access(store_id, 'expenses'));

CREATE POLICY "Store manage expenses"
ON public.expenses FOR ALL
USING (public.has_store_access(store_id, 'expenses'));

-- ----------------------------------------------------------------------------
-- 16. SUPPLIERS & SUPPLIER PRODUCTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store manage suppliers"
ON public.suppliers FOR ALL
USING (public.has_store_access(store_id, 'inventory'));

CREATE POLICY "Store manage supplier products"
ON public.supplier_products FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_products.supplier_id AND public.has_store_access(s.store_id, 'inventory'))
);

-- ----------------------------------------------------------------------------
-- 17. DELIVERIES & TRACKING POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Deliveries accessible to assigned partner and store"
ON public.deliveries FOR ALL
USING (
    delivery_partner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = deliveries.order_id AND (public.has_store_access(o.store_id, 'delivery') OR o.customer_id = public.current_customer_id()))
);

CREATE POLICY "Delivery partner can insert tracking coordinates"
ON public.delivery_tracking FOR INSERT
WITH CHECK (delivery_partner_id = auth.uid());

CREATE POLICY "Delivery tracking visible to store, customer, and assigned partner"
ON public.delivery_tracking FOR SELECT
USING (
    delivery_partner_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = delivery_tracking.order_id
          AND (o.customer_id = public.current_customer_id() OR public.has_store_access(o.store_id, 'delivery') OR public.is_admin())
    )
);

-- ----------------------------------------------------------------------------
-- 18. LOYALTY RULES & POINTS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public view active loyalty rules"
ON public.loyalty_rules FOR SELECT
USING (is_active = true OR public.has_store_access(store_id, 'customers'));

CREATE POLICY "Store manage loyalty rules"
ON public.loyalty_rules FOR ALL
USING (public.has_store_access(store_id, 'customers'));

CREATE POLICY "Customer view own point ledger"
ON public.customer_points FOR SELECT
USING (customer_id = public.current_customer_id());

CREATE POLICY "Store view customer point ledger"
ON public.customer_points FOR SELECT
USING (public.has_store_access(store_id, 'customers'));

-- Note: INSERT/UPDATE on customer_points strictly done through security definer RPC (no direct client insert)

-- ----------------------------------------------------------------------------
-- 19. REWARDS & REDEMPTIONS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public view active store rewards"
ON public.rewards FOR SELECT
USING (is_active = true OR public.has_store_access(store_id, 'customers'));

CREATE POLICY "Store manage rewards"
ON public.rewards FOR ALL
USING (public.has_store_access(store_id, 'customers'));

CREATE POLICY "Customer view own reward redemptions"
ON public.reward_redemptions FOR SELECT
USING (customer_id = public.current_customer_id());

CREATE POLICY "Store view store reward redemptions"
ON public.reward_redemptions FOR ALL
USING (public.has_store_access(store_id, 'customers'));

-- ----------------------------------------------------------------------------
-- 20. COUPONS & USAGE POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public view active store coupons"
ON public.coupons FOR SELECT
USING (is_active = true OR public.has_store_access(store_id, 'orders'));

CREATE POLICY "Store manage coupons"
ON public.coupons FOR ALL
USING (public.has_store_access(store_id, 'orders'));

CREATE POLICY "Customer view own coupon usage"
ON public.coupon_usage FOR SELECT
USING (customer_id = public.current_customer_id());

CREATE POLICY "Store view store coupon usage"
ON public.coupon_usage FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.coupons c WHERE c.id = coupon_usage.coupon_id AND public.has_store_access(c.store_id, 'orders'))
);

-- ----------------------------------------------------------------------------
-- 21. CHAT CONVERSATIONS & MESSAGES POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Conversation access restricted to members"
ON public.conversations FOR SELECT
USING (
    public.has_store_access(store_id, 'chat')
    OR customer_id = public.current_customer_id()
    OR EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.profile_id = auth.uid())
);

CREATE POLICY "Conversation members visible to members"
ON public.conversation_members FOR SELECT
USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_members.conversation_id AND cm.profile_id = auth.uid())
);

CREATE POLICY "Members can read conversation messages"
ON public.messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (public.has_store_access(c.store_id, 'chat') OR c.customer_id = public.current_customer_id() OR public.is_admin())
    )
);

CREATE POLICY "Members can send messages into authorized conversations"
ON public.messages FOR INSERT
WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (public.has_store_access(c.store_id, 'chat') OR c.customer_id = public.current_customer_id() OR public.is_admin())
    )
);

-- ----------------------------------------------------------------------------
-- 22. NOTIFICATIONS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "User can read and update own notifications"
ON public.notifications FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 23. SUBSCRIPTIONS & USAGE POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Store owner view own subscription"
ON public.subscriptions FOR SELECT
USING (public.is_store_owner(store_id) OR public.is_admin());

CREATE POLICY "Store owner view own usage"
ON public.subscription_usage FOR SELECT
USING (public.has_store_access(store_id) OR public.is_admin());

CREATE POLICY "Admin manage subscriptions"
ON public.subscriptions FOR ALL
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 24. BUSINESS SETTINGS, HOURS & SOCIAL POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public view business hours and social links"
ON public.business_hours FOR SELECT USING (true);

CREATE POLICY "Public view business social links"
ON public.business_social_links FOR SELECT USING (true);

CREATE POLICY "Store access to business settings"
ON public.business_settings FOR ALL
USING (public.has_store_access(store_id));

CREATE POLICY "Store access to business hours"
ON public.business_hours FOR ALL
USING (public.has_store_access(store_id));

CREATE POLICY "Store access to social links"
ON public.business_social_links FOR ALL
USING (public.has_store_access(store_id));

-- ----------------------------------------------------------------------------
-- 25. QR CODES & SCANS POLICIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Public can resolve active QR codes"
ON public.qr_codes FOR SELECT
USING (is_active = true OR public.has_store_access(store_id));

CREATE POLICY "Store can manage store QR codes"
ON public.qr_codes FOR ALL
USING (public.has_store_access(store_id));

CREATE POLICY "Anyone can record QR scan"
ON public.qr_scans FOR INSERT
WITH CHECK (true);

CREATE POLICY "Store can view QR scans"
ON public.qr_scans FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.qr_codes q WHERE q.id = qr_scans.qr_code_id AND public.has_store_access(q.store_id))
);

-- ----------------------------------------------------------------------------
-- 26. AUDIT LOGS POLICIES (Admins only)
-- ----------------------------------------------------------------------------
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 27. PLATFORM SETTINGS POLICIES (Public read platform info, admin write)
-- ----------------------------------------------------------------------------
CREATE POLICY "Public read platform settings"
ON public.platform_settings FOR SELECT
USING (true);

CREATE POLICY "Admin manage platform settings"
ON public.platform_settings FOR ALL
USING (public.is_admin());
