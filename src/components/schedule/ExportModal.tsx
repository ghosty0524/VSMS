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
