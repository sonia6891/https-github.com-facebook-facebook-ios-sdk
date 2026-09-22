"""Gate existing schedule controls behind the expand button; no data migration."""
from pathlib import Path
import sys,hashlib,json
root=Path(sys.argv[1]);s=(root/'index.html').read_text();raw=s.encode()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='89e7b72b36bcfb7ca40f13cd614945836a6899ab','Source changed; rebase before applying'
def change(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
change('<button type="button" class="expand-btn" id="toggleSchedule">','<button type="button" class="expand-btn" id="toggleSchedule" aria-controls="scheduleSettings" aria-expanded="false">')
change('<select id="patternPreset">','<strong class="schedule-plan-value" id="schedulePlanValue">四班二輪・做二休二</strong>\n        <select id="patternPreset" class="hidden" disabled>')
change('.schedule-plan-detail{','.schedule-plan-value{grid-column:1/-1;display:block;font-size:18px;line-height:1.5;font-weight:850;color:var(--ink);overflow-wrap:anywhere}\n.schedule-plan-detail{')
change('<button type="button" class="btn" id="editRotation">','<button type="button" class="btn hidden" id="editRotation" disabled>')
a="""function syncScheduleChoices(){
  const preset=state.schedule.preset;
  $('patternPreset').value=['2-2','4-3','four-three','custom'].includes(preset)?preset:'custom';
}"""
b="""function syncScheduleChoices(){
  const preset=state.schedule.preset;
  const select=$('patternPreset');
  select.value=['2-2','4-3','four-three','custom'].includes(preset)?preset:'custom';
  $('schedulePlanValue').textContent=select.selectedOptions[0]?.textContent||scheduleName();
  syncScheduleEditing();
}
function syncScheduleEditing(){
  const open=!!scheduleOpen;
  $('patternPreset').disabled=!open;
  $('patternPreset').classList.toggle('hidden',!open);
  $('schedulePlanValue').classList.toggle('hidden',open);
  $('scheduleSettings').classList.toggle('hidden',!open);
  $('editRotation').disabled=!open;
  $('editRotation').classList.toggle('hidden',!open);
  $('toggleSchedule').setAttribute('aria-expanded',String(open));
  $('toggleSchedule').textContent=open?'⚙ 收起設定⌃':'⚙ 展開設定⌄';
}"""
change(a,b)
change('function selectSchedulePlan(value){',"function selectSchedulePlan(value){\n  if(!scheduleOpen){syncScheduleChoices();return}")
change('function openRotationSetup(){',"function openRotationSetup(){\n  if(!scheduleOpen)return;")
change("$('toggleSchedule').onclick=()=>{scheduleOpen=!scheduleOpen;$('scheduleSettings').classList.toggle('hidden',!scheduleOpen);$('toggleSchedule').textContent=scheduleOpen?'⚙ 收起設定⌃':'⚙ 展開設定⌄'};","$('toggleSchedule').onclick=()=>{scheduleOpen=!scheduleOpen;syncScheduleChoices()};")
for a,b in [('manifest.webmanifest?v=94','manifest.webmanifest?v=95'),('./sw.js?v=94','./sw.js?v=95'),('meow-sw-reloaded-v94','meow-sw-reloaded-v95'),('介面 v94','介面 v95')]:
 assert a in s,a
 s=s.replace(a,b)
(root/'index.html').write_text(s)
f=root/'sw.js';sw=f.read_text();assert 'meow-work-pwa-v94' in sw
f.write_text(sw.replace('meow-work-pwa-v94','meow-work-pwa-v95').replace('manifest.webmanifest?v=94','manifest.webmanifest?v=95'))
print(json.dumps({'version':95,'html_sha256':hashlib.sha256(s.encode()).hexdigest(),'scope':'Read-only collapsed schedule. Existing grouped selector and rotation editor enabled only while expanded.'}))
