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

const names=[
  'meowAssistantDateLabel','meowAssistantPlanCheck','meowAssistantOvertimeRecord',
  'executeMeowAssistantPlan','undoMeowAssistant','meowAssistantValidIsoDate',
  'handleMeowAssistantAiOperation'
];
const source=names.map(extractFunction).join('\n');

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
    state,
    replies,
    monthViews,
    undo:()=>meowAssistantUndo?JSON.parse(JSON.stringify(meowAssistantUndo)):null
  };
`);

const api=factory();

function route(operation,confidence=.99,clarifyingQuestion=null){
  return api.run({
    understood:true,
    confidence,
    clarifyingQuestion,
    operation
  });
}

(async()=>{
  // 1. 「22號幫我加班10小時」
  await route({
    kind:'add_overtime',dates:['2026-09-22'],fromDate:null,toDate:null,hours:10,year:null,month:null
  });
  assert.strictEqual(api.state.dayStatus['2026-09-22'].type,'overtime');
  assert.strictEqual(api.state.dayStatus['2026-09-22'].hours,10);

  // 2. 「不對，是8小時」——同一日期更新，而不是新增第二筆。
  await route({
    kind:'add_overtime',dates:['2026-09-22'],fromDate:null,toDate:null,hours:8,year:null,month:null
  });
  assert.strictEqual(api.state.dayStatus['2026-09-22'].hours,8);
  assert.strictEqual(Object.keys(api.state.dayStatus).filter(k=>api.state.dayStatus[k]?.type==='overtime').length,1);

  // 3. 「那移到禮拜五」→ 9/25。
  await route({
    kind:'move_overtime',dates:[],fromDate:'2026-09-22',toDate:'2026-09-25',hours:null,year:null,month:null
  });
  assert(!api.state.dayStatus['2026-09-22'],'source overtime must be removed after move');
  assert.strictEqual(api.state.dayStatus['2026-09-25'].hours,8);

  // 4. 「算了，剛剛那個不要了」→ 復原上一個 move。
  await route({
    kind:'undo_last',dates:[],fromDate:null,toDate:null,hours:null,year:null,month:null
  });
  assert.strictEqual(api.state.dayStatus['2026-09-22'].hours,8,'undo must restore source date');
  assert(!api.state.dayStatus['2026-09-25'],'undo must remove moved destination');

  // 5. 目的日已有特休，AI 即使解析成功也不能覆蓋。
  api.state.dayStatus['2026-09-28']={type:'annual',hours:8,note:'已排特休'};
  const before=JSON.stringify(api.state.dayStatus);
  await route({
    kind:'move_overtime',dates:[],fromDate:'2026-09-22',toDate:'2026-09-28',hours:null,year:null,month:null
  });
  assert.strictEqual(JSON.stringify(api.state.dayStatus),before,'conflicting leave day must block mutation');
  assert(api.replies.some(x=>/不覆蓋|其他出勤|假別/.test(x.message)),'conflict warning missing');

  // 6. 「那筆加班拿掉」
  await route({
    kind:'remove_overtime',dates:['2026-09-22'],fromDate:null,toDate:null,hours:null,year:null,month:null
  });
  assert(!api.state.dayStatus['2026-09-22'],'overtime should be removed');

  // 7. 「復原」→ 把剛刪掉的 8 小時加班找回來。
  await route({
    kind:'undo_last',dates:[],fromDate:null,toDate:null,hours:null,year:null,month:null
  });
  assert.strictEqual(api.state.dayStatus['2026-09-22'].hours,8,'undo after removal must restore overtime');
  assert.strictEqual(api.state.dayStatus['2026-09-28'].type,'annual','unrelated leave record must survive');

  // 8. 低信心的「那個拿掉」不可誤刪。
  const stable=JSON.stringify(api.state.dayStatus);
  await route({
    kind:'remove_overtime',dates:['2026-09-22'],fromDate:null,toDate:null,hours:null,year:null,month:null
  },.71,'你是指 9/22 的加班嗎？');
  assert.strictEqual(JSON.stringify(api.state.dayStatus),stable,'low-confidence contextual request must not mutate');

  assert(html.includes("'undo_last'")||html.includes('"undo_last"'),'undo operation wiring missing');

  console.log('PASS Meow Assistant multi-turn E2E state flow: add → revise → move → undo → conflict block → remove → undo');
})().catch(err=>{console.error(err);process.exit(1)});
