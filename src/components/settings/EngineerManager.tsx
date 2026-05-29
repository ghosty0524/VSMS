import { useState } from 'react'
import { useOptionsStore } from '../../store/optionsStore'

export function EngineerManager() {
  const { options, addEngineer, updateEngineer, removeEngineer } = useOptionsStore()
  const [newNames, setNewNames] = useState<Record<string, string>>({})
  const [editKeys, setEditKeys] = useState<Record<string, string>>({})

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-3">測試人員</h3>
      <div className="space-y-6">
        {options.testUnits.map(unit => (
          <div key={unit.id} className="border rounded p-3">
            <p className="font-medium text-sm text-gray-600 mb-2">{unit.label}</p>
            <div className="space-y-1 mb-2">
              {unit.engineers.map(eng => (
                <div key={eng.id} className="flex items-center gap-2">
                  {editKeys[eng.id] !== undefined ? (
                    <>
                      <input className="border rounded px-2 py-0.5 text-sm flex-1"
                        value={editKeys[eng.id]} onChange={e => setEditKeys(k => ({ ...k, [eng.id]: e.target.value }))} />
                      <button type="button" onClick={async () => { await updateEngineer(unit.id, eng.id, editKeys[eng.id].trim()); setEditKeys(k => { const n = { ...k }; delete n[eng.id]; return n }) }}
                        className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded">確認</button>
                      <button type="button" onClick={() => setEditKeys(k => { const n = { ...k }; delete n[eng.id]; return n })}
                        className="text-xs px-2 py-0.5 border rounded">取消</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{eng.label}</span>
                      <button type="button" onClick={() => setEditKeys(k => ({ ...k, [eng.id]: eng.label }))}
                        className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50">編輯</button>
                      <button type="button" onClick={() => removeEngineer(unit.id, eng.id)}
                        className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">刪除</button>
                    </>
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