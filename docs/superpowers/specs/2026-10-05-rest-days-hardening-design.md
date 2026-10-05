# 休息日清單寫入加固 設計規格

日期：2026-10-05
前一項：統一假日清單（`2026-10-05-unified-holiday-list-design.md`）已於同日上線。本項處理該案最終審查指出的三個舊弱點；它們在統一之後影響範圍從 VSMS 擴大到 VSMS、VTMS、MCP 三個系統。

## 問題

1. **匯入不用登入就能呼叫。** `server/src/routes/calendar.ts` 的 router 沒有任何權限中介層，`index.ts` 也沒有全域守門；`guestReadOnly` 只擋已登入的訪客。2026-10-05 實測：不帶 session 的 `POST /api/calendar/import-government` 會進到 handler（因沒附檔案回 400）。區網內任何人都能改全平台的假日。另外 `PUT /api/options` 只有 `requireAuth`，測試人員（`user`）帳號也能透過它改假日清單。
2. **匯入不留紀錄。** 舊流程靠前端 PUT 留下 `UPDATE_SETTINGS` 稽核，`calendar_config` 也存了檔名與時間；新流程直接寫 `rest_days_config`，兩者都沒有。
3. **舊分頁會把清單蓋回去。** 設定頁每個動作都整份 PUT `options`（含 `restDays`），store 只在進入頁面時載入一次。另一位管理員開著舊頁面改任何設定，就會把剛匯入或剛刪掉的日期蓋回去，而且沒有任何錯誤。

## 已定案的決策（2026-10-05 使用者確認）

1. 匯入只限系統管理員（`super_admin`），對應畫面上標「SA」的區塊。
2. `PUT /api/options` 限系統管理員與部級主管（`requireAdmin`）。會送出設定的畫面只有設定頁與統計分析頁，兩者在前端本來就只開給這兩種角色（`App.tsx:92,97`），所以不改變任何人現在能做的事。`GET /api/options` 維持所有登入者可讀。
3. 稽核沿用現有的 `UPDATE_SETTINGS`，對象 `restDays`，欄位寫成可讀的描述。稽核頁不用改。
4. 休息日改成單筆 API；`PUT /api/options` 不再寫休息日。不採「附上舊清單、不一致回 409」的做法。

## 設計

### 1. 共用寫入函式 `server/src/lib/restDaysStore.ts`（新檔）

- `class InvalidStoredHolidaysError`（從 `calendar.ts` 搬過來）。
- `parseStoredRestDates(raw: unknown): string[]`：寫入端讀既有清單。JSON 字串先解析；壞 JSON、非陣列拋錯；正規化成 `YYYY/MM/DD`、排序、去重；有不合法項目丟 `InvalidStoredHolidaysError`。讀取端（`readHolidays`）遇到壞項目是略過並 warn；寫入端要嚴格，因為結果會寫回去。
- `updateRestDates(mutate): Promise<{ before, after }>`：在一個 Prisma 交易裡讀出 → 套用 `mutate` → 去重排序 → 有變更才寫回（`weekends: true`）。缺列拋錯。
  - **序列化**：所有呼叫在模組層級的 promise 佇列上排隊。前一個失敗不影響下一個。VSMS 是單一 process（pm2 fork 模式），休息日的寫入端只有本模組，所以 process 內排隊就足以讓同時進來的新增、刪除、匯入不互相蓋掉。不用 `SELECT … FOR UPDATE`：Prisma 沒有原生支援，改用 raw SQL 會讓所有測試都得 mock raw query。
- `lib/holidays.ts` 抽出 `parseHolidayJson(raw): unknown[]`（JSON 字串解析＋非陣列拋錯），`normalizeHolidayDates` 與 `parseStoredRestDates` 共用，消除目前 `calendar.ts` 裡的重複程式碼。

### 2. 單筆 API（`server/src/routes/options.ts`）

| 方法 | 路徑 | 權限 | 內容 |
|---|---|---|---|
| `POST` | `/api/options/rest-days` | `requireAdmin` | body `{ date }`，接受 `YYYY/MM/DD` 或 `YYYY-MM-DD` |
| `DELETE` | `/api/options/rest-days/:date` | `requireAdmin` | `:date` 用 `YYYY-MM-DD`（路徑不能有斜線），也接受斜線編碼 |

- 成功回 `{ weekends: true, specificDates }`（寫入後的完整清單，`YYYY/MM/DD`）。
- 日期不合法 → 400 `{ ok: false, message: '日期格式不正確（請用 YYYY/MM/DD）' }`，不寫入。
- 已存在的日期再新增、不存在的日期刪除 → 200、清單不變、不記稽核。
- 既有清單有不合法項目 → 422，訊息列出這些日期並說明需由系統管理員直接修正資料庫。目前所有寫入路徑都會驗證，這種資料只可能來自直接改資料庫。
- 有變更時記稽核：`UPDATE_SETTINGS`，對象 `restDays`，欄位 `['新增 2026/10/09']` 或 `['刪除 2026/10/09']`。

### 3. `PUT /api/options`

- 加 `requireAdmin`。
- **不再寫 `restDays`**：移除 vauth 分支與 local 分支的兩處 `restDaysConfig.upsert`，以及前一輪加的日期驗證（body 裡的 `restDays` 直接忽略）。
- 回應的 `restDays` 一律是資料庫目前的值：vauth 分支本來就回 `readOptions()`；local 分支改成用資料庫的 `restDays` 覆蓋 body 再回。前端 `persistOptions` 用回應覆蓋 store，所以舊分頁只要存一次其他設定，就會拿到最新的休息日清單。

### 4. 匯入（`server/src/routes/calendar.ts`）

- router 加 `requireAuth, requireSuperAdmin`。
- 寫入改用 `updateRestDates(dates => [...dates, ...incoming])`；`added = after.length - before.length`。回應格式不變。
- 成功後記稽核：`UPDATE_SETTINGS`，對象 `restDays`，欄位 `['匯入 <檔名>', '<年> 年', '新增 <n> 筆']`。新增 0 筆也記（匯入動作本身值得留紀錄）。被 422 擋下的不記。
- 檔名：multer 把檔名當 latin1 解，中文會變亂碼（2026-04 那次存進 `calendar_config.sourceName` 的就是亂碼）。用 `Buffer.from(originalname, 'latin1').toString('utf8')` 轉回。

### 5. 前端

- `src/lib/api.ts`：`addRestDay(date)`、`removeRestDay(date)`，回傳 `RestDaysConfig`。
- `src/store/optionsStore.ts`：移除 `setRestDays`；新增 `addRestDay`、`removeRestDay`，用回應呼叫既有的 `applyRestDays`。
- `src/components/settings/RestDaysManager.tsx`：新增／刪除改呼叫上述動作；失敗時在區塊內顯示錯誤（`role="alert"`），清單不變。
- `src/components/settings/CalendarImport.tsx`：直接用 `fetch` 上傳，目前沒帶 `X-Vsms-Session`。補上與 `api.ts` 的 `req()` 相同的作法：sessionStorage 有 `vsms-session-token` 就帶這個 header，並加 `credentials: 'include'`。否則用 header token 登入的工作階段在加了權限後會被 401。

### 6. 使用說明

`role-admin.md`「假日行事曆」補一句：匯入與每次新增、刪除休息日都會記在審計紀錄（對象 `restDays`）。

## 測試

- `restDaysStore`：正規化、壞 JSON／非陣列、不合法項目丟錯、有變更才寫、缺列拋錯、**同時呼叫依序執行且後者看得到前者的結果**、前一個失敗不卡住後面。
- 單筆 API：新增（兩種格式）、重複新增不寫不記、刪除、刪除不存在、日期不合法 400、既有清單壞 422、`user` 角色 403、稽核欄位內容。`PUT /api/options` 以 `user` 角色 403。
- `PUT /api/options`：body 帶任何 `restDays` 都不寫入，資料庫清單不變。
- 匯入：不帶 session 401、`admin` 403、成功記稽核（中文檔名正確）、被擋下不記稽核；既有測試全數保留。
- 前端：store 的新增／刪除各只發一個請求並套用回應；`RestDaysManager` 刪除成功更新清單、失敗顯示訊息且清單不變；`CalendarImport` 有 token 時帶 header。

## 不在範圍內

- VSMS 開機時 `initDb` 缺列自動補成空清單（最終審查 Minor 2）。
- 明年日曆未匯入的提醒機制。
- 稽核紀錄保留期（目前 2 個月）。
