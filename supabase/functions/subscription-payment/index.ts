import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createAdminClient, createUserClient } from "../_shared/cors.ts";

interface SubscriptionPaymentPayload {
  action: "get_subscription" | "start_trial" | "create_order" | "verify_and_activate";
  store_id: string;
  plan_id?: string;
  billing_cycle?: "monthly" | "yearly";
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
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
      billing_cycle = "monthly",
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = payload;

    if (!store_id || !action) {
      return new Response(JSON.stringify({ error: "store_id and action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();

    // Verify caller is the store owner or admin
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

    // ACTION: get_subscription
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

    // ACTION: start_trial
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

    // Fetch plan details from database for payment flows
    const normalizedPlanId = plan_id.toUpperCase();
    const { data: plan, error: planErr } = await adminClient
      .from("subscription_plans")
      .select("*")
      .eq("id", normalizedPlanId)
      .eq("is_active", true)
      .single();

    if (planErr || !plan) {
      return new Response(JSON.stringify({ error: "Invalid or inactive subscription plan" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const planPrice = Number(plan.price_monthly);
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") || "rzp_test_placeholder";
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") || "secret_placeholder";

    // ACTION: create_order
    if (action === "create_order") {
      if (planPrice === 0) {
        // FREE plan immediately activated
        await adminClient.rpc("start_or_upgrade_trial", {
          p_store_id: store_id,
          p_plan_id: "FREE",
        });

        return new Response(
          JSON.stringify({
            success: true,
            free_tier: true,
            message: "Free plan activated successfully",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const amountPaise = Math.round(planPrice * 100);
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: "INR",
          receipt: `sub_${store_id.slice(0, 8)}_${Date.now()}`,
          notes: {
            store_id,
            plan_id: plan.id,
            plan_name: plan.name,
            type: "subscription",
          },
        }),
      });

      if (!rzpRes.ok) {
        const rzpErr = await rzpRes.json();
        return new Response(JSON.stringify({ error: "Razorpay error: " + (rzpErr.error?.description || "Failed") }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rzpOrder = await rzpRes.json();
      return new Response(
        JSON.stringify({
          success: true,
          key_id: razorpayKeyId,
          order_id: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          plan: {
            id: plan.id,
            name: plan.name,
            price: plan.price_monthly,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: verify_and_activate
    if (action === "verify_and_activate") {
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return new Response(
          JSON.stringify({ error: "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify HMAC-SHA256 signature
      const textToSign = `${razorpay_order_id}|${razorpay_payment_id}`;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(razorpayKeySecret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(textToSign));
      const generatedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (generatedSignature !== razorpay_signature) {
        return new Response(JSON.stringify({ error: "Invalid payment signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Calculate period
      const startDate = new Date();
      const endDate = new Date(startDate);
      if (billing_cycle === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      // Transition TRIAL -> ACTIVE Paid Subscription
      const { data: updatedSub, error: subErr } = await adminClient
        .from("subscriptions")
        .upsert(
          {
            store_id,
            user_id: user.id,
            plan_id: plan.id,
            status: "active",
            subscription_status: "ACTIVE",
            trial_status: "NOT_APPLICABLE",
            payment_status: "PAID",
            last_payment_id: razorpay_payment_id,
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString(),
            subscription_started_at: startDate.toISOString(),
            subscription_ends_at: endDate.toISOString(),
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_id" }
        )
        .select()
        .single();

      if (subErr) {
        return new Response(JSON.stringify({ error: "Failed to update subscription: " + subErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Record audit log
      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        actor_role: profile.role,
        action: "subscription_paid_upgrade",
        entity: "subscriptions",
        entity_id: updatedSub.id,
        metadata: {
          store_id,
          plan_name: plan.name,
          payment_id: razorpay_payment_id,
          amount_paid: planPrice,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Subscription successfully updated to ${plan.name} (ACTIVE)`,
          subscription: updatedSub,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
