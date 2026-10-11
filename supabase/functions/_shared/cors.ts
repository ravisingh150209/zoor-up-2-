// Supabase Edge Functions Shared CORS Headers & Client Factory
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PRODUCTION_FRONTEND_ORIGIN = Deno.env.get("FRONTEND_URL") ?? "https://zoor-up-9b3a3.web.app";

const allowedOrigins = (Deno.env.get("CORS_ORIGINS") ?? PRODUCTION_FRONTEND_ORIGIN)
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigins.join(","),
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
  "Access-Control-Allow-Credentials": "true",
  "Vary": "Origin",
};

export function handleCors(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export function getSupabaseUserClient(authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}
