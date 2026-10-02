import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, handleCors, getSupabaseAdmin } from "../_shared/cors.ts";

async function verifyHmacSha256(secret: string, text: string, expectedHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  const hashArray = Array.from(new Uint8Array(signature));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.toLowerCase() === expectedHex.toLowerCase();
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing required Razorpay payment signature fields." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = Deno.env.get("RAZORPAY_KEY_SECRET") || "rzp_test_mock_zoorup_secret";
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    
    // In mock testing mode without keys, accept test signature
    let isValid = false;
    if (razorpay_signature === "valid_mock_signature" && !Deno.env.get("RAZORPAY_KEY_SECRET")) {
      isValid = true;
    } else {
      isValid = await verifyHmacSha256(secret, payload, razorpay_signature);
    }

    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid payment signature: Potential tampering detected." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();

    // 1. Update Payment Record
    const { data: payment } = await admin
      .from("payments")
      .update({
        razorpay_payment_id,
        razorpay_signature,
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_order_id", razorpay_order_id)
      .select()
      .single();

    if (payment && payment.order_id) {
      // 2. Update Order
      await admin
        .from("orders")
        .update({
          payment_status: "paid",
          status: "confirmed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.order_id);

      // 3. Update Invoice
      await admin
        .from("invoices")
        .update({
          status: "paid",
          paid_amount: payment.amount,
          balance: 0.00,
        })
        .eq("order_id", payment.order_id);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Payment successfully verified and settled.",
      payment_id: payment?.id,
      order_id: payment?.order_id,
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
