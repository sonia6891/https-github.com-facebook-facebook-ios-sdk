# Pro AI v1｜歷史規格（已停用）

版本：v125-pro-ai-v1  
最後更新：2026-09-24  
狀態：**已退役，不是目前正式版架構**

## 歷史背景

2026-09-23 曾建立雲端 Pro AI v1，包含：

- `schedule_scan`
- `payslip_scan`
- `reconcile_explain`
- `salary_forecast_explain`
- `anomaly_scan`
- `assistant`

這些雲端 AI 模式目前全部停用。

## 正式版現況

- 智慧匯入班表：Apple Vision 本機辨識。
- 薪資單辨識：Apple Vision 本機辨識；非 iOS 環境使用本機 Tesseract fallback。
- 薪資欄位整理：App 內同義詞、位置、格式記憶與交叉比對。
- 逐項薪資對帳：App 本機計算與比較。
- 「喵助理／Pro AI 工作助理」：已移除。
- 前端沒有 `pro-ai` 呼叫。
- Supabase `pro-ai` version 10 僅作舊版相容端點，固定回傳 `FEATURE_REMOVED`。
- 正式版不需要 `OPENAI_API_KEY`。

目前 Pro 的重點不是聊天 AI，而是把「薪資單辨識」與「逐項薪資對帳」做到可實際核薪。
