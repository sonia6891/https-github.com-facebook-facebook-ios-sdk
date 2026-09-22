from pathlib import Path
import hashlib, sys
root=Path(sys.argv[1]);source=Path(__file__).parent
s=(root/'index.html').read_text()
def replace(old,new):
 global s
 assert s.count(old)==1,(old[:100],s.count(old))
 s=s.replace(old,new)
replace("$('settingHireDate').onchange=e=>{state.settings.hireDate=e.target.value||'';changedAndSync();render()};",(source/'date-controller.js').read_text())
replace("$('settingAnnualCustomDate').onchange=e=>{state.settings.annualCustomDate=e.target.value||'';changedAndSync();render()};",'')
replace("$('scheduleStart').onchange=e=>{state.schedule.startDate=e.target.value||iso(new Date());saveSchedulePrefs();render()};",'')
replace("setWork('settingHireDate',state.settings.hireDate||'');","setDateControlValue('settingHireDate',state.settings.hireDate);")
replace("if($('settingAnnualCustomDate')&&document.activeElement!==$('settingAnnualCustomDate'))$('settingAnnualCustomDate').value=state.settings.annualCustomDate||'';","setDateControlValue('settingAnnualCustomDate',state.settings.annualCustomDate);")
replace("$('scheduleStart').value=state.schedule.startDate;","setDateControlValue('scheduleStart',state.schedule.startDate);")
replace('</style>',(source/'date-dialog.css').read_text()+'\n</style>')
replace('<dialog class="dialog" id="dayDialog">',(source/'date-dialog.html').read_text()+'\n<dialog class="dialog" id="dayDialog">')
for a,b in [('manifest.webmanifest?v=76','manifest.webmanifest?v=77'),('meow-sw-reloaded-v76','meow-sw-reloaded-v77'),('./sw.js?v=76','./sw.js?v=77'),('介面 v76','介面 v77')]:
 assert a in s,a
 s=s.replace(a,b)
(root/'index.html').write_text(s)
(root/'404.html').write_text(s)
f=root/'sw.js';sw=f.read_text()
assert 'meow-work-pwa-v76' in sw
f.write_text(sw.replace('meow-work-pwa-v76','meow-work-pwa-v77').replace('manifest.webmanifest?v=76','manifest.webmanifest?v=77'))
print('Applied date transaction repair:',hashlib.sha256((root/'index.html').read_bytes()).hexdigest())
