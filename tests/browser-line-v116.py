"""Google + LINE account-required login regression test. OAuth is mocked; no real accounts or payments."""
from pathlib import Path
import json, threading, http.server, functools, os
from playwright.sync_api import sync_playwright

ROOT=Path(os.environ.get('MEOW_ROOT','.')).resolve()
OUT=Path(os.environ.get('MEOW_TEST_OUT','test-results'));OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text(encoding='utf-8')
bridge="window.__lineApi={currentPlan,canCloudSync,getOwner:()=>localOwner};"
pos=html.rfind('})();');html=html[:pos]+bridge+'\n'+html[pos:]

class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path.split('?')[0] in ['/','/index.html']:
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode())
  else: super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/'

MOCK=r'''export function createClient(){const t=window.__lineTest;return {
 auth:{
  getSession:async()=>({data:{session:t.user?{user:t.user}:null}}),
  onAuthStateChange(fn){window.__authCallback=fn;return{data:{subscription:{unsubscribe(){}}}}},
  signInWithOAuth:async x=>{t.oauth.push(x);return{error:null}},
  signInWithOtp:async()=>({error:null}),verifyOtp:async()=>({error:{message:'disabled-in-public-ui'}}),
  signOut:async()=>{t.user=null;window.__authCallback?.('SIGNED_OUT',null);return{error:null}}
 },
 rpc:async(name,args)=>{t.calls.push(name);if(name==='meow_account_access')return{data:{server_now:new Date().toISOString(),entitlement:null},error:null};return{data:null,error:null}},
 from(table){const q={select(){return q},eq(){return q},order(){return q},limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:null,error:null})};return q},
 channel(){return{on(){return this},subscribe(){return this}}},removeChannel:async()=>{}
}}'''

results=[];errors=[]
def check(name,value):
 passed=bool(value);results.append({'name':name,'passed':passed});print(('PASS ' if passed else 'FAIL ')+name)
 (OUT/'line-login-v116.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 assert passed,name
def opened(page): return page.locator('#welcomeDialog').evaluate('x=>x.open')

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 def context(user=None):
  ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
  ctx.add_init_script('window.__lineTest={oauth:[],calls:[],user:'+json.dumps(user)+'};')
  def route(r):
   u=r.request.url
   if u.startswith(URL): return r.continue_()
   if 'esm.sh/' in u: return r.fulfill(status=200,content_type='application/javascript',body=MOCK)
   if '/functions/v1/billing-config' in u: return r.fulfill(status=200,content_type='application/json',body='{"configured":false}')
   if 'tesseract' in u: return r.fulfill(status=200,content_type='application/javascript',body='window.Tesseract={};')
   return r.abort()
  ctx.route('**/*',route);return ctx
 def page_for(ctx):
  page=ctx.new_page();page.on('dialog',lambda d:d.accept());page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL);page.wait_for_function('window.__lineApi');page.wait_for_timeout(1200);print('PAGE_ERRORS',errors);return page

 ctx=context();page=page_for(ctx)
 check('未登入時一定顯示登入框',opened(page))
 check('公開登入頁沒有訪客入口',page.locator('#welcomeGuest').count()==0)
 check('公開登入頁沒有 Email 入口',page.locator('#welcomeEmail').count()==0)
 check('Google 登入按鈕存在',page.locator('#welcomeGoogle').is_visible())
 check('LINE 登入按鈕存在',page.locator('#welcomeLine').is_visible())
 page.locator('#welcomeGoogle').click();page.wait_for_timeout(50)
 check('Google 使用 google provider',page.evaluate("window.__lineTest.oauth.at(-1).provider")=='google')
 page.locator('#welcomeLine').click();page.wait_for_timeout(50)
 check('LINE 使用 custom:line provider',page.evaluate("window.__lineTest.oauth.at(-1).provider")=='custom:line')
 check('LINE 要求 openid profile scopes',page.evaluate("window.__lineTest.oauth.at(-1).options.scopes")=='openid profile')
 ctx.close()

 user={'id':'acct-1','email':'example@example.test'}
 ctx=context(user);page=page_for(ctx)
 check('已有有效登入狀態重開不跳登入框',not opened(page))
 check('免費帳號方案仍是 Free',page.evaluate("window.__lineApi.currentPlan()")=='free')
 check('免費帳號沒有雲端同步資格',not page.evaluate("window.__lineApi.canCloudSync()"))
 # Simulate explicit logout.
 page.evaluate("window.__lineTest.user=null;window.__authCallback('SIGNED_OUT',null)")
 page.wait_for_timeout(300)
 check('主動登出後再次顯示登入框',opened(page))
 page.reload();page.wait_for_function('window.__lineApi');page.wait_for_timeout(1200)
 check('登出後重開仍要求登入',opened(page))
 ctx.close()
 browser.close()

server.shutdown()
print(f'{len(results)}/{len(results)} LINE login checks passed')
