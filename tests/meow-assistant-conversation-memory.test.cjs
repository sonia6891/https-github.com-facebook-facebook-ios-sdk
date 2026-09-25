const fs=require('fs');
const assert=require('assert');

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

const rememberSource=extractFunction('meowAssistantRemember');
const renderSource=extractFunction('renderMeowAssistantReply');

const factory=new Function(`
  let meowAssistantConversation=[];
  const box={
    textContent:'',
    dataset:{},
    classList:{toggle(){}}
  };
  const $=id=>id==='meowAssistantReply'?box:null;
  ${rememberSource}
  ${renderSource}
  return {
    remember:meowAssistantRemember,
    render:renderMeowAssistantReply,
    getConversation:()=>JSON.parse(JSON.stringify(meowAssistantConversation))
  };
`);

const api=factory();

api.render('今天是早班。');
let c=api.getConversation();
assert.strictEqual(c.length,1,'local assistant reply should enter context');
assert.deepStrictEqual(c[0],{role:'assistant',text:'今天是早班。'});

api.render('今天是早班。');
c=api.getConversation();
assert.strictEqual(c.length,1,'duplicate assistant reply should be de-duplicated');

api.render('我在理解你的意思…');
c=api.getConversation();
assert.strictEqual(c.length,1,'routing progress text must not pollute context');

api.render('正在把語音轉成文字…');
c=api.getConversation();
assert.strictEqual(c.length,1,'speech progress text must not pollute context');

api.render('已聽到：「幫我看班表」\n正在處理…');
c=api.getConversation();
assert.strictEqual(c.length,1,'speech processing status must not pollute context');

api.render('請告訴我要看哪一個月份。','error');
c=api.getConversation();
assert.strictEqual(c.length,2,'clarifying/error reply should be remembered');
assert.strictEqual(c[1].role,'assistant');

api.remember('user','九月');
api.render('已打開 9 月班表。','success');
c=api.getConversation();
assert(c.some(x=>x.role==='user'&&x.text==='九月'),'user follow-up missing');
assert(c.some(x=>x.role==='assistant'&&x.text==='已打開 9 月班表。'),'local success reply missing');

for(let i=0;i<20;i++){
  api.remember(i%2?'assistant':'user','訊息 '+i);
}
c=api.getConversation();
assert.strictEqual(c.length,12,'conversation buffer must stay capped at 12');
assert(c.some(x=>x.role==='assistant'),'context must preserve assistant turns');
assert(c.some(x=>x.role==='user'),'context must preserve user turns');

assert(html.includes("priorContext=meowAssistantConversation.slice(-8)"),'OpenAI route must receive recent conversation');
assert(html.includes("context:Array.isArray(context)?context.slice(-8):meowAssistantConversation.slice(-8)"),'AI route context handoff missing');

console.log('PASS Meow Assistant conversation memory and multi-turn context buffer');
