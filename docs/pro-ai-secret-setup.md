# 雲端 Pro AI 已停用

專案：meow-work  
最後更新：2026-09-24

目前正式版《喵的，又要上班了》**不使用 OpenAI API**。

## 現行架構

- 智慧匯入班表：iPhone Apple Vision 本機辨識。
- 薪資單辨識：iPhone Apple Vision 本機辨識；非 iOS 環境使用本機 Tesseract fallback。
- 逐項薪資對帳：App 本機薪資公式與數值比較。
- 原「喵助理／Pro AI 工作助理」：已移除。
- Supabase Edge Function `pro-ai`：保留相容端點，但 version 10 固定回傳 `FEATURE_REMOVED`，不會呼叫 OpenAI。

## Secret

正式版不需要：

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- AI 月度成本上限相關 Secret

若 Supabase 專案中仍留有舊 `OPENAI_API_KEY`，它不會被目前 App 或 `pro-ai` version 10 使用；可在確認沒有其他專案用途後自行移除。

## 成本

目前班表辨識、薪資單辨識與逐項薪資對帳的 OpenAI API 邊際成本均為 0。
