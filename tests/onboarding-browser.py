"""Real Chromium interaction tests with mocked identity/billing. Never charges or contacts a user's account."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
import functools,json,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',8765),functools.partial(Quiet,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:8765/'
MODULE='''
const m=window.__mock={calls:[],entitlement:null,cloud:null,callback:null,realtime:null};
const session=()=>{const id=localStorage.getItem('mock-session');return id?{user:{id,email:id+'@example.test'},access_token:'synthetic-token'}:null};
window.__switchUser=id=>{if(id)localStorage.setItem('mock-session',id);else localStorage.removeItem('mock-session');m.callback?.(id?'SIGNED_IN':'SIGNED_OUT',session())};
const client={
 auth:{onAuthStateChange(cb){m.callback=cb;return{data:{subscription:{unsubscribe(){}}}}},async getSession(){return{data:{session:session()},error:null}},async signInWithOAuth(options){m.provider=options.provider;window.__switchUser('A');return{data:{},error:null}},async signOut(){window.__switchUser(null);return{error:null}},async signInWithOtp(){return{data:{},error:null}},async verifyOtp(){window.__switchUser('E');return{data:{session:session()},error:null}}},
 from(table){m.calls.push(table);let row=null;const q={select(){return q},eq(){return q},order(){return q},limit(){return q},update(v){row=v;return q},insert(v){row=v;return q},async maybeSingle(){return{data:table==='user_entitlements'?m.entitlement:m.cloud,error:null}},then(resolve,reject){if(row)m.cloud=row;return Promise.resolve({data:row?[{updated_at:row.updated_at}]:[],error:null}).then(resolve,reject)}};return q},
 channel(){m.calls.push('realtime');const q={on(event,filter,cb){m.realtime=cb;return q},subscribe(cb){if(cb)cb('SUBSCRIBED');return q}};return q},async removeChannel(){m.realtime=null}
};export const createClient=()=>client;
'''
results=[]
def passed(name):results.append(name);print('PASS '+name,flush=True)
def mock(route):
 url=route.request.url
 if url.startswith(BASE):return route.continue_()
 if 'esm.sh/' in url:return route.fulfill(status=200,content_type='application/javascript',headers={'Access-Control-Allow-Origin':'*'},body=MODULE)
 if '/auth/v1/settings' in url:return route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='{"external":{"google":true,"apple":false,"email":true}}')
 if '/functions/v1/billing-config' in url:return route.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='{"configured":false}')
 if 'tesseract' in url:return route.fulfill(status=200,content_type='application/javascript',body='')
 return route.abort()
def setup(browser,width=390,height=844,sw='block'):
 context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=width<600,has_touch=width<600,service_workers=sw)
 context.route('**/*',mock);page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
 return context,page,errors
def visit(page,path=''):
 page.goto(BASE+path,wait_until='domcontentloaded');page.wait_for_function('!!window.__mock');page.wait_for_timeout(150)
def tab(page,name):page.locator('[data-tab="'+name+'"]:visible').first.click()
def salary(page):return page.evaluate("JSON.parse(localStorage.getItem('meow-work-manual-save-v3')).state.settings.baseSalary")
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  for width,height in [(320,568),(390,844),(430,932),(800,1000),(1280,900)]:
   context,page,errors=setup(browser,width,height);visit(page)
   expect(page.locator('#welcomeScreen')).to_be_visible();expect(page.locator('#welcomeApple')).to_be_disabled()
   assert page.locator('#welcomeScreen').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
   assert page.locator('.welcome-art img').evaluate('(e)=>e.complete&&e.naturalWidth>0')
   expect(page.locator('#welcomeOtpForm')).to_be_hidden()
   page.screenshot(path=str(OUT/f'welcome-{width}.png'))
   assert not errors,errors;passed(f'{width}px welcome renders brand asset and stays within viewport')
   context.close()
  context,page,errors=setup(browser);visit(page)
  page.locator('#welcomeGuest').click();expect(page.locator('#welcomeScreen')).to_be_hidden()
  assert page.evaluate("localStorage.getItem('meow-work-welcome-v1')")=='done'
  tab(page,'salary');page.locator('#salaryBase').fill('42000');page.locator('#salaryBase').blur();assert salary(page)==42000
  assert 'user_sync_state' not in page.evaluate('window.__mock.calls')
  passed('guest edits save to the actual browser storage without cloud calls')
  tab(page,'settings');page.locator('#themeDark').click();page.reload(wait_until='domcontentloaded');page.wait_for_function('!!window.__mock')
  expect(page.locator('#welcomeScreen')).to_be_hidden();assert salary(page)==42000
  assert page.locator('html').evaluate("e=>e.classList.contains('dark')")
  passed('full reload keeps guest data, completed welcome and selected theme')
  tab(page,'settings');page.locator('#themeLight').click();page.locator('#showWelcome').click();expect(page.locator('#welcomeScreen')).to_be_visible()
  page.locator('#welcomeClosePreview').click();assert salary(page)==42000
  visit(page,'?welcome=1');expect(page.locator('#welcomeScreen')).to_be_visible();assert salary(page)==42000
  passed('settings and query preview reopen welcome without clearing data')
  page.locator('#welcomeGoogle').click();page.wait_for_function("localStorage.getItem('meow-work-workspace-owner-v1')==='A'")
  page.wait_for_timeout(200);expect(page.locator('#welcomeScreen')).to_be_hidden();tab(page,'settings')
  assert salary(page)==42000;assert 'user_sync_state' not in page.evaluate('window.__mock.calls')
  expect(page.locator('#cloudProtection')).to_contain_text('免費版')
  assert page.evaluate("JSON.parse(localStorage.getItem('meow-work-workspace-v1:guest')).state.settings.baseSalary")==42000
  passed('Google UI callback checks free plan, preserves guest copy and does not sync')
  page.evaluate("window.__switchUser('B')");page.wait_for_function("localStorage.getItem('meow-work-workspace-owner-v1')==='B'");assert salary(page)==0
  page.evaluate("window.__switchUser('A')");page.wait_for_function("localStorage.getItem('meow-work-workspace-owner-v1')==='A'");assert salary(page)==42000
  passed('A to B to A restores separate local workspaces')
  page.evaluate("window.__mock.entitlement={plan:'pro',status:'active',pro_until:new Date(Date.now()+6000).toISOString()};window.__switchUser('A')")
  expect(page.locator('#cloudModeState')).to_contain_text('尚未啟用')
  assert 'user_sync_state' not in page.evaluate('window.__mock.calls')
  page.locator('#cloudBackupNow').click();page.wait_for_function("window.__mock.calls.includes('user_sync_state')")
  expect(page.locator('#cloudProtection')).to_contain_text('已同步')
  passed('valid mocked Pro starts work-data access only after explicit consent')
  page.wait_for_timeout(6500);expect(page.locator('#cloudProtection')).to_contain_text('暫停')
  before=page.evaluate("window.__mock.calls.filter(x=>x==='user_sync_state').length")
  tab(page,'salary');page.locator('#salaryBase').fill('43000');page.locator('#salaryBase').blur();page.wait_for_timeout(500)
  assert salary(page)==43000;assert before==page.evaluate("window.__mock.calls.filter(x=>x==='user_sync_state').length")
  passed('expiry stops automatic cloud writes while local editing continues')
  assert not errors,errors;context.close()
  context,page,errors=setup(browser);visit(page)
  page.locator('#welcomeEmailDetails summary').click();page.locator('#welcomeEmail').fill('test@example.test');page.locator('#welcomeEmailForm button').click()
  expect(page.locator('#welcomeOtpForm')).to_be_visible();page.locator('#welcomeOtp').fill('123456');page.locator('#welcomeOtpForm button[type=submit]').click()
  expect(page.locator('#welcomeScreen')).to_be_hidden();assert 'user_sync_state' not in page.evaluate('window.__mock.calls')
  passed('email six-digit code UI uses existing auth flow without starting cloud sync')
  assert not errors,errors;context.close()
  context,page,errors=setup(browser,sw='allow');visit(page)
  page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('!!navigator.serviceWorker.controller');page.wait_for_timeout(500)
  if page.locator('#welcomeScreen').is_visible():page.locator('#welcomeGuest').click()
  tab(page,'salary');page.locator('#salaryBase').fill('47000');page.locator('#salaryBase').blur();page.wait_for_timeout(200)
  keys=page.evaluate("caches.open('meow-work-pwa-v112').then(c=>c.keys()).then(rs=>rs.map(r=>r.url))")
  assert keys and all(url.startswith(BASE) for url in keys),keys
  context.set_offline(True);page.reload(wait_until='domcontentloaded');page.wait_for_timeout(400)
  assert salary(page)==47000;expect(page.locator('#welcomeScreen')).to_be_hidden()
  passed('offline shell reload preserves local data and caches no external API responses')
  context.close();browser.close()
finally:
 server.shutdown();(OUT/'browser-results.json').write_text(json.dumps({'passed':len(results),'cases':results,'mode':'real Chromium; mocked identity/entitlement, no real payment or user login'},ensure_ascii=False,indent=2))
print(f'Browser scenarios: {len(results)} passed.')
