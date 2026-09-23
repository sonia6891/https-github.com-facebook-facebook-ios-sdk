const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const capacitor = JSON.parse(read('native/capacitor.config.json'));
const storekit = JSON.parse(read('native/ios-sources/MeowWork.storekit'));
const verifier = read('supabase/functions/verify-app-store-transaction/index.ts');
const notifications = read('supabase/functions/app-store-notifications-v2/index.ts');

const bundleID = 'com.lumilab.meowwork';
const monthlyID = 'meowwork.pro.monthly';
const yearlyID = 'meowwork.pro.yearly';

function subscriptionsByID() {
  const groups = storekit.subscriptionGroups || [];
  assert.equal(groups.length, 1, 'StoreKit config must contain exactly one subscription group');
  const subs = groups[0].subscriptions || [];
  return Object.fromEntries(subs.map(item => [item.productID, item]));
}

test('Bundle ID stays aligned across native config and Apple verifier endpoints', () => {
  assert.equal(capacitor.appId, bundleID);
  assert.match(verifier, new RegExp(bundleID.replaceAll('.', '\\.') ));
  assert.match(notifications, new RegExp(bundleID.replaceAll('.', '\\.') ));
});

test('StoreKit product IDs, prices and three-day trials are locked', () => {
  const byID = subscriptionsByID();
  assert.deepEqual(new Set(Object.keys(byID)), new Set([monthlyID, yearlyID]));

  assert.equal(byID[monthlyID].displayPrice, '99');
  assert.equal(byID[monthlyID].recurringSubscriptionPeriod, 'P1M');
  assert.equal(byID[monthlyID].introductoryOffer?.paymentMode, 'free');
  assert.equal(byID[monthlyID].introductoryOffer?.subscriptionPeriod, 'P3D');

  assert.equal(byID[yearlyID].displayPrice, '790');
  assert.equal(byID[yearlyID].recurringSubscriptionPeriod, 'P1Y');
  assert.equal(byID[yearlyID].introductoryOffer?.paymentMode, 'free');
  assert.equal(byID[yearlyID].introductoryOffer?.subscriptionPeriod, 'P3D');
});

test('Both App Store backend endpoints whitelist exactly the locked products', () => {
  for (const source of [verifier, notifications]) {
    assert.match(source, /const PRODUCTS = new Set\(\["meowwork\.pro\.monthly","meowwork\.pro\.yearly"\]\)/);
  }
});
