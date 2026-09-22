from pathlib import Path
import json, threading, http.server, functools, os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
ROOT=Path(os.environ.get('QA_ROOT','/tmp/meow-repair')); QA=ROOT/'qa';QA.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
servers=[]
for name,port in [('before',8765),('work',8766)]:
 srv=http.server.ThreadingHTTPServer(('127.0.0.1',port),functools.partial(Handler,directory=str(ROOT/name)))
 threading.Thread(target=srv.serve_forever,daemon=True).start();servers.append(srv)
report={'mobile':[],'desktop':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for version,port in [('before',8765),('after',8766)]:
  for width in [320,375,390,430,760,1280,1440]:
   ctx=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=1,service_workers='block')
   ctx.route('**/*',lambda route:route.continue_() if route.request.url.startswith('http://127.0.0.1') else route.abort())
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{port}/?dev=1');page.wait_for_timeout(300)
   data=page.evaluate('''() => ({hero:[...document.querySelectorAll('.hero-mobile')].map(i=>({complete:i.complete,width:i.naturalWidth,height:i.naturalHeight})),rest:[...document.querySelectorAll('#mobileRestCard img')].map(i=>({complete:i.complete,width:i.naturalWidth,height:i.naturalHeight})),toggle:document.getElementById('heroTheme').getBoundingClientRect().toJSON(),avatar:document.getElementById('mobileAvatarButton').getBoundingClientRect().toJSON()})''')
   if width in [390,1280,1440]:
    page.screenshot(path=str(QA/f'{version}-{width}-full.png'),full_page=True)
    page.locator('.hero-wrap').screenshot(path=str(QA/f'{version}-{width}-hero.png'))
   if width>760:
    report['desktop'].append({'version':version,'width':width,'data':data,'errors':errors});ctx.close();continue
   if version=='after':
    assert data['hero'][0]['width']==901,data
    assert data['rest'][0]['width']==676,data
    assert data['toggle']['x']>width*0.646,('toggle overlaps artwork',data)
    assert data['avatar']['x']-data['toggle']['right']>=5,('controls overlap',data)
    for tab in ['dashboard','calendar','attendance','salary','settings']:
     page.locator(f'.bottom-nav [data-tab="{tab}"]').click();page.wait_for_timeout(700)
     page.evaluate("window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})");page.wait_for_timeout(250)
     image=page.locator('#mobileRestCard img')
     info=image.evaluate('''i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0,width:i.naturalWidth,rect:i.getBoundingClientRect().toJSON(),parent:i.closest('.page').id,nav:document.querySelector('.bottom-nav').getBoundingClientRect().toJSON()})''')
     page.screenshot(path=str(QA/f'latest-{width}-{tab}.png'))
     assert image.is_visible() and info['loaded'],info
     assert info['parent']=='page-'+tab,info
     assert info['rect']['bottom']<=info['nav']['top']+1,info
     report['mobile'].append({'width':width,'tab':tab,'footer':info})
    page.evaluate("window.scrollTo({top:0,behavior:'instant'})");page.wait_for_timeout(200)
    page.locator('#heroTheme').click();page.wait_for_timeout(100)
    assert 'dark' in page.locator('html').get_attribute('class')
    assert page.locator('#heroTheme').get_attribute('aria-checked')=='true'
    if width==390:page.locator('.hero-wrap').screenshot(path=str(QA/f'after-{width}-hero-dark.png'))
    page.locator('#heroTheme').click();page.wait_for_timeout(100)
    assert page.locator('#heroTheme').get_attribute('aria-checked')=='false'
    with page.expect_file_chooser() as fc:page.locator('#mobileAvatarButton').click()
    assert fc.value is not None
    assert errors==[],errors
   report['mobile'].append({'version':version,'width':width,'data':data,'errors':errors})
   ctx.close()
 browser.close()
for width in [1280,1440]:
 a=Image.open(QA/f'before-{width}-full.png');b=Image.open(QA/f'after-{width}-full.png')
 same=a.size==b.size and ImageChops.difference(a,b).getbbox() is None
 report['desktop'].append({'width':width,'pixel_identical':same,'sizes':[a.size,b.size]})
 assert same,('Desktop changed',width,a.size,b.size)
(QA/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('PASS: 25 mobile page/size combinations, day/night and avatar; desktop pixel-identical')
