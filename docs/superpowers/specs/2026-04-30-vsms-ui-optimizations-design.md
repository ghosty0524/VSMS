# VSMS UI 優化功能設計文件

**日期：** 2026-04-30  
**版本：** 1.1（2026-05-01 更新，含實作後修訂）  
**範圍：** 四項管理介面優化

---

## 功能 1 — Tooltip 智慧邊界迴避

### 問題
目前 GanttChart.tsx 的 tooltip 固定以 `left: x+14, top: y+14` 渲染，當滑鼠靠近視窗右側或底部邊框時，tooltip 會超出可視範圍被遮蓋。

### 設計

**觸發位置：** `GanttChart.tsx` 的三個 `onMouseEnter` 事件（左側工作排程列、右側 Bar 的正常段與溢出段）

**計算邏輯（`getTooltipPosition` helper 函式）：**

```ts
const TOOLTIP_ESTIMATE_W = 220   // 預估 tooltip 最大寬度（px）
const TOOLTIP_ESTIMATE_H = 180   // 預估 tooltip 最大高度（px）
const TOOLTIP_OFFSET     = 14    // 距游標的偏移距離

function getTooltipPosition(
  x: number,
  y: number,
  vw = window.innerWidth,
  vh = window.innerHeight,
): { left: number; top: number }
```

水平：若 `(x + OFFSET + TOOLTIP_W) > vw` → 往左彈出，否則往右  
垂直：若 `(y + OFFSET + TOOLTIP_H) > vh` → 往上彈出，否則往下

> **實作說明：** `getTooltipPosition` 以 `vw`/`vh` 作為可注入參數，方便單元測試（測試時傳入固定視窗尺寸，不依賴 `window`）。函式以 `export` 對外公開供測試使用。

**State 結構（不變）：**
```ts
{ x: number; y: number; s: Schedule } | null
```

**測試檔案：** `src/__tests__/tooltip-position.test.ts`

**修改檔案：** `src/components/schedule/GanttChart.tsx`

---

## 功能 2 — USER 角色欄位編輯限制

### 問題
目前 `ScheduleFormModal.tsx` 只對 `testEngineer` 欄位做了 USER 的 disabled 處理，其餘欄位 USER 仍可任意修改。

### 設計

**判斷條件：** `const isUser = role === 'user'`（元件內已存在）

**USER 可編輯欄位（4 個）：**
- `testReport`（測試報告）
- `isCompleted`（Completed checkbox）
- `isDelayed`（Delayed checkbox）
- `delayReason`（延遲原因，僅在 isDelayed=true 時出現）

**USER 唯讀欄位（9 個，加 `disabled` prop + 灰底樣式）：**
- `category`、`projectName`、`taskDescription`
- `testUnit`、`testEngineer`
- `timeResource`
- `startDate`、`endDate`
- `requiredPersonnel`

**樣式規則：**
- disabled 狀態：`bg-gray-100 text-gray-500 cursor-not-allowed`
- DatePicker 欄位（startDate、endDate）：加上 `disabled` prop 讓日曆無法開啟

> **實作說明：** `testEngineer` select 原已有 `disabled={!form.testUnit || isUser}`，無需另行修改。USER 儲存時的 server-side 驗證也同步加強（由後端保護，前端 disabled 為輔助 UX）。

**修改檔案：** `src/components/schedule/ScheduleFormModal.tsx`

---

## 功能 3 — 甘特圖左欄寬度拖曳調整

### 問題
左側「工作排程」欄寬度固定為 `LEFT_W = 248`（常數），無法調整，導致較長的專案名稱或工作內容被截斷。

### 設計

**把手元素：**
- 寬度 6px，位於左欄與右側時間軸之間（`absolute` 定位）
- 平時顯示為淡灰色（`bg-slate-200`），hover 時變藍（`bg-blue-400`）
- cursor: `col-resize`

**寬度限制：**
- 最小：180px
- 最大：600px
- 預設：248px（與 `LEFT_W` 常數一致）

**State：**
```ts
const [leftWidth, setLeftWidth] = useState<number>(() => {
  const saved = sessionStorage.getItem('ganttLeftWidth')
  const n = Number(saved)
  return saved && !isNaN(n) ? Math.min(600, Math.max(180, n)) : LEFT_W
})
```

**拖曳邏輯：**
- `mousedown` 在把手上 → 記錄起始 X 與起始寬度
- `mousemove` on `document` → 計算 delta，clamp 到 [180, 600]，即時更新 `leftWidth`
- `mouseup` on `document` → 移除監聽器，寫入 `sessionStorage('ganttLeftWidth')`
- 使用 `useRef` 儲存監聽器參照，在 `useEffect` cleanup 時移除，避免記憶體洩漏

**Session 持久性：**
- 寫入 `sessionStorage`，**登出時即清除**（在 `authStore.logout()` 內呼叫 `sessionStorage.removeItem('ganttLeftWidth')`）
- 不寫入 localStorage，避免跨登入持久化

**左欄內容自動延伸：**
- 移除原本 JS 硬截斷（`projectName` 15 字、`taskDescription` 18 字）
- 改用 CSS `truncate`（overflow: hidden + text-overflow: ellipsis）搭配 `min-w-0`，讓文字隨欄位寬度自動顯示更多內容

**修改檔案：**
- `src/components/schedule/GanttChart.tsx`
- `src/store/authStore.ts`（logout 時清除 sessionStorage）

---

## 功能 4 — Excel 覆蓋前差異確認對話框

### 問題
目前 `ExcelImportModal.tsx` 在 mode='replace' 時直接執行 `replaceAll()`，可能無聲覆蓋工程師（USER）已填寫的測試報告與狀態欄位。

### 設計

**配對鍵（5 個欄位，全部相符才視為同一筆工作排程）：**
- `projectName`（專案名稱）
- `taskDescription`（工作內容）
- `testEngineer`（測試人員）
- `startDate`（排程開始日期）
- `endDate`（排程結束日期）

> **設計說明：** 單純以 `taskDescription` 配對不足，因為同一工作描述可能出現在不同專案、不同工程師、不同時間段的排程中，導致跨記錄誤配。五欄位組合可精確識別同一筆排程。

**比較欄位（4 個）：**
- `testReport`（測試報告）
- `isCompleted`（Completed）
- `isDelayed`（Delayed）
- `delayReason`（延遲原因）

**觸發流程：**

```
使用者點「確認匯入」（mode = 'replace'）
  ↓
比對 result.valid 與 schedules（現有）
  → 以五欄位組合找出配對記錄
  → 比較四個可編輯欄位
  ↓
若 diffs.length === 0
  → 直接執行 replaceAll()，不彈對話框
若 diffs.length > 0
  → 開啟 DiffConfirmModal
     → 使用者點「確認覆蓋」→ 執行 replaceAll()，關閉兩個 modal
     → 使用者點「取消」→ 關閉 DiffConfirmModal，回到匯入視窗（不執行覆蓋）
```

**DiffConfirmModal 內容：**
- 標題：「⚠ 覆蓋差異確認」（`z-[60]`，蓋在主 modal `z-50` 之上）
- 說明文字：「以下 N 筆資料有差異，確認後將以 Excel 內容覆蓋現有值」
- 以「記錄」為單位分組呈現，每組顯示：
  - 群組標頭：「📋 {projectName}（{taskDescription}）」
  - 群組內差異列：欄位名稱 ｜ 現有值（刪除線紅字） ｜ Excel 值（綠字）
- 按鈕：「取消」（左）、「確認覆蓋」紅底（右）

**DiffConfirmModal 實作位置：**
- 定義在 `src/components/schedule/ExcelImportModal.tsx` 同一檔案內（inline 元件）
- 主 modal 以 Fragment `<>` 包裹，DiffConfirmModal 並列渲染

**新增型別：**
```ts
interface FieldDiff {
  field: 'testReport' | 'isCompleted' | 'isDelayed' | 'delayReason'
  label: string
  oldVal: string
  newVal: string
}
interface RecordDiff {
  projectName: string
  taskDescription: string
  diffs: FieldDiff[]
}
```

**Excel 匯出日期格式：**
- `startDate`、`endDate` 以字串（`'YYYY/MM/DD'`）匯出，不使用 `Date` 物件
- 避免 xlsx-js 在 UTC 計算 serial number 時因時區偏移（UTC+8）導致日期往前一天的問題
- 匯入時 `normDate()` 已支援字串格式，roundtrip 正確

**測試檔案：** `src/__tests__/excel-diff.test.ts`

**修改檔案：**
- `src/components/schedule/ExcelImportModal.tsx`
- `src/lib/excel.ts`（匯出日期改為字串格式）

---

## 受影響檔案彙整

| 檔案 | 功能 |
|------|------|
| `src/components/schedule/GanttChart.tsx` | 功能 1（tooltip 定位）、功能 3（左欄拖曳、內容自動延伸） |
| `src/components/schedule/ScheduleFormModal.tsx` | 功能 2（USER 欄位限制） |
| `src/components/schedule/ExcelImportModal.tsx` | 功能 4（差異確認 modal） |
| `src/lib/excel.ts` | 功能 4（匯出日期格式修正） |
| `src/store/authStore.ts` | 功能 3（登出清除 sessionStorage） |
| `src/__tests__/tooltip-position.test.ts` | 功能 1 單元測試 |
| `src/__tests__/excel-diff.test.ts` | 功能 4 單元測試 |
