"""Regression and contrast checks in fresh signed-out browser contexts. No account/API writes."""
from pathlib import Path
import functools,http.server,socketserver,threading,json,sys,re,hashlib,time,urllib.request
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright
PAGES=['dashboard','calendar','attendance','salary','settings']
BASE='8a1bcdd7e74863718b6d40301ef83d7182e6dca4'
ROOT=Path.cwd();OUT=ROOT/('live-dark-qa' if '--live' in sys.argv else 'dark-qa');OUT.mkdir(exist_ok=True)
CONTRAST=(ROOT/'maintenance/contrast-v76.js').read_text()
FIXTURE={'theme':'light','profile':{'name':'喵星人','avatar':''},'schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-01'},'settings':{'baseSalary':32000,'shiftAllowancePerDay':300,'mealAllowance':2400,'performanceAllowance':1000,'payday':30,'hireDate':'2024-02-01','dailyWorkHours':8,'annualLeaveDays':10},'months':{},'dayStatus':{}}
for day,kind,hours in [(3,'sick',4),(5,'menstrual',2),(7,'personal',3),(9,'annual',8),(11,'overtime',4),(14,'overtime',2),(16,'custom',2)]:FIXTURE['dayStatus'][f'2026-09-{day:02}']={'type':kind,'hours':hours,'note':'測試資料','label':'自訂假'}
FREEZE="const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2026-09-22T04:00:00Z']));}static now(){return new RealDate('2026-09-22T04:00:00Z').getTime();}};"
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
servers=[]
def serve(root):
 srv=socketserver.ThreadingTCPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=srv.serve_forever,daemon=True).start();servers.append(srv);return f'http://127.0.0.1:{srv.server_address[1]}/'

def context(browser,width,url,seed=False):
 ctx=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=1,is_mobile=width<=760,has_touch=width<=760,reduced_motion='reduce',service_workers='block',timezone_id='Asia/Taipei',locale='zh-TW')
 ctx.add_init_script(FREEZE)
 if seed:ctx.add_init_script("localStorage.setItem('meow-work-manual-save-v3',"+json.dumps(json.dumps({'state':FIXTURE},ensure_ascii=False))+');')
 allowed=url.split('?')[0]
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith((allowed,'data:','blob:')) else r.abort())
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url,wait_until='domcontentloaded',timeout=60000)
 page.add_style_tag(content='*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}')
 page.wait_for_function("document.querySelector('.hero-mobile').naturalWidth===901 && document.querySelector('#mobileRestCard img').naturalWidth===676")
 page.evaluate('document.fonts.ready');page.wait_for_timeout(250)
 return ctx,page,errors

def choose(page,tab):page.locator(f'.bottom-nav [data-tab="{tab}"]').click();page.wait_for_timeout(90)
checks=[];pixels=[];failures=[]
live='--live' in sys.argv
if live:
 expected=hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest();URL='https://sonia6891.github.io/https-github.com-facebook-facebook-ios-sdk/?v=76'
 for attempt in range(50):
  try:
   req=urllib.request.Request(URL,headers={'Cache-Control':'no-cache'});actual=hashlib.sha256(urllib.request.urlopen(req,timeout=20).read()).hexdigest()
   if actual==expected:break
  except Exception:pass
  time.sleep(8)
 else:raise RuntimeError('Published HTML has not matched the tested v76 source')
 target=URL
else:
 target=serve(ROOT);before=serve(Path('/tmp/meow-dark-before'))
 # Preserve application logic and all image assets, not just visible layout.
 a=(Path('/tmp/meow-dark-before')/'index.html').read_text();b=(ROOT/'index.html').read_text()
 def norm(x):return x.replace('v=76','v=75').replace('v76','v75')
 assert [norm(x) for x in re.findall(r'<script\b[\s\S]*?</script>',a)]==[norm(x) for x in re.findall(r'<script\b[\s\S]*?</script>',b)]
 for f in ['assets/mobile-hero-clean-v75.png','assets/mobile-rest-card-v75.webp']:
  assert (ROOT/f).read_bytes()==(Path('/tmp/meow-dark-before')/f).read_bytes()
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  for width in [375,390,430]:
   for seeded in [False,True]:
    ctx,page,errors=context(browser,width,target,seeded)
    page.locator('#heroTheme').click();assert page.locator('html').evaluate("e=>e.classList.contains('dark')")
    for tab in PAGES:
     choose(page,tab);rows=page.locator('body').evaluate(CONTRAST);bad=[r for r in rows if r['ratio']<4.5]
     checks.append({'engine':engine,'width':width,'seeded':seeded,'tab':tab,'text_checks':len(rows),'min_ratio':min(r['ratio'] for r in rows),'failures':bad})
     if bad:failures.append({'engine':engine,'width':width,'tab':tab,'seeded':seeded,'contrast':bad})
     image=page.locator('#mobileRestCard img');image.evaluate('i=>i.decode()')
     assert page.locator('#mobileRestCard').count()==1
     assert image.evaluate("i=>i.closest('.page').id")=='page-'+tab
     page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');page.wait_for_timeout(70)
     ib=image.bounding_box();nb=page.locator('.bottom-nav').bounding_box();assert ib['y']+ib['height']<=nb['y']+1
     if width==390 and not seeded:page.screenshot(path=str(OUT/f'{engine}-{tab}-dark-footer.png'))
     page.evaluate('window.scrollTo(0,0)')
     if width==390 and tab=='dashboard':page.screenshot(path=str(OUT/f'{engine}-dashboard-dark-{seeded}.png'),full_page=True)
    choose(page,'dashboard');page.locator('#heroTheme').click();assert not page.locator('html').evaluate("e=>e.classList.contains('dark')")
    assert page.locator('#heroTheme').evaluate("e=>getComputedStyle(e).borderWidth")=='0px'
    with page.expect_file_chooser() as chooser:page.locator('#mobileAvatarButton').click()
    assert not chooser.value.is_multiple()
    assert not errors,errors
    ctx.close()
  if not live:
   # Pixel comparison excludes only the intentionally changed version label.
   for width in [390,1280,1440]:
    for mode in (['light'] if width==390 else ['light','dark']):
     ca,pa,ea=context(browser,width,before);cb,pb,eb=context(browser,width,target)
     if mode=='dark':
      for pg in [pa,pb]:pg.locator('#desktopThemeButton').click()
     for tab in PAGES:
      for pg in [pa,pb]:
       nav='.bottom-nav' if width<=760 else '.side-nav';pg.locator(f'{nav} [data-tab="{tab}"]').click();pg.wait_for_timeout(100)
       pg.evaluate("()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(w.nextNode()){const n=w.currentNode;if(n.textContent.includes('介面 v76'))n.textContent=n.textContent.replace('介面 v76','介面 v75');}}")
       pg.evaluate('window.scrollTo(0,0)')
      fa=OUT/f'base-{engine}-{width}-{mode}-{tab}.png';fb=OUT/f'new-{engine}-{width}-{mode}-{tab}.png'
      pa.screenshot(path=str(fa),full_page=True);pb.screenshot(path=str(fb),full_page=True)
      im1=Image.open(fa).convert('RGB');im2=Image.open(fb).convert('RGB');bounds=None if im1.size==im2.size and ImageChops.difference(im1,im2).getbbox() is None else (ImageChops.difference(im1,im2).getbbox() if im1.size==im2.size else ['size',im1.size,im2.size])
      pixels.append({'engine':engine,'width':width,'mode':mode,'tab':tab,'identical':bounds is None})
      if bounds:failures.append({'pixel_difference':[engine,width,mode,tab,bounds]})
      else:fa.unlink();fb.unlink()
     assert ea==eb,(ea,eb);ca.close();cb.close()
  browser.close()
report={'passed':not failures,'ui_version':76,'live':live,'checks':checks,'pixel_checks':pixels,'failures':failures}
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
assert not failures,failures
for srv in servers:srv.shutdown()
