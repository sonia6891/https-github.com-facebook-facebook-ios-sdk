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
  calendar:()=>setTab('calendar'),
  attendance:()=>setTab('attendance'),
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
    if (url.includes('/functions/v1/billing-config')) return route.fulfill({ status: 200, contentType: 'application/json', body: billingConfigured ? '{"configured":true,"provider":"app_store_play","store_managed":true,"monthly":99,"yearly":790,"trial_days":3}' : '{"configured":false}' });
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
  try {
    await page.waitForFunction(() => window.__accountV119 !== undefined);
  } catch (error) {
    console.error('PAGE STARTUP ERRORS:', pageErrors.length ? pageErrors.join(' | ') : '(none captured)');
    throw error;
  }
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
      check(`${width}px 帳號資料使用獨立帳號卡`, await page.evaluate(() => Boolean(document.querySelector('.settings-account-v129')?.contains(document.getElementById('profilePreview')))));
      check(`${width}px Pro 方案使用獨立方案卡`, await page.locator('#accountUpgrade').isVisible() && (await page.locator('#accountUpgrade').innerText()).includes('查看方案'));
      check(`${width}px 帳號狀態登入方式與登出集中在帳號卡`, await page.evaluate(() => ['accountTitle','accountLoginMethod','accountLogout'].every(id => document.querySelector('.settings-account-v129').contains(document.getElementById(id)))));
      check(`${width}px 帳號區不顯示 Email`, await page.evaluate(() => !document.getElementById('accountEmail') && !document.querySelector('.settings-account-v129').innerText.includes('member@example.test')));
      check(`${width}px 登入方式正確顯示 Google`, (await page.locator('#accountLoginMethod').innerText()).includes('Google'));
      await page.locator('.settings-account-details > summary').click();
      check(`${width}px 帳號詳細資料可展開`, await page.locator('#accountUsername').isVisible());
      await page.locator('#accountUsername').fill('輪班喵'+width);
      await page.locator('#saveAccountUsername').click();
      check(`${width}px 使用者名稱可自訂修改`, await page.locator('#profileName').innerText() === '輪班喵'+width);
      await page.locator('#accountUpgrade').scrollIntoViewIfNeeded();
      const accountScroll = await page.evaluate(() => scrollY);
      await page.locator('#accountUpgrade').click();
      check(`${width}px Pro 方案在獨立方案卡內就地展開`, await page.locator('#proPlanSettings').isVisible() && await page.evaluate(() => document.getElementById('accountPlanCard').contains(document.getElementById('proPlanSettings'))));
      check(`${width}px 展開後顯示目前 Free 與 3 天免費試用`, await page.locator('#settingsPlanBadge').innerText() === 'Free' && (await page.locator('#proPlanSettings').innerText()).includes('3 天免費試用'));
      check(`${width}px 展開 Pro 保持在設定頁脈絡`, Math.abs((await page.evaluate(() => scrollY)) - accountScroll) < 260);
      check(`${width}px 顯示商店月繳與年繳價格`, await page.locator('#liveBillingActions').isVisible() && (await page.locator('#liveMonthlyCheckout').innerText()).includes('NT$99') && (await page.locator('#liveYearlyCheckout').innerText()).includes('NT$790'));
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
        const nodes=[document.querySelector('.settings-account-v129'),document.getElementById('appearanceCard'),document.getElementById('workSettingsCard'),document.querySelector('.settings-schedule-pref'),document.getElementById('accountPlanCard'),document.getElementById('dataSyncCard'),document.getElementById('aboutCard')];
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
      check(`${width}px 設定頁移除舊底部裝飾橫幅`, !settingsLayout.mobileRestInsideSettings && !(await page.locator('#settingsFooterBanner').isVisible()));
      if (width === 390) {
        await page.screenshot({ path: path.join(out, 'account-v119-390.png'), fullPage: true });
        await page.locator('#accountUpgrade').scrollIntoViewIfNeeded();
        await page.locator('#accountUpgrade').click();
        check('升級入口會在 Pro 卡內展開方案', await page.locator('#proPlanSettings').isVisible());
        await page.screenshot({ path: path.join(out, 'account-v119-pro-390.png'), fullPage: true });

        await page.evaluate(() => window.__accountV119.calendar());
        await page.waitForTimeout(180);

        for (const dialogWidth of [320,390,430]) {
          await page.setViewportSize({width:dialogWidth,height:844});
          await page.waitForTimeout(60);
          await page.locator('#scheduleAddDay').click();
          const scheduleDialogFit=await page.evaluate(()=>{
            const dialog=document.getElementById('scheduleAddDialog');
            const body=dialog.querySelector('.dialog-body');
            const field=document.getElementById('scheduleAddDate').closest('.field');
            const date=document.getElementById('scheduleAddDate');
            const dr=dialog.getBoundingClientRect(),br=body.getBoundingClientRect(),fr=field.getBoundingClientRect(),ir=date.getBoundingClientRect();
            return{
              dialog:{left:dr.left,right:dr.right,clientWidth:dialog.clientWidth,scrollWidth:dialog.scrollWidth},
              body:{left:br.left,right:br.right,clientWidth:body.clientWidth,scrollWidth:body.scrollWidth},
              field:{left:fr.left,right:fr.right},
              input:{left:ir.left,right:ir.right,width:ir.width}
            };
          });
          check(`${dialogWidth}px 新增日期班表的日期欄位不超出彈窗`,
            scheduleDialogFit.input.left>=scheduleDialogFit.body.left-1 &&
            scheduleDialogFit.input.right<=scheduleDialogFit.body.right+1 &&
            scheduleDialogFit.field.left>=scheduleDialogFit.body.left-1 &&
            scheduleDialogFit.field.right<=scheduleDialogFit.body.right+1 &&
            scheduleDialogFit.body.scrollWidth<=scheduleDialogFit.body.clientWidth+1 &&
            scheduleDialogFit.dialog.scrollWidth<=scheduleDialogFit.dialog.clientWidth+1
          );
          await page.locator('#scheduleAddDialogClose').click();
          check(`${dialogWidth}px 新增日期班表可正常關閉`,!(await page.locator('#scheduleAddDialog').evaluate(x=>x.open)));
        }
        await page.setViewportSize({width:390,height:844});
        await page.waitForTimeout(80);

        const aiCrop = await page.evaluate(async () => {
          const banner=document.querySelector('.schedule-ai-v129-banner');
          const img=banner&&banner.querySelector('img');
          if(!banner||!img)return null;
          if(!img.complete)await new Promise(resolve=>img.addEventListener('load',resolve,{once:true}));
          try{await img.decode()}catch(e){}
          const canvas=document.createElement('canvas');
          canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx.drawImage(img,0,0);
          const y0=Math.floor(canvas.height*.2),y1=Math.ceil(canvas.height*.8);
          const pixels=ctx.getImageData(0,y0,canvas.width,y1-y0).data;
          let blank=0;
          for(let x=0;x<canvas.width;x++){
            let pale=0,total=0;
            for(let y=0;y<(y1-y0);y++){
              const i=(y*canvas.width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
              total++;
              if(a<20||(r>232&&g>229&&b>220&&Math.max(r,g,b)-Math.min(r,g,b)<30))pale++;
            }
            if(pale/total>.92)blank++; else break;
          }
          const ir=img.getBoundingClientRect(),br=banner.getBoundingClientRect(),style=getComputedStyle(img);
          const scale=Math.max(ir.width/img.naturalWidth,ir.height/img.naturalHeight);
          const renderedWidth=img.naturalWidth*scale;
          const pos=parseFloat(style.objectPosition)||50;
          const objectOffset=(ir.width-renderedWidth)*(pos/100);
          const sourceStartFromObject=Math.max(0,-objectOffset/scale);
          const clippedElementPx=Math.max(0,br.left-ir.left);
          const sourceStart=sourceStartFromObject+clippedElementPx/scale;
          return {blank,naturalWidth:img.naturalWidth,sourceStart,irLeft:ir.left,brLeft:br.left,objectPosition:style.objectPosition};
        });
        check('AI 圖卡實際裁切已越過原圖左側白邊', aiCrop && aiCrop.sourceStart >= aiCrop.blank + 1);
        await page.locator('#aiScheduleCard').screenshot({ path: path.join(out, 'schedule-ai-card-v141-390.png') });

        await page.evaluate(() => window.__accountV119.attendance());
        await page.waitForTimeout(120);
        check('第三頁標題改為行程與待辦事項', (await page.locator('#page-attendance .itinerary-title').innerText()).includes('行程與待辦事項'));
        await page.locator('#addItinerary').click();
        check('新增行程視窗可開啟', await page.locator('#eventDialog').evaluate(x=>x.open));
        await page.locator('#eventDialogClose').click();
        check('新增行程未填資料也能用叉叉關閉', !(await page.locator('#eventDialog').evaluate(x=>x.open)));
        await page.locator('#addItinerary').click();
        await page.locator('#eventDialogCancel').click();
        check('新增行程未填資料也能用取消關閉', !(await page.locator('#eventDialog').evaluate(x=>x.open)));

        await page.locator('#attendanceTabTodos').click();
        check('待辦事項分頁可切換', await page.locator('#attendanceTabTodos').getAttribute('aria-selected') === 'true');
        await page.locator('#addItinerary').click();
        check('新增待辦視窗可開啟', await page.locator('#todoDialog').evaluate(x=>x.open));
        await page.locator('#todoDialogClose').click();
        check('新增待辦未填資料也能用叉叉關閉', !(await page.locator('#todoDialog').evaluate(x=>x.open)));
        await page.locator('#addItinerary').click();
        await page.locator('#todoTitle').fill('測試繳費');
        await page.locator('#todoDate').fill('2026-10-01');
        await page.locator('#todoNote').fill('瀏覽器自動測試');
        await page.locator('#saveTodo').click();
        check('可新增待辦事項', await page.locator('[data-todo-edit]').count() === 1 && (await page.locator('[data-todo-edit]').innerText()).includes('測試繳費'));
        check('未完成待辦數量會更新', await page.locator('#todoOpenCount').innerText() === '1');
        await page.locator('[data-todo-toggle]').click();
        check('待辦可勾選完成並離開未完成列表', await page.locator('[data-todo-edit]').count() === 0 && await page.locator('#todoOpenCount').innerText() === '0');
        await page.locator('#itineraryAllBtn').click();
        check('完成待辦可從顯示已完成重新查看', await page.locator('.todo-card-v142.completed').count() === 1);
        await page.locator('[data-todo-toggle]').click();
        check('完成待辦可以取消完成', await page.locator('.todo-card-v142.completed').count() === 0 && await page.locator('#todoOpenCount').innerText() === '1');
        await page.screenshot({ path: path.join(out, 'attendance-todos-v142-390.png'), fullPage: true });
      }
      await context.close();
    }

    const billingUser = { id: 'acct-billing-off', email: 'member@example.test', app_metadata: { provider: 'google' } };
    const { context: billingOffContext, page: billingOffPage } = await openPage(browser, base, 390, billingUser, false);
    await billingOffPage.evaluate(() => window.__accountV119.settings());
    await billingOffPage.locator('#accountUpgrade').click();
    check('網頁預覽仍顯示商店方案價格', await billingOffPage.locator('#liveBillingActions').isVisible());
    check('網頁預覽清楚標示不會進行付款', await billingOffPage.locator('#billingUnavailable').isVisible() && (await billingOffPage.locator('#billingUnavailable').innerText()).includes('App Store／Google Play'));
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
