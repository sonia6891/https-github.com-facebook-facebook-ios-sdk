const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('function meowAssistantLiveRepairHint'),'repair hint helper missing');
for(const token of [
  'provider_error','no_route','not_understood','primary_intent','secondary_intent',
  'context_reference','operation_kind','operation_argument'
]){
  assert(html.includes(token),'repair hint category missing '+token);
}
assert(html.includes('建議修正：'),'failure detail must show repair hint');
assert(html.includes('不要先堆本機關鍵字'),'NLU repair guidance missing');
assert(html.includes('不能猜'),'safe operation repair guidance missing');

console.log('PASS Meow Assistant live failure repair hints');
