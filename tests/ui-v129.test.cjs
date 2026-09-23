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


const scheduleSection=html.slice(
  html.indexOf('<section class="page" id="page-calendar">'),
  html.indexOf('<section class="page" id="page-attendance">')
);
assert(html.includes('v137-schedule-ai-card'),'expected v137 schedule AI-card build');
for(const id of ['scheduleMoreToggle','scheduleMoreMenu','scheduleMenuSettings','scheduleMenuEvent','scheduleMenuClearAi']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(scheduleSection.includes('schedule-card-v136'),'schedule page must use v136+ AI-card layout');
assert(!scheduleSection.includes('schedule-v129-head'),'old visible schedule-settings header must be removed from schedule page');
assert(scheduleSection.indexOf('id="aiScheduleCard"') < scheduleSection.indexOf('id="calPrev"'),'AI import card must remain directly above calendar controls');
assert(scheduleSection.includes('id="toggleSchedule"'),'calendar-plus schedule settings trigger missing');
assert(scheduleSection.includes('<use href="#i-calendar"/>'),'schedule settings trigger should use calendar icon');
console.log('PASS v137 schedule AI card structure');
