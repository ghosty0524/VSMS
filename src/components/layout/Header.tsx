import { useState, useMemo, useRef, useEffect } from 'react'
import {
  LayoutList, BarChart2, Settings, ClipboardList,
  Upload, Download, FileSpreadsheet, Plus, LogOut,
  ChevronDown
} from 'lucide-react'
import { toast } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { generateDashboardHTML } from '../../lib/export'
import { downloadTemplate, exportSchedules, generateAgentExcel } from '../../lib/excel'
import { ExcelImportModal } from '../schedule/ExcelImportModal'
import { ExportExcelModal } from '../schedule/ExportExcelModal'
import type { Role, View } from '../../types'

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  onAddSchedule: () => void
  role: Role | null
}

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

const NAV_TABS: {
  key: View
  label: string
  icon: React.ReactNode
  superAdminOnly?: boolean
  userHidden?: boolean
}[] = [
  { key: 'main',      label: '排程管理',   icon: <LayoutList    size={15} /> },
  { key: 'analytics', label: '統計分析',   icon: <BarChart2     size={15} />, userHidden: true },
  { key: 'settings',  label: '系統設定',   icon: <Settings      size={15} />, userHidden: true },
  { key: 'audit',     label: '審計紀錄',   icon: <ClipboardList size={15} />, superAdminOnly: true },
]

export function Header({ currentView, onNavigate, onAddSchedule, role }: Props) {
  const { logout, displayName } = useAuthStore()
  const { schedules } = useScheduleStore()
  const { options } = useOptionsStore()
  const [showImport, setShowImport]                     = useState(false)
  const [showExportMenu, setShowExportMenu]             = useState(false)
  const [showExportExcelModal, setShowExportExcelModal] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // 通知改走全站共用佇列（store/toastStore.ts）。error 與 loading 不自動消失
  // 的既有規則保留在 store 裡。

  // ── 點擊外部關閉選單 ──────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])

  const allUnits = useMemo(
    () => (options.testUnits ?? []).map(u => u.label).sort(),
    [options.testUnits]
  )

  // ── 匯出 Dashboard + Agent Excel（皆儲存至本機）─────────
  const handleExportDashboard = async () => {
    setShowExportMenu(false)

    // Step 1：產生並儲存 dashboard.html
    const html = generateDashboardHTML(schedules, options)
    await saveDashboardHTML(html)

    // Step 2：Agent Excel（generateAgentExcel 內部直接下載，回傳 void）
    try {
      await generateAgentExcel(schedules)
      toast.success('Dashboard 與 Agent Excel 已匯出。請將 Excel 上傳至 SharePoint。', 6000)
    } catch (err) {
      toast.error(`Dashboard 已匯出，但 Agent Excel 產生失敗：${String(err)}`)
    }
  }

  const handleExportSchedules = () => {
    setShowExportMenu(false)
    setShowExportExcelModal(true)
  }

  // 寫入權限：guest 唯讀、user 僅能改自己的排程，兩者皆無 Header 寫入操作
  const canWrite = role === 'super_admin' || role === 'admin'

  const visibleTabs = NAV_TABS.filter(tab => {
    if (tab.superAdminOnly && role !== 'super_admin') return false
    if (tab.userHidden && (role === 'user' || role === 'guest')) return false
    return true
  })

  return (
    <>
      <header className="bg-slate-800 shadow-md flex-shrink-0">

        {/* ── 上排：Logo + 操作按鈕 ── */}
        <div className="px-5 py-3 flex items-center justify-between gap-3 whitespace-nowrap">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center
                            justify-center shadow-sm">
              <svg className="w-4.5 h-4.5 text-white" fill="none"
                   stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2
                     0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2
                     2 0 012 2" />
              </svg>
            </div>
            <span className="text-base font-bold text-white tracking-wide">VSMS</span>
          </div>

          {/* 操作按鈕群組 */}
          <div className="flex items-center gap-2">

            {/* 新增排程 */}
            {currentView === 'main' && canWrite && (
              <button
                type="button"
                onClick={onAddSchedule}
                title="新增排程"
                className="flex flex-shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-semibold
                           bg-blue-500 hover:bg-blue-400 text-white rounded-lg
                           shadow-sm transition-all duration-150 active:scale-95"
              >
                <Plus size={15} strokeWidth={2.5} />
                {/* 窄畫面只留圖示。四顆操作按鈕加使用者資訊在 375px 下放不進一列，
                    硬擠會讓中文標籤逐字直排。標籤都有 title 可補說明。
                    第二階段會把這些按鈕搬到主畫面工具列，屆時可再檢討。 */}
                <span className="hidden sm:block">新增排程</span>
              </button>
            )}

            {/* 匯入 */}
            {canWrite && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              title="匯入 Excel"
              className="flex flex-shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium
                         bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg
                         border border-slate-600 transition-all duration-150"
            >
              <Upload size={14} />
              <span className="hidden sm:block">匯入</span>
            </button>
            )}

            {/* 匯出下拉 */}
            {canWrite && (
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu(o => !o)}
                title="匯出"
                className="flex flex-shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium
                           bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg
                           border border-slate-600 transition-all duration-150"
              >
                <Download size={14} />
                <span className="hidden sm:block">匯出</span>
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200
                              ${showExportMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1.5
                                bg-white border border-gray-200 rounded-xl
                                shadow-xl z-50 min-w-[195px] overflow-hidden">

                  {/* 匯出排程 Excel */}
                  <button
                    type="button"
                    onClick={handleExportSchedules}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700
                               hover:bg-blue-50 hover:text-blue-700
                               flex items-center gap-2.5 transition-colors"
                  >
                    <FileSpreadsheet size={15} className="text-green-600" />
                    匯出排程 Excel
                  </button>

                  <div className="border-t border-gray-100" />

                  {/* 匯出 Dashboard + Agent Excel */}
                  <button
                    type="button"
                    onClick={handleExportDashboard}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700
                               hover:bg-blue-50 hover:text-blue-700
                               flex items-center gap-2.5 transition-colors"
                  >
                    <LayoutList size={15} className="text-blue-600" />
                    匯出 Dashboard
                  </button>

                  {/* 說明文字 */}
                  <div className="px-4 py-2 text-xs text-slate-400 bg-slate-50
                                  border-t border-gray-100">
                    同時產生 Agent Excel 供上傳 SharePoint
                  </div>
                </div>
              )}
            </div>
            )}

            {/* 下載範本 */}
            {canWrite && (
            <button
              type="button"
              onClick={downloadTemplate}
              title="下載 Excel 範本"
              className="flex items-center justify-center w-9 h-9
                         bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg
                         border border-slate-600 transition-all duration-150"
            >
              <FileSpreadsheet size={15} />
            </button>
            )}

            <div className="w-px h-6 bg-slate-600 mx-1" />

            {/* 使用者資訊 + 登出 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-slate-200 font-medium hidden sm:block">
                  {displayName}
                </span>
                {/* 角色徽章：原本是實色底加白字（purple-500 / green-500 /
                    amber-500），對比只有 2.1～3.4:1，全部不到 AA 的 4.5:1。
                    改為淡底深字，對比拉到 7:1 以上，在深色 Header 上也更安靜。
                    三顆都補上 title，之前只有訪客那顆有。 */}
                {role === 'super_admin' && (
                  <span title="超級管理者"
                        className="px-1.5 py-0.5 text-xs font-bold
                                   bg-purple-100 text-purple-800 rounded-md leading-tight">
                    SA
                  </span>
                )}
                {role === 'user' && (
                  <span title="測試人員"
                        className="px-1.5 py-0.5 text-xs font-bold
                                   bg-emerald-100 text-emerald-800 rounded-md leading-tight">
                    U
                  </span>
                )}
                {role === 'guest' && (
                  <span title="訪客（唯讀）"
                        className="px-1.5 py-0.5 text-xs font-bold
                                   bg-amber-100 text-amber-800 rounded-md leading-tight">
                    G
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={logout}
                title="登出"
                className="flex items-center gap-1 px-2.5 py-1.5 text-sm
                           text-slate-400 hover:text-white hover:bg-slate-700
                           rounded-lg transition-all duration-150"
              >
                <LogOut size={14} />
                <span className="hidden sm:block">登出</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── 下排：Tab 導覽 ── */}
        <div className="px-5 flex items-center gap-0.5 bg-slate-900/40 overflow-x-auto">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onNavigate(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                          border-b-2 transition-all duration-150 whitespace-nowrap
                          ${currentView === tab.key
                            ? 'border-blue-400 text-white bg-slate-700/50'
                            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                          }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <ExcelImportModal isOpen={showImport} onClose={() => setShowImport(false)} />

      <ExportExcelModal
        isOpen={showExportExcelModal}
        allUnits={allUnits}
        onConfirm={selectedUnits => exportSchedules(schedules, selectedUnits)}
        onClose={() => setShowExportExcelModal(false)}
      />
    </>
  )
}
