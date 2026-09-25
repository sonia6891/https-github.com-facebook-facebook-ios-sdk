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
    if(ch==="'"||ch==='"`'||ch==='"'){inStr=ch;continue}
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
  const current=new Date(2026,8,1);
  const state={settings:{defaultOvertimeHours:10}};
  const num=v=>Number(v)||0;
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  ${helperBlock}
  ${parseSource}
  return {normalizeMeowAssistantText,meowAssistantKnowledgeIntent,meowAssistantKnowledgeIntents,meowAssistantParse};
`);
const api=factory();

const cases=[];

// 1-20: ASR / typo / simplified-Chinese noise.
[
 ['intent','今天板表上什麼班','todayShift'],
 ['intent','明天班錶休不休','tomorrowShift'],
 ['intent','这个月新資大概領多少','estimatedPay'],
 ['intent','心資單有不明扣款','unknownDeduction'],
 ['intent','新子單多一個項目','extraItem'],
 ['intent','薪次單沒辨識到一項','missingItem'],
 ['intent','對仗結果差多少','reconcileSummary'],
 ['intent','對賬歷史','history'],
 ['intent','這月家班幾小時','overtimeHours'],
 ['intent','家班費怎麼沒算','missingOvertime'],
 ['intent','這月老保跟建保扣多少','deductions'],
 ['intent','特修還有幾天','annualLeave'],
 ['intent','發新日是哪天','payday'],
 ['intent','夜班津贴多少','shiftAllowance'],
 ['intent','实领怎麼少了','whyPayChanged'],
 ['intent','公司实发跟App差多少','reconcileSummary'],
 ['intent','新資單要包含什麼','paystubContents'],
 ['intent','带我去免費對賬','freeReconcile'],
 ['intent','带我去薪資計算','salaryCalc'],
 ['intent','薪姿預估多少','estimatedPay']
].forEach(x=>cases.push(x));

// 21-40: colloquial / fragmented speech.
[
 ['intent','今天到底要不要上班','todayShift'],
 ['intent','明天有沒有班','tomorrowShift'],
 ['intent','我啥時再上班','nextWork'],
 ['intent','我幾時放假','nextOff'],
 ['intent','這個月到底要做幾天','monthSummary'],
 ['intent','這月加班加了幾個鐘頭','overtimeHours'],
 ['intent','這個月我能拿多少錢','estimatedPay'],
 ['intent','稅前我這月是多少','grossPay'],
 ['intent','加班費那筆有多少錢','overtimePay'],
 ['intent','夜班那個津貼幾塊','shiftAllowance'],
 ['intent','我這月到底被扣多少','deductions'],
 ['intent','薪水都哪天進來','payday'],
 ['intent','年假我還剩幾小時','annualLeave'],
 ['intent','公司匯進來的跟你算的差多少','reconcileSummary'],
 ['intent','怎麼這期薪水縮水了','whyPayChanged'],
 ['intent','之前幾個月我領多少','history'],
 ['intent','加班錢是不是漏了','missingOvertime'],
 ['intent','晚班津貼怎麼不見了','missingShiftAllowance'],
 ['intent','這扣的是啥','unknownDeduction'],
 ['intent','再掃一次薪資單','rerunPayslip']
].forEach(x=>cases.push(x));

// 41-60: two questions in one sentence; both intents must survive.
[
 ['multi','今天什麼班，這個月預估薪資多少',['todayShift','estimatedPay']],
 ['multi','明天要上班嗎，這月加班費多少',['tomorrowShift','overtimePay']],
 ['multi','下次哪天休假，特休還有幾天',['nextOff','annualLeave']],
 ['multi','下次哪天上班，本月總扣款多少',['nextWork','deductions']],
 ['multi','這個月上班幾天，加班幾小時',['monthSummary','overtimeHours']],
 ['multi','今天休不休，幾號發薪',['todayShift','payday']],
 ['multi','明天什麼班，公司實發跟App差多少',['tomorrowShift','reconcileSummary']],
 ['multi','這月上班幾天，預估實領多少',['monthSummary','estimatedPay']],
 ['multi','下次上班哪天，夜班津貼多少',['nextWork','shiftAllowance']],
 ['multi','下次休假哪天，這個月扣款明細',['nextOff','deductions']],
 ['multi','今天上什麼班，為什麼薪水變少',['todayShift','whyPayChanged']],
 ['multi','明天休息嗎，加班費怎麼沒算',['tomorrowShift','missingOvertime']],
 ['multi','本月出勤幾天，輪班津貼怎麼沒有',['monthSummary','missingShiftAllowance']],
 ['multi','本月加班時數，對帳結果差多少',['overtimeHours','reconcileSummary']],
 ['multi','這月上班幾天，應發多少',['monthSummary','grossPay']],
 ['multi','今天什麼班，特休剩多少',['todayShift','annualLeave']],
 ['multi','下次哪天休息，之前薪資對帳',['nextOff','history']],
 ['multi','明天要上班嗎，薪資單有不明扣款',['tomorrowShift','unknownDeduction']],
 ['multi','這個月出勤幾天，薪資單漏掉一個項目',['monthSummary','missingItem']],
 ['multi','今天什麼班，薪資單再跑一次',['todayShift','rerunPayslip']]
].forEach(x=>cases.push(x));

// 61-80: noisy operational commands.
[
 ['parse','幫我22號家班10小時',{type:'add',dates:['2026-09-22'],hours:10}],
 ['parse','二十四號取消家班',{type:'remove',dates:['2026-09-24']}],
 ['parse','把二十二號家班移到二十六號',{type:'move',from:'2026-09-22',to:'2026-09-26'}],
 ['parse','下个月3号加班8小时',{type:'add',dates:['2026-10-03'],hours:8}],
 ['parse','這個月5日加班',{type:'add',dates:['2026-09-05'],hours:10}],
 ['parse','取消7號加班',{type:'remove',dates:['2026-09-07']}],
 ['parse','9號加班不要了',{type:'remove',dates:['2026-09-09']}],
 ['parse','把10號加班改到11號',{type:'move',from:'2026-09-10',to:'2026-09-11'}],
 ['parse','12號加班兩小時',{type:'add',dates:['2026-09-12'],hours:2}],
 ['parse','13號加班2.5小時',{type:'add',dates:['2026-09-13'],hours:2.5}],
 ['parse','十五號跟十六號加班',{type:'add',dates:['2026-09-15','2026-09-16']}],
 ['parse','17號、18號加班',{type:'add',dates:['2026-09-17','2026-09-18']}],
 ['parse','19號加班八小時',{type:'add',dates:['2026-09-19'],hours:8}],
 ['parse','把20號加班挪到21號',{type:'move',from:'2026-09-20',to:'2026-09-21'}],
 ['parse','22號不要加班',{type:'remove',dates:['2026-09-22']}],
 ['parse','幫我對新資單',{type:'smartPayslipReconcile'}],
 ['parse','我要智慧薪資對賬',{type:'smartPayslipReconcile'}],
 ['parse','核對一下心資單',{type:'smartPayslipReconcile'}],
 ['parse','薪次單幫我對一下',{type:'smartPayslipReconcile'}],
 ['parse','麻煩幫我看看薪資單有沒有算對',{type:'smartPayslipReconcile'}]
].forEach(x=>cases.push(x));

// 81-100: collision / specificity checks.
[
 ['intent','加班費少了','missingOvertime'],
 ['intent','加班費多少','overtimePay'],
 ['intent','國定假日加班費多少','holidayPay'],
 ['intent','夜班津貼少了','missingShiftAllowance'],
 ['intent','夜班津貼多少','shiftAllowance'],
 ['intent','這月不明扣款','unknownDeduction'],
 ['intent','這月扣款多少','deductions'],
 ['intent','薪資單多了一個扣款','extraItem'],
 ['intent','薪資單漏掉項目','missingItem'],
 ['intent','薪資單要有哪些項目','paystubContents'],
 ['intent','病假扣多少','sickLeavePay'],
 ['intent','四班二輪怎麼排','rotationHelp'],
 ['intent','班表能幹嘛','scheduleGeneral'],
 ['intent','薪資能幹嘛','payrollGeneral'],
 ['intent','我能問你什麼','help'],
 ['intent','薪資歷史','history'],
 ['intent','對帳歷史','history'],
 ['intent','公司實發差多少','reconcileSummary'],
 ['intent','這個月比上月少多少','whyPayChanged'],
 ['intent','重新判讀','rerunPayslip']
].forEach(x=>cases.push(x));

assert.strictEqual(cases.length,100,'round two must contain exactly 100 adversarial questions');

const failures=[];
for(let i=0;i<cases.length;i++){
  const [kind,q,expected]=cases[i];
  const normalized=api.normalizeMeowAssistantText(q);
  if(kind==='intent'){
    const actual=api.meowAssistantKnowledgeIntent(normalized);
    if(actual!==expected)failures.push({n:i+1,q,normalized,expected,actual});
  }else if(kind==='multi'){
    const actual=api.meowAssistantKnowledgeIntents(normalized);
    const missing=expected.filter(x=>!actual.includes(x));
    if(missing.length)failures.push({n:i+1,q,normalized,expected,actual,missing});
  }else if(kind==='parse'){
    const actual=api.meowAssistantParse(q);
    let ok=actual&&actual.ok===true&&actual.type===expected.type;
    if(ok&&expected.dates)ok=JSON.stringify(actual.dates)===JSON.stringify(expected.dates);
    if(ok&&expected.hours!==undefined)ok=Math.abs(Number(actual.hours)-expected.hours)<.001;
    if(ok&&expected.from)ok=actual.from===expected.from&&actual.to===expected.to;
    if(!ok)failures.push({n:i+1,q,normalized,expected,actual});
  }
}

if(failures.length)console.error(JSON.stringify(failures,null,2));
assert.strictEqual(failures.length,0,'round two adversarial corpus has routing failures');
assert(html.includes("type:'knowledgeMulti'"),'mixed-question parser support missing');
assert(html.includes('handleMeowAssistantKnowledgeMulti'),'mixed-question response handler missing');
const build=(html.match(/<meta name="meow-ui-build" content="v(\d+)[^"]*">/)||[])[1];
assert(Number(build)>=200,'round two build marker missing');

console.log('PASS Meow Assistant adversarial round two: 100/100');
