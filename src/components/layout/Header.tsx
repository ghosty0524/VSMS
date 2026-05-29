import { useState, useMemo, useRef, useEffect } from 'react'
import {
  LayoutList, BarChart2, Settings, Bell, ClipboardList,
  Upload, Download, Send, FileSpreadsheet, Plus, LogOut,
  ChevronDown
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { generateDashboardHTML } from '../../lib/export'
import { downloadTemplate, exportSchedules, generateAgentExcel } from '../../lib/excel'
import { ExcelImportModal } from '../schedule/ExcelImportModal'
import { ExportExcelModal } from '../schedule/ExportExcelModal'
import { api } from '../../lib/api'
import type { View } from '../../types'

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  onAddSchedule: () => void
  role: 'super_admin' | 'admin' | 'user' | null
}

interface ToastMsg {
  id: number
  text: string
  type: 'success' | 'error' | 'info' | 'loading'
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
  { key: 'teams',     label: 'Teams 設定', icon: <Bell          size={15} />, userHidden: true },
  { key: 'audit',     label: '審計紀錄',   icon: <ClipboardList size={15} />, superAdminOnly: true },
]

export function Header({ currentView, onNavigate, onAddSchedule, role }: Props) {
  const { logout, displayName } = useAuthStore()
  const { schedules } = useScheduleStore()
  const { options } = useOptionsStore()
  const [showImport, setShowImport]                     = useState(false)
  const [showExportMenu, setShowExportMenu]             = useState(false)
  const [showExportExcelModal, setShowExportExcelModal] = useState(false)
  const [toasts, setToasts]                             = useState<ToastMsg[]>([])
  const exportRef = useRef<HTMLDivElement>(null)

  // ── Toast 工具 ────────────────────────────────────────────
  const addToast = (text: string, type: ToastMsg['type'], duration = 4000) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, text, type }])
    if (type !== 'loading') {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
    return id
  }
  const removeToast = (id: number) =>
    setToasts(prev => prev.filter(t => t.id !== id))

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
      addToast('✅ Dashboard 與 Agent Excel 已匯出！請將 Excel 上傳至 SharePoint。', 'success', 6000)
    } catch (err) {
      addToast(`⚠️ Dashboard 已匯出，但 Agent Excel 產生失敗：${String(err)}`, 'error', 6000)
    }
  }

  const handleExportSchedules = () => {
    setShowExportMenu(false)
    setShowExportExcelModal(true)
  }

  // ── 發佈 Teams 通知 ────────────────────────────────────────
  const handleNotify = async () => {
    const completed = schedules.filter(s => s.isCompleted).length
    const delayed   = schedules.filter(s => s.isDelayed && !s.isCompleted).length
    const summary   = `• 排程總數：${schedules.length} 筆\n• 已完成：${completed} 筆\n• 延遲中：${delayed} 筆`
    try {
      await api.sendNotification(summary)
      addToast('✅ Teams 通知已發送！', 'success')
    } catch (err) {
      addToast(`❌ 發送失敗：${String(err)}`, 'error')
    }
  }

  const visibleTabs = NAV_TABS.filter(tab => {
    if (tab.superAdminOnly && role !== 'super_admin') return false
    if (tab.userHidden && role === 'user') return false
    return true
  })

  const toastStyle: Record<ToastMsg['type'], string> = {
    success: 'bg-white border-green-200 text-green-800',
    error:   'bg-white border-red-200   text-red-800',
    info:    'bg-white border-blue-200  text-blue-800',
    loading: 'bg-white border-slate-200 text-slate-700',
  }

  return (
    <>
      <header className="bg-slate-800 shadow-md flex-shrink-0">

        {/* ── 上排：Logo + 操作按鈕 ── */}
        <div className="px-5 py-3 flex items-center justify-between">

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
            {currentView === 'main' && role !== 'user' && (
              <button
                type="button"
                onClick={onAddSchedule}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold
                           bg-blue-500 hover:bg-blue-400 text-white rounded-lg
                           shadow-sm transition-all duration-150 active:scale-95"
              >
                <Plus size={15} strokeWidth={2.5} />
                新增排程
              </button>
            )}

            {/* 匯入 */}
            {role !== 'user' && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              title="匯入 Excel"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                         bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg
                         border border-slate-600 transition-all duration-150"
            >
              <Upload size={14} />
              匯入
            </button>
            )}

            {/* 匯出下拉 */}
            {role !== 'user' && (
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                           bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg
                           border border-slate-600 transition-all duration-150"
              >
                <Download size={14} />
                匯出
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

            {/* 發佈通知 */}
            {role !== 'user' && (
            <button
              type="button"
              onClick={handleNotify}
              title="發佈 Teams 通知"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                         bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg
                         border border-slate-600 transition-all duration-150"
            >
              <Send size={14} />
              發佈
            </button>
            )}

            {/* 下載範本 */}
            {role !== 'user' && (
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
                {role === 'super_admin' && (
                  <span className="px-1.5 py-0.5 text-xs font-bold
                                   bg-purple-500 text-white rounded-md leading-tight">
                    SA
                  </span>
                )}
                {role === 'user' && (
                  <span className="px-1.5 py-0.5 text-xs font-bold
                                   bg-green-500 text-white rounded-md leading-tight">
                    U
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
        <div className="px-5 flex items-center gap-0.5 bg-slate-900/40">
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

      {/* ── Toast 通知堆疊 ── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium
                        border rounded-xl shadow-xl pointer-events-auto
                        animate-fade-in min-w-[260px] max-w-[400px]
                        ${toastStyle[toast.type]}`}
          >
            {toast.type === 'loading' && (
              <svg className="animate-spin w-4 h-4 text-slate-500 flex-shrink-0"
                   fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            <span className="flex-1">{toast.text}</span>
            {toast.type !== 'loading' && (
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="opacity-40 hover:opacity-70 flex-shrink-0 ml-1"
              >✕</button>
            )}
          </div>
        ))}
      </div>

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
