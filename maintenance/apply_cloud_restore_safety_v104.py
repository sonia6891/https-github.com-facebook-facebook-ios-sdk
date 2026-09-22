from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'index.html';s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'anchor {s.count(a)}: {a[:100]}')
 s=s.replace(a,b,1)

anchor="function syncPayload(){return{version:2,savedAt:lastSavedAt||new Date().toISOString(),deviceId,state};}"
helpers="""function hasMeaningfulUserData(v=state){
  const d=defaultState(),x=v||{};
  if(Object.keys(x.dayStatus||{}).length||Object.keys(x.personalEvents||{}).length||Object.keys(x.months||{}).length)return true;
  if((x.profile&&x.profile.avatar)||(x.profile&&x.profile.name&&x.profile.name!==d.profile.name))return true;
  const st=x.settings||{},ds=d.settings;
  return Object.keys(ds).some(k=>JSON.stringify(st[k]??ds[k])!==JSON.stringify(ds[k]));
}
async function clearIndexedBackup(){
  try{const db=await openBackupDb();if(!db)return;await new Promise((resolve,reject)=>{const tx=db.transaction(BACKUP_STORE,'readwrite');tx.objectStore(BACKUP_STORE).delete('latest');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){}
}
"""
once(anchor,anchor+"\n"+helpers)

old="""  if(!data){setAccountStatus('第一次登入，正在建立雲端資料…');await saveAccountState(false);return}
  const cloud=data.payload||{};"""
new="""  if(!data){
    if(hasMeaningfulUserData()){
      setAccountStatus('第一次登入，正在建立雲端資料…');
      await saveAccountState(false);
    }else{
      setAccountStatus('這個帳號目前沒有可還原的雲端資料');
    }
    return
  }
  const cloud=data.payload||{};"""
once(old,new)

oldclear="$('clearDevice').onclick=()=>{if(!confirm('確定清除這台裝置已儲存的資料？如果目前已登入，雲端資料不會刪除。'))return;localStorage.removeItem(SAVE_KEY);localStorage.removeItem(AVATAR_KEY);localStorage.removeItem(SCHEDULE_KEY);state=defaultState();lastSavedAt=null;render();alert('已清除此裝置資料；登入中的雲端資料仍保留。')};"
newclear="""$('clearDevice').onclick=async()=>{
  if(!confirm('確定清除這台裝置已儲存的資料？雲端資料不會刪除。'))return;
  const wasLoggedIn=!!authUser;
  if(wasLoggedIn){
    clearTimeout(authTimer);authTimer=null;
    await saveAccountState(false);
    const client=await getAuthClient();
    await client.auth.signOut();
  }
  localStorage.removeItem(SAVE_KEY);localStorage.removeItem(AVATAR_KEY);localStorage.removeItem(SCHEDULE_KEY);
  await clearIndexedBackup();
  state=defaultState();lastSavedAt=null;applyTheme();render();
  alert(wasLoggedIn?'已清除此裝置資料並登出；雲端備份仍保留。請重新登入同一帳號即可還原。':'已清除此裝置資料。');
};"""
once(oldclear,newclear)

once("alert(authUser?'已儲存到這台裝置並同步 Email 帳號。':'已儲存到這台裝置。')","alert(authUser?'已儲存到這台裝置並同步登入帳號。':'已儲存到這台裝置。')")

s=s.replace('manifest.webmanifest?v=103','manifest.webmanifest?v=104').replace('介面 v103','介面 v104').replace('meow-sw-reloaded-v103','meow-sw-reloaded-v104').replace('./sw.js?v=103','./sw.js?v=104')
p.write_text(s)
sw=root/'sw.js';w=sw.read_text().replace('meow-work-pwa-v103','meow-work-pwa-v104').replace('manifest.webmanifest?v=103','manifest.webmanifest?v=104');sw.write_text(w)
print('v104 applied')
