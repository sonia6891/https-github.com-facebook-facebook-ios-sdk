"""Framed welcome regression tests with mocked auth only; never touches real accounts."""
from pathlib import Path
import json, threading, http.server, functools, os
from playwright.sync_api import sync_playwright
ROOT=Path(os.environ.get('MEOW_ROOT','.')).resolve()
OUT=Path(os.environ.get('MEOW_TEST_OUT','test-results'));OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text()
bridge="window.__frameApi={getState:()=>state,getOwner:()=>localOwner,canCloudSync,handleSignedIn,changedAndSync,setTheme};"
pos=html.rfind('})();');html=html[:pos]+bridge+'\n'+html[pos:]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.split('?')[0] in ['/','/index.html']:
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(html.encode())
  else:super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/'
MOCK=r'''export function createClient(){const t=window.__frameTest;return {
 auth:{getSession:async()=>{await new Promise(r=>setTimeout(r,120));return{data:{session:t.user?{user:t.user}:null}}},onAuthStateChange(fn){window.__authCallback=fn;return{data:{subscription:{unsubscribe(){}}}}},signInWithOAuth:async x=>{t.oauth=x.provider;return{error:null}},signInWithOtp:async()=>({error:null}),verifyOtp:async()=>({error:{message:'test-invalid-code'}}),signOut:async()=>{t.user=null;window.__authCallback?.('SIGNED_OUT',null);return{error:null}}},
 rpc:async(name,args)=>{t.calls.push(name);if(name==='meow_account_access')return{data:{server_now:new Date().toISOString(),entitlement:null},error:null};return{error:{code:'test-unexpected-rpc'}}},
 from(table){const q={select(){return q},eq(){return q},order(){return q},limit:async()=>({data:[],error:null}),maybeSingle:async()=>{t.calls.push(table);return{data:null,error:null}}};return q},
 channel(){t.calls.push('channel');return{on(){return this},subscribe(){return this}}},removeChannel:async()=>{}
 }}'''
results=[];errors=[]
def check(name,value):
 passed=bool(value);results.append({'name':name,'passed':passed});print(('PASS ' if passed else 'FAIL ')+name)
 (OUT/'frame-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 assert passed,name

def opened(page):return page.locator('#welcomeDialog').evaluate('x=>x.open')
def frame(page):return page.locator('#welcomeDialog').evaluate('x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,scroll:x.scrollHeight,client:x.clientHeight,sw:x.scrollWidth,cw:x.clientWidth,radius:getComputedStyle(x).borderRadius}}')
def local_seed(user=False):
 owner='frame-user' if user else 'guest'
 snapshot={'savedAt':'2026-09-22T20:00:00.000Z','owner':owner,'state':{'theme':'light','profile':{'name':'原本喵星人','avatar':''},'schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-03'},'settings':{'baseSalary':38765},'months':{},'dayStatus':{},'personalEvents':{'test':{'id':'test','date':'2026-09-25','start':'10:00','end':'11:00','title':'不要消失的測試行程','kind':'event'}}}}
 return {'meow-work-welcome-v1':'done','meow-work-manual-save-v3':json.dumps(snapshot,ensure_ascii=False),'meow-work-local-owner-v1':owner,'meow-work-theme-v1':'light'}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 def context(seed=None,user=False,apple=False):
  ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,service_workers='block')
  init='window.__frameTest={calls:[],user:'+json.dumps({'id':'frame-user','email':'example@example.test'} if user else None)+'};'
  if seed:init+='if(!localStorage.getItem("__frame_seeded")){for(const [k,v] of Object.entries('+json.dumps(seed)+'))localStorage.setItem(k,v);localStorage.setItem("__frame_seeded","1");}'
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
 def load(ctx,path=''):
  page=ctx.new_page();page.on('dialog',lambda d:d.accept());page.on('pageerror',lambda e:errors.append(str(e)));page.goto(URL+path);page.wait_for_function('window.__frameApi !== undefined');page.wait_for_timeout(350);return page
 ctx=context();page=load(ctx)
 check('首次安裝顯示框架頁',opened(page))
 r=frame(page);check('框架四邊皆有留白，非滿版',r['x']>=15 and r['y']>=15 and r['vw']-r['x']-r['w']>=15 and r['vh']-r['y']-r['h']>=15)
 check('圓角為 28px',r['radius']=='28px')
 check('一般手機高度隨內容縮合，不強行撐滿',r['h']<r['vh']-60)
 check('厭世貓沿用原圖',page.locator('.welcome-art').evaluate("x=>x.complete&&x.naturalWidth===540&&x.getAttribute('src')==='./assets/welcome-brand-v112.webp'"))
 check('沒有假 Apple 登入入口',not page.locator('#welcomeApple').is_visible())
 check('背景頁不能捲動',page.locator('html').evaluate("x=>getComputedStyle(x).overflow==='hidden'"))
 page.screenshot(path=str(OUT/'welcome-frame-v113-390.png'))
 page.locator('#welcomeGuest').click();check('不登入可以關閉框架進 App',not opened(page))
 check('關閉後恢復背景捲動',page.locator('html').evaluate("x=>!x.classList.contains('meow-welcome-open')"))
 page.evaluate("window.__frameApi.getState().settings.baseSalary=38765;window.__frameApi.changedAndSync()")
 page.reload();page.wait_for_function('window.__frameApi !== undefined');page.wait_for_timeout(200)
 check('選過不登入，下次不反覆顯示',not opened(page))
 check('不登入資料重開仍保留',page.evaluate('window.__frameApi.getState().settings.baseSalary')==38765)
 check('不登入不請求工作資料同步',not any(x in page.evaluate('window.__frameTest.calls') for x in ['user_sync_state','meow_save_snapshot','channel']))
 ctx.close()
 for user in [False,True]:
  ctx=context(local_seed(user),user=user);page=load(ctx)
  label='已登入舊用戶' if user else '未登入舊用戶'
  check(label+'更新後也顯示一次',opened(page))
  check(label+'原本薪資與行程保留',page.evaluate("window.__frameApi.getState().settings.baseSalary===38765&&window.__frameApi.getState().personalEvents.test.title==='不要消失的測試行程'"))
  check(label+'工作區未被框架切換',page.evaluate('window.__frameApi.getOwner()')==('frame-user' if user else 'guest'))
  if user:
   check('自動恢復登入不會瞬間關掉框架',opened(page))
   check('已登入時按鈕是返回 App',page.locator('#welcomeGuestText').inner_text()=='返回 App')
   check('免費登入仍沒有啟用雲端',not page.evaluate('window.__frameApi.canCloudSync()') and not any(x in page.evaluate('window.__frameTest.calls') for x in ['user_sync_state','meow_save_snapshot','channel']))
  page.locator('#welcomeGuest').click();page.reload();page.wait_for_function('window.__frameApi !== undefined');page.wait_for_timeout(300)
  check(label+'確認後重開不再跳出',not opened(page))
  check(label+'確認後資料沒有被清除',page.evaluate('window.__frameApi.getState().settings.baseSalary')==38765)
  if not user:
   page.goto(URL+'?welcome=1&keep=test#preserve');page.wait_for_function('window.__frameApi !== undefined')
   check('預覽網址仍能手動打開',opened(page));page.locator('#welcomeGuest').click()
   check('關閉只移除 welcome 參數',page.url.endswith('?keep=test#preserve'))
   page.reload();page.wait_for_function('window.__frameApi !== undefined');check('預覽不造成每次重開都彈出',not opened(page))
   page.locator('[data-tab="settings"]:visible').first.click();page.locator('#showWelcome').click()
   check('設定內仍可隨時查看框架',opened(page));page.keyboard.press('Escape');check('Escape 可關閉且不清資料',not opened(page) and page.evaluate('window.__frameApi.getState().settings.baseSalary')==38765)
  ctx.close()
 ctx=context(apple=True);page=load(ctx)
 check('Apple 設定啟用時才顯示按鈕',page.locator('#welcomeApple').is_visible())
 for w,h in [(320,568),(375,667),(390,844),(430,932),(844,390),(1280,800)]:
  page.set_viewport_size({'width':w,'height':h});r=frame(page)
  check(f'{w}x{h} 框架留白且無水平溢出',r['x']>=15 and r['y']>=15 and r['vh']-r['y']-r['h']>=15 and r['sw']<=r['cw']+1)
  page.locator('#welcomeGuest').scroll_into_view_if_needed()
  check(f'{w}x{h} 不登入按鈕可捲動到達',page.locator('#welcomeGuest').evaluate('x=>{const r=x.getBoundingClientRect(),d=document.getElementById("welcomeDialog").getBoundingClientRect();return r.top>=d.top&&r.bottom<=d.bottom}'))
 page.set_viewport_size({'width':390,'height':620});page.locator('#welcomeEmail').click();page.locator('#welcomeEmailInput').fill('example@example.test');page.locator('#welcomeSendOtp').click();page.locator('#welcomeOtpInput').scroll_into_view_if_needed()
 check('小視窗 Email 表單仍可操作',page.locator('#welcomeOtpInput').is_visible() and frame(page)['sw']<=frame(page)['cw']+1)
 page.locator('#welcomeEmail').click();page.set_viewport_size({'width':390,'height':844});page.evaluate("window.__frameApi.setTheme('dark')");page.locator('#welcomeDialog').evaluate('x=>x.scrollTop=0');page.screenshot(path=str(OUT/'welcome-frame-v113-dark.png'))
 check('深色模式框架仍保留',page.locator('html').evaluate("x=>x.classList.contains('dark')") and frame(page)['radius']=='28px')
 ctx.close();check('流程沒有未處理 JavaScript 例外',not errors)
 browser.close()
server.shutdown();print(f'{len(results)}/{len(results)} framed welcome checks passed')
