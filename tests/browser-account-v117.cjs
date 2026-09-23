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
const bridge = `window.__accountV119={
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
    getSession:async()=>{const saved=JSON.parse(localStorage.getItem('__mock_auth_session')||'null');const user=saved?.user||t.user;return{data:{session:localStorage.getItem('__account_test_signed_out')==='1'?null:(user?Object.assign({user},saved||{}):null)},error:null}},
    onAuthStateChange(fn){window.__authCallback=fn;return{data:{subscription:{unsubscribe(){}}}}},
    signInWithOAuth:async input=>{t.oauth.push(input);return{data:{url:'https://auth.example.test/start'},error:null}},
    setSession:async tokens=>{t.setSessionCalls.push(tokens);const user={id:'handoff-user',app_metadata:{provider:'custom:line'}};const session={user,access_token:tokens.access_token,refresh_token:tokens.refresh_token};localStorage.removeItem('__account_test_signed_out');localStorage.setItem('__mock_auth_session',JSON.stringify(session));t.user=user;return{data:{session},error:null}},
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

async function addRoutes(context, base, billingConfigured = true) {
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (url.includes('esm.sh/')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: mockSupabase });
    if (url.includes('/functions/v1/billing-config')) return route.fulfill({ status: 200, contentType: 'application/json', body: billingConfigured ? '{"configured":true,"monthly":199,"yearly":1990}' : '{"configured":false}' });
    if (url.includes('tesseract')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Tesseract={};' });
    return route.abort();
  });
}

async function openPage(browser, base, width, user = null, billingConfigured = true) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await context.addInitScript(({ user }) => { window.__accountTest = { oauth: [], calls: [], setSessionCalls: [], user }; }, { user });
  await addRoutes(context, base, billingConfigured);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__accountV119 !== undefined);
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
  const launchOptions = { headless: true, args: ['--no-sandbox'] };
  if (executablePath) launchOptions.executablePath = executablePath;
  const browser = await chromium.launch(launchOptions);
  try {
    check('本機儲存使用 localStorage 與 IndexedDB 鏡像', html.includes("localStorage.setItem(SAVE_KEY") && html.includes("indexedDB.open(BACKUP_DB_NAME"));
    check('舊版雲端備份使用獨立唯讀資料表', html.includes("from('user_legacy_exports').select('payload,original_updated_at')"));
    check('舊版取回只下載 JSON 而不套用遠端狀態', html.includes("'meow-legacy-backup.json'") && !/exportLegacyCloud[\s\S]*?applyRemoteRow\(/.test(html.slice(html.indexOf('async function exportLegacyCloud'), html.indexOf('function renderSyncStatus'))));
    const { context: guestContext, page: guest } = await openPage(browser, base, 390);
    check('未登入一定顯示登入頁', await guest.evaluate(() => window.__accountV119.openWelcome()));
    check('登入頁只保留兩個登入按鈕', await guest.locator('#welcomeGoogle, #welcomeLine').count() === 2);
    check('沒有訪客登入入口', await guest.locator('#welcomeGuest').count() === 0);
    check('沒有公開 Email 或 OTP 入口', await guest.locator('#welcomeEmail, #emailLoginInput, #emailOtpInput, #sendEmailOtp, #verifyEmailOtp').count() === 0);
    await guest.locator('#welcomeGoogle').click();
    check('Google 按鈕使用 google provider', await guest.evaluate(() => window.__accountTest.oauth.at(-1).provider === 'google'));
    await guest.locator('#welcomeLine').click();
    check('LINE 按鈕使用 custom:line', await guest.evaluate(() => window.__accountTest.oauth.at(-1).provider === 'custom:line'));
    check('LINE 要求 openid profile', await guest.evaluate(() => window.__accountTest.oauth.at(-1).options.scopes === 'openid profile'));
    await guestContext.close();

    const standaloneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await standaloneContext.addInitScript(() => {
      window.__accountTest = { oauth: [], calls: [], setSessionCalls: [], user: null };
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
      window.__openCalls = [];
      window.open = (...args) => { window.__openCalls.push(args); return null; };
    });
    await addRoutes(standaloneContext, base, true);
    const standalonePage = await standaloneContext.newPage();
    await standalonePage.goto(base, { waitUntil: 'domcontentloaded' });
    await standalonePage.waitForFunction(() => window.__accountV119 !== undefined);
    await standalonePage.waitForTimeout(120);
    check('啟動登入判斷完成後解除畫面鎖', !(await standalonePage.evaluate(() => document.documentElement.classList.contains('auth-booting'))));
    await standalonePage.locator('#welcomeLine').click();
    await standalonePage.waitForTimeout(80);
    check('主畫面 App 的 LINE 登入不再建立第二視窗', await standalonePage.evaluate(() => window.__openCalls.length === 0));
    check('主畫面 App 的 LINE 登入使用單一畫面 OAuth', await standalonePage.evaluate(() => window.__accountTest.oauth.at(-1).provider === 'custom:line' && window.__accountTest.oauth.at(-1).options.skipBrowserRedirect !== true));
    await standaloneContext.close();

    for (const width of [320, 390, 430]) {
      const user = { id: `acct-${width}`, email: 'member@example.test', app_metadata: { provider: 'google' } };
      const { context, page } = await openPage(browser, base, width, user);
      check(`${width}px 保持登入時不顯示登入頁`, !(await page.evaluate(() => window.__accountV119.openWelcome())));
      check(`${width}px 登入後預設 Free`, await page.evaluate(() => window.__accountV119.currentPlan() === 'free'));
      check(`${width}px Free 沒有雲端同步`, await page.evaluate(() => !window.__accountV119.canCloudSync()));
      check(`${width}px Free 沒有 Pro 功能`, await page.evaluate(() => !window.__accountV119.canUse('payslip_scan')));
      await page.evaluate(() => window.__accountV119.settings());
      await page.waitForTimeout(100);
      check(`${width}px 帳號與方案緊接在個人資料下方`, await page.evaluate(() => Boolean(document.querySelector('#accountPlanCard')?.previousElementSibling?.querySelector('#profilePreview'))));
      check(`${width}px 帳號區保留單一 Pro 展開入口`, await page.locator('#accountUpgrade').isVisible() && (await page.locator('#accountUpgrade').innerText()).includes('Pro 方案'));
      check(`${width}px 帳號狀態登入方式登出與 Pro 集中同區`, await page.evaluate(() => ['accountTitle','accountLoginMethod','accountLogout','accountUpgrade'].every(id => document.getElementById('accountPlanCard').contains(document.getElementById(id)))));
      check(`${width}px 帳號區不顯示 Email`, await page.evaluate(() => !document.getElementById('accountEmail') && !document.getElementById('accountPlanCard').innerText.includes('member@example.test')));
      check(`${width}px 登入方式正確顯示 Google`, (await page.locator('#accountLoginMethod').innerText()).includes('Google'));
      await page.locator('#accountUsername').fill('輪班喵'+width);
      await page.locator('#saveAccountUsername').click();
      check(`${width}px 使用者名稱可自訂修改`, await page.locator('#profileName').innerText() === '輪班喵'+width);
      const accountScroll = await page.evaluate(() => scrollY);
      await page.locator('#accountUpgrade').click();
      check(`${width}px Pro 方案在帳號卡內就地展開`, await page.locator('#proPlanSettings').isVisible() && await page.evaluate(() => document.getElementById('accountPlanCard').contains(document.getElementById('proPlanSettings'))));
      check(`${width}px 展開後顯示目前 Free 與 7 天免費試用`, await page.locator('#settingsPlanBadge').innerText() === 'Free' && (await page.locator('#startProTrial').innerText()).includes('7 天免費試用'));
      check(`${width}px 展開 Pro 不跳往其他區塊`, Math.abs((await page.evaluate(() => scrollY)) - accountScroll) <= 2);
      check(`${width}px 已設定金流時直接顯示訂閱付費`, await page.locator('#liveBillingActions').isVisible() && (await page.locator('#liveMonthlyCheckout').innerText()).includes('直接訂閱'));
      await page.locator('#accountUpgrade').click();
      await page.locator('#toggleWorkSettings').scrollIntoViewIfNeeded();
      await page.locator('#toggleWorkSettings').click();
      check(`${width}px 工作資料與假別額度可就地展開`, await page.locator('#workSettingsBody').isVisible() && await page.locator('#toggleWorkSettings').getAttribute('aria-expanded') === 'true');
      await page.locator('#toggleWorkSettings').click();
      await page.locator('#toggleDataSync').scrollIntoViewIfNeeded();
      await page.locator('#toggleDataSync').click();
      check(`${width}px 資料與同步可就地展開`, await page.locator('#dataSyncBody').isVisible() && await page.locator('#toggleDataSync').getAttribute('aria-expanded') === 'true');
      check(`${width}px 本機與舊版雲端差異有明確說明`, await page.evaluate(() => document.getElementById('dataSyncBody').innerText.includes('localStorage') === false && document.getElementById('dataSyncBody').innerText.includes('不會自動覆蓋本機')));
      check(`${width}px 舊版雲端取回集中在資料同步區`, await page.evaluate(() => document.getElementById('dataSyncCard').contains(document.getElementById('legacyCloudExport'))));
      check(`${width}px Free 的雲端備份與還原保持鎖定`, await page.locator('#cloudBackupNow').isDisabled() && await page.locator('#cloudRestoreNow').isDisabled());
      check(`${width}px 展開內容留在資料同步卡內`, await page.evaluate(() => document.getElementById('dataSyncCard').contains(document.getElementById('dataSyncBody'))));
      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        card: (() => { const r = document.getElementById('dataSyncCard').getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; })(),
        buttons: [...document.querySelectorAll('#dataSyncCard button')].filter(x => getComputedStyle(x).display !== 'none').map(x => { const r = x.getBoundingClientRect(); return { left: r.left, right: r.right }; })
      }));
      check(`${width}px 設定頁無水平溢位`, layout.pageWidth <= layout.viewport + 1);
      check(`${width}px 資料同步卡未超出畫面`, layout.card.left >= -1 && layout.card.right <= layout.viewport + 1);
      check(`${width}px 資料同步按鈕未跑版`, layout.buttons.every(r => r.left >= -1 && r.right <= layout.viewport + 1));
      const settingsLayout = await page.evaluate(() => {
        const nav=document.querySelector('.bottom-nav');
        const ids=['profilePreview','accountPlanCard','workSettingsCard','dataSyncCard','installCard','aboutCard','settingsFooterBanner'];
        const nodes=ids.map(id=>document.getElementById(id));
        const ordered=nodes.every(Boolean)&&nodes.slice(0,-1).every((node,i)=>Boolean(node.compareDocumentPosition(nodes[i+1]) & Node.DOCUMENT_POSITION_FOLLOWING));
        return {
          navPosition:getComputedStyle(nav).position,
          navBottom:getComputedStyle(nav).bottom,
          navInsideSettings:document.getElementById('page-settings').contains(nav),
          ordered,
          devCard:!!document.getElementById('devPlanCard'),
          mobileRestInsideSettings:document.getElementById('page-settings').contains(document.getElementById('mobileRestCard'))
        };
      });
      check(`${width}px 底部導覽固定在螢幕底部且不在設定內容中`, settingsLayout.navPosition==='fixed' && settingsLayout.navBottom==='0px' && !settingsLayout.navInsideSettings);
      check(`${width}px 設定內容順序符合定稿`, settingsLayout.ordered);
      check(`${width}px 設定頁不再出現版本方案測試卡`, !settingsLayout.devCard);
      check(`${width}px 設定頁使用自己的底部貓咪橫幅`, !settingsLayout.mobileRestInsideSettings && await page.locator('#settingsFooterBanner').isVisible());
      if (width === 390) {
        await page.screenshot({ path: path.join(out, 'account-v119-390.png'), fullPage: true });
        await page.locator('#accountUpgrade').scrollIntoViewIfNeeded();
        await page.locator('#accountUpgrade').click();
        check('升級入口會在帳號卡內展開 Pro 方案', await page.locator('#proPlanSettings').isVisible());
        await page.screenshot({ path: path.join(out, 'account-v119-pro-390.png'), fullPage: true });
      }
      await context.close();
    }

    const billingUser = { id: 'acct-billing-off', email: 'member@example.test', app_metadata: { provider: 'google' } };
    const { context: billingOffContext, page: billingOffPage } = await openPage(browser, base, 390, billingUser, false);
    await billingOffPage.evaluate(() => window.__accountV119.settings());
    await billingOffPage.locator('#accountUpgrade').click();
    check('正式金流未設定時不顯示可付款按鈕', !(await billingOffPage.locator('#liveBillingActions').isVisible()));
    check('正式金流未設定時清楚顯示尚未開放', await billingOffPage.locator('#billingUnavailable').isVisible());
    await billingOffPage.screenshot({ path: path.join(out, 'account-v119-billing-off-390.png'), fullPage: true });
    await billingOffContext.close();

    const user = { id: 'acct-logout', email: 'member@example.test', app_metadata: { provider: 'google' } };
    const { context, page } = await openPage(browser, base, 390, user);
    await page.evaluate(() => window.__accountV119.settings());
    await page.locator('#accountLogout').click();
    await page.waitForFunction(() => document.getElementById('welcomeDialog').open === true);
    check('主動登出後重新顯示登入頁', await page.evaluate(() => window.__accountV119.openWelcome()));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__accountV119 !== undefined);
    check('登出後重開仍顯示登入頁', await page.evaluate(() => window.__accountV119.openWelcome()));
    await context.close();
  } finally {
    await browser.close();
    server.close();
    fs.writeFileSync(path.join(out, 'account-v119.json'), JSON.stringify(results, null, 2));
  }
  console.log(`${results.length}/${results.length} account v119 checks passed`);
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
