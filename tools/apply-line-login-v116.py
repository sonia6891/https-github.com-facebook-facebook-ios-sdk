"""Prepare account-required Google/LINE login UI. Does not configure the LINE provider secret."""
from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
path=root/'index.html'
html=path.read_text(encoding='utf-8')
if "LINE_PROVIDER_ID='custom:line'" in html:
    print('LINE login patch already present.')
    raise SystemExit(0)

def replace_once(old,new):
    global html
    n=html.count(old)
    if n!=1:
        raise SystemExit(f'Expected exactly one match, found {n}: {old[:100]!r}')
    html=html.replace(old,new,1)

replace_once(
".welcome-google>svg{stroke:none}.welcome-apple{background:#171717;color:#fff;border-color:#171717}.welcome-email{background:#eeebe8;border-color:transparent}.welcome-guest{background:#fff0d4;color:#754327;border:1.5px solid #cf7b43}.welcome-guest svg{fill:#a66641;stroke:#a66641}",
".welcome-google>svg{stroke:none}.welcome-line{background:#06c755;color:#fff;border-color:#06c755;box-shadow:0 6px 16px rgba(6,199,85,.18)}.welcome-line-mark{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#06c755;font-size:9px;font-weight:950;letter-spacing:-.4px}.welcome-apple{background:#171717;color:#fff;border-color:#171717}.welcome-email{background:#eeebe8;border-color:transparent}.welcome-guest{background:#fff0d4;color:#754327;border:1.5px solid #cf7b43}.welcome-guest svg{fill:#a66641;stroke:#a66641}"
)

start=html.index('        <div class="welcome-divider"><span>其他登入方式</span></div>')
end=html.index('      <p id="welcomeMessage"',start)
replacement='''        <button type="button" id="welcomeLine" class="welcome-button welcome-line"><span class="welcome-line-mark" aria-hidden="true">LINE</span><span>使用 LINE 繼續</span><span aria-hidden="true">›</span></button>
'''
html=html[:start]+replacement+html[end:]

replace_once(
'      <p class="welcome-foot">登入不會自動開始試用或收費，方案內容可在 App 內隨時查看與管理。</p>',
'      <p class="welcome-foot">登入後即為 Free 帳號；Pro 可在「設定」中試用或訂閱。登入本身不會啟用雲端同步或收費。</p>'
)
replace_once(
'      <p class="welcome-apple-note" id="welcomeAppleNote">Apple 登入尚未開放；目前可使用 Google、Email 或不登入。</p>',
'      <p class="welcome-apple-note" id="welcomeAppleNote" hidden>Apple 登入尚未開放。</p>'
)

replace_once(
"const SUPABASE_KEY='sb_publishable_yMJb1rIra-0if8nDZwxO9A_N4n7BtAv';",
"const SUPABASE_KEY='sb_publishable_yMJb1rIra-0if8nDZwxO9A_N4n7BtAv';\nconst LINE_PROVIDER_ID='custom:line';"
)

replace_once(
"function openWelcome(manual=false){\n  welcomeManual=manual;$('welcomeGuestText').textContent=authUser?'返回 App':'先使用，不登入';$('welcomeMessage').textContent='';",
"function openWelcome(manual=false){\n  welcomeManual=manual;$('welcomeMessage').textContent='';"
)

pattern=re.compile(r"async function handleSignedOut\(\)\{.*?\n\}\nasync function initAuth\(\)\{.*?\n\}\nasync function toggleCloud\(\)\{",re.S)
m=pattern.search(html)
if not m:
    raise SystemExit('auth flow block not found')
new_auth=r'''async function handleSignedOut(){
  const epoch=++accessEpoch;
  entitlementRequest++;authUser=null;resetEntitlement();billingHistory=[];clearTimeout(expiryTimer);
  await stopAccountRealtime();
  if(epoch!==accessEpoch||authUser)return;
  cloudReady=false;pendingCloud=null;switchWorkspace('guest');
  setAccountStatus('請使用 Google 或 LINE 登入');setCloudStatus('未啟用・Pro 專屬');render();
  openWelcome(false);
}
async function initAuth(){
  try{
    const client=await getAuthClient();
    const {data}=await client.auth.getSession();
    if(data&&data.session&&data.session.user)await handleSignedIn(data.session.user);
    else await handleSignedOut();
    client.auth.onAuthStateChange((event,session)=>{
      if(!['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event))return;
      clearTimeout(authEventTimer);
      if(event==='SIGNED_OUT'){accessEpoch++;accessCheckedUser='';clearTimeout(authTimer)}
      authEventTimer=setTimeout(()=>{
        if(session&&session.user)void handleSignedIn(session.user);
        else if(event==='SIGNED_OUT')void handleSignedOut();
      },0);
    });
  }catch(e){
    setAccountStatus('登入服務暫時無法連線');
    openWelcome(false);
  }
}
async function toggleCloud(){'''
html=html[:m.start()]+new_auth+html[m.end():]

replace_once(
"  if($('welcomeDialog').open)$('welcomeGuestText').textContent='返回 App';\n  if(!welcomeManual)finishWelcome();",
"  if($('welcomeDialog').open&&!welcomeManual)finishWelcome();"
)

pattern=re.compile(r"async function initWelcome\(\)\{.*?\n\}\nwindow\.addEventListener\('offline'",re.S)
m=pattern.search(html)
if not m:
    raise SystemExit('initWelcome block not found')
new_welcome=r'''async function initWelcome(){
  $('welcomeGoogle').onclick=async()=>{const b=$('welcomeGoogle');b.disabled=true;try{await signInWithGoogle()}finally{b.disabled=false}};
  $('welcomeLine').onclick=async()=>{const b=$('welcomeLine');b.disabled=true;try{await signInWithLine()}finally{b.disabled=false}};
  $('welcomeDialog').addEventListener('cancel',event=>{event.preventDefault();if(welcomeManual)finishWelcome()});
  $('welcomeDialog').addEventListener('close',()=>document.documentElement.classList.remove('meow-welcome-open'));
  if($('showWelcome'))$('showWelcome').onclick=()=>openWelcome(true);
  $('toggleCloudSync').onclick=toggleCloud;
  $('legacyCloudExport').onclick=exportLegacyCloud;
  $('keepCloudVersion').onclick=()=>{if(pendingCloud&&canCloudSync()&&confirm('先保留本機安全副本，再使用雲端版本？'))applyRemoteRow(pendingCloud)};
  $('keepLocalVersion').onclick=()=>{if(pendingCloud&&canCloudSync()&&confirm('用本機版本更新雲端？原雲端版本會保留在備份歷史內。'))void saveAccountState(true,true)};
}
window.addEventListener('offline' '''
html=html[:m.start()]+new_welcome+html[m.end():]

insert_at=html.index('async function sendEmailOtp(){')
line_fn=r'''async function signInWithLine(){
  try{
    const client=await getAuthClient();
    setAccountStatus('正在前往 LINE 登入…');
    const redirectTo=location.origin+location.pathname;
    const {error}=await client.auth.signInWithOAuth({
      provider:LINE_PROVIDER_ID,
      options:{redirectTo,scopes:'openid profile'}
    });
    if(error)throw error;
  }catch(e){
    setAccountStatus('LINE 登入尚未完成設定');
    alert('LINE 登入目前尚未完成設定，請先使用 Google 登入。');
  }
}

'''
html=html[:insert_at]+line_fn+html[insert_at:]

# Account-required login has no guest bypass. Legacy email functions may remain for migration/admin use,
# but there is no public login entry for them.
replace_once('<meta name="meow-ui-build" content="v114-logout-welcome">','<meta name="meow-ui-build" content="v116-google-line-login">')
replace_once('./manifest.webmanifest?v=115','./manifest.webmanifest?v=116')
replace_once("meow-sw-reloaded-v115","meow-sw-reloaded-v116")
replace_once("./sw.js?v=115","./sw.js?v=116")

sw_path=root/'sw.js'
sw=sw_path.read_text(encoding='utf-8')
if 'meow-work-pwa-v115' not in sw:
    raise SystemExit('expected v115 service worker')
sw=sw.replace('meow-work-pwa-v115','meow-work-pwa-v116').replace('./manifest.webmanifest?v=115','./manifest.webmanifest?v=116')
path.write_text(html,encoding='utf-8')
sw_path.write_text(sw,encoding='utf-8')
print('Prepared v116 Google + LINE account-required login UI. LINE provider credentials are still external configuration.')
