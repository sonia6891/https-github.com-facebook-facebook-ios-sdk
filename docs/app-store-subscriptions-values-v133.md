# App Store Connect｜Pro 訂閱群組與商品固定值（v133）

最後更新：2026-09-24
對應 App：喵的，又要上班了
Bundle ID：com.lumilab.meowwork

## 建立路徑

App Store Connect → Apps → 喵的，又要上班了 → Monetization → Subscriptions

先建立 Subscription Group，再把月繳與年繳都放進同一群組。

## Subscription Group

- Reference Name：Meow Work Pro
- Display Name（zh-Hant）：Pro 方案
- App Name Display：使用 App 名稱
- 群組數量：只建立 1 個

Apple 同一 Subscription Group 一次只能持有其中一項訂閱，因此月繳與年繳放同一群組。

## Subscription Level

月繳與年繳提供完全相同的 Pro 權限，只差訂閱期限與價格，因此：

- meowwork.pro.monthly：Level 1
- meowwork.pro.yearly：Level 1

不要把月繳與年繳做成不同等級；Apple 允許相同內容、不同期間的方案堆疊在同一 level。

## 月繳商品

- Reference Name：Meow Work Pro Monthly
- Product ID：meowwork.pro.monthly
- Duration：1 Month
- 台灣目標價格：NT$99
- Availability：Taiwan（後續正式上架市場再擴充）
- Display Name（Traditional Chinese）：Pro 月繳
- Description（Traditional Chinese）：每月自動續訂。首次符合資格可享 3 天免費試用。

### Introductory Offer

Subscription Prices → View all Subscription Pricing → Set up Introductory Offer

- Offer Type：Free
- Duration：3 Days
- Storefront：Taiwan
- Start Date：立即生效
- End Date：不設結束日（若介面要求日期，依正式上架策略設定）

## 年繳商品

- Reference Name：Meow Work Pro Yearly
- Product ID：meowwork.pro.yearly
- Duration：1 Year
- 台灣目標價格：NT$790
- Availability：Taiwan（後續正式上架市場再擴充）
- Display Name（Traditional Chinese）：Pro 年繳
- Description（Traditional Chinese）：每年自動續訂。首次符合資格可享 3 天免費試用。

### Introductory Offer

- Offer Type：Free
- Duration：3 Days
- Storefront：Taiwan
- Start Date：立即生效
- End Date：不設結束日（若介面要求日期，依正式上架策略設定）

## 免費試用資格

Apple 規則：同一 Subscription Group 的使用者只能兌換一次 introductory offer。

因此：

- 第一次選月繳並用過 3 天免費試用 → 之後改年繳不會再得到第二次試用。
- 第一次選年繳並用過 3 天免費試用 → 之後改月繳不會再得到第二次試用。
- App 不自行發放第二次 trial。
- Supabase 不自行判斷 trial eligibility；由 StoreKit / App Store 決定。

## Purchase Options

月繳與年繳都檢查：

- Multiseat Purchase：OFF
- Family Sharing：OFF

本 App 的 Pro 權限綁個人 App 帳號與個人班表／薪資資料，不開啟多人共享。

## App Review Metadata

兩個商品後續都要補：

- App Review Screenshot
- Review Notes
- Subscription localization
- 價格
- Availability

在 TestFlight / App Review 前不得留缺。

## 建立完成後的下一步

1. 設定 App Store Server Notifications V2。
2. 取得數字 Apple App ID。
3. 將 APPLE_APP_ID 寫入 Supabase secret。
4. Users and Access → Sandbox → Test Accounts 建立 Sandbox Tester。
5. 真機跑月繳／年繳購買與 Restore。
