"""Verify hierarchy changes in isolated synthetic profiles only."""
from pathlib import Path
import sys,os,json,hashlib,threading,http.server,functools,urllib.request,datetime
from playwright.sync_api import sync_playwright
before,after,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
servers=[]
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
def serve(folder):
 s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(folder)))
 threading.Thread(target=s.serve_forever,daemon=True).start();servers.append(s)
 return f'http://127.0.0.1:{s.server_address[1]}/'
oldurl=serve(before);live=os.environ.get('LIVE_URL','');url=live or serve(after)
expected=hashlib.sha256((after/'index.html').read_bytes()).hexdigest()
if live:
 with urllib.request.urlopen(urllib.request.Request(live,headers={'Cache-Control':'no-cache'}),timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==expected
KEY='meow-work-manual-save-v3'
settings={'baseSalary':34567,'shiftAllowancePerDay':150,'mealAllowance':0,'performanceAllowance':0,'transportAllowance':0,'otherIncome':0,'payday':0,'hireDate':'','dailyWorkHours':10,'defaultOvertimeHours':10,'annualLeaveDays':0,'annualLeaveCycle':'anniversary','annualCustomDate':'','sickLeaveDays':0,'personalLeaveDays':0,'sickUsedHours':0,'personalUsedHours':0}
seed={'theme':'light','schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-01','rotation':{'startDate':'2026-09-01','sequence':['early','early','middle','middle','night','night','off','off']}},'settings':settings,'dayStatus':{'2026-09-02':{'type':'sick','hours':4,'note':'測試病假'},'2026-09-03':{'type':'overtime','hours':2,'note':'測試加班'}},'months':{},'personalEvents':{'keep':{'id':'keep','kind':'event','date':'2026-09-25','start':'19:00','end':'20:00','title':'測試行程'}}}
report={'version':92,'live_url':live,'source_sha256':expected,'cases':[]}
def saved(pg):return json.loads(pg.evaluate('(k)=>localStorage.getItem(k)',KEY))['state']
def go(pg,tab,w):pg.locator(('.bottom-nav' if w<761 else '.side-nav')+' [data-tab="'+tab+'"]').click();pg.wait_for_timeout(80)
def grid(pg):return pg.locator('#calendarDays').inner_html()
def prepare(browser,w,fixture,url):
 ctx=browser.new_context(viewport={'width':w,'height':844},locale='zh-TW',timezone_id='Asia/Taipei',is_mobile=w<761,has_touch=w<761,reduced_motion='reduce',service_workers='block',accept_downloads=True)
 ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','https://sonia6891.github.io/','data:','blob:')) else r.abort())
 ctx.add_init_script('if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-22T00:00:00Z",state:'+json.dumps(fixture,ensure_ascii=False)+'}));')
 pg=ctx.new_page();pg.clock.set_fixed_time(datetime.datetime(2026,9,22,4,tzinfo=datetime.timezone.utc))
 errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.goto(url,wait_until='domcontentloaded');pg.wait_for_timeout(300);go(pg,'calendar',w)
 return ctx,pg,errors
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
    family='four-two' if mode in ['2-2','4-3'] else mode
    top=pg.locator('#patternPreset');cycle=pg.locator('#twoShiftCycle')
    assert top.locator('option').all_text_contents()==['四班二輪','四班三輪','自訂排班']
    assert cycle.locator('option').all_text_contents()==['請選擇上班週期','做二休二','做四休三']
    assert top.input_value()==family and cycle.is_visible()==(family=='four-two')
    assert saved(pg)['schedule']==fixture['schedule'];assert grid(pg)==grid(oldpg)
    if family=='four-two':assert cycle.input_value()==mode
    else:
     unchanged=saved(pg);prior_grid=grid(pg);top.select_option('four-two')
     assert cycle.is_visible() and cycle.input_value()==''
     assert saved(pg)==unchanged and grid(pg)==prior_grid
     assert pg.locator('#twoShiftPendingHint').is_visible()
    cycle.select_option('4-3');pg.wait_for_timeout(100)
    assert saved(pg)['schedule']['preset']=='4-3'
    assert saved(pg)['schedule']['workDays']==4 and saved(pg)['schedule']['offDays']==3
    assert '四班二輪｜做四休三' in pg.locator('#scheduleSummary').inner_text()
    assert '四班二輪・做四休三' in pg.locator('#settingsScheduleSummary').inner_text()
    oldpg.locator('#patternPreset').select_option('4-3');oldpg.wait_for_timeout(80);assert grid(pg)==grid(oldpg)
    if width==390:
     pg.screenshot(path=str(out/f'{engine}-{theme}-four-two.png'),full_page=True)
     pg.locator('.schedule-card').screenshot(path=str(out/f'{engine}-{theme}-controls.png'))
    cycle.select_option('2-2');pg.wait_for_timeout(80)
    assert top.input_value()=='four-two' and '做二休二' in pg.locator('#scheduleSummary').inner_text()
    oldpg.locator('#patternPreset').select_option('2-2');oldpg.wait_for_timeout(80);assert grid(pg)==grid(oldpg)
    original=saved(pg);top.select_option('four-three')
    assert pg.locator('#rotationDialog').evaluate('e=>e.open')
    pg.locator('#rotationCancel').click();pg.wait_for_timeout(80)
    assert top.input_value()=='four-two' and cycle.input_value()=='2-2' and saved(pg)==original
    top.select_option('four-three');pg.locator('#rotationApply').click();pg.wait_for_timeout(100)
    assert top.input_value()=='four-three' and not cycle.is_visible()
    assert '四班三輪｜八天一循環' in pg.locator('#scheduleSummary').inner_text()
    oldpg.locator('#patternPreset').select_option('four-three');oldpg.locator('#rotationApply').click();oldpg.wait_for_timeout(100)
    assert grid(pg)==grid(oldpg)
    current=saved(pg);top.select_option('four-two')
    assert cycle.input_value()=='' and saved(pg)==current
    # Changing the top selection again safely abandons the pending two-shift choice.
    top.select_option('four-three');assert not pg.locator('#rotationDialog').evaluate('e=>e.open')
    assert not cycle.is_visible() and saved(pg)==current
    top.select_option('custom');pg.wait_for_timeout(80)
    pg.locator('#toggleSchedule').click();pg.locator('#workDays').fill('3');pg.locator('#offDays').fill('2');pg.wait_for_timeout(80)
    assert '自訂排班｜做三休二' in pg.locator('#scheduleSummary').inner_text()
    top.select_option('four-two');cycle.select_option('4-3');pg.wait_for_timeout(100)
    for key in ['settings','dayStatus','personalEvents']:assert saved(pg)[key]==fixture[key],key
    assert saved(pg)['schedule']['startDate']=='2026-09-01'
    assert saved(pg)['schedule']['rotation']==fixture['schedule']['rotation']
    pg.reload(wait_until='domcontentloaded');pg.wait_for_timeout(250);go(pg,'calendar',width)
    assert pg.locator('#patternPreset').input_value()=='four-two' and pg.locator('#twoShiftCycle').input_value()=='4-3'
    assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    if width==390:
     go(pg,'settings',width)
     pg.evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined})")
     with pg.expect_download() as dl:pg.locator('#exportBackup').click()
     backup=out/f'{engine}-{theme}-synthetic.json';dl.value.save_as(backup)
     payload=json.loads(backup.read_text());assert payload['state']['schedule']['preset']=='4-3'
     assert payload['state']['schedule']['rotation']==fixture['schedule']['rotation']
     pg.on('dialog',lambda d:d.accept())
     with pg.expect_file_chooser() as fc:pg.locator('#importBackup').click()
     fc.value.set_files(str(backup));pg.wait_for_timeout(250);go(pg,'calendar',width)
     assert pg.locator('#patternPreset').input_value()=='four-two' and pg.locator('#twoShiftCycle').input_value()=='4-3'
    assert not errors and not olderrors,(errors,olderrors)
    report['cases'].append({'engine':engine,'width':width,'theme':theme,'loaded_legacy_preset':mode,'chinese_labels':True,'dependent_cycle':True,'cancel_no_write':True,'grid_matches_previous_version':True,'records_and_settings_preserved':True,'reload_mapping':True})
    ctx.close();oldctx.close()
  browser.close()
for srv in servers:srv.shutdown()
report['passed']=True;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':True,'cases':len(report['cases']),'source_sha256':expected,'live_url':live}))
