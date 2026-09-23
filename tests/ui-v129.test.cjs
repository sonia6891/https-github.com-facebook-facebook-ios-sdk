'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');

const build=html.match(/<meta name="meow-ui-build" content="v(\d+)[^"]*">/);
assert(build && Number(build[1])>=129,'expected v129+ UI build');

const ids={};
for(const m of html.matchAll(/\bid="([^"]+)"/g))ids[m[1]]=(ids[m[1]]||0)+1;
const duplicates=Object.entries(ids).filter(([,n])=>n>1);
assert.deepEqual(duplicates,[],'duplicate DOM ids found');

for(const id of [
  'scheduleUiPlan','scheduleUiShift','scheduleUiCycle','scheduleUiStart',
  'aiScheduleCard','aiScheduleUpload','aiScheduleFileInput','aiScheduleStatus','aiScheduleResult',
  'settingsAvatarButton','themeLight','themeDark','themeSystem','settingsOpenSchedule','settingsAiImport',
  'accountPlanCard','proPlanSettings','settingsPlanBadge','settingsPlanDetailBadge',
  'workSettingsCard','workSettingsBody','dataSyncCard','dataSyncBody'
]){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}

assert(html.includes('排班設定'));
assert(html.includes('AI 匯入班表'));
assert(html.includes('上傳班表圖片，讓貓助理幫你快速轉成班表！'));
assert(html.includes('--v129-accent:#c77a35'));
assert(html.includes('--v129-honey-soft:#fff6e8'));
assert(html.includes('id="themeSystem"'));
assert(html.includes("meow-work-theme-mode-v1"));
assert(html.includes("if($('accountLogout'))$('accountLogout').classList.toggle('hidden',!authUser)"));
assert(html.includes('id="settingsScheduleSummary"'));
console.log('PASS v129 schedule/settings UI structure');
