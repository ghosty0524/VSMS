# 排程啟動前預告通知 — 設計文件

日期：2026-08-20
狀態：設計完成，待實作

## 目標

VSMS 排程在啟動前三天，自動寄信通知該筆排程的需求人員。若計算出的寄信日落在休假日，往前挪到最近的非休假日。信件內容與副本收件人可依測試單位分別設定。

## 前提

- **需求人員欄位已對齊 Teams 帳號名稱**。`schedules.requiredPersonnel` 仍是自由文字，但內容會是以逗號／頓號分隔的公司帳號名。對齊作業由人工另行處理，不在本設計範圍。
- **發送管道為 SMTP**。公司郵件伺服器。Teams 直接推播（Graph API / Incoming Webhook）不在本期範圍，但資料模型保留 `NotifyConfig.teamsWebhookUrl` 供日後接入。

## 為什麼觸發邏輯不交給 agent

原始構想是搭配 agent 執行。本設計不採用，理由：

1. 日期算術與冪等性要求「相同輸入永遠相同輸出」，LLM 不保證這點。
2. 寄信是不可逆的對外動作，判斷錯誤無法收回。
3. 提醒信是制式內容，不需要 LLM 生成。

Agent 適合的位置是**查詢與稽核**，而非執行 — 見文末「Agent 的適用位置」。

## 現況盤點

| 項目 | 現況 |
|---|---|
| `NotifyConfig` / `Recipient` | schema 已存在，**全 codebase 無任何引用**，是先前設計留下的空殼 |
| `requiredPersonnel` | `VarChar(200)` 自由文字，一格可含多人（見 `server/src/routes/integration.ts`） |
| 休假日資料 | 兩套獨立：`RestDaysConfig`（weekends + specificDates，前端 options 用）與 `CalendarConfig.nonWeekendHolidays`（行事曆 xlsx 匯入，`workload.ts` 的 `isWorkday()` 用） |
| 排程器 / 寄信套件 | 皆無。無 node-cron、無 nodemailer |

**本設計採用 `RestDaysConfig`** 作為休假日判斷來源（管理者可在既有 UI 維護）。

## 決策紀錄

| 決策 | 選擇 | 理由 |
|---|---|---|
| 「前三天」算法 | 先減 3 個**日曆天**，落在休假日再逐日往前挪 | 貼近需求原始描述 |
| 休假日來源 | `RestDaysConfig` | 管理者可在 UI 自行維護 |
| 觸發方式 | server 內建 `node-cron`，同時開放手動重跑 API | 零新增基礎設施；避開 Windows 工作排程器的 SYSTEM 帳號與提權問題（參考 SQL 備份排程的 `0x8007052E` 靜默失敗經驗） |
| 每日執行時間 | 08:00 | 上班即可見 |
| SMTP 帳密位置 | `.env` | 避免密碼進 DB 後經設定類 API 外洩；與 `db.ts` 既有 pattern 一致 |
| 營運設定位置 | `NotifyConfig` 資料表 | `enabled` 需能在 UI 即時切換，不必重啟常駐程序 |
| 收件人拆解 | 分隔符切分後拼接公司 domain | 對齊後的欄位格式 |
| 改期行為 | 重新寄送，信件不特別標註為改期 | 日期變動本就該重新預告 |
| 信件範本形式 | **固定版型 + 可編輯文字段落**（主旨、開頭、結尾） | 資料表格由程式產生，管理者改不壞版面；各單位的差異本來就集中在提醒詞，不在版面結構 |
| 測試單位差異 | 各單位可有自己的**文字段落、固定副本收件人、啟用開關** | 主收件人一律為需求人員；`leadDays` 維持全域一致 |
| 單位規則的繼承方式 | **覆寫式**（留空即沿用預設），非複製式 | 複製式下共同措辭改一次要改 N 次，各單位內容必然逐漸漂移 |

### `.env` 鍵名

```
SMTP_HOST=
SMTP_PORT=25
SMTP_SECURE=false
SMTP_FROM=
SMTP_USER=        # 選填
SMTP_PASS=        # 選填
```

`SMTP_USER` / `SMTP_PASS` 留空即以匿名轉發連線。**待向 IT 確認**內部 relay 對內網 IP 是否允許匿名轉發；兩種情形本設計皆可運作，差別僅在是否填這兩個鍵。

## 資料模型

### 新增 `NotificationLog`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | |
| `scheduleId` | VarChar(36) | |
| `sendDate` | VarChar(10) | 應寄信日 ISO |
| `status` | VarChar(20) | `sent` / `failed` / `failed_permanent` |
| `recipients` | Text | 當下實際寄出的地址（含副本），非事後推算 |
| `errorMessage` | Text? | |
| `attempts` | Int | 預設 0 |
| `sentAt` | DateTime? | |
| `createdAt` | DateTime | |

- `@@unique([scheduleId, sendDate])` — **防重複的根本**。cron 與手動重跑 API 可能並行，應用層 if-check 擋不住競態。
- `@@index([sendDate])`

### 新增 `NotifyRule`

一筆對應一個測試單位，另有一筆 `testUnit = null` 的**預設規則**。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid | |
| `testUnit` | VarChar(100)? **unique** | `null` = 預設規則 |
| `enabled` | Boolean | 該單位可單獨停用 |
| `subjectTemplate` | Text? | `null` = 沿用預設規則 |
| `introTemplate` | Text? | 資料表格前的文字，`null` = 沿用預設規則 |
| `outroTemplate` | Text? | 資料表格後的文字，`null` = 沿用預設規則 |
| `ccRecipients` | Text | 該單位固定副本，逗號分隔；與預設規則的副本**相加後去重** |
| `updatedAt` | DateTime | |

**`null` 與空字串意義不同**：`null` = 沿用預設規則的內容；空字串 = 刻意留白，該段落不輸出。UI 需以兩個不同控制項表達（「沿用預設」核取方塊 + 文字框），不可只給一個空文字框。

### `NotifyConfig` 新增欄位

`leadDays`（Int，預設 3）、`catchUpDays`（Int，預設 3）、`mailDomain`（VarChar(100)）。

既有 `enabled`、`systemUrl` 直接沿用。`teamsWebhookUrl` 保留不動。

`NotifyConfig.enabled` 為總開關：關閉則完全不寄；開啟後再看各單位 `NotifyRule.enabled`。

### `Recipient` 轉為 fallback 群組

當某筆排程的 `requiredPersonnel` 解析不出任何有效收件人時，信改寄給這組人並註明原因。避免通知無聲消失。

## 核心邏輯

### `server/src/lib/notifyDate.ts`（純函式）

```
computeSendDate(startDate, { leadDays, weekends, specificDates }) → sendDate
```

1. `d = startDate - leadDays` 個日曆天
2. `while isRestDay(d): d -= 1 天`
3. 回傳 `d`

`isRestDay(iso)` = （`weekends` 為真且該日為週六日）或 `specificDates` 含該日。

**往前挪設 30 天上限**。`specificDates` 是管理者手填 JSON，貼錯一段連續日期會讓無上限的 while 迴圈卡死整個 process — 而它與前端服務同一個 process。超過上限視為設定異常，記錄錯誤並跳過該筆。

### `server/src/lib/notifyRule.ts`（純函式）

```
resolveRule(testUnit, rules) → { enabled, subject, intro, outro, cc[] }
```

- 取 `testUnit` 對應的規則，找不到則用預設規則。
- `enabled`：單位規則的值；無對應規則時用預設規則的值。
- 文字段落：單位規則該欄為 `null` 時取預設規則的值。
- `cc`：單位規則的副本與**預設規則的副本相加後去重**（預設規則的副本即全域副本，例如測試部主管）。

### `server/src/lib/notifyRecipients.ts`（純函式）

以逗號、全形逗號、頓號、分號、全形分號與空白切分 → trim → 去空 → 拼接 `mailDomain` → 去重。

**防禦**：字串中已含 `@` 者原樣視為完整 email。對齊作業為人工進行，過渡期必然出現混雜格式，硬拼 domain 會產生 `wang@x.com@公司.com` 這類寄不出去又不易察覺的地址。

副本收件人（`ccRecipients`）走同一支函式，行為一致。

### `server/src/lib/notifyTemplate.ts`（純函式）

變數插值採白名單，語法為兩層大括號包住變數名。

可用變數：`projectName`、`taskDescription`、`category`、`testUnit`、`testEngineer`、`device`、`startDate`、`endDate`、`timeResource`、`requiredPersonnel`、`daysUntilStart`、`systemUrl`。

```
renderTemplate(template, vars) → string
validateTemplate(template) → { ok: true } | { ok: false, unknown: string[] }
```

**`validateTemplate` 在存檔時執行，不是寄出時。** 管理者把變數名打錯必須當場被擋下並列出可用變數；等到寄出才發現，那批信已經寄出去了。

資料表格由程式固定產生，不經範本。插入值一律做 HTML escape，純文字版另行組出。

### `server/src/lib/notifyRunner.ts`

```
runDailyNotify(now) →
  1. NotifyConfig.enabled = false → 結束
  2. 撈候選：isCompleted=false AND isCancelled=false AND startDate > 今天
  3. 每筆算 sendDate
  4. 篩出 sendDate 落在 [今天 - catchUpDays, 今天]
  5. 排除 NotificationLog 已存在且 status 為 sent 或 failed_permanent 的
  6. resolveRule(testUnit) → enabled 為 false 則跳過（不寫 log）
  7. 解析收件人與副本 → 套範本 → 寄信 → upsert log（成功與失敗都寫）
  8. 寫 AuditLog
```

第 5 步排除 `sent` 與 `failed_permanent`，因此僅 `failed` 者於隔日自動重試，不需另建重試機制。`attempts >= 3` 時轉為 `failed_permanent`，即由此被排除而停止重試。

`startDate > 今天`：當日啟動的排程不再發預告，此時發送已無預告作用。

第 6 步**不寫 log**：單位停用是設定狀態而非通知事件，寫進 log 會讓記錄頁被大量無意義列佔滿。若日後把該單位重新啟用，尚在補寄視窗內的排程仍會被寄出。

補寄視窗的必要性：排程可能今天建立、後天啟動（應寄信日已過），或 server 當日未運作。沒有補寄，漏寄是無聲的。

### `server/src/lib/mailer.ts`

nodemailer 單例 transporter。一封信寄給該筆排程的所有需求人員（同一件事的關係人，不拆多封），單位固定副本放 cc，純文字與 HTML 兩版並送。

信件結構（由上而下）：

1. 主旨 — `subjectTemplate`
2. 開頭文字 — `introTemplate`
3. **資料表格 — 程式固定產生**：專案、測試單位、測試工程師、機台、任務說明、起迄日、工時
4. 結尾文字 — `outroTemplate`
5. `systemUrl` 連結

### cron 掛載位置

**必須在 `listen` 之後啟動，不可掛在模組頂層。** `server/src/index.ts` 將 `app` export 給測試使用，掛頂層會使每次測試都起一個排程器。

## API

| 端點 | 說明 |
|---|---|
| `GET /api/notify/config` | 讀全域設定（不含 SMTP 帳密） |
| `PUT /api/notify/config` | 改全域設定 |
| `GET /api/notify/rules` | 列出預設規則與各單位規則 |
| `PUT /api/notify/rules/:id` | 改規則；存檔前跑 `validateTemplate`，未知變數回 400 並列出可用變數 |
| `POST /api/notify/preview` | 以指定排程套用規則，回傳實際主旨、內文與收件人清單，不寄出 |
| `GET /api/notify/logs` | 通知記錄列表 |
| `POST /api/notify/run` | 手動檢查並補寄，內部呼叫 `runDailyNotify` |
| `POST /api/notify/test` | 寄測試信到指定地址 |

權限限 admin 以上。guest 的 POST 由既有 `guestReadOnly` deny-by-default middleware 自動擋下，不需額外處理。

## 管理介面

1. **通知設定頁（全域）**：`enabled` 總開關、`leadDays`、`catchUpDays`、`mailDomain`、`systemUrl`、fallback 收件人維護、**寄測試信按鈕**。測試信按鈕為必要功能 — 沒有它，SMTP 設定錯誤要等到真有排程需寄送時才會暴露。

2. **通知規則頁**：預設規則置頂，其下列出各測試單位。每列可編輯 `enabled`、主旨、開頭段落、結尾段落、固定副本。文字段落以「沿用預設」核取方塊 + 文字框呈現，區分 `null` 與空字串。旁附可用變數清單與**預覽按鈕**（挑一筆真實排程套用後顯示結果）。

   沒有預覽，管理者只能靠「改完等明天早上八點看看寄出什麼」來驗證。

3. **通知記錄頁**：近期 log（狀態、收件人、錯誤訊息），永久失敗標紅；「立即檢查並補寄」按鈕。

## 錯誤處理

| 狀況 | 行為 |
|---|---|
| SMTP 連不上 | log `failed`，隔日自動重試 |
| `attempts >= 3` | 轉 `failed_permanent`，停止重試，UI 標紅 |
| 收件人全數解析失敗 | 寄 fallback 群組並標記，**不得視為成功靜默帶過** |
| 範本含未知變數 | **存檔時**回 400 擋下，不進資料庫 |
| 預設規則遭刪除 | 不允許刪除預設規則，API 層擋下 |
| `computeSendDate` 超過往前挪上限 | 記錄錯誤並跳過該筆，不中斷整批 |
| cron 拋出未捕捉錯誤 | 必須 catch — 會拖垮同 process 的前端服務 |

## 測試

依既有慣例，`lib/` 純函式對應 `__tests__/` 一支測試。

- `notifyDate.test.ts`：週末、連假往前挪、跨月、跨年、`specificDates` 設錯的上限防護
- `notifyRecipients.test.ts`：各種分隔符、多餘空白、重複地址、含 `@` 的原樣通過、全數無效
- `notifyRule.test.ts`：單位規則覆寫預設、`null` 沿用而空字串留白、副本相加去重、無對應單位時落到預設、單位停用
- `notifyTemplate.test.ts`：正常插值、未知變數被 `validateTemplate` 抓出、HTML escape（專案名稱含角括號不破版）
- `notifyRunner.test.ts`：以假 prisma / mailer 驗證 — 同日跑兩次只寄一次（冪等）、補寄視窗抓得到過期項、已完成與已取消排除、單位停用不寄也不寫 log、失敗次數達上限後停止重試

## 部署與三系統影響

- **不可使用 `prisma migrate dev`** — 會要求 reset。新表與新欄位一律以 `prisma db execute` 手動 additive DDL 施作。
- 新增為獨立新表、既有表僅 additive 加欄位，MCP_API 的 Dapper 查詢不受影響。Dapper 缺欄位屬靜默失敗，「只加不改」這條必須守住。日後若讓 MCP 讀通知記錄，schema 變動後需重連 MCP。
- server 改動需重啟常駐程序（port 3001）。VSMS 為單一 session，重啟會使線上使用者登出，部署應挑離峰時段。
- 新增相依：`nodemailer`、`node-cron`。

## 上線策略

`NotifyRule.enabled` 可依單位切換，因此不必全公司一次上線：先只開一個測試單位試跑一至兩週，確認寄信日計算、收件人解析與信件內容都正確後，再逐一開啟其餘單位。

## Agent 的適用位置

不用於觸發與寄送，但以下兩處確實適合：

1. **查詢與稽核**（經 MCP API）：「這週有哪些排程會發預告信」「某專案的預告信寄了沒、寄給誰」「哪些排程的需求人員對應不到帳號」。讀 `NotificationLog` 與候選清單，唯讀。
2. **一次性對齊協助**：將既有自由文字比對公司帳號清單，產出對照建議供人工審核後才寫入。不自動寫入。

## 明確排除（YAGNI）

- Teams 直接推播（Graph API / Webhook）
- `leadDays` 依測試單位不同（維持全域一致）
- 改期時在信中標註「日期異動後重新預告」
- 每人一封的個別化信件
- 完全改由指定對象接收（主收件人一律為需求人員，各單位只加副本）
- 通知記錄的長期保留政策與清理排程
