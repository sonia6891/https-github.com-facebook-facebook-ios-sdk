"""Logout/login UI integration tests; all auth and data requests are mocked, no real accounts."""
from pathlib import Path
import functools, http.server, json, os, threading
from playwright.sync_api import sync_playwright

ROOT=Path(os.environ.get('MEOW_ROOT','.')).resolve()
OUT=Path(os.environ.get('MEOW_TEST_OUT','test-results'));OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text(encoding='utf-8')
bridge="window.__logoutApi={getState:()=>state,getOwner:()=>localOwner,getUser:()=>authUser,canCloudSync,handleSignedIn,handleSignedOut,changedAndSync,signOutAccount};"
pos=html.rfind('})();');assert pos>=0;html=html[:pos]+bridge+'\n'+html[pos:]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.split('?')[0] in ['/','/index.html']:
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/'
MOCK=r'''export function createClient(){
const t=window.__logoutTest;
const session=()=>JSON.parse(localStorage.getItem('__test_session')||'null');
const login=()=>{const s={user:{id:'account-A',email:'a@example.test'}};localStorage.setItem('__test_session',JSON.stringify(s));window.__authCallback?.('SIGNED_IN',s);return s;};
return {
 auth:{
 getSession:async()=>({data:{session:session()}}),
 onAuthStateChange(fn){window.__authCallback=fn;return{data:{subscription:{unsubscribe(){}}}}},
 signInWithOAuth:async x=>{t.oauth=x.provider;login();return{error:null}},
 signInWithOtp:async()=>({error:null}),
 verifyOtp:async x=>x.token==='123456'?{data:{session:login()},error:null}:{data:{session:null},error:{message:'invalid'}},
 signOut:async x=>{t.logoutScope=x?.scope;if(t.failLogout)return{error:{message:'offline'}};localStorage.removeItem('__test_session');if(!t.muteLogout)window.__authCallback?.('SIGNED_OUT',null);return{error:null}}
 },
 rpc:async name=>{t.calls.push(name);if(name==='meow_account_access')return{data:{server_now:new Date().toISOString(),entitlement:null},error:null};return{error:{code:'unexpected'}}},
 from(table){const q={select(){return q},eq(){return q},order(){return q},limit:async()=>({data:[],error:null}),maybeSingle:async()=>{t.calls.push(table);return{data:null,error:null}}};return q},
 channel(){t.calls.push('channel');return{on(){return this},subscribe(){return this}}},removeChannel:async()=>{}
 }}'''
results=[];errors=[]
def check(name,value):
 passed=bool(value);results.append({'name':name,'passed':passed});print(('PASS ' if passed else 'FAIL ')+name)
 (OUT/'logout-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 assert passed,name

def opened(page):return page.locator('#welcomeDialog').evaluate('x=>x.open')
def ready(page):
 page.wait_for_function('window.__logoutApi && window.__authCallback');page.wait_for_timeout(180)
def settings(page):page.locator('[data-tab="settings"]:visible').first.click()
def logout(page):
 settings(page);page.locator('#accountLogout').click();page.wait_for_function('!window.__logoutApi.getUser() && document.getElementById("welcomeDialog").open')
def login_google(page):
 page.locator('#welcomeGoogle').click();page.wait_for_function('window.__logoutApi.getUser() && !document.getElementById("welcomeDialog").open');page.wait_for_timeout(100)
def snapshot(owner,amount):
 return {'owner':owner,'savedAt':'2026-09-22T23:00:00.000Z','state':{'theme':'light','profile':{'name':'測試喵'},'settings':{'baseSalary':amount},'personalEvents':{'keep':{'id':'keep','date':'2026-10-01','start':'09:00','end':'10:00','title':owner+'行程','kind':'event'}}}}
def seed(session=True,owner='account-A',pending=False):
 d={'meow-work-welcome-v1':'done','meow-work-welcome-frame-v1':'done','meow-work-local-owner-v1':owner,'meow-work-manual-save-v3':json.dumps(snapshot(owner,38765)), 'meow-work-workspace-v1:guest':json.dumps(snapshot('guest',222)), 'meow-work-theme-v1':'light'}
 if session:d['__test_session']=json.dumps({'user':{'id':'account-A','email':'a@example.test'}})
 if pending:d['meow-work-welcome-reauth-v1']='pending'
 return d

with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('MEOW_BROWSER'):launch['executable_path']=os.environ['MEOW_BROWSER']
 browser=p.chromium.launch(**launch)
 def context(data=None):
  ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
  init='window.__logoutTest={calls:[]};'
  if data:init+='if(!localStorage.getItem("__logout_seeded")){for(const [k,v] of Object.entries('+json.dumps(data)+'))localStorage.setItem(k,v);localStorage.setItem("__logout_seeded","1");}'
  ctx.add_init_script(init)
  def route(r):
   url=r.request.url
   if url.startswith(URL):return r.continue_()
   if 'esm.sh/' in url:return r.fulfill(status=200,content_type='application/javascript',body=MOCK)
   if '/auth/v1/settings' in url:return r.fulfill(status=200,content_type='application/json',body='{"external":{"google":true,"email":true,"apple":false}}')
   if '/functions/v1/billing-config' in url:return r.fulfill(status=200,content_type='application/json',body='{"configured":false}')
   if 'tesseract' in url:return r.fulfill(status=200,content_type='application/javascript',body='window.Tesseract={};')
   return r.abort()
  ctx.route('**/*',route);return ctx
 def page_for(ctx):
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(URL);ready(page);return page

 ctx=context(seed());page=page_for(ctx)
 check('已登入且看過歡迎頁，不在重開時重複顯示',not opened(page) and page.evaluate('window.__logoutApi.getOwner()')=='account-A')
 page.close();page=page_for(ctx)
 check('完整關閉頁面再開，保留登入及本機資料',not opened(page) and page.evaluate('window.__logoutApi.getState().settings.baseSalary')==38765)
 page.evaluate("window.__authCallback('TOKEN_REFRESHED',JSON.parse(localStorage.getItem('__test_session')))");page.wait_for_timeout(200)
 check('更新登入憑證不重複跳出',not opened(page))
 page.evaluate("document.getElementById('welcomeOtpInput').value='999999';document.getElementById('welcomeEmailInput').value='old@example.test'")
 logout(page)
 check('登出後立即顯示框架登入頁',opened(page))
 check('登出後使用未登入按鈕文字',page.locator('#welcomeGuestText').inner_text()=='先使用，不登入')
 check('登出只登出目前裝置',page.evaluate('window.__logoutTest.logoutScope')=='local')
 check('登出保留原帳號本機薪資與行程',page.evaluate("JSON.parse(localStorage.getItem('meow-work-workspace-v1:account-A')).state.settings.baseSalary===38765 && JSON.parse(localStorage.getItem('meow-work-workspace-v1:account-A')).state.personalEvents.keep.title==='account-A行程'"))
 check('登出回到獨立訪客工作區',page.evaluate("window.__logoutApi.getOwner()==='guest' && window.__logoutApi.getState().settings.baseSalary===222"))
 check('登出後雲端同步保持停用',not page.evaluate('window.__logoutApi.canCloudSync()'))
 check('不沿用上一輪 Email 驗證碼及輸入',page.locator('#welcomeOtpInput').input_value()=='' and page.locator('#welcomeEmailInput').input_value()=='')
 page.screenshot(path=str(OUT/'welcome-after-logout-v114.png'))
 page.close();page=page_for(ctx)
 check('登出未選使用方式就關掉，重開仍可重新登入',opened(page))
 login_google(page)
 check('Google 重新登入成功後關閉登入頁',not opened(page))
 check('重新登入原帳號回到原本工作資料',page.evaluate("window.__logoutApi.getOwner()==='account-A' && window.__logoutApi.getState().settings.baseSalary===38765"))
 check('免費重新登入沒有呼叫雲端工作資料',not any(x in page.evaluate('window.__logoutTest.calls') for x in ['channel','user_sync_state','meow_save_snapshot']))
 check('登入後解除待登入標記',page.evaluate("localStorage.getItem('meow-work-welcome-reauth-v1')") is None)
 page.reload();ready(page);check('重新登入後下次開啟直接使用',not opened(page))
 logout(page);page.locator('#welcomeGuest').click()
 check('登出後仍可選先使用，不登入',not opened(page) and page.evaluate('window.__logoutApi.getOwner()')=='guest')
 page.evaluate('window.__logoutApi.getState().settings.baseSalary=777;window.__logoutApi.changedAndSync()')
 page.reload();ready(page)
 check('選擇訪客後不反覆顯示，且保存訪客資料',not opened(page) and page.evaluate('window.__logoutApi.getState().settings.baseSalary')==777)
 page.evaluate("window.__authCallback('SIGNED_OUT',null)");page.wait_for_timeout(180)
 check('訪客收到重複登出事件不反覆彈出',not opened(page))
 settings(page);page.locator('#showWelcome').click();page.locator('#welcomeEmail').click();page.locator('#welcomeEmailInput').fill('a@example.test');page.locator('#welcomeSendOtp').click();page.locator('#welcomeOtpInput').fill('123456');page.locator('#welcomeVerifyOtp').click()
 page.wait_for_function('window.__logoutApi.getUser() && !document.getElementById("welcomeDialog").open')
 check('Email 再次登入成功後返回 App',not opened(page) and page.evaluate('window.__logoutApi.getOwner()')=='account-A')
 settings(page);page.evaluate('window.__logoutTest.failLogout=true');page.locator('#accountLogout').click();page.wait_for_timeout(180)
 check('登出失敗不假裝登出或顯示新登入頁',not opened(page) and page.evaluate('!!window.__logoutApi.getUser()'))
 check('登出失敗不清除工作資料',page.evaluate('window.__logoutApi.getState().settings.baseSalary')==38765)
 page.evaluate('window.__logoutTest.failLogout=false;window.__logoutTest.muteLogout=true');page.locator('#accountLogout').click();page.wait_for_timeout(180)
 check('沒有 SIGNED_OUT 回呼時仍會顯示登入頁',opened(page) and not page.evaluate('window.__logoutApi.getUser()'))
 ctx.close()
 ctx=context(seed(session=False));page=page_for(ctx)
 check('登入失效時要求重新選登入方式',opened(page) and not page.evaluate('window.__logoutApi.getUser()'))
 check('登入失效仍封存帳號本機工作資料',page.evaluate("JSON.parse(localStorage.getItem('meow-work-workspace-v1:account-A')).state.settings.baseSalary") ==38765)
 ctx.close()
 ctx=context(seed(pending=True));page=page_for(ctx)
 check('有有效登入憑證時移除殘留待登入提示',not opened(page) and page.evaluate("localStorage.getItem('meow-work-welcome-reauth-v1')") is None)
 ctx.close()
 ctx=context();page=page_for(ctx)
 check('第一次使用仍顯示原本框架',opened(page))
 check('保留四周留白與厭世貓圖案',page.locator('#welcomeDialog').evaluate("x=>x.getBoundingClientRect().left>=15 && getComputedStyle(x).borderRadius==='28px'") and page.locator('.welcome-art').evaluate("x=>x.getAttribute('src')==='./assets/welcome-brand-v112.webp'"))
 page.locator('#welcomeGuest').click();page.reload();ready(page)
 check('首次選不登入後不強迫反覆登入',not opened(page))
 ctx.close();check('沒有未處理 JavaScript 例外',not errors);browser.close()
server.shutdown();print(f'{len(results)}/{len(results)} logout/login checks passed')
