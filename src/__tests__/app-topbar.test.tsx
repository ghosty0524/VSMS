// src/__tests__/app-topbar.test.tsx
// App 登入後的外框（UI 統一 4A）：新頂欄在最上面，導覽分頁列在頂欄下方（不在頂欄裡），
// 舊 Header 的「回入口頁」不再出現。頁面本體換成替身，這裡只驗外框的接線。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

// factory 裡不寫 JSX（vi.mock 會被提到檔案最上面）；替身元件直接回傳字串。
vi.mock('../components/ProtectedLayout', () => ({
  ProtectedLayout: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../components/schedule/GanttChart', () => ({ GanttChart: () => '甘特圖替身' }))
vi.mock('../components/settings/SettingsPage', () => ({ SettingsPage: () => '設定替身' }))
vi.mock('../components/analytics/AnalyticsPage', () => ({ default: () => '統計替身' }))
vi.mock('../components/audit/AuditPage', () => ({ default: () => '審計替身' }))
vi.mock('../components/shared/SessionExpiryWarning', () => ({ SessionExpiryWarning: () => null }))
vi.mock('../components/shared/StaleBuildBanner', () => ({ StaleBuildBanner: () => null }))

import { App } from '../App'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import type { Role } from '../types'

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
  new Response('{}', { status: 404 }))

function login(role: Role) {
  useAuthStore.setState({
    isLoggedIn: true, isChecking: false, role, displayName: '系統管理員', username: 'admin',
    authProvider: 'local', checkAuth: vi.fn(async () => {}),
  })
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  useUIStore.setState({ view: 'main' })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('App 外框', () => {
  it('頂欄在最上面、導覽分頁列在頂欄下方，沒有「回入口頁」', () => {
    login('super_admin')
    render(<App />)
    const topbar = screen.getByRole('banner')
    const nav = screen.getByRole('navigation', { name: '主導覽' })
    expect(within(topbar).getByRole('button', { name: '切換系統' })).toBeInTheDocument()
    expect(topbar.contains(nav)).toBe(false)
    expect(topbar.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('回入口頁')).toBeNull()
    expect(screen.getByText('甘特圖替身')).toBeInTheDocument()
  })

  it('點「統計分析」切到統計頁', async () => {
    login('super_admin')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '統計分析' }))
    expect(await screen.findByText('統計替身')).toBeInTheDocument()
  })

  it('測試人員：只有頂欄，沒有導覽分頁列', () => {
    login('user')
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '主導覽' })).toBeNull()
  })
})
