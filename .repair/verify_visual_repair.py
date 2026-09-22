"""Regression check on synthetic, signed-out browser contexts only."""
from pathlib import Path
import functools, http.server, json, socketserver, sys, threading
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

before, after, output = map(Path,sys.argv[1:4]);output.mkdir(parents=True,exist_ok=True)
PAGES=['dashboard','calendar','attendance','salary','settings']
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
servers=[]
def serve(root):
    srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
    threading.Thread(target=srv.serve_forever,daemon=True).start();servers.append(srv)
    return 'http://127.0.0.1:'+str(srv.server_address[1])+'/'
before_url,after_url=serve(before),serve(after)

def prepare(browser,width,url):
    ctx=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=1,reduced_motion='reduce',service_workers='block')
    ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(('http://127.0.0.1:','data:','blob:')) else r.abort())
    page=ctx.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url,wait_until='domcontentloaded');page.wait_for_timeout(350)
    page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}')
    return ctx,page,errors

checks=[]
with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch()
        for width in [320,390,430]:
            ctx,page,errors=prepare(browser,width,after_url)
            assert page.locator('html').get_attribute('data-ui-assets-version')=='75'
            header=page.locator('.hero-mobile')
            assert header.count()==1
            assert header.evaluate('(e)=>e.complete&&e.naturalWidth===901&&e.currentSrc.includes("mobile-hero-clean-v75.png")')
            assert page.locator('#heroTheme:visible').count()==1
            assert page.locator('#heroTheme .mobile-theme-sun').count()==1
            assert page.locator('#heroTheme .mobile-theme-moon').count()==1
            style=page.locator('#heroTheme').evaluate('(e)=>{const s=getComputedStyle(e);return {border:s.borderTopWidth,background:s.backgroundColor,shadow:s.boxShadow}}')
            assert style['border']=='0px' and style['shadow']=='none',style
            assert style['background']=='rgba(0, 0, 0, 0)',style
            initial=page.locator('html').evaluate('(e)=>e.classList.contains("dark")')
            page.locator('#heroTheme').click();page.wait_for_timeout(50)
            assert page.locator('html').evaluate('(e)=>e.classList.contains("dark")')!=initial
            page.locator('#heroTheme').click()
            for tab in PAGES:
                page.locator('.bottom-nav [data-tab="'+tab+'"]').click();page.wait_for_timeout(100)
                assert page.locator('#mobileRestCard').count()==1
                assert page.locator('#page-'+tab+' > #mobileRestCard').count()==1
                card=page.locator('#mobileRestCard');image=card.locator('img')
                page.wait_for_function('()=>{const i=document.querySelector("#mobileRestCard img");return i&&i.complete&&i.naturalWidth===676&&i.naturalHeight===134}')
                page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');page.wait_for_timeout(100)
                box=card.bounding_box();nav=page.locator('.bottom-nav').bounding_box()
                assert box and nav and box['height']>45,(engine,width,tab,box,nav)
                assert box['y']+box['height']<=nav['y']+1,(engine,width,tab,'footer obscured',box,nav)
                assert abs(image.bounding_box()['width']/image.bounding_box()['height']-676/134)<.03
                assert page.locator('.footer-banner:visible').count()==0
                page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(50)
                page.locator('#heroTheme').click();page.wait_for_timeout(50)
                assert image.evaluate('(e)=>e.complete&&e.naturalWidth===676')
                assert image.evaluate('(e)=>getComputedStyle(e).filter')=='none'
                page.locator('#heroTheme').click()
                checks.append({'engine':engine,'width':width,'page':tab,'footer_loaded':True,'footer_above_nav':True,'both_themes':True})
                if width==390 and tab in ['dashboard','settings']:
                    page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');page.wait_for_timeout(100)
                    page.screenshot(path=str(output/(engine+'-'+tab+'-bottom.png')))
            page.locator('.bottom-nav [data-tab="dashboard"]').click();page.wait_for_timeout(100)
            page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(100)
            if width==390:page.screenshot(path=str(output/(engine+'-header.png')))
            with page.expect_file_chooser() as chooser:
                page.locator('#mobileAvatarButton').click()
            assert chooser.value.is_multiple is False
            assert not errors,errors
            ctx.close()
        browser.close()
    browser=p.chromium.launch()
    for width in [1280,1366,1440]:
        ca,pa,ea=prepare(browser,width,before_url)
        cb,pb,eb=prepare(browser,width,after_url)
        for tab in PAGES:
            for page in [pa,pb]:
                page.locator('.side-nav [data-tab="'+tab+'"]').click();page.wait_for_timeout(150)
                page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(100)
            sa=output/('desktop-'+str(width)+'-'+tab+'-before.png');sb=output/('desktop-'+str(width)+'-'+tab+'-after.png')
            pa.screenshot(path=str(sa));pb.screenshot(path=str(sb))
            diff=ImageChops.difference(Image.open(sa).convert('RGB'),Image.open(sb).convert('RGB'))
            assert diff.getbbox() is None,('desktop changed',width,tab,diff.getbbox())
        assert eb==ea,(ea,eb)
        ca.close();cb.close()
    browser.close()
report={'passed':True,'mobile_checks':checks,'desktop_pixel_identical':{'widths':[1280,1366,1440],'pages':PAGES},'avatar_file_picker_passed':True,'browser_errors':[]}
(output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'passed':True,'mobile_checks':len(checks),'mobile_engines':['chromium','webkit'],'mobile_widths':[320,390,430],'desktop_pixel_identical':True,'avatar_file_picker':True}))
for srv in servers:srv.shutdown()
