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
  'settingsAvatarButton','themeLight','themeDark','themeSystem','settingsOpenSchedule',
  'toggleAppearance','appearanceBody','toggleSchedulePrefs','schedulePrefsBody',
  'accountPlanCard','proPlanDialog','proPlanSettings','settingsPlanBadge','settingsPlanDetailBadge',
  'workSettingsCard','workSettingsBody','dataSyncCard','dataSyncBody'
]){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}

assert(html.includes('排班設定'));
assert.equal(ids.aiScheduleCard||0,0,'removed AI schedule card must stay absent');
assert.equal(ids.aiScheduleUpload||0,0,'removed AI schedule upload button must stay absent');
assert.equal(ids.aiScheduleFileInput||0,0,'removed AI schedule file input must stay absent');
assert(!html.includes("smart_schedule_import:{label:'智慧匯入班表'"),'removed AI schedule import must not remain in plan catalog');
assert(html.includes('--v129-accent:#c77a35'));
assert(html.includes('--v129-honey-soft:#fff6e8'));
assert(html.includes('id="themeSystem"'));
assert(html.includes("meow-work-theme-mode-v1"));
assert(html.includes("if($('accountLogout'))$('accountLogout').classList.toggle('hidden',!authUser)"));
assert(html.includes('id="settingsScheduleSummary"'));
assert.equal(ids.settingsAiImport||0,0,'settings page must not advertise removed AI schedule import');
assert(html.includes('Free／Pro 方案比較'),'Free/Pro comparison dialog missing');
assert(html.includes('薪資單三層交叉檢查'),'Pro comparison must include three-layer payslip verification');
assert(html.includes("appearanceOpen?'⚙ 收起設定⌃':'⚙ 展開設定⌄'"),'appearance fold state missing');
assert(html.includes("schedulePrefsOpen?'⚙ 收起設定⌃':'⚙ 展開設定⌄'"),'schedule preference fold state missing');
assert(html.includes('./assets/meow-assistant-pro-v167.webp'),'final Meow Assistant mascot asset missing');
assert(html.includes('<b>喵助理</b></button>'),'floating Meow Assistant label missing');
assert(!html.includes('<span aria-hidden="true">🐾</span><b>喵助理</b><small>Pro</small>'),'old paw/Pro floating button must be removed');
assert(html.includes("renderMeowAssistantReply('已聽到：「'+text+'」\\n正在處理…')"),'voice transcript/submission status missing');
assert(html.includes("setTimeout(()=>{void previewMeowAssistant()},120)"),'voice command must auto-submit after transcript');
console.log('PASS v167 final Meow Assistant, settings folds, and voice flow');


const scheduleSection=html.slice(
  html.indexOf('<section class="page" id="page-calendar">'),
  html.indexOf('<section class="page" id="page-attendance">')
);
assert(build && Number(build[1])>=152,'expected v152+ Apple auth build');
for(const id of [
  'scheduleAddDay','scheduleAddDialog','scheduleAddDate','scheduleAddShift','scheduleAddSave','scheduleAddClear',
  'scheduleMoreToggle','scheduleMoreMenu','scheduleMenuSettings','scheduleMenuSettingsLabel'
]){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert.equal(ids.scheduleMenuEvent||0,0,'schedule more menu must not duplicate itinerary add');
assert.equal(ids.toggleSchedule||0,0,'calendar-plus must not be reused as schedule settings toggle');
assert(scheduleSection.includes('schedule-card-v136'),'schedule page must keep approved calendar card layout');
assert(scheduleSection.includes('>我的班表</b>'),'schedule page heading must say 我的班表');
assert(!scheduleSection.includes('schedule-v129-head'),'old visible schedule-settings header must be removed from schedule page');
assert(!scheduleSection.includes('id="aiScheduleCard"'),'AI schedule import card must be removed from calendar');
assert(scheduleSection.includes('id="scheduleAddDay"'),'calendar-plus dated shift action missing');
assert(scheduleSection.includes('<use href="#i-calendar"/>'),'dated shift action should use calendar icon');
assert(html.includes("scheduleOpen=!scheduleOpen;render()"),'three-dot schedule settings must toggle open/closed');
assert(html.includes("source:'manual'"),'dated shift action must save a manual schedule override');
console.log('PASS v138 schedule actions structure');

assert.equal(ids.scheduleMenuClearAi||0,0,'removed AI schedule clear action must stay absent');
assert(!scheduleSection.includes('智慧匯入班表'),'calendar must not advertise removed AI schedule import');
console.log('PASS v167 removed AI schedule import UI');


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
assert(html.includes("/* ===== v160 schedule add dialog mobile fit ===== */"),'schedule add dialog fit block missing');
assert(html.includes("function bindScheduleAddDatePicker()"),'mobile schedule date picker binding missing');
assert(html.includes("field.type=mobile?'text':'date'"),'mobile schedule date must avoid native iOS date intrinsic width');
assert(html.includes("field.classList.toggle('schedule-add-date-trigger',mobile)"),'mobile schedule date trigger class missing');
assert(html.includes("#scheduleAddDate.schedule-add-date-trigger{"),'compact schedule date trigger CSS missing');
assert(html.includes("#scheduleAddDialog .field{\n  width:100%;\n  overflow:hidden;"),'schedule date field must clip overflow');
assert(html.includes("@media(max-width:360px){\n  #scheduleAddDialog .dialog-foot{"),'narrow phone dialog footer fallback missing');
console.log('PASS v161 schedule add date uses compact mobile picker');



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


for(const id of ['eventReminder','todoReminder']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(html.includes('<option value="3d">前 3 天</option>'),'event reminder 3-day option missing');
assert(html.includes('<option value="1d">前 1 天</option>'),'event reminder 1-day option missing');
assert(html.includes('<option value="1h">前 1 小時</option>'),'event reminder 1-hour option missing');
assert(html.includes('<option value="1d">前 1 天</option>'),'todo reminder 1-day option missing');
assert(html.includes("function reminderBridge()"),'native reminder bridge helper missing');
assert(html.includes("function reminderFireDate(item)"),'reminder fire-date calculation missing');
assert(html.includes("function scheduleItemReminder(item"),'reminder scheduling helper missing');
assert(html.includes("function cancelItemReminder(kind,id)"),'reminder cancellation helper missing');
assert(html.includes("void scheduleItemReminder(candidate)"),'event save must schedule reminder');
assert(html.includes("void scheduleItemReminder(saved)"),'todo save must schedule reminder');
assert(html.includes("void cancelItemReminder('event',editingEventId)"),'event delete must cancel reminder');
assert(html.includes("void cancelItemReminder('todo',editingTodoId)"),'todo delete must cancel reminder');
console.log('PASS v148 itinerary/todo reminders structure');


assert.equal(ids.todoTime,1,'missing or duplicated #todoTime');
assert(html.includes('id="todoTime" type="time"'),'todo must expose a free-choice time input');
assert(html.includes('<option value="1d">前 1 天</option>'),'todo reminder should be relative to selected time');
assert(html.includes("todoDateLabel(t.date,t.time)"),'todo list must show selected time');
assert(html.includes("time=/^\\d{2}:\\d{2}$/.test(String(item.time||''))?item.time:'09:00'"),'todo reminder must use selected time');
console.log('PASS v149 todo free time structure');


for(const id of ['deleteAccount','accountDeleteZone']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(html.includes("async function deleteAccountPermanently()"),'in-app account deletion flow missing');
assert(html.includes("invokeUserFunction('delete-account'"),'account deletion must call authenticated backend');
assert(html.includes('href="./privacy.html"'),'privacy policy link missing');
assert(html.includes('href="./terms.html"'),'terms link missing');
assert(html.includes('href="./support.html"'),'support link missing');
assert(html.includes('id="restoreStorePurchases"'),'restore purchases control missing');
assert(html.includes('id="cancelProBilling"'),'manage subscription control missing');
console.log('PASS v151 App Store readiness structure');

for(const id of ['salaryTabCalc','salaryTabReconcile','salaryTabPro','salaryCalcPane','salaryReconcilePane','salaryProPane']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
const salarySection=html.slice(
  html.indexOf('<section class="page" id="page-salary">'),
  html.indexOf('<section class="page" id="page-settings">')
);
assert(salarySection.indexOf('id="salaryTabReconcile"') < salarySection.indexOf('id="salaryTabPro"'),'Free salary reconciliation must sit directly left of Pro');
assert(salarySection.includes('薪資對帳 <span class="salary-tab-tier free">Free</span>'),'Free reconciliation tab label missing');
assert(salarySection.includes('薪資對帳 <span class="salary-tab-tier pro">Pro</span>'),'Pro reconciliation tab label missing');
assert(salarySection.indexOf('id="salaryReconcilePane"') < salarySection.indexOf('id="salaryProPane"'),'Free and Pro reconciliation must use separate panes');
assert(html.includes("if($('salaryTabPro'))$('salaryTabPro').onclick=()=>{setSalarySubTab('pro')}"),'Pro reconciliation tab handler missing');
assert(html.includes("if($('salaryProPane'))$('salaryProPane').classList.toggle('hidden',salarySubTab!=='pro')"),'Pro reconciliation pane switch missing');
console.log('PASS v159 Free/Pro salary reconciliation tabs structure');

for(const id of ['meowAssistantFab','meowAssistantDialog','meowAssistantDragHandle','meowAssistantMinimize']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(html.includes("const MEOW_ASSISTANT_POS_KEY='meow-work-assistant-pos-v1'"),'Meow Assistant drag position persistence missing');
assert(html.includes('function bindMeowAssistantDrag()'),'Meow Assistant drag binding missing');
assert(html.includes('function clampMeowAssistantPosition(left,top)'),'Meow Assistant viewport clamp missing');
assert(html.includes("saveMeowAssistantPosition()"),'Meow Assistant dragged position must be remembered');
assert(html.includes("d.show()"),'Meow Assistant must open as non-modal floating UI');
assert(html.includes(".meow-assistant-dialog::backdrop{display:none}"),'Meow Assistant must not block the page with a modal backdrop');
console.log('PASS v161 draggable floating Meow Assistant structure');


for(const id of ['meowAssistantFab','meowAssistantDialog','meowAssistantDragHandle','meowAssistantMinimize','meowAssistantMonthDialog','meowAssistantMonthGrid']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert(html.includes('.meow-assistant-dialog.minimized'),'Meow Assistant minimized floating state missing');
assert(html.includes('function bindMeowAssistantDrag()'),'Meow Assistant drag binding missing');
assert(html.includes("setMeowAssistantMinimized(!d.classList.contains('minimized'))"),'Meow Assistant minimize/expand control missing');
assert(html.includes("placeholder=\"直接輸入你要做的事\""),'Meow Assistant input should not show redundant example copy');
assert(html.includes("renderMeowAssistantReply('已更新班表。','success')"),'Meow Assistant success copy must stay concise');
assert(html.includes('async function meowAssistantCloudSnapshot(year,month)'),'Month-aware cloud schedule lookup missing');
assert(html.includes('cloudHistoryEntries(payload)'),'Month lookup must consider cloud history snapshots');
assert(html.includes('closeMeowAssistant();') && html.includes("$('meowAssistantMonthDialog')"),'Month schedule should open separately after assistant gets out of the way');
console.log('PASS v160 movable concise cloud-month Meow Assistant structure');


for(const id of ['meowAssistantFab','meowAssistantDialog','meowAssistantDragHandle','meowAssistantInput','meowAssistantSend','meowAssistantMonthDialog','meowAssistantMonthGrid']){
  assert.equal(ids[id],1,'missing or duplicated #'+id);
}
assert.equal(ids.meowAssistantPreview||0,0,'old assistant confirmation preview must be removed');
assert.equal(ids.meowAssistantApply||0,0,'old assistant confirm button must be removed');
assert.equal((html.match(/data-meow-example=/g)||[]).length,0,'assistant example chips must be removed');
assert(!html.includes('用一句話幫你改加班日期'),'old assistant subtitle must be removed');
assert(html.includes("if(!d.open)d.show();"),'assistant must open non-modally');
assert(html.includes('function bindMeowAssistantDrag()'),'assistant drag behavior missing');
assert(html.includes("type:'viewSchedule'"),'assistant month schedule intent missing');
assert(html.includes("from('user_sync_state').select('payload,updated_at')"),'assistant month viewer must read Pro cloud work data');
assert(html.includes("state.dayStatus[plan.to].note=state.dayStatus[plan.to].note||'';"),'assistant moves must not add visible notes');
assert(html.includes("return{type:'overtime',hours,note:'',label:'',overtimeKind:kind};"),'assistant overtime adds must not add visible notes');
console.log('PASS v160 floating Meow assistant and cloud month viewer structure');


const settingsSection=html.slice(
  html.indexOf('<section class="page" id="page-settings">'),
  html.indexOf('</main></div></div>')
);
assert(settingsSection.indexOf('id="profilePreview"') < settingsSection.indexOf('id="accountPlanCard"'),'Pro plan must follow the account identity card');
assert(settingsSection.indexOf('id="accountPlanCard"') < settingsSection.indexOf('id="appearanceCard"'),'Pro plan must sit directly above appearance/settings cards');
assert(settingsSection.includes('Free・本機保存'),'Free local-storage explanation missing');
assert(settingsSection.includes('Pro・本機＋雲端'),'Pro cloud-storage explanation missing');
assert(settingsSection.includes('立即儲存到本機'),'Free local save action missing');
assert(settingsSection.includes('立即備份到雲端') && settingsSection.includes('從雲端還原'),'Pro cloud actions missing');
assert(!settingsSection.includes('匯出備份檔') && !settingsSection.includes('匯入備份檔'),'manual JSON backup controls should not clutter the visible settings UI');
console.log('PASS v160 Pro placement and simplified data-management structure');


