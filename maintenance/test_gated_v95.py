"""Exercise schedule edit gating in isolated signed-out profiles only."""
from pathlib import Path
import sys,os,json,hashlib,threading,http.server,functools,urllib.request,datetime
from playwright.sync_api import sync_playwright
before,after,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
servers=[]
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def serve(folder):
 srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(folder)))
 threading.Thread(target=srv.serve_forever,daemon=True).start();servers.append(srv)
 return f'http://127.0.0.1:{srv.server_address[1]}/'
oldurl=serve(before);live=os.environ.get('LIVE_URL','');url=live or serve(after)
expected=hashlib.sha256((after/'index.html').read_bytes()).hexdigest()
if live:
 with urllib.request.urlopen(urllib.request.Request(live,headers={'Cache-Control':'no-cache'}),timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==expected
KEY='meow-work-manual-save-v3'
seed={'theme':'light','schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-01','rotation':{'startDate':'2026-09-01','sequence':['early','early','middle','middle','night','night','off','off']}},'settings':{'baseSalary':34567,'shiftAllowancePerDay':150,'dailyWorkHours':10,'defaultOvertimeHours':10},'dayStatus':{'2026-09-02':{'type':'sick','hours':4,'note':'測試病假'},'2026-09-03':{'type':'overtime','hours':2,'note':'測試加班'}},'months':{},'personalEvents':{'keep':{'id':'keep','kind':'event','date':'2026-09-25','start':'19:00','end':'20:00','title':'測試行程'}}}
report={'version':95,'live_url':live,'source_sha256':expected,'cases':[]}
def snapshot(pg):return pg.evaluate('(k)=>localStorage.getItem(k)',KEY)
def saved(pg):return json.loads(snapshot(pg))['state']
def go(pg,tab,w):pg.locator(('.bottom-nav' if w<761 else '.side-nav')+' [data-tab="'+tab+'"]').click();pg.wait_for_timeout(80)
def grid(pg):return pg.locator('#calendarDays').inner_html()
def prepare(browser,w,fixture,target):
 ctx=browser.new_context(viewport={'width':w,'height':844},locale='zh-TW',timezone_id='Asia/Taipei',is_mobile=w<761,has_touch=w<761,reduced_motion='reduce',service_workers='block')
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','https://sonia6891.github.io/','data:','blob:')) else r.abort())
 ctx.add_init_script('if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-22T00:00:00Z",state:'+json.dumps(fixture,ensure_ascii=False)+'}));')
 pg=ctx.new_page();pg.clock.set_fixed_time(datetime.datetime(2026,9,22,4,tzinfo=datetime.timezone.utc))
 errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.goto(target,wait_until='domcontentloaded');pg.wait_for_timeout(250);go(pg,'calendar',w)
 return ctx,pg,errors
def gate(pg,opened):
 select=pg.locator('#patternPreset');button=pg.locator('#toggleSchedule')
 assert select.is_visible()==opened and select.is_disabled()!=opened
 assert pg.locator('#schedulePlanValue').is_visible()!=opened
 assert button.get_attribute('aria-expanded')==str(opened).lower()
 assert pg.locator('#scheduleSettings').is_visible()==opened
 if not opened:
  assert pg.locator('#editRotation').is_hidden() and pg.locator('#editRotation').is_disabled()
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  for i,width in enumerate([320,390,430,1366]):
   for theme in ['light','dark']:
    fixture=json.loads(json.dumps(seed));fixture['theme']=theme
    mode=['2-2','4-3','four-three','custom'][i];fixture['schedule']['preset']=mode
    if mode=='4-3':fixture['schedule'].update(workDays=4,offDays=3)
    if mode=='custom':fixture['schedule'].update(workDays=3,offDays=2)
    ctx,pg,errors=prepare(browser,width,fixture,url);oldctx,oldpg,olderrors=prepare(browser,width,fixture,oldurl)
    top=pg.locator('#patternPreset');toggle=pg.locator('#toggleSchedule')
    gate(pg,False);assert top.input_value()==mode
    assert pg.locator('#schedulePlanValue').inner_text()==top.locator('option:checked').inner_text()
    assert grid(pg)==grid(oldpg)
    initial=snapshot(pg);original_grid=grid(pg)
    pg.locator('#schedulePlanValue').click();gate(pg,False);assert snapshot(pg)==initial
    # Hidden controls cannot change the saved scheme even if a stale change event fires.
    top.evaluate("e=>{e.value='4-3';e.dispatchEvent(new Event('change',{bubbles:true}))}")
    assert snapshot(pg)==initial and top.input_value()==mode and grid(pg)==original_grid
    pg.locator('#editRotation').evaluate('e=>e.click()');assert not pg.locator('#rotationDialog').evaluate('e=>e.open')
    toggle.click();gate(pg,True);assert snapshot(pg)==initial
    assert top.locator('option').all_text_contents()==['四班二輪・做二休二','四班二輪・做四休三','四班三輪','自訂排班']
    for choice in ['4-3','2-2']:
     top.select_option(choice);oldpg.locator('#patternPreset').select_option(choice);pg.wait_for_timeout(80);oldpg.wait_for_timeout(80)
     assert saved(pg)['schedule']['preset']==choice and grid(pg)==grid(oldpg);gate(pg,True)
    current=snapshot(pg);toggle.click();gate(pg,False);assert snapshot(pg)==current
    assert '四班二輪・做二休二'==pg.locator('#schedulePlanValue').inner_text()
    if width==390:pg.locator('.schedule-card').screenshot(path=str(out/f'{engine}-{theme}-collapsed.png'))
    toggle.focus();pg.keyboard.press('Enter');gate(pg,True)
    if width==390:pg.locator('.schedule-card').screenshot(path=str(out/f'{engine}-{theme}-expanded.png'))
    top.select_option('four-three');assert pg.locator('#rotationDialog').evaluate('e=>e.open')
    pg.locator('#rotationCancel').click();pg.wait_for_timeout(80);gate(pg,True)
    assert top.input_value()=='2-2' and snapshot(pg)==current
    top.select_option('four-three');pg.locator('#rotationApply').click();pg.wait_for_timeout(80)
    oldpg.locator('#patternPreset').select_option('four-three');oldpg.locator('#rotationApply').click();oldpg.wait_for_timeout(80)
    assert grid(pg)==grid(oldpg) and pg.locator('#editRotation').is_visible()
    toggle.click();gate(pg,False);assert pg.locator('#schedulePlanValue').inner_text()=='四班三輪'
    if width==390:pg.locator('.schedule-card').screenshot(path=str(out/f'{engine}-{theme}-rotation-collapsed.png'))
    original=snapshot(pg);pg.locator('#calNext').click();gate(pg,False);assert snapshot(pg)==original
    pg.locator('#calPrev').click();gate(pg,False)
    toggle.click();pg.locator('#editRotation').click();assert pg.locator('#rotationDialog').evaluate('e=>e.open')
    pg.locator('#rotationCancel').click();gate(pg,True)
    top.select_option('custom');oldpg.locator('#patternPreset').select_option('custom');pg.wait_for_timeout(80);oldpg.wait_for_timeout(80)
    assert grid(pg)==grid(oldpg) and pg.locator('#workDays').is_visible()
    toggle.click();gate(pg,False);assert pg.locator('#schedulePlanValue').inner_text()=='自訂排班'
    assert pg.locator('#workDays').is_hidden()
    toggle.click();top.select_option('4-3');toggle.click();gate(pg,False)
    current=saved(pg)
    for k in ['dayStatus','personalEvents']:assert current[k]==fixture[k],k
    for k,v in fixture['settings'].items():assert current['settings'][k]==v,k
    assert current['schedule']['startDate']==fixture['schedule']['startDate']
    assert current['schedule']['rotation']==fixture['schedule']['rotation']
    pg.reload(wait_until='domcontentloaded');pg.wait_for_timeout(250);go(pg,'calendar',width)
    gate(pg,False);assert top.input_value()=='4-3'
    assert pg.locator('#schedulePlanValue').inner_text()=='四班二輪・做四休三'
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    if width<761:
     pg.wait_for_function("document.querySelector('#mobileRestCard img').naturalWidth===676")
    assert not errors and not olderrors,(errors,olderrors)
    report['cases'].append({'engine':engine,'width':width,'theme':theme,'loaded_preset':mode,'collapsed_read_only':True,'expanded_editable':True,'toggle_without_write':True,'rotation_gated':True,'calendar_parity':True,'records_preserved':True,'reload_collapsed':True})
    ctx.close();oldctx.close()
  browser.close()
for srv in servers:srv.shutdown()
report['passed']=True;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':True,'cases':len(report['cases']),'source_sha256':expected,'live_url':live}))
