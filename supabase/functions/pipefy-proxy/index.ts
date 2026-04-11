import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://dashadequaocao.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Phase ID defaults from secrets
const PHASE_DEFAULTS: Record<string, string | undefined> = {
  phase9: Deno.env.get("PIPEFY_PHASE9_ID"),
  phase10: Deno.env.get("PIPEFY_PHASE10_ID"),
  phase5: Deno.env.get("PIPEFY_PHASE5_ID"),
};

async function fetchWithRetry(token: string, query: string, variables?: any) {
  const maxRetries = 3;
  const retryableStatuses = [502, 503, 504];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    const response = await fetch("https://api.pipefy.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (retryableStatuses.includes(response.status)) {
      await response.text();
      if (attempt < maxRetries - 1) continue;
      return { error: `Pipefy returned HTTP ${response.status} after ${maxRetries} attempts`, status: 502 };
    }

    const text = await response.text();
    try {
      return { data: JSON.parse(text), status: 200 };
    } catch {
      return { error: `Pipefy returned non-JSON (HTTP ${response.status})`, body: text.substring(0, 500), status: 502 };
    }
  }

  return { error: "Max retries reached", status: 502 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token: bodyToken, query, variables } = await req.json();

    const token = bodyToken || Deno.env.get("PIPEFY_TOKEN");

    if (!token || !query) {
      return new Response(
        JSON.stringify({ error: "Missing 'token' or 'query' in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await fetchWithRetry(token, query, variables);

    return new Response(JSON.stringify(result.data ?? { error: result.error, body: result.body }), {
      status: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
