'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const block=(a,b)=>{const start=html.indexOf(a);assert.ok(start>=0,a);const end=html.indexOf(b,start);assert.ok(end>start,b);return html.slice(start,end)};
const one=(re)=>{const m=html.match(re);assert.ok(m,String(re));return m[1]};
const core=block('// Auth identifies an account.','// End onboarding / account / cloud separation.')+block('async function loadEntitlement(){',"let pendingEmail='';");
const defaults=one(/(function defaultState\(\)\{[^\n]*\})/),normalize=one(/(function normalizeState\(v\)\{[\s\S]*?\n\})/),persist=block('function persistLocalSnapshot(){','function syncPayload('),meaningful=block('function hasMeaningfulUserData(', 'async function clearIndexedBackup(){'),active=block('function entitlementIsActive(', 'async function loadEntitlement(){');
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
function app(){
 const store=new Map(),nodes=new Map(),calls=[],timers=new Map(),classes=new Set();let timerId=0;
 const element=()=>({hidden:false,inert:false,textContent:'',style:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){},focus(){}});
 const ctx={console,URL,URLSearchParams,Date,JSON,Math,Number,Object,Array,String,Promise,Set,Map,Blob,
  location:{search:'',href:'https://meow.test/',origin:'https://meow.test',pathname:'/'},history:{replaceState(){}},navigator:{onLine:true},window:{addEventListener(){}},document:{documentElement:{classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)}}}},
  localStorage:{getItem(k){return store.get(k)||null},setItem(k,v){store.set(k,String(v))},removeItem(k){store.delete(k)}},
  setTimeout(fn,delay){const id=++timerId;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)},
  alert(){},confirm:()=>true,iso:d=>d.toISOString().slice(0,10),$:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},calls,__ent:null,__cloud:null};
 ctx.document.querySelector=()=>element();ctx.document.addEventListener=()=>{};
 vm.createContext(ctx);
 vm.runInContext(`const SAVE_KEY='meow-work-manual-save-v3',AVATAR_KEY='meow-work-avatar-v1',SCHEDULE_KEY='meow-work-schedule-v1';const DEV_TESTING_ENABLED=false;
 let authClient=null,authUser=null,authChannel=null,authTimer=null,authBusy=false,serverPlan='free',entitlementStatus='free',entitlementUntil=null,trialStartedAt=null,billingProvider=null,providerSubscriptionId=null,cancelAtPeriodEnd=false,canceledAt=null,billingHistory=[];
 let state,lastSavedAt=null;function preferredTheme(){return 'light'}
 ${defaults}\n${normalize}\nstate=defaultState();\n${core}\n${persist}\n${meaningful}\n${active}
 function render(){}function applyTheme(){}function renderSettings(){}function renderProEntitlements(){}function renderSalary(){}async function loadBillingHistory(){}function setAccountStatus(v){globalThis.status=v}function writeIndexedBackup(){}function closeWelcome(){try{localStorage.setItem(WELCOME_KEY,'done')}catch(e){}}
 async function getAuthClient(){return {
  from(name){calls.push(name);const query={select(){return query},eq(){return query},order(){return query},limit(){return query},maybeSingle:async()=>({data:name==='user_entitlements'?__ent:__cloud,error:null}),update(){return query},insert(){return query},then(resolve){resolve({data:[{updated_at:new Date().toISOString()}],error:null})}};return query},
  removeChannel:async()=>{},channel(){calls.push('realtime');const q={on(){return q},subscribe(){return q}};return q}
 }}
 `,ctx);
 return {ctx,store,calls,timers,run:code=>vm.runInContext(code,ctx),node:id=>ctx.$(id)};
}
function paid(a,extra=''){a.run("authUser={id:'A'};localOwner='A';entitlementChecked=true;serverPlan='pro';entitlementStatus='active';entitlementUntil=new Date(Date.now()+600000).toISOString();cloudConsent=true;"+extra)}
(async()=>{
 await test('welcome and data controls have unique IDs',()=>{const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const id of ['welcomeScreen','welcomeGoogle','welcomeGuest','welcomeEmail','cloudProtection','cloudBackupNow','cloudRestoreNow','exportExistingCloud'])assert.equal(ids.filter(x=>x===id).length,1,id)});
 await test('guest choice is durable and does not clear work data',async()=>{const a=app();a.run("state.settings.baseSalary=39000;persistLocalSnapshot()");const raw=a.store.get('meow-work-manual-save-v3');await a.run('selectGuest()');assert.equal(a.store.get('meow-work-welcome-v1'),'done');assert.equal(a.store.get('meow-work-manual-save-v3'),raw);assert.equal(a.calls.length,0)});
 await test('guest does not get cloud access from a local Pro string',()=>{const a=app();a.run("serverPlan='pro';entitlementChecked=true;cloudConsent=true");assert.equal(a.run('canCloudSync()'),false)});
 await test('signed-in free account cannot sync',()=>{const a=app();a.run("authUser={id:'A'};localOwner='A';entitlementChecked=true;cloudConsent=true");assert.equal(a.run('canCloudSync()'),false)});
 await test('Pro needs explicit upload consent',()=>{const a=app();paid(a,'cloudConsent=false');assert.equal(a.run('canCloudSync()'),false)});
 await test('valid consenting Pro can sync own workspace',()=>{const a=app();paid(a);assert.equal(a.run('canCloudSync()'),true)});
 await test('valid trial can use Pro cloud access',()=>{const a=app();paid(a,"entitlementStatus='trialing'");assert.equal(a.run('canCloudSync()'),true)});
 await test('expired Pro is blocked without waiting for page reload',()=>{const a=app();paid(a,"entitlementUntil=new Date(Date.now()-1).toISOString()");assert.equal(a.run('canCloudSync()'),false)});
 await test('missing expiration does not mean lifetime Pro',()=>{const a=app();paid(a,'entitlementUntil=null');assert.equal(a.run('canCloudSync()'),false);assert.equal(a.run("entitlementIsActive({plan:'pro',status:'active',pro_until:null})"),false)});
 await test('cancel next renewal retains a still-valid paid period',()=>{const a=app();paid(a,'cancelAtPeriodEnd=true');assert.equal(a.run('canCloudSync()'),true)});
 await test('unverified or failed entitlement does not enable cloud',()=>{const a=app();paid(a,"entitlementChecked=false;entitlementStatus='error'");assert.equal(a.run('canCloudSync()'),false)});
 await test('different workspace cannot be uploaded to signed-in account',()=>{const a=app();paid(a,"localOwner='B'");assert.equal(a.run('canCloudSync()'),false)});
 await test('backup Pro flags never change server entitlement',()=>{const a=app();a.run("state=normalizeState({plan:'pro',pro_until:'2999-01-01',settings:{baseSalary:45000}})");assert.equal(a.run('state.settings.baseSalary'),45000);assert.equal(a.run('hasLivePro()'),false);assert.equal(a.run('state.plan'),undefined)});
 await test('guest edits automatically save locally with zero cloud calls',()=>{const a=app();a.run("state.schedule.shiftName='測試班';changedAndSync()");assert.equal(JSON.parse(a.store.get('meow-work-workspace-v1:guest')).state.schedule.shiftName,'測試班');assert.equal(a.calls.length,0);assert.equal(a.timers.size,0)});
 await test('local save timestamp is not updated on failure',()=>{const a=app();a.run("lastSavedAt='2026-01-01';localStorage.setItem=()=>{throw Error('quota')}");assert.equal(a.run('persistLocalSnapshot()'),false);assert.equal(a.run('lastSavedAt'),'2026-01-01');assert.equal(a.run('localSaveFailed'),true)});
 await test('guest-to-account claim keeps the guest safety copy',()=>{const a=app();a.run("state.settings.baseSalary=42000");assert.equal(a.run("switchLocalWorkspace('A',true)"),true);assert.equal(JSON.parse(a.store.get('meow-work-workspace-v1:A')).state.settings.baseSalary,42000);assert.equal(JSON.parse(a.store.get('meow-work-workspace-v1:guest')).state.settings.baseSalary,42000)});
 await test('switching A to B does not copy A salary into B',()=>{const a=app();a.run("switchLocalWorkspace('A');state.settings.baseSalary=55555;persistLocalSnapshot();switchLocalWorkspace('B')");assert.equal(a.run('state.settings.baseSalary'),0);assert.equal(JSON.parse(a.store.get('meow-work-workspace-v1:A')).state.settings.baseSalary,55555)});
 await test('returning to A restores its local workspace',()=>{const a=app();a.run("switchLocalWorkspace('A');state.settings.baseSalary=33333;persistLocalSnapshot();switchLocalWorkspace('B');switchLocalWorkspace('A')");assert.equal(a.run('state.settings.baseSalary'),33333)});
 await test('free sign-in checks entitlement but never reads work table',async()=>{const a=app();await a.run("handleSignedIn({id:'A'})");assert.deepEqual(a.calls,['user_entitlements']);assert.equal(a.run('entitlementChecked'),true);assert.equal(a.run('canCloudSync()'),false)});
 await test('direct free save and restore entry points do not query work table',async()=>{const a=app();a.run("authUser={id:'A'};localOwner='A';entitlementChecked=true");await a.run('saveAccountState();loadAccountState();subscribeAccountRealtime()');assert.equal(a.calls.length,0)});
 await test('account change invalidates a queued upload',()=>{const a=app();paid(a);a.run('queueAccountSave()');const callback=[...a.timers.values()][0];a.run("accountEpoch++;authUser={id:'B'}");callback();assert.equal(a.calls.length,0)});
 await test('stopping sync immediately cancels pending autosave',async()=>{const a=app();paid(a);a.run('queueAccountSave()');assert.equal(a.timers.size,1);await a.run('stopAccountRealtime()');assert.equal(a.timers.size,0)});
 await test('cloud status never treats login as backup success',()=>{const a=app();a.run("authUser={id:'A'};entitlementChecked=true");assert.ok(a.run('cloudNotice()').includes('免費版'));paid(a);assert.ok(a.run('cloudNotice()').includes('尚未確認'));a.run("cloudAck='2026-09-23T00:00:00Z';cloudDirty=true");assert.ok(a.run('cloudNotice()').includes('尚未完成'))});
 await test('cloud conflicts pause every automatic cloud entry',()=>{const a=app();paid(a,'cloudConflict={payload:{state:{}}}');assert.equal(a.run('canCloudSync()'),false)});
 await test('Apple button begins disabled instead of pretending to work',()=>{assert.match(html, /id="welcomeApple"[^>]*disabled/);assert.match(html, /config.external.apple===true/)});
 await test('no obsolete login-equals-cloud promise remains',()=>{assert.ok(!html.includes('登入後會自動開啟雲端同步'));assert.ok(!html.includes('authUser?\'✓ 已啟用雲端保護'));assert.ok(html.includes('資料與同步'));assert.ok(html.includes('accountEpoch===epoch'))});
 console.log(`Access separation tests: ${passed}/${passed} passed.`);
})().catch(e=>{console.error(e);process.exit(1)});
