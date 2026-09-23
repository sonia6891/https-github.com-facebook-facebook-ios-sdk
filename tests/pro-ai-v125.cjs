const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/pro-ai/index.ts', 'utf8');

{
  const build = html.match(/<meta name="meow-ui-build" content="v(\d+)[^"]*">/);
  assert(build && Number(build[1]) >= 125, 'expected current app build v125 or newer');
}

// Cloud assistant is deliberately removed.
assert(!html.includes('ai_pro_suite'), 'removed Pro AI suite must not return');
assert(!html.includes('id="proAiPanel"'), 'removed Pro AI panel must not return');
assert(!html.includes('aiAssistantQuestion'), 'assistant input must not return');
assert(!html.includes('喵助理'), 'assistant copy must not return');
assert(!html.includes("invokeUserFunction('pro-ai'"), 'app must not call cloud Pro AI');
assert(!edge.includes('OPENAI_API_KEY'), 'disabled backend must not require an OpenAI key');
assert(!edge.includes('api.openai.com'), 'disabled backend must not call OpenAI');
assert(edge.includes('FEATURE_REMOVED'), 'legacy pro-ai endpoint must be hard-disabled');

// The two paid payroll features must remain first-class.
assert(html.includes('data-pro-feature="payslip_scan"'), 'Pro payslip recognition card missing');
assert(html.includes('data-pro-feature="itemized_salary_compare"'), 'Pro itemized reconciliation card missing');
assert(html.includes('Apple Vision'), 'Apple Vision payslip recognition copy missing');
assert(html.includes("purpose:'payslip'"), 'payslip recognition must use native Vision purpose');
assert(html.includes('公司薪資單實發'), 'reconciliation must use actual payslip net pay');
assert(html.includes('id="itemizedConclusion"'), 'local reconciliation conclusion missing');
assert(html.includes('少發 '), 'underpayment line-item status missing');
assert(html.includes('多扣 '), 'over-deduction line-item status missing');

// Smart schedule remains Pro but independent from the removed assistant.
assert(html.includes('smart_schedule_import'), 'smart schedule Pro entitlement missing');
assert(html.includes('id="aiScheduleCard"'), 'smart schedule card missing');
assert(html.includes('MeowScheduleVision'), 'local Vision schedule bridge missing');
assert(html.includes("purpose:'schedule'"), 'schedule recognition must use native Vision purpose');
assert(!html.includes("mode:'schedule_scan'"), 'schedule import must never call cloud AI');

console.log('PASS local-only Pro payroll/schedule intelligence checks');
