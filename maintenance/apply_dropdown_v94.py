"""Consolidate existing presets in one selector; leave schedule data/math unchanged."""
from pathlib import Path
import re,sys,hashlib
root=Path(sys.argv[1]);p=root/'index.html';original=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(original)).encode()+b'\0'+original).hexdigest()=='5384f2fba54cdf2eef7afa7e858bbaea666eef36','Rebase on current production before editing'
s=original.decode()
def replace(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
a=s.index('      <div class="schedule-plan-header">');b=s.index('      <p class="schedule-plan-detail"',a)
s=s[:a]+'''      <div class="schedule-plan-header">
        <label for="patternPreset"><svg class="icon" aria-hidden="true"><use href="#i-calendar"/></svg>目前排班方案</label>
        <button type="button" class="expand-btn" id="toggleSchedule">⚙ 展開設定⌄</button>
        <select id="patternPreset">
          <optgroup label="四班二輪">
            <option value="2-2">四班二輪・做二休二</option>
            <option value="4-3">四班二輪・做四休三</option>
          </optgroup>
          <option value="four-three">四班三輪</option>
          <option value="custom">自訂排班</option>
        </select>
      </div>
'''+s[b:]
a=s.index('/* A single family dropdown');b=s.index('.schedule-plan-detail{',a)
s=s[:a]+'''/* One native dropdown contains both two-shift cycles. */
.schedule-plan-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 12px}
.schedule-plan-header>label{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:800;color:var(--ink)}
.schedule-plan-header>label .icon{width:18px;height:18px}
.schedule-plan-header>select{grid-column:1/-1;display:block;width:100%;min-width:0;min-height:44px;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;padding:10px 32px 10px 12px;color:var(--ink);font:inherit;font-weight:800;appearance:none;-webkit-appearance:none;background-color:var(--paper);background-image:linear-gradient(45deg,transparent 50%,var(--ink) 50%),linear-gradient(135deg,var(--ink) 50%,transparent 50%);background-position:calc(100% - 17px) 50%,calc(100% - 12px) 50%;background-size:5px 5px;background-repeat:no-repeat}
.schedule-plan-header .expand-btn{min-height:44px;white-space:nowrap}
.schedule-plan-header>select:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
'''+s[b:]
s=s.replace('html.dark .schedule-plan-control select','html.dark .schedule-plan-header>select')
replace('let pendingTwoShiftBase=null;\n','')
a=s.index('function syncScheduleChoices(){');b=s.index('// Personal four-team/three-shift rotation.',a)
s=s[:a]+'''function syncScheduleChoices(){
  const preset=state.schedule.preset;
  $('patternPreset').value=['2-2','4-3','four-three','custom'].includes(preset)?preset:'custom';
}
function selectSchedulePlan(value){
  if(!['2-2','4-3','four-three','custom'].includes(value)){syncScheduleChoices();return}
  if(value===state.schedule.preset&&!(value==='four-three'&&!threeShiftPlan())){syncScheduleChoices();return}
  changeSchedulePreset(value);
  if(!$('rotationDialog').open)syncScheduleChoices();
}

'''+s[b:]
replace("$('patternPreset').onchange=e=>changeScheduleFamily(e.target.value);\nqsa('[data-two-cycle]').forEach(button=>button.onclick=()=>changeTwoShiftCycle(button.dataset.twoCycle));", "$('patternPreset').onchange=e=>selectSchedulePlan(e.target.value);")
for a,b in [('manifest.webmanifest?v=93','manifest.webmanifest?v=94'),('./sw.js?v=93','./sw.js?v=94'),('meow-sw-reloaded-v93','meow-sw-reloaded-v94'),('介面 v93','介面 v94')]:
 assert a in s,a
 s=s.replace(a,b)
for obsolete in ['pendingTwoShiftBase','twoShiftChoices','twoShiftPendingHint','data-two-cycle','schedule-cycle-choice','changeScheduleFamily','changeTwoShiftCycle','schedule-plan-control']:
 assert obsolete not in s,obsolete
for name in ['scheduleForDate','changeSchedulePreset','calcMonth','saveSchedulePrefs','updateRotationSummary','threeShiftForDate']:
 pattern=r'function '+name+r'\([^\n]*[\s\S]*?(?=\nfunction |\nconst |\n//|\nlet )'
 assert re.search(pattern,s)[0]==re.search(pattern,original.decode())[0],name
assert s.count('id="patternPreset"')==1
p.write_text(s)
sw=root/'sw.js';raw=sw.read_text();assert 'meow-work-pwa-v93' in raw
sw.write_text(raw.replace('meow-work-pwa-v93','meow-work-pwa-v94').replace('manifest.webmanifest?v=93','manifest.webmanifest?v=94'))
print('UI only; original data keys/math/records unchanged. HTML SHA256:',hashlib.sha256(p.read_bytes()).hexdigest())
