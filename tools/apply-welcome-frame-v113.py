"""Guarded, idempotent v112 -> v113 source migration. Never touches user data."""
from pathlib import Path

root=Path(__file__).resolve().parents[1]
path=root/'index.html'
html=path.read_text(encoding='utf-8')
if 'const WELCOME_FRAME_KEY=' in html:
    print('Frame migration already present; nothing to change.')
    raise SystemExit(0)

def replace(old,new,count=1):
    global html
    found=html.count(old)
    if found!=count:
        raise SystemExit(f'Expected {count} copies of {old[:90]!r}, found {found}; refusing unsafe patch')
    html=html.replace(old,new)

replace('/* The welcome screen shares the application\'s cream/apricot/brown palette. */',
'''/* Framed welcome card: device safe areas stay outside the scrollable card. */''')
replace('.meow-welcome{padding:0;border:0;max-width:none;max-height:none;width:100%;height:100dvh;inset:0;margin:0;background:var(--bg);color:var(--ink);overflow:auto;overscroll-behavior:contain}',
'''.meow-welcome{padding:0;border:2px solid #fffdf8;border-radius:28px;width:calc(100% - 32px);max-width:460px;height:auto;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));inset:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);margin:auto;background:#fff9f1;color:var(--ink);overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;box-shadow:0 18px 60px rgba(96,60,34,.17),0 0 0 1px rgba(195,150,109,.2)}''')
replace('.meow-welcome::backdrop{background:var(--bg)}',
'''.meow-welcome::backdrop{background:rgba(244,233,217,.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
html.meow-welcome-open,html.meow-welcome-open body{overflow:hidden}''')
replace('.welcome-sheet{max-width:460px;margin:0 auto;min-height:100%;background:#fff9f1;padding-top:env(safe-area-inset-top);padding-bottom:max(14px,env(safe-area-inset-bottom));color:#3c1c15}',
'''.welcome-sheet{width:100%;margin:0;background:#fff9f1;padding:0 0 18px;color:#3c1c15}''')
replace('@media(min-width:761px){.meow-welcome{background:#f0e6da}.welcome-sheet{box-shadow:0 0 60px #6e49311a}}',
'''@media(min-width:761px){.meow-welcome{max-height:calc(100dvh - 64px)}}
html.dark .meow-welcome{background:#241d19;border-color:#645044;box-shadow:0 18px 60px #0006}
html.dark .meow-welcome::backdrop{background:rgba(28,22,18,.85)}''')
replace('<h1 id="welcomeTitle" class="welcome-sr">','<h1 id="welcomeTitle" class="welcome-sr" tabindex="-1">')
replace("const WELCOME_KEY='meow-work-welcome-v1',OWNER_KEY='meow-work-local-owner-v1';",
"const WELCOME_KEY='meow-work-welcome-v1',OWNER_KEY='meow-work-local-owner-v1';\n// Separate UI acknowledgement; never clear account, workspace or saved data.\nconst WELCOME_FRAME_KEY='meow-work-welcome-frame-v1';")
replace("  if(!welcomeManual)finishWelcome();", "  if($('welcomeDialog').open)$('welcomeGuestText').textContent='返回 App';\n  if(!welcomeManual)finishWelcome();")
replace("function finishWelcome(){\n  try{localStorage.setItem(WELCOME_KEY,'done')}catch(e){}\n  if($('welcomeDialog').open)$('welcomeDialog').close();welcomeManual=false;\n}",
'''function finishWelcome(){
  try{localStorage.setItem(WELCOME_KEY,'done');localStorage.setItem(WELCOME_FRAME_KEY,'done')}catch(e){}
  if($('welcomeDialog').open)$('welcomeDialog').close();
  document.documentElement.classList.remove('meow-welcome-open');welcomeManual=false;
  // A preview URL is one-use; preserve every unrelated query parameter/hash.
  try{const url=new URL(location.href);if(url.searchParams.get('welcome')==='1'){url.searchParams.delete('welcome');history.replaceState(history.state,'',url.href)}}catch(e){}
}''')
replace("  if(!$('welcomeDialog').open)$('welcomeDialog').showModal();$('welcomeDialog').scrollTop=0;", 
"  document.documentElement.classList.add('meow-welcome-open');\n  if(!$('welcomeDialog').open)$('welcomeDialog').showModal();\n  $('welcomeTitle').focus({preventScroll:true});$('welcomeDialog').scrollTop=0;")
replace("  const force=new URLSearchParams(location.search).get('welcome')==='1';\n  const first=!readLocalString(WELCOME_KEY)&&!readLocalString(SAVE_KEY);\n  if(force||first)openWelcome(force);\n  else if(!readLocalString(WELCOME_KEY)){try{localStorage.setItem(WELCOME_KEY,'done')}catch(e){}}", 
'''  const params=new URLSearchParams(location.search),force=params.get('welcome')==='1';
  const returningFromAuth=params.has('code')||/(?:^#|&)(?:access_token|error|error_description)=/.test(location.hash);
  // Show the new card once even on an existing v112 installation. A restored
  // session must not dismiss it before the person can see it or switch accounts.
  if(force||readLocalString(WELCOME_FRAME_KEY)!=='done')openWelcome(force||!returningFromAuth);''')
replace("  $('welcomeDialog').addEventListener('cancel',event=>{event.preventDefault();finishWelcome()});", 
"  $('welcomeDialog').addEventListener('cancel',event=>{event.preventDefault();finishWelcome()});\n  $('welcomeDialog').addEventListener('close',()=>document.documentElement.classList.remove('meow-welcome-open'));")
replace('./manifest.webmanifest?v=112','./manifest.webmanifest?v=113')
replace('meow-sw-reloaded-v112','meow-sw-reloaded-v113')
replace('./sw.js?v=112','./sw.js?v=113')
replace('<title>喵的，又要上班了</title>', '<title>喵的，又要上班了</title>\n<meta name="meow-ui-build" content="v113-framed-welcome">')
sw_path=root/'sw.js';sw=sw_path.read_text(encoding='utf-8')
assert 'meow-work-pwa-v112' in sw and './manifest.webmanifest?v=112' in sw
sw=sw.replace('meow-work-pwa-v112','meow-work-pwa-v113').replace('./manifest.webmanifest?v=112','./manifest.webmanifest?v=113')
path.write_text(html,encoding='utf-8');sw_path.write_text(sw,encoding='utf-8')
print('Applied v113 framed welcome and one-time upgrade display; all workspace and entitlement code retained.')
