import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors, getSupabaseAdmin } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { full_name, phone, password, email } = await req.json();

    if (!full_name || !phone || !password) {
      return new Response(JSON.stringify({ error: "Full name, phone, and password are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();

    // Check duplicate phone in customers
    const { data: existingCustomer } = await admin
      .from("customers")
      .select("id, customer_id, phone")
      .eq("phone", phone.trim())
      .single();

    if (existingCustomer) {
      return new Response(JSON.stringify({
        error: "A customer account with this phone number already exists. Please log in with your Customer ID.",
        customer_id: existingCustomer.customer_id
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Temporary internal unique email for Supabase Auth binding
    const internalEmail = email && email.includes("@")
      ? email.trim().toLowerCase()
      : `cus_${phone.replace(/\D/g, "")}_${Date.now()}@zoorup.internal`;

    // 1. Create Auth User
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone, role: "customer" },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authUser.user.id;

    // 2. Create Profile
    await admin.from("profiles").upsert({
      id: userId,
      full_name,
      phone,
      role: "customer",
      is_active: true,
    });

    // 3. Insert Customer Record (Trigger/Sequence auto assigns ZUP-CUS-000001)
    const { data: customer, error: cusError } = await admin
      .from("customers")
      .insert({
        profile_id: userId,
        auth_user_id: userId,
        full_name,
        phone,
        login_email: internalEmail,
        points: 0,
        rank: "Bronze",
        is_premium: false,
      })
      .select()
      .single();

    if (cusError) {
      return new Response(JSON.stringify({ error: cusError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return safe customer credentials to user
    return new Response(JSON.stringify({
      success: true,
      message: "Customer account created successfully.",
      customer_id: customer.customer_id,
      customer: {
        customer_id: customer.customer_id,
        name: customer.full_name,
        phone: customer.phone,
        points: customer.points,
        rank: customer.rank,
        qr_token: customer.qr_token,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
