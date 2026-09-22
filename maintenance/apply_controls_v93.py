"""Apply the approved v93 controls to the reviewed v92 source, with exact hashes."""
from pathlib import Path
import hashlib,sys
root=Path(sys.argv[1])
s=(root/'index.html').read_text()
assert hashlib.sha1(b'blob '+str(len(s.encode())).encode()+b'\0'+s.encode()).hexdigest()=='8f371e15036ffd200e9631405aa3db7caea957c2','Source changed; review before updating'
def replace(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
start=s.index('.schedule-mode-row{');end=s.index('.rotation-active-info{',start)
s=s[:start]+'''/* A single family dropdown and two direct choices; no second cycle dropdown. */
.schedule-plan-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12px}
.schedule-plan-control{min-width:0}
.schedule-plan-control label{display:flex;align-items:center;gap:7px;margin-bottom:8px;font-size:14px;font-weight:800;color:var(--ink)}
.schedule-plan-control label .icon{width:18px;height:18px}
.schedule-plan-control select{display:block;width:100%;min-width:0;min-height:44px;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;padding:10px 32px 10px 12px;color:var(--ink);font:inherit;font-weight:800;appearance:none;-webkit-appearance:none;background-color:var(--paper);background-image:linear-gradient(45deg,transparent 50%,var(--ink) 50%),linear-gradient(135deg,var(--ink) 50%,transparent 50%);background-position:calc(100% - 17px) 50%,calc(100% - 12px) 50%;background-size:5px 5px;background-repeat:no-repeat}
.schedule-plan-header .expand-btn{min-height:44px;white-space:nowrap}
.schedule-cycle-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.schedule-cycle-choice{min-width:0;min-height:44px;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink);font:inherit;font-size:15px;font-weight:800;cursor:pointer}
.schedule-cycle-choice[aria-pressed="true"]{background:#fbe5c5;color:#623a20;border-color:#9f7147;box-shadow:inset 0 0 0 1px #9f7147}
html.dark .schedule-cycle-choice[aria-pressed="true"]{background:#58402b;color:#ffe1b2;border-color:#c69b68;box-shadow:inset 0 0 0 1px #c69b68}
.schedule-plan-control select:focus-visible,.schedule-cycle-choice:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.schedule-plan-detail{margin:10px 0 0;font-size:12px;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}
'''+s[end:]
replace('html.dark .schedule-mode-row select','html.dark .schedule-plan-control select')
start=s.index('      <div class="schedule-summary">',s.index('<section class="page" id="page-calendar">'))
end=s.index('      <div class="rotation-active-info',start)
s=s[:start]+'''      <div class="schedule-plan-header">
        <div class="schedule-plan-control">
          <label for="patternPreset"><svg class="icon" aria-hidden="true"><use href="#i-calendar"/></svg>目前排班方案</label>
          <select id="patternPreset"><option value="four-two">四班二輪</option><option value="four-three">四班三輪</option><option value="custom">自訂排班</option></select>
        </div>
        <button type="button" class="expand-btn" id="toggleSchedule">⚙ 展開設定⌄</button>
      </div>
      <div class="schedule-cycle-choices hidden" id="twoShiftChoices" role="group" aria-label="四班二輪選項">
        <button type="button" class="schedule-cycle-choice" data-two-cycle="2-2" aria-pressed="false">做二休二</button>
        <button type="button" class="schedule-cycle-choice" data-two-cycle="4-3" aria-pressed="false">做四休三</button>
      </div>
      <p class="hint hidden" id="twoShiftPendingHint">請點選做二休二或做四休三；選定後直接套用，原有紀錄保留。</p>
      <p class="schedule-plan-detail" id="scheduleSummary"></p>
'''+s[end:]
replace("$('twoShiftCycleRow').classList.toggle('hidden',family!=='four-two');","$('twoShiftChoices').classList.toggle('hidden',family!=='four-two');")
replace("  $('twoShiftCycle').value=!pending&&scheduleFamily()==='four-two'?state.schedule.preset:'';", "  const selected=!pending&&scheduleFamily()==='four-two'?state.schedule.preset:'';\n  qsa('[data-two-cycle]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.twoCycle===selected)));")
replace("$('scheduleSummary').textContent='四班三輪｜請重新設定循環'", "$('scheduleSummary').textContent='請重新設定循環'")
replace("$('scheduleSummary').textContent='四班三輪｜'+chineseScheduleCount(r.sequence.length)", "$('scheduleSummary').textContent=chineseScheduleCount(r.sequence.length)")
replace("$('scheduleSummary').textContent=`${scheduleName()}｜${workRestLabel()}｜${own}｜第一個上班日 ${state.schedule.startDate}`", "$('scheduleSummary').textContent=`${scheduleFamily()==='custom'?workRestLabel()+'｜':''}${own}｜第一個上班日 ${state.schedule.startDate}`")
replace("$('twoShiftCycle').onchange=e=>changeTwoShiftCycle(e.target.value);", "qsa('[data-two-cycle]').forEach(button=>button.onclick=()=>changeTwoShiftCycle(button.dataset.twoCycle));")
for a,b in [('manifest.webmanifest?v=92','manifest.webmanifest?v=93'),('./sw.js?v=92','./sw.js?v=93'),('meow-sw-reloaded-v92','meow-sw-reloaded-v93'),('介面 v92','介面 v93')]:
 assert a in s,a
 s=s.replace(a,b)
assert hashlib.sha256(s.encode()).hexdigest()=='59ef1f9c7b890cfceb8772919ba78151d8e7f23c4ec332dfca48a420d9cb3f88','Candidate differs from approved local file'
p=root/'sw.js';sw=p.read_text().replace('meow-work-pwa-v92','meow-work-pwa-v93').replace('manifest.webmanifest?v=92','manifest.webmanifest?v=93')
assert hashlib.sha256(sw.encode()).hexdigest()=='c2621c4dd81371c1c8fcccd62db474a5d25fd0f24e6bbea5023852953017fb58'
(root/'index.html').write_text(s);p.write_text(sw)
print('Exact approved v93 source reproduced; only index.html and sw.js updated.')
