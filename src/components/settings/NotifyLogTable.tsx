import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import type { NotifyLog } from '../../types'

const STATUS_STYLE: Record<NotifyLog['status'], string> = {
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-amber-50 text-amber-700',
  failed_permanent: 'bg-red-50 text-red-700',
  accepted: 'bg-blue-50 text-blue-700',
  dedup: 'bg-gray-50 text-gray-600',
  error: 'bg-red-50 text-red-700',
}

const STATUS_TEXT: Record<NotifyLog['status'], string> = {
  sent: '已寄出',
  failed: '失敗（明日重試）',
  failed_permanent: '永久失敗',
  accepted: '已交平台',
  dedup: '已送過（略過）',
  error: '交付失敗',
}

// 平台端（GET /notify/deliveries）回傳的實際寄送狀態；有值時優先顯示，
// 因為本地 status 只代表「有沒有成功交給平台」，不代表信真的寄出了。
const PLATFORM_STATUS_STYLE: Record<string, string> = {
  queued: 'bg-blue-50 text-blue-700',
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-amber-50 text-amber-700',
  failed_permanent: 'bg-red-50 text-red-700',
}

const PLATFORM_STATUS_TEXT: Record<string, string> = {
  queued: '排隊中',
  sent: '已寄出',
  failed: '失敗（重試中）',
  failed_permanent: '永久失敗',
}

/**
 * 「最後處理時間」，也就是後端排序記錄的依據。
 *
 * 不把它顯示出來的話，畫面上唯一的日期是預定寄信日，而補寄會讓它早於實際
 * 處理日 —— 使用者會看到日期欄前後跳動，並誤以為當天的排程沒有跑。
 *
 * 呼叫端在 updatedAt 缺席時退回 createdAt：dist 由磁碟即時服務，後端卻要重啟
 * 才生效，中間必然有一段新前端搭舊後端。舊後端不回 updatedAt，也正好是以
 * createdAt 排序，退回去剛好與當下的排序一致。
 */
function formatHandledAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function NotifyLogTable({ refreshToken = 0 }: { refreshToken?: number }) {
  const [logs, setLogs] = useState<NotifyLog[] | null>(null)
  const [windowStart, setWindowStart] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api.notifyLogs()
      .then(r => { setLogs(r.logs); setWindowStart(r.windowStart ?? null); setError(null) })
      .catch(e => setError(e instanceof ApiError ? e.message : String(e)))
  }
  // 後端只回最近五個工作日（含當天）的紀錄，這裡把窗講清楚，免得有人以為更早的通知沒寄。
  const windowNote = `只顯示最近五個工作日${windowStart ? `（${windowStart} 起）` : ''}的紀錄`
  // refreshToken 由外層在「立即檢查並補寄」跑完後遞增 —— 這張表是那顆按鈕的
  // 兄弟元件，沒有這條線就只會停在進入頁面當下的內容。
  useEffect(() => { reload() }, [refreshToken])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!logs) return <p className="text-sm text-gray-400">載入中…</p>
  if (logs.length === 0) return <p className="text-sm text-gray-400">{windowNote}；這段期間沒有通知記錄</p>

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex items-center gap-3">
        <button type="button" onClick={reload}
          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
          重新整理
        </button>
        <span className="text-xs text-gray-500">{windowNote}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-200">
            <th className="text-left py-2 px-2">最後處理</th>
            <th className="text-left py-2 px-2">預定寄信日</th>
            <th className="text-left py-2 px-2">專案</th>
            <th className="text-left py-2 px-2">單位</th>
            <th className="text-left py-2 px-2">狀態</th>
            <th className="text-left py-2 px-2">收件人</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} className="border-b border-gray-100 align-top">
              <td className="py-2 px-2 whitespace-nowrap"
                title="這筆通知最後一次被處理的時間，也是本表的排序依據">
                {formatHandledAt(l.updatedAt ?? l.createdAt)}
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-600"
                title="依提前天數與休息日算出的預定寄信日；補寄時會早於實際處理時間">
                {l.sendDate}
              </td>
              <td className="py-2 px-2">
                {l.projectName || <span className="text-gray-400">（排程已刪除）</span>}
              </td>
              <td className="py-2 px-2 whitespace-nowrap">{l.testUnit || <span className="text-gray-400">—</span>}</td>
              <td className="py-2 px-2 whitespace-nowrap">
                {l.platformStatus ? (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${PLATFORM_STATUS_STYLE[l.platformStatus] ?? 'bg-gray-50 text-gray-600'}`}
                    title={l.platformStatus === 'failed_permanent'
                      ? '平台已達重試上限，不會再自動重試這筆通知。'
                      : '平台目前記錄的實際寄送狀態'}
                  >
                    {PLATFORM_STATUS_TEXT[l.platformStatus] ?? l.platformStatus}
                  </span>
                ) : (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLE[l.status]}`}
                    title={l.status === 'failed_permanent'
                      ? '已達重試上限，系統不會再自動重試這筆通知；如需重寄，需由工程人員手動處理。'
                      : undefined}
                  >
                    {STATUS_TEXT[l.status]}
                  </span>
                )}
                {l.attempts > 1 && (
                  <span className="ml-1 text-xs text-gray-400">第 {l.attempts} 次</span>
                )}
              </td>
              <td className="py-2 px-2 text-xs text-gray-600 break-all">
                {l.recipients}
                {l.errorMessage && (
                  <span className="block text-red-600 mt-0.5">{l.errorMessage}</span>
                )}
                {l.platformError && (
                  <span className="block text-red-600 mt-0.5">{l.platformError}</span>
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
