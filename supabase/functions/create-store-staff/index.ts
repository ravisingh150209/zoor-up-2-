import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors, getSupabaseAdmin, getSupabaseUserClient } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = getSupabaseUserClient(authHeader);
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { store_id, name, email, phone, password, role_title, permissions } = await req.json();

    if (!store_id || !name || !email || !password) {
      return new Response(JSON.stringify({ error: "Store ID, name, email, and temporary password are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();

    // Verify caller is owner of the store or admin
    const { data: store } = await admin
      .from("stores")
      .select("id, owner_id")
      .eq("id", store_id)
      .single();

    if (!store || store.owner_id !== user.id) {
      // Check if admin
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        return new Response(JSON.stringify({ error: "Forbidden: You are not authorized to add staff to this store." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1. Create Staff User
    const { data: staffUser, error: authError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: name, role: "store_staff" },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const staffProfileId = staffUser.user.id;

    // 2. Insert Profile
    await admin.from("profiles").upsert({
      id: staffProfileId,
      full_name: name,
      phone: phone || null,
      role: "store_staff",
      is_active: true,
    });

    // 3. Insert Store Staff
    const allowedPermissions = permissions && Array.isArray(permissions)
      ? permissions
      : ["dashboard", "orders", "billing"];

    const { data: staffRecord, error: staffError } = await admin
      .from("store_staff")
      .insert({
        store_id,
        profile_id: staffProfileId,
        role: role_title || "Staff Member",
        permissions: allowedPermissions,
        is_active: true,
      })
      .select()
      .single();

    if (staffError) {
      return new Response(JSON.stringify({ error: staffError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Store staff member added successfully.",
      staff: staffRecord,
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
