import { useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'
import { resolveEngineerColor } from '../../lib/colors'

export function EngineerManager() {
  const { options, addEngineer, updateEngineer, toggleEngineer, removeEngineer, setEngineerColor } = useOptionsStore()
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})
  // 拖曳色盤期間的暫存值（依 engineer id 分開），避免每個 input 事件都寫回並觸發整表重寫
  const [draftColors, setDraftColors] = useState<Record<string, string>>({})
  // 刪除失敗訊息（依 engineer id 分開，例如後端擋下的 ENGINEER_IN_USE）
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  // 改名／停用失敗訊息（同樣依 engineer id 分開，避免無聲失敗）
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  const clearDraftColor = (id: string) => {
    setDraftColors(d => {
      if (!(id in d)) return d
      const next = { ...d }
      delete next[id]
      return next
    })
  }

  const handleRemove = async (unitId: string, engId: string) => {
    setDeleteErrors(d => { const n = { ...d }; delete n[engId]; return n })
    try {
      await removeEngineer(unitId, engId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setDeleteErrors(d => ({ ...d, [engId]: msg }))
    }
  }

  // Critical 2 / Important 4：toggleEngineer 與 updateEngineer 都會先 await
  // persistOptions 再 set()，後端 400 時會 reject。呼叫端若不 await／不 catch，
  // 就是無聲失敗（使用者點了沒反應、也看不到原因）且留下 unhandled rejection。
  // 比照 handleRemove 的既有模式，統一吞下例外並顯示訊息。
  const handleToggle = async (unitId: string, engId: string, isActive: boolean) => {
    setActionErrors(d => { const n = { ...d }; delete n[engId]; return n })
    try {
      await toggleEngineer(unitId, engId, isActive)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setActionErrors(d => ({ ...d, [engId]: msg }))
    }
  }

  const handleRename = async (unitId: string, engId: string, name: string) => {
    setActionErrors(d => { const n = { ...d }; delete n[engId]; return n })
    try {
      await updateEngineer(unitId, engId, name)
      setEditKeys(k => { const n = { ...k }; delete n[engId]; return n })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setActionErrors(d => ({ ...d, [engId]: msg }))
    }
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-3">測試人員</h3>
      <p className="text-xs text-gray-400 mb-3">
        人員色預設由所屬單位色衍生，因此同單位為同色系。按「還原」即可回到預設。
      </p>
      <div className="space-y-6">
        {options.testUnits.map(unit => (
          <div key={unit.id} className="border rounded p-3">
            <p className="font-medium text-sm text-gray-600 mb-2">{unit.label}</p>
            <div className="space-y-1 mb-2">
              {unit.engineers.map(eng => (
                <div key={eng.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    {editKeys[eng.id] !== undefined ? (
                      <>
                        <input className="border rounded px-2 py-0.5 text-sm flex-1"
                          value={editKeys[eng.id]} onChange={e => setEditKeys(k => ({ ...k, [eng.id]: e.target.value }))} />
                        <button type="button" onClick={() => handleRename(unit.id, eng.id, editKeys[eng.id].trim())}
                          className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded">確認</button>
                        <button type="button" onClick={() => setEditKeys(k => { const n = { ...k }; delete n[eng.id]; return n })}
                          className="text-xs px-2 py-0.5 border rounded">取消</button>
                      </>
                    ) : (
                      <>
                        <input
                          type="color"
                          className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5"
                          title="自訂人員色（甘特圖 bar 內裡與左欄徽章）"
                          value={draftColors[eng.id] ?? eng.color ?? resolveEngineerColor(eng.value, unit.value, options)}
                          onChange={e => setDraftColors(d => ({ ...d, [eng.id]: e.target.value }))}
                          onBlur={() => {
                            const draft = draftColors[eng.id]
                            if (draft === undefined) return
                            const base = eng.color ?? resolveEngineerColor(eng.value, unit.value, options)
                            if (draft.toLowerCase() !== base.toLowerCase()) setEngineerColor(unit.id, eng.id, draft)
                            clearDraftColor(eng.id)
                          }}
                        />
                        {eng.color && (
                          <button type="button"
                            onMouseDown={() => clearDraftColor(eng.id)}
                            onClick={() => { setEngineerColor(unit.id, eng.id, null); clearDraftColor(eng.id) }}
                            className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50 text-gray-500">還原</button>
                        )}
                        <span className={`flex-1 text-sm ${!eng.isActive ? 'line-through text-gray-400' : ''}`}>{eng.label}</span>
                        <button type="button" onClick={() => setEditKeys(k => ({ ...k, [eng.id]: eng.label }))}
                          className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50">編輯</button>
                        <button type="button" onClick={() => handleToggle(unit.id, eng.id, !eng.isActive)}
                          className={`text-xs px-2 py-0.5 rounded ${eng.isActive ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                          {eng.isActive ? '停用' : '啟用'}
                        </button>
                        <button type="button" onClick={() => handleRemove(unit.id, eng.id)}
                          className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">刪除</button>
                      </>
                    )}
                  </div>
                  {deleteErrors[eng.id] && (
                    <p className="text-xs text-red-500 pl-8">{deleteErrors[eng.id]}</p>
                  )}
                  {actionErrors[eng.id] && (
                    <p className="text-xs text-red-500 pl-8">{actionErrors[eng.id]}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="新增人員姓名"
                value={newNames[unit.id] ?? ''} onChange={e => setNewNames(n => ({ ...n, [unit.id]: e.target.value }))}
                onKeyDown={async e => {
                  if (e.key === 'Enter') { const v = (newNames[unit.id] ?? '').trim(); if (v) { await addEngineer(unit.id, v); setNewNames(n => ({ ...n, [unit.id]: '' })) } }
                }} />
              <button type="button" onClick={async () => { const v = (newNames[unit.id] ?? '').trim(); if (v) { await addEngineer(unit.id, v); setNewNames(n => ({ ...n, [unit.id]: '' })) } }}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">新增</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}