const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'test-results');
fs.mkdirSync(out, { recursive: true });

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(source => source.trim());
for (const source of inlineScripts) new Function(source);
console.log(`PASS parsed ${inlineScripts.length} inline scripts`);
const bridge = `window.__accountV117={
  currentPlan,
  canCloudSync,
  canUse,
  owner:()=>localOwner,
  settings:()=>setTab('settings'),
  openWelcome:()=>document.getElementById('welcomeDialog').open
};`;
const bridgeAt = html.lastIndexOf('})();');
assert.ok(bridgeAt > 0, 'App closure anchor exists');
html = html.slice(0, bridgeAt) + bridge + '\n' + html.slice(bridgeAt);

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'content-type': mime['.html'] });
    res.end(html);
    return;
  }
  const file = path.join(root, pathname.replace(/^\/+/, ''));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const mockSupabase = `export function createClient(){const t=window.__accountTest;return {
  auth:{
    getSession:async()=>({data:{session:localStorage.getItem('__account_test_signed_out')==='1'?null:(t.user?{user:t.user}:null)}}),
    onAuthStateChange(fn){window.__authCallback=fn;return{data:{subscription:{unsubscribe(){}}}}},
    signInWithOAuth:async input=>{t.oauth.push(input);return{error:null}},
    signOut:async()=>{t.user=null;localStorage.setItem('__account_test_signed_out','1');window.__authCallback?.('SIGNED_OUT',null);return{error:null}}
  },
  rpc:async name=>{t.calls.push(name);if(name==='meow_account_access')return{data:{server_now:new Date().toISOString(),entitlement:null},error:null};return{data:null,error:null}},
  from(){const q={select(){return q},eq(){return q},order(){return q},limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:null,error:null}),upsert:async()=>({error:null})};return q},
  channel(){return{on(){return this},subscribe(){return this}}},removeChannel:async()=>{}
}}`;

const results = [];
function check(name, value) {
  const passed = Boolean(value);
  results.push({ name, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  assert.ok(passed, name);
}

async function addRoutes(context, base) {
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (url.includes('esm.sh/')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: mockSupabase });
    if (url.includes('/functions/v1/billing-config')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":false}' });
    if (url.includes('tesseract')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Tesseract={};' });
    return route.abort();
  });
}

async function openPage(browser, base, width, user = null) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(({ user }) => { window.__accountTest = { oauth: [], calls: [], user }; }, { user });
  await addRoutes(context, base);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__accountV117 !== undefined);
  await page.waitForTimeout(700);
  check(`${width}px 沒有瀏覽器執行錯誤`, pageErrors.length === 0);
  return { context, page };
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browserCandidates = [
    process.env.MEOW_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  const executablePath = browserCandidates.find(candidate => fs.existsSync(candidate));
  assert.ok(executablePath, 'Chrome or Edge is available for browser QA');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const { context: guestContext, page: guest } = await openPage(browser, base, 390);
    check('未登入一定顯示登入頁', await guest.evaluate(() => window.__accountV117.openWelcome()));
    check('登入頁只保留兩個登入按鈕', await guest.locator('#welcomeGoogle, #welcomeLine').count() === 2);
    check('沒有訪客登入入口', await guest.locator('#welcomeGuest').count() === 0);
    check('沒有公開 Email 或 OTP 入口', await guest.locator('#welcomeEmail, #emailLoginInput, #emailOtpInput, #sendEmailOtp, #verifyEmailOtp').count() === 0);
    await guest.locator('#welcomeGoogle').click();
    check('Google 按鈕使用 google provider', await guest.evaluate(() => window.__accountTest.oauth.at(-1).provider === 'google'));
    await guest.locator('#welcomeLine').click();
    check('LINE 按鈕使用 custom:line', await guest.evaluate(() => window.__accountTest.oauth.at(-1).provider === 'custom:line'));
    check('LINE 要求 openid profile', await guest.evaluate(() => window.__accountTest.oauth.at(-1).options.scopes === 'openid profile'));
    await guestContext.close();

    for (const width of [320, 390, 430]) {
      const user = { id: `acct-${width}`, email: 'member@example.test', app_metadata: { provider: 'google' } };
      const { context, page } = await openPage(browser, base, width, user);
      check(`${width}px 保持登入時不顯示登入頁`, !(await page.evaluate(() => window.__accountV117.openWelcome())));
      check(`${width}px 登入後預設 Free`, await page.evaluate(() => window.__accountV117.currentPlan() === 'free'));
      check(`${width}px Free 沒有雲端同步`, await page.evaluate(() => !window.__accountV117.canCloudSync()));
      check(`${width}px Free 沒有 Pro 功能`, await page.evaluate(() => !window.__accountV117.canUse('payslip_scan')));
      await page.evaluate(() => window.__accountV117.settings());
      await page.waitForTimeout(100);
      check(`${width}px 帳號與方案緊接在個人資料下方`, await page.evaluate(() => Boolean(document.querySelector('#accountPlanCard')?.previousElementSibling?.querySelector('#profilePreview'))));
      check(`${width}px 帳號區顯示 Free 與升級入口`, await page.locator('#accountPlanLabel').innerText() === 'Free' && await page.locator('#accountUpgrade').isVisible());
      check(`${width}px 帳號狀態方案登出升級集中同區`, await page.evaluate(() => ['accountTitle','accountPlanLabel','accountLogout','accountUpgrade'].every(id => document.getElementById('accountPlanCard').contains(document.getElementById(id)))));
      check(`${width}px Free 的雲端備份與還原保持鎖定`, await page.locator('#cloudBackupNow').isDisabled() && await page.locator('#cloudRestoreNow').isDisabled());
      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        card: (() => { const r = document.getElementById('accountPlanCard').getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; })(),
        buttons: [...document.querySelectorAll('#accountPlanCard .btn')].filter(x => getComputedStyle(x).display !== 'none').map(x => { const r = x.getBoundingClientRect(); return { left: r.left, right: r.right }; })
      }));
      check(`${width}px 設定頁無水平溢位`, layout.pageWidth <= layout.viewport + 1);
      check(`${width}px 帳號卡未超出畫面`, layout.card.left >= -1 && layout.card.right <= layout.viewport + 1);
      check(`${width}px 帳號按鈕未跑版`, layout.buttons.every(r => r.left >= -1 && r.right <= layout.viewport + 1));
      if (width === 390) {
        await page.screenshot({ path: path.join(out, 'account-v117-390.png'), fullPage: true });
        await page.locator('#accountUpgrade').click();
        await page.waitForTimeout(400);
        check('升級入口會前往設定內的 Pro 方案', await page.evaluate(() => { const r=document.getElementById('proPlanSettings').getBoundingClientRect(); return r.top>=-2&&r.top<innerHeight*.45; }));
      }
      await context.close();
    }

    const user = { id: 'acct-logout', email: 'member@example.test', app_metadata: { provider: 'google' } };
    const { context, page } = await openPage(browser, base, 390, user);
    await page.evaluate(() => window.__accountV117.settings());
    await page.locator('#accountLogout').click();
    await page.waitForFunction(() => document.getElementById('welcomeDialog').open === true);
    check('主動登出後重新顯示登入頁', await page.evaluate(() => window.__accountV117.openWelcome()));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__accountV117 !== undefined);
    check('登出後重開仍顯示登入頁', await page.evaluate(() => window.__accountV117.openWelcome()));
    await context.close();
  } finally {
    await browser.close();
    server.close();
    fs.writeFileSync(path.join(out, 'account-v117.json'), JSON.stringify(results, null, 2));
  }
  console.log(`${results.length}/${results.length} account v117 checks passed`);
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
