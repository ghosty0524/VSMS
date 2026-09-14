# 負載分布改用 Agent 算法、審計紀錄保留兩個月 — 設計

日期：2026-09-14

## 背景

1. 審計紀錄（`audit_logs`）目前由 `server/src/lib/storage.ts` 的每日清除排程保留 180 天，需求改為只保留兩個月。
2. 統計分析頁的「負載分布」圖（`src/components/analytics/LoadSection.tsx`）是前端自己的一套算法：把 timeResource 依重疊工作天比例分攤到期間、按類別堆疊、工作日用 restDays 設定。Copilot Agent（小P+）回答負載問題時走的是 `server/src/lib/workload.ts` 的 `analyzeWorkload`（C# 版 `IntegrationServiceImpl.AnalyzeWorkload` 與之對齊）：每日強度＝(timeResource＋類別調整)÷排程區間工作日數、同日加總、單日 1.2 封頂、工作日依政府行事曆（`calendar_config`）、輸出每人基礎分／負載率％／等級，另可加上加班加分。兩者數字對不上。需求：負載分布改成與 Agent 一致，但不含加班的部分。

## 決策（已與使用者確認）

- 長條顯示負載率％，每人一條、依等級上色，不再按類別堆疊（封頂後無法精確拆回類別）。
- 保留月／季／年切換；季、年為逐月套同一算法後加總。
- 保留「單位」維度；單位負載率＝所屬人員負載率平均。
- 頁面篩選中的類別、單位、人員會影響負載圖；**狀態篩選不影響**（Agent 算法只排除已取消，不看狀態）。此為與現況唯一的行為差異，圖下註記說明。

## 一、審計紀錄保留兩個月

- `AUDIT_RETENTION_DAYS = 180` 改為保留兩個曆月：新增純函式 `auditRetentionCutoff(now: Date): Date`，回傳 `now` 往前推兩個月的同一時刻（`setMonth(getMonth() - 2)`）。`purgeOldAuditLogs` 改用它算 `cutoff`。
- 清除排程本身不動：啟動時先跑一次，之後每 24 小時一次。
- 測試：`server/src/__tests__/auditRetention.test.ts` 驗證 9/14 → 7/14、月底跨月（3/31 → 1/31）等案例，確認為兩個月而非 60 天。
- 前端審計頁沒有寫死保留天數的文字，不改。

## 二、負載分布改用 Agent 算法

### 架構

新增後端路由 `server/src/routes/analytics.ts`，掛在 `/api/analytics`，套 `requireAuth`（guest 為 GET，`guestReadOnly` 自然放行）。前端 LoadSection 改打 `GET /api/analytics/workload`。算法只有 `analyzeWorkload` 一份，不在前端複製。

### API：`GET /api/analytics/workload`

**參數**

| 參數 | 說明 |
|---|---|
| `from` | `YYYY-MM`，必填 |
| `to` | `YYYY-MM`，必填，須 ≥ `from`；月＝與 from 相同，季＝3 個月，年＝12 個月。超過 12 個月回 400 |
| `categories` | 逗號分隔，可省略；省略＝不篩 |
| `testUnits` | 同上 |
| `testEngineers` | 同上 |

參數格式錯誤回 400 `{ ok: false, message }`。

**處理流程**

1. 查詢 `isCancelled = false`、`startDate <= to 月底`、`endDate >= from 月初` 的排程（日期為 `YYYY/MM/DD` 字串比較，比照 integration 路由的 `normalizeDate`），再套 categories／testUnits／testEngineers 篩選，過濾掉 `testEngineer` 為空者。
2. 讀 `calendar_config`（id=1）與 `category` 的 statsMode（用 `routes/optionsMapping.ts` 的 `normalizeStatsMode`）。
3. 對 from～to 的每個月呼叫 `analyzeWorkload({ month, schedules, holidays, statsModes })`，**不帶 overtime**。holidays 只在該月年份等於 `calendar.year` 時提供，否則該月 holidays 為空並產生一則提醒「行事曆未涵蓋 YYYY 年，工作日僅排除週六日、未排除國定假日」（每個年份只留一則）。
4. 以新純函式 `mergeMonthlyWorkloads(results: WorkloadResult[]): MergedWorkload`（放 `server/src/lib/workloadRange.ts`）合併：
   - `workdays`：逐月相加。
   - 每位工程師：`baseScore`、`unscheduledDays`、`partialDays`、`cappedDays` 逐月相加；`testUnits` 取聯集（排序）；`rate = round1(Σbase ÷ Σworkdays × 100)`（workdays 為 0 時為 0）；`level = classifyLevel(rate)`。
   - 單月時結果與 `analyzeWorkload` 逐項相等（測試釘住）。
   - 排序：rate 降冪，同分依姓名序數（與 `analyzeWorkload` 相同）。
   - 各月 `limitations` 一律丟棄（含「查無加班紀錄」，本圖刻意不含加班；行事曆提醒已在步驟 3 另行收集）。
5. `scheduleCount`：`analyzeWorkload` 的筆數是單月筆數，跨月排程會被算多次。改在路由層以步驟 1 的排程清單另算：每位工程師「與期間重疊、statsMode 為 counted」的不重複排程數。單月時與 `analyzeWorkload` 的 `scheduleCount` 相等。

**回應**

```json
{
  "from": "2026-07", "to": "2026-09",
  "workdays": 66,
  "notes": ["行事曆未涵蓋 2027 年，……"],
  "engineers": [
    { "testEngineer": "Will_Wang", "testUnits": ["RA"], "scheduleCount": 4,
      "baseScore": 55.2, "rate": 83.6, "level": "中等",
      "unscheduledDays": 3, "partialDays": 5, "cappedDays": 10 }
  ]
}
```

### 前端 `LoadSection.tsx`

- Props 改為 `{ filter: AnalyticsFilter; schedules: Schedule[] }`：`filter` 用來組 API 查詢（statuses 不送），`schedules`（AnalyticsPage 的 `filtered`）只用來推出期間下拉選項（每筆排程的 startDate～endDate 涵蓋的期間鍵，加上今天所在期間）。不再需要 `categories`、`colorOf`、`workloadSchedules`。
- 以 `useEffect` 在 scale／period／filter 變更時呼叫 `api.get('/analytics/workload?…')`；用 request 序號忽略過期回應；有載入中與錯誤狀態（錯誤顯示 `ApiError.message`）。
- 期間鍵 → from/to：月 `2026/07` → 2026-07～2026-07；季 `2026 Q3` → 2026-07～2026-09；年 `2026` → 2026-01～2026-12。純函式 `periodRange(key, scale)` 放 `src/lib/analytics.ts`。
- 圖：`BarChart` 水平長條，dataKey `rate`，每條依 `level` 上色（`Cell`）：超載 `#dc2626`、滿載 `#f59e0b`、中等 `#3b82f6`、偏低 `#9ca3af`；`ReferenceLine x={100}`；上方四級圖例；X 軸單位％。
- Tooltip：負載率％、基礎分、期間工作日、排程筆數、封頂天數、未排程天數；單位維度另顯示人數。
- 「單位」維度：純函式 `aggregateByUnit(engineers)`（`src/lib/analytics.ts`）——對每個出現在任一人員 `testUnits` 的單位，取 testUnits 含該單位的人員，`rate = round1(平均)`，`level = classifyLevel(rate)`，`headcount`、`scheduleCount` 加總；排序同人員。`classifyLevel` 在前端另放一份純函式（門檻與後端相同，測試釘住四個邊界值）。
- 圖下說明：「與 Agent 負載分析同一算法（不含加班加分）：每日強度＝(timeResource＋類別調整)÷區間工作日，單日 1.2 封頂；工作日依政府行事曆；已取消排程不計；狀態篩選不影響此圖。」`notes` 有內容時列在說明上方。
- 標題改為「負載分布（負載率％）」。
- `AnalyticsPage.tsx`：LoadSection 改傳 `filter` 與 `filtered`；`workloadSchedules` 若無其他使用者則移除。`allocateTimeResource` 若已無使用者則連同其測試移除。`splitByStatsMode` 仍被統計類元件使用，保留。

### 測試

- `server/src/__tests__/workloadRange.test.ts`：單月合併等於原結果；兩個月相加（基礎分、工作日、天數）；rate 以合併後總數重算；testUnits 聯集；排序與 tie-break。
- `server/src/__tests__/analyticsRoute.test.ts`：參數驗證（缺 from、格式錯、to < from、超過 12 個月 → 400）；篩選參數解析；scheduleCount 跨月不重複。以現有路由測試的做法 mock prisma。
- `src/__tests__/analytics.test.ts`：`periodRange`、`aggregateByUnit`、前端 `classifyLevel`。

### 部署

server 有變更：先部署 server、`pm2 restart vsms`，再 build 前端。C#（MCP_API）與 VTMS 不動；`analyzeWorkload` 本身未修改，Agent 行為不變。

## 不做的事

- 不改 `analyzeWorkload` 的算法與介面。
- 不在前端複製算法。
- 不加加班資料（需求明確排除）。
- 不動 C# 版與 Agent 指示。
