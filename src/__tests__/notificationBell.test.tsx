import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

import { NotificationBell } from '../components/layout/NotificationBell'
import { useNotificationStore } from '../store/notificationStore'

const item = (over = {}) => ({
  id: 'n1', source: 'vsms', severity: 'info',
  title: '你有一筆排程：PDN-1', body: '2026/10/01 ～ 2026/10/03',
  linkUrl: '/vsms/', readAt: null, createdAt: '2026-09-21T00:00:00.000Z',
  ...over,
})

const originalLocation = window.location
let assignSpy: ReturnType<typeof vi.fn>
let openSpy: ReturnType<typeof vi.fn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  listMock.mockReset()
  markReadMock.mockClear()
  markAllReadMock.mockClear()
  useNotificationStore.setState({ items: [], unreadCount: 0, loaded: false })
  listMock.mockResolvedValue({ items: [item()], unreadCount: 1 })
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  assignSpy = vi.fn()
  openSpy = vi.fn()
  vi.stubGlobal('open', openSpy)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, assign: assignSpy },
  })
})

afterEach(() => {
  warnSpy.mockRestore()
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  vi.unstubAllGlobals()
})

describe('NotificationBell', () => {
  it('顯示未讀數', async () => {
    render(<NotificationBell />)
    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('1')
  })

  it('沒有未讀時不顯示徽章', async () => {
    listMock.mockResolvedValue({ items: [item({ readAt: '2026-09-21T02:00:00.000Z' })], unreadCount: 0 })
    render(<NotificationBell />)
    await waitFor(() => expect(listMock).toHaveBeenCalled())
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument()
  })

  it('展開面板時列出通知，帶來源標籤', async () => {
    listMock.mockResolvedValue({
      items: [item(), item({ id: 'n2', source: 'vtms', title: 'VTMS 通知', linkUrl: '/vtms/x' })],
      unreadCount: 2,
    })
    render(<NotificationBell />)
    await screen.findByTestId('notification-badge')

    await userEvent.click(screen.getByRole('button', { name: '通知' }))

    expect(screen.getByText('你有一筆排程：PDN-1')).toBeInTheDocument()
    expect(screen.getByText('VSMS')).toBeInTheDocument()
    expect(screen.getByText('VTMS')).toBeInTheDocument()
  })

  it('點第一則（linkUrl 為 /vsms/）只關閉面板，不導航', async () => {
    render(<NotificationBell />)
    await screen.findByTestId('notification-badge')
    await userEvent.click(screen.getByRole('button', { name: '通知' }))

    await userEvent.click(screen.getByText('你有一筆排程：PDN-1'))

    expect(markReadMock).toHaveBeenCalledWith('n1')
    expect(assignSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    expect(screen.queryByText('你有一筆排程：PDN-1')).not.toBeInTheDocument()
  })

  it('點第二則（linkUrl 為 /vtms/x）呼叫 window.location.assign', async () => {
    listMock.mockResolvedValue({
      items: [item(), item({ id: 'n2', source: 'vtms', title: 'VTMS 通知', linkUrl: '/vtms/x' })],
      unreadCount: 2,
    })
    render(<NotificationBell />)
    await screen.findByTestId('notification-badge')
    await userEvent.click(screen.getByRole('button', { name: '通知' }))

    await userEvent.click(screen.getByText('VTMS 通知'))

    expect(markReadMock).toHaveBeenCalledWith('n2')
    expect(assignSpy).toHaveBeenCalledWith('/vtms/x')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('linkUrl 為 http 開頭時 window.open 新分頁', async () => {
    listMock.mockResolvedValue({
      items: [item({ linkUrl: 'https://172.16.204.69/vtms' })],
      unreadCount: 1,
    })
    render(<NotificationBell />)
    await screen.findByTestId('notification-badge')
    await userEvent.click(screen.getByRole('button', { name: '通知' }))

    await userEvent.click(screen.getByText('你有一筆排程：PDN-1'))

    expect(openSpy).toHaveBeenCalledWith('https://172.16.204.69/vtms', '_blank', 'noopener')
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('linkUrl 為空時不導航', async () => {
    listMock.mockResolvedValue({ items: [item({ linkUrl: '' })], unreadCount: 1 })
    render(<NotificationBell />)
    await screen.findByTestId('notification-badge')
    await userEvent.click(screen.getByRole('button', { name: '通知' }))

    await userEvent.click(screen.getByText('你有一筆排程：PDN-1'))

    expect(assignSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('全部已讀清空徽章', async () => {
    render(<NotificationBell />)
    await screen.findByTestId('notification-badge')
    await userEvent.click(screen.getByRole('button', { name: '通知' }))

    await userEvent.click(screen.getByRole('button', { name: '全部已讀' }))

    expect(markAllReadMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument()
  })

  it('沒有通知時顯示空狀態', async () => {
    listMock.mockResolvedValue({ items: [], unreadCount: 0 })
    render(<NotificationBell />)
    await waitFor(() => expect(listMock).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '通知' }))

    expect(screen.getByText('目前沒有通知')).toBeInTheDocument()
  })

  it('讀取失敗時鈴鐺仍渲染並留下警告痕跡', async () => {
    const boom = new Error('boom')
    listMock.mockRejectedValue(boom)

    render(<NotificationBell />)

    await waitFor(() => expect(listMock).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed to load'), boom)
  })
})
