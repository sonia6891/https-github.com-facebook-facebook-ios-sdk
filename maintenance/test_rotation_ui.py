"""Only synthetic signed-out browser profiles; no account, cloud, salary or billing writes."""
from pathlib import Path
import sys,os,json,hashlib,threading,http.server,functools,urllib.request,datetime
from playwright.sync_api import sync_playwright
before,after,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(after)))
threading.Thread(target=server.serve_forever,daemon=True).start()
live=os.environ.get('LIVE_URL','');url=live or f'http://127.0.0.1:{server.server_address[1]}/'
expected=hashlib.sha256((after/'index.html').read_bytes()).hexdigest()
if live:
 with urllib.request.urlopen(urllib.request.Request(live,headers={'Cache-Control':'no-cache'}),timeout=30) as r:assert r.status==200 and hashlib.sha256(r.read()).hexdigest()==expected
KEY='meow-work-manual-save-v3'
seed={'theme':'light','schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-01'},'settings':{'baseSalary':34567,'shiftAllowancePerDay':150,'mealAllowance':0,'performanceAllowance':0,'transportAllowance':0,'otherIncome':0,'payday':0,'hireDate':'','dailyWorkHours':10,'defaultOvertimeHours':10,'annualLeaveDays':0,'annualLeaveCycle':'anniversary','annualCustomDate':'','sickLeaveDays':0,'personalLeaveDays':0,'sickUsedHours':0,'personalUsedHours':0},'dayStatus':{'2026-09-02':{'type':'sick','hours':4,'note':'測試病假'},'2026-09-03':{'type':'overtime','hours':2,'note':'測試加班'}},'months':{},'personalEvents':{'keep':{'id':'keep','kind':'event','date':'2026-09-25','start':'19:00','end':'20:00','title':'測試行程'}}}
report={'version':91,'live_url':live,'source_sha256':expected,'checks':[]}
def saved(page):return json.loads(page.evaluate('(key)=>localStorage.getItem(key)',KEY))['state']
def go(page,tab,width):page.locator(('.bottom-nav' if width<761 else '.side-nav')+' [data-tab="'+tab+'"]').click();page.wait_for_timeout(100)
def day(page,date):return page.locator('#calendarDays .day').filter(has=page.locator('[data-date="'+date+'"]'))
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  for width in [320,390,430,1366]:
   for theme in ['light','dark']:
    ctx=browser.new_context(viewport={'width':width,'height':844},locale='zh-TW',timezone_id='Asia/Taipei',is_mobile=width<761,has_touch=width<761,reduced_motion='reduce',service_workers='block',accept_downloads=True)
    ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','https://sonia6891.github.io/','data:','blob:')) else r.abort())
    fixture=json.loads(json.dumps(seed));fixture['theme']=theme
    ctx.add_init_script('if(!localStorage.getItem('+json.dumps(KEY)+'))localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-22T00:00:00Z",state:'+json.dumps(fixture,ensure_ascii=False)+'}));')
    page=ctx.new_page();page.clock.set_fixed_time(datetime.datetime(2026,9,22,4,tzinfo=datetime.timezone.utc))
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url,wait_until='domcontentloaded');page.wait_for_timeout(350)
    go(page,'calendar',width)
    preset=page.locator('#patternPreset');assert preset.is_visible();assert preset.locator('option[value="four-three"]').count()==1
    assert preset.input_value()=='2-2';old=saved(page);legacy_grid=page.locator('#calendarDays').inner_html()
    preset.select_option('four-three');assert page.locator('#rotationDialog').evaluate('e=>e.open')
    assert saved(page)['schedule']==old['schedule'];assert page.locator('#calendarDays').inner_html()==legacy_grid
    page.locator('#rotationSequence').fill('早 中 夜 錯字');page.locator('#rotationApply').click()
    assert page.locator('#rotationDialog').evaluate('e=>e.open');assert saved(page)['schedule']==old['schedule']
    page.locator('#rotationCancel').click();page.wait_for_timeout(80);assert preset.input_value()=='2-2'
    preset.select_option('four-three');page.locator('#rotationSequence').fill('早 早 中 中 夜 夜 休 休');page.locator('#rotationStart').fill('2026-09-01')
    if width==390:page.screenshot(path=str(out/f'{engine}-{theme}-setup.png'))
    page.locator('#rotationApply').click();assert not page.locator('#rotationDialog').evaluate('e=>e.open')
    assert preset.input_value()=='four-three'
    current=saved(page);assert current['schedule']['rotation']['sequence']==['early','early','middle','middle','night','night','off','off']
    for k in ['dayStatus','personalEvents','settings']:assert current[k]==old[k],(k,current[k],old[k])
    assert current['schedule']['startDate']=='2026-09-01'
    assert '四班三輪' in page.locator('#scheduleSummary').inner_text()
    for d,label in [('01','早班'),('02','病假'),('03','中班'),('04','中班'),('05','夜班'),('06','夜班'),('07','休假'),('08','休假'),('09','早班')]:assert label in day(page,'2026-09-'+d).inner_text(),(d,label)
    assert '加班' in day(page,'2026-09-03').inner_text()
    assert 'A班' not in page.locator('#calendarLegend').inner_text() and 'B班' not in page.locator('#calendarLegend').inner_text()
    assert '早班' in page.locator('#calendarLegend').inner_text()
    page.locator('[data-date="2026-09-05"]').click();assert '夜班' in page.locator('#dialogBase').inner_text();page.keyboard.press('Escape')
    if width==390:page.screenshot(path=str(out/f'{engine}-{theme}-calendar.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    go(page,'dashboard',width);assert '23' in page.locator('#dashAttendance').inner_text()
    go(page,'calendar',width);page.locator('#editRotation').click();page.locator('#rotationSequence').fill('早 中 夜 休');page.locator('#rotationStart').fill('2024-02-28');page.locator('#rotationApply').click()
    assert saved(page)['schedule']['rotation']['startDate']=='2024-02-28'
    # Switching back to a legacy mode retains the old anchor and the user's records.
    preset.select_option('2-2');assert page.locator('#calendarDays').inner_html()==legacy_grid
    for k in ['dayStatus','personalEvents','settings']:assert saved(page)[k]==old[k]
    preset.select_option('four-three');assert page.locator('#rotationSequence').input_value()=='早 中 夜 休';page.locator('#rotationApply').click()
    page.reload(wait_until='domcontentloaded');page.wait_for_timeout(300);go(page,'calendar',width)
    assert page.locator('#patternPreset').input_value()=='four-three'
    assert saved(page)['schedule']['rotation']['startDate']=='2024-02-28'
    # Verify the rotation survives a backup round trip.
    if width==390:
     go(page,'settings',width)
     page.evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined})")
     with page.expect_download() as dl:page.locator('#exportBackup').click()
     backup=out/f'{engine}-{theme}-synthetic.json';dl.value.save_as(backup);payload=json.loads(backup.read_text())
     assert payload['state']['schedule']['rotation']['sequence']==['early','middle','night','off']
     assert payload['state']['dayStatus']==old['dayStatus'] and payload['state']['personalEvents']==old['personalEvents']
     page.on('dialog',lambda d:d.accept())
     with page.expect_file_chooser() as fc:page.locator('#importBackup').click()
     fc.value.set_files(str(backup));page.wait_for_timeout(250);go(page,'calendar',width)
     assert page.locator('#patternPreset').input_value()=='four-three'
    assert not errors,errors
    report['checks'].append({'engine':engine,'width':width,'theme':theme,'top_selector':True,'draft_cancel_invalid':True,'shift_labels':True,'manual_overrides':True,'legacy_unchanged':True,'reload':True,'records_preserved':True})
    ctx.close()
  browser.close()
server.shutdown();report['passed']=True;(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':True,'cases':len(report['checks']),'live_url':live,'source_sha256':expected}))
