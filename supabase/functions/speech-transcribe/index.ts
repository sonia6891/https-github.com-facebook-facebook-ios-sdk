const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

function serviceRoleKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed && typeof parsed.default === "string") return parsed.default;
      if (parsed && typeof parsed === "object") {
        const first = Object.values(parsed).find((v) => typeof v === "string");
        if (typeof first === "string") return first;
      }
    } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function userIdFromAuth(header: string | null) {
  if (!header) return "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const part = token.split(".")[1];
  if (!part) return "";
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === "string" ? payload.sub : "";
  } catch (_) {
    return "";
  }
}

async function hasAssistantAccess(authHeader: string) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceRoleKey();
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  const res = await fetch(url + "/rest/v1/rpc/meow_account_access", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": authHeader
    },
    body: "{}"
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error("ACCESS_CHECK_FAILED");
  return data?.access_tier === "developer" || data?.access_tier === "pro";
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(audio\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const raw = atob(match[2]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return { mime, bytes };
}

function extensionFor(mime: string) {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const userId = userIdFromAuth(authHeader);
  if (!userId) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);

  try {
    if (!(await hasAssistantAccess(authHeader))) return json({ ok: false, code: "PRO_REQUIRED" }, 403);
  } catch (_) {
    return json({ ok: false, code: "ENTITLEMENT_CHECK_FAILED" }, 503);
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!openaiKey) return json({ ok: false, code: "OPENAI_NOT_CONFIGURED" }, 503);

  let body: any;
  try { body = await req.json(); }
  catch (_) { return json({ ok: false, code: "INVALID_JSON" }, 400); }

  const audioDataUrl = typeof body?.audioDataUrl === "string" ? body.audioDataUrl : "";
  if (!audioDataUrl || audioDataUrl.length > 8_000_000) {
    return json({ ok: false, code: "INVALID_AUDIO" }, 400);
  }

  const decoded = decodeDataUrl(audioDataUrl);
  if (!decoded || decoded.bytes.byteLength < 500) {
    return json({ ok: false, code: "INVALID_AUDIO" }, 400);
  }

  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "zh");
  form.append("prompt", "台灣繁體中文。這是輪班工作 App 的簡短語音指令，請保留日期、時數、班別、加班、請假、特休等詞意。");
  form.append("file", new Blob([decoded.bytes], { type: decoded.mime }), "voice." + extensionFor(decoded.mime));

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + openaiKey },
      body: form,
      signal: AbortSignal.timeout(30_000)
    });
  } catch (_) {
    return json({ ok: false, code: "TRANSCRIPTION_UNAVAILABLE" }, 502);
  }

  const provider = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    console.warn("speech-transcribe upstream error", upstream.status, provider?.error?.code || "");
    return json({ ok: false, code: "TRANSCRIPTION_FAILED" }, 502);
  }

  const text = typeof provider?.text === "string" ? provider.text.trim() : "";
  if (!text) return json({ ok: false, code: "NO_SPEECH" }, 422);

  return json({ ok: true, text, model: "gpt-4o-mini-transcribe" });
});
