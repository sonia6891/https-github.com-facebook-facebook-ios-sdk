async function loadEntitlement(){
 const uid=authUser&&authUser.id,epoch=accountEpoch,request=++entitlementRequest;
 entitlementChecked=false;serverPlan='free';entitlementStatus='checking';entitlementUntil=null;
 if(!uid){entitlementStatus='free';await stopAccountRealtime();renderSettings();return}
 try{
  const client=await getAuthClient();
  const {data,error}=await client.from('user_entitlements').select('plan,status,pro_until,trial_started_at,billing_provider,provider_subscription_id,cancel_at_period_end,canceled_at,updated_at').eq('user_id',uid).maybeSingle();
  if(request!==entitlementRequest||!authUser||authUser.id!==uid||epoch!==accountEpoch)return;
  if(error)throw error;
  entitlementStatus=data&&data.status||'free';entitlementUntil=data&&data.pro_until||null;trialStartedAt=data&&data.trial_started_at||null;
  billingProvider=data&&data.billing_provider||null;providerSubscriptionId=data&&data.provider_subscription_id||null;cancelAtPeriodEnd=!!(data&&data.cancel_at_period_end);canceledAt=data&&data.canceled_at||null;
  serverPlan=entitlementIsActive(data)?'pro':'free';entitlementChecked=true;
 }catch(e){if(request!==entitlementRequest||epoch!==accountEpoch)return;serverPlan='free';entitlementStatus='error';entitlementChecked=false;console.warn('[meow-entitlement] lookup failed',e)}
 await reconcileCloudAccess();renderProEntitlements();renderSettings();
}
async function stopAccountRealtime(){
 clearTimeout(authTimer);authTimer=null;cloudGeneration++;
 const channel=authChannel;authChannel=null;
 if(authClient&&channel){try{await authClient.removeChannel(channel)}catch(e){}}
}
async function subscribeAccountRealtime(){
 if(!canCloudSync()||!navigator.onLine)return;
 await stopAccountRealtime();
 const uid=authUser.id,epoch=accountEpoch,generation=cloudGeneration;
 const client=await getAuthClient();if(!cloudSession(uid,epoch)||generation!==cloudGeneration)return;
 authChannel=client.channel('meow-user-'+uid)
  .on('postgres_changes',{event:'*',schema:'public',table:'user_sync_state',filter:'user_id=eq.'+uid},payload=>{
   if(!cloudSession(uid,epoch)||generation!==cloudGeneration)return;
   const row=payload.new||{},cloud=row.payload||{};if(cloud.deviceId===deviceId||!cloud.state)return;
   if(cloudDirty||authBusy){showCloudConflict(row);return}
   if(!preserveRecovery({state:JSON.parse(JSON.stringify(state)),savedAt:lastSavedAt},'before-sync'))return;
   state=normalizeState(cloud.state);persistLocalSnapshot();cloudBaseKnown=true;cloudBaseStamp=row.updated_at;cloudAck=row.updated_at;cloudDirty=false;applyTheme();render();
  }).subscribe(status=>{if(cloudSession(uid,epoch)&&generation===cloudGeneration&&status==='SUBSCRIBED')setAccountStatus('即時連線已建立；備份狀態請看「資料與同步」。')});
}
async function saveAccountState(showAlert=false){
 if(!canCloudSync()){if(showAlert)alert(cloudNotice());renderSettings();return false}
 if(authBusy)return false;
 if(!persistLocalSnapshot())return false;
 if(!navigator.onLine){cloudDirty=true;renderSettings();return false}
 const uid=authUser.id,epoch=accountEpoch,revision=localRevision;
 const local=JSON.parse(JSON.stringify(state)),savedAt=lastSavedAt;
 authBusy=true;cloudDirty=true;
 try{
  const client=await getAuthClient();
  const {data:previous,error:readError}=await client.from('user_sync_state').select('payload,updated_at').eq('user_id',uid).maybeSingle();
  if(!cloudSession(uid,epoch))return false;if(readError)throw readError;
  if(previous&&((cloudBaseKnown&&previous.updated_at!==cloudBaseStamp)||(!cloudBaseKnown&&previous.payload&&previous.payload.state&&workJson(previous.payload.state)!==workJson(local)))){showCloudConflict(previous);return false}
  let history=cloudHistoryEntries(previous&&previous.payload);if(previous&&previous.payload&&previous.payload.state)history=[{savedAt:previous.payload.savedAt||previous.updated_at,state:previous.payload.state},...history];
  const row={user_id:uid,payload:{version:3,savedAt,deviceId,state:local,history:history.slice(0,5)},updated_at:new Date().toISOString()};
  if(!cloudSession(uid,epoch))return false;
  const query=previous?client.from('user_sync_state').update(row).eq('user_id',uid).eq('updated_at',previous.updated_at):client.from('user_sync_state').insert(row);
  const {data,error}=await query.select('updated_at');
  if(!cloudSession(uid,epoch))return false;if(error)throw error;
  if(!data||!data.length){setAccountStatus('雲端副本已更新，暫停覆蓋；請重新同步確認。');cloudBaseKnown=false;return false}
  cloudBaseKnown=true;cloudBaseStamp=data[0].updated_at;cloudAck=data[0].updated_at;cloudDirty=localRevision!==revision;
  setAccountStatus(cloudDirty?'仍有新變更待同步':'工作資料已成功同步');if(showAlert)alert(cloudDirty?'本次副本已同步，最新變更仍待同步。':'雲端同步完成。');return true;
 }catch(e){if(authUser&&authUser.id===uid&&accountEpoch===epoch){cloudDirty=true;setAccountStatus('同步未完成，本機資料保留');if(showAlert)alert('同步未完成。請確認網路與 Pro 資格，本機資料未刪除。')}return false}
 finally{authBusy=false;renderSettings();if(canCloudSync()&&cloudDirty&&localRevision!==revision)queueAccountSave()}
}
function queueAccountSave(delay=350){
 if(!canCloudSync())return;clearTimeout(authTimer);
 const uid=authUser.id,epoch=accountEpoch;
 authTimer=setTimeout(()=>{authTimer=null;if(cloudSession(uid,epoch))saveAccountState(false)},delay);
}
function changedAndSync(){cloudDirty=true;persistLocalSnapshot();queueAccountSave();renderCloudState()}
async function loadAccountState(){
 if(!canCloudSync()||!navigator.onLine)return;
 const uid=authUser.id,epoch=accountEpoch,revision=localRevision;
 const client=await getAuthClient();
 const {data,error}=await client.from('user_sync_state').select('payload,updated_at').eq('user_id',uid).maybeSingle();
 if(!cloudSession(uid,epoch))return;
 if(error){setAccountStatus('雲端讀取未完成，本機仍可使用');renderSettings();return}
 if(revision!==localRevision){if(data)showCloudConflict(data);else queueAccountSave();return}
 if(!data){cloudBaseKnown=true;cloudBaseStamp=null;if(hasMeaningfulUserData())await saveAccountState(false);else setAccountStatus('雲端尚無工作資料');return}
 const snapshot=data.payload||{};if(!snapshot.state)return;
 if(workJson(normalizeState(snapshot.state))!==workJson(state)&&hasMeaningfulUserData()){showCloudConflict(data);return}
 state=normalizeState(snapshot.state);persistLocalSnapshot();cloudDirty=false;cloudBaseKnown=true;cloudBaseStamp=data.updated_at;cloudAck=data.updated_at;applyTheme();render();
}
async function handleSignedIn(user){
 const changed=!authUser||authUser.id!==user.id;
 if(changed){accountEpoch++;authUser=user;await stopAccountRealtime();entitlementChecked=false;cloudConsent=false;cloudAck='';cloudConflict=null;
  if(!switchLocalWorkspace(user.id,true)){setAccountStatus('已登入，但本機資料尚未歸入此帳號；雲端同步未啟用。');return}
  try{cloudConsent=localStorage.getItem(CONSENT_PREFIX+user.id)==='yes'}catch(e){}
 }
 authUser=user;setAccountStatus('已登入・正在確認方案');
 if(!welcomeForced||welcomeInitiatedLogin)closeWelcome();
 await loadEntitlement();await loadBillingHistory();renderSettings();
}
async function handleSignedOut(){
 accountEpoch++;entitlementRequest++;authUser=null;serverPlan='free';entitlementChecked=false;entitlementStatus='free';entitlementUntil=null;trialStartedAt=null;billingProvider=null;providerSubscriptionId=null;cancelAtPeriodEnd=false;canceledAt=null;billingHistory=[];
 cloudConsent=false;cloudAck='';cloudConflict=null;clearTimeout(expiryTimer);await stopAccountRealtime();switchLocalWorkspace('guest');setAccountStatus('未登入・本機資料照常保存');render();
}
async function initAuth(){
 try{
  const client=await getAuthClient();
  client.auth.onAuthStateChange((event,session)=>{
   // Do not await Supabase APIs inside its auth lock.
   setTimeout(()=>{if(session&&session.user)handleSignedIn(session.user);else if(event==='SIGNED_OUT')handleSignedOut()},0);
  });
  const {data,error}=await client.auth.getSession();if(error)throw error;
  if(data&&data.session&&data.session.user)await handleSignedIn(data.session.user);
 }catch(e){setAccountStatus('登入服務暫時無法連線・仍可不登入使用');if($('welcomeStatus'))$('welcomeStatus').textContent='登入服務暫時無法連線，你仍可選擇「先使用，不登入」。'}
}
