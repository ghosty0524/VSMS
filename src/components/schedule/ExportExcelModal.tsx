import { useState, useMemo } from 'react'

interface Props {
  isOpen: boolean
  allUnits: string[]           // 所有可用的測試單位
  onConfirm: (selectedUnits: string[]) => void
  onClose: () => void
}

export function ExportExcelModal({ isOpen, allUnits, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>([])

  // 開啟時重置為全選
  const sortedUnits = useMemo(() => [...allUnits].sort(), [allUnits])

  const isAllSelected = selected.length === 0 || selected.length === sortedUnits.length

  const toggleUnit = (unit: string) => {
    setSelected(prev =>
      prev.includes(unit)
        ? prev.filter(u => u !== unit)
        : [...prev, unit]
    )
  }

  const toggleAll = () => {
    // 全選 = 清空 selected（代表不過濾）
    setSelected([])
  }

  const handleConfirm = () => {
    onConfirm(selected)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* 背景遮罩 */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-80 pointer-events-auto">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">📊 選擇匯出範圍</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            <p className="text-xs text-gray-500 mb-3">
              選擇要匯出的測試單位，不選則匯出全部。
            </p>

            {/* 全選 */}
            <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded accent-blue-600"
              />
              <span className="text-xs font-medium text-gray-700">全部單位</span>
              <span className="ml-auto text-xs text-gray-400">
                ({sortedUnits.length} 個單位)
              </span>
            </label>

            <div className="border-t border-gray-100 my-2" />

            {/* 單位清單 */}
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {sortedUnits.map(unit => (
                <label
                  key={unit}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.length === 0 || selected.includes(unit)}
                    onChange={() => {
                      // 若目前是「全選狀態」，點單一項目時先展開為全選再取消該項
                      if (selected.length === 0) {
                        setSelected(sortedUnits.filter(u => u !== unit))
                      } else {
                        toggleUnit(unit)
                      }
                    }}
                    className="w-3.5 h-3.5 rounded accent-blue-600"
                  />
                  <span className="text-xs text-gray-700">{unit}</span>
                </label>
              ))}
            </div>

            {/* 已選提示 */}
            <div className="mt-3 px-2 py-1.5 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                {selected.length === 0
                  ? `✅ 匯出全部 ${sortedUnits.length} 個單位的資料`
                  : `✅ 匯出已選 ${selected.length} 個單位：${selected.join('、')}`
                }
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              確認匯出
            </button>
          </div>
        </div>
      </div>
    </>
  )
}