const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');

function extractFunction(name){
  const marker='function '+name+'(';
  const raw=html.indexOf(marker);
  assert(raw>=0,'missing function '+name);
  const start=html.slice(Math.max(0,raw-6),raw)==='async '?raw-6:raw;
  const brace=html.indexOf('{',raw);
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

const source=[
  'meowAssistantDateLabel','meowAssistantPlanCheck','meowAssistantOvertimeRecord',
  'executeMeowAssistantPlan','undoMeowAssistant','meowAssistantValidIsoDate',
  'handleMeowAssistantAiOperation'
].map(extractFunction).join('\n');

function makeHarness(){
  const factory=new Function(`
    const state={dayStatus:{},settings:{defaultOvertimeHours:10}};
    let current=new Date(2026,8,1);
    let meowAssistantUndo=null;
    let meowAssistantPending=null;
    const replies=[];
    const monthViews=[];
    const num=v=>Number(v)||0;
    const pad=n=>String(n).padStart(2,'0');
    const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const scheduleForDate=()=> 'work';
    const syncMonthOvertimeFromCalendar=()=>{};
    const changedAndSync=()=>{};
    const render=()=>{};
    const showMeowAssistantMonth=async(y,m)=>monthViews.push({y,m});
    const renderMeowAssistantReply=(message,type='')=>replies.push({message,type});
    const ui={classList:{add(){},remove(){}}};
    const $=id=>id==='meowAssistantUndo'||id==='meowAssistantPreview'?ui:null;
    ${source}
    return {
      run:handleMeowAssistantAiOperation,
      state,replies,monthViews,
      setStatus:(date,value)=>{state.dayStatus[date]=value},
      snapshot:()=>JSON.parse(JSON.stringify(state.dayStatus))
    };
  `);
  return factory();
}

function op(kind,extra={}){
  return Object.assign({kind,dates:[],fromDate:null,toDate:null,hours:null,year:null,month:null},extra);
}
function route(operation,confidence=.99,clarifyingQuestion=null){
  return {understood:true,confidence,clarifyingQuestion,operation};
}
function isoDay(day){
  return '2026-09-'+String(day).padStart(2,'0');
}

(async()=>{
  let turns=0;
  let blocked=0;
  let lowConfidenceBlocked=0;
  let undos=0;

  for(let scenario=0;scenario<100;scenario++){
    const api=makeHarness();
    const base=1+(scenario%18);
    const a=isoDay(base);
    const b=isoDay(base+1);
    const c=isoDay(base+2);
    const d=isoDay(base+3);
    const h1=2+(scenario%9);
    const h2=1+((scenario*3)%10);

    // Turn 1: add overtime.
    await api.run(route(op('add_overtime',{dates:[a],hours:h1}))); turns++;
    assert.strictEqual(api.state.dayStatus[a].hours,h1);

    // Turn 2: correction / revise hours on the same contextual item.
    await api.run(route(op('add_overtime',{dates:[a],hours:h2}))); turns++;
    assert.strictEqual(api.state.dayStatus[a].hours,h2);

    // Turn 3: ambiguous pronoun with low confidence must not delete anything.
    const beforeLow=JSON.stringify(api.snapshot());
    await api.run(route(op('remove_overtime',{dates:[a]}),.62,'你是指剛剛那筆加班嗎？')); turns++;
    assert.strictEqual(JSON.stringify(api.snapshot()),beforeLow);
    lowConfidenceBlocked++;

    // Turn 4: move contextual overtime.
    await api.run(route(op('move_overtime',{fromDate:a,toDate:b}))); turns++;
    assert(!api.state.dayStatus[a]);
    assert.strictEqual(api.state.dayStatus[b].hours,h2);

    // Turn 5: user regrets the move.
    await api.run(route(op('undo_last'))); turns++;
    assert.strictEqual(api.state.dayStatus[a].hours,h2);
    assert(!api.state.dayStatus[b]);
    undos++;

    // Turn 6: destination has leave. Must block and preserve state.
    api.setStatus(c,{type:'annual',hours:8,note:'特休'});
    const beforeConflict=JSON.stringify(api.snapshot());
    await api.run(route(op('move_overtime',{fromDate:a,toDate:c}))); turns++;
    assert.strictEqual(JSON.stringify(api.snapshot()),beforeConflict);
    blocked++;

    // Turn 7: add a separate overtime record.
    await api.run(route(op('add_overtime',{dates:[d],hours:4}))); turns++;
    assert.strictEqual(api.state.dayStatus[d].hours,4);

    // Turn 8: remove original contextual record.
    await api.run(route(op('remove_overtime',{dates:[a]}))); turns++;
    assert(!api.state.dayStatus[a]);
    assert.strictEqual(api.state.dayStatus[d].hours,4);

    // Turn 9: undo the removal only; unrelated records survive.
    await api.run(route(op('undo_last'))); turns++;
    assert.strictEqual(api.state.dayStatus[a].hours,h2);
    assert.strictEqual(api.state.dayStatus[d].hours,4);
    assert.strictEqual(api.state.dayStatus[c].type,'annual');
    undos++;

    // Turn 10: view schedule cannot mutate state.
    const beforeView=JSON.stringify(api.snapshot());
    await api.run(route(op('view_schedule',{year:2026,month:9}))); turns++;
    assert.strictEqual(JSON.stringify(api.snapshot()),beforeView);
    assert.deepStrictEqual(api.monthViews,[{y:2026,m:8}]);
  }

  assert.strictEqual(turns,1000,'must execute exactly 1000 multi-turn operations');
  assert.strictEqual(blocked,100);
  assert.strictEqual(lowConfidenceBlocked,100);
  assert.strictEqual(undos,200);

  console.log(JSON.stringify({
    pass:true,
    conversations:100,
    turns,
    blocked_conflicts:blocked,
    blocked_low_confidence:lowConfidenceBlocked,
    undo_operations:undos
  }));
  console.log('PASS Meow Assistant multi-turn fuzz: 100 conversations / 1000 stateful turns');
})().catch(err=>{console.error(err);process.exit(1)});
