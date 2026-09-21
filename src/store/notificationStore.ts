import { create } from 'zustand'
import { notificationsApi } from '../api/notifications'
import type { NotificationRow } from '../types'

interface NotificationState {
  items: NotificationRow[]
  unreadCount: number
  loaded: boolean
  load: () => Promise<void>
  markRead: (id: string) => Promise<void>
  /** 回傳是否成功。失敗時不動本地狀態 —— 假裝成功會讓使用者以為清掉了。 */
  markAllRead: () => Promise<boolean>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  loaded: false,

  load: async () => {
    try {
      const data = await notificationsApi.list()
      set({ items: data.items, unreadCount: data.unreadCount, loaded: true })
    } catch (err) {
      // 通知拿不到就當作沒有通知 —— 不能讓整個 header 掛掉。但要留下痕跡：
      // 靜默吞掉的話，「鈴鐺永遠是 0」跟「真的沒有通知」在畫面上長得一模一樣。
      console.warn('[notifications] failed to load:', err)
      set({ items: [], unreadCount: 0, loaded: true })
    }
  },

  markRead: async (id) => {
    const row = get().items.find(i => i.id === id)
    if (!row || row.readAt) return
    try {
      await notificationsApi.markRead(id)
      const now = new Date().toISOString()
      set(s => ({
        items: s.items.map(i => (i.id === id ? { ...i, readAt: now } : i)),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }))
    } catch { /* 標記失敗不影響閱讀 */ }
  },

  markAllRead: async () => {
    try {
      await notificationsApi.markAllRead()
      const now = new Date().toISOString()
      set(s => ({
        items: s.items.map(i => (i.readAt ? i : { ...i, readAt: now })),
        unreadCount: 0,
      }))
      return true
    } catch (err) {
      console.warn('[notifications] failed to mark all read:', err)
      return false
    }
  },
}))
