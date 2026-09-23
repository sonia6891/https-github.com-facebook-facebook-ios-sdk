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
assert(html.includes('v141-ai-card-source-crop'),'expected v141 AI card source crop build');
for(const id of [
  'scheduleAddDay','scheduleAddDialog','scheduleAddDate','scheduleAddShift','scheduleAddSave','scheduleAddClear',
  'scheduleMoreToggle','scheduleMoreMenu','scheduleMenuSettings','scheduleMenuSettingsLabel','scheduleMenuClearAi'
]){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert.equal(ids.scheduleMenuEvent||0,0,'schedule more menu must not duplicate itinerary add');
assert.equal(ids.toggleSchedule||0,0,'calendar-plus must not be reused as schedule settings toggle');
assert(scheduleSection.includes('schedule-card-v136'),'schedule page must use v136+ AI-card layout');
assert(scheduleSection.includes('>我的班表</b>'),'schedule page heading must say 我的班表');
assert(!scheduleSection.includes('schedule-v129-head'),'old visible schedule-settings header must be removed from schedule page');
assert(scheduleSection.indexOf('id="aiScheduleCard"') < scheduleSection.indexOf('id="calPrev"'),'AI import card must remain directly above calendar controls');
assert(scheduleSection.includes('id="scheduleAddDay"'),'calendar-plus dated shift action missing');
assert(scheduleSection.includes('<use href="#i-calendar"/>'),'dated shift action should use calendar icon');
assert(html.includes("scheduleOpen=!scheduleOpen;render()"),'three-dot schedule settings must toggle open/closed');
assert(html.includes("source:'manual'"),'dated shift action must save a manual schedule override');
console.log('PASS v138 schedule actions structure');

assert(html.includes('.schedule-ai-v129-banner img{position:absolute;left:-6%;'),'AI mascot image must crop past left edge');
assert(html.includes('.schedule-ai-v129-banner img{left:-8%;bottom:-6%;width:52%;height:112%;object-position:80% center}'),'mobile AI mascot crop must stay flush to left edge');
console.log('PASS v141 AI mascot source crop');
