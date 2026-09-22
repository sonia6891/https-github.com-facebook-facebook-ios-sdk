"""Read-only regression using synthetic users; blocks account and billing requests."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
import functools,http.server,threading,json,os,sys,base64
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright
BEFORE,AFTER,OUT=map(Path,sys.argv[1:4]);OUT.mkdir(parents=True,exist_ok=True)
PREFIX='/https-github.com-facebook-facebook-ios-sdk/'
TABS=['dashboard','calendar','attendance','salary','settings'];servers=[]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def translate_path(self,path):
  rel=unquote(urlsplit(path).path)
  if rel.startswith(PREFIX):rel=rel[len(PREFIX):]
  return str(Path(self.directory)/rel.lstrip('/'))
 def send_error(self,code,message=None,explain=None):
  if code==404:
   data=(Path(self.directory)/'404.html').read_bytes();self.send_response(404);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  else:super().send_error(code,message,explain)
def serve(root):
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start();servers.append(server)
 return 'http://127.0.0.1:'+str(server.server_address[1])+PREFIX
oldurl,newurl=serve(BEFORE),serve(AFTER)
KEY='meow-work-manual-save-v3'
AVATAR='data:image/svg+xml;base64,'+base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#73554f"/></svg>').decode()
SEED={'profile':{'name':'清理測試','avatar':AVATAR},'schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-03'},'settings':{'baseSalary':32000,'hireDate':'2024-02-29','payday':30,'dailyWorkHours':8,'annualLeaveDays':10},'dayStatus':{'2026-09-06':{'type':'sick','hours':4},'2026-09-15':{'type':'overtime','hours':2}},'months':{},'personalEvents':{'keep-one':{'id':'keep-one','date':'2026-09-25','start':'19:00','end':'20:00','title':'保留既有行程','note':'不可刪除','kind':'event','createdAt':'2026-09-01T00:00:00Z'}}}
FREEZE="{const Original=Date;const at=Original.parse('2026-09-22T14:00:00Z');window.Date=class extends Original{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}};}"
def prepare(browser,url,width,theme):
 ctx=browser.new_context(viewport={'width':width,'height':844},locale='zh-TW',timezone_id='Asia/Taipei',device_scale_factor=1,service_workers='block',reduced_motion='reduce')
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','data:','blob:')) else r.abort())
 state=dict(SEED,theme=theme)
 ctx.add_init_script(FREEZE+'if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-22T14:00:00Z",state:'+json.dumps(state,ensure_ascii=False)+'}));')
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url,wait_until='domcontentloaded');page.wait_for_timeout(300)
 page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}')
 return ctx,page,errors

def tab(page,t):
 nav='.bottom-nav' if page.viewport_size['width']<=760 else '.side-nav'
 page.locator(nav+f' [data-tab="{t}"]').click();page.wait_for_timeout(100);page.evaluate('window.scrollTo({top:0,behavior:"instant"})')
 # Normalize only release-number text for screenshot comparison.
 page.evaluate("() => {for(const e of document.querySelectorAll('*'))for(const n of e.childNodes)if(n.nodeType===3)n.textContent=n.textContent.replace(/介面 v(?:88|89)/g,'介面 vXX')}")
def snapshot(page):
 return page.evaluate("() => ({text:document.querySelector('.page.active').innerText.replace(/介面 v(?:88|89)/g,'介面 vXX'),fields:[...document.querySelectorAll('.page.active input,.page.active select,.page.active textarea')].map(e=>[e.id,e.value,e.checked,e.disabled]),state:JSON.parse(localStorage.getItem('meow-work-manual-save-v3')).state})")
report={'base':'022840b11e3ac83758440cc73b2bbb4b0dd02e8b','checks':[],'runtime':[]}
try:
 with sync_playwright() as p:
  for engine in ['chromium','webkit']:
   browser=getattr(p,engine).launch()
   widths=[320,390,430,1280,1366,1440] if engine=='chromium' else [390]
   for width in widths:
    for theme in ['light','dark']:
     ca,pa,ea=prepare(browser,oldurl,width,theme);cb,pb,eb=prepare(browser,newurl,width,theme)
     for t in TABS:
      tab(pa,t);tab(pb,t)
      assert snapshot(pa)==snapshot(pb),(engine,width,theme,t,'data or interface changed')
      a=OUT/f'{engine}-{width}-{theme}-{t}-before.png';b=OUT/f'{engine}-{width}-{theme}-{t}-after.png'
      pa.screenshot(path=str(a),full_page=True);pb.screenshot(path=str(b),full_page=True)
      ia=Image.open(a).convert('RGB');ib=Image.open(b).convert('RGB');assert ia.size==ib.size,(width,theme,t,'layout size changed')
      diff=ImageChops.difference(ia,ib);hist=diff.histogram();maxdiff=max(i%256 for i,v in enumerate(hist) if v);changed=sum(v for i,v in enumerate(hist) if i%256)
      assert maxdiff<=1 and changed<ia.width*ia.height*.01,(engine,width,theme,t,'visible regression',diff.getbbox(),maxdiff,changed)
      if width<=760:
       assert pb.locator('#mobileRestCard').count()==1
       assert pb.locator('#page-'+t+' #mobileRestCard img').evaluate('i=>i.complete&&i.naturalWidth===676')
      report['checks'].append({'engine':engine,'width':width,'theme':theme,'page':t,'data_equal':True,'pixels_identical':diff.getbbox() is None,'max_channel_difference':maxdiff})
     assert ea==eb,(ea,eb)
     ca.close();cb.close()
   ctx,page,errs=prepare(browser,newurl,390,'light');tab(page,'settings')
   assert page.locator('#heroAvatar').get_attribute('src')==AVATAR
   with page.expect_file_chooser() as f:page.locator('#mobileAvatarButton').click()
   assert f.value.element.get_attribute('id')=='avatarInput'
   page.locator('#settingHireDate').click();page.locator('#workDateYear').select_option('2025');page.locator('#workDateMonth').select_option('9')
   assert page.locator('#workDateDialog').evaluate('d=>d.open');page.locator('#workDateDay').select_option('3')
   assert not page.locator('#workDateDialog').evaluate('d=>d.open')
   tab(page,'attendance');assert '保留既有行程' in page.locator('#itineraryUpcomingList').inner_text()
   page.locator('#addItinerary').click();page.locator('#eventDate').fill('2026-09-30');page.locator('#eventStart').fill('19:00');page.locator('#eventEnd').fill('20:00');page.locator('#eventNote').fill('清理後新增測試');page.locator('#saveEvent').click()
   if page.locator('#conflictDialog').evaluate('d=>d.open'):page.locator('#conflictKeep').click()
   assert '清理後新增測試' in page.locator('#itineraryUpcomingList').inner_text()
   page.reload(wait_until='domcontentloaded');page.wait_for_timeout(300);tab(page,'attendance');assert '清理後新增測試' in page.locator('#itineraryUpcomingList').inner_text()
   assert '保留既有行程' in page.locator('#itineraryUpcomingList').inner_text()
   page.goto(newurl+'missing/nested/path?probe=1&code=synthetic#token-test',wait_until='domcontentloaded');page.wait_for_url(newurl+'?probe=1&code=synthetic#token-test')
   assert page.evaluate("JSON.parse(localStorage.getItem('meow-work-manual-save-v3')).state.personalEvents['keep-one'].title")=='保留既有行程'
   assert not errs,errs
   report['runtime'].append({'engine':engine,'avatar_picker':True,'date_selection':True,'event_write_and_reload':True,'fallback_query_hash':True,'retained_user_data':True})
   ctx.close();browser.close()
 m0=json.loads((BEFORE/'manifest.webmanifest').read_text());m1=json.loads((AFTER/'manifest.webmanifest').read_text())
 assert m1['id']==PREFIX+'?v=13' and m1['start_url']=='./' and m1['scope']==m0['scope']
 for f in ['assets/mobile-hero-clean-v75.png','assets/mobile-rest-card-v75.webp','workcat-home-v12.png','app-icon-512.jpg']:
  assert (BEFORE/f).read_bytes()==(AFTER/f).read_bytes()
 report.update(passed=True,live_asset_hashes_identical=True,manifest_identity_preserved=True)
 print(json.dumps({'passed':True,'checks':len(report['checks']),'runtime':report['runtime'],'pixels_identical':all(x['pixels_identical'] for x in report['checks'])},ensure_ascii=False))
finally:
 (OUT/'test-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 for server in servers:server.shutdown()
