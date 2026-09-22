from pathlib import Path
import hashlib, re, sys, json
root=Path(sys.argv[1]);s=(root/'index.html').read_text();before=s
b=s.encode();assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='38eb810f6ec55931d0ed3b4ada16e62de93aafb1','Base changed: review before applying'
pattern=r'<label class="settings-item" for="importBackupInput" style="cursor:pointer">([\s\S]*?)</label>'
s,n=re.subn(pattern,lambda m:'<button type="button" class="settings-item" id="importBackup" aria-controls="importBackupInput">'+m[1]+'</button>',s)
assert n==1,n
old="if($('importBackupInput'))$('importBackupInput').onchange="
new="if($('importBackup'))$('importBackup').onclick=()=>$('importBackupInput').click();\n"+old
assert s.count(old)==1;s=s.replace(old,new)
for x,y in [('manifest.webmanifest?v=89','manifest.webmanifest?v=90'),('meow-sw-reloaded-v89','meow-sw-reloaded-v90'),('./sw.js?v=89','./sw.js?v=90'),('介面 v89','介面 v90')]:
 assert x in s,x;s=s.replace(x,y)
assert re.findall(r'<style>([\s\S]*?)</style>',s)==re.findall(r'<style>([\s\S]*?)</style>',before), 'Styles must be shared, not patched'
assert s.count('id="importBackupInput"')==s.count('id="importBackup"')==1
scripts=lambda a:re.findall(r'<script\b[^>]*>([\s\S]*?)</script>',a)
expected=before.replace(old,new).replace('meow-sw-reloaded-v89','meow-sw-reloaded-v90').replace('./sw.js?v=89','./sw.js?v=90')
assert scripts(s)==scripts(expected),'Backup logic must not change'
(root/'index.html').write_text(s)
f=root/'sw.js';sw=f.read_text();assert 'meow-work-pwa-v89' in sw
f.write_text(sw.replace('meow-work-pwa-v89','meow-work-pwa-v90').replace('manifest.webmanifest?v=89','manifest.webmanifest?v=90'))
print(json.dumps({'version':90,'scope':'Replace import label with the same settings-item button used by adjacent actions','css_unchanged':True,'import_export_logic_unchanged':True,'sha256':hashlib.sha256(s.encode()).hexdigest()}))
