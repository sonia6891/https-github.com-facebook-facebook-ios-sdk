"""Minimal rotation addition to reviewed v90; no changes to existing records or assets."""
from pathlib import Path
import sys,re,hashlib,json
root=Path(sys.argv[1]);parts=Path(__file__).parent
s=(root/'index.html').read_text();raw=s.encode()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='b6e8d310a69e671418f0e0be9a3beb6ba8b17bce','Source changed; rebase before applying'
def replace(a,b):
 global s
 assert s.count(a)==1,(a[:130],s.count(a))
 s=s.replace(a,b)
field='<div class="field"><label>排班模式</label><select id="patternPreset"><option value="2-2">做2休2</option><option value="4-3">做4休3</option><option value="custom">自訂做X休Y</option></select></div>'
replace(field,'')
replace('<div class="schedule-settings hidden" id="scheduleSettings">', '<div class="schedule-mode-row"><label for="patternPreset">排班模式</label><select id="patternPreset"><option value="2-2">做2休2</option><option value="4-3">做4休3</option><option value="four-three">四班三輪（早／中／夜）</option><option value="custom">自訂做X休Y</option></select></div>\n      <div class="rotation-active-info hidden" id="rotationActiveInfo"><p id="rotationPatternText"></p><button type="button" class="btn" id="editRotation">編輯輪轉設定</button></div>\n      <div class="schedule-settings hidden" id="scheduleSettings">')
replace('<div class="field"><label>你的班別名稱</label>', '<div class="field" id="legacyShiftField"><label>你的班別名稱</label>')
replace('<div class="field"><label>第一個上班日</label>', '<div class="field" id="legacyStartField"><label>第一個上班日</label>')
replace('<div class="hint">另一班會自動推算；', '<div class="hint" id="scheduleRuleHint">另一班會自動推算；')
s=s.replace('</style>', (parts/'rotation.css').read_text()+'\n</style>',1)
replace('<dialog class="dialog" id="dayDialog">', (parts/'rotation.html').read_text()+'\n<dialog class="dialog" id="dayDialog">')
replace('function scheduleForDate(dt){', (parts/'rotation.js').read_text()+'\nfunction scheduleForDate(dt){const rotating=threeShiftForDate(dt);if(rotating)return rotating.work?\'work\':\'off\';')
# Apply new shifts to calendar pills while retaining every manual override branch.
replace("if(st.type==='overtime'&&base==='work')pills=`<div class=\"status-pill st-a\">${own}</div><div class=\"status-pill st-ot\">${icon('i-clock')}加班</div>`", "if(st.type==='overtime'&&base==='work')pills=(threeShiftPill(dt)||`<div class=\"status-pill st-a\">${own}</div>`)+`<div class=\"status-pill st-ot\">${icon('i-clock')}加班</div>`")
replace("else{pills=base==='work'?", "else{pills=threeShiftPill(dt)||(base==='work'?")
replace('<div class="base-note">休假</div>`}const holidayHtml=', '<div class="base-note">休假</div>`)}const holidayHtml=')
replace('<span class="dot govcomp"></span>政府補假</span>`}', '<span class="dot govcomp"></span>政府補假</span>`;updateRotationSummary()}')
replace("$('dialogBase').textContent='原班表：'+(base==='work'?own:other+'（你的休假）');", "$('dialogBase').textContent='原班表：'+(threeShiftForDate(dt)?.label||(base==='work'?own:other+'（你的休假）'));")
replace("title:(state.schedule.shiftName||'A班')+' 上班日'", "title:(threeShiftForDate(dt)?.label||state.schedule.shiftName||'A班')+' 上班日'")
a=s.index("$('patternPreset').onchange=");b=s.index("$('shiftName').oninput=",a)
s=s[:a]+"$('patternPreset').onchange=e=>changeSchedulePreset(e.target.value);\n$('editRotation').onclick=openRotationSetup;\n$('rotationSequence').oninput=rotationDraftPreview;\nqsa('[data-rotation-add]').forEach(b=>b.onclick=()=>{$('rotationSequence').value=($('rotationSequence').value.trim()+' '+b.dataset.rotationAdd).trim();rotationDraftPreview()});\n$('rotationReset').onclick=()=>{$('rotationSequence').value='';rotationDraftPreview();$('rotationSequence').focus()};\n$('rotationApply').onclick=applyRotationSetup;\n$('rotationCancel').onclick=()=>{$('rotationDialog').close()};\n$('rotationDialog').addEventListener('close',()=>{$('patternPreset').value=state.schedule.preset});\n$('rotationForm').onsubmit=e=>{e.preventDefault();applyRotationSetup()};\n"+s[b:]
for old,new in [('manifest.webmanifest?v=90','manifest.webmanifest?v=91'),('./sw.js?v=90','./sw.js?v=91'),('meow-sw-reloaded-v90','meow-sw-reloaded-v91'),('介面 v90','介面 v91')]:
 assert old in s,old
 s=s.replace(old,new)
(root/'index.html').write_text(s)
p=root/'sw.js';p.write_text(p.read_text().replace('meow-work-pwa-v90','meow-work-pwa-v91').replace('manifest.webmanifest?v=90','manifest.webmanifest?v=91'))
print(json.dumps({'version':91,'scope':'Add configurable four-team/three-shift mode; existing records and salary configuration untouched','sha256':hashlib.sha256(s.encode()).hexdigest()},ensure_ascii=False))
