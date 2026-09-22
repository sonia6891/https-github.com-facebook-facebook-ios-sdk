// Account identity, local workspaces and Pro cloud access are independent.
const WELCOME_KEY='meow-work-welcome-v1',OWNER_KEY='meow-work-local-owner-v1';
let localOwner=readSnapshotOwner()||readLocalString(OWNER_KEY)||'guest';
let accessEpoch=0,accessCheckedUser='',accessServerMs=0,accessLocalMs=0;
let cloudRevision=null,cloudPayload=null,cloudReady=false,cloudStatus='未啟用・Pro 專屬';
let cloudLastSuccess='',pendingCloud=null,localEditVersion=0,localSaveError=false;
let localDirty=readWorkspaceMeta().dirty!==false;
let cloudConsent=readLocalString('meow-work-cloud-consent:'+localOwner)==='yes';
let expiryTimer=null,entitlementRequest=0,authEventTimer=null,authBusyEpoch=-1;
let welcomeManual=false;
function readLocalString(key){try{return localStorage.getItem(key)||''}catch(e){return ''}}
function readSnapshotOwner(){try{return JSON.parse(readLocalString(SAVE_KEY)||'null')?.owner||''}catch(e){return ''}}
function workspaceKey(owner){return 'meow-work-workspace-v1:'+owner}
function readWorkspaceMeta(){try{return JSON.parse(localStorage.getItem('meow-work-sync-meta:'+localOwner)||'{}')}catch(e){return {}}}
function writeWorkspaceMeta(){try{localStorage.setItem('meow-work-sync-meta:'+localOwner,JSON.stringify({dirty:localDirty,revision:cloudRevision,lastSuccess:cloudLastSuccess}))}catch(e){}}
function snapshotOfLocal(){return {savedAt:lastSavedAt,state:JSON.parse(JSON.stringify(state)),owner:localOwner}}
function archiveWorkspace(){try{localStorage.setItem(workspaceKey(localOwner),JSON.stringify(snapshotOfLocal()));return true}catch(e){localSaveError=true;return false}}
function preserveBeforeReplace(){try{localStorage.setItem('meow-work-before-replace:'+localOwner,JSON.stringify(snapshotOfLocal()));return true}catch(e){localSaveError=true;return false}}
function workFingerprint(s){return JSON.stringify([s.profile||{},s.schedule||{},s.settings||{},s.months||{},s.dayStatus||{},s.personalEvents||{}])}
function switchWorkspace(owner){
  if(owner===localOwner)return true;
  if(!archiveWorkspace()){alert('本機儲存空間不足，請先匯出備份。現在不會切換或覆蓋工作資料。');return false}
  let next=null;
  try{next=JSON.parse(readLocalString(workspaceKey(owner))||'null')}catch(e){}
  if(!next&&localOwner==='guest'&&owner!=='guest'&&hasMeaningfulUserData()){
    if(confirm('要把目前「未登入」的本機資料帶入這個帳號嗎？\n\n資料仍只保存在這台裝置，不會因此啟動雲端同步。取消則使用獨立的空白工作區，原資料仍保留在未登入工作區。'))next=snapshotOfLocal();
  }
  const nextState=normalizeState(next&&next.state||defaultState());
  try{
    localStorage.setItem(SAVE_KEY,JSON.stringify({savedAt:next&&next.savedAt||null,state:nextState,owner}));
  }catch(e){localSaveError=true;alert('儲存失敗，工作區未切換。請先匯出備份。');return false}
  try{localStorage.setItem(OWNER_KEY,owner);localStorage.setItem(AVATAR_KEY,nextState.profile.avatar||'');localStorage.setItem(SCHEDULE_KEY,JSON.stringify(nextState.schedule))}catch(e){localSaveError=true}
  localOwner=owner;state=nextState;lastSavedAt=next&&next.savedAt||null;localEditVersion++;
  cloudRevision=null;cloudPayload=null;cloudReady=false;pendingCloud=null;
  const meta=readWorkspaceMeta();localDirty=meta.dirty!==false;cloudLastSuccess=meta.lastSuccess||'';
  cloudConsent=readLocalString('meow-work-cloud-consent:'+owner)==='yes';
  applyTheme();render();return true;
}
function accountServerNow(){return accessServerMs?accessServerMs+(performance.now()-accessLocalMs):Date.now()}
function entitlementIsActive(row){
  if(!row||row.plan!=='pro'||!['active','trialing'].includes(row.status)||!row.pro_until)return false;
  const until=Date.parse(row.pro_until);return Number.isFinite(until)&&until>accountServerNow();
}
function hasCloudEntitlement(){return !!(authUser&&accessCheckedUser===authUser.id&&entitlementIsActive({plan:serverPlan,status:entitlementStatus,pro_until:entitlementUntil}))}
function canCloudSync(){return hasCloudEntitlement()&&localOwner===authUser.id&&cloudConsent}
function sameAccess(uid,epoch){return !!(authUser&&authUser.id===uid&&localOwner===uid&&accessEpoch===epoch)}
function setAccountStatus(msg){accountStatusText=msg;if($('accountStatus'))$('accountStatus').textContent=msg;if($('welcomeMessage')&&$('welcomeDialog').open)$('welcomeMessage').textContent=msg}
function setCloudStatus(msg){cloudStatus=msg;renderSyncStatus()}
function resetEntitlement(){serverPlan='free';entitlementStatus='free';entitlementUntil=null;trialStartedAt=null;billingProvider=null;providerSubscriptionId=null;cancelAtPeriodEnd=false;canceledAt=null;accessCheckedUser=''}
async function stopAccountRealtime(){
  clearTimeout(authTimer);authTimer=null;
  const channel=authChannel;authChannel=null;
  if(authClient&&channel){try{await authClient.removeChannel(channel)}catch(e){}}
}
function scheduleExpiry(){
  clearTimeout(expiryTimer);
  const until=Date.parse(entitlementUntil||'');
  if(!hasCloudEntitlement()||!Number.isFinite(until))return;
  expiryTimer=setTimeout(()=>{
    if(!hasCloudEntitlement()){stopAccountRealtime();cloudReady=false;setCloudStatus('雲端同步已暫停・方案已到期');render()}
    else scheduleExpiry();
  },Math.min(2147483647,Math.max(1,until-accountServerNow()+50)));
}
async function loadEntitlement(){
  const uid=authUser&&authUser.id,epoch=accessEpoch,request=++entitlementRequest;
  if(!uid){resetEntitlement();renderSettings();return}
  try{
    const client=await getAuthClient();
    const {data,error}=await client.rpc('meow_account_access');
    if(!sameAccess(uid,epoch)||request!==entitlementRequest)return;
    if(error)throw error;
    const row=data&&data.entitlement;
    const now=Date.parse(data&&data.server_now||'');
    if(!Number.isFinite(now))throw Error('access_time_unavailable');
    accessServerMs=now;accessLocalMs=performance.now();accessCheckedUser=uid;
    entitlementStatus=row&&row.status||'free';entitlementUntil=row&&row.pro_until||null;
    trialStartedAt=row&&row.trial_started_at||null;billingProvider=row&&row.billing_provider||null;
    providerSubscriptionId=row&&row.provider_subscription_id||null;cancelAtPeriodEnd=!!(row&&row.cancel_at_period_end);canceledAt=row&&row.canceled_at||null;
    serverPlan=entitlementIsActive(row)?'pro':'free';
    scheduleExpiry();
    if(!canCloudSync()){
      await stopAccountRealtime();cloudReady=false;
      setCloudStatus(hasCloudEntitlement()?'Pro 可用・請先啟用雲端同步':(trialStartedAt||entitlementUntil?'雲端同步已暫停・方案未生效或已到期':'未啟用・Pro 專屬'));
    }else if(!cloudReady){await loadAccountState();if(sameAccess(uid,epoch)&&canCloudSync())await subscribeAccountRealtime()}
  }catch(e){
    if(!sameAccess(uid,epoch)||request!==entitlementRequest)return;
    resetEntitlement();entitlementStatus='error';await stopAccountRealtime();cloudReady=false;
    setCloudStatus('方案確認失敗・雲端暫停，本機資料保留');
  }
  if(sameAccess(uid,epoch)){renderProEntitlements();renderSettings()}
}
async function subscribeAccountRealtime(){
  if(!canCloudSync()||!navigator.onLine)return;
  const uid=authUser.id,epoch=accessEpoch,client=await getAuthClient();
  const previous=authChannel;authChannel=null;
  if(previous){try{await client.removeChannel(previous)}catch(e){}}
  if(!sameAccess(uid,epoch)||!canCloudSync())return;
  authChannel=client.channel('meow-user-'+uid)
    .on('postgres_changes',{event:'*',schema:'public',table:'user_sync_state',filter:'user_id=eq.'+uid},payload=>{
      if(!sameAccess(uid,epoch)||!canCloudSync())return;
      const cloud=payload.new&&payload.new.payload;
      if(cloud&&cloud.deviceId!==deviceId)void loadAccountState();
    }).subscribe(status=>{if(sameAccess(uid,epoch)&&status==='CHANNEL_ERROR')setCloudStatus('即時連線中斷・本機資料保留')});
}
function applyRemoteRow(row){
  const cloud=row.payload||{},snapshot=newestMeaningfulCloudSnapshot(cloud)||(cloud.state?cloud:null);
  if(!snapshot||!snapshot.state)return false;
  if(!preserveBeforeReplace()){setCloudStatus('本機空間不足・未覆蓋現有資料');return false}
  state=normalizeState(snapshot.state);localDirty=false;localEditVersion++;
  cloudRevision=row.updated_at;cloudPayload=cloud;pendingCloud=null;cloudLastSuccess=row.updated_at;
  persistLocalSnapshot();writeWorkspaceMeta();applyTheme();render();
  setCloudStatus(localSaveError?'已讀取雲端，但本機儲存失敗':'已同步');return true;
}
async function loadAccountState(){
  if(!canCloudSync())return;
  if(!navigator.onLine){setCloudStatus('離線・變更尚未上傳');return}
  const uid=authUser.id,epoch=accessEpoch;
  try{
    const client=await getAuthClient();
    if(!sameAccess(uid,epoch)||!canCloudSync())return;
    const {data,error}=await client.from('user_sync_state').select('payload,updated_at').eq('user_id',uid).maybeSingle();
    if(!sameAccess(uid,epoch)||!canCloudSync())return;
    if(error)throw error;
    cloudReady=true;cloudRevision=data&&data.updated_at||null;cloudPayload=data&&data.payload||null;
    if(!data){if(hasMeaningfulUserData()){localDirty=true;queueAccountSave(0)}else setCloudStatus('雲端已啟用・尚無工作資料');return}
    const remote=normalizeState((data.payload||{}).state||{});
    if(workFingerprint(remote)===workFingerprint(state)){localDirty=false;cloudLastSuccess=data.updated_at;pendingCloud=null;writeWorkspaceMeta();setCloudStatus('已同步');return}
    if(localDirty&&hasMeaningfulUserData()){pendingCloud=data;setCloudStatus('本機與雲端不同・請選擇要保留的版本');return}
    applyRemoteRow(data);
  }catch(e){if(sameAccess(uid,epoch))setCloudStatus('雲端讀取失敗・本機資料仍可使用')}
}
async function saveAccountState(showAlert=false,resolveConflict=false){
  if(!canCloudSync()){if(showAlert)alert('雲端同步需要有效 Pro／試用，並由你啟用。登入本身不會開啟同步。');return false}
  if(!navigator.onLine){setCloudStatus('離線・變更尚未上傳');return false}
  if(pendingCloud&&!resolveConflict){setCloudStatus('有版本衝突・請先選擇');return false}
  if(!cloudReady){await loadAccountState();return false}
  const uid=authUser.id,epoch=accessEpoch;
  if(authBusy&&authBusyEpoch===epoch)return false;
  authBusy=true;authBusyEpoch=epoch;
  const edit=localEditVersion,snapshot=JSON.parse(JSON.stringify(state));delete snapshot.theme;
  let history=cloudHistoryEntries(cloudPayload);
  if(cloudPayload&&meaningfulSnapshot(cloudPayload))history=[{savedAt:cloudPayload.savedAt,state:cloudPayload.state},...history];
  const payload={version:4,savedAt:lastSavedAt||new Date().toISOString(),deviceId,state:snapshot,history:history.slice(0,5)};
  setCloudStatus('正在同步…');
  try{
    const client=await getAuthClient();if(!sameAccess(uid,epoch)||!canCloudSync())return false;
    const {data,error}=await client.rpc('meow_save_snapshot',{p_payload:payload,p_expected_updated_at:cloudRevision});
    if(!sameAccess(uid,epoch)||!canCloudSync())return false;
    if(error)throw error;
    if(!data||!data.updated_at)throw Error('missing_sync_confirmation');
    cloudRevision=data.updated_at;cloudPayload=payload;cloudLastSuccess=data.updated_at;pendingCloud=null;
    if(localEditVersion===edit)localDirty=false;
    writeWorkspaceMeta();setCloudStatus(localDirty?'仍有新變更待同步':'已同步');
    if(showAlert)alert('雲端已確認儲存這份資料。');
    return true;
  }catch(e){
    if(!sameAccess(uid,epoch))return false;
    if(e&&e.code==='40001'){await loadAccountState();setCloudStatus('另一台裝置有新版本・請選擇要保留的資料')}
    else if(e&&e.code==='42501'){cloudReady=false;await loadEntitlement();setCloudStatus('雲端權限未通過・本機資料保留')}
    else setCloudStatus('同步失敗・本機資料保留');
    return false;
  }finally{
    if(authBusyEpoch===epoch){authBusy=false;authBusyEpoch=-1}
    if(sameAccess(uid,epoch)){renderSyncStatus();if(localDirty&&!pendingCloud&&cloudStatus==='仍有新變更待同步')queueAccountSave()}
  }
}
function queueAccountSave(delay=350){
  clearTimeout(authTimer);authTimer=null;
  if(!canCloudSync())return;
  if(!navigator.onLine){setCloudStatus('離線・變更尚未上傳');return}
  const uid=authUser.id,epoch=accessEpoch;
  authTimer=setTimeout(()=>{authTimer=null;if(sameAccess(uid,epoch)&&canCloudSync())void saveAccountState(false)},delay);
}
function changedAndSync(){localEditVersion++;localDirty=true;persistLocalSnapshot();writeWorkspaceMeta();queueAccountSave()}
async function handleSignedIn(user){
  const changed=!authUser||authUser.id!==user.id;
  if(changed){accessEpoch++;await stopAccountRealtime();resetEntitlement();cloudReady=false;pendingCloud=null}
  authUser=user;
  if(!switchWorkspace(user.id)){setAccountStatus('已登入，但工作區尚未切換；雲端未啟用');return}
  setAccountStatus('已登入・正在確認方案');
  if(!welcomeManual)finishWelcome();
  await loadEntitlement();
  if(authUser&&authUser.id===user.id){await loadBillingHistory();setAccountStatus('帳號已登入');renderSettings()}
}
async function handleSignedOut(){
  accessEpoch++;entitlementRequest++;authUser=null;resetEntitlement();billingHistory=[];clearTimeout(expiryTimer);
  await stopAccountRealtime();cloudReady=false;pendingCloud=null;switchWorkspace('guest');
  setAccountStatus('尚未登入・使用本機工作區');setCloudStatus('未啟用・Pro 專屬');render();
}
async function initAuth(){
  try{
    const client=await getAuthClient();
    const {data}=await client.auth.getSession();
    if(data&&data.session&&data.session.user)await handleSignedIn(data.session.user);
    else if(localOwner!=='guest')await handleSignedOut();
    // Never await another Supabase request while an auth callback holds its lock.
    client.auth.onAuthStateChange((event,session)=>{
      if(!['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event))return;
      clearTimeout(authEventTimer);
      if(event==='SIGNED_OUT'){accessEpoch++;accessCheckedUser='';clearTimeout(authTimer)}
      authEventTimer=setTimeout(()=>{
        if(session&&session.user)void handleSignedIn(session.user);
        else if(event==='SIGNED_OUT')void handleSignedOut();
      },0);
    });
  }catch(e){setAccountStatus('登入服務暫時無法連線；仍可使用本機資料。')}
}
async function toggleCloud(){
  if(!hasCloudEntitlement()){alert('登入只確認帳號身分。雲端同步為 Pro 專屬，請先查看「Pro 方案」。');return}
  if(cloudConsent){cloudConsent=false;try{localStorage.removeItem('meow-work-cloud-consent:'+localOwner)}catch(e){}await stopAccountRealtime();cloudReady=false;setCloudStatus('已關閉雲端同步・本機資料保留');return}
  if(!confirm('啟用 Pro 雲端同步？\n\n將同步班表、薪資、假別、行程及個人資料。淺色／深色仍以這台裝置為準。若兩邊都有資料，會先請你選擇，不會直接覆蓋。'))return;
  cloudConsent=true;try{localStorage.setItem('meow-work-cloud-consent:'+localOwner,'yes')}catch(e){}
  await loadAccountState();if(canCloudSync())await subscribeAccountRealtime();renderSyncStatus();
}
async function exportLegacyCloud(){
  if(!authUser){alert('請先登入原本的帳號。');return}
  const uid=authUser.id,epoch=accessEpoch;
  try{
    const client=await getAuthClient();
    const {data,error}=await client.from('user_legacy_exports').select('payload,original_updated_at').eq('user_id',uid).maybeSingle();
    if(!sameAccess(uid,epoch))return;if(error)throw error;
    if(!data){alert('此帳號沒有切換 Pro 規則前的舊版雲端備份。');return}
    const payload=data.payload||{},snapshot=newestMeaningfulCloudSnapshot(payload)||(payload.state?payload:null);
    if(!snapshot){alert('舊版備份沒有可取回的工作資料。');return}
    downloadBlob(new Blob([JSON.stringify({app:'喵的，又要上班了',version:1,exportedAt:new Date().toISOString(),state:snapshot.state},null,2)],{type:'application/json'}),'meow-legacy-backup.json');
  }catch(e){alert('舊版備份暫時無法取回；既有資料沒有被刪除。請稍後再試。')}
}
function renderSyncStatus(){
  if(!$('cloudProtection'))return;
  const entitled=hasCloudEntitlement(),enabled=canCloudSync();
  $('cloudProtection').classList.toggle('safe',enabled&&cloudStatus==='已同步'&&!localDirty);
  $('cloudProtection').textContent=enabled?cloudStatus:(entitled?'Pro 已確認・'+(cloudConsent?'雲端同步暫停':'尚未啟用工作資料同步'):(entitlementStatus==='error'?'方案確認失敗・本機資料保留':(entitlementUntil||trialStartedAt?'雲端同步已暫停・本機資料保留':'工作資料保存在此裝置；雲端同步為 Pro 專屬。')));
  if($('cloudDetail'))$('cloudDetail').textContent=enabled&&cloudLastSuccess?'最後成功同步：'+new Date(cloudLastSuccess).toLocaleString('zh-TW'): '登入帳號不等於工作資料已備份。';
  if($('toggleCloudSync')){$('toggleCloudSync').textContent=enabled?'關閉雲端同步':(entitled?'啟用雲端同步':'查看 Pro 雲端同步')}
  if($('cloudBackupNow'))$('cloudBackupNow').disabled=!enabled;
  if($('cloudRestoreNow'))$('cloudRestoreNow').disabled=!enabled;
  if($('legacyCloudExport'))$('legacyCloudExport').classList.toggle('hidden',!authUser);
  if($('cloudConflictBox'))$('cloudConflictBox').classList.toggle('hidden',!pendingCloud||!enabled);
  if($('saveState'))$('saveState').textContent=localSaveError?'本機儲存失敗，請匯出備份後檢查空間':(lastSavedAt?'本機已儲存：'+new Date(lastSavedAt).toLocaleString('zh-TW'):'資料會自動保存在這台裝置');
}
function finishWelcome(){
  try{localStorage.setItem(WELCOME_KEY,'done')}catch(e){}
  if($('welcomeDialog').open)$('welcomeDialog').close();welcomeManual=false;
}
function openWelcome(manual=false){
  welcomeManual=manual;$('welcomeGuestText').textContent=authUser?'返回 App':'先使用，不登入';$('welcomeMessage').textContent='';
  if(!$('welcomeDialog').open)$('welcomeDialog').showModal();$('welcomeDialog').scrollTop=0;
}
async function initWelcome(){
  const force=new URLSearchParams(location.search).get('welcome')==='1';
  const first=!readLocalString(WELCOME_KEY)&&!readLocalString(SAVE_KEY);
  if(force||first)openWelcome(force);
  else if(!readLocalString(WELCOME_KEY)){try{localStorage.setItem(WELCOME_KEY,'done')}catch(e){}}
  $('welcomeGuest').onclick=finishWelcome;
  $('welcomeDialog').addEventListener('cancel',event=>{event.preventDefault();finishWelcome()});
  $('welcomeGoogle').onclick=async()=>{welcomeManual=false;const b=$('welcomeGoogle');b.disabled=true;try{await signInWithGoogle()}finally{b.disabled=false}};
  $('welcomeEmail').onclick=()=>{const open=$('welcomeEmailFields').hidden;$('welcomeEmailFields').hidden=!open;$('welcomeEmail').setAttribute('aria-expanded',String(open));if(open)$('welcomeEmailInput').focus()};
  $('welcomeSendOtp').onclick=async()=>{const b=$('welcomeSendOtp');b.disabled=true;try{$('emailLoginInput').value=$('welcomeEmailInput').value;await sendEmailOtp();$('welcomeOtpFields').hidden=$('otpPanel').classList.contains('hidden')}finally{b.disabled=false}};
  $('welcomeVerifyOtp').onclick=async()=>{const b=$('welcomeVerifyOtp');b.disabled=true;try{welcomeManual=false;$('emailOtpInput').value=$('welcomeOtpInput').value;await verifyEmailOtp()}finally{b.disabled=false}};
  $('welcomeOtpInput').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6)};
  $('showWelcome').onclick=()=>openWelcome(true);
  $('toggleCloudSync').onclick=toggleCloud;
  $('legacyCloudExport').onclick=exportLegacyCloud;
  $('keepCloudVersion').onclick=()=>{if(pendingCloud&&canCloudSync()&&confirm('先保留本機安全副本，再使用雲端版本？'))applyRemoteRow(pendingCloud)};
  $('keepLocalVersion').onclick=()=>{if(pendingCloud&&canCloudSync()&&confirm('用本機版本更新雲端？原雲端版本會保留在備份歷史內。'))void saveAccountState(true,true)};
  try{
    const response=await fetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_KEY}});
    if(!response.ok)return;const config=await response.json();
    if(config&&config.external&&config.external.apple===true){
      $('welcomeApple').hidden=false;$('welcomeAppleNote').hidden=true;
      $('welcomeApple').onclick=async()=>{const b=$('welcomeApple');b.disabled=true;try{welcomeManual=false;const client=await getAuthClient();const {error}=await client.auth.signInWithOAuth({provider:'apple',options:{redirectTo:location.origin+location.pathname}});if(error)throw error}catch(e){setAccountStatus('Apple 登入暫時無法完成，請改用其他方式。')}finally{b.disabled=false}};
    }
  }catch(e){}
}
window.addEventListener('offline',()=>{if(canCloudSync())setCloudStatus('離線・變更尚未上傳')});
window.addEventListener('online',()=>{if(authUser){cloudReady=false;void loadEntitlement()}});
setInterval(()=>{if(authUser)void loadEntitlement()},60000);
