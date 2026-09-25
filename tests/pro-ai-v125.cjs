const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const legacyEdge = fs.readFileSync('supabase/functions/pro-ai/index.ts', 'utf8');
const payslipEdge = fs.readFileSync('supabase/functions/payslip-verify/index.ts', 'utf8');
const speechEdge = fs.readFileSync('supabase/functions/speech-transcribe/index.ts', 'utf8');

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

// Payslip remains cross-validated, but the customer-facing UI must not expose implementation/vendor sequencing.
assert(html.includes('data-pro-feature="payslip_scan"'), 'Pro payslip recognition card missing');
assert(html.includes('data-pro-feature="itemized_salary_compare"'), 'Pro itemized reconciliation card missing');
assert(html.includes('薪資單三層交叉檢查'), 'cross-validation product copy missing');
assert(!html.includes('Apple Vision × OpenAI'), 'public salary UI must not expose provider sequence');
assert(!html.includes('Apple Vision 先讀、OpenAI'), 'public salary UI must not explain implementation sequence');
assert(html.includes("purpose:'payslip'"), 'payslip recognition must use native Vision purpose');
assert(html.includes("invokeUserFunction('payslip-verify'"), 'payslip must call dedicated verifier');
assert(html.includes('mergePayslipAiVerification'), 'cross-check merge layer missing');
assert(html.includes('交叉判讀不一致'), 'disagreement state missing');
assert(html.includes('兩邊不一致，請確認原圖'), 'disagreement must require human confirmation');
assert(html.includes('採用第二判讀：'), 'user must explicitly choose the second-pass alternative on conflict');
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
assert(html.includes('preprocessPayslipVariants'), 'payroll image preprocessing helper missing');
assert(html.includes("name:'原圖增強'") && html.includes("name:'高對比'") && html.includes("name:'二值化'"), 'three-pass payroll image preprocessing missing');

assert(html.includes("meow-work-payslip-format-memory-v3"), 'stale payroll format memory must be invalidated after deduction mapping changes');
assert(html.includes(".replace(/考前扣款/g,'考勤扣款')"), 'attendance OCR confusion normalization missing');
assert(html.includes(".replace(/建保/g,'健保')"), 'health insurance OCR confusion normalization missing');
assert(html.includes("criticalDeduction=['dedAttendance','dedLabor','dedHealth','dedHealthExtra','dedPension']"), 'critical deductions must not be silently filled from stale format memory');
assert(html.includes("payslipAiEvidenceSupportsField"), 'critical deduction AI evidence guard missing');
assert(payslipEdge.includes("考勤扣款、勞保費、健保費是三個不同欄位"), 'deduction semantics prompt missing');
assert(payslipEdge.includes("同一列或同一排同時出現考勤扣款、勞保費、健保費"), 'same-row deduction pairing instruction missing');
assert(payslipEdge.includes("FIELD_DESCRIPTIONS"), 'structured output field descriptions missing');
assert(payslipEdge.includes("『伙食津貼』與『餐費補助』是兩個不同的薪資項目"), 'meal allowance/subsidy separation rule missing');
assert(payslipEdge.includes("『餐費補助』與『醫療補助』『營運補助』也不得混淆"), 'meal subsidy character-level guard missing');
assert(payslipEdge.includes('function exactLabelRead'), 'amount-anchored exact-label visual recheck missing');
assert(payslipEdge.includes('rowCrops'), 'server must accept amount-anchored row crops');
assert(html.includes('buildPayslipRowCrops'), 'client must build amount-anchored row crops');
assert(html.includes("rowCrops=await buildPayslipRowCrops"), 'client must send row crops during payslip verification');
assert(payslipEdge.includes('逐字抄寫員') && payslipEdge.includes('禁止依語意猜字'), 'exact-label recheck must be image-transcription focused rather than semantic guessing');
assert(payslipEdge.includes('名稱待確認（兩次逐字判讀不一致）'), 'ambiguous payroll labels must not be forced');
assert(payslipEdge.includes('trustedKnown = exactAgreement && choiceAgreement'), 'exact label and semantic choice must both agree before auto-labeling');
assert(html.includes('修正項目名稱'), 'unresolved extra payroll labels need a manual correction action');
assert(payslipEdge.includes('resolved === "伙食津貼"'), 'only literal meal allowance may map to the standard meal field');
assert(payslipEdge.includes('resolved === "餐費補助"'), 'meal subsidy must stay separate after exact-label recheck');
assert(payslipEdge.includes('extraItems'), 'salary-slip-only extra income/deduction extraction missing');
assert(html.includes("label:'伙食津貼'"), 'standard meal allowance label missing');
assert(html.includes("if(label==='餐費補助')return Object.assign({},item,{kind:'income'})"), 'meal subsidy must remain a separate extra income item');
assert(!html.includes("label:'伙食／餐費補助'"), 'meal allowance and meal subsidy must not be merged in UI');
assert(html.includes('id="rerunPayslipScan"'), 'smart payroll rerun action missing');
assert(html.includes('id="clearPayslipScan"'), 'smart payroll clear action missing');
assert(html.includes('照片不會顯示在畫面上'), 'smart payroll scan privacy copy missing');
assert(html.includes('id="itemizedSmartGroups"'), 'smart payroll grouped review UI missing');
assert(html.includes('未判讀或兩次判讀不一致的項目不會自動猜'), 'smart payroll pending-review copy missing');
assert(html.includes('payslipCurrentFile'), 'session-only payslip rerun file state missing');
assert(html.includes("$('closePayslipScan').onclick=()=>{payslipScanOpen=false;renderSalary()}"), 'closing the scan panel must keep the current payslip in memory');
assert(html.includes('🔒 本次對帳工作階段'), 'compact payslip session privacy label missing');
assert(!html.includes("$('closePayslipScan').onclick=()=>{resetPayslipScan(true)"), 'closing the scan panel must not release the current payslip');


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
assert(html.includes('./assets/meow-assistant-pro-v169.webp?v=169'), 'final Pro Meow Assistant mascot missing');
assert(html.includes('<b>喵助理</b></button>'), 'floating assistant label missing');
assert(html.includes("input.dispatchEvent(new Event('input',{bubbles:true}))"), 'voice transcript must be written into the input');
assert(html.includes("setTimeout(()=>{if(token===meowAssistantRecognitionToken)void previewMeowAssistant()},120)"), 'voice transcript must auto-submit after recognition');
assert(html.includes("type:'smartPayslipReconcile'"), 'smart salary reconciliation intent missing');
assert(html.includes("MEOW_ASSISTANT_KNOWLEDGE_VERSION='2026-09-shift-payroll-v1'"), 'Meow Assistant payroll knowledge version missing');
for (const intent of ['todayShift','tomorrowShift','nextWork','nextOff','monthSummary','overtimeHours','estimatedPay','overtimePay','deductions','payday','annualLeave','reconcileSummary','whyPayChanged','missingOvertime','missingShiftAllowance','holidayPay','unknownDeduction','missingItem','rerunPayslip']) {
  assert(html.includes("['"+intent+"'"), 'Meow Assistant intent missing: '+intent);
}
assert(html.includes('handleMeowAssistantKnowledge'), 'Meow Assistant knowledge handler missing');
assert(html.includes('function openSmartPayslipFromMeowAssistant()'), 'Meow Assistant smart payroll navigator missing');
assert(html.includes("setTab('salary')"), 'Meow Assistant must navigate to salary page');
assert(html.includes("payslipScanOpen=true"), 'Meow Assistant must open smart payslip reconciliation');
assert(html.includes('async function resetMeowAssistantVoice(cancelNative=true)'), 'repeat microphone reset helper missing');
assert(html.includes('meowAssistantRecognitionToken++'), 'speech session token missing');
assert(html.includes('function meowSpeechBridge()'), 'native iOS speech bridge selector missing');
assert(html.includes("nativeBridge.recognize({locale:'zh-TW'})"), 'native iOS speech call missing');
assert(html.includes('async function recordMeowAssistantAudio(token)'), 'PWA audio recorder missing');
assert(html.includes("invokeUserFunction('speech-transcribe'"), 'PWA speech transcription backend call missing');
assert(!html.includes('window.webkitSpeechRecognition'), 'PWA must not depend on WebKit SpeechRecognition');
assert(speechEdge.includes('https://api.openai.com/v1/audio/transcriptions'), 'speech backend must use OpenAI transcription endpoint');
assert(speechEdge.includes('gpt-4o-mini-transcribe'), 'speech backend transcription model missing');
assert(speechEdge.includes('meow_account_access'), 'speech backend must honor developer/Pro account access');
assert(speechEdge.includes('PRO_REQUIRED'), 'speech backend must reject Free users');
assert(speechEdge.includes('OPENAI_API_KEY'), 'speech backend must keep OpenAI key server-side');

require('./meow-assistant-100.test.cjs');
require('./meow-assistant-round2-100.test.cjs'); // adversarial round two
console.log('PASS cross-validated Pro payroll, final Meow Assistant, and removed schedule import checks');

// round2-gross-priority-recheck

// round2-help-recheck

// round2-final-build-recheck
