from pathlib import Path
import sys
root=Path(sys.argv[1]);p=root/'index.html';s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1: raise RuntimeError(f'anchor {s.count(a)}: {a[:100]}')
 s=s.replace(a,b,1)

once('<div id="emailLoginPanel">\n          <div class="field" style="margin-top:12px">',
'''<div id="emailLoginPanel">
          <div class="hint" style="margin-top:10px">登入後會自動開啟雲端同步；換手機或重新安裝後，使用同一帳號即可恢復資料。</div>
          <div class="settings-actions" style="margin-top:12px">
            <button class="btn primary" id="googleLogin" type="button">G　使用 Google 繼續</button>
          </div>
          <div class="hint" style="text-align:center;margin:10px 0 2px">── 或使用 Email ──</div>
          <div class="field" style="margin-top:12px">''')

anchor="async function sendEmailOtp(){"
google="""async function signInWithGoogle(){
  try{
    const client=await getAuthClient();
    setAccountStatus('正在前往 Google 登入…');
    const redirectTo=location.origin+location.pathname;
    const {error}=await client.auth.signInWithOAuth({
      provider:'google',
      options:{redirectTo,queryParams:{access_type:'offline',prompt:'select_account'}}
    });
    if(error)throw error;
  }catch(e){
    setAccountStatus('Google 登入失敗');
    alert('Google 登入失敗：'+(e&&e.message?e.message:'請稍後再試。'));
  }
}
"""
once(anchor,google+anchor)

once("if($('emailLoginPanel'))$('emailLoginPanel').classList.toggle('hidden',!!authUser);",
"if($('emailLoginPanel'))$('emailLoginPanel').classList.toggle('hidden',!!authUser);")
once("$('cloudProtection').textContent=authUser?'✓ 已啟用雲端保護。刪除 App 後，只要用同一個 Email 登入即可還原。':'⚠ 尚未啟用雲端保護。刪除 App 或網站資料後，本機資料可能無法找回。';",
"$('cloudProtection').textContent=authUser?'✓ 已啟用雲端保護。刪除 App 後，只要使用同一個登入帳號即可還原。':'⚠ 尚未啟用雲端保護。刪除 App 或網站資料後，本機資料可能無法找回。';")

once("$('sendEmailOtp').onclick=sendEmailOtp;",
"$('googleLogin').onclick=signInWithGoogle;\n$('sendEmailOtp').onclick=sendEmailOtp;")

once('使用同一個 Email 登入後，App、Safari 與電腦網頁會共用同一份資料並即時同步。',
'使用同一個登入帳號後，App 會讀取同一份雲端資料並自動同步。')

s=s.replace('manifest.webmanifest?v=102','manifest.webmanifest?v=103').replace('介面 v102','介面 v103').replace('meow-sw-reloaded-v102','meow-sw-reloaded-v103').replace('./sw.js?v=102','./sw.js?v=103')
p.write_text(s)
sw=root/'sw.js';w=sw.read_text().replace('meow-work-pwa-v102','meow-work-pwa-v103').replace('manifest.webmanifest?v=102','manifest.webmanifest?v=103');sw.write_text(w)
print('v103 applied')
