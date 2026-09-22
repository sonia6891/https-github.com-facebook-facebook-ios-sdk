from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'index.html';s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'anchor {s.count(a)}: {a[:80]}')
 s=s.replace(a,b,1)
once('<div><b>加班時薪</b><strong id="resultHourly">NT$0</strong></div>','<div><b id="resultHourlyLabel">加班時薪</b><strong id="resultHourly">NT$0</strong><small id="resultHourlySub"></small></div>')
once("function overtimeRateSummary(){const r=overtimeRates();return r.mode==='unselected'?'尚未選擇（請到設定選擇公司實際費率）':r.mode==='fixed'?'固定 '+r.regularFirst.toFixed(2)+' 倍':r.mode==='custom'?'公司自訂倍率':'勞基法標準（平日 4/3、5/3；休息日 4/3、5/3、8/3）'}",
"""function overtimeRateSummary(){const r=overtimeRates();return r.mode==='unselected'?'尚未選擇（請到設定選擇公司實際費率）':r.mode==='fixed'?'固定 '+r.regularFirst.toFixed(2)+' 倍':r.mode==='custom'?'公司自訂倍率':'勞基法標準（平日 4/3、5/3；休息日 4/3、5/3、8/3）'}
function overtimeHourlyDisplay(baseHourly){const r=overtimeRates();if(r.mode==='unselected')return{label:'基礎時薪',main:baseHourly,sub:'尚未選擇加班費率'};if(r.mode==='fixed')return{label:'實際加班時薪',main:baseHourly*r.regularFirst,sub:'基礎時薪 '+money(baseHourly)+' × '+r.regularFirst.toFixed(2)};if(r.mode==='legal')return{label:'加班分段時薪',main:null,sub:'前 2 小時 '+money(baseHourly*r.regularFirst)+'／時・第 3～4 小時 '+money(baseHourly*r.regularLater)+'／時'};return{label:'加班分段時薪',main:null,sub:'前 2 小時 '+money(baseHourly*r.regularFirst)+'／時・第 3～4 小時 '+money(baseHourly*r.regularLater)+'／時'}}""")
once("  $('resultHourly').textContent=money(mc.hourly);",
"""  const hourlyDisplay=overtimeHourlyDisplay(mc.hourly);
  $('resultHourlyLabel').textContent=hourlyDisplay.label;
  $('resultHourly').textContent=hourlyDisplay.main===null?'依分段費率':money(hourlyDisplay.main);
  $('resultHourlySub').textContent=hourlyDisplay.sub;""")
old="● 平日每小時工資額 ＝（底薪＋輪班津貼＋伙食津貼＋表現津貼）÷ 240 ＝ ${money(mc.hourly)}<br>● 加班費率 ＝ ${overtimeRateSummary()}"
new="● 基礎時薪 ＝（底薪＋輪班津貼＋伙食津貼＋表現津貼）÷ 240 ＝ ${money(mc.hourly)}<br>● 加班費率 ＝ ${overtimeRateSummary()}<br>● ${overtimeHourlyDisplay(mc.hourly).label} ＝ ${overtimeHourlyDisplay(mc.hourly).main===null?overtimeHourlyDisplay(mc.hourly).sub:money(overtimeHourlyDisplay(mc.hourly).main)}"
once(old,new)
# requested consistency from prior turn
once('<label for="settingAnnualUsedHours">已使用特休時數（補登）</label>','<label for="settingAnnualUsedHours">今年已使用特休時數（補登）</label>')
s=s.replace('manifest.webmanifest?v=99','manifest.webmanifest?v=100').replace('介面 v99','介面 v100').replace('meow-sw-reloaded-v99','meow-sw-reloaded-v100').replace('./sw.js?v=99','./sw.js?v=100')
p.write_text(s)
sw=root/'sw.js';w=sw.read_text().replace('meow-work-pwa-v99','meow-work-pwa-v100').replace('manifest.webmanifest?v=99','manifest.webmanifest?v=100');sw.write_text(w)
print('v100 applied')
\n