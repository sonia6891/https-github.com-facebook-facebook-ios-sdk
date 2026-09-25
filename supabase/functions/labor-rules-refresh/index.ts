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

function baseUrl() {
  return Deno.env.get("SUPABASE_URL") || "";
}

async function adminRest(path: string, init: RequestInit = {}) {
  const url = baseUrl();
  const key = serviceRoleKey();
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("Prefer")) headers.set("Prefer", "return=representation");
  const res = await fetch(url + "/rest/v1/" + path, { ...init, headers, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) throw new Error("SUPABASE_REST_" + res.status + ":" + String(text).slice(0, 300));
  return data;
}

function stripHtml(html: string) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function containsAny(text: string, phrases: string[]) {
  return phrases.some((p) => text.includes(p));
}

function parseSource(parserKind: string, text: string) {
  const detected: Record<string, unknown> = { parserKind };
  if (parserKind === "marriage_leave_law") {
    if (/婚假(?:為|)十四日|婚假14日|婚假十四日/.test(text)) detected.days = 14;
    else if (/婚假(?:為|)八日|婚假8日|婚假八日/.test(text)) detected.days = 8;
    detected.formalLaw = true;
  } else if (parserKind === "marriage_leave_announcement") {
    if (/婚假.{0,20}(14日|十四日)|由.{0,8}8日.{0,12}(14日|十四日)/.test(text)) detected.days = 14;
    detected.stage = /預告修正|修正草案/.test(text) ? "pending_approval" : "announcement";
    if (/10月1日/.test(text)) detected.proposedEffectiveFrom = "2026-10-01";
  } else if (parserKind === "minimum_wage_announcement") {
    const monthly = text.match(/(?:每月|月薪|最低工資).{0,40}?([23]\d[,，]?\d{3})\s*元/);
    const hourly = text.match(/(?:每小時|時薪).{0,30}?([12]\d{2})\s*元/);
    if (monthly) detected.monthly = Number(monthly[1].replace(/[,，]/g, ""));
    if (hourly) detected.hourly = Number(hourly[1]);
    const pending = containsAny(text, ["將報行政院核定", "報行政院核定"]);
    const approved = containsAny(text, ["經行政院核定", "行政院業核定", "行政院核定通過"]) && !pending;
    detected.stage = approved ? "approved" : pending ? "pending_approval" : "announcement";
    if (/116年1月1日|2027年1月1日/.test(text)) detected.effectiveFrom = "2027-01-01";
  } else if (parserKind === "family_care_leave") {
    if (/全年以七日為限|全年以7日為限/.test(text)) detected.days = 7;
    if (/56小時/.test(text)) detected.hoursAt8HourDay = 56;
    detected.hourlyUnitAllowed = /以.*小時.*請假|小時為請假單位/.test(text);
  } else if (parserKind === "sick_leave_rights") {
    if (/未超過.?10日|未超過「10日」/.test(text)) detected.noAdverseDays = 10;
    detected.proportionalAttendanceBonus = /全勤獎金.{0,30}(比例|按請.*日數)/.test(text);
  } else if (parserKind === "watch_bli_salary_grades") {
    const first = text.match(/第1級.{0,30}?([23]\d[,，]?\d{3})元/);
    if (first) detected.firstGrade = Number(first[1].replace(/[,，]/g, ""));
    detected.effective2026 = /115年1月1日/.test(text);
  } else if (parserKind === "watch_pension_grades") {
    const grade = text.match(/第25級.{0,30}?([23]\d[,，]?\d{3})元/);
    if (grade) detected.grade25 = Number(grade[1].replace(/[,，]/g, ""));
    detected.effective2026 = /115年1月1日/.test(text);
  } else if (parserKind === "watch_nhi_amount_grades") {
    detected.effective2026 = /115年1月1日|115\.01\.01/.test(text);
    const first = text.match(/(?:投保等級\s*)?1\s+([23]\d[,，]?\d{3})\s+([23]\d[,，]?\d{3})以下/);
    if (first) detected.firstGrade = Number(first[1].replace(/[,，]/g, ""));
  } else if (parserKind === "watch_public_holidays") {
    const total = text.match(/總放假日數\s*(\d{3})\s*日/);
    if (total) detected.totalDaysOff = Number(total[1]);
    detected.year2027 = /116年|2027年/.test(text);
  }
  return detected;
}

async function patchRule(filter: string, body: Record<string, unknown>) {
  return adminRest("labor_rule_versions?" + filter, {
    method: "PATCH",
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() })
  });
}

async function applyDetected(source: any, detected: Record<string, any>, hash: string) {
  const nowDate = new Date().toISOString().slice(0, 10);
  const verified_at = new Date().toISOString();

  if (source.parser_kind === "marriage_leave_law" && detected.days === 14) {
    const status = nowDate >= "2026-10-01" ? "effective" : "approved";
    await patchRule(
      "jurisdiction=eq.TW&rule_key=eq.marriage_leave&status=in.(pending_approval,approved)&effective_from=eq.2026-10-01",
      { status, source_url: source.source_url, source_title: "勞工請假規則第2條（正式條文）", source_hash: hash, verified_at }
    );
    if (status === "effective") {
      await patchRule(
        "jurisdiction=eq.TW&rule_key=eq.marriage_leave&status=eq.effective&effective_from=eq.2026-01-01",
        { effective_to: "2026-09-30", source_hash: hash, verified_at }
      );
    }
  }

  if (source.parser_kind === "marriage_leave_announcement" && detected.days === 14) {
    await patchRule(
      "jurisdiction=eq.TW&rule_key=eq.marriage_leave&status=eq.pending_approval&effective_from=eq.2026-10-01",
      { source_hash: hash, verified_at }
    );
  }

  if (source.parser_kind === "minimum_wage_announcement" &&
      detected.monthly === 30900 && detected.hourly === 205) {
    const status = detected.stage === "approved"
      ? (nowDate >= "2027-01-01" ? "effective" : "approved")
      : "pending_approval";
    await patchRule(
      "jurisdiction=eq.TW&rule_key=eq.minimum_wage&status=in.(pending_approval,approved)&effective_from=eq.2027-01-01",
      { status, source_hash: hash, verified_at }
    );
    if (status === "effective") {
      await patchRule(
        "jurisdiction=eq.TW&rule_key=eq.minimum_wage&status=eq.effective&effective_from=eq.2026-01-01",
        { effective_to: "2026-12-31", source_hash: hash, verified_at }
      );
    }
  }

  if (source.parser_kind === "family_care_leave" && detected.days === 7) {
    await patchRule(
      "jurisdiction=eq.TW&rule_key=eq.family_care_leave&status=eq.effective&effective_from=eq.2026-01-01",
      { source_hash: hash, verified_at }
    );
  }

  if (source.parser_kind === "sick_leave_rights" && detected.noAdverseDays === 10) {
    await patchRule(
      "jurisdiction=eq.TW&rule_key=eq.sick_leave_rights&status=eq.effective&effective_from=eq.2026-01-01",
      { source_hash: hash, verified_at }
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  if (!req.headers.get("Authorization")) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);

  try {
    const rows = await adminRest("labor_rule_sources?enabled=eq.true&select=source_key,rule_key,source_authority,source_url,parser_kind,check_interval_hours,last_content_hash,last_checked_at");
    const sources = Array.isArray(rows) ? rows : [];
    const now = Date.now();
    const results: any[] = [];

    for (const source of sources) {
      const last = source.last_checked_at ? Date.parse(String(source.last_checked_at)) : 0;
      const interval = Math.max(1, Number(source.check_interval_hours || 24)) * 3600_000;
      if (last && now - last < interval) {
        results.push({ sourceKey: source.source_key, skipped: "not_due" });
        continue;
      }

      let httpStatus = 0, hash = "", changed = false, detected: Record<string, unknown> = {}, error = "";
      try {
        const res = await fetch(String(source.source_url), {
          headers: { "User-Agent": "MeowWorkLaborRules/1.0 (+official-source-check)" },
          signal: AbortSignal.timeout(15_000)
        });
        httpStatus = res.status;
        const html = await res.text();
        if (!res.ok) throw new Error("SOURCE_HTTP_" + res.status);
        const text = stripHtml(html);
        hash = await sha256(text);
        changed = !!source.last_content_hash && source.last_content_hash !== hash;
        detected = parseSource(String(source.parser_kind || ""), text);
        await applyDetected(source, detected as Record<string, any>, hash);

        await adminRest("labor_rule_sources?source_key=eq." + encodeURIComponent(source.source_key), {
          method: "PATCH",
          body: JSON.stringify({
            last_content_hash: hash,
            last_checked_at: new Date().toISOString(),
            last_changed_at: changed ? new Date().toISOString() : undefined,
            last_http_status: httpStatus,
            last_error: null,
            updated_at: new Date().toISOString()
          })
        });
      } catch (e) {
        error = String(e && (e as Error).message || e);
        await adminRest("labor_rule_sources?source_key=eq." + encodeURIComponent(source.source_key), {
          method: "PATCH",
          body: JSON.stringify({
            last_checked_at: new Date().toISOString(),
            last_http_status: httpStatus || null,
            last_error: error.slice(0, 500),
            updated_at: new Date().toISOString()
          })
        }).catch(() => null);
      }

      await adminRest("labor_rule_refresh_runs", {
        method: "POST",
        body: JSON.stringify({
          source_key: source.source_key,
          changed,
          http_status: httpStatus || null,
          content_hash: hash || null,
          detected,
          error: error || null
        })
      }).catch(() => null);

      results.push({ sourceKey: source.source_key, httpStatus, changed, detected, error: error || null });
    }

    return json({ ok: true, checked: results.filter((x) => !x.skipped).length, results });
  } catch (e) {
    return json({ ok: false, code: "LABOR_RULE_REFRESH_FAILED", error: String(e && (e as Error).message || e) }, 500);
  }
});
