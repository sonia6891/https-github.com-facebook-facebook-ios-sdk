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

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8"
};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"method_not_allowed"}),{status:405,headers:cors});
  try{
    const auth=req.headers.get("Authorization")||"";
    const token=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!token)return new Response(JSON.stringify({error:"not_authenticated"}),{status:401,headers:cors});

    const url=Deno.env.get("SUPABASE_URL")||"";
    const pub=getKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const sec=getKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    const userClient=createClient(url,pub,{auth:{persistSession:false}});
    const {data:ud,error:ue}=await userClient.auth.getUser(token);
    const user=ud?.user;
    if(ue||!user)return new Response(JSON.stringify({error:"invalid_session"}),{status:401,headers:cors});

    const body=await req.json().catch(()=>({}));
    const signedTransaction=String(body?.signedTransaction||"");
    if(!signedTransaction)return new Response(JSON.stringify({error:"missing_signed_transaction"}),{status:400,headers:cors});

    const verifier=await verifierFor(signedTransaction);
    const tx=await verifier.verifyAndDecodeTransaction(signedTransaction);

    if(tx.bundleId!==BUNDLE_ID)return new Response(JSON.stringify({error:"bundle_mismatch"}),{status:400,headers:cors});
    if(!tx.productId||!PRODUCTS.has(tx.productId))return new Response(JSON.stringify({error:"unknown_product"}),{status:400,headers:cors});
    if(!tx.transactionId||!tx.originalTransactionId)return new Response(JSON.stringify({error:"missing_transaction_ids"}),{status:400,headers:cors});
    if(String(tx.appAccountToken||"").toLowerCase()!==String(user.id).toLowerCase()){
      return new Response(JSON.stringify({error:"account_token_mismatch"}),{status:403,headers:cors});
    }

    const now=Date.now();
    const expires=Number(tx.expiresDate||0);
    const revoked=Number(tx.revocationDate||0)>0;
    const active=!revoked&&expires>now;
    const status=active?(isTrial(tx)?"trialing":"active"):"expired";
    const plan=active?"pro":"free";
    const trialStarted=isTrial(tx)?iso(tx.purchaseDate):null;
    const admin=createClient(url,sec,{auth:{persistSession:false}});

    const {error:eventError}=await admin.from("store_subscription_events").upsert({
      event_id:"appstore_tx:"+tx.transactionId,
      platform:"app_store",
      user_id:user.id,
      event_type:"CLIENT_VERIFIED_TRANSACTION",
      subtype:isTrial(tx)?"FREE_TRIAL":null,
      product_id:tx.productId,
      transaction_id:tx.transactionId,
      original_transaction_id:tx.originalTransactionId,
      environment:String(tx.environment||""),
      signed_at:iso(tx.signedDate),
      expires_at:iso(tx.expiresDate),
      raw:tx
    },{onConflict:"event_id"});
    if(eventError)throw eventError;

    const entitlement:any={
      user_id:user.id,
      plan,
      status,
      pro_until:iso(tx.expiresDate),
      source:"app_store",
      billing_provider:"app_store",
      provider_subscription_id:tx.originalTransactionId,
      cancel_at_period_end:false,
      canceled_at:null,
      updated_at:new Date().toISOString()
    };
    if(trialStarted)entitlement.trial_started_at=trialStarted;

    const {error:entError}=await admin.from("user_entitlements").upsert(entitlement,{onConflict:"user_id"});
    if(entError)throw entError;

    return new Response(JSON.stringify({
      ok:true,
      platform:"app_store",
      plan,
      status,
      product_id:tx.productId,
      expires_at:iso(tx.expiresDate),
      original_transaction_id:tx.originalTransactionId,
      environment:tx.environment
    }),{headers:cors});
  }catch(error){
    console.error("verify-app-store-transaction",error);
    const message=error instanceof Error?error.message:String(error);
    const status=message==="apple_app_id_not_configured"?503:400;
    return new Response(JSON.stringify({error:"app_store_verification_failed",message}),{status,headers:cors});
  }
});