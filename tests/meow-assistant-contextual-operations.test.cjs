const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');
const edge=fs.readFileSync('supabase/functions/meow-assistant-route/index.ts','utf8');

function extractFunction(name){
  const marker='function '+name+'(';
  const rawStart=html.indexOf(marker);
  assert(rawStart>=0,'missing function '+name);
  const start=html.slice(Math.max(0,rawStart-6),rawStart)==='async '?rawStart-6:rawStart;
  const brace=html.indexOf('{',rawStart);
  let depth=0,inStr='',esc=false,inRegex=false,inClass=false;
  for(let i=brace;i<html.length;i++){
    const ch=html[i],prev=html[i-1]||'';
    if(inStr){
      if(esc){esc=false;continue}
      if(ch==='\\'){esc=true;continue}
      if(ch===inStr)inStr='';
      continue;
    }
    if(inRegex){
      if(esc){esc=false;continue}
      if(ch==='\\'){esc=true;continue}
      if(ch==='[')inClass=true;
      else if(ch===']')inClass=false;
      else if(ch==='/'&&!inClass)inRegex=false;
      continue;
    }
    if(ch==="'"||ch==='`'||ch==='"'){inStr=ch;continue}
    if(ch==='/'&&prev!=='/'&&html[i+1]!=='/'&&html[i+1]!=='*'){inRegex=true;continue}
    if(ch==='{')depth++;
    if(ch==='}'){
      depth--;
      if(depth===0)return html.slice(start,i+1);
    }
  }
  throw new Error('unterminated '+name);
}

const validSource=extractFunction('meowAssistantValidIsoDate');
const opSource=extractFunction('handleMeowAssistantAiOperation');

const calls={renders:[],checks:[],executes:[],months:[]};
let checkResult=null;

const factory=new Function('__calls','__getCheck',`
  const num=v=>Number(v)||0;
  const state={settings:{defaultOvertimeHours:10}};
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const renderMeowAssistantReply=(m,t='')=>__calls.renders.push({m,t});
  const meowAssistantPlanCheck=p=>{__calls.checks.push(JSON.parse(JSON.stringify(p)));return __getCheck()||p};
  const executeMeowAssistantPlan=p=>{__calls.executes.push(JSON.parse(JSON.stringify(p)));return true};
  const showMeowAssistantMonth=async(y,m)=>{__calls.months.push({y,m})};
  ${validSource}
  ${opSource}
  return {run:handleMeowAssistantAiOperation};
`);
const api=factory(calls,()=>checkResult);

(async()=>{
  // High-confidence contextual removal must still go through local validation.
  calls.renders=[];calls.checks=[];calls.executes=[];checkResult=null;
  let handled=await api.run({
    confidence:.97,
    operation:{kind:'remove_overtime',dates:['2026-09-22'],fromDate:null,toDate:null,hours:null,year:null,month:null}
  });
  assert.strictEqual(handled,true);
  assert.strictEqual(calls.checks.length,1,'AI mutation must pass local plan check');
  assert.strictEqual(calls.executes.length,1,'validated mutation should execute');
  assert.deepStrictEqual(calls.executes[0],{ok:true,type:'remove',dates:['2026-09-22']});

  // Low confidence may never mutate.
  calls.renders=[];calls.checks=[];calls.executes=[];checkResult=null;
  handled=await api.run({
    confidence:.6,
    clarifyingQuestion:'你是指 9/22 那筆加班嗎？',
    operation:{kind:'remove_overtime',dates:['2026-09-22'],fromDate:null,toDate:null,hours:null,year:null,month:null}
  });
  assert.strictEqual(handled,true);
  assert.strictEqual(calls.checks.length,0);
  assert.strictEqual(calls.executes.length,0,'low-confidence AI route must not mutate');
  assert(calls.renders[0].m.includes('9/22'),'clarifying question should be shown');

  // Invalid / hallucinated dates may never mutate.
  calls.renders=[];calls.checks=[];calls.executes=[];checkResult=null;
  handled=await api.run({
    confidence:.99,
    operation:{kind:'move_overtime',dates:[],fromDate:'2026-02-30',toDate:'2026-03-02',hours:null,year:null,month:null}
  });
  assert.strictEqual(handled,true);
  assert.strictEqual(calls.executes.length,0,'invalid date must not execute');

  // Local conflict rejection must win over AI.
  calls.renders=[];calls.checks=[];calls.executes=[];
  checkResult={ok:false,message:'9/24 已經有其他出勤／假別紀錄，我先不覆蓋。'};
  handled=await api.run({
    confidence:.99,
    operation:{kind:'move_overtime',dates:[],fromDate:'2026-09-22',toDate:'2026-09-24',hours:null,year:null,month:null}
  });
  assert.strictEqual(handled,true);
  assert.strictEqual(calls.executes.length,0,'local validator rejection must block mutation');
  assert(calls.renders.some(x=>x.m.includes('不覆蓋')));

  // View schedule is navigation, not mutation.
  calls.renders=[];calls.checks=[];calls.executes=[];calls.months=[];checkResult=null;
  handled=await api.run({
    confidence:.95,
    operation:{kind:'view_schedule',dates:[],fromDate:null,toDate:null,hours:null,year:2026,month:9}
  });
  assert.strictEqual(handled,true);
  assert.deepStrictEqual(calls.months,[{y:2026,m:8}]);
  assert.strictEqual(calls.executes.length,0);

  // Router contract must explicitly support contextual operations.
  for(const token of ['add_overtime','remove_overtime','move_overtime','view_schedule']){
    assert(edge.includes(token),'edge operation enum missing '+token);
  }
  assert(edge.includes('referencesPriorContext=true'),'contextual-operation prompt guard missing');
  assert(edge.includes('YYYY-MM-DD'),'operation date normalization missing');
  assert(edge.includes('sensitive_mutation'),'mutation risk classification missing');
  assert(html.includes('if(num(route.confidence)<.88)'),'confidence gate missing');
  assert(html.includes('meowAssistantPlanCheck'),'local validation bridge missing');

  console.log('PASS Meow Assistant contextual operations: AI resolves, local validator controls mutations');
})().catch(err=>{console.error(err);process.exit(1)});
