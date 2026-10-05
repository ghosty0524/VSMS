# 統一假日清單 設計規格

日期：2026-10-05
範圍：VSMS（資料擁有者）、VTMS、MCP（C#）、vportal 使用說明

## 問題

系統裡有兩份互相獨立的假日清單，不同功能讀不同的那份：

| 清單 | 位置與格式 | 讀取端 |
|---|---|---|
| 特定休息日 | `vsms.rest_days_config`：`weekends` 開關＋`specificDates`（`YYYY/MM/DD`，可跨年度） | VSMS 甘特圖、預告信寄送日、匯出儀表板、設定頁編輯 |
| 政府行事曆 | `vsms.calendar_config`：`year`＋`nonWeekendHolidays`（ISO，**只存一個年度**） | VTMS 三個通知 job、VSMS 負載分布、VSMS integration API、MCP 工作量分析與覆蓋率統計 |

後果（皆已實際發生或可由現況推得）：

1. **錯誤看不見。** 2026-04-27 匯入的 115 年日曆把 10 月 16 個上班日判成假日，`calendar_config` 被寫壞；特定休息日清單卻是乾淨的。設定頁只看得到後者，所以錯了半年沒人發現，直到 VTMS 通知停跑、日誌提醒追問錯的日期（2026-10-05 Darius_Chang 回報）。
2. **兩份各錯一天。** 2026-10-05 比對：政府行事曆有 2/27（228 補假）、特定休息日沒有；特定休息日有 12/25（行憲紀念日）、政府行事曆沒有。
3. **設定頁的修改不會生效到 VTMS。** 在特定休息日加公司自訂休假，VTMS 照發通知、負載圖照算工作日；刪掉一天也修不到政府行事曆。
4. **跨年會掉資料。** 政府行事曆只存一個年度，匯入 2027 會整份覆蓋，2026 的負載分布從此失去假日。
5. **週末開關只有一半的系統在看。** VTMS、負載圖、MCP 把週六日寫死；甘特圖與預告信看開關。

## 已定案的決策（2026-10-05 使用者選定）

1. **唯一來源是特定休息日**（`rest_days_config.specificDates`）。不另建假日表、不把政府行事曆改成主表。
2. **拿掉「週末算休息」開關**：週六日在所有系統一律是休息日。
3. 匯入政府日曆改成**後端一次完成、只新增不刪除**地併進特定休息日。
4. `calendar_config` 停寫、凍結保留到 2026-11-30 作為退版依據，之後刪除。

## 設計

### 1. 資料

- `rest_days_config.specificDates` 是全平台唯一的非週末休息日清單，格式維持 `YYYY/MM/DD`（甘特圖、預告信、儀表板都直接吃這個格式，不搬遷）。
- `weekends` 欄位留在資料表，但**沒有任何程式再讀它**；寫入一律存 `true`。不改 schema，避免 Prisma drift（見 vsms-prisma-drift）。
- **一次性補資料**：上線步驟 ① 把 `2026/02/27` 併入 `specificDates`。補完後兩份清單只差 12/25，而 12/25 是正確的國定假日。
- `calendar_config`：步驟 ③ 之後不再有任何寫入或讀取；2026-11-30 後以手動 `DROP TABLE` 移除，並同步移除 Prisma model 與 MCP 的 `VsmsDbContext` 對應。

### 2. 讀取規則（三個系統一致）

每個系統各有**一支**讀取函式，其他程式一律透過它取得假日，不得自行查表：

- 讀 `rest_days_config` 的 `id = 1` 那列的 `specificDates`。
- 每筆接受 `YYYY/MM/DD` 或 `YYYY-MM-DD`，正規化成 ISO `YYYY-MM-DD`。斜線轉換只在這裡做（日期格式陷阱見 vsms-date-format-trap）。
- **格式不合的單筆**：略過並 `console.warn` 帶出原值，其餘照用。理由：一筆手誤不該讓 VTMS 全部通知停擺；寫入端（見 3.4）會擋住新的錯誤資料。
- **整列不存在或 JSON 無法解析**：拋錯，不退化成空清單。沿用 VTMS `vsmsConfig.ts` 既有原則——假日被靜默清空，國定假日就會被當工作日、主管信照寄。
- 回傳 `{ dates: Set<ISO>, years: Set<number> }`，`years` 是清單中出現過的年度。
- **年度涵蓋**：某年度在清單中沒有任何日期，就視為「未匯入」。負載分布、integration API、MCP 沿用現有註記文字：「行事曆未涵蓋 {year} 年，工作日僅排除週六日、未排除國定假日」。VTMS 通知 job 在當年度無資料時照跑，只以 `console.warn('[workdays] no holidays for {year}')` 記錄（每次 tick 一次）。

### 3. VSMS

#### 3.1 `server/src/lib/holidays.ts`（新檔）

```ts
export interface HolidayList { dates: Set<string>; years: Set<number> }
export function normalizeHolidayDates(raw: unknown): HolidayList   // 純函式，可單測
export async function readHolidays(): Promise<HolidayList>          // 查表 + normalize
```

#### 3.2 匯入政府日曆 `POST /api/calendar/import-government`

1. 解析（`parseGovernmentCalendar` 不變）。
2. 防呆：`findAbnormalMonths` 任一月超過 8 天 → 422，不寫入（2026-10-05 已上線，保留）。
3. 在一個 Prisma 交易內讀出 `specificDates`，與解析結果取聯集（解析結果先轉 `YYYY/MM/DD`），排序後寫回；`weekends` 寫 `true`。
4. 回傳 `{ ok, year, detected, added, skipped, specificDates }`。`specificDates` 是寫入後的完整清單。
5. **不再寫 `calendar_config`**。`GET /api/calendar/non-weekend-holidays` 移除。

只新增不刪除：清單裡手動加的公司休假、或跨年度的舊資料都不會被匯入覆蓋。匯入錯的日期由管理員在同一個畫面逐筆刪除——現在刪了就真的全平台生效。

#### 3.3 前端

- `CalendarImport.tsx`：從「POST → GET → 前端合併 → PUT options」三段改成單一 POST；成功後用回應裡的 `specificDates` 更新 `optionsStore`。**必須更新 store**：設定頁其他欄位存檔時會整份 PUT `restDays`，store 若是舊的，會把剛匯入的日期蓋掉。
- `RestDaysManager.tsx`：移除「週末算休息」勾選框；說明文字改成「週六、週日固定休息；這份清單供所有系統共用（VSMS、VTMS、MCP）」。
- `src/lib/restDays.ts`、`GanttChart.tsx`、`src/dashboard/script.ts`：`isRestDay` 一律把週六日當休息日，不再讀 `weekends`。

#### 3.4 後端其他讀取與寫入端

- `routes/analytics.ts`（負載分布）、`routes/integration.ts`（workload API）：改用 `readHolidays()`，年度涵蓋依 2 節規則。
- `lib/notifyDate.ts`、`lib/notifyStore.ts`、`routes/notify.ts`：`isRestDay` 一律排除週六日；`RestDaySettings.weekends` 移除。
- `routes/options.ts` 兩處 `restDaysConfig.upsert`：`weekends` 一律寫 `true`；`specificDates` 每筆必須符合 `YYYY/MM/DD` 且為真實日期，否則 400，整份不寫。

### 4. VTMS

- `server/src/jobs/sources/vsmsConfig.ts` 的 `readWorkdayCalendar()` 改讀 `` `${schema}`.rest_days_config ``，依 2 節規則正規化，回傳的 `WorkdayCalendar.holidays` 為 ISO 陣列。
- `workdays.ts`、`runner.ts`、`scheduler.ts` 不改：它們本來就把週六日寫死、吃 ISO 清單。
- 檔頭註解改寫：讀的是 `rest_days_config`，不是 `calendar_config`。

### 5. MCP（`F:\mcp-api-src\vsms_Csharp`）

- `IntegrationRepository.GetCalendarConfigAsync` 改名 `GetHolidaysAsync`，查 `rest_days_config.specificDates`；`CalendarConfigRow` 換成回傳正規化後日期與年度集合的型別，正規化規則同 2 節（`ParseHolidayJson` 擴充成接受兩種分隔符）。
- `IntegrationServiceImpl.GetWorkloadAnalysisAsync`、`CoverageService.LoadHolidaysAsync` 改用新方法；「年度符合才用」改成「該年度在清單中有日期才用」。
- MCP 工具的輸入輸出 schema 不變，Copilot Studio 不需要重新連線。部署依既有流程只覆蓋 DLL（見 mcp-api-deployment-path）。

### 6. 上線順序

| 步驟 | 內容 | 前置條件 |
|---|---|---|
| ① | 補 `2026/02/27` 進 `specificDates`（備份原值） | 無 |
| ② | VTMS、VSMS 後端、MCP 改讀新來源（三者順序不拘） | ① 完成：切換後工作日判斷唯一的差異是 12/25 變成假日（正確） |
| ③ | VSMS 匯入流程、設定頁、甘特圖週末規則、options 寫入驗證 | ② 中 VSMS 後端完成（新前端呼叫的回應格式由新後端提供，server 先於前端） |
| ④ | 凍結 `calendar_config`；2026-11-30 後 DROP 並移除 model | ②③ 上線且無回報 |

- **時間**：VTMS 與 VSMS 都有每日排程（VTMS 09:00／09:30、VSMS 08:00）。改資料或重啟前用 `powershell Get-Date` 確認台北時間（Git Bash 的 `TZ=Asia/Taipei` 會靜默印 UTC，見 gitbash-tz-trap）。
- **退版**：各系統部署前留 `dist.stable-YYYYMMDD-pre-unified-holidays`；凍結期間 `calendar_config` 原樣保留，換回舊 dist 即恢復舊行為。

### 7. 測試

- **VSMS**
  - `normalizeHolidayDates`：斜線、ISO、混用、空陣列、格式錯誤單筆略過、非陣列拋錯、`years` 正確。
  - 匯入路由：與既有清單聯集（手動日期保留、重複略過、回傳 `added`/`skipped`/`specificDates`）；防呆 422 時不寫入（既有測試保留）；不再寫 `calendar_config`。
  - `options` PUT：格式錯誤 400、`weekends` 固定寫 `true`。
  - 負載分布／integration：年度有資料用清單、無資料加註記。
  - `notifyDate`：週末不看開關。
  - 前端：`isRestDay` 週末固定休息；匯入成功後 store 更新。
- **VTMS**：`readWorkdayCalendar` 從 `rest_days_config` 讀出 ISO 清單、斜線轉換、整列缺失拋錯、單筆錯誤略過。
- **MCP**：`Vtms.Api.Tests` 補 `ParseHolidayJson` 兩種分隔符與年度涵蓋判斷。
- **上線後驗證**：VTMS 用正式讀取路徑印出 10/01、10/09、12/25、2027-01-04 的工作日判斷；VSMS 負載分布 10 月工作日數與手算一致；MCP 呼叫一次工作量分析確認無「未涵蓋」註記。

### 8. 使用說明（vportal `docs/guides/vsms`）

- `role-admin.md`「假日行事曆」：改成「只有一份休息日清單，VSMS、VTMS、MCP 共用；匯入只會新增；刪除立即全平台生效」。移除 2026-10-05 補的「刪除不會改到政府行事曆」警告（屆時已不成立），保留「單月超過 8 天整份拒絕」。
- `settings.md`：休息日設定拿掉週末開關的描述。
- `analytics.md`：「工作日依匯入的政府行事曆計算」改成「依休息日清單計算」。
- 部署前跑 `npm run check:guide`。

## 不在範圍內

- **週六補班日**：解析器本來就忽略補班日，清單也沒有表達「某個週六要上班」的方式；維持現狀。日後若政府日曆再出現補班日，需另案處理。
- **假日來源與備註**（哪天是政府假日、哪天是公司自訂）：目前沒有需求；日後需要再評估改成一天一列的資料表。
- **跨年度自動提醒匯入新年度日曆**：年度涵蓋註記已會在負載分布與 MCP 顯示；VTMS 只記 log。
