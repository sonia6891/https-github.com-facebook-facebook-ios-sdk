# Pro AI 金鑰設定（正式環境）

專案：meow-work  
Supabase project ref：`ygrlvmyqrhyfkglomsbq`

## 必要 Secret

在 Supabase Dashboard → Edge Functions → Secrets 加入：

- Key：`OPENAI_API_KEY`
- Value：OpenAI Platform 專案 API key

選填：

- Key：`OPENAI_MODEL`
- Value：`gpt-6-luna`

若沒有設定 `OPENAI_MODEL`，後端本身已預設使用 `gpt-6-luna`，所以通常只需要設定 `OPENAI_API_KEY`。

## 安全規則

- 不要把 API key 寫進 `index.html`
- 不要放進 GitHub repository
- 不要放進 iOS / Android bundle
- 不要把 API key 傳到聊天紀錄
- API key 只存在 Supabase Edge Function Secrets
- App 只能呼叫 Supabase `pro-ai`，不能直接呼叫 OpenAI

## 設定後

不需要重新部署 Edge Function；Supabase production secrets 設定後會直接提供給函式。

接著測試順序：

1. 登入有效 Pro／試用帳號
2. AI 本月預測（純文字，最容易驗證）
3. AI 薪資單辨識
4. AI 班表辨識
5. AI 差異解釋
6. AI 異常提醒
7. 喵助理問答

若後端回 `AI_NOT_CONFIGURED`，代表 `OPENAI_API_KEY` 尚未設定或名稱有誤。
