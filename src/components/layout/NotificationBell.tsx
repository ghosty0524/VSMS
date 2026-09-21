import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationStore } from '../../store/notificationStore'
import type { NotificationRow } from '../../types'

const SOURCE_LABEL: Record<NotificationRow['source'], string> = {
  vtms: 'VTMS',
  vsms: 'VSMS',
  portal: '平台',
}

export function NotificationBell() {
  const { items, unreadCount: unread, load, markRead, markAllRead } = useNotificationStore()
  const [open, setOpen] = useState(false)

  useEffect(() => { void load() }, [load])

  async function handleClick(row: NotificationRow) {
    await markRead(row.id)
    setOpen(false)
    // 平台收件匣的 linkUrl 可能指向任一系統：絕對網址開新分頁；`/vsms/` 開頭是
    // 站內路徑，這裡不接 router，關閉面板就好（畫面已經在 VSMS 裡）；其餘非空
    // 的路徑（例如 /vtms/...）是別的系統，整頁跳轉離開 VSMS；空字串不導航。
    if (row.linkUrl.startsWith('http')) {
      window.open(row.linkUrl, '_blank', 'noopener')
      return
    }
    if (row.linkUrl.startsWith('/vsms/')) return
    if (!row.linkUrl) return
    window.location.assign(row.linkUrl)
  }

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="relative p-2 rounded hover:bg-gray-100"
        aria-label="通知"
        onClick={() => setOpen(o => !o)}
      >
        <Bell size={16} className="text-slate-200" />
        {unread > 0 && (
          <span data-testid="notification-badge" className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full px-1.5">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded shadow-lg z-50 max-h-96 overflow-auto">
          {unread > 0 && (
            <div className="flex justify-end p-2 border-b">
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => void markAllRead()}
              >
                全部已讀
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <div className="p-4 text-sm text-gray-500 text-center">目前沒有通知</div>
          ) : (
            items.map(row => (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${row.readAt ? '' : 'bg-blue-50'}`}
                onClick={() => void handleClick(row)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (e.key === ' ') e.preventDefault()
                    void handleClick(row)
                  }
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <span className="text-[10px] font-bold text-gray-400">{SOURCE_LABEL[row.source] ?? row.source}</span>
                  {row.title}
                </div>
                <div className="text-xs text-gray-500 whitespace-pre-line mt-0.5">{row.body}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
