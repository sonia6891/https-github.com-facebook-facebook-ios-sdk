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
    message: "Cloud Pro AI assistant is not part of the current app. Schedule and payroll intelligence run on device."
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
});
