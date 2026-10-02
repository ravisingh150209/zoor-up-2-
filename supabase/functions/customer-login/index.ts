import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors, getSupabaseAdmin } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return new Response(JSON.stringify({ error: "Customer ID (or phone number) and password are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();
    const cleanId = identifier.trim();

    // 1. Lookup customer by customer_id or phone
    const { data: customer, error: cusFindError } = await admin
      .from("customers")
      .select("id, customer_id, full_name, phone, points, rank, is_premium, qr_token, login_email, auth_user_id")
      .or(`customer_id.ilike.${cleanId},phone.eq.${cleanId}`)
      .single();

    if (cusFindError || !customer) {
      return new Response(JSON.stringify({ error: "Invalid credentials: Customer account not found." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Sign in with password using internal email
    const { data: authSession, error: authError } = await admin.auth.signInWithPassword({
      email: customer.login_email,
      password,
    });

    if (authError || !authSession.session) {
      return new Response(JSON.stringify({ error: "Invalid password. Please check your credentials." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Return sanitized customer session
    return new Response(JSON.stringify({
      success: true,
      access_token: authSession.session.access_token,
      refresh_token: authSession.session.refresh_token,
      customer: {
        customer_id: customer.customer_id,
        name: customer.full_name,
        phone: customer.phone,
        points: customer.points,
        rank: customer.rank,
        is_premium: customer.is_premium,
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
