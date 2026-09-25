const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');

assert(html.includes('function meowAssistantLiveFailureKind'),'failure classifier missing');
assert(html.includes('function meowAssistantLiveFailureSummary'),'failure summary missing');
assert(html.includes("code:'primary_intent'"),'primary intent failure category missing');
assert(html.includes("code:'secondary_intent'"),'secondary intent failure category missing');
assert(html.includes("code:'context_reference'"),'context failure category missing');
assert(html.includes("code:'operation_kind'"),'operation kind failure category missing');
assert(html.includes("code:'operation_argument'"),'operation argument failure category missing');
assert(html.includes("code:'provider_error'"),'provider failure category missing');
assert(html.includes('failureSummary:meowAssistantLiveFailureSummary(results)'),'failure summary not persisted');
assert(html.includes("類型：'+failure.label+'（'+failure.layer+'）"),'failure details not rendered');
assert(html.includes("主意圖"),'developer summary category labels missing');

console.log('PASS Meow Assistant live failure classification and repair-queue reporting');
