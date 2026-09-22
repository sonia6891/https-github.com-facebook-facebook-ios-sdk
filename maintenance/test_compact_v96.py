"""Measure mobile space savings and verify edit gating using signed-out synthetic profiles only."""
from pathlib import Path
import os,sys,json,datetime,hashlib,http.server,functools,threading,urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image,ImageChops
before,after,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
servers=[]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def serve(root):
 s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)));threading.Thread(target=s.serve_forever,daemon=True).start();servers.append(s)
 return f'http://127.0.0.1:{s.server_address[1]}/'
oldurl=serve(before);live=os.environ.get('LIVE_URL','');newurl=live or serve(after)
expected=hashlib.sha256((after/'index.html').read_bytes()).hexdigest()
if live:
 with urllib.request.urlopen(urllib.request.Request(live,headers={'Cache-Control':'no-cache'}),timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==expected
KEY='meow-work-manual-save-v3'
seed={'theme':'light','schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-01','rotation':{'startDate':'2026-09-01','sequence':['early','early','middle','middle','night','night','off','off']}},'settings':{},'months':{},'dayStatus':{},'personalEvents':{}}
report={'version':96,'live_url':live,'source_sha256':expected,'cases':[]}
def go(pg,tab,w):
 pg.locator(('.bottom-nav' if w<=760 else '.side-nav')+' [data-tab="'+tab+'"]').click();pg.wait_for_timeout(60)
def prepare(browser,w,fixture,url):
 ctx=browser.new_context(viewport={'width':w,'height':844},device_scale_factor=1,is_mobile=w<=760,has_touch=w<=760,locale='zh-TW',timezone_id='Asia/Taipei',reduced_motion='reduce',service_workers='block')
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','https://sonia6891.github.io/','data:','blob:')) else r.abort())
 ctx.add_init_script('if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-23T00:00:00Z",state:'+json.dumps(fixture,ensure_ascii=False)+'}));')
 pg=ctx.new_page();pg.clock.set_fixed_time(datetime.datetime(2026,9,23,4,tzinfo=datetime.timezone.utc));errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.goto(url,wait_until='domcontentloaded');pg.wait_for_timeout(220)
 pg.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}')
 go(pg,'calendar',w);return ctx,pg,errors
def saved(pg):return pg.evaluate('(key)=>localStorage.getItem(key)',KEY)
def measure(pg):
 return pg.evaluate('''()=>{const box=q=>document.querySelector(q).getBoundingClientRect().toJSON(),font=q=>getComputedStyle(document.querySelector(q)).fontSize;return {card:box('.schedule-card'),grid:box('#calendarDays'),nav:box('.bottom-nav'),title:font('.schedule-plan-header>label'),value:font('#schedulePlanValue'),date:font('.date-num'),pill:font('.status-pill'),button:box('#toggleSchedule'),overflow:document.documentElement.scrollWidth>innerWidth+1}}''')
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  for width,mode in [(320,'2-2'),(390,'2-2'),(390,'four-three'),(430,'4-3'),(430,'custom'),(1366,'2-2'),(1366,'four-three')]:
   for theme in ['light','dark']:
    fixture=json.loads(json.dumps(seed));fixture['theme']=theme;fixture['schedule']['preset']=mode
    if mode=='4-3':fixture['schedule'].update(workDays=4,offDays=3)
    if mode=='custom':fixture['schedule'].update(workDays=3,offDays=2)
    ca,pa,ea=prepare(browser,width,fixture,oldurl);cb,pb,eb=prepare(browser,width,fixture,newurl)
    old,new=measure(pa),measure(pb);original=saved(pb)
    assert pa.locator('#calendarDays').inner_html()==pb.locator('#calendarDays').inner_html()
    assert new['date']==old['date'] and new['pill']==old['pill']
    assert not new['overflow'] and new['button']['height']>=44
    assert pb.locator('#patternPreset').is_hidden() and pb.locator('#patternPreset').is_disabled()
    assert pb.locator('#editRotation').is_hidden()
    if width<=760:
     assert new['card']['height']<=old['card']['height']-20,(width,mode,old,new)
     assert new['grid']['y']<old['grid']['y']
     assert new['title']=='12px' and new['value']=='14px'
     if width==390 and mode=='2-2':assert new['grid']['bottom']<=new['nav']['top'],new
    else:
     assert new==old,(old,new)
     a=out/f'{engine}-{theme}-{mode}-desktop-before.png';b=out/f'{engine}-{theme}-{mode}-desktop-after.png'
     pa.screenshot(path=str(a));pb.screenshot(path=str(b))
     diff=ImageChops.difference(Image.open(a).convert('RGB'),Image.open(b).convert('RGB'))
     assert diff.getbbox() is None,('desktop pixels changed',diff.getbbox())
    if width==390 and mode=='2-2':
     pb.screenshot(path=str(out/f'{engine}-{theme}-calendar.png'))
     pb.locator('.schedule-card').screenshot(path=str(out/f'{engine}-{theme}-collapsed.png'))
    pb.locator('#toggleSchedule').click();pb.wait_for_timeout(80)
    assert pb.locator('#patternPreset').is_visible() and pb.locator('#patternPreset').is_enabled()
    assert saved(pb)==original
    if width<=760:assert pb.locator('#patternPreset').evaluate('e=>getComputedStyle(e).fontSize')=='16px'
    if width==390 and mode=='2-2':pb.locator('.schedule-card').screenshot(path=str(out/f'{engine}-{theme}-expanded.png'))
    pb.locator('#patternPreset').select_option('4-3');pb.wait_for_timeout(70)
    assert json.loads(saved(pb))['state']['schedule']['preset']=='4-3'
    pb.locator('#toggleSchedule').click();pb.wait_for_timeout(60)
    assert pb.locator('#patternPreset').is_hidden() and pb.locator('#patternPreset').is_disabled()
    assert '做四休三' in pb.locator('#schedulePlanValue').inner_text()
    pb.locator('#calPrev').click();pb.wait_for_timeout(60)
    assert pb.locator('[data-date="2026-08-31"]').count()==1
    pb.locator('[data-date="2026-08-31"]').click();assert pb.locator('#dayDialog').evaluate('e=>e.open');pb.keyboard.press('Escape')
    pb.reload(wait_until='domcontentloaded');pb.wait_for_timeout(200);go(pb,'calendar',width)
    assert pb.locator('#patternPreset').is_hidden() and '做四休三' in pb.locator('#schedulePlanValue').inner_text()
    go(pa,'settings',width);go(pb,'settings',width)
    assert pa.locator('#saveDevice').bounding_box()['height']==pb.locator('#saveDevice').bounding_box()['height']
    if width<=760:
     pb.wait_for_function('document.querySelector("#mobileRestCard img").naturalWidth===676')
     assert pb.locator('#mobileRestCard').count()==1
    assert not ea and not eb,(ea,eb)
    report['cases'].append({'engine':engine,'width':width,'theme':theme,'preset':mode,'before':old,'after':new,'saved_height':old['card']['height']-new['card']['height'],'calendar_unchanged':True,'edit_gate_passed':True,'reload_passed':True,'browser_errors':[]})
    ca.close();cb.close()
  browser.close()
for s in servers:s.shutdown()
report['passed']=True;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':True,'cases':len(report['cases']),'live_url':live,'source_sha256':expected}))
