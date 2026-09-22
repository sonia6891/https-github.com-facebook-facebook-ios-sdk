'use strict';
// Regression tests extract and execute the actual shipped theme code, not a copy.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const pick=(pattern)=>{const match=html.match(pattern);assert.ok(match,`Missing source anchor: ${pattern}`);return match[1]};
const boot=pick(/<script id="meow-theme-boot">\n([\s\S]*?)\n<\/script>/);
const helpers=pick(/(\/\/ Device-local appearance is authoritative[\s\S]*?\/\/ End device-local appearance\.)/);
const defaults=pick(/(function defaultState\(\)\{[^\n]*\})/);
const load=pick(/(function loadSaved\(\)\{[^\n]*\})/);
const apply=pick(/(function applyTheme\(\)\{[\s\S]*?\n\})/);
const set=pick(/(function setTheme\(t\)\{[\s\S]*?\n\})/);
const normalizers=Array.from(html.matchAll(/(function normalizeState\(v\)\{[\s\S]*?\n\})/g),m=>m[1]);
const saveKey=pick(/const SAVE_KEY='([^']+)'/);
const key='meow-work-theme-v1';
let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`)}
function openApp(store=new Map(),options={}){
  const classes=new Set();
  const root={style:{},classList:{toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name)}}};
  const meta={content:'',setAttribute(name,value){this[name]=value}};
  const context={window:{},console:{warn(){}},document:{documentElement:root,querySelector(){return meta}},
    localStorage:{getItem(k){if(options.blockRead)throw Error('storage blocked');return store.has(k)?store.get(k):null},setItem(k,v){if(options.blockWrite)throw Error('quota');store.set(k,String(v))}},
    matchMedia(){return {matches:!!options.systemDark}},iso:d=>d.toISOString().slice(0,10)};
  vm.createContext(context);
  vm.runInContext(boot,context);
  const firstPaint=classes.has('dark')?'dark':'light';
  vm.runInContext(`const SAVE_KEY=${JSON.stringify(saveKey)};\n${helpers}\n${defaults}\n${load}\n${normalizers.join('\n')}\nlet state=loadSaved().state;state.theme=preferredTheme();let saveCalls=0;function changedAndSync(){saveCalls++;try{localStorage.setItem(SAVE_KEY,JSON.stringify({state}))}catch(e){}}function updateHeroThemeLabel(){}function renderSettings(){}\n${apply}\n${set}`,context);
  return {store,firstPaint,root,run:code=>vm.runInContext(code,context),theme:()=>vm.runInContext('state.theme',context),dark:()=>classes.has('dark')};
}
test('all inline JavaScript remains syntactically valid',()=>{
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/\bsrc\s*=|application\/(?:ld\+)?json/.test(m[1]))continue;
    new vm.Script(m[2]);
  }
});
test('theme is initialized before stylesheet / first paint',()=>{
  assert.ok(html.indexOf('id="meow-theme-boot"')<html.indexOf('<style>'));
  assert.equal(openApp(new Map([[key,'dark']])).firstPaint,'dark');
});
test('fresh install defaults to light even on a dark OS',()=>{
  const app=openApp(new Map(),{systemDark:true});assert.equal(app.firstPaint,'light');assert.equal(app.theme(),'light');
});
test('legacy wrapped local preference migrates without touching work data',()=>{
  const raw=JSON.stringify({state:{theme:'dark',settings:{baseSalary:39000}},savedAt:'2026-09-23T00:00:00Z'});
  const store=new Map([[saveKey,raw]]);const app=openApp(store);assert.equal(app.firstPaint,'dark');assert.equal(store.get(key),'dark');assert.equal(store.get(saveKey),raw);
});
test('legacy unwrapped local preference migrates',()=>{assert.equal(openApp(new Map([[saveKey,JSON.stringify({theme:'dark'})]])).firstPaint,'dark')});
test('explicit light wins over old dark snapshots at startup',()=>{
  const app=openApp(new Map([[key,'light'],[saveKey,JSON.stringify({state:{theme:'dark'}})]]),{systemDark:true});assert.equal(app.firstPaint,'light');assert.equal(app.theme(),'light');
});
test('switch to light survives immediate close/reopen',()=>{
  const store=new Map([[key,'dark']]);openApp(store).run("setTheme('light')");const reopened=openApp(store,{systemDark:true});assert.equal(reopened.firstPaint,'light');assert.equal(reopened.theme(),'light');
});
test('switch to dark survives immediate close/reopen',()=>{
  const store=new Map();openApp(store).run("setTheme('dark')");const reopened=openApp(store);assert.equal(reopened.firstPaint,'dark');assert.equal(reopened.theme(),'dark');
});
test('login and real-time cloud data cannot overwrite device preference',()=>{
  const app=openApp();app.run("state=normalizeState({theme:'dark',settings:{baseSalary:45678},schedule:{shiftName:'B班'},dayStatus:{'2026-09-23':'annual'}});applyTheme()");assert.equal(app.theme(),'light');assert.equal(app.dark(),false);assert.equal(app.run('state.settings.baseSalary'),45678);assert.equal(app.run('state.schedule.shiftName'),'B班');assert.equal(app.run("state.dayStatus['2026-09-23']"),'annual');
});
test('both snapshot normalizers protect the device preference',()=>{assert.equal(normalizers.length,2);for(const normalizer of normalizers)assert.ok(normalizer.includes('s.theme=preferredTheme();'))});
test('late IndexedDB restore cannot overwrite a just-selected mode',()=>{
  const app=openApp(new Map([[key,'dark']]));app.run("setTheme('light');state=normalizeState({theme:'dark',personalEvents:{meeting:{title:'回診'}}});applyTheme()");assert.equal(app.theme(),'light');assert.equal(app.run('state.personalEvents.meeting.title'),'回診');
});
test('stale direct state assignment is corrected before rendering',()=>{
  const app=openApp();app.run("state.theme='dark';applyTheme()");assert.equal(app.theme(),'light');assert.equal(app.dark(),false);assert.equal(app.root.style.colorScheme,'light');
});
test('invalid theme values do not change state or trigger saves',()=>{
  const app=openApp();app.run("setTheme('system');setTheme(null);setTheme('invalid')");assert.equal(app.theme(),'light');assert.equal(app.run('saveCalls'),0);
});
test('blocked storage does not crash or override in-session selection',()=>{
  const app=openApp(new Map(),{blockRead:true,blockWrite:true});app.run("setTheme('dark');state=normalizeState({theme:'light'});applyTheme()");assert.equal(app.theme(),'dark');assert.equal(app.dark(),true);
});
test('lightweight theme persists when bulk snapshot storage fails',()=>{
  const app=openApp();app.run(`localStorage.setItem=(function(original){return function(k,v){if(k===SAVE_KEY)throw Error('quota');original(k,v)}})(localStorage.setItem);setTheme('dark')`);assert.equal(app.store.get(key),'dark');assert.equal(openApp(app.store).firstPaint,'dark');
});
console.log(`Theme regression tests: ${passed}/${passed} passed.`);
