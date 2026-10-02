import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createAdminClient, createUserClient } from "../_shared/cors.ts";

interface SendNotificationPayload {
  user_id: string; // Target profile ID
  type: "order_update" | "payment" | "loyalty" | "offer" | "message" | "subscription" | "admin_notice";
  title: string;
  message: string;
  data?: Record<string, any>;
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

    const payload: SendNotificationPayload = await req.json();
    const { user_id, type, title, message, data = {} } = payload;

    if (!user_id || !type || !title || !message) {
      return new Response(JSON.stringify({ error: "user_id, type, title, and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();

    // Verify caller role: admins can notify anyone; store owners/staff can notify customers associated with their store
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Caller profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role checks
    if (callerProfile.role !== "admin") {
      // If store_owner or store_staff, check if recipient is connected via store_customers or is the user themselves
      if (callerProfile.role === "store_owner" || callerProfile.role === "store_staff") {
        // Allow sending notification related to their store customers or delivery partners
        if (data.store_id) {
          const { data: storeAccess } = await adminClient
            .from("stores")
            .select("id")
            .eq("id", data.store_id)
            .eq("owner_id", user.id)
            .maybeSingle();

          const { data: staffAccess } = await adminClient
            .from("store_staff")
            .select("id")
            .eq("store_id", data.store_id)
            .eq("profile_id", user.id)
            .eq("is_active", true)
            .maybeSingle();

          if (!storeAccess && !staffAccess && user_id !== user.id) {
            return new Response(JSON.stringify({ error: "Forbidden: Not authorized to dispatch notification for this store" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } else if (user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden: Regular users cannot notify other users directly" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert notification
    const { data: notification, error: insertErr } = await adminClient
      .from("notifications")
      .insert({
        user_id,
        type,
        title,
        message,
        data,
        is_read: false,
      })
      .select()
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: "Failed to create notification: " + insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, notification }), {
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
