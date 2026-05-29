// src/components/settings/TestUnitManager.tsx
import { useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'

export function TestUnitManager() {
  const { options, addTestUnit, updateTestUnit, toggleTestUnit, deleteTestUnit } = useOptionsStore()
  const [newValue, setNewValue] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleAdd = async () => {
    const v = newValue.trim()
    if (!v) return
    await addTestUnit(v)
    setNewValue("")
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-3">測試單位</h3>
      <div className="space-y-2 mb-3">
        {options.testUnits.map(u => (
          <div key={u.id} className="flex items-center gap-2 py-1">
            {editId === u.id ? (
              <>
                <input className="border rounded px-2 py-1 text-sm flex-1"
                  value={editValue} onChange={e => setEditValue(e.target.value)} />
                <button type="button" onClick={async () => { await updateTestUnit(u.id, editValue.trim()); setEditId(null) }}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded">確認</button>
                <button type="button" onClick={() => setEditId(null)}
                  className="text-xs px-2 py-1 border rounded">取消</button>
              </>
            ) : deletingId === u.id ? (
              <>
                <span className="flex-1 text-sm text-red-600">確定刪除「{u.label}」及其所有人員？</span>
                <button type="button" onClick={async () => { await deleteTestUnit(u.id); setDeletingId(null) }}
                  className="text-xs px-2 py-1 bg-red-500 text-white rounded">刪除</button>
                <button type="button" onClick={() => setDeletingId(null)}
                  className="text-xs px-2 py-1 border rounded">取消</button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${!u.isActive ? "line-through text-gray-400" : ""}`}>
                  {u.label}
                  <span className="ml-1 text-xs text-gray-400">（{u.engineers.length} 人）</span>
                </span>
                <button type="button" onClick={() => { setEditId(u.id); setEditValue(u.label) }}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50">編輯</button>
                <button type="button" onClick={() => toggleTestUnit(u.id, !u.isActive)}
                  className={`text-xs px-2 py-1 rounded ${u.isActive ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                  {u.isActive ? "停用" : "啟用"}
                </button>
                <button type="button" onClick={() => setDeletingId(u.id)}
                  className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">刪除</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="新增測試單位"
          value={newValue} onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <button type="button" onClick={handleAdd}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">新增</button>
      </div>
    </div>
  )
}