// src/components/settings/TestUnitManager.tsx
import { useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'
import { resolveUnitColor } from '../../lib/colors'
import { ApiError } from '../../lib/api'
import { formatUnitDeleteError } from '../../lib/optionsErrors'

export function TestUnitManager() {
  const { options, addTestUnit, updateTestUnit, toggleTestUnit, deleteTestUnit, setTestUnitColor } = useOptionsStore()
  const [newValue, setNewValue] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // 拖曳色盤期間的暫存值（依 unit id 分開），避免每個 input 事件都寫回並觸發整表重寫
  const [draftColors, setDraftColors] = useState<Record<string, string>>({})
  // 刪除單位失敗訊息（依 unit id 分開）。deleteTestUnit 會把該單位所有人員一併
  // 從 body 移除，若其中有人仍被排程引用，後端會回 400 ENGINEER_IN_USE——比照
  // 比照人員名冊的 handleRemove 模式，吞下例外並顯示訊息，不無聲失敗。
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})

  const clearDeleteError = (id: string) => {
    setDeleteErrors(d => {
      if (!(id in d)) return d
      const next = { ...d }
      delete next[id]
      return next
    })
  }

  const clearDraftColor = (id: string) => {
    setDraftColors(d => {
      if (!(id in d)) return d
      const next = { ...d }
      delete next[id]
      return next
    })
  }

  const handleAdd = async () => {
    const v = newValue.trim()
    if (!v) return
    await addTestUnit(v)
    setNewValue("")
  }

  const handleDelete = async (unitId: string, unitLabel: string) => {
    clearDeleteError(unitId)
    try {
      await deleteTestUnit(unitId)
      setDeletingId(null)
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err)
      // ENGINEER_IN_USE 的後端文字是針對「刪除人員」寫的；單位刪除會連帶把
      // 底下人員一起移除，因此要補上「單位為什麼刪不掉」的脈絡，其餘錯誤
      // （網路錯誤、500 等）就直接顯示原始訊息。
      const msg = err instanceof ApiError && err.code === 'ENGINEER_IN_USE'
        ? formatUnitDeleteError(unitLabel, detail)
        : detail
      setDeleteErrors(d => ({ ...d, [unitId]: msg }))
    }
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-3">測試單位</h3>
      <div className="space-y-2 mb-3">
        {options.testUnits.map(u => (
          <div key={u.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 py-1">
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
                  <button type="button" onClick={() => handleDelete(u.id, u.label)}
                    className="text-xs px-2 py-1 bg-red-500 text-white rounded">刪除</button>
                  <button type="button" onClick={() => { clearDeleteError(u.id); setDeletingId(null) }}
                    className="text-xs px-2 py-1 border rounded">取消</button>
                </>
              ) : (
                <>
                  <input
                    type="color"
                    className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5"
                    title="自訂單位色（甘特圖 bar 外框）"
                    value={draftColors[u.id] ?? u.color ?? resolveUnitColor(u.value, options)}
                    onChange={e => setDraftColors(d => ({ ...d, [u.id]: e.target.value }))}
                    onBlur={() => {
                      const draft = draftColors[u.id]
                      if (draft === undefined) return
                      const base = u.color ?? resolveUnitColor(u.value, options)
                      if (draft.toLowerCase() !== base.toLowerCase()) setTestUnitColor(u.id, draft)
                      clearDraftColor(u.id)
                    }}
                  />
                  {u.color && (
                    <button type="button"
                      onMouseDown={() => clearDraftColor(u.id)}
                      onClick={() => { setTestUnitColor(u.id, null); clearDraftColor(u.id) }}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-500">還原</button>
                  )}
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
                  <button type="button" onClick={() => { clearDeleteError(u.id); setDeletingId(u.id) }}
                    className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">刪除</button>
                </>
              )}
            </div>
            {deleteErrors[u.id] && (
              <p className="text-xs text-red-500 pl-1">{deleteErrors[u.id]}</p>
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