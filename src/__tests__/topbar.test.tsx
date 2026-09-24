// src/__tests__/topbar.test.tsx
// 全域頂欄（UI 統一 4A）。規格「測試」一節的每系統 Topbar 項目：產品切換下拉、
// 並排連結、/portal/apps 失敗退回、未讀數、使用者選單、下拉的鍵盤行為。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Topbar } from '../components/layout/Topbar'
import { useAuthStore } from '../store/authStore'
import type { Role } from '../types'

const APPS_URL = '/portal/apps'
const INBOX_URL = '/notify/inbox?limit=1'

// 故意不照 sortOrder 排，驗證頂欄有排序；lab 不顯示在頂欄、但要在下拉裡。
const APPS = [
  { code: 'vsms', name: 'VSMS', description: '工作排程、設備排程、負載分析', url: '/vsms/', sortOrder: 2, showInTopbar: true },
  { code: 'lab', name: '實驗室預約', description: '設備與場地借用', url: '/lab/', sortOrder: 3, showInTopbar: false },
  { code: 'vtms', name: 'VTMS', description: '測試計畫、任務、案例、報告', url: '/vtms/', sortOrder: 1, showInTopbar: true },
]

type Route = { status: number; body: unknown }
let routes: Record<string, Route> = {}
const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const r = routes[String(input)]
  if (!r) return new Response('{}', { status: 404 })
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
const calls = (url: string) => fetchMock.mock.calls.filter(c => String(c[0]) === url).length
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

const logoutMock = vi.fn(async () => {})

function login(role: Role, authProvider: 'local' | 'vauth' = 'vauth', displayName = 'Will Wang') {
  useAuthStore.setState({
    isLoggedIn: true, isChecking: false, role, displayName, username: displayName,
    authProvider, logout: logoutMock,
  })
}

function unread(n: number) {
  routes[INBOX_URL] = { status: 200, body: { items: [], unreadCount: n, total: n } }
}

beforeEach(() => {
  fetchMock.mockClear()
  logoutMock.mockClear()
  routes = { [APPS_URL]: { status: 200, body: { apps: APPS } } }
  unread(3)
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

async function openSwitcher(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '切換系統' }))
  return screen.getByRole('menu', { name: '切換系統' })
}

async function openUserMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '使用者選單' }))
  return screen.getByRole('menu', { name: '使用者選單' })
}

describe('Topbar：版面', () => {
  it('48px 高的 header，由左到右：產品切換、並排連結、鈴鐺、使用者選單', async () => {
    login('admin')
    render(<Topbar />)
    const header = screen.getByRole('banner')
    expect(header.className).toContain('h-12')
    const nav = await screen.findByRole('navigation', { name: '系統' })
    const order = [
      screen.getByRole('button', { name: '切換系統' }),
      nav,
      screen.getByRole('link', { name: '通知' }),
      screen.getByRole('button', { name: '使用者選單' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.queryByText('回入口頁')).toBeNull()
  })
})

describe('Topbar：產品切換與並排連結', () => {
  it('下拉列出入口頁首頁＋所有啟用系統（含不在頂欄的），只有 VSMS 打勾', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    await screen.findByRole('navigation', { name: '系統' })

    const items = within(await openSwitcher(user)).getAllByRole('menuitem')
    expect(items.map(i => i.getAttribute('href'))).toEqual(['/', '/vtms/', '/vsms/', '/lab/'])
    expect(items[0]).toHaveTextContent('入口頁首頁')
    expect(items[3]).toHaveTextContent('實驗室預約')
    expect(items[3]).toHaveTextContent('設備與場地借用')
    expect(items[2]).toHaveAttribute('aria-current', 'page')
    expect(items.filter(i => i.getAttribute('aria-current') === 'page')).toHaveLength(1)
  })

  it('並排連結只列 showInTopbar 的系統、依 sortOrder；VSMS 有 aria-current', async () => {
    login('admin')
    render(<Topbar />)
    const nav = await screen.findByRole('navigation', { name: '系統' })
    const links = within(nav).getAllByRole('link')
    expect(links.map(l => l.textContent)).toEqual(['VTMS', 'VSMS'])
    expect(links.map(l => l.getAttribute('href'))).toEqual(['/vtms/', '/vsms/'])
    expect(links[1]).toHaveAttribute('aria-current', 'page')
    expect(links[0]).not.toHaveAttribute('aria-current')
  })

  it('/portal/apps 失敗：退回內建三項（入口頁首頁、VTMS、VSMS）', async () => {
    routes[APPS_URL] = { status: 500, body: {} }
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    const nav = await screen.findByRole('navigation', { name: '系統' })
    expect(within(nav).getAllByRole('link').map(l => l.getAttribute('href'))).toEqual(['/vtms/', '/vsms/'])

    const items = within(await openSwitcher(user)).getAllByRole('menuitem')
    expect(items.map(i => i.getAttribute('href'))).toEqual(['/', '/vtms/', '/vsms/'])
    expect(items[0]).toHaveTextContent('入口頁首頁')
  })

  it('local 模式：不打 vauth，直接用內建清單', async () => {
    login('admin', 'local')
    render(<Topbar />)
    const nav = screen.getByRole('navigation', { name: '系統' })
    expect(within(nav).getAllByRole('link').map(l => l.textContent)).toEqual(['VTMS', 'VSMS'])
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Topbar：通知鈴鐺', () => {
  it('有未讀：顯示數字；鈴鐺連到入口頁 /inbox', async () => {
    login('admin')
    render(<Topbar />)
    expect(await screen.findByTestId('topbar-unread')).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: '通知' })).toHaveAttribute('href', '/inbox')
  })

  it('徽章用框架紅 --vw-chrome-badge（對墨色頂欄 ≥ 3）、白字，不用 --vw-danger-solid', async () => {
    login('admin')
    render(<Topbar />)
    const badge = await screen.findByTestId('topbar-unread')
    expect(badge).toHaveClass('bg-[var(--vw-chrome-badge)]', 'text-white')
    expect(badge.className).not.toContain('--vw-danger-solid')
  })

  it('超過 99 顯示 99+', async () => {
    unread(150)
    login('admin')
    render(<Topbar />)
    expect(await screen.findByTestId('topbar-unread')).toHaveTextContent('99+')
  })

  it('0 則：不顯示徽章', async () => {
    unread(0)
    login('admin')
    render(<Topbar />)
    await waitFor(() => expect(calls(INBOX_URL)).toBe(1))
    await flush()
    expect(screen.queryByTestId('topbar-unread')).toBeNull()
  })

  it('讀取失敗：不顯示數字，鈴鐺仍在', async () => {
    routes[INBOX_URL] = { status: 500, body: {} }
    login('admin')
    render(<Topbar />)
    await waitFor(() => expect(calls(INBOX_URL)).toBe(1))
    await flush()
    expect(screen.queryByTestId('topbar-unread')).toBeNull()
    expect(screen.getByRole('link', { name: '通知' })).toBeInTheDocument()
  })

  it('只在掛載時讀一次：重新 render、store 變動都不再打請求', async () => {
    login('admin')
    const { rerender } = render(<Topbar />)
    await screen.findByTestId('topbar-unread')
    rerender(<Topbar />)
    act(() => { useAuthStore.setState({ displayName: 'Will W.' }) })
    await flush()
    expect(calls(INBOX_URL)).toBe(1)
    expect(calls(APPS_URL)).toBe(1)
  })

  it('訪客：不讀未讀數，也不顯示鈴鐺', async () => {
    login('guest', 'vauth', '訪客')
    render(<Topbar />)
    await waitFor(() => expect(calls(APPS_URL)).toBe(1))
    await flush()
    expect(calls(INBOX_URL)).toBe(0)
    expect(screen.queryByRole('link', { name: '通知' })).toBeNull()
  })

  it('local 模式：鈴鐺在，但沒有數字', async () => {
    login('admin', 'local')
    render(<Topbar />)
    await flush()
    expect(screen.getByRole('link', { name: '通知' })).toBeInTheDocument()
    expect(screen.queryByTestId('topbar-unread')).toBeNull()
  })
})

describe('Topbar：使用者選單', () => {
  it('按鈕：頭像縮寫＋名稱，aria-haspopup="menu"', () => {
    login('admin', 'local')
    render(<Topbar />)
    const btn = screen.getByRole('button', { name: '使用者選單' })
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    expect(btn).toHaveTextContent('WI')
    expect(btn).toHaveTextContent('Will Wang')
  })

  it.each<[Role, string]>([
    ['super_admin', '超級管理者'],
    ['admin', '管理者'],
    ['user', '測試人員'],
    ['guest', '訪客（唯讀）'],
  ])('%s：標頭顯示名稱與「%s」', async (role, label) => {
    login(role, 'local')
    const user = userEvent.setup()
    render(<Topbar />)
    const menu = await openUserMenu(user)
    expect(within(menu).getByText('Will Wang')).toBeInTheDocument()
    expect(within(menu).getByText(label)).toBeInTheDocument()
  })

  it('vauth 非訪客：「修改密碼」連到入口頁 /change-password，「登出」在分隔線之後', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    const menu = await openUserMenu(user)
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map(i => i.textContent)).toEqual(['修改密碼', '登出'])
    expect(items[0]).toHaveAttribute('href', '/change-password')
    expect(within(menu).getByRole('separator').nextElementSibling).toBe(items[1])
  })

  it('vauth 訪客：沒有「修改密碼」，也沒有多餘的分隔線', async () => {
    login('guest', 'vauth', '訪客')
    const user = userEvent.setup()
    render(<Topbar />)
    const menu = await openUserMenu(user)
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['登出'])
    expect(within(menu).queryByRole('separator')).toBeNull()
  })

  it('local 模式：沒有「修改密碼」（維持現狀）', async () => {
    login('super_admin', 'local')
    const user = userEvent.setup()
    render(<Topbar />)
    const menu = await openUserMenu(user)
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['登出'])
  })

  it('「登出」呼叫既有的 authStore.logout', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    const menu = await openUserMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: '登出' }))
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })
})

describe('Topbar：下拉的鍵盤與關閉行為', () => {
  it('使用者選單：上下鍵循環、Esc 關閉並把焦點還給按鈕', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    const trigger = screen.getByRole('button', { name: '使用者選單' })
    const menu = await openUserMenu(user)
    const [pw, out] = within(menu).getAllByRole('menuitem')

    expect(pw).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(out).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(pw).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('產品切換：上下鍵移動、點外面關閉', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    await screen.findByRole('navigation', { name: '系統' })
    const items = within(await openSwitcher(user)).getAllByRole('menuitem')

    expect(items[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(items[items.length - 1]).toHaveFocus()

    await user.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('兩個清單都掛在 body、z-index 蓋過甘特圖全螢幕', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    const switcher = await openSwitcher(user)
    expect(switcher.parentElement).toBe(document.body)
    expect(switcher.className).toContain('z-[110]')
    await user.keyboard('{Escape}')

    const userMenu = await openUserMenu(user)
    expect(userMenu.parentElement).toBe(document.body)
    expect(userMenu.className).toContain('z-[110]')
  })
})

describe('Topbar：產品切換的負邊距（窄螢幕選單鈕到切換鈕 16px）', () => {
  // 用空白切成 token 比對：直接比字串的話，'md:-ml-1.5' 會被當成包含 '-ml-1.5'。
  const switcherTokens = () => screen.getByRole('button', { name: '切換系統' }).className.split(/\s+/)

  it.each<Role>(['super_admin', 'admin'])('%s（有選單鈕）：負邊距只在 md 以上', role => {
    login(role, 'local')
    render(<Topbar />)
    expect(screen.getByRole('button', { name: '開啟選單' })).toBeInTheDocument()
    expect(switcherTokens()).toContain('md:-ml-1.5')
    expect(switcherTokens()).not.toContain('-ml-1.5')
  })

  it.each<Role>(['user', 'guest'])('%s（沒有選單鈕）：任何寬度都保留 -ml-1.5', role => {
    login(role, 'local')
    render(<Topbar />)
    expect(screen.queryByRole('button', { name: '開啟選單' })).toBeNull()
    expect(switcherTokens()).toContain('-ml-1.5')
    expect(switcherTokens()).not.toContain('md:-ml-1.5')
  })
})
