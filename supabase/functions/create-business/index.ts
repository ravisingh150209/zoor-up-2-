import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createAdminClient } from "../_shared/cors.ts";

interface CreateBusinessPayload {
  email: string;
  password?: string;
  full_name?: string;
  phone?: string;
  business_name: string;
  category_id?: string;
  selected_plan?: "FREE" | "STARTER" | "GROWTH" | "PRO" | string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: CreateBusinessPayload = await req.json();
    const {
      email,
      password = "Password123!",
      full_name,
      phone,
      business_name,
      category_id,
      selected_plan = "PRO",
      address,
      city,
      state,
      pincode,
    } = payload;

    if (!email || !business_name) {
      return new Response(JSON.stringify({ error: "Email and Business Name are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check or Create Auth User
    let userId: string;
    const { data: existingUser } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("phone", phone || "")
      .maybeSingle();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: full_name || business_name, role: "store_owner" },
      });

      if (authErr) {
        return new Response(JSON.stringify({ error: authErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = authUser.user.id;

      // Create / Upsert Profile
      await adminClient.from("profiles").upsert({
        id: userId,
        full_name: full_name || business_name,
        phone: phone || null,
        role: "store_owner",
        is_active: true,
      });
    }

    // 2. Generate Store ID and Slug
    const slug = business_name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") + "-" + Math.random().toString(36).substring(2, 6);

    const { data: store, error: storeErr } = await adminClient
      .from("stores")
      .insert({
        owner_id: userId,
        business_name: business_name.trim(),
        slug,
        business_category_id: category_id || null,
        phone: phone || "",
        email: normalizedEmail,
        address: address || "",
        city: city || "",
        state: state || "",
        pincode: pincode || "",
        is_active: true,
        is_approved: true, // Instantly ACTIVE!
      })
      .select()
      .single();

    if (storeErr) {
      return new Response(JSON.stringify({ error: storeErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Initialize Default Settings & Loyalty Rules
    await adminClient.from("business_settings").insert({ store_id: store.id });
    await adminClient.from("loyalty_rules").insert({
      store_id: store.id,
      points_per_100_currency: 10,
      min_order_for_points: 100,
    });

    // 4. Initialize 30-Day Free Trial Subscription (Server Time Controlled)
    const normalizedPlan = (selected_plan || "PRO").toUpperCase();
    const isFree = normalizedPlan === "FREE";
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Server-side 30 days

    const { data: subscription, error: subErr } = await adminClient
      .from("subscriptions")
      .insert({
        store_id: store.id,
        user_id: userId,
        plan_id: normalizedPlan,
        status: isFree ? "active" : "trial",
        subscription_status: isFree ? "ACTIVE" : "TRIAL",
        trial_status: isFree ? "NOT_APPLICABLE" : "ACTIVE",
        trial_started_at: isFree ? null : now.toISOString(),
        trial_ends_at: isFree ? null : trialEnds.toISOString(),
        trial_used: !isFree,
        subscription_started_at: now.toISOString(),
        subscription_ends_at: isFree ? null : trialEnds.toISOString(),
        payment_status: isFree ? "FREE" : "TRIAL", // ₹0 charged!
      })
      .select()
      .single();

    if (subErr) {
      console.error("Subscription insert error:", subErr);
    }

    // 5. Initialize Subscription Usage
    await adminClient.from("subscription_usage").insert({
      store_id: store.id,
      customers_count: 0,
      products_count: 0,
      staff_count: 1,
      orders_count: 0,
    });

    // 6. Generate Default Digital Menu & Check-in QR codes
    const menuToken = `zup_men_${store.id.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
    const checkinToken = `zup_chk_${store.id.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;

    await adminClient.from("qr_codes").insert([
      { store_id: store.id, qr_type: "digital_menu", token: menuToken, label: "Digital Menu QR" },
      { store_id: store.id, qr_type: "loyalty_checkin", token: checkinToken, label: "Customer Loyalty QR" },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        message: isFree ? "Free business account created" : `30-Day Free Trial activated for ${normalizedPlan}`,
        store,
        subscription: {
          plan: normalizedPlan,
          subscription_status: isFree ? "ACTIVE" : "TRIAL",
          trial_status: isFree ? "NOT_APPLICABLE" : "ACTIVE",
          trial_active: !isFree,
          trial_days_remaining: isFree ? 0 : 30,
          trial_started_at: isFree ? null : now.toISOString(),
          trial_ends_at: isFree ? null : trialEnds.toISOString(),
          payment_status: isFree ? "FREE" : "TRIAL",
        },
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
