const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const legacyEdge = fs.readFileSync('supabase/functions/pro-ai/index.ts', 'utf8');
const payslipEdge = fs.readFileSync('supabase/functions/payslip-verify/index.ts', 'utf8');

{
  const build = html.match(/<meta name="meow-ui-build" content="v(\d+)[^"]*">/);
  assert(build && Number(build[1]) >= 125, 'expected current app build v125 or newer');
}

// Generic cloud assistant stays removed.
assert(!html.includes('ai_pro_suite'), 'removed Pro AI suite must not return');
assert(!html.includes('id="proAiPanel"'), 'removed Pro AI panel must not return');
assert(!html.includes('aiAssistantQuestion'), 'assistant input must not return');
assert(html.includes('id="meowAssistantDialog"'), 'local schedule Meow Assistant missing');
assert(html.includes("meow_schedule_assistant:{label:'喵助理・排班指令',tier:'pro'}"), 'schedule assistant entitlement missing');
assert(!html.includes("invokeUserFunction('pro-ai'"), 'schedule assistant commands must not call legacy cloud AI');
assert(html.includes("type:'viewSchedule'"), 'schedule assistant must support month schedule viewing');
assert(html.includes("from('user_sync_state').select('payload,updated_at')"), 'month schedule viewer may read the user\'s Pro cloud backup');
assert(!html.includes('用一句話幫你改加班日期'), 'assistant should not show the old verbose subtitle');
assert(!html.includes('aiAssistantQuestion'), 'generic cloud assistant input must not return');
assert(!html.includes("invokeUserFunction('pro-ai'"), 'app must not call legacy cloud Pro AI');
assert(!legacyEdge.includes('OPENAI_API_KEY'), 'disabled legacy backend must not require an OpenAI key');
assert(!legacyEdge.includes('api.openai.com'), 'disabled legacy backend must not call OpenAI');
assert(legacyEdge.includes('FEATURE_REMOVED'), 'legacy pro-ai endpoint must remain hard-disabled');

// Payslip is intentionally cross-validated: Apple Vision -> OpenAI -> local salary engine.
assert(html.includes('data-pro-feature="payslip_scan"'), 'Pro payslip recognition card missing');
assert(html.includes('data-pro-feature="itemized_salary_compare"'), 'Pro itemized reconciliation card missing');
assert(html.includes('Apple Vision × OpenAI'), 'cross-validation copy missing');
assert(html.includes("purpose:'payslip'"), 'payslip recognition must use native Vision purpose');
assert(html.includes("invokeUserFunction('payslip-verify'"), 'payslip must call dedicated verifier');
assert(html.includes('mergePayslipAiVerification'), 'AI merge layer missing');
assert(html.includes('Apple Vision／OpenAI 不一致'), 'disagreement state missing');
assert(html.includes('兩邊不一致，請確認原圖'), 'disagreement must require human confirmation');
assert(html.includes('data-ocr-ai'), 'user must explicitly choose the OpenAI alternative on conflict');
assert(html.includes('公司薪資單實發'), 'reconciliation must use actual payslip net pay');
assert(html.includes('id="itemizedConclusion"'), 'local reconciliation conclusion missing');
assert(html.includes('少發 '), 'underpayment line-item status missing');
assert(html.includes('多扣 '), 'over-deduction line-item status missing');
assert(html.includes("num(payslipOcrResult.__confidence?.[key])<.72"), 'low-confidence OCR fields must require review');
assert(html.includes("num(payslipOcrResult.__confidence?.[key])>=.85"), 'high-confidence OCR count missing');
for (const label of ['勞退自提','福利金','勞保費','健保費','輪班／夜班津貼','加班費','實發金額']) {
  assert(html.includes(label), 'payroll synonym/field coverage missing: '+label);
}
assert(html.includes('rateLike||quantityLike'), 'rates/hours must be excluded from payroll money candidates');
assert(html.includes('3 種影像版本'), 'three-pass payroll image preprocessing missing');

assert(html.includes("meow-work-payslip-format-memory-v3"), 'stale payroll format memory must be invalidated after deduction mapping changes');
assert(html.includes(".replace(/考前扣款/g,'考勤扣款')"), 'attendance OCR confusion normalization missing');
assert(html.includes(".replace(/建保/g,'健保')"), 'health insurance OCR confusion normalization missing');
assert(html.includes("criticalDeduction=['dedAttendance','dedLabor','dedHealth','dedHealthExtra','dedPension']"), 'critical deductions must not be silently filled from stale format memory');
assert(html.includes("payslipAiEvidenceSupportsField"), 'critical deduction AI evidence guard missing');
assert(payslipEdge.includes("考勤扣款、勞保費、健保費是三個不同欄位"), 'deduction semantics prompt missing');
assert(payslipEdge.includes("同一列或同一排同時出現考勤扣款、勞保費、健保費"), 'same-row deduction pairing instruction missing');
assert(payslipEdge.includes("FIELD_DESCRIPTIONS"), 'structured output field descriptions missing');


// Dedicated verifier must be server-side, stateless and cost-protected.
assert(payslipEdge.includes('OPENAI_API_KEY'), 'payslip verifier must load server-side OpenAI key');
assert(payslipEdge.includes('https://api.openai.com/v1/responses'), 'payslip verifier must use Responses API');
assert(payslipEdge.includes('model: "gpt-5.6"'), 'payslip verifier must use GPT-5.6');
assert(payslipEdge.includes('store: false'), 'payslip verifier must disable Responses storage');
assert(payslipEdge.includes('detail: "original"'), 'dense payslip image must use original detail');
assert(payslipEdge.includes('type: "json_schema"'), 'payslip verifier must use Structured Outputs');
assert(payslipEdge.includes('meow_claim_payslip_ai_usage'), 'payslip verifier must enforce protected monthly usage');
assert(payslipEdge.includes('PRO_REQUIRED'), 'payslip verifier must enforce Pro entitlement');
assert(!payslipEdge.includes('expectedSalary'), 'OpenAI verifier must not be biased by local expected salary');

// AI schedule import was intentionally removed from the product surface.
assert(!html.includes("smart_schedule_import:{label:'智慧匯入班表'"), 'removed smart schedule entitlement must stay absent');
assert(!html.includes('id="aiScheduleCard"'), 'removed smart schedule card must stay absent');
assert(!html.includes('id="aiScheduleUpload"'), 'removed smart schedule upload action must stay absent');

// Final Pro Meow Assistant branding + voice flow.
assert(html.includes('./assets/meow-assistant-pro-v168.webp?v=168'), 'final Pro Meow Assistant mascot missing');
assert(html.includes('<b>喵助理</b></button>'), 'floating assistant label missing');
assert(html.includes("input.dispatchEvent(new Event('input',{bubbles:true}))"), 'voice transcript must be written into the input');
assert(html.includes("setTimeout(()=>{void previewMeowAssistant()},120)"), 'voice transcript must auto-submit after recognition');

console.log('PASS cross-validated Pro payroll, final Meow Assistant, and removed schedule import checks');
