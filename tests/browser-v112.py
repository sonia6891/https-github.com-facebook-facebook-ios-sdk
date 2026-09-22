"""Browser integration checks. Auth/entitlement responses are deterministic mocks; no payments or real user sessions."""
from pathlib import Path
import json, re, threading, http.server, functools, os
from playwright.sync_api import sync_playwright
ROOT=Path(os.environ.get('MEOW_ROOT','.')).resolve()
OUT=Path(os.environ.get('MEOW_TEST_OUT','test-results'));OUT.mkdir(parents=True,exist_ok=True)
api="""window.__meowApi={getState:()=>state,canCloudSync,currentPlan,loadEntitlement,handleSignedIn,handleSignedOut,saveAccountState,loadAccountState,changedAndSync,setTheme,getOwner:()=>localOwner,getCloud:()=>cloudStatus};"""
html=(ROOT/'index.html').read_text()
ix=html.rfind('})();'); html=html[:ix]+api+'\n'+html[ix:]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.split('?')[0] in ['/','/index.html']:
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/'
MOCK=r'''export function createClient(){const t=window.__meowTest;return {
 auth:{getSession:async()=>({data:{session:t.session||null}}),onAuthStateChange(fn){window.__authCallback=fn;return{data:{subscription:{unsubscribe(){}}}}},signInWithOAuth:async x=>{t.oauth=x.provider;return{error:null}},signInWithOtp:async()=>({error:null}),verifyOtp:async()=>({error:{message:'test-invalid-code'}}),signOut:async()=>{t.session=null;window.__authCallback?.('SIGNED_OUT',null);return{error:null}}},
 rpc:async(name,args)=>{t.calls.push(name);if(name==='meow_account_access'){if(t.failAccess)return{error:{code:'offline'}};return{data:{server_now:new Date().toISOString(),entitlement:t.ent||null},error:null}}if(name==='meow_save_snapshot'){if(t.conflict)return{error:{code:'40001'}};t.cloudRow={payload:args.p_payload,updated_at:new Date().toISOString()};return{data:{updated_at:t.cloudRow.updated_at},error:null}}return{error:{code:'unknown'}}},
 from(table){const q={select(){return q},eq(){return q},order(){return q},limit:async()=>({data:[],error:null}),maybeSingle:async()=>{t.calls.push(table);return{data:table==='user_sync_state'?t.cloudRow||null:null,error:null}}};return q},
 channel(){t.calls.push('channel');return{on(){return this},subscribe(){return this}}},removeChannel:async()=>{}
 }}'''
def assertion(value,details=None):
 if not value:raise AssertionError(details or 'condition failed')
results=[]
def check(name,fn):
 try:fn();results.append({'name':name,'passed':True});print('PASS',name)
 except Exception as e:results.append({'name':name,'passed':False,'error':str(e)});print('FAIL',name,str(e));raise
 finally:(OUT/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox']}
 browser=p.chromium.launch(**launch)
 def context(seed=None,apple=False):
  ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,service_workers='block')
  init='window.__meowTest={calls:[],session:null,ent:null};window.__providerApple='+str(apple).lower()+';'
  if seed:init+='\n'+seed
  ctx.add_init_script(init)
  def route(r):
   url=r.request.url
   if url.startswith(URL):return r.continue_()
   if 'esm.sh/' in url:return r.fulfill(status=200,content_type='application/javascript',body=MOCK)
   if '/auth/v1/settings' in url:return r.fulfill(status=200,content_type='application/json',body=json.dumps({'external':{'google':True,'apple':apple}}))
   if '/functions/v1/billing-config' in url:return r.fulfill(status=200,content_type='application/json',body='{"configured":false}')
   if 'tesseract' in url:return r.fulfill(status=200,content_type='application/javascript',body='window.Tesseract={};')
   return r.abort()
  ctx.route('**/*',route);return ctx
 ctx=context();page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 page.goto(URL);page.wait_for_function('window.__meowApi !== undefined');page.wait_for_timeout(150)
 check('首次開啟顯示歡迎頁',lambda:assertion(page.locator('#welcomeDialog').evaluate('(x)=>x.open')))
 check('厭世貓品牌圖片已載入',lambda:assertion(page.locator('.welcome-art').evaluate('(x)=>x.complete&&x.naturalWidth===540')))
 check('Apple 未設定時不顯示假登入按鈕',lambda:assertion(not page.locator('#welcomeApple').is_visible()))
 check('歡迎頁沒有水平溢出',lambda:assertion(page.locator('#welcomeDialog').evaluate('(x)=>x.scrollWidth<=x.clientWidth+1')))
 page.screenshot(path=str(OUT/'welcome-live-layout.png'),full_page=True)
 page.locator('#welcomeEmail').click();check('Email 表單可展開',lambda:assertion(page.locator('#welcomeEmailInput').is_visible()))
 page.locator('#welcomeEmail').click();page.locator('#welcomeGuest').click()
 check('不登入可進入 App',lambda:assertion(not page.locator('#welcomeDialog').evaluate('(x)=>x.open')))
 page.evaluate('window.__meowApi.getState().settings.baseSalary=38765;window.__meowApi.changedAndSync()')
 page.reload();page.wait_for_function('window.__meowApi !== undefined');page.wait_for_timeout(200)
 check('不登入資料重開仍保留',lambda:assertion(page.evaluate('window.__meowApi.getState().settings.baseSalary')==38765))
 check('選過使用方式不反覆彈出',lambda:assertion(not page.locator('#welcomeDialog').evaluate('(x)=>x.open')))
 check('不登入未請求雲端工作資料',lambda:assertion('user_sync_state' not in page.evaluate('window.__meowTest.calls')))
 page.evaluate("window.__meowApi.setTheme('dark')");page.reload();page.wait_for_function('window.__meowApi !== undefined')
 check('重新開啟保留深色選擇',lambda:assertion(page.locator('html').evaluate("x=>x.classList.contains('dark')")))
 page.evaluate("window.__meowApi.setTheme('light')");page.reload();page.wait_for_function('window.__meowApi !== undefined')
 check('重新開啟保留淺色選擇',lambda:assertion(not page.locator('html').evaluate("x=>x.classList.contains('dark')")))
 page.evaluate("window.__meowApi.handleSignedIn({id:'account-A',email:'a@example.test'})")
 check('免費登入沒有啟動工作資料同步',lambda:assertion(not any(x in page.evaluate('window.__meowTest.calls') for x in ['user_sync_state','meow_save_snapshot','channel'])))
 check('確認後訪客資料帶入帳號但不丟失',lambda:assertion(page.evaluate('window.__meowApi.getState().settings.baseSalary')==38765))
 page.evaluate('window.__meowApi.getState().settings.baseSalary=41000;window.__meowApi.changedAndSync()')
 page.evaluate("window.__meowApi.handleSignedIn({id:'account-B',email:'b@example.test'})")
 check('切換帳號不沿用上一帳號工作資料',lambda:assertion(page.evaluate('window.__meowApi.getState().settings.baseSalary')==0))
 page.evaluate("window.__meowApi.handleSignedIn({id:'account-A',email:'a@example.test'})")
 check('回到原帳號可取回本機工作區',lambda:assertion(page.evaluate('window.__meowApi.getState().settings.baseSalary')==41000))
 page.evaluate("window.__meowTest.ent={plan:'pro',status:'trialing',pro_until:new Date(Date.now()+3600000).toISOString()};window.__meowApi.loadEntitlement()")
 check('有效 Pro 尚未同意也不自行上傳',lambda:assertion(not page.evaluate('window.__meowApi.canCloudSync()')))
 page.locator('[data-tab="settings"]:visible').first.click();page.locator('#toggleCloudSync').click();page.wait_for_timeout(600)
 check('有效 Pro 明確啟用後才同步',lambda:assertion(page.evaluate('window.__meowApi.canCloudSync()') and 'meow_save_snapshot' in page.evaluate('window.__meowTest.calls')))
 page.evaluate('window.__meowTest.ent.pro_until=new Date(Date.now()-1000).toISOString();window.__meowApi.loadEntitlement()')
 check('到期停止雲端資格',lambda:assertion(not page.evaluate('window.__meowApi.canCloudSync()')))
 check('到期保留本機薪資資料',lambda:assertion(page.evaluate('window.__meowApi.getState().settings.baseSalary')==41000))
 page.locator('#showWelcome').click();check('既有使用者可從設定預覽歡迎頁',lambda:assertion(page.locator('#welcomeDialog').evaluate('(x)=>x.open')))
 page.locator('#welcomeGuest').click()
 check('過程沒有 JavaScript 未處理例外',lambda:assertion(not errors,errors))
 ctx.close()
 # Enabled-provider layout is verified separately, not a claim of production Apple OAuth configuration.
 ctx=context(apple=True);page=ctx.new_page();page.goto(URL);page.wait_for_selector('#welcomeApple',state='visible')
 page.screenshot(path=str(OUT/'welcome-apple-layout.png'),full_page=True)
 check('Provider 已設定才顯示 Apple 入口',lambda:assertion(page.locator('#welcomeApple').is_visible()))
 for width in [320,375,430]:
  page.set_viewport_size({'width':width,'height':812});check(f'{width}px 無橫向溢出',lambda:assertion(page.locator('#welcomeDialog').evaluate('(x)=>x.scrollWidth<=x.clientWidth+1')))
 ctx.close();browser.close()
server.shutdown();print(f'{len(results)}/{len(results)} browser checks passed')
