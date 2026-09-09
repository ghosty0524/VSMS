# 匯出改成獨立視窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 工具列的「匯出」不再是會被容器裁掉的下拉選單，而是與「匯入」相同的全螢幕視窗，先選類型再（視類型）選單位。

**Architecture:** 新元件 `ExportModal` 取代 `ExportExcelModal`，內含類型選擇與單位勾選兩層；`ScheduleToolbar` 只負責開關視窗並提供兩個匯出回呼，既有的 `exportSchedules` / `handleExportDashboard` 邏輯不動。純前端，不動 server。

**Tech Stack:** React 19、Tailwind v4、lucide-react、vite。

## Global Constraints

- **設計文件**：`docs/superpowers/specs/2026-09-09-export-modal-people-tab-pdn-check-design.md` 第一節。有衝突以設計文件為準。
- **不得執行 `npm run build` 或 `npx vite build`** — `dist/` 由正式常駐程序（port 3001）即時從磁碟服務，build 等於部署。驗證用 vite dev server。
- **不得動 port 3001 的常駐程序。**
- **前端既有 9 個 `tsc` 型別錯誤**（`App.tsx`、`ScheduleFormModal.tsx`、`GanttChart.tsx`、`LoadSection.tsx`、`RestDaysManager.tsx`、`main.tsx`、`excel-diff.test.ts`）。不要順手修，也不要新增任何一個。型別檢查指令：`npx tsc -p tsconfig.app.json --noEmit`，比對錯誤數量是否仍為 9。
- **前端測試**：`npx vitest run`。目前全綠（189 項以上，實際數字以執行為準）。
- **不給預設值**：匯出視窗未選類型時確認鈕 disabled，與匯入視窗「請先選擇匯入方式」同一原則。
- **commit 訊息英文**，結尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。直接 commit 到目前分支 `feat/guest-role-and-uiux`，不另開分支，不推 GitHub。
- 專案根目錄 `F:\vsms\vsms-export`。所有指令在此執行。

---

### Task 1: 建立 ExportModal 元件

**Files:**
- Create: `src/components/schedule/ExportModal.tsx`
- Reference（只讀，之後 Task 2 會刪）: `src/components/schedule/ExportExcelModal.tsx`

**Interfaces:**
- Consumes: `useEscapeKey(isOpen, onClose)` from `src/components/shared/useEscapeKey.ts`
- Produces:
  ```ts
  export type ExportKind = 'excel' | 'dashboard'
  export function ExportModal(props: {
    isOpen: boolean
    allUnits: string[]
    onExportExcel: (selectedUnits: string[]) => void   // selectedUnits 為空陣列 = 全部
    onExportDashboard: () => Promise<void>
    onClose: () => void
  }): JSX.Element | null
  ```

- [ ] **Step 1: 建立元件檔**

寫入 `src/components/schedule/ExportModal.tsx`：

```tsx
// src/components/schedule/ExportModal.tsx
//
// 匯出改成獨立視窗。改版前是掛在工具列裡的 absolute 下拉選單，被工具列的
// overflow-x-auto（CSS：一軸非 visible，另一軸跟著裁切）與 GanttChart 的
// overflow-hidden 兩層裁掉；z-index 對 overflow 裁切無效。
//
// 與匯入視窗同一個原則：不給預設類型，未選時確認鈕 disabled。
import { useState, useMemo, useEffect } from 'react'
import { Check, FileSpreadsheet, LayoutList, X } from 'lucide-react'
import { useEscapeKey } from '../shared/useEscapeKey'

export type ExportKind = 'excel' | 'dashboard'

interface Props {
  isOpen: boolean
  allUnits: string[]
  onExportExcel: (selectedUnits: string[]) => void
  onExportDashboard: () => Promise<void>
  onClose: () => void
}

export function ExportModal({ isOpen, allUnits, onExportExcel, onExportDashboard, onClose }: Props) {
  useEscapeKey(isOpen, onClose)
  const [kind, setKind] = useState<ExportKind | null>(null)
  // 空陣列 = 不過濾（全部單位），語意與舊 ExportExcelModal 相同
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const sortedUnits = useMemo(() => [...allUnits].sort(), [allUnits])

  // 每次開啟都回到「未選類型、全部單位」
  useEffect(() => {
    if (isOpen) { setKind(null); setSelected([]); setBusy(false) }
  }, [isOpen])

  const isAllSelected = selected.length === 0 || selected.length === sortedUnits.length

  const toggleUnit = (unit: string) => {
    if (selected.length === 0) {
      // 目前是「全選狀態」：先展開為全選再取消該項
      setSelected(sortedUnits.filter(u => u !== unit))
    } else {
      setSelected(prev => prev.includes(unit) ? prev.filter(u => u !== unit) : [...prev, unit])
    }
  }

  const handleConfirm = async () => {
    if (kind === 'excel') { onExportExcel(selected); onClose(); return }
    if (kind === 'dashboard') {
      setBusy(true)
      try { await onExportDashboard() } finally { setBusy(false); onClose() }
    }
  }

  if (!isOpen) return null

  const cardCls = (active: boolean) =>
    `flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-colors
     ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`

  return (
    <>
      {/* 背景遮罩 */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm pointer-events-auto">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">匯出</h3>
            <button type="button" aria-label="關閉" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-gray-500">選擇匯出類型。</p>

            <button type="button" onClick={() => setKind('excel')} aria-pressed={kind === 'excel'}
              className={cardCls(kind === 'excel')}>
              <FileSpreadsheet size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-gray-800">排程 Excel</span>
                <span className="block text-xs text-gray-500">可選擇要匯出的測試單位</span>
              </span>
            </button>

            <button type="button" onClick={() => setKind('dashboard')} aria-pressed={kind === 'dashboard'}
              className={cardCls(kind === 'dashboard')}>
              <LayoutList size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-gray-800">Dashboard + Agent Excel</span>
                <span className="block text-xs text-gray-500">同時產生 Agent Excel 供上傳 SharePoint</span>
              </span>
            </button>

            {kind === 'excel' && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">選擇要匯出的測試單位，不選則匯出全部。</p>

                <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer mb-1">
                  <input type="checkbox" checked={isAllSelected} onChange={() => setSelected([])}
                    className="w-3.5 h-3.5 rounded accent-blue-600" />
                  <span className="text-xs font-medium text-gray-700">全部單位</span>
                  <span className="ml-auto text-xs text-gray-400">({sortedUnits.length} 個單位)</span>
                </label>

                <div className="border-t border-gray-100 my-2" />

                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  {sortedUnits.map(unit => (
                    <label key={unit} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selected.length === 0 || selected.includes(unit)}
                        onChange={() => toggleUnit(unit)} className="w-3.5 h-3.5 rounded accent-blue-600" />
                      <span className="text-xs text-gray-700">{unit}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-3 px-2 py-1.5 bg-blue-50 rounded-lg">
                  <p className="flex items-start gap-1.5 text-xs text-blue-700">
                    <Check size={13} className="flex-shrink-0 mt-0.5" />
                    <span>
                      {selected.length === 0
                        ? `匯出全部 ${sortedUnits.length} 個單位的資料`
                        : `匯出已選 ${selected.length} 個單位：${selected.join('、')}`}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
              取消
            </button>
            <button type="button" onClick={handleConfirm} disabled={kind === null || busy}
              className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700
                         disabled:bg-gray-300 disabled:cursor-not-allowed">
              {kind === null ? '請先選擇匯出類型' : busy ? '匯出中…' : '確認匯出'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `9`（既有數量，未新增）

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/ExportModal.tsx
git commit -m "feat(ui): add ExportModal with type selection and unit picker

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 工具列改用 ExportModal，刪除下拉與舊視窗

**Files:**
- Modify: `src/components/schedule/ScheduleToolbar.tsx:16-20`（import）、`:85-98`（state 與外部點擊）、`:104-114`（`handleExportDashboard`）、`:149-182`（下拉 JSX）、`:314-320`（Modal 渲染）
- Delete: `src/components/schedule/ExportExcelModal.tsx`

**Interfaces:**
- Consumes: `ExportModal` from Task 1；既有 `exportSchedules(schedules, selectedUnits)`（`src/lib/excel.ts:141`）、`generateAgentExcel`、`generateDashboardHTML`、`toast`
- Produces: 無（元件內部）

- [ ] **Step 1: 改 import**

把 `src/components/schedule/ScheduleToolbar.tsx` 第 16–20 行：

```tsx
import { useState, useRef, useEffect } from 'react'
import {
  Upload, Download, FileSpreadsheet, Plus, ChevronDown,
  ClipboardCopy, Maximize2, Minimize2, LayoutList,
} from 'lucide-react'
```

改為：

```tsx
import { useState } from 'react'
import {
  Upload, Download, FileSpreadsheet, Plus,
  ClipboardCopy, Maximize2, Minimize2,
} from 'lucide-react'
```

並把 `import { ExportExcelModal } from './ExportExcelModal'` 改為 `import { ExportModal } from './ExportModal'`。

（先 grep 確認：`grep -n "useRef\|useEffect\|ChevronDown\|LayoutList" src/components/schedule/ScheduleToolbar.tsx` 應只出現在要刪除的區塊；若還有其他用途，保留該 import。）

- [ ] **Step 2: 改 state，刪外部點擊 effect**

把第 85–98 行：

```tsx
  const [showImport, setShowImport] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showExportExcelModal, setShowExportExcelModal] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])
```

改為：

```tsx
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
```

- [ ] **Step 3: `handleExportDashboard` 拿掉關選單那行**

把：

```tsx
  const handleExportDashboard = async () => {
    setShowExportMenu(false)
    const html = generateDashboardHTML(schedules, options)
```

改為：

```tsx
  const handleExportDashboard = async () => {
    const html = generateDashboardHTML(schedules, options)
```

- [ ] **Step 4: 下拉 JSX 換成單一按鈕**

把第 149–182 行整個 `<div className="relative flex-shrink-0" ref={exportRef}> … </div>` 區塊（從 `<div className="relative flex-shrink-0" ref={exportRef}>` 到對應的 `</div>`，含 `{showExportMenu && (...)}`）改為：

```tsx
            <button type="button" onClick={() => setShowExport(true)} title="匯出排程或 Dashboard" className={BTN}>
              <Download size={13} />
              匯出
            </button>
```

- [ ] **Step 5: Modal 渲染換成 ExportModal**

把檔尾：

```tsx
      <ExportExcelModal
        isOpen={showExportExcelModal}
        allUnits={allUnitLabels}
        onConfirm={selectedUnits => exportSchedules(schedules, selectedUnits)}
        onClose={() => setShowExportExcelModal(false)}
      />
```

改為：

```tsx
      <ExportModal
        isOpen={showExport}
        allUnits={allUnitLabels}
        onExportExcel={selectedUnits => exportSchedules(schedules, selectedUnits)}
        onExportDashboard={handleExportDashboard}
        onClose={() => setShowExport(false)}
      />
```

- [ ] **Step 6: 刪除舊元件**

```bash
git rm src/components/schedule/ExportExcelModal.tsx
grep -rn "ExportExcelModal" src
```

Expected: grep 無輸出。

- [ ] **Step 7: 型別檢查與測試**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `9`

Run: `npx vitest run`
Expected: 全部 PASS，數量與改動前相同。

- [ ] **Step 8: Commit**

```bash
git add src/components/schedule/ScheduleToolbar.tsx
git commit -m "feat(ui): open export in a modal instead of a clipped dropdown

The dropdown was absolutely positioned inside the toolbar, whose
overflow-x-auto (added for narrow screens) also clips the y axis, and
GanttChart wraps it in overflow-hidden. Replace it with a modal that
mirrors the import flow: pick a type, then units for the Excel export.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 實機驗證

**Files:** 無變更。

- [ ] **Step 1: 起 dev server**

用 Browser pane 的 `preview_start`，設定名稱 `vsms-harness`（`F:\.claude\launch.json`，vite 5175 綁 127.0.0.1）。若要看到 admin 視角的工具列，依 memory `vsms-ui-review-2026-09` 的作法用 `_dev-admin.html?role=super_admin` harness；驗完刪除 `_dev-*` 檔。

- [ ] **Step 2: 檢查三件事**

1. 1440 寬：按「匯出」出現置中視窗，兩張類型卡都看得到，確認鈕顯示「請先選擇匯出類型」且 disabled。
2. 選「排程 Excel」：單位勾選展開，取消一個單位後提示變成「匯出已選 N 個單位：…」。
3. 用 `resize_window` 切到 375 寬：視窗仍完整可見、不被裁切。

截圖一張 1440 寬的展開狀態留存。

- [ ] **Step 3: 型別與測試最後確認**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` → `9`
Run: `npx vitest run` → 全 PASS

（本 task 無 commit。部署見 spec「部署順序」：`xcopy /E /I /Y dist dist.stable-<日期>` 後 `npx vite build`，由使用者決定時間。）
