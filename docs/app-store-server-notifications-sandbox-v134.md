# App Store Connect｜Server Notifications V2 與 Sandbox Tester（v134）

最後更新：2026-09-24
App：喵的，又要上班了
Bundle ID：com.lumilab.meowwork

## 1. App Store Server Notifications V2

路徑：

App Store Connect → Apps → 喵的，又要上班了 → General → App Information → App Store Server Notifications

### Production Server URL

https://ygrlvmyqrhyfkglomsbq.supabase.co/functions/v1/app-store-notifications-v2

- Notification Version：Version 2
- Save

### Sandbox Server URL

https://ygrlvmyqrhyfkglomsbq.supabase.co/functions/v1/app-store-notifications-v2

- Notification Version：Version 2
- Save

本專案刻意把 Production 與 Sandbox 都明確填同一支 Supabase Edge Function。
後端會依 Apple JWS 的 environment 區分 Production / Sandbox。

Apple 若只填 Production URL，Sandbox 通知也可能送到 Production URL；
但本專案仍兩欄都填，方便設定檢查與後續除錯。

## 2. 已完成的後端接收端

Supabase Project：

ygrlvmyqrhyfkglomsbq

Edge Function：

app-store-notifications-v2

GitHub：

supabase/functions/app-store-notifications-v2/index.ts

目前功能：

- 驗證 Apple signedPayload
- 解碼 signedTransactionInfo
- 驗證 Bundle ID
- 驗證 Product ID
- 寫入 store_subscription_events
- 對應 appAccountToken / originalTransactionId 回 App 使用者
- 處理 trialing
- active
- grace_period
- past_due
- expired
- refund / revoke
- auto-renew on / off

## 3. Apple 數字 App ID

建立 App record 後：

App Store Connect → App → General → App Information

記下 Apple ID（純數字）。

之後 Supabase 必須加入：

APPLE_APP_ID=<Apple 數字 App ID>

注意：

- 這不是 Bundle ID。
- Bundle ID 是 com.lumilab.meowwork。
- APPLE_APP_ID 是 App Store Connect 自動產生的純數字 ID。
- Production JWS 驗證需要 APPLE_APP_ID。
- Sandbox 驗證流程不以這個值作為必要條件，但 TestFlight / Production 前必須補好。

## 4. Sandbox Tester

路徑：

App Store Connect → Users and Access → Sandbox → Test Accounts

建立：

- Country / Region：Taiwan
- Email：必須是從未註冊成 Apple Account 的地址
- Password：依 Apple 強度要求
- First / Last Name：測試用即可

Apple Sandbox Tester 只能用於測試，不是正式 Apple Account。

## 5. 真機登入方式

測試 In-App Purchase 時：

- iPhone 保留原本個人 Apple Account。
- 不需要登出 iCloud。
- Settings 裡使用 Sandbox Account 登入入口。
- 測試裝置需開啟 Developer Mode。
- 使用 development-signed App 進行 Sandbox IAP。

## 6. 第一輪 Sandbox 測試帳號建議

至少建立兩個 Tester：

### Tester A｜首次試用

用途：

- 月繳首次訂閱
- 驗證 3 Days Free Trial
- 取消續訂
- Restore Purchases
- 加速續訂
- 到期

### Tester B｜年繳獨立測試

用途：

- 年繳首次訂閱
- 驗證 3 Days Free Trial
- 付款失敗
- Billing Retry
- Grace Period
- Refund / Revoke

分開兩個帳號可避免同一 Subscription Group 的 introductory offer 已被用掉，導致年繳測不到首次試用。

## 7. App Store Server Notifications 驗收

通知 URL 設定完成後，Sandbox 測試至少要看到：

store_subscription_events：

- SUBSCRIBED / INITIAL_BUY 對應事件
- DID_RENEW
- DID_CHANGE_RENEWAL_STATUS
- DID_FAIL_TO_RENEW
- EXPIRED
- REFUND / REVOKE（測試退款／撤銷時）

並確認 user_entitlements：

- trialing
- active
- grace_period
- past_due
- expired

會跟 Apple 狀態同步。

## 8. Test Notification

Apple App Store Server API 支援 Request a Test Notification。
它會傳送 notificationType=TEST 的 V2 notification：

- Sandbox API → Sandbox URL
- Production API → Production URL

這需要 App Store Server API 金鑰與授權，等 Apple App ID 與 App Store Connect 設定完成後再執行。

## 9. 下一關

這一頁設定完成後：

1. 取得 Apple 數字 App ID
2. 設定 Supabase APPLE_APP_ID
3. 建 Sandbox Tester A / B
4. 真機月繳 Sandbox
5. 驗證 trialing + store_subscription_events
6. Restore
7. 取消續訂
8. 年繳 Sandbox
9. Server Notifications 全流程
10. TestFlight
