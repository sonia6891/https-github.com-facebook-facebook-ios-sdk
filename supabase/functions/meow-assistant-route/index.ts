const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};

const INTENTS = [
  "help","todayShift","tomorrowShift","nextWork","nextOff","monthSummary","overtimeHours",
  "grossPay","estimatedPay","holidayPay","missingOvertime","overtimePay","missingShiftAllowance",
  "shiftAllowance","deductions","payday","annualLeave","reconcileSummary","whyPayChanged","history",
  "unknownDeduction","extraItem","missingItem","rerunPayslip","salaryCalc","freeReconcile",
  "leaveConflict","paystubContents","sickLeavePay","rotationHelp","scheduleGeneral","payrollGeneral",
  "shiftRestInterval","consecutiveWorkDays","workBreak","splitShift","onCallStandby",
  "handoverWorkTime","crossMidnightShift","scheduleChange","shiftSwap","overtimeLimit",
  "compensatoryLeave","holidayTransfer","overtimeWageBase","annualLeaveTermination",
  "pregnancyNightShift","flexibleWorkingHours","article841","partTimeRights","naturalDisaster",
  "mandatoryOvertime","attendanceRecord","trainingMeetingTime","mealBreakOnDuty",
  "scheduleNotice","fixedShift","unknown"
] as const;

const APP_DATA = [
  "schedule","attendance","overtime","leave","salary","payslip","settings","payday",
  "employment","entitlement","none"
] as const;

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

async function serverSelect(path: string) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceRoleKey();
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  const res = await fetch(url + "/rest/v1/" + path, {
    headers: {
      "apikey": key,
      "Authorization": "Bearer " + key,
      "Accept": "application/json"
    },
    signal: AbortSignal.timeout(8_000)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error("SUPABASE_REST_" + res.status);
  return data;
}

async function hasAssistantEntitlement(userId: string) {
  const dev = await serverSelect("app_developer_accounts?select=user_id&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  if (Array.isArray(dev) && dev.length) return { allowed: true, developer: true };

  const rows = await serverSelect("user_entitlements?select=plan,status,pro_until&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  const e = Array.isArray(rows) ? rows[0] : null;
  const active = e &&
    e.plan === "pro" &&
    ["active","trialing","grace_period"].includes(String(e.status || "")) &&
    e.pro_until &&
    Date.parse(String(e.pro_until)) > Date.now();
  return { allowed: !!active, developer: false };
}

function outputText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "understood","normalizedQuery","primaryIntent","secondaryIntents","userGoal","action",
    "appDataNeeded","missingInformation","shouldClarify","clarifyingQuestion","confidence",
    "risk","referencesPriorContext","contextResolution","facts","operation"
  ],
  properties: {
    understood: { type: "boolean" },
    normalizedQuery: { type: "string" },
    primaryIntent: { type: "string", enum: [...INTENTS] },
    secondaryIntents: {
      type: "array",
      items: { type: "string", enum: [...INTENTS] }
    },
    userGoal: { type: "string" },
    action: {
      type: "string",
      enum: ["answer","read_app_data","modify_app_data","navigate","clarify","hybrid"]
    },
    appDataNeeded: {
      type: "array",
      items: { type: "string", enum: [...APP_DATA] }
    },
    missingInformation: {
      type: "array",
      items: { type: "string" }
    },
    shouldClarify: { type: "boolean" },
    clarifyingQuestion: nullableString,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    risk: {
      type: "string",
      enum: ["none","labor_rule","financial_calculation","sensitive_mutation"]
    },
    referencesPriorContext: { type: "boolean" },
    contextResolution: nullableString,
    facts: {
      type: "array",
      items: { type: "string" }
    },
    operation: {
      type: "object",
      additionalProperties: false,
      required: ["kind","dates","fromDate","toDate","hours","year","month"],
      properties: {
        kind: {
          type: "string",
          enum: ["none","add_overtime","remove_overtime","move_overtime","view_schedule"]
        },
        dates: {
          type: "array",
          items: { type: "string" }
        },
        fromDate: nullableString,
        toDate: nullableString,
        hours: { anyOf: [{ type: "number" }, { type: "null" }] },
        year: { anyOf: [{ type: "integer" }, { type: "null" }] },
        month: { anyOf: [{ type: "integer", minimum: 1, maximum: 12 }, { type: "null" }] }
      }
    }
  }
};

const intentGuide = [
  "shiftRestInterval=兩個班次之間休息時間／早跳晚／晚跳早／大夜接白班",
  "consecutiveWorkDays=連續上班很多天、多久沒休",
  "workBreak=單一工作日內的休息時間",
  "splitShift=兩頭班、兩段班、中空班",
  "onCallStandby=on call、待命、備勤、被叫回",
  "handoverWorkTime=交班、交接、提早到／延後走是否算工時",
  "crossMidnightShift=跨午夜班次歸屬",
  "scheduleChange=主管臨時改班",
  "shiftSwap=和同事換班",
  "overtimeLimit=月／三個月加班上限",
  "compensatoryLeave=加班換補休、補休到期",
  "holidayTransfer=國定假日調移",
  "overtimeWageBase=哪些固定工資／津貼要納入加班費計算基礎",
  "annualLeaveTermination=離職時未休特休",
  "pregnancyNightShift=懷孕／哺乳夜班",
  "flexibleWorkingHours=二週／八週／四週變形工時",
  "article841=勞基法84-1、保全等特殊工時",
  "partTimeRights=工讀、兼職、部分工時",
  "naturalDisaster=颱風、天然災害、停班停課",
  "mandatoryOvertime=被強迫／臨時要求加班、能否拒絕",
  "attendanceRecord=先打卡再工作、出勤紀錄不實",
  "trainingMeetingTime=教育訓練、晨會、下班會議是否工時",
  "mealBreakOnDuty=吃飯仍須待命／顧崗位是否算休息",
  "scheduleNotice=班表多久前公布／變更通知",
  "fixedShift=固定大夜／固定晚班與輪班的區別"
].join("\n");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!openaiKey) return json({ ok: false, code: "AI_NOT_CONFIGURED" }, 503);

  const userId = userIdFromAuth(req.headers.get("Authorization"));
  if (!userId) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);

  let entitlement;
  try {
    entitlement = await hasAssistantEntitlement(userId);
  } catch (_) {
    return json({ ok: false, code: "ENTITLEMENT_CHECK_FAILED" }, 503);
  }
  if (!entitlement.allowed) return json({ ok: false, code: "PRO_REQUIRED" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json({ ok: false, code: "INVALID_JSON" }, 400);
  }

  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 800) : "";
  if (!query) return json({ ok: false, code: "EMPTY_QUERY" }, 400);

  const recentContext = (Array.isArray(body?.context) ? body.context : [])
    .slice(-8)
    .map((x: any) => ({
      role: x?.role === "assistant" ? "assistant" : "user",
      text: String(x?.text || "").trim().slice(0, 600)
    }))
    .filter((x: any) => x.text);

  const appContext = body?.appContext && typeof body.appContext === "object"
    ? body.appContext
    : {};

  const instructions = [
    "你是《喵的，又要上班了》Pro 喵助理的『自然語言理解與路由器』。你不直接回答法律、不直接算薪資、不直接修改 App 資料。",
    "你的唯一工作是先理解使用者真正想做什麼，再輸出結構化意圖，交給後續規則、知識庫與 App 資料層。",
    "使用繁體中文理解台灣使用者口語。要能處理錯字、語音辨識錯字、台灣口語、英文縮寫、句子不完整、省略主詞、代名詞、前文承接及一句多意圖。",
    "不要只靠關鍵字。『有沒有夜班津貼』不是『夜班津貼沒有發』；『夜班津貼算不算加班基數』不是一般津貼查詢。",
    "若使用者說『那個』『那筆』『那天』『那九月呢』『第二筆也不是』，必須先看 context 判斷是否引用前文。",
    "若一句話同時包含多個需求，primaryIntent 放最主要需求，secondaryIntents 保留其他需求，不可只抓第一個關鍵字。",
    "若 App 已可從班表／薪資／設定取得資料，appDataNeeded 要列出，不要把這些資料列成 missingInformation。",
    "只有真的缺少使用者沒有提供、App 也通常不會知道的必要條件才 shouldClarify=true。",
    "涉及勞動法適用、工時是否合法、84-1、變形工時、孕期夜班等，risk=labour_rule 對應的值必須是 labor_rule，且不要自行下法律結論。",
    "涉及薪資計算但需要實際班表／薪資資料時 risk=financial_calculation。",
    "涉及刪除、移動、覆蓋紀錄等資料變更時 risk=sensitive_mutation。",
    "如果只是情緒抱怨但同時包含可辨識需求，要理解需求，不要只把它當情緒。",
    "如果使用者明確要求 App 新增／取消／移動加班，或查看某月班表，operation 要輸出結構化操作；不要直接執行，只負責解析。",
    "operation 的日期一律使用 YYYY-MM-DD。相對日期（今天、昨天、明天、禮拜五等）要以 appContext.today 與 recentContext 解析；不確定就 kind=none 並 shouldClarify=true。",
    "承接前文的操作，例如『那個拿掉』『不是22，是24』『移到禮拜五』，只有在 recentContext 能唯一解析對象時才輸出 operation，並 referencesPriorContext=true、contextResolution 說明解析結果。",
    "新增／取消／移動資料屬 sensitive_mutation。若日期或對象無法唯一確定，不可猜測。",
    "查看班表使用 view_schedule，year/month 必須解析完成；修改加班則分別使用 add_overtime、remove_overtime、move_overtime。",
    "意圖對照：\n" + intentGuide
  ].join("\n");

  const userPayload = {
    query,
    recentContext,
    appContext
  };

  const requestBody = {
    model: "gpt-5.6",
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: 1200,
    instructions,
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: "請只做自然語言理解與路由。輸入如下：\n" + JSON.stringify(userPayload)
      }]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "meow_assistant_nlu_route",
        strict: true,
        schema
      }
    }
  };

  let provider: any = null;
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + openaiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(25_000)
    });
    provider = await res.json().catch(() => null);

    if (!res.ok) {
      console.warn("meow-assistant-route upstream rejected request", {
        status: res.status,
        code: String(provider?.error?.code || ""),
        type: String(provider?.error?.type || "")
      });
      return json({
        ok: false,
        code: "ROUTING_REQUEST_FAILED",
        provider_status: res.status,
        provider_code: String(provider?.error?.code || "")
      }, 502);
    }

    const text = outputText(provider);
    let route: any;
    try {
      route = JSON.parse(text);
    } catch (_) {
      return json({ ok: false, code: "ROUTING_OUTPUT_INVALID" }, 502);
    }

    return json({
      ok: true,
      model: provider?.model || "gpt-5.6",
      route,
      usage: {
        input_tokens: Number(provider?.usage?.input_tokens || 0),
        output_tokens: Number(provider?.usage?.output_tokens || 0)
      }
    });
  } catch (_) {
    return json({ ok: false, code: "ROUTING_UNAVAILABLE" }, 502);
  }
});
