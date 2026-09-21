// 收件匣在平台（vauth）：同源、不加 BASE_PATH 前綴、用 vportal_sso cookie 認人，所以不走 lib/api 的 api()。
import type { NotificationRow } from '../types'

export interface NotificationList { items: NotificationRow[]; unreadCount: number }

async function portal<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  if (!res.ok) throw new Error(`notify ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const notificationsApi = {
  list: () => portal<NotificationList>('/notify/inbox'),
  markRead: (id: string) => portal<void>(`/notify/inbox/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => portal<{ updated: number }>('/notify/inbox/read-all', { method: 'POST' }),
}
