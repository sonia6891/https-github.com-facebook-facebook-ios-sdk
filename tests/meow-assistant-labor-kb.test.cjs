const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');
const kb=JSON.parse(fs.readFileSync('assets/meow-labor-knowledge-v1.json','utf8'));

const build=(html.match(/<meta name="meow-ui-build" content="v(\d+)[^"]*">/)||[])[1];
assert(Number(build)>=205,'labor knowledge build marker must be v205+');
assert.strictEqual(kb.jurisdiction,'Taiwan');
assert(kb.verifiedAt,'verifiedAt missing');

const required=[
  'shiftRestInterval','overtimeLimit','workBreak','consecutiveWorkDays','flexibleWorkingHours',
  'compensatoryLeave','annualLeaveTermination','holidayTransfer','pregnancyNightShift',
  'article841','security841','partTimeRights','naturalDisaster','overtimeWageBase'
];
for(const key of required){
  const e=kb.entries&&kb.entries[key];
  assert(e,'missing labor knowledge entry '+key);
  assert(typeof e.baseAnswer==='string'&&e.baseAnswer.length>=30,'weak baseAnswer '+key);
  assert(Array.isArray(e.requiredFacts)&&e.requiredFacts.length>=2,'requiredFacts missing '+key);
  assert(Array.isArray(e.sources)&&e.sources.length>=1,'sources missing '+key);
  for(const s of e.sources){
    assert(/^https:\/\/(?:www\.)?(?:mol\.gov\.tw|laws\.mol\.gov\.tw)\//.test(s.url),'non-official MOL source '+key+': '+s.url);
  }
}
assert(html.includes("fetch('./assets/meow-labor-knowledge-v1.json?v=205'"),'knowledge loader missing');
assert(/meowAssistantLaborKnowledge\(intent(?:,\s*raw)?\)/.test(html),'knowledge lookup not wired to AI route');
assert(html.includes('knowledge&&knowledge.baseAnswer'),'knowledge answer fallback missing');

console.log('PASS Meow Assistant Taiwan labor knowledge base: '+required.length+' priority topics');
