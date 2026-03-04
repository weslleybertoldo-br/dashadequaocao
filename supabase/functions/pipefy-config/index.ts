import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const config = {
    phase9: Deno.env.get("PIPEFY_PHASE9_ID") || "323044836",
    phase10: Deno.env.get("PIPEFY_PHASE10_ID") || "326702699",
    phase5: Deno.env.get("PIPEFY_PHASE5_ID") || "333848127",
  };

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
