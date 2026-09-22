from pathlib import Path
import sys
root=Path(sys.argv[1]); p=root/'index.html'; s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'anchor {s.count(a)}: {a[:80]}')
 s=s.replace(a,b,1)

once('<select id="settingOvertimeMode"><option value="legal">勞基法標準</option><option value="fixed">固定倍率</option><option value="custom">公司自訂</option></select>',
'<select id="settingOvertimeMode"><option value="unselected">請選擇公司的加班費率</option><option value="legal">勞基法標準（分段倍率）</option><option value="fixed">固定倍率</option><option value="custom">公司自訂</option></select>')

once("overtimeRateMode:'legal',overtimeFixedRate:2","overtimeRateMode:'unselected',overtimeFixedRate:2")

old="function overtimeRates(){const mode=['legal','fixed','custom'].includes(state.settings.overtimeRateMode)?state.settings.overtimeRateMode:'legal';if(mode==='fixed'){const r=Math.max(1,num(state.settings.overtimeFixedRate)||2);return{mode,regularFirst:r,regularLater:r,restFirst:r,restLater:r,restOver8:r,holiday:r}}if(mode==='custom')return{mode,regularFirst:Math.max(1,num(state.settings.overtimeRegularFirst)||4/3),regularLater:Math.max(1,num(state.settings.overtimeRegularLater)||5/3),restFirst:Math.max(1,num(state.settings.overtimeRestFirst)||4/3),restLater:Math.max(1,num(state.settings.overtimeRestLater)||5/3),restOver8:Math.max(1,num(state.settings.overtimeRestOver8)||8/3),holiday:1};return{mode:'legal',regularFirst:4/3,regularLater:5/3,restFirst:4/3,restLater:5/3,restOver8:8/3,holiday:1}}"
new="function overtimeRates(){const mode=['unselected','legal','fixed','custom'].includes(state.settings.overtimeRateMode)?state.settings.overtimeRateMode:'unselected';if(mode==='unselected')return{mode,regularFirst:0,regularLater:0,restFirst:0,restLater:0,restOver8:0,holiday:0};if(mode==='fixed'){const r=Math.max(1,num(state.settings.overtimeFixedRate)||2);return{mode,regularFirst:r,regularLater:r,restFirst:r,restLater:r,restOver8:r,holiday:r}}if(mode==='custom')return{mode,regularFirst:Math.max(1,num(state.settings.overtimeRegularFirst)||4/3),regularLater:Math.max(1,num(state.settings.overtimeRegularLater)||5/3),restFirst:Math.max(1,num(state.settings.overtimeRestFirst)||4/3),restLater:Math.max(1,num(state.settings.overtimeRestLater)||5/3),restOver8:Math.max(1,num(state.settings.overtimeRestOver8)||8/3),holiday:1};return{mode:'legal',regularFirst:4/3,regularLater:5/3,restFirst:4/3,restLater:5/3,restOver8:8/3,holiday:1}}"
once(old,new)

once("function overtimeRateSummary(){const r=overtimeRates();return r.mode==='fixed'?'固定 '+r.regularFirst.toFixed(2)+' 倍':r.mode==='custom'?'公司自訂倍率':'勞基法標準（平日 4/3、5/3；休息日 4/3、5/3、8/3）'}",
"function overtimeRateSummary(){const r=overtimeRates();return r.mode==='unselected'?'尚未選擇（請到設定選擇公司實際費率）':r.mode==='fixed'?'固定 '+r.regularFirst.toFixed(2)+' 倍':r.mode==='custom'?'公司自訂倍率':'勞基法標準（平日 4/3、5/3；休息日 4/3、5/3、8/3）'}")

once("if($('settingOvertimeMode'))$('settingOvertimeMode').value=state.settings.overtimeRateMode||'legal';",
"if($('settingOvertimeMode'))$('settingOvertimeMode').value=state.settings.overtimeRateMode||'unselected';")
once("const otMode=state.settings.overtimeRateMode||'legal';","const otMode=state.settings.overtimeRateMode||'unselected';")
once("$('overtimeModeHint').textContent=otMode==='legal'?'平日前 2 小時 4/3、第 3～4 小時 5/3；休息日依分段費率。':otMode==='fixed'?'所有加班時數使用同一倍率。':'可依公司優於法令的制度自行設定各區間倍率。';",
"$('overtimeModeHint').textContent=otMode==='unselected'?'請先依公司實際制度選擇；App 不會自行替你套用倍率。':otMode==='legal'?'平日前 2 小時 4/3、第 3～4 小時 5/3；休息日依分段費率。':otMode==='fixed'?'所有加班時數使用同一倍率，例如你的公司若為 2 倍，就輸入 2。':'可依公司實際制度自行設定各區間倍率。';")
once("state.settings.overtimeRateMode=e.target.value||'legal'","state.settings.overtimeRateMode=e.target.value||'unselected'")

old_formula="`<b>ⓘ 計算說明</b><br>● 本月輪班津貼 ＝ ${money(mc.shiftPerDay)} × ${mc.attendance} 個實際出勤日 ＝ ${money(mc.shiftAllowance)}<br>● 平日每小時工資額 ＝（底薪＋本月輪班津貼＋伙食津貼＋表現津貼）÷ 240 ＝ ${money(mc.hourly)}<br>● 加班費率 ＝ ${overtimeRateSummary()}<br>● 本月加班費 ＝依逐日加班日別與時數分段計算 ＝ ${money(mc.otPay)}`"
new_formula="`<b>ⓘ 計算說明</b><br>● 輪班津貼依「每班津貼 × 實際出勤」自動計算<br>● 平日每小時工資額 ＝（底薪＋輪班津貼＋伙食津貼＋表現津貼）÷ 240 ＝ ${money(mc.hourly)}<br>● 加班費率 ＝ ${overtimeRateSummary()}<br>● 本月加班費 ＝ ${overtimeRates().mode==='unselected'?'尚未計算；請先選擇公司加班費率':money(mc.otPay)}`"
once(old_formula,new_formula)

# Do not calculate overtime money until the user explicitly selects a rate.
once("function monthlyOvertimePay(y,m,hourly,fallbackHours){const prefix=monthKey(y,m)+'-',rows=",
"function monthlyOvertimePay(y,m,hourly,fallbackHours){if(overtimeRates().mode==='unselected')return 0;const prefix=monthKey(y,m)+'-',rows=")

s=s.replace('manifest.webmanifest?v=98','manifest.webmanifest?v=99').replace('介面 v98','介面 v99').replace('meow-sw-reloaded-v98','meow-sw-reloaded-v99').replace('./sw.js?v=98','./sw.js?v=99')
p.write_text(s)
sw=root/'sw.js'; w=sw.read_text().replace('meow-work-pwa-v98','meow-work-pwa-v99').replace('manifest.webmanifest?v=98','manifest.webmanifest?v=99'); sw.write_text(w)
print('v99 applied')
\n