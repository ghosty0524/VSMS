import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { listMock, markReadMock, markAllReadMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  markReadMock: vi.fn(async () => {}),
  markAllReadMock: vi.fn(async () => ({ updated: 2 })),
}))

vi.mock('../api/notifications', () => ({
  notificationsApi: {
    list: listMock,
    markRead: markReadMock,
    markAllRead: markAllReadMock,
  },
}))

import { useNotificationStore } from '../store/notificationStore'

const item = (over = {}) => ({
  id: 'n1', source: 'vsms', severity: 'info',
  title: '你有一筆排程：PDN-1', body: '2026/10/01 ～ 2026/10/03',
  linkUrl: '/vsms/', readAt: null, createdAt: '2026-09-21T00:00:00.000Z',
  ...over,
})

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  listMock.mockReset()
  markReadMock.mockClear()
  markAllReadMock.mockClear()
  useNotificationStore.setState({ items: [], unreadCount: 0, loaded: false })
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('useNotificationStore', () => {
  it('load 成功時填入 items 與 unreadCount，並標記 loaded', async () => {
    listMock.mockResolvedValue({ items: [item()], unreadCount: 1 })

    await useNotificationStore.getState().load()

    const state = useNotificationStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.unreadCount).toBe(1)
    expect(state.loaded).toBe(true)
  })

  it('load 失敗時清空並仍標記 loaded，留下警告痕跡', async () => {
    const boom = new Error('boom')
    listMock.mockRejectedValue(boom)

    await useNotificationStore.getState().load()

    const state = useNotificationStore.getState()
    expect(state.items).toEqual([])
    expect(state.unreadCount).toBe(0)
    expect(state.loaded).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to load'), boom)
  })

  it('markRead 等 API 呼叫成功後才把該筆標成已讀並遞減 unreadCount（不是樂觀更新）', async () => {
    useNotificationStore.setState({ items: [item()], unreadCount: 1, loaded: true })

    await useNotificationStore.getState().markRead('n1')

    const state = useNotificationStore.getState()
    expect(state.items[0].readAt).not.toBeNull()
    expect(state.unreadCount).toBe(0)
    expect(markReadMock).toHaveBeenCalledWith('n1')
  })

  it('markAllRead 成功時回傳 true 並清空未讀', async () => {
    useNotificationStore.setState({ items: [item()], unreadCount: 1, loaded: true })

    const ok = await useNotificationStore.getState().markAllRead()

    expect(ok).toBe(true)
    expect(useNotificationStore.getState().unreadCount).toBe(0)
  })

  it('markAllRead 失敗時回傳 false 且不動本地狀態', async () => {
    const boom = new Error('boom')
    markAllReadMock.mockRejectedValueOnce(boom)
    useNotificationStore.setState({ items: [item()], unreadCount: 1, loaded: true })

    const ok = await useNotificationStore.getState().markAllRead()

    expect(ok).toBe(false)
    expect(useNotificationStore.getState().unreadCount).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to mark all read'), boom)
  })
})
