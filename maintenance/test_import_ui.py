"""Exercise only isolated synthetic profiles; no real account, billing or cloud writes."""
from pathlib import Path
import os,sys,json,threading,http.server,functools,hashlib,time,urllib.request
from playwright.sync_api import sync_playwright
before,after,out=map(Path,sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(H,directory=str(after)))
threading.Thread(target=server.serve_forever,daemon=True).start()
live=os.environ.get('LIVE_URL','');url=live or f'http://127.0.0.1:{server.server_address[1]}/'
expected=hashlib.sha256((after/'index.html').read_bytes()).hexdigest()
if live:
 with urllib.request.urlopen(urllib.request.Request(live,headers={'Cache-Control':'no-cache'}),timeout=30) as r:
  assert r.status==200
  assert hashlib.sha256(r.read()).hexdigest()==expected,'Published HTML differs from tested candidate'
KEY='meow-work-manual-save-v3'
report={'version':90,'live_url':live,'source_sha256':expected,'checks':[],'functional':[]}
style_js="""e=>{const s=getComputedStyle(e);return Object.fromEntries(['backgroundColor','backgroundImage','color','fontFamily','fontSize','fontWeight','textAlign','borderTopWidth','borderBottomWidth','paddingTop','paddingBottom','paddingLeft','paddingRight','gridTemplateColumns','columnGap','alignItems'].map(k=>[k,s[k]]))}"""
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch()
  for width in [320,390,430,1366]:
   for theme in ['light','dark']:
    ctx=browser.new_context(viewport={'width':width,'height':844},locale='zh-TW',timezone_id='Asia/Taipei',is_mobile=width<761,has_touch=width<761,service_workers='block',reduced_motion='reduce',accept_downloads=True)
    ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','https://sonia6891.github.io/','data:','blob:')) else r.abort())
    seed={'theme':theme,'profile':{'name':'按鈕測試','avatar':''},'schedule':{'startDate':'2026-09-03','preset':'2-2','workDays':2,'offDays':2,'shiftName':'A班'},'settings':{'hireDate':'2024-01-15','baseSalary':32000},'months':{},'dayStatus':{},'personalEvents':{}}
    ctx.add_init_script('localStorage.setItem('+json.dumps(KEY)+',JSON.stringify({savedAt:"2026-09-22T00:00:00Z",state:'+json.dumps(seed,ensure_ascii=False)+'}));')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url,wait_until='domcontentloaded');page.wait_for_timeout(400)
    nav='.bottom-nav' if width<761 else '.side-nav'
    page.locator(nav+' [data-tab="settings"]').click();page.wait_for_timeout(100)
    imp=page.locator('#importBackup');exp=page.locator('#exportBackup');save=page.locator('#saveDevice')
    assert imp.evaluate('e=>e.tagName')=='BUTTON'
    assert imp.get_attribute('type')=='button'
    assert page.locator('#importBackupInput').count()==1
    assert page.locator('#importBackupInput').get_attribute('accept')=='.json,application/json'
    assert imp.evaluate(style_js)==exp.evaluate(style_js)==save.evaluate(style_js)
    for child in ['b','small']:
     assert imp.locator(child).evaluate(style_js)==exp.locator(child).evaluate(style_js)==save.locator(child).evaluate(style_js)
    assert imp.bounding_box()['x']==exp.bounding_box()['x']==save.bounding_box()['x']
    assert imp.bounding_box()['width']==exp.bounding_box()['width']==save.bounding_box()['width']
    assert imp.locator('.field-icon').bounding_box()['x']==exp.locator('.field-icon').bounding_box()['x']==save.locator('.field-icon').bounding_box()['x']
    card=page.locator('.settings-card').filter(has=save)
    card.scroll_into_view_if_needed();page.wait_for_timeout(250)
    card.screenshot(path=str(out/f'{engine}-{width}-{theme}-data-management.png'))
    snapshot=page.evaluate('(k)=>localStorage.getItem(k)',KEY)
    with page.expect_file_chooser() as chosen:imp.click()
    assert chosen.value.element.get_attribute('id')=='importBackupInput'
    assert not chosen.value.is_multiple
    chosen.value.set_files([]);page.wait_for_timeout(80)
    assert page.evaluate('(k)=>localStorage.getItem(k)',KEY)==snapshot
    report['checks'].append({'engine':engine,'width':width,'theme':theme,'same_styles':True,'same_alignment':True,'single_file_picker':True,'cancel_no_write':True})
    if width==390:
     dialogs=[];accept_restore=[True]
     def answer(d):
      dialogs.append({'type':d.type,'message':d.message})
      if d.type=='confirm' and not accept_restore[0]:d.dismiss()
      else:d.accept()
     page.on('dialog',answer)
     incoming=json.loads(json.dumps(seed));incoming['profile']['name']='備份匯入測試';incoming['settings']['baseSalary']=34567;incoming['personalEvents']={'ui-test':{'id':'ui-test','date':'2026-09-25','title':'驗證用行程','start':'09:00','end':'10:00','kind':'event'}}
     backup={'name':'ui-test.json','mimeType':'application/json','buffer':json.dumps({'state':incoming},ensure_ascii=False).encode()}
     imp.focus()
     with page.expect_file_chooser() as chosen:page.keyboard.press('Enter')
     chosen.value.set_files(backup)
     page.wait_for_function('(k)=>JSON.parse(localStorage.getItem(k)).state.settings.baseSalary===34567',arg=KEY)
     assert any(d['type']=='confirm' for d in dialogs)
     saved=json.loads(page.evaluate('(k)=>localStorage.getItem(k)',KEY))['state']
     assert saved['profile']['name']=='備份匯入測試'
     assert 'ui-test' in saved['personalEvents']
     assert page.locator('#importBackupInput').input_value()==''
     page.evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'canShare',{configurable:true,value:undefined})")
     with page.expect_download() as download:exp.click()
     path=out/f'{engine}-{theme}-synthetic-backup.json';download.value.save_as(path)
     exported=json.loads(path.read_text());assert exported['state']==saved
     snapshot=page.evaluate('(k)=>localStorage.getItem(k)',KEY)
     with page.expect_file_chooser() as chosen:imp.click()
     chosen.value.set_files({'name':'bad.json','mimeType':'application/json','buffer':b'{bad'})
     page.wait_for_timeout(150);assert page.evaluate('(k)=>localStorage.getItem(k)',KEY)==snapshot
     accept_restore[0]=False
     imp.focus()
     with page.expect_file_chooser() as chosen:page.keyboard.press('Space')
     chosen.value.set_files(backup);page.wait_for_timeout(150)
     assert page.evaluate('(k)=>localStorage.getItem(k)',KEY)==snapshot
     report['functional'].append({'engine':engine,'theme':theme,'enter_space_open_picker':True,'valid_restore':True,'export_round_trip':True,'reject_restore_no_write':True,'invalid_json_no_write':True})
    assert not errors,errors
    ctx.close()
  browser.close()
server.shutdown()
report['passed']=True
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':True,'style_cases':len(report['checks']),'functional_cases':len(report['functional']),'live_url':live,'source_sha256':expected},ensure_ascii=False))
