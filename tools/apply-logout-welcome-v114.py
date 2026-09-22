"""Guarded v113 -> v114 reauthentication entry; no workspace/cloud schema changes."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'index.html'
html = path.read_text(encoding='utf-8')
if "const WELCOME_REAUTH_KEY=" in html:
    print('Reauthentication entry already applied.')
    raise SystemExit(0)

def replace(old, new, count=1):
    global html
    actual = html.count(old)
    if actual != count:
        raise SystemExit(f'Unsafe patch: expected {count} copies of {old[:80]!r}, found {actual}')
    html = html.replace(old, new)

replace("const WELCOME_FRAME_KEY='meow-work-welcome-frame-v1';", """const WELCOME_FRAME_KEY='meow-work-welcome-frame-v1';
// Pending login choice survives a restart, without resetting any work data.
const WELCOME_REAUTH_KEY='meow-work-welcome-reauth-v1';""")
replace("""async function handleSignedOut(){
  accessEpoch++;entitlementRequest++;authUser=null;resetEntitlement();billingHistory=[];clearTimeout(expiryTimer);
  await stopAccountRealtime();cloudReady=false;pendingCloud=null;switchWorkspace('guest');
  setAccountStatus('尚未登入・使用本機工作區');setCloudStatus('未啟用・Pro 專屬');render();
}""", """async function handleSignedOut(){
  const needsLogin=!!authUser||localOwner!=='guest';
  const epoch=++accessEpoch;
  entitlementRequest++;authUser=null;resetEntitlement();billingHistory=[];clearTimeout(expiryTimer);
  // Save only the UI intent. The existing workspace switch archives account data.
  if(needsLogin){try{localStorage.setItem(WELCOME_REAUTH_KEY,'pending')}catch(e){}}
  await stopAccountRealtime();
  // A newer sign-in must not be overwritten by a delayed sign-out callback.
  if(epoch!==accessEpoch||authUser)return;
  cloudReady=false;pendingCloud=null;switchWorkspace('guest');
  setAccountStatus('尚未登入・使用本機工作區');setCloudStatus('未啟用・Pro 專屬');render();
  if(needsLogin||readLocalString(WELCOME_REAUTH_KEY)==='pending'){
    pendingEmail='';
    ['welcomeEmailInput','welcomeOtpInput','emailLoginInput','emailOtpInput'].forEach(id=>{if($(id))$(id).value=''});
    $('welcomeEmailFields').hidden=true;$('welcomeOtpFields').hidden=true;
    $('welcomeEmail').setAttribute('aria-expanded','false');$('otpPanel').classList.add('hidden');
    openWelcome(false);
    setAccountStatus('請重新登入，或選擇「先使用，不登入」。本機資料仍保留。');
  }
}""")
replace("try{localStorage.setItem(WELCOME_KEY,'done');localStorage.setItem(WELCOME_FRAME_KEY,'done')}catch(e){}", "try{localStorage.setItem(WELCOME_KEY,'done');localStorage.setItem(WELCOME_FRAME_KEY,'done');localStorage.removeItem(WELCOME_REAUTH_KEY)}catch(e){}")
replace("""  if(force||readLocalString(WELCOME_FRAME_KEY)!=='done')openWelcome(force||!returningFromAuth);""", """  const reauthPending=readLocalString(WELCOME_REAUTH_KEY)==='pending';
  if(force||reauthPending||readLocalString(WELCOME_FRAME_KEY)!=='done')openWelcome(force||(!returningFromAuth&&!reauthPending));""")
replace("async function signOutAccount(){const client=await getAuthClient();await client.auth.signOut()}", """async function signOutAccount(){
  const button=$('accountLogout');if(button.disabled)return;button.disabled=true;
  try{
    const client=await getAuthClient();
    // Sign out this device only; other devices and saved workspaces are untouched.
    const {error}=await client.auth.signOut({scope:'local'});
    if(error)throw error;
    clearTimeout(authEventTimer);authEventTimer=null;
    // Also handle clients which do not emit a local SIGNED_OUT callback.
    await handleSignedOut();
  }catch(e){
    setAccountStatus('登出未完成，請稍後重試。本機資料未清除。');
    alert('登出未完成，請稍後重試。本機資料未清除。');
  }finally{button.disabled=false}
}""")
replace('content="v113-framed-welcome"', 'content="v114-logout-welcome"')
replace('./manifest.webmanifest?v=113','./manifest.webmanifest?v=114')
replace('meow-sw-reloaded-v113','meow-sw-reloaded-v114')
replace('./sw.js?v=113','./sw.js?v=114')
replace('（介面 v112）','（介面 v114）')
swpath = root/'sw.js'
sw = swpath.read_text(encoding='utf-8')
assert sw.count('meow-work-pwa-v113') == 1 and sw.count('./manifest.webmanifest?v=113') == 1
sw = sw.replace('meow-work-pwa-v113','meow-work-pwa-v114').replace('./manifest.webmanifest?v=113','./manifest.webmanifest?v=114')
path.write_text(html,encoding='utf-8');swpath.write_text(sw,encoding='utf-8')
print('Applied v114: show login after sign-out, remember guest choice, preserve valid sessions.')
