# 「喵的，又要上班了」Pro AI v1 規格

版本：v125-pro-ai-v1  
狀態：第一版已接入前端與 Supabase Edge Function  
最後更新：2026-09-23

## 1. 第一版範圍

Pro AI 共用同一個後端入口 `pro-ai`，支援六種模式：

1. `schedule_scan`：AI 看懂公司班表圖片
2. `payslip_scan`：AI 薪資單強化辨識
3. `reconcile_explain`：逐項薪資差異解釋
4. `salary_forecast_explain`：本月薪資預測解讀
5. `anomaly_scan`：薪資／對帳異常提醒
6. `assistant`：依 App 內班表與薪資摘要回答問題

## 2. 核心原則

AI 負責：
- 圖片理解
- 欄位標準化
- 同義詞判斷
- 差異說明
- 趨勢／異常描述
- 對話式查詢

App 規則引擎負責：
- 出勤日計算
- 加班時數與加班費
- 津貼
- 扣款
- 預估應發／實領
- App 預估與公司實際差額

AI 不得自行改寫 App 已算出的薪資數字，也不得自行判定公司違法。

## 3. 權限與安全

- Edge Function：`pro-ai`
- `verify_jwt=true`
- 必須有有效登入 session
- 後端會再次呼叫 `meow_account_access` 驗證 Pro entitlement
- 目前允許 `plan=pro` 且 `status=active/trialing` 且 `pro_until` 尚未到期
- OpenAI API key 只放在 Supabase Edge Function Secret，不寫入 GitHub、PWA 或原生 App
- AI 用量寫入也只由 Edge Function 的 `SUPABASE_SERVICE_ROLE_KEY` 執行
- 輸入 context 上限 120,000 字元
- 圖片 Data URL 上限 12,000,000 字元
- 只接受 JPEG／PNG／WebP
- 回應使用 strict JSON Schema

## 4. 隱私設計

既有「本地 OCR v4」維持原行為：
- 圖片只在瀏覽器本機處理
- 不因加入 AI 而偷偷改成上傳

AI 圖片辨識：
- 使用者必須主動選擇 AI 功能
- 上傳前再次顯示確認
- App 不把原始薪資單／班表圖片寫入自己的 Supabase Storage 或資料表
- 薪資單模型提示要求忽略姓名、員編、身分證號、銀行帳號、地址、簽名、QR／條碼等非必要個資

上架前仍需把 AI 資料處理方式寫入隱私政策與 App Store／Google Play 資料揭露。

## 5. AI 班表匯入

v125 新增 `state.scheduleOverrides`。

流程：
1. 使用者上傳班表圖片
2. AI 回傳日期、班別、是否上班、信心值
3. App 只顯示預覽，不直接修改月曆
4. 使用者按「確認套用到月曆」
5. 寫入逐日 override
6. override 只覆蓋該日期的基礎上班／休假判斷
7. 使用者原本的請假與加班紀錄仍優先顯示並參與計算
8. 可一鍵清除「本月 AI 班表」，回到原本輪班規則

## 6. AI 薪資單

AI 回傳欄位限制在：
- base
- shiftAllowance
- meal
- performance
- transport
- otherIncome
- otPay
- dedLabor
- dedHealth
- dedWelfare
- dedPension
- dedAttendance
- dedTax
- dedHealthExtra
- dedOther
- actualNet

辨識結果必須先讓使用者確認／修改，按「確認並導入逐項對帳」後才寫入 App。

## 7. AI 對帳／預測／異常／助理

這四種模式只接收 App 已整理好的數值 context。

禁止模式：
- AI 自己重新計算薪資
- AI 自己推測不存在的公司制度
- AI 自己補不存在的班表
- 直接斷言公司違反勞動法

## 8. Pro AI 月額度

第一版後端直接控管用量，避免只在前端做可繞過的假限制：

- AI 圖片辨識：每月 12 次（班表 + 薪資單共用）
- AI 文字分析／問答：每月 100 次
- 月份依 Asia/Taipei 計算
- 額度由 `public.ai_usage_monthly` 紀錄
- `meow_claim_ai_usage(user_id, mode)` 原子遞增並回傳剩餘次數
- 此 RPC 僅授權 `service_role`；App 使用者無法直接呼叫或竄改用量
- 前端成功後顯示本月剩餘額度

這是 v1 成本保護值；上架後應依真實 API 成本與使用率調整。

## 9. AI 模型與 Secret

Edge Function 需要：
- `OPENAI_API_KEY`：必填
- `OPENAI_MODEL`：選填；未設定時目前預設 `gpt-5.6-luna`

Secret 不得提交 GitHub。

## 10. 第一版驗收

- [x] Pro AI Edge Function 已部署
- [x] JWT 驗證
- [x] Pro entitlement 二次驗證
- [x] 六種 AI mode
- [x] Strict JSON Schema
- [x] 本地 OCR 與 AI OCR 分流
- [x] AI 薪資單確認後才導入
- [x] AI 班表確認後才套用
- [x] AI 班表逐日 override 可清除
- [x] 薪資數字仍由原規則引擎計算
- [x] PWA v125 UI 已接入
- [x] 後端 AI 月額度／RLS 用量表
- [ ] Supabase 設定 `OPENAI_API_KEY`
- [ ] 用真實班表做端到端 AI 測試
- [ ] 用去識別薪資單做端到端 AI 測試
- [ ] iOS／Android 原生包裝後測試相機選圖與商店 entitlement
