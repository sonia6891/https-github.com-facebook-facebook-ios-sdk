# App Store 上架 Gate｜喵的，又要上班了｜v152

更新：2026-09-24  
Bundle ID：`com.lumilab.meowwork`  
版本：`1.0` / Build `1`

## 已在程式／CI 完成

- [x] iOS 原生 StoreKit 2 bridge 真正編入 App binary
- [x] Sign in with Apple 按鈕已加入 iPhone App
- [x] iOS AuthenticationServices 原生 Apple 登入 bridge
- [x] Apple identity token 透過 Supabase `signInWithIdToken` 建立登入 session
- [x] Sign in with Apple entitlement 已寫入 Xcode 生成流程與 CI gate
- [x] Apple 登入僅在 iPhone 原生 App 顯示；網頁版維持 Google／LINE，避免維護 Apple Web OAuth secret
- [x] iOS 本機通知 bridge 真正編入 App binary
- [x] Xcode Simulator Debug build
- [x] unsigned iPhoneOS Release build
- [x] StoreKit 本機購買 smoke test
- [x] 月繳商品 `meowwork.pro.monthly`
- [x] 年繳商品 `meowwork.pro.yearly`
- [x] 本機 StoreKit：NT$99／月、NT$790／年、3 天免費試用
- [x] 購買後先經後端驗證，再 finish transaction
- [x] unfinished transaction 重試
- [x] Transaction.updates
- [x] 恢復購買
- [x] 管理／取消訂閱
- [x] App Store Server Notifications V2 endpoint 已部署
- [x] App 內永久刪除帳號
- [x] 刪除帳號後，孤立的既有 App Store 訂閱可安全重新綁定新帳號
- [x] 隱私權政策公開頁
- [x] 服務條款公開頁
- [x] App 支援公開頁
- [x] 法律頁面打包進原生 App
- [x] App 自有 PrivacyInfo.xcprivacy
- [x] Capacitor／Cordova SDK privacy manifests 保留
- [x] `ITSAppUsesNonExemptEncryption = NO`
- [x] App icon 1024×1024
- [x] iPhone v1 鎖定直向，避免尚未驗證的 landscape 桌面版跑版
- [x] 第一版 Targeted Device Family 收斂為 iPhone-only，不宣告尚未完整驗證的 iPad 支援
- [x] GitHub Pages 發布後 hash 驗證
- [x] Supabase user data tables 使用 RLS

## App Store Connect／Apple Developer 外部阻塞

### P0 — 送審前一定要完成

- [ ] **Sign in with Apple 外部設定**
  - App 端已完成：登入按鈕、原生 AuthenticationServices、ID token、entitlement、CI gate
  - Apple Developer：為 Bundle ID `com.lumilab.meowwork` 正式開啟 Sign in with Apple capability
  - Supabase Auth：啟用 Apple provider，Client IDs 加入 `com.lumilab.meowwork`
  - 本版 iOS 採 native-only Apple 登入；依 Supabase 官方文件，不需要另外建立 Web OAuth Services ID／Key 才能完成原生 iOS 登入

- [ ] **正式 App Store numeric App ID**
  - App Store Connect 建立 App 後取得數字 App ID
  - 將數值設定到 Supabase `APPLE_APP_ID`
  - 目前 readiness：`production_server_verification_ready=false`

- [ ] **App Store Server Notifications V2**
  - 在 App Store Connect 設定 Production／Sandbox notification URL：
    `https://ygrlvmyqrhyfkglomsbq.supabase.co/functions/v1/app-store-notifications-v2`

- [ ] **App Store Connect 訂閱商品**
  - 同一 Subscription Group
  - `meowwork.pro.monthly`
  - `meowwork.pro.yearly`
  - Taiwan 價格／其他地區在地化價格
  - 3 天 introductory free trial
  - Display Name、Description、Review Screenshot
  - Add for Review

- [ ] **Signing**
  - Apple Developer Team / Distribution certificate / provisioning
  - Xcode Signing & Capabilities
  - Archive → Validate App → Upload to App Store Connect

- [ ] **Support URL 必須有真實聯絡資訊**
  - 目前 support.html 有 FAQ，但仍缺公開聯絡電子郵件／依法需要的地址或電話
  - 不可使用虛構資料

### P1 — App Store metadata

- [ ] Privacy Policy URL
  - `https://sonia6891.github.io/https-github.com-facebook-facebook-ios-sdk/privacy.html`
- [ ] Support URL
  - `https://sonia6891.github.io/https-github.com-facebook-facebook-ios-sdk/support.html`
- [ ] Terms of Use URL
  - `https://sonia6891.github.io/https-github.com-facebook-facebook-ios-sdk/terms.html`
- [ ] App 名稱、副標題、Promotional Text、Description、Keywords
- [ ] App Review 聯絡人：姓名、email、電話
- [ ] Review Notes：Google／LINE／Apple 登入與 Pro 測試步驟
- [ ] Screenshot / App Preview
- [ ] Copyright
- [ ] Primary / Secondary Category

### P1 — App Privacy

App Store Connect 選「會收集資料」，依目前 App 功能至少檢查以下類型：

- Contact Info：Name、Email Address
- Identifiers：User ID
- Purchases：Purchase History
- Financial Info：Other Financial Info（薪資／扣款）
- Health & Fitness：Health（病假／生理假等健康相關假別資料，若啟用雲端）
- User Content：Photos or Videos（僅使用者主動使用薪資單雲端 AI 辨識時；智慧班表圖片留在本機）、Other User Content（班表／行程／待辦／備註）

目前用途：App Functionality。  
與帳號連結：是（雲端／AI／訂閱流程）。  
Tracking：否。  
本 App 不使用 ATT 追蹤，也沒有廣告追蹤用途。

## 裝置支援

第一版已鎖定 **iPhone-only**：

- Targeted Device Family：iPhone（1）
- iPhone 直向
- 不宣告 iPad 支援，因此第一版不需要額外承擔未驗證的 iPad UI／截圖範圍
- 未來完成 iPad UI 與測試後，可再擴大裝置支援

## 每次送審前自動 Gate

CI 必須同時通過：

- Pages UI/browser regression
- LINE provider preflight
- Pro AI preflight
- StoreKit local purchase smoke
- Capacitor native iOS bootstrap
- Debug simulator build
- Release iPhoneOS build
- StoreKit / reminder bridge source verification
- App bundle legal pages
- Export compliance flag
- App + SDK Privacy Manifests


## 2026-09-24 最終自動驗證狀態

- [x] LINE login + UI preflight：PASS
- [x] Pro AI preflight：PASS
- [x] StoreKit local purchase smoke：PASS
- [x] iOS Simulator build：PASS
- [x] unsigned iPhoneOS Release build：PASS
- [x] App Store submission bundle verification：PASS
- [x] GitHub Pages regression：PASS
- [x] 登出／重新登入工作區資料保留 regression：PASS
- [x] 待辦完成／取消完成與提醒取消／重排 regression：PASS
- [x] Support URL 已新增公開支援回報入口
- [x] App Store metadata v152 已準備並驗證欄位長度限制

目前程式端已進入「可接 App Store Connect / TestFlight 前置」狀態。正式送審仍需完成 Apple Developer、App Store Connect、Supabase Apple provider 與真實公開聯絡資訊等外部設定。

## 2026-09-24 本機智慧班表成本調整

- [x] 班表圖片匯入已改用 Apple Vision 在 iPhone 本機辨識
- [x] 前端不再呼叫 OpenAI `schedule_scan`
- [x] Supabase `pro-ai` version 6 已移除 `schedule_scan`
- [x] AI 用量 RPC 不再接受 `schedule_scan`
- [x] 班表匯入 OpenAI API 邊際成本為 0
- [x] 隱私政策已明確標示班表圖片不傳 Supabase／OpenAI
- [x] Xcode Simulator／Release device build 均通過 Apple Vision bridge 編譯
- [x] 瀏覽器 regression 已驗證本機解析器與無雲端 schedule scan

## 2026-09-24 v152 補強紀錄

- [x] 修正舊 UI gate 因 build tag 從 v151 升到 v152 造成的假紅燈
- [x] 待辦完成後保留在列表；完成會取消提醒，取消完成會重新排程
- [x] 登出只切換工作區，不刪除帳號工作資料；同帳號重新登入 regression 已加入
- [x] Supabase security advisor 已檢查；`store_subscription_events` 採 RLS 且無前端 policy，維持後端事件表不可由前端直接讀取
- [x] CI 原生 App：Simulator build、unsigned Release build、App Store bundle 驗證已成功
- [x] 修正 native CI 自動生成檔在 main 快速前進時的 rebase 假失敗；新 workflow 會取消舊 run 並避免 stale run push
