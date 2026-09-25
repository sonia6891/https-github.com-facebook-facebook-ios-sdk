const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store"
};

const FIELD_KEYS = [
  "actualNet","base","shiftAllowance","meal","performance","transport","otherIncome","otPay",
  "dedLabor","dedHealth","dedWelfare","dedPension","dedAttendance","dedTax","dedHealthExtra","dedOther"
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

async function rpc(name: string, body: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceRoleKey();
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  const res = await fetch(url + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": "Bearer " + key
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error("RPC_" + name + "_" + res.status);
  return data;
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

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const FIELD_DESCRIPTIONS: Record<string,string> = {
  actualNet: "薪資單明確標示的實發、實領、淨額或入帳金額。",
  base: "本薪、底薪、基本薪資或基本工資金額。",
  shiftAllowance: "輪班、夜班、小夜、大夜、中班等班別津貼或加給的金額合計。",
  meal: "伙食、膳食、餐費津貼、餐費補助、伙食補助、膳食補助、餐補或誤餐費等與用餐直接相關的補助金額。",
  performance: "表現、績效、工作、職務等明確獎金或津貼。",
  transport: "交通、通勤、車馬等津貼。",
  otherIncome: "薪資單明確標為其他收入、其他應發或其他薪資的金額。",
  otPay: "明確的加班費、延長工時工資；不得使用時數、時薪或倍率。",
  dedLabor: "員工本人負擔的勞保／勞工保險費。不得填考勤扣款，也不得填雇主負擔。",
  dedHealth: "員工本人負擔的一般健保／全民健康保險費。不得填健保補扣、補充保費或雇主負擔。",
  dedWelfare: "職工福利金、福利費、福委會費等員工扣款。",
  dedPension: "員工自願提繳／自提的勞退退休金。不得填雇主提撥。",
  dedAttendance: "考勤、缺勤、請假、遲到、早退、曠職等造成的扣款或扣薪。",
  dedTax: "薪資所得稅、扣繳稅額、預扣所得稅等。",
  dedHealthExtra: "健保補扣、補繳、追補、二代健保或補充保費。",
  dedOther: "薪資單明確標示的其他扣款或其他代扣。"
};
const fieldProperties = Object.fromEntries(
  FIELD_KEYS.map((k) => [k, { ...nullableNumber, description: FIELD_DESCRIPTIONS[k] || k }])
);
const confidenceProperties = Object.fromEntries(FIELD_KEYS.map((k) => [k, { type: "number", minimum: 0, maximum: 1 }]));
const evidenceProperties = Object.fromEntries(FIELD_KEYS.map((k) => [k, nullableString]));

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["fields", "confidence", "evidence", "extraItems", "notes"],
  properties: {
    fields: {
      type: "object",
      additionalProperties: false,
      required: [...FIELD_KEYS],
      properties: fieldProperties
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: [...FIELD_KEYS],
      properties: confidenceProperties
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: [...FIELD_KEYS],
      properties: evidenceProperties
    },
    extraItems: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount", "kind", "confidence", "evidence"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: 80 },
          amount: { type: "number", minimum: 0 },
          kind: { type: "string", enum: ["income", "deduction"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: nullableString
        }
      }
    },
    notes: {
      type: "array",
      items: { type: "string" },
      maxItems: 12
    }
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!openaiKey) return json({ ok: false, code: "AI_NOT_CONFIGURED" }, 503);

  const userId = userIdFromAuth(req.headers.get("Authorization"));
  if (!userId) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json({ ok: false, code: "INVALID_JSON" }, 400);
  }

  const imageDataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";
  const ocrText = typeof body?.ocrText === "string" ? body.ocrText.slice(0, 16000) : "";
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
    return json({ ok: false, code: "INVALID_IMAGE" }, 400);
  }
  if (imageDataUrl.length > 16_000_000) {
    return json({ ok: false, code: "IMAGE_TOO_LARGE" }, 413);
  }

  let quota: any;
  try {
    quota = await rpc("meow_claim_payslip_ai_usage", { p_user_id: userId, p_limit: 20 });
  } catch (_) {
    return json({ ok: false, code: "USAGE_CHECK_FAILED" }, 503);
  }
  if (!quota?.allowed) {
    const status = quota?.reason === "PRO_REQUIRED" ? 403 : 429;
    return json({ ok: false, code: quota?.reason || "USAGE_DENIED", usage: quota }, status);
  }

  const instructions = [
    "你是台灣繁體中文薪資單的第二判讀器，只做文件辨識與欄位語意分類，不負責決定使用者最後應領薪資。",
    "請獨立閱讀圖片；OCR 原始文字只作輔助，不得因 OCR 某個數字存在就硬套欄位。",
    "只能輸出薪資單上有明確證據的金額；看不清楚、欄位不明或只有推測時填 null。",
    "要區分員工扣款與雇主負擔。雇主負擔的勞保、健保、勞退不可填入員工扣款欄位。",
    "考勤扣款、勞保費、健保費是三個不同欄位：考勤／缺勤／請假／遲到／早退造成的金額只能放 dedAttendance；明確標示勞保／勞工保險的員工自付額只能放 dedLabor；明確標示健保／全民健康保險的一般員工自付額只能放 dedHealth。",
    "健保費 dedHealth 與健保補扣／補充保費 dedHealthExtra 必須分開。只有出現補扣、補繳、追補、補充、二代健保等字樣才放 dedHealthExtra。",
    "如果同一列或同一排同時出現考勤扣款、勞保費、健保費等多個扣款欄位，必須依欄位文字與相鄰／同欄的金額一一配對，不能用金額大小或常見金額猜。",
    "OCR 可能把『考勤』讀成『考前』，把『健保』讀成『建保／健堡／健倸』；遇到這些情況要回看圖片字形與表格位置，不可因此把金額放到別的扣款欄位。",
    "加班費可把明確標示為免稅加班費、應稅加班費、平日/休息日/國定假日加班費等同類金額加總；不要把加班時數、時薪、倍率當成加班費。",
    "輪班/夜班津貼可加總明確同屬班別津貼的金額；不要把班數、天數或時數當成津貼。",
    "otherIncome 與 dedOther 只在薪資單明確標示『其他收入/其他應發』或『其他扣款/其他代扣』時使用，不要把未知項目硬塞進去。",
    "actualNet 必須是薪資單明確的實發/實領/淨額/入帳金額。",
    "confidence 代表你對『欄位分類 + 金額』整體的把握度；欄位為 null 時 confidence 應接近 0。",
    "evidence 請用很短的繁中證據，例如『夜班津貼 6,000』；不確定可填 null。",
    "不要根據一般薪資常識補數字，不要用總額反推缺少欄位。",
    "『餐費補助』與『醫療補助』不得混淆。只要圖片或 OCR 有明確的『餐費、伙食、膳食、餐補、誤餐』字樣，就必須歸類到 meal，並保留餐費／伙食語意；除非圖片清楚出現『醫療』二字，否則不得改寫成『醫療補助』或其他醫療項目。",
    "除了標準欄位外，請把薪資單上確實存在、會影響員工本期實發的其他『加項／應發』或『扣項／應扣』逐列放進 extraItems。",
    "extraItems 必須盡量保留薪資單原本的項目名稱，例如『眷屬健保補扣』『停車費』『工會費』『職務加給』『專案獎金』；不得擅自把可辨識的原始名稱改成不同語意的名稱；kind 只能是 income 或 deduction。",
    "已經能分類到標準 fields 的項目不要重複放進 extraItems；實發、應發合計、應扣合計、總額、小計、時數、天數、費率、倍率也不要放進 extraItems。",
    "雇主負擔或雇主提撥的項目不屬於員工實發加減，不得放入 extraItems。",
    "extraItems 看不清楚名稱、金額或加扣方向時不要猜，寧可省略；confidence 低於 0.55 的項目不要輸出。"
  ].join("\n");

  const userText = "請從薪資單影像獨立抽取標準欄位。以下是 Apple Vision 產生的原始 OCR 文字，只作輔助；請以圖片證據為主。\n\n【OCR 原文】\n" + (ocrText || "（無）");

  const requestBody = {
    model: "gpt-5.6",
    store: false,
    reasoning: { effort: "medium" },
    max_output_tokens: 2800,
    instructions,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: userText },
        { type: "input_image", image_url: imageDataUrl, detail: "original" }
      ]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "payslip_cross_verification",
        strict: true,
        schema
      }
    }
  };

  let provider: any = null;
  try {
    let res: Response | null = null;
    const retryable = new Set([429, 500, 502, 503, 504]);
    for (let attempt = 0; attempt < 2; attempt++) {
      provider = null;
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + openaiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(45_000)
      });
      provider = await res.json().catch(() => null);
      if (res.ok || !retryable.has(res.status) || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    if (!res) throw new Error("OPENAI_NO_RESPONSE");

    const inTok = Number(provider?.usage?.input_tokens || 0);
    const outTok = Number(provider?.usage?.output_tokens || 0);

    if (!res.ok) {
      console.warn("payslip-verify upstream rejected request", {
        status: res.status,
        code: String(provider?.error?.code || ""),
        type: String(provider?.error?.type || "")
      });
      await rpc("meow_finalize_payslip_ai_usage", {
        p_user_id: userId, p_success: false,
        p_input_tokens: inTok, p_output_tokens: outTok
      }).catch(() => null);
      return json({
        ok: false,
        code: "ANALYSIS_REQUEST_FAILED",
        provider_status: res.status,
        provider_code: String(provider?.error?.code || ""),
        usage: quota
      }, 502);
    }

    const text = outputText(provider);
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      await rpc("meow_finalize_payslip_ai_usage", {
        p_user_id: userId, p_success: false,
        p_input_tokens: inTok, p_output_tokens: outTok
      }).catch(() => null);
      return json({ ok: false, code: "ANALYSIS_OUTPUT_INVALID", usage: quota }, 502);
    }

    await rpc("meow_finalize_payslip_ai_usage", {
      p_user_id: userId, p_success: true,
      p_input_tokens: inTok, p_output_tokens: outTok
    }).catch(() => null);

    return json({
      ok: true,
      model: provider?.model || "gpt-5.6",
      fields: parsed.fields,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
      extraItems: Array.isArray(parsed.extraItems) ? parsed.extraItems : [],
      notes: parsed.notes,
      usage: quota
    });
  } catch (_) {
    const inTok = Number(provider?.usage?.input_tokens || 0);
    const outTok = Number(provider?.usage?.output_tokens || 0);
    await rpc("meow_finalize_payslip_ai_usage", {
      p_user_id: userId, p_success: false,
      p_input_tokens: inTok, p_output_tokens: outTok
    }).catch(() => null);
    return json({ ok: false, code: "ANALYSIS_UNAVAILABLE", usage: quota }, 502);
  }
});
