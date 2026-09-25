const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');
const edge=fs.readFileSync('supabase/functions/meow-assistant-route/index.ts','utf8');
const kb=JSON.parse(fs.readFileSync('assets/meow-labor-knowledge-v1.json','utf8'));

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
    if(ch==="'"||ch==='\`'||ch==='"'){inStr=ch;continue}
    if(ch==='/'&&prev!=='/'&&html[i+1]!=='/'&&html[i+1]!=='*'){inRegex=true;continue}
    if(ch==='{')depth++;
    if(ch==='}'){
      depth--;
      if(depth===0)return html.slice(start,i+1);
    }
  }
  throw new Error('unterminated '+name);
}

const rulesStart=html.indexOf('const MEOW_ASSISTANT_KNOWLEDGE_RULES=[');
const rulesEnd=html.indexOf('function meowAssistantKnowledgeIntents',rulesStart);
assert(rulesStart>=0&&rulesEnd>rulesStart,'knowledge rules block missing');
const rulesBlock=html.slice(rulesStart,rulesEnd);
const normalize=extractFunction('normalizeMeowAssistantText');
const intents=extractFunction('meowAssistantKnowledgeIntents');
const intent=extractFunction('meowAssistantKnowledgeIntent');

const api=new Function(`
  function meowAssistantChineseNumber(raw){
    const s=String(raw||'').replace(/[兩两]/g,'二');
    if(/^\\d+$/.test(s))return Number(s);
    const digit={'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
    if(s==='十')return 10;
    if(s.startsWith('廿'))return 20+(digit[s[1]]||0);
    if(s.startsWith('卅'))return 30+(digit[s[1]]||0);
    const ten=s.indexOf('十');
    if(ten>=0){
      const a=ten===0?1:(digit[s[0]]||0),b=ten===s.length-1?0:(digit[s[ten+1]]||0);
      return a*10+b;
    }
    return s.length===1&&digit[s]!==undefined?digit[s]:NaN;
  }
  ${normalize}
  ${rulesBlock}
  ${intents}
  ${intent}
  return {normalizeMeowAssistantText,meowAssistantKnowledgeIntent,meowAssistantKnowledgeIntents};
`)();

const cases=[
  ['婚假有幾天','marriageLeave'],
  ['結婚假怎麼請','marriageLeave'],
  ['婚假14天上路了嗎','marriageLeave'],
  ['家庭照顧假有幾天','familyCareLeave'],
  ['家照假能請幾小時','familyCareLeave'],
  ['小孩打預防針可以請家庭照顧假嗎','familyCareLeave'],
  ['病假可以請幾天','sickLeaveRights'],
  ['請病假會被扣考績嗎','sickLeaveRights'],
  ['病假全勤怎麼扣','sickLeaveRights'],
  ['依法特休有幾天','annualLeaveRule'],
  ['工作滿三年特休幾天','annualLeaveRule'],
  ['我的特休還剩幾天','annualLeave'],
  ['年假餘額還多少','annualLeave'],
  ['最低工資多少','minimumWage'],
  ['基本時薪多少','minimumWage'],
  ['明年最低工資調多少','minimumWage'],
  ['事假一年幾天','personalLeaveRule'],
  ['事假有薪水嗎','personalLeaveRule'],
  ['病假扣薪多少','sickLeavePay'],
  ['事假扣多少薪水','sickLeavePay']
];

const failures=[];
for(const [q,expected] of cases){
  const actual=api.meowAssistantKnowledgeIntent(q);
  if(actual!==expected)failures.push({q,expected,actual,all:api.meowAssistantKnowledgeIntents(q)});
}
if(failures.length)console.error(JSON.stringify(failures,null,2));
assert.strictEqual(failures.length,0,'leave-law deterministic routing failures');

for(const [intentName,ruleKey] of [
  ['minimumWage','minimum_wage'],
  ['marriageLeave','marriage_leave'],
  ['familyCareLeave','family_care_leave'],
  ['sickLeaveRights','sick_leave_rights'],
  ['annualLeaveRule','annual_leave_rule'],
  ['personalLeaveRule','personal_leave']
]){
  assert(kb.entries[intentName],'missing labor KB entry '+intentName);
  assert.strictEqual(kb.entries[intentName].ruleKey,ruleKey,'wrong ruleKey '+intentName);
  assert(edge.includes('"'+intentName+'"'),'edge NLU missing intent '+intentName);
}

assert(html.includes("client.rpc('meow_labor_rule_context'"),'Meow Assistant must read versioned labor rules from Supabase');
assert(html.includes("invokeUserFunction('labor-rules-refresh'"),'Meow Assistant must trigger official labor source refresh');
assert(html.includes("['minimumWage','marriageLeave','familyCareLeave','sickLeaveRights','annualLeaveRule','personalLeaveRule']"),'direct labor knowledge handler missing');

console.log('PASS Meow Assistant leave-law routing and versioned labor knowledge: '+cases.length+'/'+cases.length);
