# App Store Connect 設定清單（v126）

此文件對應 `docs/pro-store-subscription-spec-v124.md` 與目前已編譯成功的 StoreKit 2 iOS 專案。

## App 基本資料

- App 名稱：喵的，又要上班了
- Bundle ID：`com.lumilab.meowwork`
- iOS 原生專案：`native/ios`
- StoreKit bridge：`MeowStoreBilling`

> Bundle ID 在正式建立 App Store Connect App 前仍可做最後確認；一旦 App 與商品正式建立後，不隨意更換。

## 訂閱群組

建議群組名稱：

`Meow Work Pro`

同一群組建立兩個 Auto-Renewable Subscription。

## 月繳商品

- Product ID：`meowwork.pro.monthly`
- Reference Name：`Meow Work Pro Monthly`
- 台灣目標售價：NT$99／月
- 免費試用：3 Days
- Introductory Offer：Free Trial

## 年繳商品

- Product ID：`meowwork.pro.yearly`
- Reference Name：`Meow Work Pro Yearly`
- 台灣目標售價：NT$790／年
- 免費試用：3 Days
- Introductory Offer：Free Trial

## App Store Server Notifications V2

Supabase 已部署接收端：

`https://ygrlvmyqrhyfkglomsbq.supabase.co/functions/v1/app-store-notifications-v2`

App Store Connect 應使用 Version 2 notifications。

正式環境與 Sandbox 若介面允許分開設定，兩者均指向目前這支驗證端點；後端會依 Apple JWS 的 environment 進行驗證。

## Apple App ID

正式 Production JWS 驗證需要 App Store Connect 裡該 App 的數字 Apple ID。

建立 App 後，到 App Information 取得 Apple ID，並在 Supabase Edge Function secrets 設定：

`APPLE_APP_ID=<App Store Connect 的數字 Apple ID>`

目前 Sandbox JWS 驗證不需要這個值；Production 上線前必須補上。

## 已完成的後端

- `verify-app-store-transaction`
  - 驗證 StoreKit 2 的 Apple JWS
  - 驗證 Bundle ID
  - 驗證 Product ID
  - 驗證 `appAccountToken` 等於目前登入的 Supabase user ID
  - 驗證成功後才更新 `user_entitlements`

- `app-store-notifications-v2`
  - 驗證 Apple Server Notifications V2 的 `signedPayload`
  - 驗證 `signedTransactionInfo`
  - 處理續訂、取消自動續訂、付款重試、Grace Period、到期、退款與撤銷
  - 事件寫入 `store_subscription_events`

## 已完成的 iOS StoreKit 2

- 商品讀取
- Intro offer eligibility 讀取
- 購買
- `appAccountToken`
- `jwsRepresentation`
- Restore Purchases
- Current Entitlements
- Manage Subscriptions
- iOS Simulator Xcode build 通過

## 購買安全鏈

1. 使用者登入 Supabase。
2. Web UI 呼叫 iOS StoreKit bridge。
3. StoreKit purchase 帶入目前 Supabase UUID 作為 `appAccountToken`。
4. Apple 完成 Sandbox／Production 購買。
5. iOS 取得 verified transaction 與 `jwsRepresentation`。
6. App 將 JWS 送到 `verify-app-store-transaction`。
7. Supabase 使用 Apple 官方 App Store Server Library 驗證 JWS。
8. `appAccountToken` 必須與目前登入帳號一致。
9. 驗證成功才將帳號改為 Pro。
10. 後續續訂／取消／退款由 App Store Server Notifications V2 持續同步。

## App Store Connect 建立完成後要取得

- App Apple ID（數字）
- Subscription Group ID
- 月繳商品狀態
- 年繳商品狀態
- 3 天試用是否已掛在兩個商品上
- Sandbox 測試帳號

## 下一個驗收階段

App Store Connect 商品建立完成後：

1. 補 `APPLE_APP_ID`。
2. 建立 Sandbox Tester。
3. 用真實 iOS Sandbox 購買月繳。
4. 確認 Supabase entitlement 變為 `trialing` 或 `active`。
5. 驗證 Restore Purchases。
6. 驗證取消續訂。
7. 驗證 Sandbox 自動續訂。
8. 驗證 App Store Server Notification event 寫入。
9. 驗證到期後回 Free。
10. 才進入 TestFlight。


## 2026-09-24｜App Store Connect 實際建立順序

依目前 App Store Connect 介面，建議照以下順序操作，避免先建商品後才被協議／App 記錄卡住。

### A. Business 前置

1. App Store Connect → Business → Agreements。
2. 由 Account Holder 接受最新 Paid Apps Agreement。
3. 完成必要 Tax 資料。
4. 完成 Banking 資料。

沒有有效 Paid Apps Agreement 時，不應開始建立正式付費 In-App Purchase／訂閱商品。

### B. 建立 App 記錄

Apps → 左上角「＋」→ New App。

固定值：

- Platforms：iOS
- App Name：喵的，又要上班了
- Primary Language：Traditional Chinese (zh-Hant)
- Bundle ID：`com.lumilab.meowwork`
- SKU：建議 `MEOWWORK-IOS-001`（僅內部識別；建立後不可修改）
- User Access：Full Access（除非帳號未來需要限制特定 App）

建立完成後，到 General → App Information 記下 Apple 自動產生的數字 Apple ID。

### C. 建立訂閱群組

App → Monetization → Subscriptions → 「＋」。

- Subscription Group Reference Name：`Meow Work Pro`
- 目前只建立這一個群組。
- 月繳與年繳必須放在同一個群組，避免同一使用者同時持有兩個 Pro 訂閱。

### D. 建立月繳

- Reference Name：`Meow Work Pro Monthly`
- Product ID：`meowwork.pro.monthly`
- Duration：1 Month
- 台灣目標價格：NT$99
- Display Name（zh-Hant）：Pro 月繳
- Description（zh-Hant）：每月自動續訂。首次符合資格可享 3 天免費試用。

Introductory Offer：

- Type：Free
- Duration：3 Days
- 台灣與預計上架 storefront 均啟用。

### E. 建立年繳

- Reference Name：`Meow Work Pro Yearly`
- Product ID：`meowwork.pro.yearly`
- Duration：1 Year
- 台灣目標價格：NT$790
- Display Name（zh-Hant）：Pro 年繳
- Description（zh-Hant）：每年自動續訂。首次符合資格可享 3 天免費試用。

Introductory Offer：

- Type：Free
- Duration：3 Days
- 台灣與預計上架 storefront 均啟用。

注意：同一 Subscription Group 的使用者只會有一次 introductory offer 資格；月繳用過 3 天免費試用後，改年繳不會再取得第二次免費試用。

### F. Multiseat Purchase

2026 年 App Store Connect 對 auto-renewable subscription 加入 Multiseat Purchase 選項，且新商品可能預設開啟。

「喵的，又要上班了」目前 Pro 是個人帳號／個人排班與薪資資料用途，因此建立月繳與年繳後：

- 進入各 subscription 的 Purchase Options。
- 確認 Multiseat Purchase 關閉。
- 未來若真的推出企業／家庭／團隊方案，再另行評估，不直接用個人 Pro 商品共用。

### G. App Store Server Notifications V2

App → General → App Information → App Store Server Notifications。

Production Server URL：

`https://ygrlvmyqrhyfkglomsbq.supabase.co/functions/v1/app-store-notifications-v2`

Sandbox Server URL：

`https://ygrlvmyqrhyfkglomsbq.supabase.co/functions/v1/app-store-notifications-v2`

兩者都選 Version 2。

若 Sandbox URL 留空，Apple 也可把 Sandbox 通知送到 Production URL；本專案仍建議兩欄明確填同一支 endpoint，方便日後檢查設定。

### H. Supabase Apple App ID

建立 App 記錄後，從 App Information 取得 Apple 自動產生的數字 Apple ID。

將它設定為 Supabase Edge Function secret：

`APPLE_APP_ID=<數字 Apple ID>`

Bundle ID 已固定為：

`APPLE_BUNDLE_ID=com.lumilab.meowwork`

Production JWS 驗證前 `APPLE_APP_ID` 必須存在；Sandbox 本身不依賴這個數字，但應在進 TestFlight 前補齊。

### I. Sandbox Tester

Users and Access → Sandbox → Test Accounts → 建立測試帳號。

- Email 必須是從未註冊過 Apple Account 的新地址。
- Country / Region：Taiwan。
- 真機需啟用 Developer Mode。
- 測試 In-App Purchase 時使用 Settings 裡的 Sandbox 登入，不需要登出手機本身的個人 Apple Account。

### J. Sandbox 第一輪驗收

建立完成後先跑：

1. 月繳首次購買 → 3 天 Trial。
2. Supabase `user_entitlements.status` → `trialing`。
3. `store_subscription_events` 出現 App Store 交易事件。
4. 關 App／斷網情境後確認 unfinished transaction 可恢復。
5. Restore Purchases。
6. 關閉自動續訂，確認到期前仍可用 Pro。
7. 加速續訂。
8. Payment Failure／Billing Retry／Grace Period。
9. Refund／Revoke／Expire。
10. 年繳重跑一次。

以上全綠才進 TestFlight。
