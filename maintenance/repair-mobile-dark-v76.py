"""Mobile-only dark palette. Rewrite original declarations, preserve their light/desktop fallbacks."""
from pathlib import Path
import re,sys,hashlib,json
import tinycss2 as css
BASE='a96809acb6fbda8536f50f47fab55e4d1b44c60b'
PALETTE={
 'surface':'#302923','field':'#241f1b','soft':'#3a3029','text':'#fff4eb','muted':'#e3cebe','line':'#796253',
 'blue-surface':'#20364a','blue-icon':'#2b4761','blue-ink':'#acd9ff',
 'pink-surface':'#422c38','pink-icon':'#593749','pink-ink':'#ffb9cf',
 'gold-surface':'#403323','gold-icon':'#58452a','gold-ink':'#ffdb91',
 'green-surface':'#273d31','green-icon':'#365640','green-ink':'#b6ecc3',
 'purple-surface':'#3d304b','purple-icon':'#503c64','purple-ink':'#dec6ff',
 'teal-surface':'#243d40','teal-icon':'#315357','teal-ink':'#afe9ed',
 'gray-surface':'#37332f','gray-icon':'#4a443e','gray-ink':'#e7d9ce',
 'track':'#584b42','accent':'#ffd38c','nav-active':'#4d3824'
}
EXCLUDE=('hero','avatar','sidebar','side-','desktop-','footer','profile-preview','::backdrop')
changes=[]
def role(sel):
 if any(t in sel for t in ['kpi-attendance','kpi:nth-child(1)','tone-blue','c-personal','st-personal','personal-balance','status-visual-leave','st-b','.formula']):return 'blue'
 if any(t in sel for t in ['kpi-leave','kpi:nth-child(2)','tone-pink','sick','danger','negative','.neg','.bad','.low','urgent','national','govcomp','c-ot','st-ot']):return 'pink'
 if any(t in sel for t in ['kpi-overtime','kpi:nth-child(3)','tone-orange','status-visual-ot','.warn','.mid']):return 'gold'
 if any(t in sel for t in ['kpi-net','kpi:nth-child(4)','tone-green','annual','positive','.pos','.ok','unlocked','.safe']):return 'green'
 if any(t in sel for t in ['menstrual','purple']):return 'purple'
 if any(t in sel for t in ['custom','teal']):return 'teal'
 if 'st-off' in sel or '.dot.off' in sel:return 'gray'
 if re.search(r'\.st-a(?:$|[ :])',sel) or sel=='.dot.a':return 'gold'
 if sel in ['.dot.b','.dot.personal']:return 'blue'
 if sel=='.dot.ot':return 'pink'
 return None

def token(name,old):return 'var(--mobile-'+name+', '+old+')'
def transform_declarations(content,sel):
 ds=css.parse_declaration_list(content,skip_comments=False,skip_whitespace=False)
 semantic=role(sel);icon=any(t in sel for t in ['.iconbox','.field-icon','.summary-icon','.leave-chip','.status-visual'])
 for d in ds:
  if d.type!='declaration':continue
  key=d.lower_name;old=css.serialize(d.value).strip();new=old
  if old.startswith('var(') or old in ['none','transparent','inherit','currentColor','0']:continue
  if not re.search(r'#[0-9a-fA-F]{3,8}\b|rgba?\(',old):continue
  if key in ['background','background-color','background-image'] and 'url(' not in old:
   is_fill=any(x in sel for x in ['progress i','.week-bar','.dot','.leave-dot']) or sel=='.bar'
   if is_fill:name=(semantic or ('blue' if 'scan' in sel else 'gold'))+'-ink'
   elif 'progress' in sel:name='track'
   elif '.bottom-nav button.active' in sel:name='nav-active'
   elif semantic:name=semantic+('-icon' if icon else '-surface')
   elif re.search(r'\b(input|select|textarea)\b',sel):name='field'
   elif any(t in sel for t in ['.btn.primary','.theme-choice.active','.edit-today','.expand-btn','.scan-upload-btn','.cloud-protection']):name='gold-surface'
   else:name='surface'
   new=token(name,old)
  elif key=='color':
   if semantic:name=semantic+'-ink'
   elif any(t in sel for t in ['.bottom-nav button.active','.btn.primary','.theme-choice.active','.edit-today','.expand-btn','.scan-upload-btn']):name='gold-ink'
   elif any(t in sel for t in ['small','label','hint','note','summary','record','meta','privacy','source','sub','month-switch','.bottom-nav button']):name='muted'
   else:name='text'
   new=token(name,old)
  elif key in ['border','border-color','border-top','border-bottom','border-left','border-right','outline']:
   new=re.sub(r'#[0-9a-fA-F]{3,8}\b',lambda m:token('line',m[0]),old)
  if new!=old:
   d.value=css.parse_component_value_list(new);changes.append({'selector':sel,'property':key,'before':old,'after':new})
 if re.search(r'\b(input|select|textarea)\b',sel) and any(d.type=='declaration' and d.lower_name in ['background','background-color'] for d in ds) and not any(d.type=='declaration' and d.lower_name=='color' for d in ds):
  ds.extend(css.parse_declaration_list(';color:var(--mobile-text, FieldText);'))
  changes.append({'selector':sel,'property':'color','before':'UA FieldText','after':'var(--mobile-text, FieldText)'})
 if sel in ['.settings-item','.theme-choice'] and not any(d.type=='declaration' and d.lower_name=='color' for d in ds):
  ds.extend(css.parse_declaration_list(';color:var(--mobile-text, revert);'))
 return css.parse_component_value_list(css.serialize(ds))

def walk(rules,ctx=''):
 for r in rules:
  if r.type=='at-rule' and r.content is not None and r.lower_at_keyword=='media':
   sub=css.parse_rule_list(r.content,skip_comments=False,skip_whitespace=False);walk(sub,ctx+' '+css.serialize(r.prelude));r.content=css.parse_component_value_list(css.serialize(sub))
  elif r.type=='qualified-rule':
   sel=css.serialize(r.prelude).strip()
   if sel in [':root','html.dark'] or 'print' in ctx or any(t in sel for t in EXCLUDE):continue
   r.content=transform_declarations(r.content,sel)

root=Path(sys.argv[1]);s=(root/'index.html').read_text();original=s;raw=s.encode()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==BASE,'Source changed: rebase before editing'
style=re.search(r'<style>([\s\S]*?)</style>',s)
rules=css.parse_stylesheet(style[1],skip_comments=False,skip_whitespace=False);walk(rules)
defs='\n/* Shared mobile dark palette: colors only. Light and desktop retain original fallbacks. */\n@media(max-width:760px){\n  html.dark{\n    --card:#302923;--paper:#241f1b;--muted:#e3cebe;--line:#796253;\n'+''.join('    --mobile-'+k+':'+v+';\n' for k,v in PALETTE.items())+'  }\n}\n'
newcss=css.serialize(rules);anchor='*{box-sizing:border-box;'
assert anchor in newcss
newcss=newcss.replace(anchor,defs+anchor,1)
s=s[:style.start(1)]+newcss+s[style.end(1):]
segments=re.split(r'(<script\b[\s\S]*?</script>)',s,flags=re.I)
def inline(m):
 tag=m[0]
 if any(x in tag for x in ['hero','avatar','footer','side-','desktop-']):return tag
 val=re.search(r'\bstyle="([^"]*)"',tag)
 if not val:return tag
 v=val[1]
 name='blue' if any(x in v.lower() for x in ['#2d72c6','#1768b1','#1764ab','#e5f1ff','#edf6ff']) else 'green' if any(x in v.lower() for x in ['#4a985e','#e3f4e6','#218a43']) else 'gold'
 v=re.sub(r'((?:^|;)\s*background(?:-color)?\s*:)\s*(#[\da-fA-F]{3,8}|rgba?\([^;]+\))',lambda n:n[1]+token(name+'-icon',n[2]),v)
 v=re.sub(r'((?:^|;)\s*color\s*:)\s*(#[\da-fA-F]{3,8})',lambda n:n[1]+token(name+'-ink',n[2]),v)
 return tag[:val.start(1)]+v+tag[val.end(1):]
for i in range(0,len(segments),2):segments[i]=re.sub(r'<[a-zA-Z][^<>]*\bstyle="[^"]*"[^<>]*>',inline,segments[i])
s=''.join(segments)
for old,new in [('manifest.webmanifest?v=75','manifest.webmanifest?v=76'),('meow-sw-reloaded-v75','meow-sw-reloaded-v76'),('./sw.js?v=75','./sw.js?v=76'),('介面 v75','介面 v76')]:s=s.replace(old,new)
assert s.count('!important')==original.count('!important')
(root/'index.html').write_text(s);(root/'404.html').write_text(s)
sw=(root/'sw.js').read_text().replace('meow-work-pwa-v75','meow-work-pwa-v76').replace('manifest.webmanifest?v=75','manifest.webmanifest?v=76');(root/'sw.js').write_text(sw)
(root/'dark-contrast-audit.json').write_text(json.dumps({'ui_version':76,'scope':'Mobile dark color palette only; no layout or image edits','changed_declarations':len(changes),'changes':changes},ensure_ascii=False,indent=2))
print('Updated',len(changes),'color declarations at source. No new !important. Only mobile dark palette activates new colors.')
