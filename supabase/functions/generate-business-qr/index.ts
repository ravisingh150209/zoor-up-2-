import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createAdminClient, createUserClient } from "../_shared/cors.ts";

interface GenerateQRPayload {
  store_id: string;
  qr_type: "store_profile" | "digital_menu" | "catalogue" | "loyalty_checkin";
  metadata?: {
    table_number?: string | number;
    section?: string;
    label?: string;
    campaign?: string;
    [key: string]: any;
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createUserClient(authHeader);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: GenerateQRPayload = await req.json();
    const { store_id, qr_type, metadata = {} } = payload;

    if (!store_id || !qr_type) {
      return new Response(JSON.stringify({ error: "store_id and qr_type are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = ["store_profile", "digital_menu", "catalogue", "loyalty_checkin"];
    if (!validTypes.includes(qr_type)) {
      return new Response(JSON.stringify({ error: `Invalid qr_type. Must be one of: ${validTypes.join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();

    // Verify caller owns store or is staff with settings permission or is admin
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.role !== "admin") {
      const { data: store } = await adminClient
        .from("stores")
        .select("id")
        .eq("id", store_id)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!store) {
        // Check staff permissions
        const { data: staff } = await adminClient
          .from("store_staff")
          .select("permissions, is_active")
          .eq("store_id", store_id)
          .eq("profile_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (!staff || (!staff.permissions?.includes("dashboard") && !staff.permissions?.includes("products"))) {
          return new Response(JSON.stringify({ error: "Unauthorized to generate QR codes for this store" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Generate cryptographic unguessable token
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const tokenPart = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const token = `zup_${qr_type.slice(0, 3)}_${tokenPart}`;

    const { data: qrRecord, error: insertErr } = await adminClient
      .from("qr_codes")
      .insert({
        store_id,
        qr_type,
        token,
        metadata,
        is_active: true,
      })
      .select()
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: "Failed to generate QR code: " + insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: profile.role,
      action: "generate_qr_code",
      entity: "qr_codes",
      entity_id: qrRecord.id,
      metadata: { store_id, qr_type, token },
    });

    return new Response(
      JSON.stringify({
        success: true,
        qr_code: qrRecord,
        resolve_url: `/qr/${token}`,
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
