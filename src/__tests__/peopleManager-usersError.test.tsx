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

  it('讀取成功：沒有失敗提示', async () => {
    apiMock.getUsers.mockResolvedValue([])
    render(<PeopleManager />)
    expect(await screen.findByText('Rock_Cai')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
