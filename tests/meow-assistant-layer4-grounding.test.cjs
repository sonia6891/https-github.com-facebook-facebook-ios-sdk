const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

const build=(html.match(/<meta name="meow-ui-build" content="v(\d+)[^"]*">/)||[])[1];
assert(Number(build)>=205,'layer 4 build marker must be v205+');

for(const token of [
  'function meowAssistantAppContext(raw=',
  'function meowAssistantPersonalFacts(intent,raw=',
  'function meowAssistantMaxConsecutiveWorkDays',
  'overtimeLast3MonthsTotal',
  'maxConsecutiveWorkDays',
  'annualLeave:annual',
  'shiftClockTimesConfigured:false',
  'todayShift:meowAssistantShiftText(now)',
  'tomorrowShift:meowAssistantShiftText',
  'const personal=meowAssistantPersonalFacts(intent,raw)',
  "appContext:meowAssistantAppContext(query)"
]) assert(html.includes(token),'missing layer 4 token: '+token);

assert(!html.includes("if(route.shouldClarify&&route.clarifyingQuestion){\n    const msg=String(route.clarifyingQuestion||'').trim();"),
  'AI must not clarify before checking App data');

const pPersonal=html.indexOf('const personal=meowAssistantPersonalFacts(intent,raw)');
const pMissing=html.indexOf('const missing=[...new Set([...personal.missing,...routedMissing])]');
assert(pPersonal>=0&&pMissing>pPersonal,'personal facts must be evaluated before final missing-info prompt');

assert(html.includes("if(intent==='shiftRestInterval')"),'shift-rest grounding missing');
assert(html.includes('shiftClockTimesConfigured:false'),'clock-time absence must be explicit');
assert(html.includes("missing.push('前一班實際下班時間','下一班實際上班時間')"),
  'shift-rest must ask for missing clock times rather than guessing');
assert(html.includes("if(intent==='overtimeLimit')")||html.includes("['overtimeLimit','consecutiveWorkDays'"),
  'overtime-limit grounding missing');
assert(html.includes("if(intent==='annualLeaveTermination')"),'annual-leave termination grounding missing');
assert(html.includes("if(intent==='overtimeWageBase')"),'wage-base salary grounding missing');
assert(html.includes("intent==='article841'&&/保全/.test"),'security guard 84-1 specialization missing');

console.log('PASS Meow Assistant layer 4 app-data grounding contract');
