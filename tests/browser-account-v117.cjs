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
  parseLocalScheduleVision,
  parseMeowAssistant:(text)=>meowAssistantParse(text),
  parsePayrollFixture:(words)=>{
    const groups=new Map();
    (words||[]).forEach(w=>{const k=w.lineKey||'line';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(w)});
    const text=[...groups.values()].map(row=>row.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(w=>w.text).join(' ')).join('\\n');
    const variant={name:'fixture',width:1000,height:1000};
    return mergePayslipRuns([parseSingleOcrRun({text,words},variant)]);
  },
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
  await context.addInitScript(({ user }) => {
    window.__accountTest = { oauth: [], calls: [], setSessionCalls: [], reminders: [], reminderCancels: [], reminderPermissionRequests: 0, user };
    window.MeowReminder = {
      getPermissionStatus: async()=>({granted:true,status:'authorized'}),
      requestPermission: async()=>{window.__accountTest.reminderPermissionRequests++;return{granted:true,status:'authorized'}},
      schedule: async payload=>{window.__accountTest.reminders.push(payload);return{scheduled:true,...payload}},
      cancel: async payload=>{window.__accountTest.reminderCancels.push(payload);return{cancelled:true,...payload}}
    };
  }, { user });
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
    check('單一雲端還原會自動檢查舊版備份，不再要求使用者另外開檔', html.includes('async function restoreLegacyCloud()') && html.includes("return await restoreLegacyCloud()") && html.includes('不需要另外開啟 JSON 檔'));
    check('AI 班表匯入已從產品入口移除', !html.includes('id="aiScheduleCard"') && !html.includes('id="aiScheduleUpload"') && !html.includes("smart_schedule_import:{label:'智慧匯入班表'"));
    check('浮動喵助理使用定稿厭世喵素材', html.includes('./assets/meow-assistant-pro-v169.webp?v=169') && html.includes('<b>喵助理</b></button>'));
    check('喵助理語音會先寫入輸入框再自動送出', html.includes("input.value=text") && html.includes("setTimeout(()=>{if(token===meowAssistantRecognitionToken)void previewMeowAssistant()},120)"));
    check('喵助理文字位於貓咪下方且拖曳熱區加大', html.includes('flex-direction:column') && html.includes('min-width:98px;min-height:118px'));
    check('喵助理正式 iPhone 版使用原生語音辨識', html.includes('function meowSpeechBridge()') && html.includes("nativeBridge.recognize({locale:'zh-TW'})"));
    check('PWA 語音改用錄音後端轉文字，不再依賴 WebKit SpeechRecognition', html.includes('async function recordMeowAssistantAudio(token)') && html.includes('new MediaRecorder') && html.includes("invokeUserFunction('speech-transcribe'") && !html.includes('window.webkitSpeechRecognition'));
    const { context: guestContext, page: guest } = await openPage(browser, base, 390);
    check('未登入一定顯示登入頁', await guest.evaluate(() => window.__accountV119.openWelcome()));
    check('網頁登入頁保留 Google、LINE 兩個登入按鈕', await guest.locator('#welcomeGoogle, #welcomeLine').count() === 2);
    check('Apple 登入在網頁版隱藏，只留給 iPhone 原生 App', await guest.locator('#welcomeApple').isHidden());
    check('沒有訪客登入入口', await guest.locator('#welcomeGuest').count() === 0);
    check('沒有公開 Email 或 OTP 入口', await guest.locator('#welcomeEmail, #emailLoginInput, #emailOtpInput, #sendEmailOtp, #verifyEmailOtp').count() === 0);
    await guest.locator('#welcomeGoogle').click();
    check('Google 按鈕使用 google provider', await guest.evaluate(() => window.__accountTest.oauth.at(-1).provider === 'google'));
    await guest.locator('#welcomeLine').click();
    check('LINE 按鈕使用 custom:line', await guest.evaluate(() => window.__accountTest.oauth.at(-1).provider === 'custom:line'));
    check('LINE 要求 openid profile', await guest.evaluate(() => window.__accountTest.oauth.at(-1).options.scopes === 'openid profile'));
    check('Apple 原生流程使用 signInWithIdToken', html.includes("signInWithIdToken(payload)"));
    await guest.evaluate(()=>{
      const welcome=document.getElementById('welcomeDialog');
      if(welcome&&welcome.open)welcome.close();
      window.__accountV119.calendar();
    });
    await guest.locator('#scheduleAddDay').click();
    await guest.waitForTimeout(60);
    const scheduleAddFit=await guest.evaluate(()=>{
      const dialog=document.getElementById('scheduleAddDialog');
      const field=document.getElementById('scheduleAddDate');
      const dr=dialog.getBoundingClientRect(),fr=field.getBoundingClientRect();
      return {
        open:dialog.open,
        type:field.type,
        readOnly:field.readOnly,
        dialogLeft:dr.left,
        dialogRight:dr.right,
        fieldLeft:fr.left,
        fieldRight:fr.right,
        viewport:document.documentElement.clientWidth
      };
    });
    check('手機新增日期班表不超出視窗', scheduleAddFit.open && scheduleAddFit.dialogLeft>=0 && scheduleAddFit.dialogRight<=scheduleAddFit.viewport+1 && scheduleAddFit.fieldLeft>=scheduleAddFit.dialogLeft-1 && scheduleAddFit.fieldRight<=scheduleAddFit.dialogRight+1);
    check('手機新增班表日期改用緊湊文字觸發器', scheduleAddFit.type==='text' && scheduleAddFit.readOnly===true);
    await guest.locator('#scheduleAddDate').click();
    await guest.waitForTimeout(40);
    check('手機新增班表日期使用年月日選擇器', await guest.locator('#workDateDialog').evaluate(el=>el.open));
    await guest.locator('#workDateCancel').click();
    await guest.locator('#scheduleAddDialogClose').click();
    const localScheduleParsed=await guest.evaluate(()=>window.__accountV119.parseLocalScheduleVision([
      {text:'1',confidence:.99,x:.08,y:.80,width:.04,height:.03},
      {text:'2',confidence:.99,x:.18,y:.80,width:.04,height:.03},
      {text:'3',confidence:.99,x:.28,y:.80,width:.04,height:.03},
      {text:'4',confidence:.99,x:.38,y:.80,width:.04,height:.03},
      {text:'A',confidence:.97,x:.08,y:.70,width:.04,height:.03},
      {text:'B',confidence:.96,x:.18,y:.70,width:.04,height:.03},
      {text:'休',confidence:.98,x:.28,y:.70,width:.04,height:.03},
      {text:'N',confidence:.95,x:.38,y:.70,width:.04,height:.03}
    ]));
    check('本機 Vision 班表解析器可把日期對到班別', localScheduleParsed.shifts.length===4 && localScheduleParsed.shifts.map(x=>x.code).join(',')==='A,B,休,N');
    check('本機 Vision 解析保留休假狀態', localScheduleParsed.shifts[2].is_workday===false && localScheduleParsed.shifts[3].name==='夜班');
    const meowAdd=await guest.evaluate(()=>window.__accountV119.parseMeowAssistant('22號有加班'));
    check('喵助理可理解單日加班', meowAdd.ok===true && meowAdd.type==='add' && meowAdd.dates.length===1 && /-22$/.test(meowAdd.dates[0]));
    const meowMove=await guest.evaluate(()=>window.__accountV119.parseMeowAssistant('把22號加班改到26號'));
    check('喵助理可理解加班日期搬移', meowMove.ok===true && meowMove.type==='move' && /-22$/.test(meowMove.from) && /-26$/.test(meowMove.to));
    const meowBatch=await guest.evaluate(()=>window.__accountV119.parseMeowAssistant('下個月5號、12號、18號要加班'));
    check('喵助理可理解下個月多日加班', meowBatch.ok===true && meowBatch.type==='add' && meowBatch.dates.length===3 && meowBatch.dates.map(x=>x.slice(-2)).join(',')==='05,12,18');
    const meowHours=await guest.evaluate(()=>window.__accountV119.parseMeowAssistant('22號加班4小時'));
    check('喵助理可理解指定加班時數', meowHours.ok===true && meowHours.hours===4);
    const payrollParsed=await guest.evaluate(()=>window.__accountV119.parsePayrollFixture([
      {text:'底薪',confidence:98,lineKey:'l1',bbox:{x0:50,y0:100,x1:150,y1:130}},
      {text:'36,000',confidence:99,lineKey:'l1',bbox:{x0:800,y0:100,x1:900,y1:130}},
      {text:'輪班津貼',confidence:97,lineKey:'l2',bbox:{x0:50,y0:150,x1:180,y1:180}},
      {text:'3,000',confidence:99,lineKey:'l2',bbox:{x0:800,y0:150,x1:880,y1:180}},
      {text:'加班時數',confidence:97,lineKey:'l3',bbox:{x0:50,y0:200,x1:180,y1:230}},
      {text:'8',confidence:99,lineKey:'l3',bbox:{x0:500,y0:200,x1:520,y1:230}},
      {text:'1.34',confidence:99,lineKey:'l3',bbox:{x0:600,y0:200,x1:650,y1:230}},
      {text:'加班費',confidence:98,lineKey:'l4',bbox:{x0:50,y0:250,x1:150,y1:280}},
      {text:'2,680',confidence:99,lineKey:'l4',bbox:{x0:800,y0:250,x1:880,y1:280}},
      {text:'勞保費',confidence:98,lineKey:'l5',bbox:{x0:50,y0:300,x1:150,y1:330}},
      {text:'1,100',confidence:99,lineKey:'l5',bbox:{x0:800,y0:300,x1:880,y1:330}},
      {text:'健保費',confidence:98,lineKey:'l6',bbox:{x0:50,y0:350,x1:150,y1:380}},
      {text:'750',confidence:99,lineKey:'l6',bbox:{x0:800,y0:350,x1:860,y1:380}},
      {text:'福利金',confidence:98,lineKey:'l7',bbox:{x0:50,y0:400,x1:150,y1:430}},
      {text:'180',confidence:99,lineKey:'l7',bbox:{x0:800,y0:400,x1:860,y1:430}},
      {text:'勞退自提',confidence:98,lineKey:'l8',bbox:{x0:50,y0:450,x1:170,y1:480}},
      {text:'2,160',confidence:99,lineKey:'l8',bbox:{x0:800,y0:450,x1:880,y1:480}},
      {text:'實發金額',confidence:99,lineKey:'l9',bbox:{x0:50,y0:520,x1:180,y1:550}},
      {text:'37,490',confidence:99,lineKey:'l9',bbox:{x0:800,y0:520,x1:900,y1:550}}
    ]));
    check('薪資 OCR 可辨識底薪與輪班津貼', payrollParsed.base===36000 && payrollParsed.shiftAllowance===3000);
    check('薪資 OCR 不把加班時數或倍率當加班費', payrollParsed.otPay===2680);
    check('薪資 OCR 可辨識勞保健保福利金勞退', payrollParsed.dedLabor===1100 && payrollParsed.dedHealth===750 && payrollParsed.dedWelfare===180 && payrollParsed.dedPension===2160);
    check('薪資 OCR 可辨識公司實發金額', payrollParsed.actualNet===37490);
    const deductionRowParsed=await guest.evaluate(()=>window.__accountV119.parsePayrollFixture([
      {text:'考前扣款',confidence:96,lineKey:'d1',bbox:{x0:40,y0:610,x1:180,y1:640}},
      {text:'勞保費',confidence:99,lineKey:'d1',bbox:{x0:340,y0:610,x1:450,y1:640}},
      {text:'建保費',confidence:95,lineKey:'d1',bbox:{x0:650,y0:610,x1:760,y1:640}},
      {text:'673',confidence:99,lineKey:'d2',bbox:{x0:80,y0:655,x1:140,y1:685}},
      {text:'1,145',confidence:99,lineKey:'d2',bbox:{x0:365,y0:655,x1:435,y1:685}},
      {text:'826',confidence:99,lineKey:'d2',bbox:{x0:680,y0:655,x1:740,y1:685}}
    ]));
    check('薪資 OCR 可把考前誤字校正為考勤扣款 673', deductionRowParsed.dedAttendance===673);
    check('薪資 OCR 不會把考勤 673 誤塞到勞保，勞保應維持 1,145', deductionRowParsed.dedLabor===1145);
    check('薪資 OCR 可把建保誤字校正為健保並讀到金額', deductionRowParsed.dedHealth===826);
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
      check(`${width}px Pro 方案緊接在登入喵星人下方`, await page.evaluate(() => {
        const account=document.querySelector('.settings-account-v129'),plan=document.getElementById('accountPlanCard');
        return account && plan && account.nextElementSibling===plan;
      }));
      check(`${width}px 帳號狀態登入方式與登出集中在帳號卡`, await page.evaluate(() => ['accountTitle','accountLoginMethod','accountLogout'].every(id => document.querySelector('.settings-account-v129').contains(document.getElementById(id)))));
      check(`${width}px 帳號區不顯示 Email`, await page.evaluate(() => !document.getElementById('accountEmail') && !document.querySelector('.settings-account-v129').innerText.includes('member@example.test')));
      check(`${width}px 登入方式正確顯示 Google`, (await page.locator('#accountLoginMethod').innerText()).includes('Google'));
      await page.locator('.settings-account-details > summary').click();
      check(`${width}px 帳號詳細資料可展開`, await page.locator('#accountUsername').isVisible());
      await page.locator('#accountUsername').fill('輪班喵'+width);
      await page.locator('#saveAccountUsername').click();
      check(`${width}px 使用者名稱可自訂修改`, await page.locator('#profileName').innerText() === '輪班喵'+width);
      await page.locator('#accountUpgrade').scrollIntoViewIfNeeded();
      await page.locator('#accountUpgrade').click();
      check(`${width}px Pro 方案改用比較視窗`, await page.locator('#proPlanDialog').isVisible() && await page.locator('#proPlanSettings').isVisible());
      check(`${width}px 比較視窗顯示 Free／Pro 差異`, (await page.locator('#proPlanDialog').innerText()).includes('升級 Pro 助理') && (await page.locator('#proPlanSettings').innerText()).includes('薪資單三層交叉檢查'));
      check(`${width}px 比較視窗不再出現 AI 班表匯入`, !(await page.locator('#proPlanDialog').innerText()).includes('AI 班表'));
      check(`${width}px 方案視窗顯示目前 Free 與 3 天免費試用`, await page.locator('#settingsPlanBadge').innerText() === 'Free' && (await page.locator('#proPlanSettings').innerText()).includes('3 天免費試用'));
      check(`${width}px 顯示商店月繳與年繳價格`, await page.locator('#liveBillingActions').isVisible() && (await page.locator('#liveMonthlyCheckout').innerText()).includes('NT$99') && (await page.locator('#liveYearlyCheckout').innerText()).includes('NT$790'));
      await page.locator('#proPlanDialogClose').click();
      await page.locator('#toggleAppearance').scrollIntoViewIfNeeded();
      await page.locator('#toggleAppearance').click();
      check(`${width}px 顯示與外觀可展開`, await page.locator('#appearanceBody').isVisible() && await page.locator('#toggleAppearance').getAttribute('aria-expanded') === 'true');
      await page.locator('#toggleAppearance').click();
      await page.locator('#toggleSchedulePrefs').scrollIntoViewIfNeeded();
      await page.locator('#toggleSchedulePrefs').click();
      check(`${width}px 排班偏好可展開`, await page.locator('#schedulePrefsBody').isVisible() && await page.locator('#toggleSchedulePrefs').getAttribute('aria-expanded') === 'true');
      check(`${width}px 四個設定展開文字右側對齊`, await page.evaluate(() => ['appearanceFoldState','workSettingsFoldState','schedulePrefsFoldState','dataSyncFoldState'].every(id=>{const el=document.getElementById(id);return el&&getComputedStyle(el).textAlign==='right'})));
      check(`${width}px 排班偏好不再提供 AI 班表匯入`, !(await page.locator('#schedulePrefCard').innerText()).includes('AI 班表匯入'));
      await page.locator('#toggleSchedulePrefs').click();
      await page.locator('#toggleWorkSettings').scrollIntoViewIfNeeded();
      await page.locator('#toggleWorkSettings').click();
      check(`${width}px 工作資料與假別額度可就地展開`, await page.locator('#workSettingsBody').isVisible() && await page.locator('#toggleWorkSettings').getAttribute('aria-expanded') === 'true');
      await page.locator('#toggleWorkSettings').click();
      await page.locator('#toggleDataSync').scrollIntoViewIfNeeded();
      await page.locator('#toggleDataSync').click();
      check(`${width}px 資料與同步可就地展開`, await page.locator('#dataSyncBody').isVisible() && await page.locator('#toggleDataSync').getAttribute('aria-expanded') === 'true');
      check(`${width}px 資料管理只分 Free 本機與 Pro 雲端`, await page.evaluate(() => {
        const text=document.getElementById('dataSyncBody').innerText;
        return text.includes('Free・本機保存') && text.includes('Pro・本機＋雲端') && !text.includes('匯出備份檔') && !text.includes('匯入備份檔');
      }));
      check(`${width}px Free 的 Pro 雲端操作保持鎖定`, await page.locator('#cloudBackupNow').isDisabled() && await page.locator('#cloudRestoreNow').isDisabled());
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
        const nodes=[document.querySelector('.settings-account-v129'),document.getElementById('accountPlanCard'),document.getElementById('appearanceCard'),document.getElementById('workSettingsCard'),document.querySelector('.settings-schedule-pref'),document.getElementById('dataSyncCard'),document.getElementById('aboutCard')];
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
        check('升級入口會跳出 Free／Pro 比較視窗', await page.locator('#proPlanDialog').isVisible() && await page.locator('#proPlanSettings').isVisible());
        await page.screenshot({ path: path.join(out, 'account-v119-pro-390.png'), fullPage: true });
        await page.locator('#proPlanDialogClose').click();

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

        check('月曆頁不再顯示 AI 班表匯入', await page.locator('#aiScheduleCard').count()===0 && await page.locator('#scheduleMenuClearAi').count()===0);
        check('浮動喵助理顯示定稿圖與名稱', await page.locator('#meowAssistantFab img').getAttribute('src')==='./assets/meow-assistant-pro-v169.webp?v=169' && (await page.locator('#meowAssistantFab').innerText()).includes('喵助理') && await page.locator('#meowAssistantFab img').evaluate(img=>img.complete&&img.naturalWidth>0));

        await page.evaluate(() => window.__accountV119.attendance());
        await page.waitForTimeout(120);
        check('第三頁使用參考圖的行程與待辦頁首', (await page.locator('.ref-itinerary-hero').innerText()).includes('行程與待辦事項'));
        check('參考圖的新增行程與新增待辦按鈕可見', await page.locator('#refAddEvent').isVisible() && await page.locator('#refAddTodo').isVisible());
        await page.locator('#refAddEvent').click();
        check('新增行程按鈕直接開啟行程視窗', await page.locator('#eventDialog').evaluate(x=>x.open));
        check('新行程預設前 1 小時提醒', await page.locator('#eventReminder').inputValue() === '1h');
        check('行程提醒提供前 3 天、前 1 天、前 1 小時', await page.locator('#eventReminder option').count() === 4);
        await page.locator('#eventDialogClose').click();
        check('新增行程未填資料也能用叉叉關閉', !(await page.locator('#eventDialog').evaluate(x=>x.open)));
        await page.locator('#refAddEvent').click();
        await page.locator('#eventDialogCancel').click();
        check('新增行程未填資料也能用取消關閉', !(await page.locator('#eventDialog').evaluate(x=>x.open)));

        await page.locator('#attendanceTabTodos').click();
        check('待辦事項分頁可切換', await page.locator('#attendanceTabTodos').getAttribute('aria-selected') === 'true');
        await page.locator('#refAddTodo').click();
        check('新增待辦按鈕直接開啟待辦視窗', await page.locator('#todoDialog').evaluate(x=>x.open));
        check('新待辦預設前一天上午 9 點提醒', await page.locator('#todoReminder').inputValue() === '1d');
        await page.locator('#todoDialogClose').click();
        check('新增待辦未填資料也能用叉叉關閉', !(await page.locator('#todoDialog').evaluate(x=>x.open)));
        await page.locator('#refAddTodo').click();
        await page.locator('#todoTitle').fill('測試繳費');
        await page.locator('#todoDate').fill('2026-10-01');
        await page.locator('#todoTime').fill('18:30');
        await page.locator('#todoNote').fill('瀏覽器自動測試');
        await page.locator('#saveTodo').click();
        check('可新增待辦事項', await page.locator('[data-todo-edit]').count() === 1 && (await page.locator('[data-todo-edit]').innerText()).includes('測試繳費'));
        check('未完成待辦數量會更新', await page.locator('#todoOpenCount').innerText() === '1');
        check('待辦清單顯示自由選擇時間', (await page.locator('[data-todo-edit]').innerText()).includes('18:30'));
        await page.locator('[data-todo-edit]').click();
        check('編輯待辦會帶回原本時間', await page.locator('#todoTime').inputValue() === '18:30');
        await page.locator('#todoDialogClose').click();
        await page.waitForFunction(()=>window.__accountTest.reminders.some(x=>x.kind==='todo'&&x.body==='測試繳費'));
        const scheduledTodoReminder=await page.evaluate(()=>window.__accountTest.reminders.find(x=>x.kind==='todo'&&x.body==='測試繳費'));
        check('新增待辦會呼叫原生通知排程', !!scheduledTodoReminder && scheduledTodoReminder.id.startsWith('meow.todo.') && !!scheduledTodoReminder.fireAt);
        const reminderHour=await page.evaluate(fireAt=>new Date(fireAt).getHours(),scheduledTodoReminder.fireAt);
        const reminderMinute=await page.evaluate(fireAt=>new Date(fireAt).getMinutes(),scheduledTodoReminder.fireAt);
        check('前一天提醒沿用使用者選的時間', reminderHour===18 && reminderMinute===30);
        check('待辦清單顯示自訂提醒時間', (await page.locator('[data-todo-edit]').innerText()).includes('前一天 18:30 提醒'));
        const reminderCountBeforeComplete=await page.evaluate(()=>window.__accountTest.reminders.length);
        await page.locator('[data-todo-toggle]').click();
        await page.waitForFunction(()=>window.__accountTest.reminderCancels.some(x=>String(x.id||'').startsWith('meow.todo.')));
        check('完成待辦會取消原生提醒', await page.evaluate(()=>window.__accountTest.reminderCancels.some(x=>String(x.id||'').startsWith('meow.todo.'))));
        check('待辦勾選完成後仍留在列表', await page.locator('.todo-card-v142.completed').count() === 1 && await page.locator('[data-todo-edit]').count() === 1 && await page.locator('#todoOpenCount').innerText() === '0');
        check('完成待辦預設顯示且提供隱藏按鈕', (await page.locator('#refItineraryAllBtn').innerText()).includes('隱藏已完成'));
        await page.locator('#refItineraryAllBtn').click();
        check('可主動隱藏已完成待辦', await page.locator('[data-todo-edit]').count() === 0);
        await page.locator('#refItineraryAllBtn').click();
        check('可重新顯示已完成待辦', await page.locator('.todo-card-v142.completed').count() === 1);
        await page.locator('[data-todo-toggle]').click();
        check('完成待辦可以取消完成', await page.locator('.todo-card-v142.completed').count() === 0 && await page.locator('#todoOpenCount').innerText() === '1');
        await page.waitForFunction(count=>window.__accountTest.reminders.length>count,reminderCountBeforeComplete);
        check('取消完成會重新排程提醒', await page.evaluate(count=>window.__accountTest.reminders.length>count,reminderCountBeforeComplete));
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
    await page.locator('.settings-account-details > summary').click();
    await page.locator('#accountUsername').fill('登出保留喵');
    await page.locator('#saveAccountUsername').click();
    check('登出前工作區資料已保存', await page.locator('#profileName').innerText() === '登出保留喵');
    await page.locator('#accountLogout').click();
    await page.waitForFunction(() => document.getElementById('welcomeDialog').open === true);
    check('主動登出後重新顯示登入頁', await page.evaluate(() => window.__accountV119.openWelcome()));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__accountV119 !== undefined);
    check('登出後重開仍顯示登入頁', await page.evaluate(() => window.__accountV119.openWelcome()));
    await page.evaluate(() => localStorage.removeItem('__account_test_signed_out'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__accountV119 !== undefined);
    await page.waitForTimeout(150);
    check('同一帳號重新登入後回到原本工作區', !(await page.evaluate(() => window.__accountV119.openWelcome())));
    await page.evaluate(() => window.__accountV119.settings());
    check('登出不會刪除同一帳號的本機工作資料', await page.locator('#profileName').innerText() === '登出保留喵');
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
