import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import type { NotifyLog } from '../../types'

const STATUS_STYLE: Record<NotifyLog['status'], string> = {
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-amber-50 text-amber-700',
  failed_permanent: 'bg-red-50 text-red-700',
}

const STATUS_TEXT: Record<NotifyLog['status'], string> = {
  sent: '已寄出',
  failed: '失敗（明日重試）',
  failed_permanent: '永久失敗',
}

export function NotifyLogTable() {
  const [logs, setLogs] = useState<NotifyLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api.notifyLogs()
      .then(r => { setLogs(r.logs); setError(null) })
      .catch(e => setError(e instanceof ApiError ? e.message : String(e)))
  }
  useEffect(() => { reload() }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!logs) return <p className="text-sm text-gray-400">載入中…</p>
  if (logs.length === 0) return <p className="text-sm text-gray-400">尚無通知記錄</p>

  return (
    <div className="overflow-x-auto">
      <button type="button" onClick={reload}
        className="mb-2 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
        重新整理
      </button>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-200">
            <th className="text-left py-2 px-2">寄信日</th>
            <th className="text-left py-2 px-2">專案</th>
            <th className="text-left py-2 px-2">單位</th>
            <th className="text-left py-2 px-2">狀態</th>
            <th className="text-left py-2 px-2">收件人</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} className="border-b border-gray-100 align-top">
              <td className="py-2 px-2 whitespace-nowrap">{l.sendDate}</td>
              <td className="py-2 px-2">
                {l.projectName || <span className="text-gray-400">（排程已刪除）</span>}
              </td>
              <td className="py-2 px-2 whitespace-nowrap">{l.testUnit || <span className="text-gray-400">—</span>}</td>
              <td className="py-2 px-2 whitespace-nowrap">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLE[l.status]}`}
                  title={l.status === 'failed_permanent'
                    ? '已達重試上限，系統不會再自動重試這筆通知；如需重寄，需由工程人員手動處理。'
                    : undefined}
                >
                  {STATUS_TEXT[l.status]}
                </span>
                {l.attempts > 1 && (
                  <span className="ml-1 text-xs text-gray-400">第 {l.attempts} 次</span>
                )}
              </td>
              <td className="py-2 px-2 text-xs text-gray-600 break-all">
                {l.recipients}
                {l.errorMessage && (
                  <span className="block text-red-600 mt-0.5">{l.errorMessage}</span>
                )}
                {/* 郵件伺服器的原始回應。M365 會把 InternalId 放在這裡，IT 用它
                    在 message trace 一次就能定位到這一封，不必靠時間範圍去撈。 */}
                {l.smtpResponse && (
                  <span
                    className="block text-gray-400 mt-0.5 font-mono text-[11px] cursor-text select-all"
                    title="郵件伺服器回應（追查投遞狀況時提供給 IT）"
                  >
                    {l.smtpResponse}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
