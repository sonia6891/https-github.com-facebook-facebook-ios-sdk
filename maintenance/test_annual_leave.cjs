const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.argv[2]||'index.html',html=fs.readFileSync(file,'utf8');
const a=html.indexOf('function annualDate('),b=html.indexOf('function yearlyLeaveUsage(',a);
assert.ok(a>=0&&b>a,'annual functions are in production source');
const ctx={Date,console,Math,Number,Object,String,Array,Intl,state:{settings:{},dayStatus:{}},nodes:{}};
vm.createContext(ctx);
vm.runInContext(`const pad=n=>String(n).padStart(2,'0');const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:0};function daysInMonth(y,m){return new Date(y,m+1,0).getDate()}function fmtHours(v){return Number(v||0).toLocaleString('zh-TW',{maximumFractionDigits:1})}const $=id=>nodes[id]||(nodes[id]={});const document={activeElement:null};`,ctx);
vm.runInContext(html.slice(a,b),ctx);
const day=s=>new Date(s+'T00:00:00');let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name)}
function setup(hire,extra={}){ctx.state={settings:{hireDate:hire,annualLeaveCycle:'anniversary',dailyWorkHours:12,annualUsedHoursByPeriod:{},...extra},dayStatus:{}}}
function legal(hire,date){setup(hire);return ctx.statutoryAnnualLeaveDays(day(date))}
for(const [name,hire,asOf,expected] of [
 ['not configured','','2026-09-23',0],['future hire','2026-10-01','2026-09-23',0],
 ['day before six months','2026-03-23','2026-09-22',0],['six months','2026-03-23','2026-09-23',3],
 ['one year','2025-09-23','2026-09-23',7],['two years','2024-09-23','2026-09-23',10],
 ['three years','2023-09-23','2026-09-23',14],['four years','2022-09-23','2026-09-23',14],
 ['five years','2021-09-23','2026-09-23',15],['nine years','2017-09-23','2026-09-23',15],
 ['ten years','2016-09-23','2026-09-23',16],['eleven years','2015-09-23','2026-09-23',17],
 ['24 years ceiling','2002-09-23','2026-09-23',30],['35 years ceiling','1991-09-23','2026-09-23',30],
 ['month-end half year','2025-08-31','2026-02-28',3],['leap-day anniversary','2024-02-29','2025-02-28',7],
 ['invalid date','2025-02-30','2026-09-23',0]])test(name,()=>assert.equal(legal(hire,asOf),expected));
test('anniversary balances, supplemental hours, reservations, and old company override',()=>{
 setup('2022-09-01',{annualLeaveDays:999});let p=ctx.annualLeavePeriod(day('2026-09-23'));
 ctx.state.settings.annualUsedHoursByPeriod[p.key]=24;
 ctx.state.dayStatus={'2026-08-31':{type:'annual',hours:8},'2026-09-01':{type:'annual',hours:8},'2026-09-22':{type:'sick',hours:8},'2026-10-01':{type:'annual',hours:4},'2027-09-01':{type:'annual',hours:8}};
 const i=ctx.annualLeaveBalanceInfo(day('2026-09-23'));
 assert.equal(i.totalDays,14);assert.equal(i.totalHours,112);assert.equal(i.usedHours,32);assert.equal(i.plannedHours,4);assert.equal(i.remainHours,76);
 assert.equal(ctx.annualSupplementHours(ctx.annualLeavePeriod(day('2027-09-23'))),0);
 assert.equal(ctx.state.settings.annualUsedHoursByPeriod[p.key],24,'history is retained');
});
test('half-year grant is not deducted again from first anniversary',()=>{
 setup('2025-09-23');const p=ctx.annualLeavePeriod(day('2026-05-01'));ctx.state.settings.annualUsedHoursByPeriod[p.key]=24;
 ctx.state.dayStatus={'2026-06-01':{type:'annual',hours:8}};
 const i=ctx.annualLeaveBalanceInfo(day('2026-09-23'));
 assert.equal(i.totalHours,56);assert.equal(i.usedHours,0);assert.equal(i.remainHours,56);
});
test('anniversary period counts prior-calendar-year records',()=>{
 setup('2020-11-01');ctx.state.dayStatus={'2025-12-12':{type:'annual',hours:8},'2026-02-03':{type:'annual',hours:4},'2025-10-31':{type:'annual',hours:9}};
 assert.equal(ctx.annualLeaveBalanceInfo(day('2026-09-23')).recordedHours,12);
});
test('period boundary settlement and anniversary rollover',()=>{
 setup('2022-09-23');let p=ctx.annualLeavePeriod(day('2026-09-22'));assert.equal(p.date.getDate(),22);assert.equal(p.date.getMonth(),8);
 p=ctx.annualLeavePeriod(day('2026-09-23'));assert.equal(p.start.getFullYear(),2026);assert.equal(p.date.getFullYear(),2027);
});
test('calendar and custom periods remain supported',()=>{
 setup('2020-01-01',{annualLeaveCycle:'calendar'});let i=ctx.annualLeaveBalanceInfo(day('2026-09-23'));
 assert.equal(i.totalDays,15);assert.equal(i.period.start.getMonth(),0);assert.equal(i.period.date.getMonth(),11);
 setup('2020-04-01',{annualLeaveCycle:'custom',annualCustomDate:'2026-03-31'});
 i=ctx.annualLeaveBalanceInfo(day('2026-09-23'));assert.equal(i.totalDays,15);assert.equal(i.period.start.getMonth(),3);assert.equal(i.period.date.getFullYear(),2027);
 ctx.state.settings.annualCustomDate='';assert.equal(ctx.annualLeaveBalanceInfo(day('2026-09-23')).period.missing,true);
});
test('calendar tier transition is a labeled proportional estimate',()=>{
 setup('2024-07-01',{annualLeaveCycle:'calendar'});const i=ctx.annualLeaveBalanceInfo(day('2026-09-23'));
 assert.ok(i.totalDays>7&&i.totalDays<10);assert.ok(ctx.annualBalanceText(i).includes('比例試算'));
});
test('invalid and over-quota hours cannot create negative balance',()=>{
 setup('2022-09-01');const p=ctx.annualLeavePeriod(day('2026-09-23'));
 ctx.state.settings.annualUsedHoursByPeriod[p.key]=-9;assert.equal(ctx.annualSupplementHours(p),0);
 ctx.state.settings.annualUsedHoursByPeriod[p.key]=Infinity;assert.equal(ctx.annualSupplementHours(p),0);
 ctx.state.settings.annualUsedHoursByPeriod[p.key]=130;const i=ctx.annualLeaveBalanceInfo(day('2026-09-23'));assert.equal(i.remainHours,0);assert.equal(i.overHours,18);
});
test('only the manual grant is removed; unrelated controls retained',()=>{
 assert.ok(!html.includes('settingAnnualDays'));assert.ok(!html.includes('公司年度核給特休總天數'));
 assert.ok(/id="settingAnnualQuota"[^>]*readonly/.test(html));
 for(const id of ['settingAnnualUsedHours','settingHireDate','settingAnnualCycle','settingSickUsedHours','settingPersonalUsedHours','patternPreset','settingPayday'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('changedAndSync();render();'),'new usage handler uses existing persistence');
});
console.log(`All ${count} annual-leave tests passed.`);
