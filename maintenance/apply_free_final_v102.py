from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'index.html';s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'anchor {s.count(a)}: {a[:100]}')
 s=s.replace(a,b,1)
# Annual is period-based; sick/personal remain calendar-year based.
if '本期已使用特休時數（補登）' not in s:
 once('<label for="settingAnnualUsedHours">今年已使用特休時數（補登）</label>','<label for="settingAnnualUsedHours">本期已使用特休時數（補登）</label>')
assert '今年已使用病假時數（補登）' in s and '今年已使用事假時數（補登）' in s

anchor="function overtimeRateSummary(){const r=overtimeRates();return r.mode==='unselected'?'尚未選擇（請到設定選擇公司實際費率）':r.mode==='fixed'?'固定 '+r.regularFirst.toFixed(2)+' 倍':r.mode==='custom'?'公司自訂倍率':'勞基法標準（平日 4/3、5/3；休息日 4/3、5/3、8/3）'}"
helper="""function overtimeFormulaDetail(mc){const r=overtimeRates(),h=mc.hourly,total=mc.overtimeHours;if(r.mode==='unselected')return '尚未計算；請先選擇公司加班費率';const rows=Object.entries(state.dayStatus||{}).filter(([d,st])=>d.startsWith(monthKey(mc.y,mc.m)+'-')&&st&&st.type==='overtime');if(!rows.length){if(r.mode==='fixed')return money(h)+' × '+r.regularFirst.toFixed(2)+' × '+total+' 小時 ＝ '+money(mc.otPay);if(r.mode==='legal'||r.mode==='custom'){const a=Math.min(total,2),b=Math.max(total-2,0);return (a?money(h)+' × '+r.regularFirst.toFixed(2)+' × '+a+' 小時':'')+(a&&b?' ＋ ':'')+(b?money(h)+' × '+r.regularLater.toFixed(2)+' × '+b+' 小時':'')+' ＝ '+money(mc.otPay)}}const parts=rows.map(([d,st])=>{const hrs=num(st.hours),kind=st.overtimeKind||'regular';if(r.mode==='fixed')return d.slice(5)+'：'+money(h)+' × '+r.regularFirst.toFixed(2)+' × '+hrs+' 小時';if(kind==='rest'){const a=Math.min(hrs,2),b=Math.min(Math.max(hrs-2,0),6),c=Math.max(hrs-8,0);return d.slice(5)+' 休息日：'+[a?money(h)+'×'+r.restFirst.toFixed(2)+'×'+a:'',b?money(h)+'×'+r.restLater.toFixed(2)+'×'+b:'',c?money(h)+'×'+r.restOver8.toFixed(2)+'×'+c:''].filter(Boolean).join(' ＋ ')}if(kind==='holiday')return d.slice(5)+' 假日：'+money(h)+' × '+r.holiday.toFixed(2)+' × '+hrs+' 小時';const a=Math.min(hrs,2),b=Math.max(hrs-2,0);return d.slice(5)+' 平日：'+[a?money(h)+'×'+r.regularFirst.toFixed(2)+'×'+a:'',b?money(h)+'×'+r.regularLater.toFixed(2)+'×'+b:''].filter(Boolean).join(' ＋ ')});return parts.join('<br>　')+'<br>　合計 ＝ '+money(mc.otPay)}
"""
once(anchor,anchor+"\n"+helper)
old="● 本月加班費 ＝ ${overtimeRates().mode==='unselected'?'尚未計算；請先選擇公司加班費率':money(mc.otPay)}"
new="● 本月加班費<br>　${overtimeFormulaDetail(mc)}"
once(old,new)
s=s.replace('manifest.webmanifest?v=101','manifest.webmanifest?v=102').replace('介面 v101','介面 v102').replace('meow-sw-reloaded-v101','meow-sw-reloaded-v102').replace('./sw.js?v=101','./sw.js?v=102')
p.write_text(s)
sw=root/'sw.js';w=sw.read_text().replace('meow-work-pwa-v101','meow-work-pwa-v102').replace('manifest.webmanifest?v=101','manifest.webmanifest?v=102');sw.write_text(w)
print('v102 applied')
