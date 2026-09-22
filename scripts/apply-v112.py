from pathlib import Path
import hashlib,re,sys
root=Path('.')
p=root/'index.html';html=p.read_text(encoding='utf-8')
if 'id="welcomeDialog"' in html:
    print('v112 migration already applied');sys.exit(0)
blob=hashlib.sha1(b'blob '+str(len(p.read_bytes())).encode()+b'\0'+p.read_bytes()).hexdigest()
if blob!='1beeeae3bf2a39e815b09730c3128a98fe996ecf':
    raise SystemExit('Source changed since review; refusing to overwrite a newer build: '+blob)
def replace(old,new,count=1):
    global html
    if html.count(old)!=count:raise SystemExit('Unexpected source anchor '+old[:90])
    html=html.replace(old,new)
def block(start,end,new):
    global html
    if html.count(start)!=1 or html.count(end)!=1:raise SystemExit('Ambiguous block '+start)
    i,j=html.index(start),html.index(end,html.index(start))
    html=html[:i]+new+'\n'+html[j:]
replace('</head>\n<body>','<style id="meow-welcome-styles">\n'+(root/'src/welcome-v112.css').read_text()+'\n</style>\n</head>\n<body>')
replace('<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>',(root/'src/welcome-v112.html').read_text()+'\n<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>')
block('function setAccountStatus(msg){','let pendingEmail=',(root/'src/account-v112.js').read_text())
# Complete v112 snapshots are authoritative; legacy auxiliary keys cannot cross workspaces.
replace("if(savedAvatar!==null)state.profile.avatar=savedAvatar;", "if(savedAvatar!==null&&!readSnapshotOwner())state.profile.avatar=savedAvatar;")
replace("if(savedSchedule){\n    state.schedule", "if(savedSchedule&&!readSnapshotOwner()){\n    state.schedule")
block('function currentPlan(){','function isDeveloperTest()',"function currentPlan(){\n  if(DEV_TESTING_ENABLED)return devPlan==='free'?'free':'pro';\n  return hasCloudEntitlement()?'pro':'free';\n}")
replace("const FEATURE_CATALOG={", "const FEATURE_CATALOG={\n  cloud_sync:{label:'工作資料雲端同步',tier:'pro'},\n  cloud_backup:{label:'雲端備份與還原',tier:'pro'},")
block('function persistLocalSnapshot(){','function syncPayload(','''function persistLocalSnapshot(){
  const when=new Date().toISOString();
  try{
    const snapshot={savedAt:when,state,owner:localOwner};
    localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot));
    lastSavedAt=when;
    localStorage.setItem(AVATAR_KEY,state.profile.avatar||'');
    localStorage.setItem(SCHEDULE_KEY,JSON.stringify(state.schedule));
    localStorage.setItem(OWNER_KEY,localOwner);
    localStorage.setItem(workspaceKey(localOwner),JSON.stringify(snapshot));
    writeIndexedBackup(JSON.parse(JSON.stringify(snapshot)));
    localSaveError=false;return true;
  }catch(e){localSaveError=true;renderSyncStatus();return false}
}''')
replace('async function restoreIndexedMirrorIfNewer(){\n  const backup=await readIndexedBackup();\n  if(!backup||!backup.state)return;', '''async function restoreIndexedMirrorIfNewer(){
  const owner=localOwner,edit=localEditVersion;
  const backup=await readIndexedBackup();
  if(owner!==localOwner||edit!==localEditVersion||!backup||!backup.state)return;
  if((backup.owner||'guest')!==localOwner)return;''')
block('function hasMeaningfulUserData(v=state){','async function clearIndexedBackup()', '''function hasMeaningfulUserData(v=state){
  const d=defaultState(),x=v||{};
  if(Object.keys(x.dayStatus||{}).length||Object.keys(x.personalEvents||{}).length)return true;
  if(Object.values(x.months||{}).some(m=>m&&Object.keys(m).length))return true;
  if((x.profile&&x.profile.avatar)||(x.profile&&x.profile.name&&x.profile.name!==d.profile.name))return true;
  if(x.schedule&&Object.keys(d.schedule).some(k=>x.schedule[k]!==undefined&&JSON.stringify(x.schedule[k])!==JSON.stringify(d.schedule[k])))return true;
  const st=x.settings||{},ds=d.settings;
  return Object.keys(ds).some(k=>JSON.stringify(st[k]??ds[k])!==JSON.stringify(ds[k]));
}''')
replace('renderAccountPlan();\nrenderProPlanSettings();\nrenderBillingHistory();\n}', 'renderAccountPlan();\nrenderProPlanSettings();\nrenderBillingHistory();\nrenderSyncStatus();\n}')
old="if($('cloudProtection')){$('cloudProtection').classList.toggle('safe',!!authUser);$('cloudProtection').textContent=authUser?'✓ 已啟用雲端保護。刪除 App 後，只要使用同一個登入帳號即可還原。':'⚠ 尚未啟用雲端保護。刪除 App 或網站資料後，本機資料可能無法找回。';}"
replace(old,'')
block('async function restoreFromCloud(showAlert=true){','function setDevPlan(','''async function restoreFromCloud(showAlert=true){
  if(!canCloudSync()){if(showAlert)alert('請先確認有效 Pro／試用資格並啟用雲端同步。');return false}
  await loadAccountState();
  if(pendingCloud&&canCloudSync()){
    if(!confirm('本機與雲端有不同資料。先保留本機安全副本，再使用雲端版本？'))return false;
    return applyRemoteRow(pendingCloud);
  }
  return cloudStatus==='已同步';
}''')
replace("    state=normalizeState(incoming);\n    persistLocalSnapshot();\n    applyTheme();render();\n    queueAccountSave(0);", "    if(!preserveBeforeReplace()){alert('本機空間不足，未覆蓋資料。');return}\n    state=normalizeState(incoming);\n    changedAndSync();\n    applyTheme();render();")
block("$('saveDevice').onclick=", "if($('startProTrial'))", r'''$('saveDevice').onclick=()=>{const ok=persistLocalSnapshot();renderSettings();alert(ok?'已儲存到這台裝置。這個按鈕不會啟動雲端同步。':'本機儲存失敗，請先匯出備份並檢查儲存空間。')};
$('clearDevice').onclick=async()=>{
  if(!confirm('清除此裝置目前工作區的資料？\n\n這會關閉此裝置的雲端同步，不刪除雲端資料，也不清除其他帳號的本機工作區。請先確認已匯出需要的備份。'))return;
  cloudConsent=false;accessEpoch++;await stopAccountRealtime();cloudReady=false;pendingCloud=null;
  try{localStorage.removeItem('meow-work-cloud-consent:'+localOwner);localStorage.removeItem(workspaceKey(localOwner));localStorage.removeItem(SAVE_KEY);localStorage.removeItem(AVATAR_KEY);localStorage.removeItem(SCHEDULE_KEY);localStorage.removeItem('meow-work-sync-meta:'+localOwner)}catch(e){}
  await clearIndexedBackup();state=defaultState();lastSavedAt=null;localDirty=false;localEditVersion++;cloudLastSuccess='';
  applyTheme();render();setCloudStatus('已關閉雲端同步・目前工作區已清除');
};
''')
replace('initAuth();\nloadBillingConfig();','initWelcome();\ninitAuth();\nloadBillingConfig();')
replace('資料管理</div><div class="settings-list">','資料與同步</div><div class="settings-list">')
replace('帳號與即時同步</div>','帳號與方案</div>')
replace('登入後會自動開啟雲端同步；換手機或重新安裝後，使用同一帳號即可恢復資料。','登入只辨識帳號及訂閱資格；免費版工作資料仍保存在這台裝置。')
replace('使用同一個登入帳號後，App 會讀取同一份雲端資料並自動同步。','登入不會自動開始試用或收費。')
replace('建議：重要資料除了登入雲端同步，也定期「匯出備份檔」存到 iPhone 檔案或雲端硬碟。','重要資料請定期手動匯出備份；只有有效 Pro／試用並啟用同步後，才會上傳工作資料。')
replace('只刪除這台裝置；已登入的雲端資料不會刪除','只清除目前本機工作區；不刪除雲端資料')
replace('清除已儲存資料</b>','清除目前本機工作區</b>')
replace('<div class="backup-actions">','<div class="backup-actions">\n            <button class="btn primary" id="toggleCloudSync" type="button">查看 Pro 雲端同步</button>')
replace('<div class="cloud-protection" id="cloudProtection">', '''<div id="cloudConflictBox" class="sync-conflict hidden"><b>本機與雲端有不同版本</b><p class="sync-detail">不會自動覆蓋。請選擇要繼續使用的版本。</p><div class="settings-actions"><button class="btn" id="keepLocalVersion" type="button">保留本機，上傳雲端</button><button class="btn" id="keepCloudVersion" type="button">保留雲端，還原本機</button></div></div>
        <div class="sync-detail" id="cloudDetail"></div>
        <div class="sync-status-row"><button type="button" class="btn hidden" id="legacyCloudExport">取回舊版雲端備份（唯讀）</button><button type="button" class="btn" id="showWelcome">查看登入歡迎頁</button></div>
        <div class="cloud-protection" id="cloudProtection">''')
for old,new in [('請先用 Email 登入','請先登入帳號'),('用 Email 登入，App','登入帳號，App'),('已登入，正在同步…','已登入，正在確認方案…'),('登入成功，正在同步…','登入成功，正在確認方案…')]:html=html.replace(old,new)
for old,new in [('manifest.webmanifest?v=111','manifest.webmanifest?v=112'),('sw.js?v=111','sw.js?v=112'),('meow-sw-reloaded-v111','meow-sw-reloaded-v112'),('介面 v110','介面 v112')]:replace(old,new)
p.write_text(html,encoding='utf-8')
sw=root/'sw.js';sw.write_text((root/'src/sw-v112.js').read_text(),encoding='utf-8')
print('Applied v112: welcome UI, local workspaces, Pro-only cloud access')
