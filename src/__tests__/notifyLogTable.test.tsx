import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { NotifyLog } from '../types'

const notifyLogs = vi.fn()

vi.mock('../lib/api', () => ({
  api: { notifyLogs: () => notifyLogs() },
  ApiError: class ApiError extends Error {},
}))

const { NotifyLogTable } = await import('../components/settings/NotifyLogTable')

// 用本地時間建構，再轉成 ISO 交給元件 —— 這樣不論測試機在哪個時區，期望值
// 都還是 2026/08/27 14:05，不會因為 UTC 換算而飄動。
const HANDLED_AT = new Date(2026, 7, 27, 14, 5)

const log = (o: Partial<NotifyLog> = {}): NotifyLog => ({
  id: 'l1',
  scheduleId: 's1',
  sendDate: '2026/08/25',
  status: 'sent',
  recipients: 'amy_chen@example.com',
  errorMessage: null,
  attempts: 1,
  messageId: null,
  smtpResponse: null,
  sentAt: null,
  // 建立於 08/20、今天才處理完 —— 兩個時間刻意不同，才看得出畫面顯示的是哪一個
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: HANDLED_AT.toISOString(),
  projectName: 'PDN-250031',
  testUnit: 'RA',
  startDate: '2026/08/28',
  ...o,
})

beforeEach(() => {
  notifyLogs.mockReset()
  notifyLogs.mockResolvedValue({ logs: [log()] })
})

describe('NotifyLogTable', () => {
  it('最後處理與預定寄信日分成兩欄，內容各自對應 updatedAt 與 sendDate', async () => {
    // 使用者回報的症狀：畫面上唯一的日期是預定寄信日，補寄時它會早於實際
    // 處理日，看起來就像記錄沒更新。兩欄都在，才分得出來。
    render(<NotifyLogTable />)

    expect(await screen.findByText('2026/08/27 14:05')).toBeInTheDocument()
    expect(screen.getByText('2026/08/25')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '最後處理' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '預定寄信日' })).toBeInTheDocument()
  })

  it('updatedAt 不是合法時間時原樣顯示，不會渲染成 Invalid Date', async () => {
    notifyLogs.mockResolvedValue({ logs: [log({ updatedAt: 'not-a-date' })] })
    render(<NotifyLogTable />)

    expect(await screen.findByText('not-a-date')).toBeInTheDocument()
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument()
  })

  it('排程已刪除時（projectName 為空字串）顯示灰字提示', async () => {
    notifyLogs.mockResolvedValue({ logs: [log({ projectName: '', testUnit: '' })] })
    render(<NotifyLogTable />)

    expect(await screen.findByText('（排程已刪除）')).toBeInTheDocument()
  })

  it('refreshToken 改變時重新抓取記錄', async () => {
    // 「立即檢查並補寄」跑完後，外層靠遞增這個值把新產生的記錄帶進畫面。
    const { rerender } = render(<NotifyLogTable refreshToken={0} />)
    await waitFor(() => expect(notifyLogs).toHaveBeenCalledTimes(1))

    rerender(<NotifyLogTable refreshToken={1} />)
    await waitFor(() => expect(notifyLogs).toHaveBeenCalledTimes(2))
  })

  it('refreshToken 沒變就不重複抓取', async () => {
    const { rerender } = render(<NotifyLogTable refreshToken={3} />)
    await waitFor(() => expect(notifyLogs).toHaveBeenCalledTimes(1))

    rerender(<NotifyLogTable refreshToken={3} />)
    await waitFor(() => expect(notifyLogs).toHaveBeenCalledTimes(1))
  })
})

describe('NotifyLogTable — 平台寄送狀態', () => {
  it('platformStatus 有值時優先顯示平台狀態，而非本地 status 的文字', async () => {
    notifyLogs.mockResolvedValue({ logs: [log({ status: 'accepted', platformStatus: 'sent' })] })
    render(<NotifyLogTable />)

    expect(await screen.findByText('已寄出')).toBeInTheDocument()
    // 本地狀態「已交平台」不該同時顯示出來，這一格只顯示平台狀態。
    expect(screen.queryByText('已交平台')).not.toBeInTheDocument()
  })
})

describe('NotifyLogTable — 新前端搭舊後端的過渡期', () => {
  it('後端還沒回 updatedAt 時退回 createdAt，不顯示 undefined', async () => {
    const stale = log()
    delete (stale as { updatedAt?: string }).updatedAt
    stale.createdAt = new Date(2026, 7, 20, 9, 30).toISOString()
    notifyLogs.mockResolvedValue({ logs: [stale] })

    render(<NotifyLogTable />)

    expect(await screen.findByText('2026/08/20 09:30')).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })
})
