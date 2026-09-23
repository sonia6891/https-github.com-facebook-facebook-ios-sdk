# StoreKit 本機測試與 Sandbox Gate（v130）

最後更新：2026-09-23  
基準：`docs/pro-store-subscription-spec-v124.md`

## 已完成，可由程式庫直接驗證

- iOS StoreKit 2 bridge 已接入。
- 商品 ID 固定為 `meowwork.pro.monthly`、`meowwork.pro.yearly`。
- 本機 StoreKit 設定：月繳 NT$99、年繳 NT$790。
- 月繳／年繳皆配置 3 天 Free Trial（`P3D`）。
- shared Xcode scheme 已指向 `MeowWork.storekit`。
- 購買帶入 Supabase user UUID 作為 `appAccountToken`。
- App 取得 Apple signed transaction 後先送 Supabase 驗證。
- 只有後端驗證成功才呼叫 `finishTransaction()`。
- 驗證失敗、斷網或 App 中斷時，交易保持 unfinished。
- App 啟動後由 `Transaction.updates` 與 `Transaction.unfinished` 重新接手。
- Restore Purchases 與 Manage Subscriptions 已接入。
- Supabase transaction verifier 與 App Store Server Notifications V2 接收端已完成。

## CI Gate

`.github/workflows/storekit-local-smoke.yml` 會在 macOS runner 執行：

1. Node 驗證 gate：後端驗證成功前不得 finish；驗證／網路失敗時不得 finish。
2. StoreKitTest：兩個商品均可從本機設定載入。
3. StoreKitTest：兩個商品均暴露 3 天 Free Trial。
4. StoreKitTest：購買時 `appAccountToken` 會寫入交易。
5. StoreKitTest：新交易在 explicit finish 前會出現在 `Transaction.unfinished`。
6. StoreKitTest：explicit finish 後交易會離開 unfinished queue。

本機 StoreKit Testing 不需要先建立 App Store Connect 商品，也不會產生真實扣款。

## 進入 Apple Sandbox 前仍需人工完成

以下項目不能由 repo 直接代替 App Store Connect 帳號操作：

- [ ] Paid Apps Agreement 已簽署且狀態可用。
- [ ] 必要稅務資料已提交。
- [ ] 收款銀行資料已提交。
- [ ] App Store Connect 建立 App，Bundle ID 使用 `com.lumilab.meowwork`。
- [ ] 建立 Subscription Group：`Meow Work Pro`。
- [ ] 建立 `meowwork.pro.monthly`。
- [ ] 建立 `meowwork.pro.yearly`。
- [ ] 設定台灣售價目標：月繳 NT$99、年繳 NT$790（App 最終以商店在地化價格為準）。
- [ ] 兩個商品皆建立 3 Days / Free Trial introductory offer。
- [ ] App Store Server Notifications 使用 Version 2。
- [ ] Production Server URL 設為：
  `https://ygrlvmyqrhyfkglomsbq.supabase.co/functions/v1/app-store-notifications-v2`
- [ ] Sandbox Server URL 亦指向上述端點（或確認採用 Production URL 接收兩種環境）。
- [ ] 從 App Information 取得數字 Apple ID，寫入 Supabase secret：`APPLE_APP_ID`。
- [ ] 建立 Sandbox Apple Account。
- [ ] 真機啟用 Developer Mode，以 development-signed App 執行 Sandbox 購買。

## Sandbox 驗收順序

1. 月繳首次購買：確認可進入 3 天試用。
2. entitlement 變為 `trialing` 或正確有效狀態。
3. 關 App／中斷網路後重開：unfinished transaction 可被重新驗證與完成。
4. Restore Purchases：同一 App 帳號可恢復有效 Pro。
5. 取消自動續訂：Pro 可用到有效期限，後端狀態同步。
6. Sandbox 加速續訂：續訂事件有寫入 `store_subscription_events`。
7. 模擬付款失敗／Grace Period：狀態正確進入 `past_due`／`grace_period`。
8. 模擬退款／撤銷／到期：entitlement 正確降回 Free。
9. 年繳重跑同一套流程。
10. Sandbox 全綠後再進 TestFlight。

## 注意

App Store Connect 商品或 introductory offer metadata 更新後，Sandbox 端可能需要一段時間才看得到新設定；不要把短暫的商品讀不到直接判成程式失敗。
