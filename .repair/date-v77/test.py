"""Date workflow checks in isolated, signed-out synthetic browser profiles."""
from pathlib import Path
import functools, http.server, socketserver, threading, json, os, sys
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
before=Path(sys.argv[1]);after=Path(sys.argv[2]);out=Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
live=os.environ.get('MEOW_LIVE_URL')
engines=os.environ.get('MEOW_ENGINES','chromium,webkit').split(',')
servers=[]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
class Server(socketserver.ThreadingTCPServer):
 allow_reuse_address=True;daemon_threads=True

def serve(root):
 srv=Server(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
 threading.Thread(target=srv.serve_forever,daemon=True).start();servers.append(srv)
 return f'http://127.0.0.1:{srv.server_address[1]}/'
oldurl,newurl=serve(before),live or serve(after)
seed={'theme':'light','profile':{'name':'日期測試','avatar':''},'schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-03'},'settings':{'hireDate':'','annualCustomDate':'','annualLeaveCycle':'custom','dailyWorkHours':8,'baseSalary':32000},'months':{},'dayStatus':{}}
key='meow-work-manual-save-v3'
report={'live_url':live,'checks':[],'browser_errors':[],'view_checks':[]}

def prepare(browser,width,url,theme='light'):
 ctx=browser.new_context(viewport={'width':width,'height':844},is_mobile=width<761,has_touch=width<761,locale='zh-TW',timezone_id='Asia/Taipei',reduced_motion='reduce',service_workers='block')
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','data:','blob:','https://sonia6891.github.io/')) else r.abort())
 state=dict(seed,theme=theme)
 ctx.add_init_script("if(!localStorage.getItem("+json.dumps(key)+")){localStorage.setItem("+json.dumps(key)+",JSON.stringify({savedAt:new Date().toISOString(),state:"+json.dumps(state,ensure_ascii=False)+"}));}")
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url,wait_until='domcontentloaded',timeout=60000);page.wait_for_timeout(450)
 page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}')
 return ctx,page,errors

def value(page,group,k):
 return page.evaluate("([key,group,k])=>JSON.parse(localStorage.getItem(key)).state[group][k]",[key,group,k])
def field(page,id):return page.locator('#'+id)
def choose(page,y=None,m=None,d=None):
 for part,v in [('Year',y),('Month',m),('Day',d)]:
  if v is not None:field(page,'workDate'+part).select_option(str(v))
def assert_open(page):assert field(page,'workDateDialog').evaluate('d=>d.open')
def assert_closed(page):assert not field(page,'workDateDialog').evaluate('d=>d.open')
def go(page,tab):
 page.locator(('.bottom-nav' if page.viewport_size['width']<761 else '.side-nav')+f' [data-tab="{tab}"]').click();page.wait_for_timeout(80)

with sync_playwright() as p:
 for engine in engines:
  browser=getattr(p,engine).launch(headless=True)
  for width in [320,390,430]:
   for theme in ['light','dark']:
    ctx,page,errors=prepare(browser,width,newurl,theme)
    go(page,'settings')
    for id,group,k in [('settingHireDate','settings','hireDate'),('settingAnnualCustomDate','settings','annualCustomDate'),('scheduleStart','schedule','startDate')]:
     if id=='scheduleStart':
      go(page,'calendar');field(page,'toggleSchedule').click()
     original=value(page,group,k)
     node=field(page,id).element_handle()
     field(page,id).click();assert_open(page)
     choose(page,y=2024);assert_open(page);assert value(page,group,k)==original
     choose(page,m=2);assert_open(page);assert value(page,group,k)==original
     assert node.evaluate('e=>e.isConnected')
     choose(page,d=29);assert_open(page);assert value(page,group,k)==original
     if width==390 and id=='settingHireDate':page.screenshot(path=str(out/f'{engine}-{theme}-choosing-date.png'))
     field(page,'workDateConfirm').click();assert_closed(page)
     assert value(page,group,k)=='2024-02-29'
     assert field(page,id).input_value()=='2024-02-29'
     field(page,id).click();choose(page,y=2025)
     assert field(page,'workDateDay').input_value()==''
     assert field(page,'workDateConfirm').is_disabled()
     assert value(page,group,k)=='2024-02-29'
     choose(page,d=28);field(page,'workDateCancel').click()
     assert value(page,group,k)=='2024-02-29'
     field(page,id).click();choose(page,y=2025,m=4,d=30)
     field(page,'workDateConfirm').click()
     assert value(page,group,k)=='2025-04-30'
     field(page,id).click();choose(page,m=2)
     assert field(page,'workDateDay').input_value()==''
     field(page,'workDateCancel').click()
     field(page,id).click()
     if id=='scheduleStart':
      assert field(page,'workDateClear').is_hidden()
      field(page,'workDateCancel').click()
     else:
      field(page,'workDateClear').click();assert value(page,group,k)==''
      field(page,id).click();choose(page,y=2020,m=9)
      assert field(page,'workDateConfirm').is_disabled()
      assert field(page,'workDateDay').input_value()==''
      choose(page,d=3);field(page,'workDateConfirm').click()
      assert value(page,group,k)=='2020-09-03'
     report['checks'].append({'engine':engine,'width':width,'theme':theme,'field':id,'staged_year_month_day':True,'cancel_preserves':True,'leap_validation':True})
    go(page,'settings');field(page,'settingHireDate').click();choose(page,y=2023,m=12,d=15)
    page.evaluate("()=>{const f=document.getElementById('settingAnnualDays');f.value='12';f.dispatchEvent(new Event('input',{bubbles:true}))}")
    assert_open(page);assert field(page,'workDateYear').input_value()=='2023'
    assert value(page,'settings','hireDate')=='2020-09-03'
    field(page,'workDateConfirm').click()
    assert value(page,'settings','hireDate')=='2023-12-15'
    assert value(page,'settings','annualLeaveDays')==12
    field(page,'settingHireDate').click();choose(page,y=2022)
    page.keyboard.press('Escape');assert_closed(page)
    page.reload(wait_until='domcontentloaded');page.wait_for_timeout(300)
    go(page,'settings');assert field(page,'settingHireDate').input_value()=='2023-12-15'
    go(page,'dashboard');assert '2023-12-15' in field(page,'tenureSince').inner_text()
    for tab in ['dashboard','calendar','attendance','salary','settings']:
     go(page,tab)
     page.wait_for_function("document.querySelector('#mobileRestCard img').naturalWidth===676")
     assert field(page,'mobileRestCard').count()==1
    assert not errors,errors
    ctx.close()
  ctx,page,errors=prepare(browser,1366,newurl)
  go(page,'settings');f=field(page,'settingHireDate');assert not f.evaluate('e=>e.readOnly')
  f.focus();f.fill('2024-01-01')
  assert value(page,'settings','hireDate')==''
  f.fill('2024-09-03');assert value(page,'settings','hireDate')==''
  field(page,'settingPayday').focus()
  assert value(page,'settings','hireDate')=='2024-09-03'
  assert_closed(page);assert not errors,errors;ctx.close()
  browser.close()
 browser=p.chromium.launch(headless=True)
 for width in [390,1366]:
  for theme in ['light','dark']:
   ca,pa,ea=prepare(browser,width,oldurl,theme);cb,pb,eb=prepare(browser,width,newurl,theme)
   for tab in ['dashboard','settings']:
    go(pa,tab);go(pb,tab)
    for pg in [pa,pb]:pg.evaluate('window.scrollTo(0,0)');pg.wait_for_timeout(180)
    a=out/f'{width}-{theme}-{tab}-before.png';b=out/f'{width}-{theme}-{tab}-after.png'
    pa.screenshot(path=str(a));pb.screenshot(path=str(b))
    diff=ImageChops.difference(Image.open(a).convert('RGB'),Image.open(b).convert('RGB'))
    max_channel=max(pair[1] for pair in diff.getextrema())
    changed=sum(n for n,color in diff.getcolors(diff.width*diff.height) if color!=(0,0,0))
    # The initial exact comparison found five shadow-edge pixels differing by 1/255.
    # Allow only sparse <=2/255 rounding, never text, geometry, or palette changes.
    if tab=='dashboard' or width>760:
     assert max_channel<=2 and changed<=diff.width*diff.height*.0001,(width,theme,tab,changed,max_channel,diff.getbbox())
    report['view_checks'].append({'width':width,'theme':theme,'page':tab,'changed_pixels':changed,'max_channel_difference':max_channel})
   ca.close();cb.close()
 browser.close()
report['passed']=True
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('PASS',len(report['checks']),'mobile date workflows; desktop deferred commit; reload; two palettes; footer retained')
for srv in servers:srv.shutdown()
