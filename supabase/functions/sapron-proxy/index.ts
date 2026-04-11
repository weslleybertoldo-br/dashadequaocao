import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://dashadequaocao.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SAPRON_BASE_URL = "https://api.sapron.com.br";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { endpoint } = await req.json();

    const apiKey = Deno.env.get("SAPRON_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "SAPRON_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: "Missing 'endpoint' in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only allow specific endpoints
    const allowedEndpoints = [
      "property/status_log/",
      "properties/properties_list/",
    ];

    const normalizedEndpoint = endpoint.endsWith("/") ? endpoint : endpoint + "/";
    if (!allowedEndpoints.includes(normalizedEndpoint)) {
      return new Response(
        JSON.stringify({ error: `Endpoint not allowed: ${endpoint}` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `${SAPRON_BASE_URL}/${normalizedEndpoint}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-SAPRON-API-KEY": apiKey,
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Sapron returned HTTP ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
