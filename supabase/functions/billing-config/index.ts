const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store"
};
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const appleAppId=String(Deno.env.get("APPLE_APP_ID")||"").trim();
  const appleBundleId=String(Deno.env.get("APPLE_BUNDLE_ID")||"com.lumilab.meowwork").trim();
  return new Response(JSON.stringify({
    configured:true,
    provider:"app_store_play",
    store_managed:true,
    monthly:99,
    yearly:790,
    currency:"TWD",
    trial_days:3,
    product_ids:{
      ios:{monthly:"meowwork.pro.monthly",yearly:"meowwork.pro.yearly"},
      android:{monthly:"meowwork.pro.monthly",yearly:"meowwork.pro.yearly"}
    },
    ios:{
      bundle_id:appleBundleId,
      app_id_configured:/^\d+$/.test(appleAppId),
      production_server_verification_ready:/^\d+$/.test(appleAppId)&&appleBundleId==="com.lumilab.meowwork",
      server_notifications_path:"/functions/v1/app-store-notifications-v2"
    }
  }),{headers:cors});
});