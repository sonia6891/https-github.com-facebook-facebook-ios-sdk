# Pro 智慧匯入班表｜本機 Vision 架構

版本：v153-local-schedule  
最後更新：2026-09-24

## 決策

「喵的，又要上班了」的班表圖片匯入不再使用 OpenAI API。

第一版 iPhone 流程改為：

1. 使用者選擇班表圖片。
2. App 先在裝置內縮圖。
3. iOS 原生 Apple Vision `VNRecognizeTextRequest` 本機辨識文字與 bounding box。
4. App 依日期列、文字位置與常見班別代碼整理成逐日班表。
5. 顯示預覽與警告。
6. 使用者確認後才寫入 `state.scheduleOverrides`。
7. 圖片不送 Supabase、不送 OpenAI。

## 成本

- 班表智慧匯入：OpenAI API 成本 = 0。
- 使用者增加不會增加班表辨識 API 帳單。
- `schedule_scan` 已從 Supabase `pro-ai` Edge Function 公開模式移除。
- `meow_claim_ai_usage` 不再接受 `schedule_scan`，班表辨識不會扣 AI 圖片額度。

## Pro 定位

功能仍可保留為 Pro：

- Pro 智慧匯入班表
- 本機辨識
- 無雲端圖片傳輸
- 套用前預覽
- 可清除本月智慧匯入結果

Pro 的價值來自便利性與隱私，不靠雲端 API 補貼。

## 目前可辨識

文字型班表，例如：

- A / B / C
- D / N / E / M
- 早班／中班／晚班／夜班
- 大夜／小夜／白班／日班
- 休／休假／公休／OFF

## 限制

- 如果班表只用顏色、不寫班別文字，本機 OCR 無法可靠知道顏色代表哪個班。
- 如果一張圖片有很多員工列，App 會嘗試選擇最接近日期列且辨識最完整的一列，並顯示警告。
- 建議使用者先裁切，只保留日期與自己的班表列。
- 所有結果都必須先預覽，不自動覆蓋請假或加班紀錄。

## 仍使用 OpenAI 的可選功能

目前雲端 Pro AI 仍可用於：

- `payslip_scan`：薪資單強化辨識
- `reconcile_explain`：薪資差異說明
- `salary_forecast_explain`：預測解讀
- `anomaly_scan`：異常掃描
- `assistant`：喵助理問答

這些功能仍使用 App 擁有者設定的 OpenAI API Key，因此後續應繼續限制額度或再逐步改成本機能力。
