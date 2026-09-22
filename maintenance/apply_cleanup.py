"""Conservative cleanup of the reviewed production revision; abort on any drift."""
from pathlib import Path
import hashlib,json,re,sys
import tinycss2
from bs4 import BeautifulSoup
ROOT=Path(sys.argv[1]); REPORT=Path(sys.argv[2]); REPORT.mkdir(parents=True,exist_ok=True)
BASE='022840b11e3ac83758440cc73b2bbb4b0dd02e8b'
BLOB='e4c2cb19d627dc667d59294e39113288fbaaeffd'
def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
raw=(ROOT/'index.html').read_bytes();assert blob(raw)==BLOB,'Source drift: rebase, never overwrite newer work'
assert (ROOT/'404.html').read_bytes()==raw
s=raw.decode();old=s;soup=BeautifulSoup(s,'html.parser')
removed_assets=['app-icon-180.png','apple-touch-icon-v3.png','icon.svg','mobile-rest-card-v1.jpg']
texts=[p for p in ROOT.rglob('*') if p.is_file() and (p.suffix in ['.html','.js','.css','.json','.webmanifest','.yml','.yaml','.svg']) and p.name not in removed_assets]
for name in removed_assets:
 assert (ROOT/name).is_file()
 assert not any(name in p.read_text() for p in texts),name+' is referenced; retain it'
dead=['quick-grid','quick-btn','profile-panel','desktop-dashboard-profile','footer-art','desktop-hero-tools','desktop-profile-head','desktop-profile-main','desktop-profile-bubble','desktop-profile-row']
script='\n'.join(e.string or '' for e in soup.select('script'))
for name in dead:
 assert not soup.select('.'+name),name+' has live DOM'
 assert not re.search(r'(?<![\w-])'+re.escape(name)+r'(?![\w-])',script),name+' has dynamic code'
style=re.search(r'<style>([\s\S]*?)</style>',s);removed_selectors=[]
def transform(rules):
 out=[]
 for rule in rules:
  if rule.type=='at-rule' and rule.content is not None and rule.lower_at_keyword in ['media','supports','layer']:
   inside=transform(tinycss2.parse_rule_list(rule.content,skip_whitespace=False,skip_comments=False))
   rule.content=tinycss2.parse_component_value_list(tinycss2.serialize(inside))
  elif rule.type=='qualified-rule':
   selectors=tinycss2.serialize(rule.prelude).split(',');keep=[]
   for sel in selectors:
    if any(re.search(r'\.'+re.escape(name)+r'(?![\w-])',sel) for name in dead):removed_selectors.append(sel.strip())
    else:keep.append(sel)
   if not keep:continue
   if keep!=selectors:rule.prelude=tinycss2.parse_component_value_list(','.join(keep))
  out.append(rule)
 return out
rules=tinycss2.parse_stylesheet(style[1],skip_whitespace=False,skip_comments=False)
newcss=tinycss2.serialize(transform(rules));s=s[:style.start(1)]+newcss+s[style.end(1):]
removed_js=[]
ids=['desktopRailBase','desktopRailShift','desktopRailMeal','desktopRailPerformance','desktopRailAvatar','desktopRailName','quickAdd']
for id in ids:
 assert soup.find(id=id) is None,id+' exists'
 pattern=r"if\(\$\('"+id+r"'\)\)\$\('"+id+r"'\)\.(?:textContent|src|onclick)=[^;]+;"
 matches=re.findall(pattern,s);assert len(matches)==1,(id,len(matches))
 s,n=re.subn(pattern,'',s);assert n==1
 removed_js+=matches
for a in [',selectedItineraryDate=iso(new Date())',",conflictEventId=''"]:
 assert s.count(a)==1,a
 removed_js.append(a);s=s.replace(a,'',1)
for name in ['selectedItineraryDate','conflictEventId']+ids:assert name not in s,name
for a,b in [('manifest.webmanifest?v=81','manifest.webmanifest?v=89'),('./sw.js?v=88','./sw.js?v=89'),('meow-sw-reloaded-v77','meow-sw-reloaded-v89'),('介面 v88','介面 v89')]:
 assert a in s,a
 s=s.replace(a,b)
expected=old
for chunk in removed_js:expected=expected.replace(chunk,'',1)
for a,b in [('manifest.webmanifest?v=81','manifest.webmanifest?v=89'),('./sw.js?v=88','./sw.js?v=89'),('meow-sw-reloaded-v77','meow-sw-reloaded-v89'),('介面 v88','介面 v89')]:expected=expected.replace(a,b)
script_pat=r'<script\b[^>]*>([\s\S]*?)</script>'
assert re.findall(script_pat,s)==re.findall(script_pat,expected),'Unexpected business logic edit'
assert s.count('!important')<=old.count('!important')
(ROOT/'index.html').write_text(s)
for name in removed_assets:(ROOT/name).unlink()
fallback='''<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>返回喵的，又要上班了</title>
<style>body{margin:3rem auto;padding:0 1rem;max-width:32rem;font:16px/1.7 system-ui,sans-serif;background:#fff8ef;color:#47241b}a{color:#8b4e2d}</style>
</head>
<body>
<p>正在返回 App；若未自動開啟，請點選下方連結。</p>
<a id="home" href="/https-github.com-facebook-facebook-ios-sdk/">返回喵的，又要上班了</a>
<script>
(() => {
  const home = new URL('/https-github.com-facebook-facebook-ios-sdk/', location.origin);
  home.search = location.search;
  home.hash = location.hash;
  document.getElementById('home').href = home.href;
  if (location.pathname !== home.pathname) location.replace(home.href);
})();
</script>
<noscript><p>請啟用 JavaScript 後再開啟 App。</p></noscript>
</body>
</html>
'''
(ROOT/'404.html').write_text(fallback)
manifest=json.loads((ROOT/'manifest.webmanifest').read_text());assert manifest['start_url']=='./?v=13' and 'id' not in manifest
manifest['id']='/https-github.com-facebook-facebook-ios-sdk/?v=13'
manifest['start_url']='./'
(ROOT/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
sw=(ROOT/'sw.js').read_text();assert 'meow-work-pwa-v81' in sw
(ROOT/'sw.js').write_text(sw.replace('meow-work-pwa-v81','meow-work-pwa-v89').replace('manifest.webmanifest?v=81','manifest.webmanifest?v=89'))
report={'base':BASE,'version':89,'removed_assets':removed_assets,'removed_css_selectors':removed_selectors,'removed_js':removed_js,'index_before_bytes':len(raw),'index_after_bytes':len(s.encode()),'fallback_before_bytes':len(raw),'fallback_after_bytes':len(fallback.encode()),'business_logic_scope_verified':True,'manifest_launch':'./','manifest_compatibility_id':manifest['id']}
(REPORT/'cleanup.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ['removed_js','removed_css_selectors']},ensure_ascii=False));print('Removed selectors:',len(removed_selectors))
