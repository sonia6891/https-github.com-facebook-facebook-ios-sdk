"""Mobile schedule-card typography/spacing only, applied to the reviewed v95 source."""
from pathlib import Path
import sys, hashlib, re
root=Path(sys.argv[1]);s=(root/'index.html').read_text();original=s
raw=s.encode();assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='bbe12b1e1914746fbde9e832f324f9d1ad65347a','Main changed: review current source first.'
def once(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
once('.schedule-card{padding:10px;}', '.schedule-card{padding:var(--plan-padding,10px);}')
once('.schedule-plan-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 12px}', '.schedule-plan-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:var(--plan-gap,8px 12px)}')
once('.schedule-plan-header>label{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:800;color:var(--ink)}', '.schedule-plan-header>label{display:flex;align-items:center;gap:var(--plan-label-gap,7px);font-size:var(--plan-label-size,14px);font-weight:800;color:var(--ink)}')
once('.schedule-plan-header>label .icon{width:18px;height:18px}', '.schedule-plan-header>label .icon{width:var(--plan-icon-size,18px);height:var(--plan-icon-size,18px)}')
once('.schedule-plan-value{grid-column:1/-1;display:block;font-size:18px;line-height:1.5;font-weight:850;color:var(--ink);overflow-wrap:anywhere}', '.schedule-plan-value{grid-column:var(--plan-value-column,1/-1);display:block;font-size:var(--plan-value-size,18px);line-height:var(--plan-value-line,1.5);font-weight:850;color:var(--ink);overflow-wrap:anywhere}')
once('.schedule-plan-detail{margin:10px 0 0;font-size:12px;line-height:1.6;color:var(--muted);overflow-wrap:anywhere}', '.schedule-plan-detail{margin:var(--plan-detail-margin,10px 0 0);font-size:var(--plan-detail-size,12px);line-height:var(--plan-detail-line,1.6);color:var(--muted);overflow-wrap:anywhere}')
compact='''/* Mobile schedule card: compact reading view; keep editing targets and date text readable. */
@media(max-width:760px){
  #page-calendar .schedule-card{
    --plan-padding:8px 10px;--plan-gap:2px 8px;--plan-label-gap:5px;
    --plan-label-size:12px;--plan-icon-size:15px;
    --plan-value-column:1;--plan-value-size:14px;--plan-value-line:1.4;
    --plan-detail-margin:4px 0 0;--plan-detail-size:11px;--plan-detail-line:1.45;
  }
  #page-calendar .schedule-plan-header .expand-btn{font-size:11px;padding:8px 10px;min-height:44px}
  #page-calendar .schedule-plan-header .expand-btn[aria-expanded="false"]{grid-column:2;grid-row:1 / span 2}
  #page-calendar .schedule-plan-header>select{font-size:16px;min-height:44px}
  #page-calendar .schedule-settings{margin-top:8px;padding-top:8px}
  #page-calendar .schedule-settings .form-grid{gap:8px}
  #page-calendar .schedule-settings .field label{font-size:11px;margin-bottom:4px}
  #page-calendar .schedule-settings .field input{font-size:16px;min-height:44px}
  #page-calendar .rotation-active-info{margin-top:6px;padding:6px 8px;gap:8px}
  #page-calendar .rotation-active-info p{font-size:11px;line-height:1.45}
}
'''
once('/* Rotation controls are scoped to the calendar and its setup dialog. */',compact+'\n/* Rotation controls are scoped to the calendar and its setup dialog. */') if '/* Rotation controls are scoped to the calendar and its setup dialog. */' in s else once('.rotation-dialog{width:min(480px,calc(100vw - 28px));', compact+'\n.rotation-dialog{width:min(480px,calc(100vw - 28px));')
for a,b in [('manifest.webmanifest?v=95','manifest.webmanifest?v=96'),('./sw.js?v=95','./sw.js?v=96'),('meow-sw-reloaded-v95','meow-sw-reloaded-v96'),('介面 v95','介面 v96')]:
 assert a in s,a
 s=s.replace(a,b)
expected=original
for a,b in [('manifest.webmanifest?v=95','manifest.webmanifest?v=96'),('./sw.js?v=95','./sw.js?v=96'),('meow-sw-reloaded-v95','meow-sw-reloaded-v96'),('介面 v95','介面 v96')]:expected=expected.replace(a,b)
assert re.sub(r'<style>[\s\S]*?</style>','<style/>',expected)==re.sub(r'<style>[\s\S]*?</style>','<style/>',s)
assert original.count('!important')==s.count('!important')
(root/'index.html').write_text(s)
f=root/'sw.js';sw=f.read_text();assert 'meow-work-pwa-v95' in sw
f.write_text(sw.replace('meow-work-pwa-v95','meow-work-pwa-v96').replace('manifest.webmanifest?v=95','manifest.webmanifest?v=96'))
assert hashlib.sha256(s.encode()).hexdigest()=='ae41ac130bb85ca7742da769942b7bdfe704145e7af99c33e6239bf6a187c938'
print('CSS-only mobile schedule compacting; app logic and assets unchanged. SHA256',hashlib.sha256(s.encode()).hexdigest())
