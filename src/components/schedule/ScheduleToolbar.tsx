// src/components/schedule/ScheduleToolbar.tsx
//
// 主畫面的單一工具列，取代改版前的三列：
//   1. 標題列上排右側的「新增排程／匯入／匯出／範本」
//   2. 圖例列（四個單位色塊 + 超出時間資源 + 一句文字說明）
//   3. 甘特圖控制列（甘特圖／列表、按工程師／按設備、複製表格、全螢幕）
//
// 兩個關鍵決定：
//
// 排程操作按鈕搬離標題列。它們全部只跟排程資料有關，放在全域標題列會造成
// 「切到統計頁時新增排程消失、但匯入還在」這種位置不穩定的觀感。
//
// 單位色塊改成可點擊的篩選，並同時保留圖例功能。色塊本來就帶單位色，
// 點下去就是篩選那個單位，因此不需要另外一列圖例，也不需要那句
// 「外框為測試單位，內裡為測試人員」——改放進 title。
//
// 2026-09（UI 統一第 3 項 C）：工具列在 1440px 寬時剛好塞滿，再窄就要橫向捲動。
// 匯入、匯出、下載範本、複製表格都是低頻動作，收進右側的「更多」；主要動作
// 「新增排程」移到最右邊，全螢幕只留圖示。條件列與工具列維持兩排（使用者選定）。
import { useState } from 'react'
import {
  Upload, Download, FileSpreadsheet, Plus,
  ClipboardCopy, Maximize2, Minimize2,
} from 'lucide-react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { generateDashboardHTML } from '../../lib/export'
import { downloadTemplate, exportSchedules, generateAgentExcel } from '../../lib/excel'
import { resolveUnitColor, readableTextColor } from '../../lib/colors'
import { toast } from '../../store/toastStore'
import { SegmentedControl } from '../shared/SegmentedControl'
import { MenuButton, type MenuItem } from '../shared/MenuButton'
import { ExcelImportModal } from './ExcelImportModal'
import { ExportModal } from './ExportModal'
import { OVERFLOW_COLOR } from '../../constants'
import type { Role } from '../../types'
import type { FilterSortState } from './FilterSortBar'

async function saveDashboardHTML(html: string): Promise<void> {
  const name = `dashboard_${new Date().toISOString().slice(0, 10)}.html`
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as Window & typeof globalThis & {
        showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>
      }).showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'HTML File', accept: { 'text/html': ['.html'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(html)
      await writable.close()
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  role: Role | null
  viewMode: 'gantt' | 'list'
  onViewModeChange: (v: 'gantt' | 'list') => void
  groupBy: 'engineer' | 'device'
  onGroupByChange: (v: 'engineer' | 'device') => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onCopyList: () => void
  onAddSchedule: () => void
  filterSort: FilterSortState
  onFilterChange: (v: FilterSortState) => void
}

const BTN = `flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-medium
             rounded-md border border-slate-300 bg-white text-slate-600
             shadow-xs active:shadow-none
             hover:bg-slate-50 transition-colors`

export function ScheduleToolbar({
  role, viewMode, onViewModeChange, groupBy, onGroupByChange,
  isFullscreen, onToggleFullscreen, onCopyList, onAddSchedule,
  filterSort, onFilterChange,
}: Props) {
  const { schedules } = useScheduleStore()
  const { options } = useOptionsStore()
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const canWrite = role === 'super_admin' || role === 'admin'
  const activeUnits = (options.testUnits ?? []).filter(u => u.isActive)
  const allUnitLabels = (options.testUnits ?? []).map(u => u.label).sort()

  const handleExportDashboard = async () => {
    const html = generateDashboardHTML(schedules, options)
    await saveDashboardHTML(html)
    try {
      await generateAgentExcel(schedules)
      toast.success('Dashboard 與 Agent Excel 已匯出。請將 Excel 上傳至 SharePoint。', 6000)
    } catch (err) {
      toast.error(`Dashboard 已匯出，但 Agent Excel 產生失敗：${String(err)}`)
    }
  }

  const toggleUnit = (unitValue: string) => {
    const cur = filterSort.testUnits
    const next = cur.includes(unitValue)
      ? cur.filter(u => u !== unitValue)
      : [...cur, unitValue]
    // 換單位時清掉人員篩選，否則會留下屬於別的單位、永遠篩不到東西的人名
    onFilterChange({ ...filterSort, testUnits: next, testEngineers: [] })
  }

  const fullscreenLabel = isFullscreen ? '離開全螢幕（Esc）' : '全螢幕檢視'

  // 順序固定：匯入、匯出、範本、複製表格。沒有任何項目時 MenuButton 不渲染。
  const moreItems: MenuItem[] = [
    ...(canWrite ? [
      { key: 'import', label: '匯入排程…', icon: <Upload size={13} />, title: '從 Excel 匯入排程', onSelect: () => setShowImport(true) },
      { key: 'export', label: '匯出…', icon: <Download size={13} />, title: '匯出排程或 Dashboard', onSelect: () => setShowExport(true) },
      { key: 'template', label: '下載匯入範本', icon: <FileSpreadsheet size={13} />, title: '下載 Excel 匯入範本', onSelect: downloadTemplate },
    ] : []),
    ...(viewMode === 'list' ? [
      { key: 'copy', label: '複製表格', icon: <ClipboardCopy size={13} />, title: '複製目前篩選結果的完整列表（可貼到 Excel、Word 或 Outlook）', onSelect: onCopyList },
    ] : []),
  ]

  return (
    <>
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2
                      overflow-x-auto whitespace-nowrap
                      bg-slate-50 border-b border-slate-200">

        {/* ── 視圖 ── */}
        {/* 測試人員登入後預設只看自己的排程。這件事重要到不該埋在要展開才
            看得到的篩選面板裡（改版前是面板中一顆 👁 按鈕），改成常駐可見。 */}
        {role === 'user' && (
          <>
            <SegmentedControl
              ariaLabel="排程範圍"
              value={filterSort.showAllUnits ? 'all' : 'mine'}
              onChange={v => onFilterChange({ ...filterSort, showAllUnits: v === 'all' })}
              options={[
                { value: 'mine', label: '我的排程' },
                { value: 'all',  label: '全部' },
              ]}
            />
            <div className="w-px h-5 bg-slate-300 flex-shrink-0" />
          </>
        )}

        <SegmentedControl
          ariaLabel="顯示方式"
          value={viewMode}
          onChange={onViewModeChange}
          options={[
            { value: 'gantt', label: '甘特圖' },
            { value: 'list',  label: '列表' },
          ]}
        />
        {viewMode === 'gantt' && (
          <SegmentedControl
            ariaLabel="分組方式"
            value={groupBy}
            onChange={onGroupByChange}
            options={[
              { value: 'engineer', label: '按工程師' },
              { value: 'device',   label: '按設備' },
            ]}
          />
        )}

        <div className="w-px h-5 bg-slate-300 flex-shrink-0" />

        {/* ── 單位快速篩選（同時就是圖例）── */}
        <div
          className="flex flex-shrink-0 items-center gap-1.5"
          title="點擊即可只看該單位。甘特圖上 bar 的外框是測試單位色，內裡是測試人員色。"
        >
          {activeUnits.map(u => {
            const color = resolveUnitColor(u.value, options)
            const on = filterSort.testUnits.includes(u.value)
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleUnit(u.value)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                           border transition-colors"
                style={on
                  ? { background: color, borderColor: color, color: readableTextColor(color) }
                  : { background: '#fff', borderColor: '#D6DBE3', color: '#4B5666' }}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={on
                    ? { background: readableTextColor(color), opacity: .85 }
                    : { border: `2px solid ${color}` }}
                />
                {u.label}
              </button>
            )
          })}
          {filterSort.testUnits.length > 0 && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filterSort, testUnits: [], testEngineers: [] })}
              className="px-2 py-1 rounded-md text-xs text-slate-500 hover:text-blue-700 hover:underline"
            >
              全部單位
            </button>
          )}
          <span
            className="inline-block w-3 h-3 rounded-sm flex-shrink-0 ml-1"
            style={{ background: OVERFLOW_COLOR }}
            title="bar 上的淺綠段代表實際天數已超出設定的時間資源"
          />
        </div>

        {/* 日期範圍不在這裡顯示。它是一個篩選條件，位置在上方的條件列，
            工具列再放一份只會讓同一件事在畫面上出現兩次。 */}

        {/* ── 右側工具：全螢幕、更多、主要動作 ── */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2 pl-2">
          <button
            type="button"
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            onClick={onToggleFullscreen}
            className="flex flex-shrink-0 items-center justify-center w-8 h-8
                       rounded-md border border-slate-300 bg-white text-slate-600
                       hover:bg-slate-50 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <MenuButton label="更多" items={moreItems} className={BTN} />

          {canWrite && (
            <button
              type="button"
              onClick={onAddSchedule}
              className="flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                         rounded-md bg-stone-900 text-white hover:bg-stone-800
                         transition-colors active:scale-95"
            >
              <Plus size={14} strokeWidth={2.5} />
              新增排程
            </button>
          )}
        </div>
      </div>

      <ExcelImportModal isOpen={showImport} onClose={() => setShowImport(false)} />
      <ExportModal
        isOpen={showExport}
        allUnits={allUnitLabels}
        onExportExcel={selectedUnits => exportSchedules(schedules, selectedUnits)}
        onExportDashboard={handleExportDashboard}
        onClose={() => setShowExport(false)}
      />
    </>
  )
}
