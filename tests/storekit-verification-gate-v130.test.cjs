const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadVerificationGate({ verify, finish }) {
  const match = html.match(
    /async function verifyAndFinishStoreItem\(item,bridge\)\{([\s\S]*?)\n\}/
  );
  assert.ok(match, 'verifyAndFinishStoreItem must exist in index.html');

  const context = {
    verifyAppStoreSignedTransaction: verify,
    finishVerifiedStoreTransaction: finish
  };
  vm.createContext(context);
  vm.runInContext(
    `async function verifyAndFinishStoreItem(item,bridge){${match[1]}\n}
     this.verifyAndFinishStoreItem = verifyAndFinishStoreItem;`,
    context
  );
  return context.verifyAndFinishStoreItem;
}

test('backend verification succeeds before StoreKit finish', async () => {
  const calls = [];
  const verifyAndFinish = loadVerificationGate({
    verify: async signed => calls.push('verify:' + signed),
    finish: async (_bridge, item) => calls.push('finish:' + item.transaction.id)
  });

  await verifyAndFinish(
    { signedTransaction: 'signed-jws', transaction: { id: 'tx-1' } },
    {}
  );

  assert.deepEqual(calls, ['verify:signed-jws', 'finish:tx-1']);
});

test('verification/network failure never finishes the StoreKit transaction', async () => {
  const calls = [];
  const verifyAndFinish = loadVerificationGate({
    verify: async signed => {
      calls.push('verify:' + signed);
      throw new Error('network unavailable');
    },
    finish: async () => calls.push('finish')
  });

  await assert.rejects(
    verifyAndFinish(
      { signedTransaction: 'signed-jws', transaction: { id: 'tx-2' } },
      {}
    ),
    /network unavailable/
  );

  assert.deepEqual(calls, ['verify:signed-jws']);
});

test('unfinished transaction recovery stays wired on app startup path', () => {
  assert.match(html, /getUnfinishedTransactions/);
  assert.match(html, /Transaction\.updates|transactionUpdated/);
  assert.match(
    html,
    /for\(const item of items\)\{[\s\S]*?await verifyAndFinishStoreItem\(item,bridge\);[\s\S]*?catch\(e\)\{\}/
  );
});
