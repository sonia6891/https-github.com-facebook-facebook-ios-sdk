"""Conservative, one-time cleanup of the audited v88 source. No user data access."""
from pathlib import Path
import hashlib,json,re,sys
import tinycss2
from bs4 import BeautifulSoup
root=Path(sys.argv[1]);report_path=Path(sys.argv[2])
BASE_BLOB='e4c2cb19d627dc667d59294e39113288fbaaeffd'
ASSETS=['app-icon-180.png','apple-touch-icon-v3.png','icon.svg','mobile-rest-card-v1.jpg']
DEAD=['quick-grid','quick-btn','profile-panel','desktop-dashboard-profile','footer-art','desktop-hero-tools','desktop-profile-head','desktop-profile-mini-avatar','desktop-profile-name','desktop-profile-caption','desktop-profile-note','desktop-profile-list','desktop-profile-row']
def blob(raw):return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
raw=(root/'index.html').read_bytes();assert blob(raw)==BASE_BLOB,'Source changed: re-audit before applying'
assert (root/'404.html').read_bytes()==raw,'404 differs from reviewed baseline'
s=raw.decode();original=s
style=re.search(r'<style>([\s\S]*?)</style>',s);assert style
outside=s[:style.start()]+s[style.end():]
for cls in DEAD:assert cls not in outside,'Class still used: '+cls
texts=[p for p in root.rglob('*') if p.is_file() and p.suffix in ['.html','.js','.json','.webmanifest','.yml','.yaml','.css']]
for asset in ASSETS:
 for p in texts:assert asset not in p.read_text(),f'{asset} is still referenced by {p}'
removed=[]
pattern=re.compile(r'\.(?:'+ '|'.join(re.escape(c) for c in DEAD)+r')(?![\w-])')
def clean_rules(rules):
 out=[]
 for r in rules:
  if r.type=='at-rule' and r.content is not None and r.lower_at_keyword=='media':
   r.content=tinycss2.parse_component_value_list(tinycss2.serialize(clean_rules(tinycss2.parse_rule_list(r.content))))
  elif r.type=='qualified-rule':
   selectors=[x.strip() for x in tinycss2.serialize(r.prelude).split(',')]
   keep=[x for x in selectors if not pattern.search(x)]
   if keep!=selectors:
    removed.extend(x for x in selectors if x not in keep)
    if not keep:continue
    r.prelude=tinycss2.parse_component_value_list(','.join(keep))
  out.append(r)
 return out
css=tinycss2.serialize(clean_rules(tinycss2.parse_stylesheet(style[1])))
s=s[:style.start(1)]+css+s[style.end(1):]
removed_js=[]
for name,expression in [('desktopRailBase','money(state.settings.baseSalary)'),('desktopRailShift','money(state.settings.shiftAllowancePerDay)'),('desktopRailMeal','money(state.settings.mealAllowance)'),('desktopRailPerformance','money(state.settings.performanceAllowance)'),('desktopRailAvatar','av'),('desktopRailName','name')]:
 assert not BeautifulSoup(original,'html.parser').find(id=name)
 prop='src' if name=='desktopRailAvatar' else 'textContent'
 chunk=f"if($('{name}'))$('{name}').{prop}={expression};"
 assert s.count(chunk)==1,chunk
 s=s.replace(chunk,'');removed_js.append(name)
chunk="if($('quickAdd'))$('quickAdd').onclick=()=>openDay(iso(new Date()));"
assert s.count(chunk)==1 and not BeautifulSoup(original,'html.parser').find(id='quickAdd')
s=s.replace(chunk,'');removed_js.append('quickAdd')
for name,chunk in [('selectedItineraryDate',',selectedItineraryDate=iso(new Date())'),('conflictEventId',",conflictEventId=''")]:
 assert s.count(name)==1 and s.count(chunk)==1
 s=s.replace(chunk,'');removed_js.append(name)
for pattern,replacement in [(r'manifest\.webmanifest\?v=\d+','manifest.webmanifest?v=89'),(r'\./sw\.js\?v=\d+','./sw.js?v=89'),(r'meow-sw-reloaded-v\d+','meow-sw-reloaded-v89'),(r'介面 v\d+','介面 v89')]:s=re.sub(pattern,replacement,s)
(root/'index.html').write_text(s)
fallback='''<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>返回喵的，又要上班了</title></head>
<body>
<p>正在返回 App。<a id="home" href="/https-github.com-facebook-facebook-ios-sdk/">開啟 App</a></p>
<script>
(function(){
  'use strict';
  const root='/https-github.com-facebook-facebook-ios-sdk/';
  const target=new URL(root,window.location.origin);
  target.search=window.location.search;
  target.hash=window.location.hash;
  document.getElementById('home').href=target.href;
  if(window.location.pathname!==root&&window.location.href!==target.href){window.location.replace(target.href);}
})();
</script>
<noscript>請開啟 JavaScript，或點選「開啟 App」返回首頁。</noscript>
</body></html>
'''
(root/'404.html').write_text(fallback)
sw=(root/'sw.js').read_text();sw=re.sub(r'meow-work-pwa-v\d+','meow-work-pwa-v89',sw);sw=re.sub(r'manifest\.webmanifest\?v=\d+','manifest.webmanifest?v=89',sw);(root/'sw.js').write_text(sw)
deleted={a:(root/a).stat().st_size for a in ASSETS}
for a in ASSETS:(root/a).unlink()
assert json.loads((root/'manifest.webmanifest').read_text())['start_url']=='./?v=13'
def markup(t):
 p=BeautifulSoup(t,'html.parser')
 for node in p.select('style,script'):node.decompose()
 for link in p.select('link[rel="manifest"]'):link['href']='./manifest.webmanifest'
 return re.sub(r'介面 v\d+','介面 VERSION',str(p))
assert markup(s)==markup(original),'Unexpected UI markup change'
assert s.count('!important')<=original.count('!important')
assert s.count('id="mobileRestCard"')==1
assert s.count('id="heroTheme"')==1
assert 'Pro' in s and 'personalEvents' in s
report={'base_blob':BASE_BLOB,'removed_files':deleted,'removed_css_selectors':removed,'removed_dead_js':removed_js,'index_before':len(raw),'index_after':len(s.encode()),'fallback_before':len(raw),'fallback_after':len(fallback.encode()),'manifest_unchanged':True,'ui_markup_unchanged':True,'version':89}
report['bytes_removed']=sum(deleted.values())+2*len(raw)-len(s.encode())-len(fallback.encode())
report_path.parent.mkdir(parents=True,exist_ok=True);report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
