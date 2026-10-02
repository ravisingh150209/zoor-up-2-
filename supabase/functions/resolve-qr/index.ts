import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createAdminClient } from "../_shared/cors.ts";

interface ResolveQRPayload {
  token: string;
  ip_address?: string;
  user_agent?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: ResolveQRPayload = await req.json();
    const { token, ip_address, user_agent } = payload;

    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return new Response(JSON.stringify({ error: "QR token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();

    // Find the QR code
    const { data: qrCode, error: qrErr } = await adminClient
      .from("qr_codes")
      .select("id, store_id, qr_type, is_active, metadata")
      .eq("token", token.trim())
      .maybeSingle();

    if (qrErr || !qrCode) {
      return new Response(JSON.stringify({ error: "Invalid or expired QR token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!qrCode.is_active) {
      return new Response(JSON.stringify({ error: "This QR code is inactive or has been disabled" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record QR scan asynchronously without blocking resolution
    adminClient
      .from("qr_scans")
      .insert({
        qr_code_id: qrCode.id,
        store_id: qrCode.store_id,
        ip_address: ip_address || req.headers.get("x-forwarded-for") || "unknown",
        user_agent: user_agent || req.headers.get("user-agent") || "unknown",
      })
      .then(() => {});

    // Query safe store details if associated with a store
    let storeData = null;
    let menuData = null;

    if (qrCode.store_id) {
      const { data: store } = await adminClient
        .from("stores")
        .select(`
          id,
          store_id,
          business_name,
          logo_url,
          cover_url,
          description,
          phone,
          email,
          address,
          city,
          state,
          pincode,
          is_active,
          business_categories (
            name,
            slug
          ),
          business_hours (
            day_of_week,
            open_time,
            close_time,
            is_closed
          )
        `)
        .eq("id", qrCode.store_id)
        .eq("is_active", true)
        .single();

      if (!store) {
        return new Response(JSON.stringify({ error: "Associated business is currently inactive or not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      storeData = store;

      // If QR type is digital_menu or catalogue, include active products and categories
      if (qrCode.qr_type === "digital_menu" || qrCode.qr_type === "catalogue") {
        const { data: products } = await adminClient
          .from("products")
          .select(`
            id,
            name,
            description,
            price,
            discount,
            tax,
            image_url,
            stock,
            is_active,
            category_id,
            product_categories (
              id,
              name
            )
          `)
          .eq("store_id", qrCode.store_id)
          .eq("is_active", true)
          .order("name", { ascending: true });

        const { data: services } = await adminClient
          .from("services")
          .select("id, name, description, price, duration_minutes, image_url, is_active")
          .eq("store_id", qrCode.store_id)
          .eq("is_active", true);

        menuData = {
          products: products || [],
          services: services || [],
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        qr_type: qrCode.qr_type,
        metadata: qrCode.metadata || {},
        store: storeData,
        menu: menuData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to resolve QR token" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
