// src/__tests__/peopleManager-usersError.test.tsx
// 人員頁讀帳號失敗：名冊（來自 options）照常顯示，但上方要有「無法載入帳號」＋重試，
// 不能只靠會消失的 toast——toast 一走，每個人看起來都像「沒有帳號」
// （UI 統一第 3 項 E，規格修正清單第 6 項）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useOptionsStore } from '../store/optionsStore'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import type { OptionsMap } from '../types'

const apiMock = vi.hoisted(() => ({ getUsers: vi.fn() }))
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, ...apiMock } }
})

import { PeopleManager } from '../components/settings/PeopleManager'

const options: OptionsMap = {
  testUnits: [{
    id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: null,
    engineers: [{ id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null }],
  }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

beforeEach(() => {
  apiMock.getUsers.mockReset()
  useOptionsStore.setState({ options })
  useAuthStore.setState({ authProvider: 'local' })
  useToastStore.getState().clear()
})

describe('PeopleManager 讀帳號失敗', () => {
  it('上方顯示「無法載入帳號」＋錯誤小字＋重試，名冊仍在，toast 保留', async () => {
    apiMock.getUsers.mockRejectedValue(new Error('資料庫連線逾時'))
    render(<PeopleManager />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('無法載入帳號')
    expect(alert).toHaveTextContent('資料庫連線逾時')
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()

    // 名冊照常畫出來，而且在提示的下方
    const row = screen.getByText('Rock_Cai')
    expect(alert.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(useToastStore.getState().toasts.map(t => t.text)).toContain('載入帳號列表失敗')
  })

  it('按重試：重新讀帳號，成功後提示消失', async () => {
    apiMock.getUsers
      .mockRejectedValueOnce(new Error('資料庫連線逾時'))
      .mockResolvedValueOnce([])
    const user = userEvent.setup()
    render(<PeopleManager />)

    await user.click(await screen.findByRole('button', { name: '重試' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(apiMock.getUsers).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Rock_Cai')).toBeInTheDocument()
  })

  it('重試進行中：按鈕消失，即使再次嘗試點擊也不會發出第二次重試請求', async () => {
    apiMock.getUsers
      .mockRejectedValueOnce(new Error('資料庫連線逾時'))
      .mockReturnValueOnce(new Promise(() => {})) // 重試請求永不 resolve，模擬進行中
    const user = userEvent.setup()
    render(<PeopleManager />)

    const retryButton = await screen.findByRole('button', { name: '重試' })
    await user.click(retryButton)

    // 重試中：按鈕應該消失（ListState 沒收到 onRetry 就不畫按鈕）
    await waitFor(() => expect(screen.queryByRole('button', { name: '重試' })).toBeNull())
    // 頁面不能整個跳回「載入中...」，名冊與失敗提示（含錯誤小字）都還在
    expect(screen.queryByText('載入中...')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('無法載入帳號')
    expect(screen.getByText('Rock_Cai')).toBeInTheDocument()

    // 呼叫次數固定在 2（初始 1 次 + 重試 1 次），沒有按鈕可再點，
    // 即使有殘留的 click 事件也不會再打第三次
    expect(apiMock.getUsers).toHaveBeenCalledTimes(2)
  })

  it('讀取成功：沒有失敗提示', async () => {
    apiMock.getUsers.mockResolvedValue([])
    render(<PeopleManager />)
    expect(await screen.findByText('Rock_Cai')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
