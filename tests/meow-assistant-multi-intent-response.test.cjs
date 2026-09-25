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

const source=extractFunction('handleMeowAssistantAiRoute');

const factory=new Function(`
  const MEOW_ASSISTANT_AI_LEGACY_INTENTS=new Set(['tomorrowShift','todayShift','estimatedPay','deductions']);
  const MEOW_ASSISTANT_AI_INTENT_LABELS={
    overtimeLimit:'加班時數上限',
    mandatoryOvertime:'臨時或強制加班',
    tomorrowShift:'明天班別'
  };
  const rendered=[];
  const remembered=[];
  const legacyCalls=[];
  const handleMeowAssistantAiOperation=async()=>false;
  const handleMeowAssistantKnowledgeMulti=async(intents,raw)=>legacyCalls.push({kind:'multi',intents,raw});
  const handleMeowAssistantKnowledge=async(intent,raw)=>legacyCalls.push({kind:'single',intent,raw});
  const meowAssistantKnowledgeSnippet=(intent)=>intent==='tomorrowShift'?'明天：大夜':'';
  const meowAssistantLaborKnowledge=async(intent)=>{
    if(intent==='overtimeLimit')return{baseAnswer:'一般加班有每日與每月上限，仍要看是否有法定例外程序。',requiredFacts:['本月加班']};
    if(intent==='mandatoryOvertime')return{baseAnswer:'若有健康或其他正當理由不能接受正常工時外工作，不能只用公司命令一概強制。',requiredFacts:['加班原因']};
    return null;
  };
  const meowAssistantPersonalFacts=(intent)=>{
    if(intent==='overtimeLimit')return{facts:['9 月目前 App 記錄加班 50 小時；近 3 個月合計 110 小時。'],missing:[]};
    return{facts:[],missing:[]};
  };
  const renderMeowAssistantReply=(m)=>rendered.push(m);
  const meowAssistantRemember=(r,t)=>remembered.push({r,t});
  ${source}
  return {run:handleMeowAssistantAiRoute,rendered,legacyCalls};
`);

(async()=>{
  const api=factory();
  const ok=await api.run({
    understood:true,
    primaryIntent:'overtimeLimit',
    secondaryIntents:['mandatoryOvertime','tomorrowShift'],
    missingInformation:[],
    appDataNeeded:['overtime','schedule'],
    confidence:.98,
    shouldClarify:false,
    clarifyingQuestion:null
  },'我明天大夜，這月又加50小時，公司還叫我留下來，可以嗎');

  assert.strictEqual(ok,true);
  assert.strictEqual(api.rendered.length,1);
  const msg=api.rendered[0];
  assert(msg.includes('【加班時數上限】'),'primary knowledge section missing');
  assert(msg.includes('【臨時或強制加班】'),'secondary nonlegacy section missing');
  assert(msg.includes('【明天班別】明天：大夜'),'legacy secondary section missing');
  assert(msg.includes('50 小時'),'App grounding missing');
  assert.strictEqual(api.legacyCalls.length,0,'mixed intents must not short-circuit into legacy-only handler');

  const api2=factory();
  await api2.run({
    understood:true,
    primaryIntent:'tomorrowShift',
    secondaryIntents:['todayShift'],
    missingInformation:[],
    appDataNeeded:['schedule'],
    confidence:.99,
    shouldClarify:false,
    clarifyingQuestion:null
  },'今天跟明天什麼班');
  assert.strictEqual(api2.legacyCalls.length,1,'all-legacy queries should keep legacy handler behavior');
  assert.deepStrictEqual(api2.legacyCalls[0].intents,['tomorrowShift','todayShift']);

  console.log('PASS Meow Assistant multi-intent answer composition');
})().catch(err=>{console.error(err);process.exit(1)});
