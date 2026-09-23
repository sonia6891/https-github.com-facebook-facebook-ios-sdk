# 「喵的，又要上班了」Pro 訂閱與商店上架基準規格

版本：v124 基準  
狀態：鎖定方向，後續 iOS／Android／Supabase／Pro UI 皆以此文件為準  
最後更新：2026-09-23

## 1. 商業模式

「喵的，又要上班了」採 Free + Pro 訂閱制。

正式定價基準：
- Pro 月繳：NT$99／月
- Pro 年繳：NT$790／年
- 首次符合資格的使用者：3 天免費試用
- 免費試用結束後自動轉為所選訂閱方案
- 使用者可隨時取消；取消後依商店規則使用至當期／試用期結束

價格顯示以商店實際回傳的在地化價格為最終顯示值。台灣市場的目標售價為 NT$99／月、NT$790／年。

## 2. 付款渠道：正式鎖定

### iOS
使用 Apple App Store In-App Purchase／StoreKit 2。

### Android
使用 Google Play Billing。

### 不再使用
正式 App 內的 Pro 數位訂閱不使用：
- 綠界 ECPay
- 自建信用卡付款頁
- App 內直接外連第三方付款頁來解鎖 Pro

綠界相關程式不再作為正式 Pro 訂閱流程的一部分。

## 3. 3 天免費試用規則

免費試用必須由 App Store／Google Play 的訂閱商品機制管理，不由 Supabase 單獨「送 Pro 天數」。

正確流程：

1. 使用者登入帳號。
2. 打開「設定 → Pro 方案」。
3. 選擇月繳或年繳。
4. App 呼叫 Apple／Google 商店訂閱購買介面。
5. 商店判斷該 Apple ID／Google 帳號是否符合免費試用資格。
6. 符合資格者開始 3 天免費試用。
7. 不符合資格者直接依商店畫面顯示正常訂閱價格。
8. 試用期間取消，不進入下一個付費週期。
9. 未取消者在試用結束後由商店自動續訂與扣款。

注意：免費試用資格以商店帳號與商店規則為準，Supabase 不自行判定或重複贈送。

## 4. Pro 商品 ID

暫定商品 ID：

iOS：
- meowwork.pro.monthly
- meowwork.pro.yearly

Android：
- meowwork.pro.monthly
- meowwork.pro.yearly

實際建立 App Store Connect／Google Play Console 商品時，若商店命名限制或既有 ID 衝突，再做一次最終確認；商品 ID 一旦正式上線後不隨意修改。

## 5. Pro 功能基準

目前 Pro 功能包含：

- 雲端同步
- 自動備份與還原
- 跨裝置工作資料同步
- 薪資單拍照／上傳 OCR 辨識
- 薪資項目同義詞辨識
- 逐項薪資對帳
- 預估薪資 vs. 實際薪資差異標記
- 歷史薪資與對帳紀錄
- PDF／Excel 報告匯出

Free 版保留足夠完整的基本排班、行程、假別與薪資試算能力；Pro 主要賣點是「持續性資料價值、AI／OCR、對帳、同步、備份與進階輸出」。

## 6. 設定頁 Pro 介面規格

未訂閱時顯示：

Pro 方案  
月繳 Pro・NT$99／月  
年繳 Pro・NT$790／年  
首次符合資格可享 3 天免費試用

補充文案：
「試用結束後依所選方案自動續訂，可隨時在 App Store 或 Google Play 管理／取消。」

試用中顯示：
- Pro 免費試用中
- 試用結束日
- 下一個續訂方案與商店回傳價格
- 管理／取消訂閱

正式 Pro 顯示：
- Pro 已啟用
- 月繳／年繳
- 下次續訂日或有效期限
- 付款來源：App Store 或 Google Play
- 管理／取消訂閱

取消續訂但尚未到期：
- Pro 已取消續訂
- 可使用至有效期限
- 到期後自動回到 Free

## 7. 網頁／PWA 版行為

目前 GitHub Pages 版本仍是 PWA／網頁核心，不具備真正的 StoreKit 2 或 Google Play Billing 原生能力。

因此網頁預覽版：
- 可以顯示 Pro 方案與價格
- 可以顯示 3 天試用說明
- 不進行實際付款
- 不呼叫綠界
- 點訂閱時清楚提示「正式 iOS／Android 版將由 App Store／Google Play 完成付款」

禁止在 PWA 預覽版假裝商店付款已完成。

## 8. 原生 App 需要新增的付款橋接

之後進入正式 App 包裝時，前端統一呼叫原生橋接：

window.MeowStoreBilling.purchase({
  productId,
  plan,
  trialDays: 3
})

原生層負責：

### iOS
- StoreKit 2 商品載入
- 購買
- 免費試用／優惠資格
- Transaction 驗證
- Restore Purchases
- 管理訂閱入口
- App Store Server Notifications V2 對接

### Android
- Google Play Billing 商品載入
- 購買
- Base plan／Offer／Free trial
- Purchase token 驗證
- Restore／重新同步已購項目
- 管理訂閱入口
- Real-time Developer Notifications 對接

前端不得自行偽造 Pro 狀態。

## 9. Supabase 的角色

Supabase不負責直接收款。

Supabase負責：
- 綁定 App 使用者帳號
- 接收 Apple／Google 已驗證的購買結果
- 維護跨裝置一致的 entitlement
- 提供 App 啟動時的 Pro 權限判定
- 保存訂閱狀態歷史與伺服器通知結果

建議 entitlement 狀態：
- free
- trialing
- active
- grace_period
- past_due
- canceled
- expired

建議付款來源：
- app_store
- google_play

不再新增新的 ecpay Pro entitlement。

## 10. 購買驗證原則

正式上架後，不能只相信手機前端傳來「付款成功」。

必須：
1. App 完成商店購買。
2. 將 Apple transaction／Google purchase token 送到安全後端。
3. 後端向 Apple／Google 驗證。
4. 驗證成功才更新 Supabase user_entitlements。
5. Pro 功能以後端 entitlement 為主要依據。
6. 商店 Server Notification／RTDN 持續更新續訂、取消、退款、失敗、寬限期與到期狀態。

## 11. Restore Purchases／換手機

一定要支援：
- iOS「回復購買」
- Android 重新查詢既有訂閱
- 換手機後登入相同 App 帳號可重新同步 Pro
- 重裝 App 不應失去有效訂閱
- 同一使用者若在不同平台購買，Supabase entitlement 統一反映有效 Pro 狀態

但付款／取消仍回各自購買商店管理。

## 12. 既有舊試用與綠界處理

目前舊的直接 7 天試用邏輯已停止作為正式方向。

既有測試 trial 已調整為 3 天。

以下舊入口不得再被正式 App 呼叫：
- start-pro-trial
- create-ecpay-checkout
- cancel-pro-subscription
- create-ecpay-stage-checkout

這些舊 Edge Function 已改為拒絕正式訂閱用途，避免舊版前端誤觸。

## 13. 開發順序

### Phase A｜現在
- 鎖定價格 NT$99／NT$790
- 鎖定 3 天免費試用
- PWA Pro UI 改成商店訂閱文案
- 停用綠界 Pro 流程
- Supabase保留 entitlement 中央權限層

### Phase B｜iOS 原生化
- 建立 iOS App 專案／包裝層
- 接 StoreKit 2
- App Store Connect 建立訂閱群組與兩個商品
- 設定 3 天 introductory free trial
- 完成購買、驗證、Restore、管理訂閱
- 串 App Store Server Notifications V2
- TestFlight 測試

### Phase C｜Android 原生化
- 建立 Android App 專案／包裝層
- 接 Google Play Billing
- Google Play Console 建立月繳／年繳產品
- 設定 3 天 free trial offer
- 完成 purchase token 驗證、restore／query、管理訂閱
- 串 Real-time Developer Notifications
- Internal testing／Closed testing

### Phase D｜正式上架前
- Apple／Google 沙盒完整測試
- 免費試用資格測試
- 首次扣款測試
- 續訂測試
- 取消測試
- 退款測試
- 付款失敗／grace period 測試
- 換手機／重裝／跨裝置測試
- Store Review 文案、隱私政策、訂閱條款、恢復購買入口確認

## 14. 驗收標準

正式訂閱功能只有在以下全部成立後才算完成：

- iOS 購買由 App Store 跳出正式系統付款介面
- Android 購買由 Google Play 跳出正式系統付款介面
- 台灣價格正確顯示
- 3 天試用由商店判斷資格
- 試用取消後不進入下一個付費週期
- 試用結束可正常轉正式訂閱
- 月繳／年繳續訂正常
- Restore Purchases 正常
- Supabase Pro 狀態與商店一致
- 退款／取消／付款失敗會同步降權或進入正確狀態
- PWA 不會誤開綠界
- App 內不出現繞過 Apple／Google 的第三方 Pro 付款入口

## 15. 鎖定決策

除非未來重新做商業決策，以下視為目前正式基準：

- 月繳：NT$99
- 年繳：NT$790
- 免費試用：3 天
- iOS：Apple IAP／StoreKit 2
- Android：Google Play Billing
- Supabase：帳號＋entitlement＋同步，不直接收款
- 綠界：不作為 App 內 Pro 訂閱付款渠道
