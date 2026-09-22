"""Read-only verification of the exact published v75 revision."""
from pathlib import Path
import base64, functools, hashlib, http.server, io, json, re, socketserver, threading, time, urllib.request
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
BASE='https://sonia6891.github.io/https-github.com-facebook-facebook-ios-sdk/'
ROOT=Path('/tmp/meow-after');BEFORE=Path('/tmp/meow-before');OUT=Path('live-qa');OUT.mkdir(exist_ok=True)
PAGES=['dashboard','calendar','attendance','salary','settings']
checks=[];failures=[];desktop=[];screens=[]

def image_bytes(data):
    with Image.open(io.BytesIO(data)) as im:
        im.load();return im.convert('RGB')

def fetch(path):
    req=urllib.request.Request(BASE+path,headers={'Cache-Control':'no-cache','User-Agent':'Meow-Visual-Verification'})
    with urllib.request.urlopen(req,timeout=20) as r:
        assert r.status==200
        return r.read()

expected=(ROOT/'index.html').read_bytes()
assert b'assets/mobile-hero-clean-v75.png' in expected
assert b'assets/mobile-rest-card-v75.webp' in expected
asset_info={}
for path in ['assets/mobile-hero-clean-v75.png','assets/mobile-rest-card-v75.webp']:
    data=(ROOT/path).read_bytes();im=image_bytes(data)
    asset_info[path]={'size':list(im.size),'sha256':hashlib.sha256(data).hexdigest()}
assert asset_info['assets/mobile-hero-clean-v75.png']['size']==[901,255]
assert asset_info['assets/mobile-rest-card-v75.webp']['size']==[676,134]
old_error=None
try:image_bytes((BEFORE/'mobile-rest-card-v1.jpg').read_bytes())
except Exception as e:old_error=type(e).__name__+': '+str(e)
assert old_error is not None

url=None
for attempt in range(40):
    path='?verify=mobile75-'+str(int(time.time()))
    try:
        published=fetch(path)
        if published==expected:
            url=BASE+path;break
    except Exception as e:print('Published page check:',type(e).__name__,flush=True)
    time.sleep(6)
assert url,'Published HTML does not match the tested commit.'
for path,info in asset_info.items():
    data=fetch(path+'?verify=75')
    assert hashlib.sha256(data).hexdigest()==info['sha256']
    assert list(image_bytes(data).size)==info['size']

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
servers=[]
def serve(root):
    srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
    threading.Thread(target=srv.serve_forever,daemon=True).start();servers.append(srv)
    return 'http://127.0.0.1:'+str(srv.server_address[1])+'/'
before_url,after_url=serve(BEFORE),serve(ROOT)

def prepare(browser,width,target):
    ctx=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=1,reduced_motion='reduce',service_workers='block')
    ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith((BASE,'http://127.0.0.1:','data:','blob:')) else r.abort())
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(target,wait_until='domcontentloaded');page.wait_for_timeout(500)
    page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}')
    return ctx,page,errors

with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch()
        for width in [320,390,430]:
            ctx,page,errors=prepare(browser,width,url)
            try:
                page.wait_for_function('()=>{const i=document.querySelector(".hero-mobile");return i&&i.complete&&i.naturalWidth===901&&i.currentSrc.includes("assets/mobile-hero-clean-v75.png")}')
                assert page.locator('#heroTheme:visible').count()==1
                assert page.locator('#heroTheme .mobile-theme-sun').count()==1
                assert page.locator('#heroTheme .mobile-theme-moon').count()==1
                style=page.locator('#heroTheme').evaluate('(e)=>{let s=getComputedStyle(e);return [s.borderTopWidth,s.backgroundColor,s.boxShadow]}')
                assert style==['0px','rgba(0, 0, 0, 0)','none'],style
                switch=page.locator('#heroTheme').bounding_box();avatar=page.locator('#mobileAvatarButton').bounding_box()
                assert switch and avatar and switch['x']+switch['width']<=avatar['x'],(switch,avatar)
                initial=page.locator('html').evaluate('(e)=>e.classList.contains("dark")')
                page.locator('#heroTheme').click()
                assert page.locator('html').evaluate('(e)=>e.classList.contains("dark")')!=initial
                page.locator('#heroTheme').click()
                if width==390:
                    page.screenshot(path=str(OUT/(engine+'-published-header.png')))
                    screens.append(engine+'-published-header.png')
                for tab in PAGES:
                    page.locator('.bottom-nav [data-tab="'+tab+'"]').click();page.wait_for_timeout(120)
                    page.wait_for_function('()=>{const i=document.querySelector(".page.active #mobileRestCard img");return i&&i.complete&&i.naturalWidth===676&&i.naturalHeight===134}')
                    assert page.locator('#mobileRestCard').count()==1
                    assert page.locator('#page-'+tab+' > #mobileRestCard').count()==1
                    assert page.locator('.footer-banner:visible').count()==0
                    card=page.locator('#mobileRestCard');im=card.locator('img')
                    for mode in ['light','dark']:
                        actual_dark=page.locator('html').evaluate('(e)=>e.classList.contains("dark")')
                        if actual_dark!=(mode=='dark'):
                            page.evaluate('window.scrollTo(0,0)');page.locator('#heroTheme').click()
                        page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');page.wait_for_timeout(100)
                        box=card.bounding_box();nav=page.locator('.bottom-nav').bounding_box();ib=im.bounding_box()
                        assert box and nav and box['height']>45,(engine,width,tab,mode,box,nav)
                        assert box['y']+box['height']<=nav['y']+1,(engine,width,tab,mode,'obscured',box,nav)
                        assert abs(ib['width']/ib['height']-676/134)<.03
                        assert im.evaluate('(e)=>getComputedStyle(e).filter')=='none'
                        checks.append({'engine':engine,'width':width,'page':tab,'theme':mode,'footer_visible':True,'above_nav':True})
                        if width==390:
                            name=engine+'-'+tab+'-'+mode+'-footer.png'
                            page.screenshot(path=str(OUT/name));screens.append(name)
                    page.evaluate('window.scrollTo(0,0)');page.locator('#heroTheme').click()
                page.evaluate('window.scrollTo(0,0)')
                with page.expect_file_chooser() as fc:page.locator('#mobileAvatarButton').click()
                assert fc.value.is_multiple() is False
                assert fc.value.element.get_attribute('id')=='avatarInput'
                assert not errors,errors
            except Exception as e:
                name=engine+'-'+str(width)+'-failure.png';page.screenshot(path=str(OUT/name));screens.append(name)
                failures.append({'engine':engine,'width':width,'error':str(e),'uncaught_errors':errors})
            finally:ctx.close()
        browser.close()
    browser=p.chromium.launch()
    for width in [1280,1366,1440]:
        ca,pa,ea=prepare(browser,width,before_url);cb,pb,eb=prepare(browser,width,after_url)
        try:
            for tab in PAGES:
                for pg in [pa,pb]:
                    pg.locator('.bottom-nav [data-tab="'+tab+'"]').evaluate('(e)=>e.click()');pg.wait_for_timeout(150)
                    pg.evaluate('window.scrollTo(0,0)');pg.wait_for_timeout(100)
                ba=pa.screenshot();bb=pb.screenshot()
                a=Image.open(io.BytesIO(ba)).convert('RGB');b=Image.open(io.BytesIO(bb)).convert('RGB')
                bounds=ImageChops.difference(a,b).getbbox()
                desktop.append({'width':width,'page':tab,'pixel_identical':bounds is None})
                if bounds is not None:
                    (OUT/('desktop-'+str(width)+'-'+tab+'-before.png')).write_bytes(ba)
                    (OUT/('desktop-'+str(width)+'-'+tab+'-after.png')).write_bytes(bb)
                    failures.append({'desktop_width':width,'page':tab,'changed_bounds':bounds})
        finally:ca.close();cb.close()
    browser.close()
result={'passed':not failures,'production_commit':'8a1bcdd7e74863718b6d40301ef83d7182e6dca4','published_url':url,'published_html_sha256':hashlib.sha256(expected).hexdigest(),'old_jpg_decode_error':old_error,'valid_assets':asset_info,'mobile_checks':checks,'desktop_checks':desktop,'failures':failures,'screenshots':screens}
(OUT/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print('LIVE_VISUAL_RESULT '+json.dumps(result,ensure_ascii=False),flush=True)
for srv in servers:srv.shutdown()
assert not failures,failures
