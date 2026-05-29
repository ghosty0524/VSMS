// src/components/settings/DeviceManager.tsx
import { useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'

export function DeviceManager() {
  const { options, addDevice, updateDevice, toggleDevice, deleteDevice } = useOptionsStore()
  const [newValue, setNewValue]       = useState('')
  const [editId, setEditId]           = useState<string | null>(null)
  const [editValue, setEditValue]     = useState('')
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleAdd = async () => {
    const v = newValue.trim()
    if (!v) return
    await addDevice(v)
    setNewValue('')
  }

  const handleDelete = async (id: string) => {
    setDeleteError(null)
    try {
      await deleteDevice(id)
      setDeletingId(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setDeleteError(msg)
    }
  }

  const devices = options.devices ?? []

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-3">設備管理</h3>
      <div className="space-y-2 mb-3">
        {devices.map(d => (
          <div key={d.id} className="flex items-center gap-2 py-1">
            {editId === d.id ? (
              <>
                <input
                  className="border rounded px-2 py-1 text-sm flex-1"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                />
                <button
                  type="button"
                  onClick={async () => { await updateDevice(d.id, editValue.trim()); setEditId(null) }}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded"
                >
                  確認
                </button>
                <button type="button" onClick={() => setEditId(null)}
                  className="text-xs px-2 py-1 border rounded">
                  取消
                </button>
              </>
            ) : deletingId === d.id ? (
              <>
                <span className="flex-1 text-sm text-red-600">確定刪除「{d.label}」？</span>
                {deleteError && <span className="text-xs text-red-500">{deleteError}</span>}
                <button type="button" onClick={() => handleDelete(d.id)}
                  className="text-xs px-2 py-1 bg-red-500 text-white rounded">
                  刪除
                </button>
                <button type="button" onClick={() => { setDeletingId(null); setDeleteError(null) }}
                  className="text-xs px-2 py-1 border rounded">
                  取消
                </button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${!d.isActive ? 'line-through text-gray-400' : ''}`}>
                  {d.label}
                </span>
                <button
                  type="button"
                  onClick={() => { setEditId(d.id); setEditValue(d.label) }}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={() => toggleDevice(d.id, !d.isActive)}
                  className={`text-xs px-2 py-1 rounded ${d.isActive ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                >
                  {d.isActive ? '停用' : '啟用'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingId(d.id)}
                  className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                >
                  刪除
                </button>
              </>
            )}
          </div>
        ))}
        {devices.length === 0 && (
          <p className="text-sm text-gray-400">尚未建立任何設備</p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="新增設備名稱"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          新增
        </button>
      </div>
    </div>
  )
}
