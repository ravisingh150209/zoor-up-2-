import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors, getSupabaseAdmin, getSupabaseUserClient } from "../_shared/cors.ts";

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id, amount, currency } = await req.json();

    if (!order_id || !amount) {
      return new Response(JSON.stringify({ error: "Order ID and amount are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();

    // Verify order exists in DB
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, order_number, store_id, customer_id, total, status")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify amount matches database order total
    const orderTotalPaise = Math.round(Number(order.total) * 100);
    const requestedPaise = Math.round(Number(amount) * 100);

    if (orderTotalPaise !== requestedPaise) {
      return new Response(JSON.stringify({ error: "Payment amount does not match verified order total." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") || "rzp_test_mock_zoorup_key";
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") || "rzp_test_mock_zoorup_secret";

    // Call Razorpay Orders API
    let razorpayOrderId = `order_${Math.random().toString(36).substring(2, 14)}`;
    
    // In production environment with live keys
    if (Deno.env.get("RAZORPAY_KEY_ID")) {
      const basicAuth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: orderTotalPaise,
          currency: currency || "INR",
          receipt: order.order_number,
          notes: { order_id: order.id, store_id: order.store_id },
        }),
      });

      if (!rzpRes.ok) {
        const rzpErr = await rzpRes.json();
        return new Response(JSON.stringify({ error: rzpErr.error?.description || "Failed to create Razorpay order." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const rzpData = await rzpRes.json();
      razorpayOrderId = rzpData.id;
    }

    // Insert pending payment record
    const { data: payment } = await admin
      .from("payments")
      .insert({
        order_id: order.id,
        store_id: order.store_id,
        customer_id: order.customer_id,
        amount: order.total,
        currency: currency || "INR",
        payment_method: "RAZORPAY",
        razorpay_order_id: razorpayOrderId,
        status: "pending",
      })
      .select()
      .single();

    return new Response(JSON.stringify({
      success: true,
      razorpay_order_id: razorpayOrderId,
      amount: orderTotalPaise,
      currency: currency || "INR",
      key_id: razorpayKeyId,
      payment_id: payment?.id,
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
