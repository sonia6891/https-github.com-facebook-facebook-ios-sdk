# Apple Developer／App Store Connect 帳號啟用 Gate（v136）

最後更新：2026-09-24
App：喵的，又要上班了

## 目前阻塞

若 App Store Connect / iTunes Connect 顯示「帳號沒有啟用」，先不要繼續建立 App、訂閱商品或 Sandbox Tester。

必須先確認 Apple Developer Program membership 與 App Store Connect 權限已啟用。

## Gate 1｜Apple Developer Program Membership

進入 Apple Developer Account：

https://developer.apple.com/account/

確認：

- Membership：Active
- Role：Account Holder（個人開發者通常就是本人）
- Team ID 可見
- Renewal Date 可見
- App Store Connect 入口可用

若畫面仍顯示：

- Enroll Now
- Continue Your Enrollment
- Membership Expired

代表 Apple Developer Program 尚未完整啟用或已過期，必須先完成 enrollment / renewal。

## Gate 2｜Apple Developer Agreement

Apple 更新 Developer Program Agreement 時，Account Holder 必須先接受。

若有待接受協議：

- 登入 developer.apple.com/account
- 打開 Agreements / Membership
- 接受最新條款

在協議未接受前，App Store Connect、Certificates / Identifiers / Profiles、TestFlight 等權限可能受限。

## Gate 3｜Apple Account

登入 App Store Connect 的 Apple Account 必須：

- 與 Apple Developer Program membership 關聯
- 已啟用 Two-Factor Authentication
- 使用正確的 Account Holder / team
- 不要誤用另一個沒有 Developer Program 權限的 Apple Account

App Store Connect：

https://appstoreconnect.apple.com/

## Gate 4｜Paid Apps Agreement

若要建立付費 App 或 In-App Purchase / Auto-Renewable Subscription：

App Store Connect → Business → Agreements

確認：

- Paid Applications Agreement：Active
- Account Holder 已完成簽署
- Tax 資料已完成必要項目
- Banking 資料已完成必要項目

Paid Apps Agreement 未生效時，不應繼續正式訂閱商品上架流程。

## Gate 5｜仍顯示「iTunes Connect 帳號沒有啟用」

若以下全部成立：

- Apple Developer Program Membership = Active
- 使用正確 Apple Account
- Two-Factor Authentication 已開
- 最新 Developer Agreement 已接受
- App Store Connect 仍顯示 account not enabled

則屬 Apple 帳號權限／後台啟用問題，不是 App 程式錯誤。

此時使用 Apple Developer Support 的 Membership / Account 或 App Store Connect access 類別聯絡 Apple。

不要重新建立另一個 Apple Account，也不要為了繞過問題更換 Bundle ID。

## 帳號 Gate 通過後立刻做

1. App Store Connect → Apps → + → New App
2. 建立「喵的，又要上班了」
3. Bundle ID：com.lumilab.meowwork
4. SKU：MEOWWORK-IOS-001
5. 記下數字 Apple ID
6. 建立 Subscription Group：Meow Work Pro
7. 建月繳 / 年繳
8. 設定 3 Days Free Trial
9. 設 App Store Server Notifications V2
10. 將 Apple ID 寫入 Supabase APPLE_APP_ID
11. 建 Sandbox Tester
12. 真機 Sandbox 測試
