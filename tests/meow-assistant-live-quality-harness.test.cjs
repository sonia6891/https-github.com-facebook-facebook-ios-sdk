const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');

assert(html.includes('MEOW_ASSISTANT_LIVE_QUALITY_CASES'),'live quality corpus missing');
assert(html.includes('runMeowAssistantLiveQualityTest'),'live quality runner missing');
assert(html.includes("isDeveloperAccount()&&/(執行|開始|跑)"),'developer-only self-test command gate missing');
assert(html.includes("invokeUserFunction('meow-assistant-route'"),'live self-test must use production route');
assert(html.includes('window.meowAssistantLastLiveQualityReport'),'live report storage missing');
assert(html.includes("'meow-assistant-live-quality-report'"),'local live report persistence missing');
assert(html.includes('/^正在執行喵助理真實 OpenAI 語意測試/'),'self-test progress must be excluded from memory');

const corpusMatch=html.match(/const MEOW_ASSISTANT_LIVE_QUALITY_CASES=\[([\s\S]*?)\];\nfunction meowAssistantLiveCasePass/);
assert(corpusMatch,'could not locate live quality corpus');
const count=(corpusMatch[1].match(/\{q:/g)||[]).length;
assert(count>=30,'live quality corpus should contain at least 30 real cases');

for(const token of [
  'shiftRestInterval','consecutiveWorkDays','workBreak','splitShift','onCallStandby',
  'handoverWorkTime','crossMidnightShift','scheduleChange','overtimeLimit',
  'compensatoryLeave','holidayTransfer','overtimeWageBase','annualLeaveTermination',
  'pregnancyNightShift','flexibleWorkingHours','article841','partTimeRights',
  'naturalDisaster','mandatoryOvertime','attendanceRecord','trainingMeetingTime',
  'mealBreakOnDuty','scheduleNotice','fixedShift','whyPayChanged','unknownDeduction'
]){
  assert(corpusMatch[1].includes(token),'missing live quality intent '+token);
}
for(const op of ['remove_overtime','move_overtime','undo_last','view_schedule']){
  assert(corpusMatch[1].includes(op),'missing contextual live operation '+op);
}

console.log('PASS Meow Assistant developer-only live OpenAI semantic quality harness: '+count+' cases');
