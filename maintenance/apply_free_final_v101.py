from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'index.html';s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'anchor {s.count(a)}: {a[:100]}')
 s=s.replace(a,b,1)
# Clarify salary input: it is a fallback only when no calendar overtime records exist.
once('<label>本月加班總時數（小時）</label><input id="salaryOtHours" type="number" min="0" step="0.5">',
'<label>本月加班總時數（小時）</label><input id="salaryOtHours" type="number" min="0" step="0.5"><div class="hint" id="salaryOtHoursHint">未在排班表逐日登記加班時，可在這裡直接輸入本月總時數。</div>')
# Do not copy calendar hours into manual fallback storage.
old="""function syncMonthOvertimeFromCalendar(date){
  const dt=new Date(date+'T00:00:00'),mk=monthKey(dt.getFullYear(),dt.getMonth());
  const rows=Object.entries(state.dayStatus).filter(([d,s])=>d.startsWith(mk+'-')&&s&&s.type==='overtime');
  state.months[mk]=state.months[mk]||{};
  if(rows.length){
    state.months[mk].overtimeHours=rows.reduce((sum,[d,s])=>sum+num(s.hours),0);
  }else{
    delete state.months[mk].overtimeHours;
  }
}"""
new="""function syncMonthOvertimeFromCalendar(date){
  const dt=new Date(date+'T00:00:00'),mk=monthKey(dt.getFullYear(),dt.getMonth());
  state.months[mk]=state.months[mk]||{};
  // Calendar overtime and manual monthly overtime are separate sources.
  // Never overwrite the user's manual fallback when a calendar day is edited.
}"""
once(old,new)
# UI explicitly indicates which source is active and disables conflicting manual edits.
once("  set('salaryOtHours',mc.overtimeHours);",
"""  set('salaryOtHours',mc.overtimeHours);
  const hasCalendarOt=mc.overtimeDays>0;
  $('salaryOtHours').disabled=hasCalendarOt;
  $('salaryOtHoursHint').textContent=hasCalendarOt?'目前使用排班表已登記的 '+mc.overtimeHours+' 小時；如要改總時數，請直接修改排班表中的加班紀錄。':'目前沒有逐日加班紀錄，可直接輸入本月加班總時數。';""")
# Prevent stale manual value from being overwritten while disabled.
once("$('salaryOtHours').oninput=e=>{mb().overtimeHours=num(e.target.value);refreshCurrentSalarySnapshot();changedAndSync();render()}",
"$('salaryOtHours').oninput=e=>{if(calcMonth().overtimeDays>0)return;mb().overtimeHours=num(e.target.value);refreshCurrentSalarySnapshot();changedAndSync();render()}")
# Suggested day kind: workday => regular, scheduled off => rest, but remains editable.
once("$('dialogStatus').value=selectedType;$('dialogOvertimeKind').value=st.overtimeKind||'regular';",
"$('dialogStatus').value=selectedType;$('dialogOvertimeKind').value=st.overtimeKind||(base==='work'?'regular':'rest');")
# Accurate annual leave wording: period may be anniversary/custom, unlike sick/personal calendar year.
once('<label for="settingAnnualUsedHours">今年已使用特休時數（補登）</label>','<label for="settingAnnualUsedHours">本期已使用特休時數（補登）</label>')
# version
s=s.replace('manifest.webmanifest?v=100','manifest.webmanifest?v=101').replace('介面 v100','介面 v101').replace('meow-sw-reloaded-v100','meow-sw-reloaded-v101').replace('./sw.js?v=100','./sw.js?v=101')
p.write_text(s)
sw=root/'sw.js';w=sw.read_text().replace('meow-work-pwa-v100','meow-work-pwa-v101').replace('manifest.webmanifest?v=100','manifest.webmanifest?v=101');sw.write_text(w)
print('v101 applied')
\n