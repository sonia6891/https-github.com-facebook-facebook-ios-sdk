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
    if(ch==="'"||ch==='"`'||ch==='"\"'){inStr=ch;continue}
    if(ch==='/'&&prev!=='/'&&html[i+1]!=='/'&&html[i+1]!=='*'){
      // In these extracted helpers, slash tokens are regex literals.
      inRegex=true;continue;
    }
    if(ch==='{')depth++;
    if(ch==='}'){
      depth--;
      if(depth===0)return html.slice(start,i+1);
    }
  }
  throw new Error('unterminated function '+name);
}

const src=extractFunction('meowAssistantKnowledgeIntent');
const meowAssistantKnowledgeIntent=(new Function(src+'; return meowAssistantKnowledgeIntent;'))();

const groups={
  help:[
    '喵助理可以幫我做什麼',
    '我可以問你什麼',
    '怎麼用喵助理',
    '幫助'
  ],
  todayShift:[
    '我今天上什麼班',
    '今天要上班嗎',
    '今天是休假嗎'
  ],
  tomorrowShift:[
    '明天上什麼班',
    '明天要上班嗎',
    '明天休息嗎'
  ],
  nextWork:[
    '我下次哪天上班',
    '最近哪一天工作',
    '下一次出勤是哪天'
  ],
  nextOff:[
    '我下次哪天休假',
    '最近哪一天放假',
    '下一次休息是哪天'
  ],
  monthSummary:[
    '這個月上班幾天',
    '本月出勤幾天',
    '這月工時統計'
  ],
  overtimeHours:[
    '這個月加班幾小時',
    '本月加班時數',
    '加班總時數多少'
  ],
  estimatedPay:[
    '這個月預估薪資多少',
    '本月預估實領多少',
    '我這月大概領多少',
    '薪資預估多少'
  ],
  grossPay:[
    '這個月應發薪資多少',
    '本月稅前薪資多少',
    '應發總額多少'
  ],
  overtimePay:[
    '這個月加班費多少',
    '加班費怎麼算',
    '本月加班費試算'
  ],
  shiftAllowance:[
    '輪班津貼多少',
    '夜班津貼有多少',
    '班別津貼怎麼算'
  ],
  deductions:[
    '這個月總扣款多少',
    '本月勞保健保扣多少',
    '扣款明細給我看',
    '這月福利金扣多少'
  ],
  payday:[
    '幾號發薪',
    '下一次發薪日',
    '多久領薪'
  ],
  annualLeave:[
    '特休剩多少',
    '年假還有幾天',
    '特休剩幾小時'
  ],
  reconcileSummary:[
    '公司實發跟App差多少',
    '薪資差額多少',
    '我少發多少'
  ],
  whyPayChanged:[
    '為什麼這個月薪水變少',
    '我這月實領怎麼少了',
    '這個月比上個月少多少',
    '為什麼薪資不一樣'
  ],
  history:[
    '我要看歷史薪資',
    '看上個月對帳',
    '過去的薪資對帳'
  ],
  missingOvertime:[
    '加班費怎麼沒有',
    '是不是漏算加班',
    '加班費少了'
  ],
  missingShiftAllowance:[
    '夜班津貼怎麼沒有',
    '輪班津貼漏了',
    '班別加給少了'
  ],
  holidayPay:[
    '國定假日加班費怎麼算',
    '休息日工資怎麼算',
    '假日有沒有加倍'
  ],
  unknownDeduction:[
    '這是什麼扣款',
    '薪資單有不明扣款',
    '我看不懂這筆扣款',
    '多了一筆扣款是什麼'
  ],
  extraItem:[
    '薪資單多了一個項目',
    '對帳多出額外扣款',
    '薪資單多一個收入項目'
  ],
  missingItem:[
    '智慧對帳沒辨識到一項',
    '薪資單有項目沒抓到',
    '對帳漏掉一個項目'
  ],
  rerunPayslip:[
    '重新判讀薪資單',
    '薪資單再跑一次',
    '對帳重跑一次'
  ],
  salaryCalc:[
    '打開薪資試算',
    '我要看薪資計算',
    '跳到薪資試算'
  ],
  freeReconcile:[
    '打開免費對帳',
    '我要看快速對帳',
    '跳到免費薪資對帳'
  ],
  leaveConflict:[
    '行程跟班表衝突',
    '請假跟排班撞到',
    '特休跟班表衝突'
  ],
  paystubContents:[
    '薪資單應該有哪些項目',
    '薪資明細需要列什麼',
    '薪資單要包含什麼'
  ],
  sickLeavePay:[
    '病假扣薪怎麼算',
    '事假扣多少薪水',
    '病假會扣全勤嗎'
  ],
  rotationHelp:[
    '四班二輪怎麼排',
    '做二休二怎麼設',
    '四班三輪怎麼看'
  ],
  scheduleGeneral:[
    '班表功能有哪些',
    '排班有什麼功能'
  ],
  payrollGeneral:[
    '薪資功能有哪些',
    '薪水方面你能幫什麼',
    '對帳有哪些功能'
  ]
};

const cases=[];
for(const [intent,questions] of Object.entries(groups)){
  for(const question of questions)cases.push({intent,question});
}
assert.strictEqual(cases.length,100,'must keep exactly 100 Meow Assistant regression questions');

let passed=0;
const failures=[];
for(const tc of cases){
  const actual=meowAssistantKnowledgeIntent(tc.question);
  if(actual===tc.intent)passed++;
  else failures.push({question:tc.question,expected:tc.intent,actual});
}

if(failures.length){
  console.error('Meow Assistant 100-question failures:',JSON.stringify(failures,null,2));
}
assert.strictEqual(failures.length,0,'Meow Assistant must correctly route all 100 representative shift/payroll questions');

for(const intent of Object.keys(groups)){
  const token="id==='"+intent+"'";
  assert(html.includes(token),'knowledge handler missing response branch: '+intent);
}

assert(html.includes("type:'smartPayslipReconcile'"),'smart payslip reconciliation command must remain available');
assert(html.includes('function handleMeowAssistantKnowledge'),'knowledge feedback handler missing');
assert(html.includes("MEOW_ASSISTANT_KNOWLEDGE_VERSION='2026-09-shift-payroll-v1'"),'knowledge corpus version missing');

console.log('PASS Meow Assistant 100-question shift/payroll/reconciliation regression corpus: '+passed+'/100');
