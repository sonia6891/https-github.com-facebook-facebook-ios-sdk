"""Guarded, one-time source integration; refuses mismatched anchors."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
p=root/'index.html';h=p.read_text(encoding='utf-8')
if 'id="welcomeScreen"' in h:
 print('v112 already integrated');raise SystemExit(0)
def replace(old,new,count=1):
 global h
 if h.count(old)!=count:raise RuntimeError(f'Expected {count} copies of {old[:95]!r}, found {h.count(old)}')
 h=h.replace(old,new)
def block(start,end,new):
 global h
 a=h.index(start);b=h.index(end,a);h=h[:a]+new+'\n'+h[b:]
replace('\n<body>\n','\n<body>\n'+(root/'ui/onboarding.html').read_text())
boot='''<link rel="stylesheet" href="./assets/onboarding.css?v=112">
<script id="meow-welcome-boot">
(function(){try{if(localStorage.getItem('meow-work-welcome-v1')!=='done'||new URLSearchParams(location.search).get('welcome')==='1')document.documentElement.classList.add('welcome-open')}catch(e){document.documentElement.classList.add('welcome-open')}})();
</script>
'''
replace('<style>\n:root{',boot+'<style>\n:root{')
replace("let authClient=null,authUser=null,authChannel=null,authTimer=null,authBusy=false;","let authClient=null,authUser=null,authChannel=null,authTimer=null,authBusy=false;\n"+(root/'src/account-access.inc.js').read_text())
block('async function loadEntitlement(){',"let pendingEmail='';",(root/'src/auth-sync.inc.js').read_text())
replace("  return serverPlan==='pro'?'pro':'free';","  return hasLivePro()?'pro':'free';")
replace('  if(!row.pro_until)return true;','  if(!row.pro_until)return false;')
replace("const FEATURE_CATALOG={","const FEATURE_CATALOG={\n  cloud_sync:{label:'工作資料雲端同步',tier:'pro'},\n  cloud_backup:{label:'雲端備份與還原',tier:'pro'},\n  local_backup:{label:'本機備份檔',tier:'free'},")
replace('const raw=localStorage.getItem(SAVE_KEY);',"const owner=localStorage.getItem('meow-work-workspace-owner-v1')||'guest';const raw=localStorage.getItem('meow-work-workspace-v1:'+owner)||localStorage.getItem(SAVE_KEY);")
block('function persistLocalSnapshot(){','function syncPayload(','''function persistLocalSnapshot(){
  const savedAt=new Date().toISOString(),snapshot={owner:localOwner,savedAt,state:JSON.parse(JSON.stringify(state))};
  try{
    const json=JSON.stringify(snapshot);
    localStorage.setItem(WORKSPACE_PREFIX+localOwner,json);
    localStorage.setItem(SAVE_KEY,json);
    lastSavedAt=savedAt;localRevision++;localSaveFailed=false;
    try{localStorage.setItem(AVATAR_KEY,state.profile.avatar||'');localStorage.setItem(SCHEDULE_KEY,JSON.stringify(state.schedule))}catch(e){}
    writeIndexedBackup(snapshot);return true;
  }catch(e){localSaveFailed=true;if($('saveState'))$('saveState').textContent='本機儲存未完成，請匯出備份並確認儲存空間。';return false}
}''')
replace("async function writeIndexedBackup(snapshot){\n  try{","async function writeIndexedBackup(snapshot){\n  snapshot=JSON.parse(JSON.stringify(snapshot));const owner=snapshot.owner||localOwner;\n  try{")
replace("tx.objectStore(BACKUP_STORE).put(snapshot,'latest');","tx.objectStore(BACKUP_STORE).put(snapshot,'workspace:'+owner);")
block('async function readIndexedBackup(){','async function restoreIndexedMirrorIfNewer(){', '''async function readIndexedBackup(){
  const owner=localOwner;
  try{
    const db=await openBackupDb();if(!db)return null;
    const value=await new Promise((resolve,reject)=>{
      const tx=db.transaction(BACKUP_STORE,'readonly'),store=tx.objectStore(BACKUP_STORE);
      const current=store.get('workspace:'+owner),legacy=owner==='guest'?store.get('latest'):null;
      tx.oncomplete=()=>resolve(current.result||(legacy&&legacy.result)||null);tx.onerror=()=>reject(tx.error);
    });db.close();return value;
  }catch(e){return null}
}''')
replace('async function restoreIndexedMirrorIfNewer(){\n  const backup=await readIndexedBackup();','async function restoreIndexedMirrorIfNewer(){\n  const owner=localOwner,revision=localRevision;\n  const backup=await readIndexedBackup();\n  if(localOwner!==owner||localRevision!==revision||(backup&&backup.owner&&backup.owner!==owner))return;')
# Persist a recovered mirror to the authoritative scoped record too.
replace("localStorage.setItem(SAVE_KEY,JSON.stringify({savedAt:lastSavedAt,state}));", "localStorage.setItem(WORKSPACE_PREFIX+localOwner,JSON.stringify({owner:localOwner,savedAt:lastSavedAt,state}));\n      localStorage.setItem(SAVE_KEY,JSON.stringify({owner:localOwner,savedAt:lastSavedAt,state}));")
replace("tx.objectStore(BACKUP_STORE).delete('latest');","tx.objectStore(BACKUP_STORE).delete('workspace:'+localOwner);if(localOwner==='guest')tx.objectStore(BACKUP_STORE).delete('latest');")
replace("if(Object.keys(x.dayStatus||{}).length||Object.keys(x.personalEvents||{}).length||Object.keys(x.months||{}).length)return true;","if(Object.keys(x.dayStatus||{}).length||Object.keys(x.personalEvents||{}).length||Object.values(x.months||{}).some(m=>Object.keys(m||{}).length))return true;\n  if(x.schedule&&['preset','shiftName','workDays','offDays','startDate'].some(k=>x.schedule[k]!==d.schedule[k]))return true;")
replace("async function signOutAccount(){const client=await getAuthClient();await client.auth.signOut()}","async function signOutAccount(){if(!persistLocalSnapshot()){alert('本機儲存未完成，請先匯出備份。');return}await stopAccountRealtime();const client=await getAuthClient();const {error}=await client.auth.signOut();if(error){alert('登出未完成，請稍後再試。');return}await handleSignedOut()}")
block('async function restoreFromCloud(showAlert=true){','function setDevPlan(plan){', '''async function restoreFromCloud(showAlert=true){
  if(!hasLivePro()){if(showAlert)alert('雲端還原為 Pro 功能。取回既有備份檔請使用下方的手動取回入口。');return false}
  if(!cloudConsent){await enableCloudSync();return canCloudSync()}
  await loadAccountState();renderSettings();return canCloudSync();
}''')
# Integrate the data card, keeping existing account and OTP fields intact.
block('      <div class="card settings-card"><div class="section-title"><span class="paw">🐾</span>資料管理</div>', '      <div class="card settings-card">\n        <div class="section-title"><span class="paw">🐾</span>帳號與即時同步</div>', (root/'ui/data-sync.html').read_text())
replace('帳號與即時同步','帳號與登入')
replace('登入後會自動開啟雲端同步；換手機或重新安裝後，使用同一帳號即可恢復資料。','登入只辨識帳號與方案。免費版資料保存在此裝置，Pro 雲端同步需另外確認啟用。')
replace('''          <div class="backup-actions">
            <button class="btn primary" id="cloudBackupNow">立即備份到雲端</button>
            <button class="btn" id="cloudRestoreNow">從雲端還原</button>
          </div>''','')
replace('        <div class="cloud-protection" id="cloudProtection">⚠ 尚未啟用雲端保護。刪除 App 或網站資料後，本機資料可能無法找回。</div>','')
replace('使用同一個登入帳號後，App 會讀取同一份雲端資料並自動同步。','登入狀態不代表工作資料已上傳。請在「資料與同步」查看實際結果。')
replace('建議：重要資料除了登入雲端同步，也定期「匯出備份檔」存到 iPhone 檔案或雲端硬碟。','重要資料建議定期手動匯出備份；沒有 Pro 也能保留本機備份檔。')
pattern=r"if\(\$\('cloudProtection'\)\)\{\$\('cloudProtection'\)\.classList\.toggle\('safe',!!authUser\);[\s\S]*?;\}"
m=re.search(pattern,h)
if not m:raise RuntimeError('cloudProtection render anchor missing')
h=h[:m.start()]+'renderCloudState();'+h[m.end():]
replace("$('saveState').textContent=lastSavedAt?", "$('saveState').textContent=localSaveFailed?'本機儲存未完成，請匯出備份並確認空間。':lastSavedAt?")
block("$('saveDevice').onclick=async()=>", "if($('startProTrial'))", '''$('saveDevice').onclick=()=>{const ok=persistLocalSnapshot();renderSettings();alert(ok?'已儲存到此裝置。這不是雲端同步。':'本機儲存未完成，請先匯出備份。')};
$('clearDevice').onclick=async()=>{
 if(!confirm('只清除目前工作區的本機資料？\n其他帳號的本機副本與雲端資料不會刪除，雲端同步會先暫停。'))return;
 if(authUser)rememberCloudConsent(false);await stopAccountRealtime();
 localStorage.removeItem(SAVE_KEY);localStorage.removeItem(WORKSPACE_PREFIX+localOwner);localStorage.removeItem(AVATAR_KEY);localStorage.removeItem(SCHEDULE_KEY);await clearIndexedBackup();
 state=defaultState();lastSavedAt=null;localRevision++;cloudAck='';cloudConflict=null;cloudDirty=false;applyTheme();render();
};
'''.replace("資料？\n其他","資料？\\n其他"))
replace('請先用 Email 登入','請先登入',h.count('請先用 Email 登入'))
replace('登入成功，正在同步…','登入成功，正在確認方案…',h.count('登入成功，正在同步…'))
replace('initAuth();\nloadBillingConfig();','initWelcome();\ninitAuth();\nloadBillingConfig();')
replace('v=111','v=112',h.count('v=111'))
replace('meow-sw-reloaded-v111','meow-sw-reloaded-v112')
p.write_text(h,encoding='utf-8')
sw=root/'sw.js';sw.write_text(sw.read_text().replace('v111','v112').replace('v=111','v=112'))
print('Integrated onboarding and local / cloud access separation (v112)')
