from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'index.html';s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'anchor {s.count(a)}: {a[:100]}')
 s=s.replace(a,b,1)

once("function syncPayload(){return{version:2,savedAt:lastSavedAt||new Date().toISOString(),deviceId,state};}",
"""function syncPayload(history=[]){return{version:3,savedAt:lastSavedAt||new Date().toISOString(),deviceId,state,history}}
function cloudHistoryEntries(payload){return Array.isArray(payload&&payload.history)?payload.history.filter(x=>x&&x.state):[]}
function meaningfulSnapshot(snapshot){return !!(snapshot&&snapshot.state&&hasMeaningfulUserData(snapshot.state))}
function newestMeaningfulCloudSnapshot(payload){
  const candidates=[payload,...cloudHistoryEntries(payload)].filter(meaningfulSnapshot);
  candidates.sort((a,b)=>Date.parse(b.savedAt||0)-Date.parse(a.savedAt||0));
  return candidates[0]||null;
}""")

old="""    const client=await getAuthClient();
    const {error}=await client.from('user_sync_state').upsert({
      user_id:authUser.id,payload:syncPayload(),updated_at:new Date().toISOString()
    },{onConflict:'user_id'});"""
new="""    const client=await getAuthClient();
    const {data:previous}=await client.from('user_sync_state').select('payload').eq('user_id',authUser.id).maybeSingle();
    const oldPayload=previous&&previous.payload?previous.payload:null;
    let history=cloudHistoryEntries(oldPayload);
    if(oldPayload&&oldPayload.state&&meaningfulSnapshot(oldPayload)){
      history=[{savedAt:oldPayload.savedAt||new Date().toISOString(),state:oldPayload.state},...history];
    }
    const seen=new Set();history=history.filter(x=>{const key=String(x.savedAt||'')+'|'+JSON.stringify(x.state||{});if(seen.has(key))return false;seen.add(key);return true}).slice(0,5);
    const {error}=await client.from('user_sync_state').upsert({
      user_id:authUser.id,payload:syncPayload(history),updated_at:new Date().toISOString()
    },{onConflict:'user_id'});"""
once(old,new)

oldload="""  const cloud=data.payload||{};
  if(cloud.state){
    state=normalizeState(cloud.state);
    lastSavedAt=cloud.savedAt||data.updated_at||new Date().toISOString();
    persistLocalSnapshot();
    applyTheme();render();
  }
  setAccountStatus('已同步・'+new Date(data.updated_at||Date.now()).toLocaleString('zh-TW'));"""
newload="""  const cloud=data.payload||{};
  const snapshot=newestMeaningfulCloudSnapshot(cloud)||(cloud.state?cloud:null);
  if(snapshot&&snapshot.state){
    state=normalizeState(snapshot.state);
    lastSavedAt=snapshot.savedAt||data.updated_at||new Date().toISOString();
    persistLocalSnapshot();
    applyTheme();render();
    setAccountStatus(snapshot===cloud?'已同步・'+new Date(data.updated_at||Date.now()).toLocaleString('zh-TW'):'已從雲端安全快照恢復・'+new Date(lastSavedAt).toLocaleString('zh-TW'));
  }else setAccountStatus('這個帳號目前沒有可還原的雲端資料');"""
once(oldload,newload)

oldrestore="""    state=normalizeState(data.payload.state);
    lastSavedAt=data.payload.savedAt||data.updated_at||new Date().toISOString();"""
newrestore="""    const snapshot=newestMeaningfulCloudSnapshot(data.payload)||data.payload;
    state=normalizeState(snapshot.state);
    lastSavedAt=snapshot.savedAt||data.updated_at||new Date().toISOString();"""
once(oldrestore,newrestore)

s=s.replace('manifest.webmanifest?v=104','manifest.webmanifest?v=105').replace('介面 v104','介面 v105').replace('meow-sw-reloaded-v104','meow-sw-reloaded-v105').replace('./sw.js?v=104','./sw.js?v=105')
p.write_text(s)
sw=root/'sw.js';w=sw.read_text().replace('meow-work-pwa-v104','meow-work-pwa-v105').replace('manifest.webmanifest?v=104','manifest.webmanifest?v=105');sw.write_text(w)
print('v105 applied')

