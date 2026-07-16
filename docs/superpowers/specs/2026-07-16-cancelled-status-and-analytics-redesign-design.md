# Cancelled 排程狀態 + 統計分析頁改版 設計文件

日期：2026-07-16
狀態：已與使用者逐項討論定案（含視覺 mockup 確認）

## 背景與目標

1. 排程狀態目前有 Planned／Testing（自動推導）與 Completed／Delayed（手動勾選），需新增手動勾選的 **Cancelled** 狀態。
2. 統計分析頁分析方式過於簡略、部分區塊必要性不高，重新規劃顯示內容與方式；UI/UX 同步改版，目標為**方便識讀、畫面簡約舒適**。

---

## 任務 1：Cancelled 排程狀態

### 1.1 資料模型

- `Schedule` 新增欄位 `isCancelled: boolean`，預設 `false`。
  - Prisma schema 新增 `isCancelled Boolean @default(false)` + migration。
  - 前端 `src/types.ts`（`Schedule`、`ScheduleFormValues`）與後端 `server/src/types.ts` 同步。
- 一併新增 `completedAt: DateTime?`（nullable）：
  - 後端在 `isCompleted` 由 false→true 時自動寫入當下時間；true→false 時清為 null。
  - 本次僅埋資料，不做任何前端顯示或分析（供未來準時完成率、完成趨勢分析使用）。

### 1.2 狀態邏輯（`src/lib/status.ts`）

- `ScheduleStatus` 新增 `'Cancelled'`。
- 優先序：**Cancelled > Completed > Delayed > Testing > Planned**。
- Excel 匯出（`src/lib/excel.ts`）與匯出版 dashboard（`src/dashboard/script.ts`）內的 `computeStatus` 複本同步更新。

### 1.3 表單 UI（ScheduleFormModal）

- Cancelled checkbox 置於 Delayed 區塊（含條件顯示的延遲原因欄）**下方**——未勾選 Delayed 時即緊貼在 Delayed checkbox 正下方。
- 標籤文字：`Cancelled（工作已取消）`。
- **與 Completed 互斥**：勾選 Cancelled 時自動取消勾選並停用 Completed；勾選 Completed 時停用 Cancelled。可與 Delayed 同時勾選。
- **不需要**取消原因欄位。
- **權限**：僅 admin / super_admin 可操作；USER 角色顯示為停用（比照其他 admin-only 欄位樣式）。
- **VTMS 關聯時不鎖定**：排程關聯 VTMS 測試計畫時 Completed／Delayed 被鎖定，Cancelled 維持可勾選（取消是 VSMS 排程層的人為決策）。

### 1.4 後端

- `validateSchedule.ts`：驗證 `isCancelled` 為 boolean；`isCancelled` 與 `isCompleted` 同時為 true 回 422。
- `routes/schedules.ts`：
  - admin 可編輯欄位加入 `isCancelled`；**USER 可編輯欄位清單不加入**（與前端停用形成雙重防護）。
  - VTMS 關聯排程的欄位剝除邏輯（isCompleted/isDelayed/delayReason）**不**剝除 `isCancelled`。
  - `isCompleted` 轉換時維護 `completedAt`（見 1.1）。
- `routes/integration.ts`（VTMS 整合統計端點）：新增 `cancelled` 計數；`delayed`／`inProgress`／`notStarted` 各桶排除 `isCancelled === true` 的排程。

### 1.5 顏色與呈現

- `constants.ts` 的 `STATUS_COLORS` 新增 `Cancelled: { bg: '#111827'（深黑）, text: '#FFFFFF' }`。
- 甘特圖左側狀態標籤自動沿用；`GanttChart` 的 `STATUS_PRIORITY`（狀態排序）加入 Cancelled（排最末）。
- 篩選器（`FilterSortBar`）、統計頁狀態選項（`STATUS_OPTIONS`）加入 `Cancelled`。
- Excel CSV 匯入／匯出：比照 `isCompleted`/`isDelayed` 新增 `isCancelled` 欄（TRUE/FALSE）；匯出報表的「狀態」欄與統計摘要反映 Cancelled（摘要新增 Cancelled 計數，完成率等比率分母排除已取消）。
- 匯出版 dashboard（`template.ts` 的 `ALL_STATUSES`、`script.ts` 的 `STATUS_COLORS`、`styles.ts` 的 `.status-*`）加入 Cancelled；狀態顯示 checkbox 同步新增。

---

## 任務 2：統計分析頁改版

### 2.1 整體版面

- **單一全域篩選列**：置於頁面最上方，`position: sticky` 固定（捲動不消失），控制全頁所有區塊。篩選項目：工作類別／測試單位／測試人員／排程狀態（多選下拉，沿用現有 MultiSelect）＋重置。各區塊移除原本重複的篩選列。
- **寬螢幕雙欄**：趨勢圖（2/3）＋圓餅圖（1/3）並排；單位執行比較與延遲分析並排；其餘全寬。窄螢幕自動降為單欄。
- 區塊順序：① 整體概覽 KPI → ② 類別趨勢與占比 → ③ 負載分布 → ④ 風險清單 → ⑤ 單位執行比較｜延遲分析。

### 2.2 區塊一：整體概覽（行動導向 KPI）

- 上方一排狀態小標籤（chips）：計畫中／進行中／已完成／延遲中／已取消（深黑）各筆數＋總數。
- 四張扁平 KPI 卡：
  1. **進行中**數（Testing）。
  2. **已逾期未完成**數：`endDate < today && !isCompleted && !isCancelled`。唯一使用紅色底強調的卡。
  3. **已到期完成率**：分母 = `endDate < today && !isCancelled` 的排程；分子 = 其中 `isCompleted`。附註「分母僅含已過完成日者」。
  4. **延遲中**數（computeStatus === 'Delayed'）。
- **已取消一律排除於所有比率分母。**

### 2.3 區塊二：類別趨勢與占比

- 折線圖：每期間**新增**排程數（依 `startDate` 歸屬期間）× 工作類別，維持現有分析視角。
- **時間刻度切換：月／季／年**（segmented control），作用於折線圖 X 軸彙總。
- **類別 chips**：圖表上方一排可點擊的類別開關（色點＋名稱，關閉時變灰加刪除線），即時顯示/隱藏類別，**同時作用於折線圖與圓餅圖**。
- **圓餅圖**（新增，與折線圖並排）：全體各類別筆數占比；附期間下拉（依目前刻度列出資料中存在的期間，預設「全部」），中心顯示總數。

### 2.4 區塊三：負載分布

- 計量單位改為 **`timeResource` 工作天數**（不再用筆數），**不顯示加總數字**（hover tooltip 顯示各類別天數）。
- 每列一條**依類別堆疊**的橫條；檢視維度可切換 **測試人員／測試單位**。
- 時間刻度 **月／季／年** ＋ 期間下拉（預設當前期間，如 2026/07）。
- **跨期分攤規則**：排程跨越期間邊界時，依「排程起迄區間落在該期間內的工作天數 ÷ 排程區間總工作天數」比例分攤 `timeResource`；工作天遵循系統休息日設定（週末＋特定日期）。各期間分攤加總＝排程總天數。
- 已取消排程不計入負載。

### 2.5 區塊四：風險清單（取代即將到期清單）

- 兩類列項合併一表，逾期在前：
  - **已逾期未完成**：列左緣 3px 紅色條，右側紅字「逾期 N 天」，依逾期天數多→少排序。
  - **7 天內到期**：列左緣 3px 黃色條，黃字「剩 N 天」，依到期日近→遠排序。
- 欄位：PDN Number、測試人員 · 測試單位、到期日、天數。
- 排除已完成與已取消。

### 2.6 區塊五：單位執行比較（新增）

- 表格並列各測試單位：排程數、已到期完成率、延遲中數、逾期未完成數（逾期以紅字強調）。
- 指標定義與 KPI 卡一致，排除已取消。

### 2.7 區塊六：延遲分析（新增）

- 延遲中排程依**測試單位**的分布橫條圖。
- 下方列出延遲原因清單：PDN Number · 測試人員 — 延遲原因摘要。

### 2.8 UI/UX 規範

- **Emoji 全數移除**（頁面標題、區塊標題、篩選列、KPI 卡），以字級與留白建立階層。
- **KPI 卡扁平化**：淺灰底（無粗彩框、無滿版彩底）、小字灰標籤、24px 級數字；僅「已逾期未完成」用紅色系強調。
- **色彩紀律**：
  - 類別色盤重定義為避開正紅／正綠的和諧色系（紫、青綠、珊瑚、粉、藍等），實作時套用 dataviz 色彩規範驗證對比度；`TrendChart`／`LoadChart` 共用同一色盤常數。
  - 紅／黃／綠保留給狀態語意（逾期、即將到期、完成）。
- **圖表統一樣式**：共用 tooltip、淺灰網格、12px 軸字；legend 統一改為圖上方的類別 chips（即 2.3 的類別開關）。
- 風險清單移除舊的黃色狀態 pill（原本永遠黃色、與實際狀態無關）。

---

## 錯誤處理與邊界

- 後端對 `isCancelled + isCompleted` 同真回 422（含測試）。
- 舊資料無 `isCancelled`／`completedAt`：migration 預設 false／null，行為不變。
- 分攤計算中排程區間工作天數為 0（起迄全落在休息日）時，該排程天數整筆歸入起始日所在期間，避免除以零。
- 篩選後無資料時各區塊顯示「尚無資料」空狀態。

## 測試計畫

- `validateSchedule`：isCancelled 型別驗證、互斥 422、USER 不可寫 isCancelled。
- `status.ts`：新優先序單元測試（Cancelled 蓋過 Completed/Delayed/Testing/Planned）。
- 負載分攤函式：跨月／跨季排程比例分攤、休息日處理、零工作天 fallback。
- KPI 指標函式：已到期完成率、逾期未完成、排除已取消。
- `completedAt`：false→true 寫入、true→false 清空。
- Excel 匯入含/不含 isCancelled 欄的相容性。

## 不做的事（YAGNI）

- 取消原因欄位。
- 準時完成率／每月完成趨勢分析（等 `completedAt` 資料累積後再議）。
- 舊 `SuitesPage` 類的孤兒元件不碰；主頁甘特圖除狀態顏色／篩選選項外不動。
