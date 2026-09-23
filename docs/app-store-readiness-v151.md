# App Store 上架 Gate｜喵的，又要上班了

更新：2026-09-24  
Bundle ID：`com.lumilab.meowwork`  
版本：`1.0` / Build `1`

## 已在程式／CI 完成

- [x] iOS 原生 StoreKit 2 bridge 真正編入 App binary
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
- [x] App 內永久刪除帳號後清除本機 safety snapshot
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
- [x] GitHub Pages 發布後 hash 驗證
- [x] Supabase user data tables 使用 RLS

## App Store Connect／Apple Developer 外部阻塞

### P0 — 送審前一定要完成

- [ ] **Sign in with Apple（外部設定待 Apple 恢復）**
  - [x] App 登入頁與 Apple OAuth 程式端已備妥（目前以 feature gate 隱藏，避免 provider 未設定時出現壞按鈕）
  - [x] 前端 OAuth provider／回呼錯誤／登入方式顯示與 regression test
  - [ ] Apple provider 驗證成功後將 `APPLE_LOGIN_ENABLED` 切為 `true`
  - [ ] Apple Developer 開啟 Sign in with Apple capability
  - [ ] 建立需要的 Services ID／Key
  - [ ] Supabase Auth 啟用 Apple provider
  - Apple 後台完成後，再做 Sandbox／真機登入驗收

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
- User Content：Photos or Videos（AI 掃描）、Other User Content（班表／行程／待辦／備註）

目前用途：App Functionality。  
與帳號連結：是（雲端／AI／訂閱流程）。  
Tracking：否。  
本 App 不使用 ATT 追蹤，也沒有廣告追蹤用途。

## 裝置支援（v1 已鎖定）

第一版採 **iPhone-only**：

- Targeted Device Family = iPhone（1）
- iPhone v1 鎖定直向
- CI 會阻擋 Capacitor 再生專案時意外回到 iPhone + iPad（1,2）
- iPad 延後到完成獨立 UI／旋轉／素材與實機 smoke test 後再開放

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
