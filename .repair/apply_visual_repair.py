"""One-time source migration; no runtime masks, overlay patches or data changes."""
from pathlib import Path
import base64, hashlib, io, json, re, sys
from PIL import Image
import tinycss2

root, asset = Path(sys.argv[1]), Path(sys.argv[2])
BASE_BLOB = '80f920b32a1145dae30ef012731d91a29fc6f018'
FOOTER_SHA = '3cd5f2fcb1d39efc2ea4418980f7b81477c4f968270fc36b85a814e9e81a2b0b'
HEADER_FILE = 'mobile-hero-clean-v75.png'

def git_blob(b):
    return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()

def load_image(b):
    with Image.open(io.BytesIO(b)) as im:
        im.load()
        return im.convert('RGB')

original = (root/'index.html').read_bytes()
assert git_blob(original)==BASE_BLOB, 'Source changed; do not apply to a different revision.'
assert (root/'404.html').read_bytes()==original, '404 differs; review separately.'
text=original.decode('utf-8')
hero_start=text.index('<div class="hero-wrap">')
hero_end=text.index('</picture>',hero_start)+len('</picture>')
hero=text[hero_start:hero_end]
sources=re.findall(r'<source\b[^>]*media="\(max-width:760px\)"[^>]*srcset="([^"]+)"',hero)
assert len(sources)==1
uri=sources[0]
assert uri.startswith('data:image/')
image=load_image(base64.b64decode(uri.split(',',1)[1],validate=True))
assert image.size==(901,255), 'Unexpected Hero source; do not edit unknown artwork.'
clean=image.copy()
x0,y0,x1,y1=590,8,865,101
corners=[image.getpixel((x0-1,y0-1)),image.getpixel((x1,y0-1)),image.getpixel((x0-1,y1)),image.getpixel((x1,y1))]
for y in range(y0,y1):
    v=(y-y0+1)/(y1-y0+1)
    left,right=image.getpixel((x0-1,y)),image.getpixel((x1,y))
    for x in range(x0,x1):
        u=(x-x0+1)/(x1-x0+1)
        top,bottom=image.getpixel((x,y0-1)),image.getpixel((x,y1))
        rgb=[]
        for c in range(3):
            edge=(1-u)*left[c]+u*right[c]+(1-v)*top[c]+v*bottom[c]
            corner=(1-u)*(1-v)*corners[0][c]+u*(1-v)*corners[1][c]+(1-u)*v*corners[2][c]+u*v*corners[3][c]
            rgb.append(max(0,min(255,round(edge-corner))))
        clean.putpixel((x,y),tuple(rgb))
assert clean.crop((0,0,590,255)).tobytes()==image.crop((0,0,590,255)).tobytes()
assert clean.crop((0,101,901,255)).tobytes()==image.crop((0,101,901,255)).tobytes()
clean.save(root/HEADER_FILE,'PNG',optimize=True)
new_hero=hero.replace(uri,'./'+HEADER_FILE)
assert new_hero!=hero
text=text[:hero_start]+new_hero+text[hero_end:]

asset_bytes=asset.read_bytes()
assert hashlib.sha256(asset_bytes).hexdigest()==FOOTER_SHA, 'Asset transfer checksum mismatch.'
footer=load_image(asset_bytes)
assert footer.size==(676,134)
old_footer_error=None
try:
    load_image((root/'mobile-rest-card-v1.jpg').read_bytes())
except Exception as e:
    old_footer_error=type(e).__name__+': '+str(e)
footer.save(root/'mobile-rest-card-v1.jpg','JPEG',quality=95,optimize=True,subsampling=0)
assert load_image((root/'mobile-rest-card-v1.jpg').read_bytes()).size==(676,134)
card_pattern=r'(<div class="mobile-rest-card" id="mobileRestCard">)\s*<img\b[^>]*>'
text,n=re.subn(card_pattern,lambda m:m[1]+'<img src="./mobile-rest-card-v1.jpg?v=75" width="676" height="134" decoding="async" alt="休息一下，才有更長的路走喵～">',text)
assert n==1, 'Expected one shared rest card.'
assert 'function placeMobileRestCard()' in text

MOBILE_CSS='''
/* Mobile visual controls: one live switch, one editable avatar, one shared image. */
.mobile-hero-actions{position:absolute;right:2.7%;top:4px;z-index:8;display:flex;align-items:center;justify-content:flex-end;width:30%;max-width:148px;height:44px;gap:8%}
.mobile-hero-actions .hero-theme{position:static;display:flex;flex:1;align-items:center;justify-content:space-between;gap:3px;min-width:44px;height:44px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:#8a6b5b;cursor:pointer;appearance:none}
.mobile-hero-actions .hero-theme:focus-visible{outline:2px solid #986b50;outline-offset:3px}
.mobile-hero-actions .mobile-theme-icon{display:block;width:clamp(11px,3.1vw,15px);height:clamp(11px,3.1vw,15px);flex:0 0 auto}
.mobile-hero-actions .mobile-theme-sun{color:#efa72b}
.mobile-hero-actions .mobile-theme-moon{color:#8a6b5b}
.mobile-hero-actions .mobile-theme-track{position:relative;display:block;flex:0 0 auto;width:clamp(22px,6vw,28px);height:16px;border:0;border-radius:999px;background:#f5bb4e;overflow:hidden}
.mobile-hero-actions .mobile-theme-track::after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .18s ease}
.dark .mobile-hero-actions .mobile-theme-track{background:#6d625d}
.dark .mobile-hero-actions .mobile-theme-track::after{left:calc(100% - 14px)}
.mobile-hero-actions .mobile-avatar-button{display:grid;place-items:center;flex:0 0 auto;width:clamp(28px,8vw,40px);height:44px;padding:0;border:0;background:transparent;cursor:pointer}
.mobile-hero-actions .hero-avatar{display:block;position:static;width:clamp(28px,8vw,40px);height:clamp(28px,8vw,40px);opacity:1;visibility:visible;border:0;border-radius:50%;object-fit:cover;box-shadow:none;pointer-events:none}
.mobile-rest-card{display:block;margin:14px 0 4px;min-width:0}
.mobile-rest-card img{display:block;width:100%;height:auto;max-width:100%;border:0;border-radius:16px;box-shadow:0 6px 16px rgba(107,65,39,.06)}
'''
style=re.search(r'<style>([\s\S]*?)</style>',text)
assert style
rules=tinycss2.parse_stylesheet(style.group(1),skip_comments=False,skip_whitespace=False)
mobile_blocks=[]
removed=[]

def target(selector,mobile):
    if '.footer-art' in selector:
        return True
    if not mobile:
        return False
    return any(part in selector for part in ('.hero-theme','.hero-avatar','.mobile-hero-actions','.mobile-avatar-button','.mobile-theme-', '.mobile-rest-card'))

def clean_rules(nodes,mobile=False):
    result=[]
    for node in nodes:
        if node.type=='at-rule' and node.lower_at_keyword=='media' and node.content is not None:
            media=tinycss2.serialize(node.prelude)
            mobile_only=mobile or ('max-width:760px' in media.replace(' ','') and 'min-width:761px' not in media.replace(' ',''))
            nested=clean_rules(tinycss2.parse_rule_list(node.content),mobile_only)
            node.content=tinycss2.parse_component_value_list(tinycss2.serialize(nested))
            if mobile_only: mobile_blocks.append(node)
        elif node.type=='qualified-rule':
            selectors=[s.strip() for s in tinycss2.serialize(node.prelude).split(',')]
            keep=[s for s in selectors if not target(s,mobile)]
            if keep!=selectors:
                removed.extend(s for s in selectors if s not in keep)
                if not keep: continue
                node.prelude=tinycss2.parse_component_value_list(','.join(keep))
        result.append(node)
    return result
rules=clean_rules(rules)
assert mobile_blocks, 'No mobile style section.'
mobile_blocks[-1].content.extend(tinycss2.parse_component_value_list(MOBILE_CSS))
css=tinycss2.serialize(rules)
assert '.page.active::after' not in css
assert '.footer-art' not in css
assert css.count('.mobile-rest-card img{')==1
text=text[:style.start(1)]+css+text[style.end(1):]
text=text.replace('<html lang="zh-Hant">','<html lang="zh-Hant" data-ui-assets-version="75">',1)
text=text.replace('manifest.webmanifest?v=74','manifest.webmanifest?v=75').replace('meow-sw-reloaded-v74','meow-sw-reloaded-v75').replace('./sw.js?v=74','./sw.js?v=75')
assert text.count('id="mobileRestCard"')==1
assert text.count('id="heroTheme"')==1
assert text.count('id="heroAvatar"')==1
def scripts(s): return re.findall(r'<script\b[^>]*>([\s\S]*?)</script>',s)
expected=original.decode().replace('meow-sw-reloaded-v74','meow-sw-reloaded-v75').replace('./sw.js?v=74','./sw.js?v=75')
assert scripts(text)==scripts(expected), 'Unexpected application logic change.'
(root/'index.html').write_text(text,encoding='utf-8')
(root/'404.html').write_text(text,encoding='utf-8')
sw=(root/'sw.js').read_text()
assert 'meow-work-pwa-v74' in sw
(root/'sw.js').write_text(sw.replace('meow-work-pwa-v74','meow-work-pwa-v75').replace('manifest.webmanifest?v=74','manifest.webmanifest?v=75'))
report={'base_blob':BASE_BLOB,'old_footer_decode_error':old_footer_error,'footer_source_sha256':FOOTER_SHA,'footer_size':[676,134],'hero_size':list(image.size),'hero_art_outside_controls_unchanged':True,'live_switch_count':1,'shared_footer_count':1,'retired_selectors_removed':len(removed),'application_logic_unchanged':True,'ui_assets_version':75}
(root/'ui-visual-release.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
