from pathlib import Path
import re, sys
root=Path(sys.argv[1]); p=root/'index.html'; s=p.read_text()
def once(old,new):
    global s
    if s.count(old)!=1: raise RuntimeError('Expected one source anchor: '+old[:100]+', found '+str(s.count(old)))
    s=s.replace(old,new,1)
manual='<div class="field"><label>公司年度核給特休總天數</label><input id="settingAnnualDays" type="number" min="0" step="0.5" placeholder="例如 14"><div class="hint">若留 0，總覽會先以勞基法法定最低天數試算。</div></div>'
once(manual,'<div class="field"><label for="settingAnnualQuota">法定特休天數（自動計算）</label><input id="settingAnnualQuota" type="text" readonly aria-describedby="settingAnnualQuotaHint" value="請先設定到職日"><div class="hint" id="settingAnnualQuotaHint">依公司到職日與年資自動帶入，無須手動輸入天數。</div></div>')
anchor='          <div class="field"><label>今年已使用病假時數（補登）</label>'
once(anchor,'          <div class="field"><label for="settingAnnualUsedHours">已使用特休時數（補登）</label><input id="settingAnnualUsedHours" type="number" min="0" step="0.5" inputmode="decimal" placeholder="例如 24" aria-describedby="annualUsedHoursHint"><div class="hint" id="annualUsedHoursHint"></div><div class="hint" id="annualSettingsBalance" aria-live="polite"></div></div>\n'+anchor)
once('用來把假別天數換算成小時。','用來估算出勤及其他假別時數；特休採每日 8 小時換算，不隨輪班班次長度增加。')
once('annualLeaveDays:0,annualLeaveCycle:', 'annualUsedHoursByPeriod:{},annualLeaveCycle:')
a=s.index('function tenureInfo('); b=s.index('function yearlyLeaveUsage(',a)
s=s[:a]+(Path(__file__).parent/'annual-functions.js').read_text()+'\n'+s[b:]
a=s.index('const legalAnnual=statutoryAnnualLeaveDays();'); b=s.index('const settlement=annualSettlementInfo();',a)
s=s[:a]+'''const annualInfo=annualLeaveBalanceInfo();
paintBalance('annual',annualInfo);
if(annualInfo.totalHours<=0)$('annualBalanceMain').textContent=annualInfo.period.missing?'尚未取得額度':'剩 0 天 / 0 小時';
$('annualBalanceDetail').textContent=annualBalanceText(annualInfo);
'''+s[b:]
once("settlementEl.textContent=settlement.mode==='custom'?'請到設定填入公司特休結算日。':'請到設定填入公司到職日。';","settlementEl.textContent=settlement.reason;")
once("setWork('settingAnnualDays',state.settings.annualLeaveDays||0);",'renderAnnualLeaveSettings();')
once(",['settingAnnualDays','annualLeaveDays']",'')
once("function saveActualItem(key,raw){",'''$('settingAnnualUsedHours').oninput=e=>{
  if(!e.target.validity.valid)return;
  const period=annualLeavePeriod();
  if(period.missing||statutoryAnnualLeaveDays()===0)return;
  const hours=Number(e.target.value||0);
  if(!Number.isFinite(hours)||hours<0)return;
  state.settings.annualUsedHoursByPeriod=Object.assign({},state.settings.annualUsedHoursByPeriod||{}, {[period.key]:hours});
  changedAndSync();render();
};
function saveActualItem(key,raw){''')
once('特休年度終結仍未休完，原則上應結算工資；如勞雇雙方協商，也可遞延至次一年度。','特休為勞基法一般全時勞工試算，以每日 8 小時換算；部分工時、留職停薪、公司優給或遞延需另依實際制度核對。特休年度終結未休完，原則上應結算工資；經勞雇雙方協商才可遞延，本工具不自動遞延或刪除歷史紀錄。')
version=re.search(r'介面 v(\d+)',s)
if not version: raise RuntimeError('Missing app version')
v=int(version[1]); nv=v+1
s=s.replace('manifest.webmanifest?v='+str(v),'manifest.webmanifest?v='+str(nv)).replace('介面 v'+str(v),'介面 v'+str(nv)).replace('sw.js?v='+str(v),'sw.js?v='+str(nv)).replace('meow-sw-reloaded-v'+str(v),'meow-sw-reloaded-v'+str(nv))
assert 'settingAnnualDays' not in s and 'companyAnnual' not in s
p.write_text(s)
sw=root/'sw.js'; w=sw.read_text(); w=w.replace('meow-work-pwa-v'+str(v),'meow-work-pwa-v'+str(nv)).replace('manifest.webmanifest?v='+str(v),'manifest.webmanifest?v='+str(nv));sw.write_text(w)
print('Annual-leave update applied; interface v'+str(nv))
