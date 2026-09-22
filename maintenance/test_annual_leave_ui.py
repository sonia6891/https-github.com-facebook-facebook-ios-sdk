from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright, expect
import sys,json,re,os
root,report=Path(sys.argv[1]),Path(sys.argv[2]);report.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
Thread(target=server.serve_forever,daemon=True).start()
url=os.environ.get('LIVE_URL') or f'http://127.0.0.1:{server.server_port}/'
key=re.search(r"const SAVE_KEY='([^']+)'",(root/'index.html').read_text())[1]
seed={'theme':'light','profile':{'name':'TEST-USER','avatar':''},'schedule':{'preset':'2-2','shiftName':'A班','workDays':2,'offDays':2,'startDate':'2026-09-03'},'settings':{'hireDate':'2022-09-01','annualLeaveCycle':'anniversary','annualLeaveDays':999,'dailyWorkHours':12,'baseSalary':32000,'payday':5,'sickUsedHours':10,'personalUsedHours':5},'dayStatus':{'2026-08-31':{'type':'annual','hours':8},'2026-09-03':{'type':'annual','hours':8},'2026-10-01':{'type':'annual','hours':4}},'personalEvents':{},'months':{'2026-09':{'dedLabor':1200,'dedHealth':700,'overtimeHours':12},'2026-08':{'dedLabor':1100,'dedHealth':680}}}
results=[]
with sync_playwright() as p:
 for engine,width in [('chromium',390),('webkit',390),('chromium',1440)]:
  name=f'{engine}-{width}'
  browser=getattr(p,engine).launch()
  ctx=browser.new_context(viewport={'width':width,'height':900},timezone_id='Asia/Taipei',locale='zh-TW',service_workers='block')
  ctx.route('**/*',lambda route:route.continue_() if route.request.url.startswith(url) or route.request.url.startswith('data:') else route.abort())
  init='''(()=>{const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-23T10:00:00+08:00']))}static now(){return new RealDate('2026-09-23T10:00:00+08:00').getTime()}};const k=KEY;if(!localStorage.getItem(k))localStorage.setItem(k,JSON.stringify({savedAt:'2026-09-23T02:00:00Z',state:SEED}));})();'''.replace('KEY',json.dumps(key)).replace('SEED',json.dumps(seed))
  ctx.add_init_script(init);page=ctx.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' and '[meow-render]' in m.text else None)
  def tab(t):
   page.locator(f'[data-tab="{t}"]:visible').first.click()
   expect(page.locator('#page-'+t)).to_have_class(re.compile(r'\bactive\b'))
  try:
   page.goto(url,wait_until='domcontentloaded');tab('settings')
   expect(page.locator('#settingAnnualDays')).to_have_count(0)
   quota=page.locator('#settingAnnualQuota');expect(quota).to_have_attribute('readonly','')
   expect(quota).to_have_value('14 天 / 112 小時')
   # Existing render initializes month data; compare against that saved baseline.
   page.locator('#settingSickUsedHours').fill('10');page.locator('#settingSickUsedHours').blur()
   baseline=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).state',key)
   for month,items in seed['months'].items():
    for field,value in items.items():assert baseline['months'][month][field]==value
   used=page.locator('#settingAnnualUsedHours');used.fill('24');used.blur()
   expect(page.locator('#annualSettingsBalance')).to_contain_text('已使用 32 小時')
   expect(page.locator('#annualSettingsBalance')).to_contain_text('剩餘可排 76 小時')
   state=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).state',key)
   assert list(state['settings']['annualUsedHoursByPeriod'].values())==[24]
   for field in ['profile','schedule','dayStatus','personalEvents','months']:assert state[field]==baseline[field],field+' altered'
   for field in ['baseSalary','payday','sickUsedHours','personalUsedHours','dailyWorkHours']:assert state['settings'][field]==seed['settings'][field],field+' altered'
   page.reload(wait_until='domcontentloaded');tab('settings');expect(used).to_have_value('24')
   if width<760:
    page.locator('#settingHireDate').click();expect(page.locator('#workDateDialog')).to_be_visible()
    page.locator('#workDateYear').select_option('2025');page.locator('#workDateMonth').select_option('9');page.locator('#workDateDay').select_option('23')
   else:
    page.locator('#settingHireDate').fill('2025-09-23');page.locator('#settingHireDate').blur()
   expect(quota).to_have_value('7 天 / 56 小時');expect(used).to_have_value('0')
   state=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).state',key)
   assert list(state['settings']['annualUsedHoursByPeriod'].values())==[24]
   if width<760:
    page.locator('#settingHireDate').click();page.locator('#workDateYear').select_option('2022');page.locator('#workDateMonth').select_option('9');page.locator('#workDateDay').select_option('1')
   else:
    page.locator('#settingHireDate').fill('2022-09-01');page.locator('#settingHireDate').blur()
   expect(used).to_have_value('24');expect(quota).to_have_value('14 天 / 112 小時')
   tab('calendar');expect(page.locator('#patternPreset')).to_be_hidden();expect(page.locator('#patternPreset')).to_be_disabled()
   page.locator('#toggleSchedule').click();expect(page.locator('#patternPreset')).to_be_visible();expect(page.locator('#patternPreset')).to_be_enabled()
   page.locator('#toggleSchedule').click();expect(page.locator('#patternPreset')).to_be_hidden()
   tab('dashboard');expect(page.locator('#annualBalanceMain')).to_contain_text('76 小時')
   tab('salary');tab('attendance');tab('settings')
   quota.scroll_into_view_if_needed();page.screenshot(path=str(report/(name+'-light.png')))
   page.locator('#themeDark').click();quota.scroll_into_view_if_needed();page.screenshot(path=str(report/(name+'-dark.png')))
   assert not errors,'\n'.join(errors)
   results.append({'test':name,'status':'passed','checks':['readonly automatic grant','supplemental hours','period separation','automatic save/reload','hire date changes','data preservation','v95 schedule gate','all tabs','light/dark']})
  except Exception as e:
   page.screenshot(path=str(report/(name+'-failure.png')));results.append({'test':name,'status':'failed','error':str(e),'errors':errors});raise
  finally:
   (report/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));ctx.close();browser.close()
server.shutdown();print(json.dumps(results,ensure_ascii=False,indent=2))
