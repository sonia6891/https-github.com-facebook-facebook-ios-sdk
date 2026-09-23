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
assert(html.includes('圖片只在你的瀏覽器本地處理，不上傳薪資單影像'));
assert(html.includes('App 不會把原始薪資單圖片寫入自己的雲端資料庫'));

for (const mode of ['payslip_scan','reconcile_explain','salary_forecast_explain','anomaly_scan','assistant','status']) {
  assert(edge.includes('"'+mode+'"'), 'missing AI mode: '+mode);
}
assert(!edge.includes('"schedule_scan"'), 'cloud schedule_scan must stay disabled');
assert(!html.includes("invokeUserFunction('pro-ai',{mode:'schedule_scan'"), 'schedule import must stay on device');
assert(html.includes('MeowScheduleVision'), 'local Vision schedule bridge missing');
assert(edge.includes('meow_account_access'));
assert(edge.includes('OPENAI_API_KEY'));
assert(edge.includes('gpt-6-luna'));
assert(edge.includes('store: false'));
assert(edge.includes('safety_identifier: safetyId'));
assert(edge.includes('reasoning: { effort: reasoningEffort(mode) }'));
assert(edge.includes('json_schema'));
assert(edge.includes('meow_claim_ai_usage'));
assert(edge.includes('AI_QUOTA_EXCEEDED'));
assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY'));
assert(edge.includes('p_user_id: user.id'));
assert(!edge.includes('userClient.rpc("meow_claim_ai_usage"'));
assert(edge.includes('adminClient.rpc("meow_claim_ai_usage"'));
const statusIndex = edge.indexOf('if (mode === "status")');
const quotaIndex = edge.indexOf('adminClient.rpc("meow_claim_ai_usage"');
assert(statusIndex >= 0 && quotaIndex >= 0 && statusIndex < quotaIndex, 'status mode must bypass quota');
console.log('Pro AI static checks passed on current app build');
