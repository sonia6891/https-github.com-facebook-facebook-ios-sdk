"""Unify scheduling labels and two-level selection without migrating saved data."""
from pathlib import Path
import hashlib,re,sys,json
root=Path(sys.argv[1]);parts=Path(__file__).parent
s=(root/'index.html').read_text();original=s
raw=s.encode();assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='0a575840e3bc3bc391e004fdc22c16cc144eeb2b','Reviewed source changed'
def replace(a,b):
 global s
 assert s.count(a)==1,(a[:160],s.count(a))
 s=s.replace(a,b)
old='<div class="schedule-mode-row"><label for="patternPreset">排班模式</label><select id="patternPreset"><option value="2-2">做2休2</option><option value="4-3">做4休3</option><option value="four-three">四班三輪（早／中／夜）</option><option value="custom">自訂做X休Y</option></select></div>'
new='''<div class="schedule-mode-row"><label for="patternPreset">排班模式</label><select id="patternPreset"><option value="four-two">四班二輪</option><option value="four-three">四班三輪</option><option value="custom">自訂排班</option></select></div>
      <div class="schedule-mode-row hidden" id="twoShiftCycleRow"><label for="twoShiftCycle">上班週期</label><select id="twoShiftCycle" aria-describedby="twoShiftPendingHint"><option value="" disabled>請選擇上班週期</option><option value="2-2">做二休二</option><option value="4-3">做四休三</option></select></div>
      <p class="hint hidden" id="twoShiftPendingHint">選擇上班週期後即套用；選擇前保留目前班表。</p>'''
replace(old,new)
replace('// Personal four-team/three-shift rotation. Existing on/off schedules remain unchanged.',(parts/'schedule_choices.js').read_text()+'\n// Personal four-team/three-shift rotation. Existing on/off schedules remain unchanged.')
replace("$('patternPreset').value=state.schedule.preset;","syncScheduleChoices();")
replace("$('patternPreset').onchange=e=>changeSchedulePreset(e.target.value);","$('patternPreset').onchange=e=>changeScheduleFamily(e.target.value);\n$('twoShiftCycle').onchange=e=>changeTwoShiftCycle(e.target.value);")
replace("$('rotationDialog').addEventListener('close',()=>{$('patternPreset').value=state.schedule.preset});","$('rotationDialog').addEventListener('close',syncScheduleChoices);")
replace("$('scheduleSummary').textContent=`做${state.schedule.workDays}休${state.schedule.offDays}｜${own}｜第一個上班日 ${state.schedule.startDate}`;","$('scheduleSummary').textContent=`${scheduleName()}｜${workRestLabel()}｜${own}｜第一個上班日 ${state.schedule.startDate}`;")
replace("$('settingsScheduleSummary').textContent=`做${state.schedule.workDays}休${state.schedule.offDays}・${own}・${state.schedule.startDate}`;","$('settingsScheduleSummary').textContent=`${scheduleName()}・${workRestLabel()}・${own}・${state.schedule.startDate}`;")
replace('id="scheduleSummary">做2休2｜A班｜第一個上班日','id="scheduleSummary">四班二輪｜做二休二｜A班｜第一個上班日')
replace('id="settingsScheduleSummary">做2休2・A班','id="settingsScheduleSummary">四班二輪・做二休二・A班')
replace("g.count+'天'","chineseScheduleCount(g.count)+'天'")
replace("'四班三輪｜'+r.sequence.length+' 天一循環｜第1天 '","'四班三輪｜'+chineseScheduleCount(r.sequence.length)+'天一循環｜第一天 '")
replace("'四班三輪・'+r.sequence.length+' 天循環・'","'四班三輪・'+chineseScheduleCount(r.sequence.length)+'天循環・'")
# Preserve ordinary date/time digits and numbered day positions. Only names and cycle labels are localized.
for a,b in [('manifest.webmanifest?v=91','manifest.webmanifest?v=92'),('./sw.js?v=91','./sw.js?v=92'),('meow-sw-reloaded-v91','meow-sw-reloaded-v92'),('介面 v91','介面 v92')]:
 assert a in s,a
 s=s.replace(a,b)
assert '做2休2' not in s and '做4休3' not in s and '自訂做X休Y' not in s
# No stylesheet or existing persistence/counting function may change.
assert re.search(r'<style>([\s\S]*?)</style>',s)[1]==re.search(r'<style>([\s\S]*?)</style>',original)[1]
for name in ['defaultState','loadSaved','saveSchedulePrefs','scheduleForDate','calcMonth','changeSchedulePreset','threeShiftForDate']:
 pattern=r'function '+name+r'\([^\n]+'
 assert re.search(pattern,s)[0]==re.search(pattern,original)[0],name
(root/'index.html').write_text(s)
p=root/'sw.js';sw=p.read_text();assert 'meow-work-pwa-v91' in sw
p.write_text(sw.replace('meow-work-pwa-v91','meow-work-pwa-v92').replace('manifest.webmanifest?v=91','manifest.webmanifest?v=92'))
print(json.dumps({'version':92,'sha256':hashlib.sha256(s.encode()).hexdigest(),'stored_presets_unchanged':True,'stylesheet_unchanged':True}))
