import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createAdminClient, createUserClient } from "../_shared/cors.ts";

interface SubscriptionPaymentPayload {
  action: "get_subscription" | "start_trial";
  store_id: string;
  plan_id?: string;
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

    const payload: SubscriptionPaymentPayload = await req.json();
    const {
      action,
      store_id,
      plan_id = "PRO",
    } = payload;

    if (!store_id || !action) {
      return new Response(JSON.stringify({ error: "store_id and action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();

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
        return new Response(JSON.stringify({ error: "Unauthorized: You do not own this store" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === "get_subscription") {
      const { data: subInfo, error: subErr } = await adminClient.rpc("get_store_subscription", {
        p_store_id: store_id,
      });

      if (subErr) {
        return new Response(JSON.stringify({ error: subErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, subscription: subInfo }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "start_trial") {
      const { data: trialResult, error: trialErr } = await adminClient.rpc("start_or_upgrade_trial", {
        p_store_id: store_id,
        p_plan_id: plan_id,
      });

      if (trialErr) {
        return new Response(JSON.stringify({ error: trialErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(trialResult), {
        status: trialResult?.success ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unsupported action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});