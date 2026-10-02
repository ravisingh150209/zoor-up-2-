import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/cors.ts";

async function verifyWebhookSignature(secret: string, bodyText: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(bodyText));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.toLowerCase() === signature.toLowerCase();
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const signature = req.headers.get("x-razorpay-signature");
    const rawBody = await req.text();

    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "rzp_webhook_secret";

    if (Deno.env.get("RAZORPAY_WEBHOOK_SECRET")) {
      if (!signature) {
        return new Response("Missing signature header", { status: 400 });
      }
      const isValid = await verifyWebhookSignature(webhookSecret, rawBody, signature);
      if (!isValid) {
        return new Response("Invalid webhook signature", { status: 401 });
      }
    }

    const event = JSON.parse(rawBody);
    const admin = getSupabaseAdmin();

    const eventType = event.event;
    const payload = event.payload;

    if (eventType === "payment.captured" || eventType === "order.paid") {
      const paymentEntity = payload.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      const rzpPaymentId = paymentEntity?.id;

      if (rzpOrderId) {
        // Update payments
        const { data: payment } = await admin
          .from("payments")
          .update({
            status: "paid",
            razorpay_payment_id: rzpPaymentId,
            updated_at: new Date().toISOString(),
          })
          .eq("razorpay_order_id", rzpOrderId)
          .select()
          .single();

        if (payment && payment.order_id) {
          await admin
            .from("orders")
            .update({ payment_status: "paid", status: "confirmed", updated_at: new Date().toISOString() })
            .eq("id", payment.order_id);

          await admin
            .from("invoices")
            .update({ status: "paid", balance: 0.00 })
            .eq("order_id", payment.order_id);
        }
      }
    } else if (eventType === "payment.failed") {
      const rzpOrderId = payload.payment?.entity?.order_id;
      if (rzpOrderId) {
        await admin
          .from("payments")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("razorpay_order_id", rzpOrderId);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
