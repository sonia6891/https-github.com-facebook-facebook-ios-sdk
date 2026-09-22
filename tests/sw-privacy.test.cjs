'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const handlers={};const context={URL,Request,console,self:{location:{href:'https://meow.example/app/sw.js'},addEventListener:(name,handler)=>handlers[name]=handler},caches:{},fetch(){throw Error('unexpected network')}};
vm.createContext(context);vm.runInContext(fs.readFileSync('sw.js','utf8'),context);
const allowed=url=>vm.runInContext(`isStaticRequest(new Request(${JSON.stringify(url)}))`,context);
assert.equal(allowed('https://meow.example/app/assets/onboarding.css?v=112'),true);
assert.equal(allowed('https://meow.example/app/assets/onboarding-brand-cat.webp?v=112'),true);
assert.equal(allowed('https://ygrlvmyqrhyfkglomsbq.supabase.co/rest/v1/user_sync_state'),false);
assert.equal(allowed('https://meow.example/app/auth/v1/user'),false);
assert.equal(allowed('https://meow.example/unrelated/file.css'),false);
assert.equal(vm.runInContext("isStaticRequest(new Request('https://meow.example/app/assets/onboarding.css',{headers:{Authorization:'Bearer test'}}))",context),false);
for(const url of ['https://ygrlvmyqrhyfkglomsbq.supabase.co/rest/v1/user_sync_state','https://meow.example/app/auth/v1/user']){
 let intercepted=false;handlers.fetch({request:new Request(url),respondWith(){intercepted=true}});assert.equal(intercepted,false);
}
console.log('Service worker privacy: 8 assertions passed; auth and cloud API requests are not cached.');
