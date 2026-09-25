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
  meal: "只對應薪資單明確標示為『伙食津貼』的金額。『餐費補助』『伙食補助』『膳食補助』『餐補』『誤餐費』都是不同項目，不得併入 meal；這些項目若存在，應保留原名稱放入 extraItems。",
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
  const rowCrops = (Array.isArray(body?.rowCrops) ? body.rowCrops : []).slice(0, 24).map((row: any) => ({
    amount: Number(row?.amount),
    x: Number(row?.x) || 0,
    y: Number(row?.y) || 0,
    images: (Array.isArray(row?.images) ? row.images : []).filter((v: any) => typeof v === "string" && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(v)).slice(0, 2)
  })).filter((row: any) => Number.isFinite(row.amount) && row.images.length);
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
    "『伙食津貼』與『餐費補助』是兩個不同的薪資項目，絕對不得合併。只有圖片明確寫『伙食津貼』時才放入 fields.meal；若寫『餐費補助』，必須保留原名稱放入 extraItems，kind=income。",
    "『餐費補助』與『醫療補助』『營運補助』也不得混淆。請逐字辨認前兩個中文字；看不清楚就降低 confidence 或標為不確定，不得依語意猜字。",
    "除了標準欄位外，請把薪資單上確實存在、會影響員工本期實發的其他『加項／應發』或『扣項／應扣』逐列放進 extraItems。",
    "extraItems 的 label 是『逐字轉錄欄位』，不是語意摘要。必須照圖片原字逐字抄寫，不得把看不清楚的字改寫成較合理、較常見或較順口的薪資名稱。看不清楚就不要自創名稱，confidence 要降低。",
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

    let inTok = Number(provider?.usage?.input_tokens || 0);
    let outTok = Number(provider?.usage?.output_tokens || 0);

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

    // Separate exact text transcription from semantic classification for ambiguous
    // subsidy/allowance rows. The amount is used as a visual anchor so the model
    // must locate the exact row, then copy the printed label character-by-character.
    // Two independent image-only reads must agree before we normalize a standard field.
    const extraItems = Array.isArray(parsed?.extraItems) ? parsed.extraItems : [];
    const mealAlreadyReliable =
      parsed?.fields?.meal !== null &&
      parsed?.fields?.meal !== undefined &&
      Number(parsed?.confidence?.meal || 0) >= .78;

    const ambiguousIncomeIndexes = extraItems
      .map((item: any, index: number) => ({ item, index }))
      .filter(({ item }: any) => {
        if (item?.kind !== "income") return false;
        const label = String(item?.label || "").replace(/\s+/g, "");
        return /(補助|補貼|津貼|加給|餐費|伙食|膳食|醫療|營運)/.test(label);
      })
      .slice(0, 3);

    async function exactLabelRead(amount: number, pass: number) {
      const exactLabelSchema = {
        type: "object",
        additionalProperties: false,
        required: ["transcription", "choice", "confidence", "evidence"],
        properties: {
          transcription: { type: "string", minLength: 1, maxLength: 20 },
          choice: {
            type: "string",
            enum: ["伙食津貼", "餐費補助", "伙食補助", "膳食補助", "醫療補助", "交通補助", "其他或不確定"]
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: nullableString
        }
      };

      const matches = rowCrops
        .filter((row: any) => Math.abs(Number(row.amount) - amount) <= 1)
        .slice(0, 3);

      const imageParts: any[] = [];
      if (matches.length) {
        for (const row of matches) {
          const preferred = row.images[Math.min(pass - 1, row.images.length - 1)] || row.images[0];
          if (preferred) imageParts.push({ type: "input_image", image_url: preferred, detail: "original" });
        }
      } else {
        imageParts.push({ type: "input_image", image_url: imageDataUrl, detail: "original" });
      }

      const body = {
        model: "gpt-5.6",
        store: false,
        reasoning: { effort: pass === 1 ? "low" : "medium" },
        max_output_tokens: 420,
        instructions: [
          "你是薪資單『逐字抄寫員』，不是薪資分類器。",
          matches.length
            ? "你現在看到的是從薪資單原圖依金額位置裁出的同一列局部圖，請只讀這一列，不要推測其他區域。"
            : "如果現在是完整薪資單，請先找到指定金額的同一列，再只讀那一列。",
          "請找金額 " + Math.round(amount).toLocaleString("zh-TW") + " 所在的列，逐字抄寫與它配對的項目名稱。",
          "禁止依語意猜字、禁止把不熟悉的名稱改成較合理或較常見的名稱。",
          "『伙食津貼』『餐費補助』『醫療補助』『營運補助』是不同項目，禁止互相改寫。",
          "尤其『餐費』兩字必須看到字形證據才可輸出；『醫療』『營運』亦同。",
          "如果第一、第二個字看不清楚，choice 必須選『其他或不確定』，confidence 必須低於 0.65。",
          "transcription 必須逐字照抄圖片，不能根據 choice 反推 transcription。"
        ].join("\n"),
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "請找金額 " + Math.round(amount).toLocaleString("zh-TW") + " 的那一列，只抄寫與這個金額配對的項目名稱。" },
            ...imageParts
          ]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "payroll_exact_label_read_" + pass,
            strict: true,
            schema: exactLabelSchema
          }
        }
      };

      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + openaiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
      });
      const provider2 = await res.json().catch(() => null);
      inTok += Number(provider2?.usage?.input_tokens || 0);
      outTok += Number(provider2?.usage?.output_tokens || 0);
      if (!res.ok) return null;
      try { return JSON.parse(outputText(provider2)); }
      catch (_) { return null; }
    }

    for (const { item, index } of ambiguousIncomeIndexes) {
      const amount = Number(item?.amount);
      if (!Number.isFinite(amount) || amount < 0) continue;

      try {
        const first = await exactLabelRead(amount, 1);
        const second = await exactLabelRead(amount, 2);
        if (!first || !second) {
          item.label = "名稱待確認";
          item.confidence = Math.min(Number(item.confidence) || .5, .5);
          continue;
        }

        const t1 = String(first.transcription || "").replace(/\s+/g, "");
        const t2 = String(second.transcription || "").replace(/\s+/g, "");
        const c1 = String(first.choice || "");
        const c2 = String(second.choice || "");
        const cf1 = Math.max(0, Math.min(1, Number(first.confidence) || 0));
        const cf2 = Math.max(0, Math.min(1, Number(second.confidence) || 0));
        const exactAgreement = t1 && t2 && t1 === t2 && cf1 >= .78 && cf2 >= .78;
        const choiceAgreement = c1 === c2 && c1 !== "其他或不確定" && cf1 >= .82 && cf2 >= .82;
        const knownChoices = new Set(["伙食津貼","餐費補助","伙食補助","膳食補助","醫療補助","交通補助"]);
        const trustedKnown = exactAgreement && choiceAgreement && t1 === c1 && knownChoices.has(c1);

        if (trustedKnown) {
          const resolved = c1;
          item.label = resolved;
          item.confidence = Math.min(.99, Math.max(cf1, cf2));

          if (resolved === "餐費補助") {
            // Keep it as a separate extra income item. It is NOT 伙食津貼.
            item.kind = "income";
          }

          if (!mealAlreadyReliable && resolved === "伙食津貼") {
            parsed.fields = parsed.fields || {};
            parsed.confidence = parsed.confidence || {};
            parsed.evidence = parsed.evidence || {};
            parsed.fields.meal = amount;
            parsed.confidence.meal = Math.min(.99, Math.min(cf1, cf2));
            parsed.evidence.meal = resolved + " " + Math.round(amount).toLocaleString("zh-TW");
            extraItems[index] = null;
            parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
            parsed.notes.push("補助項目已以金額定位並經兩次獨立影像逐字複核，確認為 " + resolved + "。");
          }
        } else {
          const sameUnknown = exactAgreement && t1 === t2 ? t1 : "";
          item.label = sameUnknown
            ? "名稱待確認（讀到：" + sameUnknown + "）"
            : "名稱待確認（兩次逐字判讀不一致）";
          item.confidence = Math.min(cf1 || .5, cf2 || .5, .5);
          parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
          parsed.notes.push("金額 " + Math.round(amount).toLocaleString("zh-TW") + " 的補助項目未達到兩次逐字辨讀完全一致且分類一致的門檻，因此未自動命名。");
        }
      } catch (_) {
        item.label = "名稱待確認";
        item.confidence = Math.min(Number(item.confidence) || .5, .5);
      }
    }

    parsed.extraItems = extraItems.filter(Boolean);

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
