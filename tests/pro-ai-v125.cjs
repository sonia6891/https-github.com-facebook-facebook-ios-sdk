const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/pro-ai/index.ts', 'utf8');

assert(html.includes('v125-pro-ai-v1'));
assert(html.includes("ai_pro_suite"));
assert(html.includes('id="aiScheduleCard"'));
assert(html.includes('id="proAiPanel"'));
assert(html.includes("invokeUserFunction('pro-ai'"));
assert(html.includes('scheduleOverrides'));
assert(html.includes('圖片只在你的瀏覽器本地處理，不上傳薪資單影像'));
assert(html.includes('App 不會把原始薪資單圖片寫入自己的雲端資料庫'));

for (const mode of ['schedule_scan','payslip_scan','reconcile_explain','salary_forecast_explain','anomaly_scan','assistant']) {
  assert(edge.includes('"'+mode+'"'), 'missing AI mode: '+mode);
}
assert(edge.includes('meow_account_access'));
assert(edge.includes('OPENAI_API_KEY'));
assert(edge.includes('json_schema'));
assert(edge.includes('meow_claim_ai_usage'));
assert(edge.includes('AI_QUOTA_EXCEEDED'));
assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY'));
assert(edge.includes('p_user_id: user.id'));
assert(!edge.includes('userClient.rpc("meow_claim_ai_usage"'));
assert(edge.includes('adminClient.rpc("meow_claim_ai_usage"'));
console.log('pro-ai-v125 static checks passed');
