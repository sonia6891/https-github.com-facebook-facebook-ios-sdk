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
assert(html.includes('v147-todo-complete-visible'),'expected v147 todo completion visibility build');
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


for(const id of [
  'attendanceTabEvents','attendanceTabTodos','todoOpenCount',
  'todoDialog','todoTitle','todoDate','todoNote','saveTodo','deleteTodo'
]){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(html.includes('行程與待辦事項'),'third page title must include itinerary and todos');
assert(html.includes("kind:'todo'"),'todo data must be stored in personalEvents');
assert(html.includes('function toggleTodoDone(id)'),'todo completion toggle missing');
assert(html.includes("e.kind!=='note'&&e.kind!=='todo'"),'itinerary list must exclude todos');
assert(html.includes('>行程與待辦</button>'),'desktop navigation label missing');
assert(html.includes('<span>行程待辦</span>'),'mobile navigation label missing');
console.log('PASS v142 itinerary/todo structure');


for(const id of ['scheduleAddDialogClose','eventDialogClose','eventDialogCancel','todoDialogClose','todoDialogCancel']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(html.includes("function closeEventDialog()"),'event dialog explicit close helper missing');
assert(html.includes("function closeTodoDialog()"),'todo dialog explicit close helper missing');
assert(html.includes("eventDialog').close('cancel')"),'event dialog must close without form validation');
assert(html.includes("todoDialog').close('cancel')"),'todo dialog must close without form validation');
console.log('PASS v143 dialog close structure');

assert(html.includes("scheduleAddDialog').close('cancel')"),'schedule add dialog explicit close helper missing');


assert(html.includes('#scheduleAddDate,\n#scheduleAddShift{'),'schedule add controls fit rule missing');
assert(html.includes('min-inline-size:0'),'schedule date must be allowed to shrink on mobile');
assert(html.includes('#scheduleAddDialog .dialog-body{\n  overflow-x:hidden;'),'schedule add dialog must block horizontal overflow');
console.log('PASS v145 schedule date fit structure');


for(const id of ['attendanceAddDialog','attendanceAddClose','attendanceAddEvent','attendanceAddTodo']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(html.includes("function openAttendanceAddDialog()"),'unified attendance add chooser missing');
assert(html.includes("$('addItinerary').onclick=openAttendanceAddDialog"),'top-right plus must open chooser');
assert(html.includes("attendanceAddEvent').onclick"),'chooser event action missing');
assert(html.includes("attendanceAddTodo').onclick"),'chooser todo action missing');
assert(!html.includes('<div class="empty-plus">＋</div>'),'empty-state decorative plus should be removed');
console.log('PASS v146 attendance add chooser structure');


assert(html.includes("todoShowCompleted=true"),'completed todos should be visible by default');
assert(html.includes(".todo-card-v142.completed{\n  opacity:.78;\n  order:2;"),'completed todo visual state missing');
console.log('PASS v147 completed todos remain visible');
