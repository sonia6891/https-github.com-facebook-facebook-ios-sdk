"""Single-select regression checks using synthetic, signed-out profiles only."""
from pathlib import Path
import sys,os,json,hashlib,threading,http.server,functools,urllib.request,datetime
from playwright.sync_api import sync_playwright
before,after,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
servers=[]
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def serve(folder):
 s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(folder)));threading.Thread(target=s.serve_forever,daemon=True).start();servers.append(s);return f'http://127.0.0.1:{s.server_address[1]}/'
oldurl=serve(before);live=os.environ.get('LIVE_URL','');url=live or serve(after)
expected=hashlib.sha256((after/'index.html').read_bytes()).hexdigest()
if live:
 with urllib.request.urlopen(urllib.request.Request(live,headers={'Cache-Control':'no-cache'}),timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==expected
KEY='meow-work-manual-save-v3'
settings={'baseSalary':34567,'shiftAllowancePerDay':150,'mealAllowance':0,'performanceAllowance':0,'transportAllowance':0,'otherIncome':0,'payday':0,'hireDate':'','dailyWorkHours':10,'defaultOvertimeHours':10,'annualLeaveDays':0,'annualLeaveCycle':'anniversary','annualCustomDate':'','sickLeaveDays':0,'personalLeaveDays':0,'sickUsedHours':0,'personalUsedHours':0}
seed={'theme':'light','schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-01','rotation':{'startDate':'2026-09-01','sequence':['early','early','middle','middle','night','night','off','off']}},'settings':settings,'dayStatus':{'2026-09-02':{'type':'sick','hours':4,'note':'測試病假'},'2026-09-03':{'type':'overtime','hours':2,'note':'測試加班'}},'months':{},'personalEvents':{'keep':{'id':'keep','kind':'event','date':'2026-09-25','start':'19:00','end':'20:00','title':'測試行程'}}}
report={'version':94,'live_url':live,'source_sha256':expected,'cases':[]}
def saved(pg):return json.loads(pg.evaluate('(k)=>localStorage.getItem(k)',KEY))['state']
def go(pg,tab,w):pg.locator(('.bottom-nav' if w<761 else '.side-nav')+' [data-tab="'+tab+'"]').click();pg.wait_for_timeout(70)
def grid(pg):return pg.locator('#calendarDays').inner_html()
def prepare(browser,w,fixture,url):
 ctx=browser.new_context(viewport={'width':w,'height':844},locale='zh-TW',timezone_id='Asia/Taipei',is_mobile=w<761,has_touch=w<761,reduced_motion='reduce',service_workers='block',accept_downloads=True)
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','https://sonia6891.github.io/','data:','blob:')) else r.abort())
 ctx.add_init_script('if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-22T00:00:00Z",state:'+json.dumps(fixture,ensure_ascii=False)+'}));')
 pg=ctx.new_page();pg.clock.set_fixed_time(datetime.datetime(2026,9,23,4,tzinfo=datetime.timezone.utc));errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.goto(url,wait_until='domcontentloaded');pg.wait_for_timeout(250);go(pg,'calendar',w);return ctx,pg,errors
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  for i,width in enumerate([320,390,430,1366]):
   for theme in ['light','dark']:
    fixture=json.loads(json.dumps(seed));fixture['theme']=theme;mode=['2-2','4-3','four-three','custom'][i];fixture['schedule']['preset']=mode
    if mode=='4-3':fixture['schedule'].update(workDays=4,offDays=3)
    if mode=='custom':fixture['schedule'].update(workDays=3,offDays=2)
    ctx,pg,errors=prepare(browser,width,fixture,url);oldctx,oldpg,olderrors=prepare(browser,width,fixture,oldurl)
    top=pg.locator('#patternPreset')
    assert top.locator('option').all_text_contents()==['四班二輪・做二休二','四班二輪・做四休三','四班三輪','自訂排班']
    assert top.locator('optgroup[label="四班二輪"] option').count()==2
    assert top.input_value()==mode and saved(pg)['schedule']==fixture['schedule']
    assert pg.locator('#twoShiftChoices,#twoShiftCycle,[data-two-cycle],#twoShiftPendingHint').count()==0
    assert pg.locator('.schedule-card select:visible').count()==1
    assert grid(pg)==grid(oldpg)
    for cycle,w,o in [('4-3',4,3),('2-2',2,2)]:
     top.select_option(cycle);pg.wait_for_timeout(80)
     assert not pg.locator('#rotationDialog').evaluate('e=>e.open')
     actual=saved(pg)['schedule'];assert actual['preset']==cycle and actual['workDays']==w and actual['offDays']==o
     oldpg.locator('#patternPreset').select_option('four-two');oldpg.locator('[data-two-cycle="'+cycle+'"]').click();oldpg.wait_for_timeout(80)
     assert grid(pg)==grid(oldpg)
    prior=saved(pg);top.select_option('four-three');assert pg.locator('#rotationDialog').evaluate('e=>e.open')
    pg.locator('#rotationCancel').click();pg.wait_for_timeout(80)
    assert top.input_value()=='2-2' and saved(pg)==prior
    top.select_option('four-three');pg.locator('#rotationApply').click();pg.wait_for_timeout(100)
    oldpg.locator('#patternPreset').select_option('four-three');oldpg.locator('#rotationApply').click();oldpg.wait_for_timeout(80)
    assert top.input_value()=='four-three' and grid(pg)==grid(oldpg)
    top.select_option('custom');oldpg.locator('#patternPreset').select_option('custom');pg.wait_for_timeout(80);oldpg.wait_for_timeout(80)
    assert grid(pg)==grid(oldpg)
    prior=saved(pg);top.dispatch_event('change');assert saved(pg)==prior
    top.select_option('4-3');pg.wait_for_timeout(80)
    for key in ['settings','dayStatus','personalEvents']:assert saved(pg)[key]==fixture[key],key
    assert saved(pg)['schedule']['startDate']==fixture['schedule']['startDate'] and saved(pg)['schedule']['rotation']==fixture['schedule']['rotation']
    pg.reload(wait_until='domcontentloaded');pg.wait_for_timeout(250);go(pg,'calendar',width)
    assert pg.locator('#patternPreset').input_value()=='4-3'
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    assert top.evaluate('e=>{const s=getComputedStyle(e),c=document.createElement("canvas").getContext("2d");c.font=s.font;return c.measureText(e.selectedOptions[0].text).width<=e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)}')
    if width==390:
     pg.locator('.schedule-card').screenshot(path=str(out/f'{engine}-{theme}-controls.png'))
     pg.screenshot(path=str(out/f'{engine}-{theme}-calendar.png'),full_page=True)
     go(pg,'settings',width);pg.evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined})")
     with pg.expect_download() as dl:pg.locator('#exportBackup').click()
     backup=out/f'{engine}-{theme}-synthetic.json';dl.value.save_as(backup);payload=json.loads(backup.read_text());assert payload['state']['schedule']['preset']=='4-3'
     pg.on('dialog',lambda d:d.accept())
     with pg.expect_file_chooser() as fc:pg.locator('#importBackup').click()
     fc.value.set_files(str(backup));pg.wait_for_timeout(250);go(pg,'calendar',width)
     assert pg.locator('#patternPreset').input_value()=='4-3'
    assert not errors and not olderrors,(errors,olderrors)
    report['cases'].append({'engine':engine,'width':width,'theme':theme,'initial_preset':mode,'single_dropdown':True,'no_cycle_buttons':True,'direct_save':True,'cancel_restores_cycle':True,'legacy_calendar_matches':True,'saved_records_unchanged':True,'reload':True,'label_fits':True})
    ctx.close();oldctx.close()
  browser.close()
for srv in servers:srv.shutdown()
report['passed']=True;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'passed':True,'cases':len(report['cases']),'sha256':expected,'live_url':live}))
