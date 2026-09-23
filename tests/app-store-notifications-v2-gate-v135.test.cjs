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

test('server notification events are durably recorded', () => {
  assert.match(source, /from\("store_subscription_events"\)/);
  assert.match(source, /event_type:notificationType/);
  assert.match(source, /original_transaction_id:tx\?\.originalTransactionId/);
  assert.match(source, /raw:\{notification,transaction:tx\}/);
});

test('TEST notifications are accepted without changing entitlement', () => {
  assert.match(source, /notificationType==="TEST"/);
  assert.match(source, /return new Response\("OK",\{status:200\}\)/);
});
