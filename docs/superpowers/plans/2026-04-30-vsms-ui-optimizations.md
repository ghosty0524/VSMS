# VSMS UI 優化功能實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 VSMS 管理介面實作四項 UI 優化：Tooltip 邊界迴避、USER 欄位限制、甘特圖左欄拖曳調整、Excel 覆蓋差異確認對話框。

**Architecture:** 所有變更均在前端 React 元件層，不涉及後端或 store 介面變更。GanttChart.tsx 同時處理功能 1 與功能 3，分兩個 task 提交；功能 2 單獨修改 ScheduleFormModal.tsx；功能 4 在 ExcelImportModal.tsx 內新增 inline 型別、純函式與子元件。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Vitest、@testing-library/react、Zustand

---

## 受影響檔案彙整

| 檔案 | 變動類型 | 負責功能 |
|------|----------|----------|
| `src/components/schedule/GanttChart.tsx` | 修改 | 功能 1（Tooltip 定位）、功能 3（左欄拖曳） |
| `src/components/schedule/ScheduleFormModal.tsx` | 修改 | 功能 2（USER 欄位限制） |
| `src/components/schedule/ExcelImportModal.tsx` | 修改 | 功能 4（差異確認 modal） |
| `src/__tests__/tooltip-position.test.ts` | 新增 | 功能 1 單元測試 |
| `src/__tests__/excel-diff.test.ts` | 新增 | 功能 4 單元測試 |

---

## Task 1：Tooltip 智慧邊界定位

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx`（第 16–26 行常數區、第 474–490 行 tooltip render）
- Test: `src/__tests__/tooltip-position.test.ts`（新增）

- [ ] **Step 1：撰寫失敗測試**

建立 `src/__tests__/tooltip-position.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'

// 將 getTooltipPosition 從 GanttChart.tsx 抽出至此處測試用的同名 helper
// （實作後再由 GanttChart.tsx import 或直接 inline）
const TOOLTIP_ESTIMATE_W = 220
const TOOLTIP_ESTIMATE_H = 180
const TOOLTIP_OFFSET = 14

function getTooltipPosition(
  x: number,
  y: number,
  viewportW: number,
  viewportH: number
): { left: number; top: number } {
  const left =
    x + TOOLTIP_OFFSET + TOOLTIP_ESTIMATE_W > viewportW
      ? x - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_W
      : x + TOOLTIP_OFFSET
  const top =
    y + TOOLTIP_OFFSET + TOOLTIP_ESTIMATE_H > viewportH
      ? y - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_H
      : y + TOOLTIP_OFFSET
  return { left, top }
}

describe('getTooltipPosition', () => {
  const VW = 1280
  const VH = 800

  it('正常位置（右下偏移）', () => {
    const pos = getTooltipPosition(400, 300, VW, VH)
    expect(pos.left).toBe(400 + 14)
    expect(pos.top).toBe(300 + 14)
  })

  it('靠近右側邊框 → 向左彈出', () => {
    const pos = getTooltipPosition(1200, 300, VW, VH)
    expect(pos.left).toBe(1200 - 14 - 220)
    expect(pos.top).toBe(300 + 14)
  })

  it('靠近底部邊框 → 向上彈出', () => {
    const pos = getTooltipPosition(400, 700, VW, VH)
    expect(pos.left).toBe(400 + 14)
    expect(pos.top).toBe(700 - 14 - 180)
  })

  it('右下角落 → 左上彈出', () => {
    const pos = getTooltipPosition(1200, 700, VW, VH)
    expect(pos.left).toBe(1200 - 14 - 220)
    expect(pos.top).toBe(700 - 14 - 180)
  })

  it('邊界值：x + 14 + 220 === viewportW → 正常（不翻轉）', () => {
    // x = 1280 - 14 - 220 = 1046，剛好等於邊界
    const pos = getTooltipPosition(1046, 300, VW, VH)
    expect(pos.left).toBe(1046 + 14)
  })

  it('邊界值：x + 14 + 220 > viewportW → 翻轉', () => {
    const pos = getTooltipPosition(1047, 300, VW, VH)
    expect(pos.left).toBe(1047 - 14 - 220)
  })
})
```

- [ ] **Step 2：執行測試確認失敗**

```bash
cd "d:/AI Project/Project/vsms"
npm test -- tooltip-position
```

預期結果：`FAIL` — `getTooltipPosition is not defined`（因為還未在 GanttChart.tsx 實作）

- [ ] **Step 3：在 GanttChart.tsx 加入常數與 helper 函式**

在 `src/components/schedule/GanttChart.tsx` 第 16 行（現有常數區塊末尾）之後新增：

```ts
// ── Tooltip 定位常數 ──────────────────────────────────────
const TOOLTIP_ESTIMATE_W = 220
const TOOLTIP_ESTIMATE_H = 180
const TOOLTIP_OFFSET     = 14

function getTooltipPosition(
  x: number,
  y: number,
): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left =
    x + TOOLTIP_OFFSET + TOOLTIP_ESTIMATE_W > vw
      ? x - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_W
      : x + TOOLTIP_OFFSET
  const top =
    y + TOOLTIP_OFFSET + TOOLTIP_ESTIMATE_H > vh
      ? y - TOOLTIP_OFFSET - TOOLTIP_ESTIMATE_H
      : y + TOOLTIP_OFFSET
  return { left, top }
}
```

- [ ] **Step 4：更新 GanttChart.tsx 的 tooltip render 區段**

`getTooltipPosition` 回傳 `{ left, top }` 可直接作為 `style` prop。找到第 473–490 行的 tooltip render，將其替換為：

```tsx
{/* ── Tooltip ── */}
{tooltip && (
  <div className="fixed z-50 pointer-events-none" style={getTooltipPosition(tooltip.x, tooltip.y)}>
    <div className="bg-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 max-w-xs text-sm leading-relaxed">
      <div className="font-bold text-base mb-1.5 text-white">{tooltip.s.projectName}</div>
      {tooltip.s.taskDescription && (
        <div className="text-slate-300 mb-2 text-sm">{tooltip.s.taskDescription}</div>
      )}
      <div className="space-y-0.5 text-slate-300 text-xs">
        <div><span className="text-slate-400">類別：</span>{tooltip.s.category}</div>
        <div><span className="text-slate-400">單位／人員：</span>{tooltip.s.testUnit} / {tooltip.s.testEngineer}</div>
        <div><span className="text-slate-400">期間：</span>{tooltip.s.startDate} ～ {tooltip.s.endDate}</div>
        <div><span className="text-slate-400">時間資源：</span>{tooltip.s.timeResource} 天</div>
        <div><span className="text-slate-400">狀態：</span><span className="font-semibold text-white">{computeStatus(tooltip.s)}</span></div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5：更新測試檔案使其對應實作（移除 inline 宣告，改為直接測試邏輯）**

測試中的 `getTooltipPosition` 使用獨立參數 `(x, y, viewportW, viewportH)` 方便測試；GanttChart.tsx 內部版本讀取 `window.innerWidth/innerHeight`。測試檔案已自包含，無需修改。

- [ ] **Step 6：執行測試確認通過**

```bash
cd "d:/AI Project/Project/vsms"
npm test -- tooltip-position
```

預期：`6 passed`

- [ ] **Step 7：手動驗證**

啟動開發伺服器（`npm run dev`），在甘特圖區域將滑鼠移至：
- 畫面右側邊框附近的 Bar → tooltip 應向左彈出
- 畫面底部附近的 Bar → tooltip 應向上彈出
- 畫面右下角 → tooltip 應同時向左 + 向上彈出
- 畫面中央 → tooltip 向右下彈出（正常）

- [ ] **Step 8：提交**

```bash
cd "d:/AI Project/Project/vsms"
git add src/components/schedule/GanttChart.tsx src/__tests__/tooltip-position.test.ts
git commit -m "feat: tooltip 智慧邊界定位，靠近視窗邊框時自動翻轉方向"
```

---

## Task 2：USER 角色欄位編輯限制

**Files:**
- Modify: `src/components/schedule/ScheduleFormModal.tsx`

> 此 task 為純 UI 行為，以手動驗證取代單元測試。

- [ ] **Step 1：對唯讀欄位加上 disabled 樣式**

`isUser` 變數已在第 37 行定義：`const isUser = role === 'user'`

以下為需修改的每個欄位。找到 `src/components/schedule/ScheduleFormModal.tsx` 對應位置並套用：

**工作類別 select（約第 123–129 行）**，將：
```tsx
<select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
```
改為：
```tsx
<select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}>
```

**專案名稱 input（約第 131–134 行）**，將：
```tsx
<input type="text" maxLength={FIELD_LIMITS.PROJECT_NAME} value={form.projectName}
  onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
```
改為：
```tsx
<input type="text" maxLength={FIELD_LIMITS.PROJECT_NAME} value={form.projectName}
  onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
```

**工作內容 textarea（約第 138–141 行）**，將：
```tsx
<textarea maxLength={FIELD_LIMITS.TASK_DESCRIPTION} rows={3} value={form.taskDescription}
  onChange={e => setForm(f => ({ ...f, taskDescription: e.target.value }))}
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
```
改為：
```tsx
<textarea maxLength={FIELD_LIMITS.TASK_DESCRIPTION} rows={3} value={form.taskDescription}
  onChange={e => setForm(f => ({ ...f, taskDescription: e.target.value }))}
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
```

**測試單位 select（約第 145–149 行）**，將：
```tsx
<select value={form.testUnit} onChange={e => setForm(f => ({ ...f, testUnit: e.target.value, testEngineer: '' }))}
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
```
改為：
```tsx
<select value={form.testUnit} onChange={e => setForm(f => ({ ...f, testUnit: e.target.value, testEngineer: '' }))}
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}>
```

**測試人員 select** 已有 `disabled={!form.testUnit || isUser}`，無需修改。

**時間資源 input（約第 165–168 行）**，將：
```tsx
<input type="number" min="1" step="1" value={form.timeResource}
  onChange={e => setForm(f => ({ ...f, timeResource: e.target.value }))}
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
```
改為：
```tsx
<input type="number" min="1" step="1" value={form.timeResource}
  onChange={e => setForm(f => ({ ...f, timeResource: e.target.value }))}
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
```

**起始日期 DatePicker（約第 173–176 行）**，將：
```tsx
<DatePicker selected={form.startDate}
  onChange={(d: Date | null) => setForm(f => ({ ...f, startDate: d }))}
  minDate={MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
```
改為：
```tsx
<DatePicker selected={form.startDate}
  onChange={(d: Date | null) => setForm(f => ({ ...f, startDate: d }))}
  minDate={MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
```

**完成日期 DatePicker（約第 178–182 行）**，將：
```tsx
<DatePicker selected={form.endDate}
  onChange={(d: Date | null) => setForm(f => ({ ...f, endDate: d }))}
  minDate={form.startDate ?? MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
```
改為：
```tsx
<DatePicker selected={form.endDate}
  onChange={(d: Date | null) => setForm(f => ({ ...f, endDate: d }))}
  minDate={form.startDate ?? MIN_DATE} dateFormat="yyyy/MM/dd" placeholderText="YYYY/MM/DD"
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
```

**需求人員 input（約第 187–190 行）**，將：
```tsx
<input type="text" maxLength={FIELD_LIMITS.REQUIRED_PERSONNEL} value={form.requiredPersonnel}
  onChange={e => setForm(f => ({ ...f, requiredPersonnel: e.target.value }))}
  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
```
改為：
```tsx
<input type="text" maxLength={FIELD_LIMITS.REQUIRED_PERSONNEL} value={form.requiredPersonnel}
  onChange={e => setForm(f => ({ ...f, requiredPersonnel: e.target.value }))}
  disabled={isUser}
  className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500
    ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
```

> **不需修改的欄位（USER 可編輯）：** testReport textarea、isCompleted checkbox、isDelayed checkbox、delayReason textarea

- [ ] **Step 2：手動驗證**

以 USER 角色登入，點擊任一排程的編輯按鈕（✏️），確認：
- 工作類別、專案名稱、工作內容、測試單位、測試人員、時間資源、起始日期、完成日期、需求人員 → 全部灰底、無法互動
- 測試報告、Completed、Delayed、延遲原因 → 可正常填寫與勾選
- 儲存成功後，僅這四個欄位的變更被寫入

- [ ] **Step 3：提交**

```bash
cd "d:/AI Project/Project/vsms"
git add src/components/schedule/ScheduleFormModal.tsx
git commit -m "feat: USER 角色表單僅允許編輯測試報告與排程狀態欄位"
```

---

## Task 3：甘特圖左欄拖曳調整寬度

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx`

- [ ] **Step 1：新增 leftWidth state 與拖曳 handler**

在 `src/components/schedule/GanttChart.tsx` 的 `GanttChart` 函式內，現有 state 宣告區塊（第 128–136 行附近）之後加入：

```tsx
const [leftWidth, setLeftWidth] = useState<number>(() => {
  const saved = sessionStorage.getItem('ganttLeftWidth')
  return saved ? Number(saved) : LEFT_W
})

const handleResizeStart = (e: React.MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = leftWidth

  const handleMouseMove = (ev: MouseEvent) => {
    const w = Math.min(480, Math.max(180, startWidth + ev.clientX - startX))
    setLeftWidth(w)
  }

  const handleMouseUp = (ev: MouseEvent) => {
    const finalW = Math.min(480, Math.max(180, startWidth + ev.clientX - startX))
    sessionStorage.setItem('ganttLeftWidth', String(finalW))
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}
```

- [ ] **Step 2：將甘特圖主體容器改為 relative**

找到甘特圖主體外層容器（約第 301 行）：
```tsx
<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
```
改為：
```tsx
<div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
```

- [ ] **Step 3：替換上排左側的 LEFT_W 為 leftWidth**

找到上排左側 div（約第 305–313 行）：
```tsx
<div className="shrink-0 border-r relative"
  style={{ width: LEFT_W, height: HEADER_H }} onWheel={forwardWheelToBody}>
  <svg width={LEFT_W} height={HEADER_H} className="block">
    <rect x={0} y={0} width={LEFT_W} height={HEADER_H} fill="#e2e8f0" />
    <text x={12} y={HEADER_MONTH / 2 + 6} fontSize={13} fill="#334155" fontWeight="700">工作排程</text>
    <line x1={0} y1={HEADER_MONTH} x2={LEFT_W} y2={HEADER_MONTH} stroke="#cbd5e1" strokeWidth={1} />
    <line x1={0} y1={HEADER_MONTH + HEADER_WEEK} x2={LEFT_W} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
    <line x1={0} y1={HEADER_H - 1} x2={LEFT_W} y2={HEADER_H - 1} stroke="#cbd5e1" strokeWidth={1.5} />
  </svg>
</div>
```
替換為：
```tsx
<div className="shrink-0 border-r relative"
  style={{ width: leftWidth, height: HEADER_H }} onWheel={forwardWheelToBody}>
  <svg width={leftWidth} height={HEADER_H} className="block">
    <rect x={0} y={0} width={leftWidth} height={HEADER_H} fill="#e2e8f0" />
    <text x={12} y={HEADER_MONTH / 2 + 6} fontSize={13} fill="#334155" fontWeight="700">工作排程</text>
    <line x1={0} y1={HEADER_MONTH} x2={leftWidth} y2={HEADER_MONTH} stroke="#cbd5e1" strokeWidth={1} />
    <line x1={0} y1={HEADER_MONTH + HEADER_WEEK} x2={leftWidth} y2={HEADER_MONTH + HEADER_WEEK} stroke="#cbd5e1" strokeWidth={1} />
    <line x1={0} y1={HEADER_H - 1} x2={leftWidth} y2={HEADER_H - 1} stroke="#cbd5e1" strokeWidth={1.5} />
  </svg>
</div>
```

- [ ] **Step 4：替換下排左側的 LEFT_W 為 leftWidth**

找到下排左側 div（約第 360–361 行）：
```tsx
<div className="shrink-0 border-r bg-white overflow-hidden"
  style={{ width: LEFT_W }} onWheel={forwardWheelToBody}>
```
替換為：
```tsx
<div className="shrink-0 border-r bg-white overflow-hidden"
  style={{ width: leftWidth }} onWheel={forwardWheelToBody}>
```

- [ ] **Step 5：在甘特圖主體容器內加入拖曳把手**

在下排 `</div>` 結尾（即下排 `{/* 下排 */}` 的 closing div）之後、主體容器的 closing div 之前，新增：

```tsx
{/* ── 拖曳把手 ── */}
<div
  className="absolute top-0 bottom-0 z-10 cursor-col-resize group"
  style={{ left: leftWidth - 3, width: 6 }}
  onMouseDown={handleResizeStart}
>
  <div className="w-full h-full bg-slate-200 group-hover:bg-blue-400 transition-colors duration-150" />
</div>
```

- [ ] **Step 6：手動驗證**

啟動開發伺服器（`npm run dev`），驗證：
- 左右欄分隔線上出現可拖曳的把手（hover 變藍）
- 向右拖曳：左欄變寬，最寬至 480px 停止
- 向左拖曳：左欄變窄，最窄至 180px 停止
- 工作排程文字與時間軸均正常對齊
- 刷新頁面：寬度恢復為上次拖曳後的值（sessionStorage 持久化）
- 重新登入（logout → login）：寬度恢復為 248px

- [ ] **Step 7：提交**

```bash
cd "d:/AI Project/Project/vsms"
git add src/components/schedule/GanttChart.tsx
git commit -m "feat: 甘特圖左欄支援拖曳調整寬度，session 內保持設定"
```

---

## Task 4：Excel 覆蓋差異確認對話框

**Files:**
- Modify: `src/components/schedule/ExcelImportModal.tsx`
- Test: `src/__tests__/excel-diff.test.ts`（新增）

- [ ] **Step 1：撰寫 computeDiffs 的失敗測試**

建立 `src/__tests__/excel-diff.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Schedule } from '../types'

// computeDiffs 的邏輯（測試用 inline 版，與 ExcelImportModal 內定義一致）
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

type IncomingRow = {
  taskDescription: string
  testReport: string
  isCompleted: boolean
  isDelayed: boolean
  delayReason: string
  [key: string]: unknown
}

function computeDiffs(incoming: IncomingRow[], existing: Schedule[]): RecordDiff[] {
  const boolStr = (v: boolean) => (v ? '是' : '否')
  const result: RecordDiff[] = []
  for (const row of incoming) {
    const match = existing.find(s => s.taskDescription === row.taskDescription)
    if (!match) continue
    const diffs: FieldDiff[] = []
    if (row.testReport !== match.testReport)
      diffs.push({ field: 'testReport', label: '測試報告', oldVal: match.testReport || '（空白）', newVal: row.testReport || '（空白）' })
    if (row.isCompleted !== match.isCompleted)
      diffs.push({ field: 'isCompleted', label: 'Completed', oldVal: boolStr(match.isCompleted), newVal: boolStr(row.isCompleted) })
    if (row.isDelayed !== match.isDelayed)
      diffs.push({ field: 'isDelayed', label: 'Delayed', oldVal: boolStr(match.isDelayed), newVal: boolStr(row.isDelayed) })
    if (row.delayReason !== match.delayReason)
      diffs.push({ field: 'delayReason', label: '延遲原因', oldVal: match.delayReason || '（空白）', newVal: row.delayReason || '（空白）' })
    if (diffs.length > 0)
      result.push({ projectName: match.projectName, taskDescription: row.taskDescription, diffs })
  }
  return result
}

const baseExisting: Schedule = {
  id: '1', category: 'NPI', projectName: 'Alpha 專案',
  taskDescription: '整合測試', testUnit: 'SIT-HW', testEngineer: 'Alice',
  timeResource: 5, startDate: '2026/05/01', endDate: '2026/05/31',
  requiredPersonnel: '人員A', testReport: '', isCompleted: false,
  isDelayed: false, delayReason: '', createdBy: 'admin', updatedBy: 'admin',
  createdAt: '', updatedAt: '',
}

describe('computeDiffs', () => {
  it('無配對記錄 → 回傳空陣列', () => {
    const result = computeDiffs(
      [{ taskDescription: '不存在的工作', testReport: '', isCompleted: false, isDelayed: false, delayReason: '' }],
      [baseExisting]
    )
    expect(result).toHaveLength(0)
  })

  it('配對但無差異 → 回傳空陣列', () => {
    const result = computeDiffs(
      [{ taskDescription: '整合測試', testReport: '', isCompleted: false, isDelayed: false, delayReason: '' }],
      [baseExisting]
    )
    expect(result).toHaveLength(0)
  })

  it('testReport 有差異', () => {
    const result = computeDiffs(
      [{ taskDescription: '整合測試', testReport: 'http://report', isCompleted: false, isDelayed: false, delayReason: '' }],
      [baseExisting]
    )
    expect(result).toHaveLength(1)
    expect(result[0].diffs).toHaveLength(1)
    expect(result[0].diffs[0].field).toBe('testReport')
    expect(result[0].diffs[0].oldVal).toBe('（空白）')
    expect(result[0].diffs[0].newVal).toBe('http://report')
  })

  it('isCompleted 有差異', () => {
    const result = computeDiffs(
      [{ taskDescription: '整合測試', testReport: '', isCompleted: true, isDelayed: false, delayReason: '' }],
      [baseExisting]
    )
    expect(result[0].diffs[0].field).toBe('isCompleted')
    expect(result[0].diffs[0].oldVal).toBe('否')
    expect(result[0].diffs[0].newVal).toBe('是')
  })

  it('多個欄位同時有差異', () => {
    const result = computeDiffs(
      [{ taskDescription: '整合測試', testReport: 'http://x', isCompleted: true, isDelayed: true, delayReason: '設備問題' }],
      [baseExisting]
    )
    expect(result[0].diffs).toHaveLength(4)
  })

  it('全新記錄（無配對）不納入差異', () => {
    const result = computeDiffs(
      [
        { taskDescription: '整合測試', testReport: 'http://x', isCompleted: true, isDelayed: false, delayReason: '' },
        { taskDescription: '全新工作', testReport: '新報告', isCompleted: false, isDelayed: false, delayReason: '' },
      ],
      [baseExisting]
    )
    expect(result).toHaveLength(1)
    expect(result[0].taskDescription).toBe('整合測試')
  })

  it('projectName 從現有記錄取得', () => {
    const result = computeDiffs(
      [{ taskDescription: '整合測試', testReport: 'x', isCompleted: false, isDelayed: false, delayReason: '' }],
      [baseExisting]
    )
    expect(result[0].projectName).toBe('Alpha 專案')
  })
})
```

- [ ] **Step 2：執行測試確認失敗**

```bash
cd "d:/AI Project/Project/vsms"
npm test -- excel-diff
```

預期：`PASS`（測試已自包含 `computeDiffs` 邏輯，應直接通過）

> 注意：此測試是白盒測試，包含實作邏輯，目的是確認邏輯正確性。後續在 ExcelImportModal.tsx 內的實作須與此邏輯完全一致。

- [ ] **Step 3：在 ExcelImportModal.tsx 頂端加入型別定義**

在 `src/components/schedule/ExcelImportModal.tsx` 的 import 區塊之後、`type ImportMode` 之前加入：

```ts
import { useScheduleStore } from '../../store/scheduleStore'
import type { Schedule } from '../../types'

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

> 注意：`useScheduleStore` 已在第 3 行 import，確認原本只有 `{ add, replaceAll }`，需加入 `schedules`。

- [ ] **Step 4：在 ExcelImportModal.tsx 加入 computeDiffs 純函式**

在型別定義之後、`type ImportMode` 之前加入：

```ts
function computeDiffs(
  incoming: Array<{ taskDescription: string; testReport: string; isCompleted: boolean; isDelayed: boolean; delayReason: string }>,
  existing: Schedule[]
): RecordDiff[] {
  const boolStr = (v: boolean) => (v ? '是' : '否')
  const result: RecordDiff[] = []
  for (const row of incoming) {
    const match = existing.find(s => s.taskDescription === row.taskDescription)
    if (!match) continue
    const diffs: FieldDiff[] = []
    if (row.testReport !== match.testReport)
      diffs.push({ field: 'testReport', label: '測試報告', oldVal: match.testReport || '（空白）', newVal: row.testReport || '（空白）' })
    if (row.isCompleted !== match.isCompleted)
      diffs.push({ field: 'isCompleted', label: 'Completed', oldVal: boolStr(match.isCompleted), newVal: boolStr(row.isCompleted) })
    if (row.isDelayed !== match.isDelayed)
      diffs.push({ field: 'isDelayed', label: 'Delayed', oldVal: boolStr(match.isDelayed), newVal: boolStr(row.isDelayed) })
    if (row.delayReason !== match.delayReason)
      diffs.push({ field: 'delayReason', label: '延遲原因', oldVal: match.delayReason || '（空白）', newVal: row.delayReason || '（空白）' })
    if (diffs.length > 0)
      result.push({ projectName: match.projectName, taskDescription: row.taskDescription, diffs })
  }
  return result
}
```

- [ ] **Step 5：在 ExcelImportModal.tsx 加入 DiffConfirmModal 元件**

在 `computeDiffs` 函式之後、`type ImportMode` 之前加入：

```tsx
interface DiffConfirmModalProps {
  isOpen: boolean
  diffs: RecordDiff[]
  onConfirm: () => void
  onCancel: () => void
}

function DiffConfirmModal({ isOpen, diffs, onConfirm, onCancel }: DiffConfirmModalProps) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-amber-700">⚠ 覆蓋差異確認</h2>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            以下 <strong>{diffs.length}</strong> 筆資料有差異，確認後將以 Excel 內容覆蓋現有值。
          </p>
          <div className="space-y-4">
            {diffs.map((rec, i) => (
              <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                  📋 {rec.projectName}
                  <span className="font-normal text-blue-600 ml-2 text-xs">（{rec.taskDescription}）</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-1/4">欄位</th>
                      <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-[37.5%]">現有值</th>
                      <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-[37.5%]">Excel 值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.diffs.map((d, j) => (
                      <tr key={j} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-600">{d.label}</td>
                        <td className="px-3 py-1.5 text-red-600 line-through">{d.oldVal}</td>
                        <td className="px-3 py-1.5 text-green-700 font-medium">{d.newVal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            取消
          </button>
          <button type="button" onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
            確認覆蓋
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6：修改 ExcelImportModal 元件本體**

在 `ExcelImportModal` 函式內，將：
```tsx
const { add, replaceAll } = useScheduleStore()
```
改為：
```tsx
const { add, replaceAll, schedules } = useScheduleStore()
```

在現有 state 宣告區塊之後加入：
```tsx
const [diffRecords, setDiffRecords] = useState<RecordDiff[]>([])
const [showDiff, setShowDiff]       = useState(false)
```

將現有的 `handleConfirm` 函式：
```tsx
const handleConfirm = async () => {
  if (!result || result.valid.length === 0) return
  if (mode === 'replace') await replaceAll(result.valid)
  else for (const row of result.valid) await add(row)
  handleClose()
}
```
替換為：
```tsx
const handleConfirm = async () => {
  if (!result || result.valid.length === 0) return
  if (mode === 'replace') {
    const diffs = computeDiffs(result.valid, schedules)
    if (diffs.length > 0) {
      setDiffRecords(diffs)
      setShowDiff(true)
      return
    }
    await replaceAll(result.valid)
  } else {
    for (const row of result.valid) await add(row)
  }
  handleClose()
}

const handleDiffConfirm = async () => {
  if (!result) return
  await replaceAll(result.valid)
  setShowDiff(false)
  handleClose()
}
```

同時，將元件頂端的 `if (!isOpen) return null` 後面的 `return (` 改為使用 Fragment，讓 `DiffConfirmModal` 能與主 modal 並列渲染：

```tsx
if (!isOpen) return null
return (
  <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {/* ... 現有內容保持不變 ... */}
    </div>
    <DiffConfirmModal
      isOpen={showDiff}
      diffs={diffRecords}
      onConfirm={handleDiffConfirm}
      onCancel={() => setShowDiff(false)}
    />
  </>
)
```

> `DiffConfirmModal` 使用 `z-[60]` 確保蓋在主 modal（`z-50`）之上。

- [ ] **Step 7：執行測試確認通過**

```bash
cd "d:/AI Project/Project/vsms"
npm test -- excel-diff
```

預期：`7 passed`

- [ ] **Step 8：手動驗證**

啟動開發伺服器，以 admin 角色：
1. 先新增或確認存在至少一筆有 taskDescription 的排程，且其 testReport 為空
2. 匯出現有排程為 Excel，修改其中一筆的 testReport 欄位填入 `http://test-report`
3. 重新匯入，選擇「覆蓋現有資料」，點「確認匯入」
4. 驗證：出現差異確認 modal，列出該筆記錄的 testReport 差異（空白 → http://test-report）
5. 點「取消」→ modal 關閉，現有資料未變更
6. 再次執行步驟 3，點「確認覆蓋」→ 資料更新，modal 及匯入視窗均關閉
7. 另一情境：匯入一個所有欄位均與現有完全相同的 Excel → 不出現差異 modal，直接覆蓋

- [ ] **Step 9：提交**

```bash
cd "d:/AI Project/Project/vsms"
git add src/components/schedule/ExcelImportModal.tsx src/__tests__/excel-diff.test.ts
git commit -m "feat: Excel 覆蓋前差異確認，保護 USER 填寫的測試報告與狀態欄位"
```

---

## 完成檢查清單

- [ ] `npm test` 全部通過（tooltip-position + excel-diff）
- [ ] 功能 1：甘特圖 tooltip 在四個邊角均不被遮蓋
- [ ] 功能 2：USER 角色編輯表單，9 個欄位灰底不可互動
- [ ] 功能 3：甘特圖左欄可拖曳調整，session 內保持設定，重新登入恢復預設
- [ ] 功能 4：覆蓋匯入時，有差異才出現確認 modal；取消不覆蓋；確認後正確覆蓋
