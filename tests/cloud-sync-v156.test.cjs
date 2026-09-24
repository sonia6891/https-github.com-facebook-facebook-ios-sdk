const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');

assert(
  html.includes("['active','trialing','grace_period'].includes(row.status)"),
  'Grace-period subscriptions must retain Pro access until pro_until.'
);
assert(
  html.includes("client.rpc('meow_save_snapshot',{p_payload:payload,p_expected_updated_at:cloudRevision})"),
  'Cloud writes must go through the optimistic-concurrency RPC.'
);
assert(
  html.includes("if(pendingCloud&&!resolveConflict){setCloudStatus('有版本衝突・請先選擇');return false}"),
  'Cloud writes must stop on unresolved conflicts.'
);
assert(
  html.includes("s.scheduleOverrides=x.scheduleOverrides||{}"),
  'Schedule overrides must survive load/normalize/cloud restore.'
);
assert.equal(
  (html.match(/function normalizeState\(v\)\{/g)||[]).length,
  1,
  'normalizeState must have one authoritative definition; a stale duplicate can silently drop fields.'
);
assert(
  html.includes("s.personalEvents=x.personalEvents||{}"),
  'Events and todos must survive load/normalize/cloud restore.'
);
assert(
  html.includes("delete snapshot.theme"),
  'Theme must remain device-local and stay out of cloud snapshots.'
);
assert(
  html.includes("history:history.slice(0,5)"),
  'Cloud payload must retain bounded recovery history.'
);
assert(
  html.includes("if(!preserveBeforeReplace())"),
  'Remote restore must preserve a local safety copy before replacement.'
);
assert(
  !html.includes("create-ecpay-checkout") &&
  !html.includes("create-ecpay-stage-checkout") &&
  !html.includes("ecpay-billing-webhook"),
  'Production client must not reference retired ECPay billing routes.'
);
assert(
  !/service[_-]?role/i.test(html) && !/sb_secret_/i.test(html),
  'Public client must not contain server-only Supabase credentials.'
);


assert(
  html.includes("const restored={savedAt:lastSavedAt,state,owner:localOwner}") &&
  html.includes("localStorage.setItem(workspaceKey(localOwner),JSON.stringify(restored))"),
  'IndexedDB recovery must preserve workspace ownership and its per-account mirror.'
);
assert(
  html.includes("if(file.size>8*1024*1024)throw new Error('backup_too_large')") &&
  html.includes("data.app&&data.app!=='喵的，又要上班了'"),
  'Backup import must reject oversized files and backups for another app.'
);
assert(
  html.includes("meow-sw-reloaded-v156") &&
  html.includes("register('./sw.js?v=156'"),
  'Service worker registration must be cache-busted after recovery changes.'
);

console.log('Cloud sync v156 regression checks passed.');
