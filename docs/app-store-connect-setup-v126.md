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
