// Auth identifies an account. Only verified, unexpired Pro AND explicit consent enable work sync.
const WELCOME_KEY='meow-work-welcome-v1',OWNER_KEY='meow-work-workspace-owner-v1',WORKSPACE_PREFIX='meow-work-workspace-v1:',CONSENT_PREFIX='meow-work-cloud-consent-v1:';
let localOwner='guest';try{localOwner=localStorage.getItem(OWNER_KEY)||'guest'}catch(e){}
let localRevision=0,localSaveFailed=false,entitlementChecked=false,entitlementRequest=0,accountEpoch=0,expiryTimer=null;
let cloudConsent=false,cloudDirty=false,cloudAck='',cloudBaseKnown=false,cloudBaseStamp=null,cloudConflict=null,cloudGeneration=0;
let welcomeForced=new URLSearchParams(location.search).get('welcome')==='1',welcomeInitiatedLogin=false,appleAvailable=false;
function hasLivePro(){return !!(authUser&&entitlementChecked&&serverPlan==='pro'&&['active','trialing'].includes(entitlementStatus)&&Number.isFinite(Date.parse(entitlementUntil))&&Date.parse(entitlementUntil)>Date.now())}
function canCloudSync(){return hasLivePro()&&cloudConsent&&localOwner===authUser.id&&!cloudConflict}
function cloudSession(uid,epoch){return !!(canCloudSync()&&authUser.id===uid&&accountEpoch===epoch)}
function workJson(value){const copy=JSON.parse(JSON.stringify(value||{}));delete copy.theme;return JSON.stringify(copy)}
function cloudNotice(){
 if(!authUser)return '未登入・工作資料只保存在此裝置';
 if(!entitlementChecked)return entitlementStatus==='error'?'方案確認失敗・雲端同步暫停，本機仍可使用':'正在確認方案・尚未啟動工作資料同步';
 if(!hasLivePro())return ['expired','canceled','past_due'].includes(entitlementStatus)||trialStartedAt?'雲端同步已暫停・本機資料保留':'免費版・工作資料只保存在此裝置';
 if(!cloudConsent)return 'Pro 已可使用・尚未同意啟用雲端同步';
 if(cloudConflict)return '本機與雲端內容不同・請選擇要使用的副本';
 if(!navigator.onLine)return '目前離線・變更尚未上傳';
 if(cloudDirty)return '本機有變更・尚未完成雲端同步';
 if(cloudAck)return '已同步・最後成功時間 '+new Date(cloudAck).toLocaleString('zh-TW');
 return '雲端同步已啟用・尚未確認備份成功';
}
function renderCloudState(){
 const status=$('cloudProtection');if(status){status.textContent=cloudNotice();status.classList.toggle('safe',!!(canCloudSync()&&cloudAck&&!cloudDirty&&navigator.onLine))}
 if($('cloudModeState'))$('cloudModeState').textContent=hasLivePro()?(cloudConsent?'已啟用':'尚未啟用'):'Pro 專屬';
 if($('cloudBackupNow'))$('cloudBackupNow').textContent=canCloudSync()?'立即同步到雲端':hasLivePro()?'啟用 Pro 雲端同步':'🔒 Pro 雲端同步';
 if($('cloudRestoreNow'))$('cloudRestoreNow').disabled=!hasLivePro();
 if($('cloudStop'))$('cloudStop').hidden=!cloudConsent;
 if($('exportExistingCloud'))$('exportExistingCloud').hidden=!authUser;
 if($('syncConflict'))$('syncConflict').hidden=!cloudConflict;
 if($('localOwnerLabel'))$('localOwnerLabel').textContent=authUser&&localOwner===authUser.id?'目前帳號的本機工作區':'未登入的本機工作區';
}
function switchLocalWorkspace(nextOwner,allowGuestClaim=false){
 if(nextOwner===localOwner)return true;
 if(!persistLocalSnapshot()){alert('本機儲存失敗。請先匯出備份，再切換帳號。');return false}
 const previousOwner=localOwner;
 try{
  let raw=localStorage.getItem(WORKSPACE_PREFIX+nextOwner),saved=raw?JSON.parse(raw):null;
  if(!saved&&allowGuestClaim&&previousOwner==='guest'&&hasMeaningfulUserData()&&confirm('要將目前這份本機資料帶入此帳號嗎？\n\n只保存在這台裝置，不會上傳雲端。未登入工作區的副本也會保留。'))saved={state:JSON.parse(JSON.stringify(state)),savedAt:lastSavedAt};
  const nextState=normalizeState(saved&&saved.state||defaultState()),nextTime=saved&&saved.savedAt||null;
  const nextRaw=JSON.stringify({owner:nextOwner,state:nextState,savedAt:nextTime});
  localStorage.setItem(WORKSPACE_PREFIX+nextOwner,nextRaw);
  localStorage.setItem(SAVE_KEY,nextRaw);
  localStorage.setItem(OWNER_KEY,nextOwner);
  localOwner=nextOwner;state=nextState;lastSavedAt=nextTime;localRevision++;
  try{localStorage.setItem(AVATAR_KEY,state.profile.avatar||'');localStorage.setItem(SCHEDULE_KEY,JSON.stringify(state.schedule))}catch(e){}
  cloudBaseKnown=false;cloudBaseStamp=null;cloudAck='';cloudDirty=false;cloudConflict=null;
  applyTheme();render();return true;
 }catch(e){try{localStorage.setItem(OWNER_KEY,previousOwner)}catch(_){}alert('無法安全切換本機工作區，原資料仍保留。');return false}
}
function rememberCloudConsent(value){
 if(!authUser)return false;
 try{localStorage.setItem(CONSENT_PREFIX+authUser.id,value?'yes':'no');cloudConsent=value;return true}catch(e){alert('無法保存同步設定，請先確認裝置的儲存空間。');return false}
}
async function enableCloudSync(){
 if(!hasLivePro()){alert(authUser?'雲端同步為 Pro 專屬。登入不會自動開始試用或收費。':'請先登入，再確認 Pro 方案。');return}
 if(!cloudConsent&&!confirm('啟用 Pro 雲端同步？\n\n班表、薪資、假別、行程與個人工作資料將保存到此帳號的雲端空間。淺色／深色仍由這台裝置決定。'))return;
 if(!rememberCloudConsent(true))return;
 await loadAccountState();if(canCloudSync())await subscribeAccountRealtime();renderSettings();
}
async function disableCloudSync(){if(!rememberCloudConsent(false))return;await stopAccountRealtime();setAccountStatus('已暫停同步，本機與既有雲端資料未刪除');renderSettings()}
function showCloudConflict(row){cloudConflict=row;cloudDirty=true;setAccountStatus('同步暫停，兩份資料都保留；請選擇要使用的版本。');renderSettings()}
function preserveRecovery(snapshot,label){
 try{localStorage.setItem('meow-work-recovery-v1:'+localOwner+':'+label,JSON.stringify(snapshot));return true}catch(e){alert('無法保存安全副本。請先匯出備份，暫不覆蓋資料。');return false}
}
async function resolveCloudConflict(useLocal){
 const pending=cloudConflict;if(!pending||!hasLivePro())return;
 if(!preserveRecovery({state:JSON.parse(JSON.stringify(state)),savedAt:lastSavedAt},'local')||!preserveRecovery(pending.payload,'cloud'))return;
 if(!confirm(useLocal?'保留本機內容並更新雲端？原雲端副本已另行保留。':'使用雲端內容？原本機副本已另行保留。'))return;
 cloudBaseKnown=true;cloudBaseStamp=pending.updated_at;cloudConflict=null;
 if(useLocal)await saveAccountState(true);
 else{state=normalizeState(pending.payload.state);persistLocalSnapshot();cloudDirty=false;cloudAck=pending.updated_at;applyTheme();render();}
 if(canCloudSync())await subscribeAccountRealtime();
}
async function exportExistingCloud(){
 if(!authUser){alert('請先登入，才能取回此帳號的既有雲端備份。');return}
 try{
  const result=await invokeUserFunction('export-work-backup',{});
  if(!result.state){alert('這個帳號目前沒有可取回的雲端備份。');return}
  downloadBlob(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),'meow-existing-cloud-backup-'+iso(new Date())+'.json');
  setAccountStatus('已匯出既有副本；未開啟自動同步，也未覆蓋本機資料。');
 }catch(e){alert('既有備份取回失敗，資料未刪除。請稍後再試。')}
}
function scheduleEntitlementExpiry(){
 clearTimeout(expiryTimer);expiryTimer=null;
 if(!hasLivePro())return;
 const delay=Math.min(2147483000,Math.max(1,Date.parse(entitlementUntil)-Date.now()+30));
 expiryTimer=setTimeout(()=>{if(!hasLivePro()){serverPlan='free';entitlementStatus='expired';stopAccountRealtime();render();}else scheduleEntitlementExpiry()},delay);
}
async function reconcileCloudAccess(){
 scheduleEntitlementExpiry();
 if(!canCloudSync()){await stopAccountRealtime();renderSettings();return}
 await loadAccountState();if(canCloudSync())await subscribeAccountRealtime();
}
function openWelcome(force=false){
 if(force)welcomeForced=true;
 document.documentElement.classList.add('welcome-open');
 const app=document.querySelector('.app');if(app){app.inert=true;app.setAttribute('aria-hidden','true')}
 $('welcomeClosePreview').hidden=!force;
 $('welcomeScreen').scrollTop=0;$('welcomeScreen').focus({preventScroll:true});
}
function closeWelcome(persist=true){
 if(persist){try{localStorage.setItem(WELCOME_KEY,'done')}catch(e){}}
 document.documentElement.classList.remove('welcome-open');
 const app=document.querySelector('.app');if(app){app.inert=false;app.removeAttribute('aria-hidden')}
 if(new URLSearchParams(location.search).has('welcome')){const url=new URL(location.href);url.searchParams.delete('welcome');history.replaceState(null,'',url.pathname+url.search+url.hash)}
 welcomeForced=false;welcomeInitiatedLogin=false;
}
async function selectGuest(){
 if(authUser){if(!confirm('目前已登入。要登出並使用未登入的本機工作區嗎？原帳號的本機資料會保留。'))return;await signOutAccount();if(authUser)return}
 if(localOwner!=='guest'&&!switchLocalWorkspace('guest'))return;
 closeWelcome();render();
}
async function signInWithApple(){
 if(!appleAvailable){$('welcomeStatus').textContent='Apple 登入尚未開放，請使用 Google、Email，或先使用不登入。';return}
 try{const client=await getAuthClient();welcomeInitiatedLogin=true;const {error}=await client.auth.signInWithOAuth({provider:'apple',options:{redirectTo:location.origin+location.pathname}});if(error)throw error}catch(e){$('welcomeStatus').textContent='Apple 登入未完成，原本機資料仍保留。'}
}
async function checkAppleAvailability(){
 try{const res=await fetch(SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:SUPABASE_KEY}});if(!res.ok)return;const config=await res.json();appleAvailable=config.external&&config.external.apple===true;if(appleAvailable){$('welcomeApple').disabled=false;$('welcomeAppleNote').hidden=true}}catch(e){}
}
function initWelcome(){
 let seen=false;try{seen=localStorage.getItem(WELCOME_KEY)==='done'}catch(e){}
 if(!seen||welcomeForced)openWelcome(welcomeForced);
 $('welcomeGuest').onclick=selectGuest;
 $('welcomeGoogle').onclick=()=>{welcomeInitiatedLogin=true;$('welcomeStatus').textContent='正在前往 Google 登入…';signInWithGoogle().then(()=>{$('welcomeStatus').textContent=accountStatusText})};
 $('welcomeApple').onclick=signInWithApple;
 $('welcomeClosePreview').onclick=()=>closeWelcome(false);
 if($('showWelcome'))$('showWelcome').onclick=()=>openWelcome(true);
 $('welcomeEmailForm').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('emailLoginInput').value=$('welcomeEmail').value;try{await sendEmailOtp();$('welcomeStatus').textContent=accountStatusText;if(pendingEmail){$('welcomeOtpForm').hidden=false;$('welcomeOtp').focus()}}finally{button.disabled=false}};
 $('welcomeOtpForm').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('emailOtpInput').value=$('welcomeOtp').value;welcomeInitiatedLogin=true;try{await verifyEmailOtp();$('welcomeStatus').textContent=accountStatusText}finally{button.disabled=false}};
 $('welcomeResend').onclick=()=>$('welcomeEmailForm').requestSubmit();
 $('welcomeOtp').oninput=event=>{event.target.value=event.target.value.replace(/\D/g,'').slice(0,6)};
 $('cloudBackupNow').onclick=()=>cloudConsent?saveAccountState(true):enableCloudSync();
 $('cloudRestoreNow').onclick=()=>restoreFromCloud(true);
 $('cloudStop').onclick=disableCloudSync;
 $('exportExistingCloud').onclick=exportExistingCloud;
 $('syncKeepLocal').onclick=()=>resolveCloudConflict(true);$('syncUseCloud').onclick=()=>resolveCloudConflict(false);
 document.addEventListener('keydown',event=>{
  if(!document.documentElement.classList.contains('welcome-open'))return;
  if(event.key==='Escape'&&welcomeForced){closeWelcome(false);return}
  if(event.key!=='Tab')return;
  const list=Array.from($('welcomeScreen').querySelectorAll('button:not(:disabled),summary,input')).filter(el=>el.getClientRects().length&&!el.hidden);
  if(!list.length)return;const first=list[0],last=list[list.length-1];
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===$('welcomeScreen'))){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
 checkAppleAvailability();
 window.addEventListener('online',()=>{if(authUser)loadEntitlement();renderSettings()});
 window.addEventListener('offline',()=>{stopAccountRealtime();renderSettings()});
}
// End onboarding / account / cloud separation.
