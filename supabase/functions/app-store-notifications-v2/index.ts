import { createClient } from "npm:@supabase/supabase-js@2";
import {
  Environment,
  OfferDiscountType,
  OfferType,
  SignedDataVerifier
} from "npm:@apple/app-store-server-library@3.1.0";
import { Buffer } from "node:buffer";

const BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID") || "com.lumilab.meowwork";
const APPLE_APP_ID = Number(Deno.env.get("APPLE_APP_ID") || 0) || undefined;
const PRODUCTS = new Set(["meowwork.pro.monthly","meowwork.pro.yearly"]);
const ROOT_URLS = [
  "https://www.apple.com/appleca/AppleIncRootCertificate.cer",
  "https://www.apple.com/certificateauthority/AppleRootCA-G2.cer",
  "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer"
];
let rootPromise: Promise<Buffer[]> | null = null;

function getKey(name:string, legacy:string){
  try{
    const raw=Deno.env.get(name);
    if(raw){
      const parsed=JSON.parse(raw);
      if(parsed?.default)return parsed.default as string;
    }
  }catch{}
  return Deno.env.get(legacy)||"";
}
async function appleRoots(){
  if(!rootPromise){
    rootPromise=Promise.all(ROOT_URLS.map(async url=>{
      const res=await fetch(url);
      if(!res.ok)throw new Error("apple_root_fetch_failed");
      return Buffer.from(await res.arrayBuffer());
    }));
  }
  return rootPromise;
}
function peekPayload(jws:string){
  const parts=jws.split(".");
  if(parts.length!==3)throw new Error("invalid_jws");
  return JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));
}
function environmentFromJws(jws:string){
  const payload=peekPayload(jws);
  const raw=payload?.environment || payload?.data?.environment;
  return raw==="Production"?Environment.PRODUCTION:Environment.SANDBOX;
}
async function verifierFor(jws:string){
  const env=environmentFromJws(jws);
  if(env===Environment.PRODUCTION&&!APPLE_APP_ID)throw new Error("apple_app_id_not_configured");
  return new SignedDataVerifier(
    await appleRoots(),
    true,
    env,
    BUNDLE_ID,
    env===Environment.PRODUCTION?APPLE_APP_ID:undefined
  );
}
function isTrial(tx:any){
  return Number(tx?.offerType)===Number(OfferType.INTRODUCTORY_OFFER)
    && String(tx?.offerDiscountType||"")===String(OfferDiscountType.FREE_TRIAL);
}
function iso(ms:any){
  const n=Number(ms||0);
  return n>0?new Date(n).toISOString():null;
}

function statusFromApple(notificationType:string,subtype:string,dataStatus:any,tx:any){
  if(notificationType==="REFUND"||notificationType==="REVOKE"||Number(tx?.revocationDate||0)>0)return "expired";
  if(notificationType==="EXPIRED"||notificationType==="GRACE_PERIOD_EXPIRED")return "expired";
  if(notificationType==="DID_FAIL_TO_RENEW"){
    return subtype==="GRACE_PERIOD"||Number(dataStatus)===4?"grace_period":"past_due";
  }
  if(Number(dataStatus)===4)return "grace_period";
  if(Number(dataStatus)===3)return "past_due";
  if(Number(dataStatus)===2||Number(dataStatus)===5)return "expired";
  const expires=Number(tx?.expiresDate||0);
  if(expires&&expires<=Date.now())return "expired";
  return isTrial(tx)?"trialing":"active";
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return new Response("OK",{status:200});
  try{
    const body=await req.json().catch(()=>({}));
    const signedPayload=String(body?.signedPayload||"");
    if(!signedPayload)return new Response("missing signedPayload",{status:400});

    const verifier=await verifierFor(signedPayload);
    const notification=await verifier.verifyAndDecodeNotification(signedPayload);
    const notificationType=String(notification.notificationType||"UNKNOWN");
    const subtype=String(notification.subtype||"");
    const eventId="appstore_notification:"+String(notification.notificationUUID||crypto.randomUUID());
    const data:any=notification.data||{};
    let tx:any=null;

    if(data.signedTransactionInfo){
      tx=await verifier.verifyAndDecodeTransaction(String(data.signedTransactionInfo));
      if(tx.bundleId!==BUNDLE_ID)throw new Error("bundle_mismatch");
      if(tx.productId&&!PRODUCTS.has(tx.productId))throw new Error("unknown_product");
    }

    const url=Deno.env.get("SUPABASE_URL")||"";
    const sec=getKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const admin=createClient(url,sec,{auth:{persistSession:false}});

    let userId:string|null=null;
    const token=String(tx?.appAccountToken||"");
    if(/^[0-9a-f-]{36}$/i.test(token)){
      const {data:user}=await admin.auth.admin.getUserById(token);
      if(user?.user)userId=user.user.id;
    }
    if(!userId&&tx?.originalTransactionId){
      const {data:prior}=await admin.from("store_subscription_events")
        .select("user_id")
        .eq("platform","app_store")
        .eq("original_transaction_id",String(tx.originalTransactionId))
        .not("user_id","is",null)
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      userId=prior?.user_id||null;
    }

    const {error:eventError}=await admin.from("store_subscription_events").upsert({
      event_id:eventId,
      platform:"app_store",
      user_id:userId,
      event_type:notificationType,
      subtype:subtype||null,
      product_id:tx?.productId||null,
      transaction_id:tx?.transactionId||null,
      original_transaction_id:tx?.originalTransactionId||null,
      environment:String(data?.environment||tx?.environment||""),
      signed_at:iso(notification.signedDate),
      expires_at:iso(tx?.expiresDate),
      raw:{notification,transaction:tx}
    },{onConflict:"event_id"});
    if(eventError)throw eventError;

    if(notificationType==="TEST")return new Response("OK",{status:200});
    if(!userId||!tx)return new Response("OK",{status:200});

    const status=statusFromApple(notificationType,subtype,data?.status,tx);
    const active=["active","trialing","grace_period"].includes(status);
    const cancelAtPeriodEnd=notificationType==="DID_CHANGE_RENEWAL_STATUS"&&subtype==="AUTO_RENEW_DISABLED"
      ? true
      : notificationType==="DID_CHANGE_RENEWAL_STATUS"&&subtype==="AUTO_RENEW_ENABLED"
        ? false
        : undefined;

    const patch:any={
      user_id:userId,
      plan:active?"pro":"free",
      status,
      pro_until:iso(tx.expiresDate),
      source:"app_store",
      billing_provider:"app_store",
      provider_subscription_id:tx.originalTransactionId,
      updated_at:new Date().toISOString()
    };
    if(isTrial(tx)&&tx.purchaseDate)patch.trial_started_at=iso(tx.purchaseDate);
    if(cancelAtPeriodEnd!==undefined){
      patch.cancel_at_period_end=cancelAtPeriodEnd;
      patch.canceled_at=cancelAtPeriodEnd?new Date().toISOString():null;
    }else if(["DID_RENEW","SUBSCRIBED","RESUBSCRIBE","OFFER_REDEEMED"].includes(notificationType)){
      patch.cancel_at_period_end=false;
      patch.canceled_at=null;
    }

    const {error:entError}=await admin.from("user_entitlements").upsert(patch,{onConflict:"user_id"});
    if(entError)throw entError;

    return new Response("OK",{status:200});
  }catch(error){
    console.error("app-store-notifications-v2",error);
    const message=error instanceof Error?error.message:String(error);
    if(message==="apple_app_id_not_configured")return new Response("production config missing",{status:503});
    return new Response("verification failed",{status:400});
  }
});