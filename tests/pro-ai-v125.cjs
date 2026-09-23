const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/pro-ai/index.ts', 'utf8');

{
  const build = html.match(/<meta name="meow-ui-build" content="v(\d+)[^"]*">/);
  assert(build && Number(build[1]) >= 125, 'expected current app build v125 or newer');
}
assert(html.includes("ai_pro_suite"));
assert(html.includes('id="aiScheduleCard"'));
assert(html.includes('id="proAiPanel"'));
assert(html.includes("invokeUserFunction('pro-ai'"));
assert(html.includes('scheduleOverrides'));
assert(html.includes('iPhone 使用 Apple Vision 在裝置端辨識，不上傳薪資單影像'));
assert(html.includes('本機薪資單 OCR'));
assert(html.includes('不會因這些功能產生 OpenAI API 費用'));

for (const mode of ['assistant','status']) {
  assert(edge.includes('"'+mode+'"'), 'missing cloud AI mode: '+mode);
}
for (const mode of ['schedule_scan','payslip_scan','reconcile_explain','salary_forecast_explain','anomaly_scan']) {
  assert(!edge.includes('"'+mode+'"'), 'retired cloud AI mode must stay disabled: '+mode);
}
assert(!html.includes("invokeUserFunction('pro-ai',{mode:'schedule_scan'"), 'schedule import must stay on device');
assert(html.includes('MeowScheduleVision'), 'local Vision schedule bridge missing');
assert(html.includes('📷 本機薪資單 OCR'), 'local payslip OCR shortcut missing');
assert(html.includes('🧾 本機差異說明'), 'local reconcile explanation missing');
assert(html.includes('💰 本機薪資預測'), 'local salary forecast missing');
assert(html.includes('⚠️ 本機變動提醒'), 'local salary change alerts missing');
for (const mode of ['payslip_scan','reconcile_explain','salary_forecast_explain','anomaly_scan']) {
  assert(!html.includes("mode:'"+mode+"'"), 'app must not call retired cloud mode: '+mode);
}
assert(html.includes("mode:'assistant'"), 'assistant must remain the only cloud AI action');
assert(html.includes('每月 20 次'), 'assistant quota copy must say 20 per month');
assert(edge.includes('meow_account_access'));
assert(edge.includes('OPENAI_API_KEY'));
assert(edge.includes('gpt-5.6-luna'));
assert(!edge.includes('Deno.env.get("OPENAI_MODEL")'), 'production model must be pinned');
assert(edge.includes('AI_PROVIDER_BUSY'));
assert(edge.includes('retry-after'));
assert(edge.includes('Math.random() * 250'));
assert(edge.includes('store: false'));
assert(edge.includes('safety_identifier: safetyId'));
assert(edge.includes('reasoning: { effort: reasoningEffort(mode) }'));
assert(edge.includes('json_schema'));
assert(edge.includes('meow_claim_ai_usage'));
assert(edge.includes('meow_finalize_ai_usage'));
assert(edge.includes('AI_GLOBAL_BUDGET_EXCEEDED'));
assert(edge.includes('AI_GLOBAL_MONTHLY_CALL_LIMIT'));
assert(edge.includes('AI_GLOBAL_MONTHLY_TOKEN_LIMIT'));
assert(edge.includes('retryableStatuses'));
assert(edge.includes('input_tokens'));
assert(edge.includes('output_tokens'));
assert(edge.includes('max_output_tokens: 1200'));
assert(edge.includes('AI_QUOTA_EXCEEDED'));
assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY'));
assert(edge.includes('p_user_id: user.id'));
assert(!edge.includes('userClient.rpc("meow_claim_ai_usage"'));
assert(edge.includes('adminClient.rpc("meow_claim_ai_usage"'));
const statusIndex = edge.indexOf('if (mode === "status")');
const quotaIndex = edge.indexOf('adminClient.rpc("meow_claim_ai_usage"');
assert(statusIndex >= 0 && quotaIndex >= 0 && statusIndex < quotaIndex, 'status mode must bypass quota');
console.log('Pro AI static checks passed on current app build');
