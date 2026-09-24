// src/__tests__/app-topbar.test.tsx
// App 登入後的外框：全域頂欄（UI 統一 4A）在最上面；頂欄下方是「左側欄＋內容區」一列
// （UI 統一 4C），4A 的 40px 第二列分頁已移除。頁面本體換成替身，這裡只驗外框的接線。
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
import { SIDEBAR_ID, NAV_COLLAPSED_KEY } from '../components/layout/Sidebar'
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

const sidebarEl = () => document.getElementById(SIDEBAR_ID)

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  useUIStore.setState({ view: 'main' })
  localStorage.removeItem(NAV_COLLAPSED_KEY)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('App 外框', () => {
  it('頂欄在最上面；側欄在頂欄下方、內容區左邊；沒有「回入口頁」', () => {
    login('super_admin')
    render(<App />)
    const topbar = screen.getByRole('banner')
    const sidebar = sidebarEl() as HTMLElement
    const nav = screen.getByRole('navigation', { name: '主選單' })
    const main = screen.getByRole('main')
    expect(within(topbar).getByRole('button', { name: '切換系統' })).toBeInTheDocument()
    expect(within(topbar).getByRole('button', { name: '開啟選單' })).toBeInTheDocument()
    expect(topbar.contains(sidebar)).toBe(false)
    expect(sidebar.contains(nav)).toBe(true)
    expect(topbar.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sidebar.parentElement).toBe(main.parentElement)
    expect(sidebar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('回入口頁')).toBeNull()
    expect(screen.getByText('甘特圖替身')).toBeInTheDocument()
  })

  it('沒有 4A 的第二列分頁：頂欄下方直接是側欄＋內容區那一列', () => {
    login('super_admin')
    render(<App />)
    const row = screen.getByRole('banner').nextElementSibling as HTMLElement
    expect(row.contains(sidebarEl())).toBe(true)
    expect(row.contains(screen.getByRole('main'))).toBe(true)
    expect(row.className).toContain('flex-1')
    expect(row.className).toContain('min-h-0')
    expect(document.querySelector('nav.h-10')).toBeNull()
    expect(screen.getAllByRole('navigation', { name: '主選單' })).toHaveLength(1)
  })

  it('內容區 flex-1 min-w-0：側欄收合時跟著變寬，甘特圖不會把版面撐開', () => {
    login('admin')
    render(<App />)
    const main = screen.getByRole('main')
    expect(main.className).toContain('flex-1')
    expect(main.className).toContain('min-w-0')
    expect(main.className).toContain('overflow-hidden')
  })

  it('點側欄「統計分析」切到統計頁，該項成為目前頁', async () => {
    login('super_admin')
    const user = userEvent.setup()
    render(<App />)
    const nav = screen.getByRole('navigation', { name: '主選單' })
    await user.click(within(nav).getByRole('button', { name: '統計分析' }))
    expect(await screen.findByText('統計替身')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: '統計分析' })).toHaveAttribute('aria-current', 'page')
  })

  it('admin 的側欄：排程管理、統計分析、系統設定', () => {
    login('admin')
    render(<App />)
    const nav = screen.getByRole('navigation', { name: '主選單' })
    expect(within(nav).getAllByRole('button').map(b => b.textContent))
      .toEqual(['排程管理', '統計分析', '系統設定'])
  })

  it.each<Role>(['user', 'guest'])('%s：沒有側欄，內容區佔滿寬度', role => {
    login(role)
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(sidebarEl()).toBeNull()
    expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
    expect(screen.queryByRole('button', { name: '開啟選單' })).toBeNull()
    expect(screen.getByText('甘特圖替身')).toBeInTheDocument()
  })
})
