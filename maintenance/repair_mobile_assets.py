"""One-time source migration for the v74 mobile image defects; no runtime overlays."""
from pathlib import Path
import base64
import hashlib
import io
import re
import json
import numpy as np
from PIL import Image
import tinycss2

ROOT = Path.cwd()
VERSION = '75'
HERO = 'assets/mobile-hero-clean-v75.png'
REST = 'assets/mobile-rest-card-v75.webp'
CONTROL_CSS = '''
  /* Mobile artwork and controls: one source, no outer theme frame. */
  .mobile-hero-actions{
    --mobile-track-w:clamp(22px,6.9vw,28px);
    position:absolute;right:0;top:0;z-index:8;
    display:flex;align-items:center;gap:clamp(6px,1.8vw,8px);height:44px
  }
  .hero-theme{
    position:static;display:flex;align-items:center;justify-content:center;gap:4px;
    width:auto;min-height:44px;height:44px;padding:0;margin:0;
    border:0;border-radius:0;background:none;box-shadow:none;
    appearance:none;-webkit-appearance:none;cursor:pointer;flex:0 0 auto
  }
  .hero-theme:focus-visible,.mobile-avatar-button:focus-visible{outline:2px solid #996537;outline-offset:3px}
  .hero-theme .mobile-theme-icon{display:block;width:clamp(12px,3.6vw,16px);height:clamp(12px,3.6vw,16px);flex:0 0 auto}
  .hero-theme .mobile-theme-sun{color:#efa72b}
  .hero-theme .mobile-theme-moon{color:#8a6b5b}
  .hero-theme .mobile-theme-track{position:relative;display:block;width:var(--mobile-track-w);height:16px;border-radius:8px;background:#f5bb4e;flex:0 0 auto;overflow:hidden}
  .hero-theme .mobile-theme-track::after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .2s ease}
  .dark .hero-theme .mobile-theme-track{background:#6d625d}
  .dark .hero-theme .mobile-theme-track::after{transform:translateX(calc(var(--mobile-track-w) - 16px))}
  .mobile-avatar-button{display:grid;place-items:center;width:clamp(30px,8.5vw,36px);height:44px;flex:0 0 auto;padding:0;margin:0;border:0;background:none;appearance:none;-webkit-appearance:none;cursor:pointer}
  .mobile-avatar-button .hero-avatar{display:block;position:static;width:clamp(30px,8.5vw,36px);height:clamp(30px,8.5vw,36px);border:2px solid #f0ddcc;border-radius:50%;object-fit:cover;box-shadow:none;pointer-events:none}
  .mobile-rest-card{display:block;margin:14px 0 4px}
  .mobile-rest-card img{display:block;width:100%;height:auto;border-radius:18px;border:0;box-shadow:none;object-fit:contain}
  @media(prefers-reduced-motion:reduce){.hero-theme .mobile-theme-track::after{transition:none}}
'''

def remove_old_mobile_rules(css):
    rules = tinycss2.parse_stylesheet(css, skip_whitespace=False, skip_comments=False)
    mobile_blocks, removed = [], []
    for rule in rules:
        if rule.type != 'at-rule' or rule.lower_at_keyword != 'media' or rule.content is None:
            continue
        media = tinycss2.serialize(rule.prelude).replace(' ', '')
        if media != '(max-width:760px)':
            continue
        kept = []
        for child in tinycss2.parse_rule_list(rule.content, skip_whitespace=False, skip_comments=False):
            if child.type == 'qualified-rule':
                selector = tinycss2.serialize(child.prelude).strip()
                if any(token in selector for token in ['.hero-theme', '.hero-avatar', '.mobile-hero-actions', '.mobile-avatar-button', '.mobile-rest-card']):
                    removed.append(selector)
                    continue
            kept.append(child)
        rule.content = tinycss2.parse_component_value_list(tinycss2.serialize(kept))
        mobile_blocks.append(rule)
    assert mobile_blocks, 'Missing existing mobile media block'
    mobile_blocks[-1].content += tinycss2.parse_component_value_list(CONTROL_CSS)
    assert removed, 'Expected v74 mobile rules not found'
    return tinycss2.serialize(rules), removed

def clean_hero(data):
    original = Image.open(io.BytesIO(data)).convert('RGB')
    assert original.size == (901, 255), original.size
    pixels = np.array(original)
    x0, y0, x1, y1 = 582, 8, 865, 104
    area = pixels[y0:y1, x0:x1].astype(float)
    h, w = area.shape[:2]
    y, x = np.mgrid[:h, :w]
    X, Y = x/(w-1), y/(h-1)
    ring = (x < 5) | (x >= w-5) | (y < 5) | (y >= h-5)
    design = np.stack([np.ones_like(X), X, Y, X*Y, X*X, Y*Y], axis=-1)
    background = np.clip(design @ np.linalg.lstsq(design[ring], area[ring], rcond=None)[0], 0, 255)
    distance = np.minimum.reduce([x, w-1-x, y, h-1-y])
    alpha = np.clip(distance/7, 0, 1)[..., None]
    pixels[y0:y1, x0:x1] = np.rint(area*(1-alpha)+background*alpha).astype('uint8')
    outside = np.ones(pixels.shape[:2], dtype=bool)
    outside[y0:y1, x0:x1] = False
    assert np.array_equal(pixels[outside], np.array(original)[outside]), 'Brand artwork changed'
    dest = ROOT / HERO
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels).save(dest, 'PNG', optimize=True)
    Image.open(dest).load()

def main():
    original = (ROOT/'index.html').read_text()
    assert './sw.js?v=74' in original, 'Only the reviewed v74 source may be migrated'
    assert (ROOT/'404.html').read_text() == original, 'Fallback page has diverged'
    before_digest = hashlib.sha256(original.encode()).hexdigest()
    with Image.open(ROOT/REST) as im:
        im.load()
        assert im.size == (676,134), im.size
    start = original.index('<div class="hero-wrap">')
    end = original.index('</picture>', start)+len('</picture>')
    picture = original[start:end]
    source = re.search(r'<source media="\(max-width:760px\)" srcset="([^"]+)"', picture)
    mobile = re.search(r'<img class="hero-img hero-mobile" src="([^"]+)"', picture)
    assert source and mobile and source[1] == mobile[1]
    clean_hero(base64.b64decode(source[1].split(',')[1]))
    revised_picture = picture.replace(source[1], './'+HERO)
    text = original[:start] + revised_picture + original[end:]
    style = re.search(r'<style>([\s\S]*?)</style>', text)
    css, removed = remove_old_mobile_rules(style[1])
    text = text[:style.start(1)] + css + text[style.end(1):]
    old_rest = '<img src="./mobile-rest-card-v1.jpg?v=74" alt="休息一下，才有更長的路走喵～">'
    new_rest = '<img src="./'+REST+'" width="676" height="134" alt="休息一下，才有更長的路走喵～">'
    assert text.count(old_rest)==1
    text = text.replace(old_rest,new_rest)
    old_label = "if($('heroTheme'))$('heroTheme').setAttribute('aria-label',label);"
    new_label = "if($('heroTheme')){$('heroTheme').setAttribute('aria-label',label);$('heroTheme').setAttribute('aria-checked',String(state.theme==='dark'));}"
    assert text.count(old_label)==1
    text=text.replace(old_label,new_label)
    old_button = '<button class="hero-hit hero-theme" id="heroTheme" aria-label="切換深淺色">'
    new_button = '<button type="button" class="hero-hit hero-theme" id="heroTheme" role="switch" aria-checked="false" aria-label="切換深淺色">'
    assert text.count(old_button)==1
    text=text.replace(old_button,new_button)
    text=text.replace('manifest.webmanifest?v=74','manifest.webmanifest?v=75').replace('meow-sw-reloaded-v74','meow-sw-reloaded-v75').replace('./sw.js?v=74','./sw.js?v=75')
    text=text.replace('版本 1.0.0・社畜排班、出勤、請假與薪資試算','版本 1.0.0（介面 v75）・社畜排班、出勤、請假與薪資試算')
    for filename in ['index.html','404.html']:
        (ROOT/filename).write_text(text)
    sw = (ROOT/'sw.js').read_text()
    assert 'meow-work-pwa-v74' in sw
    (ROOT/'sw.js').write_text(sw.replace('meow-work-pwa-v74','meow-work-pwa-v75').replace('manifest.webmanifest?v=74','manifest.webmanifest?v=75'))
    assert text.count('id="mobileRestCard"')==1
    assert text.count('id="heroTheme"')==1
    assert 'mobile-rest-card-v1.jpg' not in text
    audit={'version':VERSION,'base_sha256':before_digest,'new_sha256':hashlib.sha256(text.encode()).hexdigest(),'removed_mobile_rules':removed,'hero':HERO,'rest':REST,'brand_pixels_outside_toolbar_unchanged':True}
    (ROOT/'repair-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    print(json.dumps(audit,ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
