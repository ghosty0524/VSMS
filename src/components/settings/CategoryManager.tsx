// src/components/settings/CategoryManager.tsx
import { useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'
import type { CategoryStatsMode } from '../../types'

const STATS_MODE_LABELS: { value: CategoryStatsMode; label: string }[] = [
  { value: 'counted',       label: '正常計入' },
  { value: 'workload_only', label: '不計專案數（保留負載）' },
  { value: 'excluded',      label: '完全排除' },
]

export function CategoryManager() {
  const { options, addCategory, updateCategory, toggleCategory, deleteCategory, setCategoryStatsMode } = useOptionsStore()
  const [newValue, setNewValue] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = async () => {
    const v = newValue.trim()
    if (!v) return
    await addCategory(v)
    setNewValue("")
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-3">工作類別</h3>
      <p className="text-xs text-gray-400 mb-3">
        「不計專案數」的類別仍佔用人力負載（例如出國）；「完全排除」則兩者皆不計。
        兩種模式都不影響甘特圖與列表的顯示。
      </p>
      <div className="space-y-2 mb-3">
        {options.categories.map(c => (
          <div key={c.id} className="flex items-center gap-2 py-1">
            {editId === c.id ? (
              <>
                <input className="border rounded px-2 py-1 text-sm flex-1"
                  value={editValue} onChange={e => setEditValue(e.target.value)} />
                <button type="button" onClick={async () => { await updateCategory(c.id, editValue.trim()); setEditId(null) }}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded">確認</button>
                <button type="button" onClick={() => setEditId(null)}
                  className="text-xs px-2 py-1 border rounded">取消</button>
              </>
            ) : deletingId === c.id ? (
              <>
                <span className="flex-1 text-sm text-red-600">確定刪除「{c.label}」？</span>
                <button type="button" onClick={async () => { await deleteCategory(c.id); setDeletingId(null) }}
                  className="text-xs px-2 py-1 bg-red-600 text-white hover:bg-red-700 rounded">刪除</button>
                <button type="button" onClick={() => setDeletingId(null)}
                  className="text-xs px-2 py-1 border rounded">取消</button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${!c.isActive ? "line-through text-gray-400" : ""}`}>
                  {c.label}
                </span>
                <select
                  className="text-xs border rounded px-1.5 py-1 text-gray-600 bg-white"
                  value={c.statsMode ?? 'counted'}
                  title="此類別在統計分析中的計入方式"
                  onChange={e => setCategoryStatsMode(c.id, e.target.value as CategoryStatsMode)}
                >
                  {STATS_MODE_LABELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => { setEditId(c.id); setEditValue(c.label) }}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50">編輯</button>
                <button type="button" onClick={() => toggleCategory(c.id, !c.isActive)}
                  className={`text-xs px-2 py-1 rounded ${c.isActive ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                  {c.isActive ? "停用" : "啟用"}
                </button>
                <button type="button" onClick={() => setDeletingId(c.id)}
                  className="text-xs px-2 py-1 border border-stone-300 text-stone-600 rounded hover:border-red-300 hover:bg-red-50 hover:text-red-700">刪除</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="新增工作類別"
          value={newValue} onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <button type="button" onClick={handleAdd}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">新增</button>
      </div>
    </div>
  )
}