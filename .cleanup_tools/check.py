"""Regression tests: isolated signed-out browser profiles; no customer or billing writes."""
from pathlib import Path
import json,functools,http.server,threading,sys,hashlib
from playwright.sync_api import sync_playwright
before,after,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
PREFIX='/https-github.com-facebook-facebook-ios-sdk/'
SERVERS=[]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if not self.path.startswith(PREFIX):return super().do_GET()
  self.path='/'+self.path[len(PREFIX):]
  return super().do_GET()
 def send_error(self,code,message=None,explain=None):
  if code==404:
   data=(Path(self.directory)/'404.html').read_bytes();self.send_response(404);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
  else:super().send_error(code,message,explain)
def serve(root):
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)))
 threading.Thread(target=server.serve_forever,daemon=True).start();SERVERS.append(server)
 return f'http://127.0.0.1:{server.server_address[1]}'+PREFIX
oldurl,newurl=serve(before),serve(after)
SEED={'theme':'light','profile':{'name':'清理驗證','avatar':''},'schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-03'},'settings':{'baseSalary':32000,'payday':30,'hireDate':'2024-02-01','annualLeaveDays':10,'dailyWorkHours':8},'dayStatus':{'2026-09-10':{'type':'sick','hours':4},'2026-09-12':{'type':'overtime','hours':2}},'personalEvents':{'qa-existing':{'id':'qa-existing','date':'2026-09-23','start':'14:00','end':'15:00','kind':'event','title':'保留既有行程','note':'測試資料'}},'months':{}}
KEY='meow-work-manual-save-v3'
FREEZE="""(()=>{const RealDate=Date;const ms=new RealDate('2026-09-22T04:00:00Z').getTime();class FixedDate extends RealDate{constructor(...a){super(...(a.length?a:[ms]));}static now(){return ms;}}window.Date=FixedDate;})();"""
def setup(browser,width,theme,url):
 ctx=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=1,locale='zh-TW',timezone_id='Asia/Taipei',reduced_motion='reduce',service_workers='block')
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','data:','blob:')) else r.abort())
 state=dict(SEED,theme=theme)
 ctx.add_init_script(FREEZE+'\nif(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-22T04:00:00Z",state:'+json.dumps(state,ensure_ascii=False)+'}));')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url,wait_until='domcontentloaded');page.wait_for_timeout(350)
 page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}')
 return ctx,page,errors
SNAP="""()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getClientRects().length&&!['SCRIPT','STYLE','SVG','PATH','USE','SPAN'].includes(e.tagName)).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,id:e.id,cls:typeof e.className==='string'?e.className:'',rect:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100),text:Array.from(e.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim().replace(/介面 v\\d+/g,'介面 VERSION')).join(''),color:s.color,background:s.backgroundColor,display:s.display,font:s.fontSize}})"""
def go(pg,tab,width):
 pg.locator(('.bottom-nav' if width<=760 else '.side-nav')+f' [data-tab="{tab}"]').click();pg.wait_for_timeout(130);pg.evaluate("window.scrollTo({top:0,behavior:'instant'})");pg.wait_for_timeout(70)
report={'passed':False,'cases':[]}
with sync_playwright() as pw:
 for engine in ['chromium','webkit']:
  browser=getattr(pw,engine).launch(headless=True)
  for width in [390,760,1366]:
   for theme in ['light','dark']:
    ca,pa,ea=setup(browser,width,theme,oldurl);cb,pb,eb=setup(browser,width,theme,newurl)
    for tab in ['dashboard','calendar','attendance','salary','settings']:
     go(pa,tab,width);go(pb,tab,width)
     va,vb=pa.evaluate(SNAP),pb.evaluate(SNAP)
     if va!=vb:
      (out/'mismatch.json').write_text(json.dumps({'before':va,'after':vb,'case':[engine,width,theme,tab]},ensure_ascii=False,indent=2))
     assert va==vb,(engine,width,theme,tab,'visible layout changed')
     if width==390 and tab=='dashboard':
      pa.screenshot(path=str(out/f'{engine}-{theme}-before.png'));pb.screenshot(path=str(out/f'{engine}-{theme}-after.png'))
     for pg in [pa,pb]:
      pg.wait_for_function("Array.from(document.images).filter(i=>i.getClientRects().length).every(i=>i.complete&&i.naturalWidth>0)")
     if width<=760:
      assert pb.locator('#mobileRestCard').count()==1
      assert pb.locator('#mobileRestCard img').evaluate('i=>i.complete&&i.naturalWidth===676')
     report['cases'].append({'browser':engine,'width':width,'theme':theme,'page':tab,'identical_layout_and_text':True,'images_loaded':True})
    assert ea==eb,(ea,eb)
    assert not eb,eb
    stored=pb.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).state',KEY)
    assert stored['personalEvents']==SEED['personalEvents']
    assert stored['dayStatus']==SEED['dayStatus']
    assert stored['settings']['hireDate']==SEED['settings']['hireDate']
    if width==390 and theme=='light':
     go(pb,'attendance',width);pb.locator('#addItinerary').click()
     pb.locator('#eventDate').fill('2026-10-04');pb.locator('#eventStart').fill('10:00');pb.locator('#eventEnd').fill('11:00');pb.locator('#eventNote').fill('清理後新增測試')
     pb.locator('#saveEvent').click()
     if pb.locator('#conflictDialog').evaluate('d=>d.open'):pb.locator('#conflictKeep').click()
     pb.reload(wait_until='domcontentloaded');pb.wait_for_timeout(250);go(pb,'attendance',width)
     assert pb.locator('#itineraryUpcomingList').inner_text().find('清理後新增測試')>=0
     assert pb.locator('#itineraryUpcomingList').inner_text().find('保留既有行程')>=0
    ca.close();cb.close()
  c,p,e=setup(browser,390,'light',newurl)
  suffix='?payment=return&test=preserve#qa-fragment'
  p.goto(newurl+'old/nested/path'+suffix,wait_until='domcontentloaded');p.wait_for_url(newurl+suffix)
  assert p.url==newurl+suffix
  assert p.locator('#page-dashboard').count()==1
  assert p.evaluate('(key)=>!!JSON.parse(localStorage.getItem(key)).state.personalEvents["qa-existing"]',KEY)
  c.close();browser.close()
for name in ['manifest.webmanifest','workcat-home-v12.png','app-icon-512.jpg','assets/mobile-hero-clean-v75.png','assets/mobile-rest-card-v75.webp']:
 assert (before/name).read_bytes()==(after/name).read_bytes(),name
for name in ['app-icon-180.png','apple-touch-icon-v3.png','icon.svg','mobile-rest-card-v1.jpg']:assert not (after/name).exists()
report.update(passed=True,preserved_local_data=True,event_add_and_reload_passed=True,fallback_query_hash_preserved=True,manifest_and_artwork_unchanged=True,index_sha256=hashlib.sha256((after/'index.html').read_bytes()).hexdigest())
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('PASS',len(report['cases']),'layout/image cases, stored-data preservation, event save/reload, fallback URLs')
for srv in SERVERS:srv.shutdown()
