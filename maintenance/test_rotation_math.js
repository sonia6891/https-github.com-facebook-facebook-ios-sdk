const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const before=fs.readFileSync(process.argv[2]+'/index.html','utf8'),after=fs.readFileSync(process.argv[3]+'/index.html','utf8');
const raw=fs.readFileSync(__dirname+'/rotation.js','utf8');
const core=raw.slice(0,raw.indexOf('function rotationCompactLabel'))+raw.slice(raw.indexOf('function parseRotationSequence'),raw.indexOf('function rotationDraftPreview'));
const dates=before.slice(before.indexOf('function dateParts('),before.indexOf('function setDateControlValue('));
const baseFn=before.match(/function scheduleForDate\(dt\)\{[^\n]+/)[0];
const newFn=after.match(/function scheduleForDate\(dt\)\{[^\n]+/)[0];
function make(fn,sch,extra=''){return vm.runInNewContext('const DAY=86400000;const iso=d=>d.toISOString().slice(0,10);'+dates+extra+fn+';({get:scheduleForDate,rot:typeof threeShiftForDate==="function"?threeShiftForDate:null,parse:typeof parseRotationSequence==="function"?parseRotationSequence:null})',{state:{schedule:sch},Date});}
let checks=0;
for(const [w,o] of [[2,2],[4,3],[3,2],[1,1],[7,3]]){
 const sch={preset:w===2?'2-2':w===4?'4-3':'custom',workDays:w,offDays:o,startDate:'2024-02-29'};
 const old=make(baseFn,sch),now=make(newFn,sch,core);
 for(let d=-500;d<900;d++){const date=new Date(2024,1,29+d);assert.equal(now.get(date),old.get(date));checks++}
}
const plan={preset:'four-three',workDays:2,offDays:2,startDate:'2026-09-01',rotation:{startDate:'2024-02-28',sequence:['early','middle','night','off']}};
const api=make(newFn,plan,core);
for(const [date,key] of [['2024-02-27','off'],['2024-02-28','early'],['2024-02-29','middle'],['2024-03-01','night'],['2024-03-02','off'],['2024-03-03','early']]){assert.equal(api.rot(new Date(date+'T12:00:00')).key,key);checks++}
for(let d=-500;d<900;d++){assert.equal(api.rot(new Date(2024,1,28+d)).key,plan.rotation.sequence[((d%4)+4)%4]);checks++}
assert.equal(api.parse('早班，中班，夜班，休假').join(','),'early,middle,night,off');
assert.equal(api.parse('早早中中夜夜休休'),null);assert.equal(api.parse('早 中 夜'),null);assert.equal(api.parse('早 中 夜 胡說'),null);
plan.rotation.sequence=['early','early','middle','middle','night','night','off','off'];plan.rotation.startDate='2026-09-01';
let work=0;for(let d=1;d<=30;d++)if(api.get(new Date(2026,8,d))==='work')work++;
assert.equal(work,24);
plan.rotation.sequence=['evil'];assert.equal(api.rot(new Date()),null);
console.log(JSON.stringify({passed:true,date_math_checks:checks,legacy_preserved:true,september_rotation_work_days:work}));
