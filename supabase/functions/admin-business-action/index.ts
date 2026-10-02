import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createAdminClient, createUserClient } from "../_shared/cors.ts";

interface AdminActionPayload {
  action: "approve" | "suspend" | "activate" | "reject";
  store_id: string;
  reason?: string;
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

    const adminClient = createAdminClient();

    // Verify caller has 'admin' role in profiles
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: Super-admin privileges required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: AdminActionPayload = await req.json();
    const { action, store_id, reason } = payload;

    if (!action || !store_id) {
      return new Response(JSON.stringify({ error: "action and store_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch target store
    const { data: store, error: storeErr } = await adminClient
      .from("stores")
      .select("id, store_id, business_name, owner_id, is_active, is_approved")
      .eq("id", store_id)
      .single();

    if (storeErr || !store) {
      return new Response(JSON.stringify({ error: "Store not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updateFields: Record<string, any> = {};
    let notificationTitle = "";
    let notificationMsg = "";

    switch (action) {
      case "approve":
        updateFields = { is_approved: true, is_active: true };
        notificationTitle = "Business Approved!";
        notificationMsg = `Congratulations! Your business "${store.business_name}" (${store.store_id}) has been approved and activated.`;
        break;
      case "suspend":
        updateFields = { is_active: false };
        notificationTitle = "Business Account Suspended";
        notificationMsg = `Your business "${store.business_name}" (${store.store_id}) has been suspended. Reason: ${reason || "Policy violation"}. Please contact platform support.`;
        break;
      case "activate":
        updateFields = { is_active: true };
        notificationTitle = "Business Re-activated";
        notificationMsg = `Your business "${store.business_name}" (${store.store_id}) has been re-activated by administration.`;
        break;
      case "reject":
        updateFields = { is_approved: false, is_active: false };
        notificationTitle = "Business Application Rejected";
        notificationMsg = `Your business registration was not approved. Reason: ${reason || "Incomplete information"}.`;
        break;
      default:
        return new Response(JSON.stringify({ error: "Invalid action. Supported: approve, suspend, activate, reject" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Update store
    const { data: updatedStore, error: updateErr } = await adminClient
      .from("stores")
      .update(updateFields)
      .eq("id", store_id)
      .select()
      .single();

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to update store: " + updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send notification to store owner
    if (store.owner_id) {
      await adminClient.from("notifications").insert({
        user_id: store.owner_id,
        type: "admin_notice",
        title: notificationTitle,
        message: notificationMsg,
        data: { store_id, action, reason },
        is_read: false,
      });
    }

    // Record audit log
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: "admin",
      action: `admin_store_${action}`,
      entity: "stores",
      entity_id: store_id,
      metadata: { reason, previous_state: { is_active: store.is_active, is_approved: store.is_approved } },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Store successfully ${action}d`,
        store: updatedStore,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
