# App Store Connect｜新 App 記錄固定值（v132）

最後更新：2026-09-24

## 建立路徑

App Store Connect → Apps → 左上角「＋」→ New App

## 固定填寫值

- Platforms：iOS
- Name：喵的，又要上班了
- Primary Language：Traditional Chinese
- Bundle ID：com.lumilab.meowwork
- SKU：MEOWWORK-IOS-001
- User Access：Full Access

建立完成後，App 狀態會進入 Prepare for Submission。

## 建立後立刻記下

General → App Information：

- Apple ID（數字）
- Bundle ID：com.lumilab.meowwork
- Primary Language
- App Name

其中 Apple ID 之後要寫入 Supabase：

APPLE_APP_ID=<App Store Connect 顯示的數字 Apple ID>

## 下一個畫面

建立 App record 完成後，不先上傳 build，直接進：

Monetization → Subscriptions

建立：

- Subscription Group：Meow Work Pro
- meowwork.pro.monthly
- meowwork.pro.yearly

月繳／年繳必須放同一 Subscription Group。

## 建立前條件

Account Holder 必須已接受目前有效的 Paid Apps Agreement。
若 App Store Connect 不讓建立付費訂閱，先檢查：

Business → Agreements

並確認必要的 Tax / Banking 狀態沒有阻擋 Paid Apps。
