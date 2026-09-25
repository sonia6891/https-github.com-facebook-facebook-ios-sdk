const fs=require('fs');
const assert=require('assert');
const path=require('path');

const html=fs.readFileSync('index.html','utf8');

function extractFunction(name){
  const marker='function '+name+'(';
  const start=html.indexOf(marker);
  assert(start>=0,'missing function '+name);
  const brace=html.indexOf('{',start);
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

const helperStart=html.indexOf('function meowAssistantChineseNumber');
const helperEnd=html.indexOf('function meowAssistantCalcMonthAt',helperStart);
assert(helperStart>=0&&helperEnd>helperStart,'Meow Assistant helper block missing');
const helperBlock=html.slice(helperStart,helperEnd);
const parseSource=extractFunction('meowAssistantParse');

const factory=new Function(`
  const current=new Date(2026,8,25);
  const state={settings:{defaultOvertimeHours:10}};
  const num=v=>Number(v)||0;
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  ${helperBlock}
  ${parseSource}
  return {normalizeMeowAssistantText,meowAssistantKnowledgeIntent,meowAssistantKnowledgeIntents,meowAssistantParse};
`);
const api=factory();

function routeQuestion(q){
  const normalized=api.normalizeMeowAssistantText(q);
  const parsed=api.meowAssistantParse(q);
  let route='none';
  if(parsed&&parsed.ok){
    if(parsed.type==='knowledge')route=parsed.knowledge;
    else if(parsed.type==='knowledgeMulti')route=(parsed.knowledgeList||[]).join('+');
    else route=parsed.type;
  }
  return {normalized,parsed,route};
}

const values={
  a:['早班','小夜','大夜','晚班'],
  b:['早班','小夜','大夜'],
  n:[7,8,9,10,12,46,50,54,60,72,240,288],
  h:[8,10,12,14],
  m:[10,20,30,60],
  job:['護理師','餐廳員工','保全','工廠作業員','客服'],
  allow:['夜班津貼','伙食津貼','職務加給','輪班津貼','固定獎金']
};
function fill(template,i){
  return template.replace(/\{(\w+)\}/g,(_,k)=>{
    const arr=values[k]||[''];
    return String(arr[i%arr.length]);
  });
}

const categories={
  shift_rest_interval:['{a}下班後只休{n}小時又上{b}可以嗎','{a}接{b}中間只有{n}小時合理嗎'],
  consecutive_work_days:['公司排我連續上班{n}天可以嗎','我已經連上{n}天還不能休嗎'],
  work_break:['上班{h}小時只休{m}分鐘可以嗎','連續工作{h}小時沒有休息正常嗎'],
  split_shift:['{job}兩頭班中間空{n}小時算工時嗎','早晚兩段班中間{n}小時要留現場算休息嗎'],
  on_call_standby:['{job}在家待命算工時嗎','休假還要 on call 算不算上班'],
  handover_work_time:['{job}交班多{m}分鐘沒算加班','上班前提早{m}分鐘交接要算工時嗎'],
  cross_midnight_shift:['晚上8點做到隔天8點算哪一天','跨午夜班的工時要記在哪一天'],
  schedule_change:['主管提前{n}小時臨時改班可以嗎','明天原本早班突然被改大夜合理嗎'],
  shift_swap:['跟同事換班後遇到國定假日怎麼算','換班後兩班只隔{n}小時怎麼辦'],
  overtime_limit:['這個月已經加班{n}小時還可以再加嗎','公司每月排我加班{n}小時合法嗎'],
  compensatory_leave:['加班換補休到期沒休完怎麼辦','公司規定加班只能補休不能領錢可以嗎'],
  holiday_transfer:['公司把國定假日移到別天可以嗎','國定假日調移後原本那天上班怎麼算'],
  overtime_wage_base:['{allow}要算進加班費基數嗎','算加班費只看底薪不算{allow}對嗎'],
  annual_leave_termination:['離職剩{n}天特休怎麼辦','特休沒休完離職會折現嗎'],
  pregnancy_night_shift:['懷孕還能排{b}嗎','孕婦可以上大夜嗎'],
  flexible_working_hours:['公司說四週變形工時所以能連上{n}天嗎','八週變形工時一週排{n}小時可以嗎'],
  article_84_1:['我是保全每天{h}小時 84-1 就合法嗎','84-1 一個月上{n}小時可以嗎'],
  part_time_rights:['工讀生國定假日上班薪水怎麼算','兼職休息日出勤怎麼算'],
  natural_disaster:['颱風天原本排班沒去會扣薪嗎','颱風天出勤一定要加倍薪嗎'],
  mandatory_overtime:['公司臨時叫我加班可以拒絕嗎','主管不准我下班一定要加班合理嗎'],
  attendance_record:['公司叫我先打卡下班再繼續工作','出勤紀錄和實際工作時間不同怎麼辦'],
  training_meeting_time:['休假日回公司教育訓練算加班嗎','下班後開會算工時嗎'],
  meal_break_on_duty:['吃飯時不能離開崗位算休息嗎','用餐時間還要接電話算工時嗎'],
  schedule_notice:['班表最晚要提前幾天公布','公司每天臨時改班表可以嗎'],
  fixed_shift:['固定大夜不是輪班 11 小時間隔還適用嗎','固定晚班也算輪班制嗎']
};

const discovery=[];
for(const [target,templates] of Object.entries(categories)){
  for(let i=0;i<12;i++){
    const q=fill(templates[i%templates.length],i);
    const r=routeQuestion(q);
    const generic=/^(scheduleGeneral|payrollGeneral)$/.test(r.route);
    const noRoute=r.route==='none';
    discovery.push({group:'semantic_discovery',target,q,route:r.route,status:noRoute?'no_route':generic?'generic':'existing_specific'});
  }
}
assert.strictEqual(discovery.length,300,'semantic discovery must be 300 cases');

const contextSeeds=[
  ['昨天我加了一個10小時加班','那個幫我拿掉','remove_previous_overtime'],
  ['我剛剛說22號加班','不是22，是24','correct_previous_date'],
  ['先看八月份班表','那九月呢','carry_schedule_month_context'],
  ['這個月薪水怎麼少那麼多','那上個月呢','carry_payroll_month_context'],
  ['明天大夜','那後天？','carry_shift_date_context'],
  ['剛剛那筆扣款不是我的','第二筆也不是','resolve_ordinal_reference']
];
const context=[];
for(let i=0;i<60;i++){
  const [previous,followup,target]=contextSeeds[i%contextSeeds.length];
  const r=routeQuestion(followup);
  context.push({group:'context_followup',target,previous,followup,route:r.route,status:r.route==='none'?'context_gap':'standalone_route'});
}
assert.strictEqual(context.length,60,'context group must be 60 cases');

const multiTemplates=[
  ['今天什麼班，而且我這個月已經加班50小時還能再加嗎',['todayShift','overtime_limit']],
  ['明天大夜，跟今天的班中間只有8小時，這樣可以嗎',['tomorrowShift','shift_rest_interval']],
  ['我離職還有五天特休，這個月薪資也想一起算',['annual_leave_termination','estimatedPay']],
  ['颱風天我原本排夜班，沒去的話會扣薪嗎',['natural_disaster']],
  ['國定假日被移到別天，我那天又有加班怎麼算',['holiday_transfer','overtimePay']]
];
const multi=[];
for(let i=0;i<40;i++){
  const [q,targets]=multiTemplates[i%multiTemplates.length];
  const r=routeQuestion(q);
  multi.push({group:'multi_intent',targets,q,route:r.route,status:r.route==='none'?'no_route':r.route.includes('+')?'multi_route':'single_route'});
}
assert.strictEqual(multi.length,40,'multi group must be 40 cases');

const all=[...discovery,...context,...multi];
assert.strictEqual(all.length,400,'automatic discovery corpus must be exactly 400 cases');

const summary={
  generated_at:new Date().toISOString(),
  build:(html.match(/<meta name="meow-ui-build" content="([^"]+)"/)||[])[1]||'unknown',
  total:all.length,
  semantic_discovery:{
    total:discovery.length,
    no_route:discovery.filter(x=>x.status==='no_route').length,
    generic:discovery.filter(x=>x.status==='generic').length,
    existing_specific:discovery.filter(x=>x.status==='existing_specific').length
  },
  context_followup:{
    total:context.length,
    context_gap:context.filter(x=>x.status==='context_gap').length,
    standalone_route:context.filter(x=>x.status==='standalone_route').length
  },
  multi_intent:{
    total:multi.length,
    no_route:multi.filter(x=>x.status==='no_route').length,
    single_route:multi.filter(x=>x.status==='single_route').length,
    multi_route:multi.filter(x=>x.status==='multi_route').length
  },
  category_breakdown:{}
};

for(const target of Object.keys(categories)){
  const rows=discovery.filter(x=>x.target===target);
  summary.category_breakdown[target]={
    total:rows.length,
    no_route:rows.filter(x=>x.status==='no_route').length,
    generic:rows.filter(x=>x.status==='generic').length,
    existing_specific:rows.filter(x=>x.status==='existing_specific').length,
    observed_routes:[...new Set(rows.map(x=>x.route))]
  };
}

fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync(path.join('test-results','meow-assistant-auto-discovery.json'),JSON.stringify({summary,cases:all},null,2));
console.log(JSON.stringify(summary,null,2));
console.log('PASS Meow Assistant automatic discovery corpus executed: 400 cases');
