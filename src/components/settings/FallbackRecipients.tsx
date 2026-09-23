import { useState } from 'react'
import { api, ApiError } from '../../lib/api'
import type { FallbackRecipient } from '../../types'

/**
 * 代收群組：需求人員無法對應為有效信箱時，整封通知改寄給這裡的人。
 *
 * 清單為空是有後果的狀態而非「還沒設定」—— runner 走到這條路時會直接放棄，
 * 不寄信也不寫通知記錄，只有管理者手動按「立即檢查並補寄」才會看到錯誤。
 * 因此空清單要主動警告，不能只是顯示一片空白。
 */
export function FallbackRecipients({
  recipients,
  onChanged,
}: {
  recipients: FallbackRecipient[]
  onChanged: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
      return true
    } catch (e) {
      // 後端的逐欄位錯誤（例如「無法組成有效信箱」）要原文顯示 —— 那句話已經
      // 指出該怎麼修，換成通用訊息反而讓管理者不知道問題在哪。
      setError(
        e instanceof ApiError
          ? (e.fieldErrors ? Object.values(e.fieldErrors).join('；') : e.message)
          : String(e),
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    if (await run(() => api.createNotifyRecipient(name.trim(), note.trim()))) {
      setName('')
      setNote('')
    }
  }

  const activeCount = recipients.filter(r => r.isActive).length

  return (
    <div>
      {activeCount === 0 && (
        <p className="text-sm rounded px-3 py-2 bg-amber-50 text-amber-800 mb-3">
          目前沒有啟用中的代收人員。需求人員無法對應為有效信箱時，該筆通知會直接放棄寄送，
          且不會留下通知記錄 —— 只有在手動按「立即檢查並補寄」時才看得到錯誤訊息。
        </p>
      )}

      {error && <p className="text-sm rounded px-3 py-2 bg-red-50 text-red-700 mb-3">{error}</p>}

      {recipients.length > 0 && (
        <ul className="mb-3 divide-y divide-gray-100 border border-gray-200 rounded">
          {recipients.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer" title="停用後不會收到代收信件，但保留在清單上">
                <input type="checkbox" checked={r.isActive} disabled={busy}
                  onChange={e => run(() => api.updateNotifyRecipient(r.id, { isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              </label>
              <span className={`text-sm ${r.isActive ? '' : 'text-gray-400 line-through'}`}>{r.name}</span>
              <input type="text" defaultValue={r.note} disabled={busy}
                onBlur={e => {
                  if (e.target.value.trim() !== r.note) run(() => api.updateNotifyRecipient(r.id, { note: e.target.value.trim() }))
                }}
                placeholder="備註（選填）"
                className="flex-1 text-xs border border-transparent hover:border-gray-300 focus:border-gray-300 rounded px-2 py-1" />
              <button type="button" disabled={busy}
                onClick={() => run(() => api.deleteNotifyRecipient(r.id))}
                className="px-2 py-1 text-xs border border-stone-300 text-stone-600 rounded hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40">
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 items-end">
        <label className="text-sm">
          <span className="block text-xs text-gray-600 mb-1">帳號名或完整 email</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) add() }}
            placeholder="Amy_Chen"
            className="border border-gray-300 rounded px-2 py-1.5" />
        </label>
        <label className="text-sm flex-1 max-w-xs">
          <span className="block text-xs text-gray-600 mb-1">備註（選填）</span>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) add() }}
            placeholder="例：QA 窗口"
            className="w-full border border-gray-300 rounded px-2 py-1.5" />
        </label>
        <button type="button" onClick={add} disabled={busy || !name.trim()}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
          新增
        </button>
      </div>
    </div>
  )
}
