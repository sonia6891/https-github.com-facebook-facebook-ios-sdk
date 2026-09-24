const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    ok: false,
    code: "FEATURE_REMOVED",
    message: "The former Pro AI assistant was removed. Schedule import stays on-device; Pro payslip cross-verification is handled by the protected payslip-verify service."
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
});
