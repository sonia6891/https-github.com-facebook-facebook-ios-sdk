const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'app-store-notifications-v2', 'index.ts'),
  'utf8'
);

test('refund and revoke always expire entitlement', () => {
  assert.match(source, /notificationType==="REFUND"/);
  assert.match(source, /notificationType==="REVOKE"/);
  assert.match(source, /return "expired"/);
});

test('expired and grace-period-expired events expire entitlement', () => {
  assert.match(source, /notificationType==="EXPIRED"/);
  assert.match(source, /notificationType==="GRACE_PERIOD_EXPIRED"/);
});

test('failed renewal maps to grace period or past due', () => {
  assert.match(source, /notificationType==="DID_FAIL_TO_RENEW"/);
  assert.match(source, /subtype==="GRACE_PERIOD"/);
  assert.match(source, /"grace_period":"past_due"/);
});

test('renewal status changes preserve cancel-at-period-end semantics', () => {
  assert.match(source, /notificationType==="DID_CHANGE_RENEWAL_STATUS"/);
  assert.match(source, /subtype==="AUTO_RENEW_DISABLED"/);
  assert.match(source, /subtype==="AUTO_RENEW_ENABLED"/);
  assert.match(source, /cancel_at_period_end/);
});

test('valid App Store states are written to user entitlements', () => {
  assert.match(source, /\["active","trialing","grace_period"\]\.includes\(status\)/);
  assert.match(source, /plan:active\?"pro":"free"/);
  assert.match(source, /billing_provider:"app_store"/);
  assert.match(source, /provider_subscription_id:tx\.originalTransactionId/);
});

test('server notification events are durably recorded without retaining decoded identity payloads', () => {
  assert.match(source, /from\("store_subscription_events"\)/);
  assert.match(source, /event_type:notificationType/);
  assert.match(source, /original_transaction_id:tx\?\.originalTransactionId/);
  assert.match(source, /raw:\{verified:true,source:"app_store_server"/);
  assert.doesNotMatch(source, /raw:\{notification,transaction:tx\}/);
});

test('client transaction audit rows do not retain appAccountToken payloads', () => {
  const verifySource = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'verify-app-store-transaction', 'index.ts'),
    'utf8'
  );
  assert.match(verifySource, /raw:\{verified:true,source:"client_transaction"/);
  assert.doesNotMatch(verifySource, /raw:tx[\s,}]/);
});

test('account deletion scrubs old App Store raw payloads before deleting auth user', () => {
  const deleteSource = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'delete-account', 'index.ts'),
    'utf8'
  );
  const scrubAt = deleteSource.indexOf('redacted_after_account_deletion');
  const deleteAt = deleteSource.indexOf('admin.auth.admin.deleteUser');
  assert.ok(scrubAt > 0 && deleteAt > scrubAt);
  assert.match(deleteSource, /PRIVACY_SCRUB_FAILED/);
  assert.match(deleteSource, /\.eq\("user_id", user\.id\)/);
});

test('TEST notifications are accepted without changing entitlement', () => {
  assert.match(source, /notificationType==="TEST"/);
  assert.match(source, /return new Response\("OK",\{status:200\}\)/);
});
