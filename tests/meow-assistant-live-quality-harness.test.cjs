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
assert(html.includes('id="meowAiTestProgress"'),'visible progress bar missing');
assert(html.includes('id="meowAiTestProgressText"'),'visible progress text missing');
assert(html.includes('setMeowAssistantLiveQualityUi'),'live test UI state helper missing');
assert(html.includes("run.textContent=running?'測試中…':'執行 32 題正式測試'"),'test button loading state missing');
assert(html.includes('routeMeowAssistantWithAILiveQuality'),'live test must preserve routing errors instead of swallowing them');
assert(html.includes('登入憑證已失效'),'auth-expiry feedback missing');
assert(html.includes('測試中止：這個帳號目前沒有開發者／Pro 權限'),'entitlement feedback missing');
assert(!html.includes("setMeowAssistantLiveQualityUi(true,0,MEOW_ASSISTANT_LIVE_QUALITY_CASES.length,'正在啟動正式 OpenAI 測試…');\n  void runMeowAssistantLiveQualityTest();"),'click handler must not pre-lock runner before start');


const corpusMatch=html.match(/const MEOW_ASSISTANT_LIVE_QUALITY_CASES=\[([\s\S]*?)\];\nfunction meowAssistantLiveCasePass/);
assert(corpusMatch,'could not locate live quality corpus');
const count=(corpusMatch[1].match(/\bq\s*:/g)||[]).length;
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
for(const phrase of [
  "我是工讀生，國定假日上班薪水怎麼算？',requiredIntents:['holidayPay','partTimeRights']",
  "我固定大夜，不是輪來輪去，11小時間隔還適用嗎？',requiredIntents:['shiftRestInterval','fixedShift']",
  "今天大夜，明天又早班，而且這個月已經加50小時，公司還叫我留下來，這樣可以嗎？',\n    requiredIntents:['shiftRestInterval','overtimeLimit','mandatoryOvertime']"
]){
  assert(html.includes(phrase),'multi-intent live case must not require a fixed primary ordering: '+phrase);
}
assert(corpusMatch[1].includes("requiredIntents:['shiftRestInterval','overtimeLimit','mandatoryOvertime']"),'multi-risk case must score complete intent coverage rather than fixed primary order');
assert(corpusMatch[1].includes("requiredIntents:['holidayPay','partTimeRights']"),'part-time holiday case must score complete intent coverage without fixed primary ordering');
assert(corpusMatch[1].includes("requiredIntents:['shiftRestInterval','fixedShift']"),'fixed-shift interval case must score complete intent coverage without fixed primary ordering');
assert(html.includes('test.requiredIntents&&test.requiredIntents.length'),'live scorer must support requiredIntents coverage');

console.log('PASS Meow Assistant developer-only live OpenAI semantic quality harness: '+count+' cases');
