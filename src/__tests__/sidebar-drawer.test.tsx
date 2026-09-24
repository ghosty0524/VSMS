// src/__tests__/sidebar-drawer.test.tsx
// 窄螢幕（< md）的側欄抽屜與頂欄最左邊的「選單」鈕（UI 統一 4C）。
// jsdom 不套 Tailwind 的媒體查詢，所以桌面側欄與抽屜同時在 DOM 裡；抽屜關閉時是
// aria-hidden＋inert，不在無障礙樹裡，查 role 時不會跟桌面側欄撞在一起。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Topbar } from '../components/layout/Topbar'
import {
  Sidebar, SIDEBAR_ID, NAV_DRAWER_ID, NAV_COLLAPSED_KEY, DESKTOP_MEDIA_QUERY,
} from '../components/layout/Sidebar'
import { useAuthStore } from '../store/authStore'
import { useNavDrawerStore } from '../store/navDrawerStore'
import type { Role, View } from '../types'

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
  new Response('{}', { status: 404 }))

function login(role: Role) {
  useAuthStore.setState({
    isLoggedIn: true, isChecking: false, role, displayName: 'Will Wang', username: 'Will_Wang',
    authProvider: 'local',
  })
}

// App 的縮影：頂欄＋側欄共用抽屜狀態（navDrawerStore），頁面切換用本地 state。
function Shell({ role }: { role: Role }) {
  const [view, setView] = useState<View>('main')
  return (
    <>
      <Topbar />
      <Sidebar currentView={view} onNavigate={setView} role={role} />
    </>
  )
}

function renderShell(role: Role = 'admin') {
  login(role)
  return render(<Shell role={role} />)
}

const menuButton = () => screen.getByRole('button', { name: '開啟選單' })
const drawerEl = () => document.getElementById(NAV_DRAWER_ID)
const desktopSidebar = () => document.getElementById(SIDEBAR_ID) as HTMLElement
const classes = (el: Element) => el.className.split(/\s+/)

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(menuButton())
  return screen.getByRole('dialog', { name: '主選單' })
}

// jsdom 沒有 matchMedia；換成可以手動觸發 change 的假物件。
function stubMatchMedia() {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    matches: false,
    media: DESKTOP_MEDIA_QUERY,
    onchange: null,
    addEventListener: (_type: string, l: (e: MediaQueryListEvent) => void) => { listeners.add(l) },
    removeEventListener: (_type: string, l: (e: MediaQueryListEvent) => void) => { listeners.delete(l) },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
  const matchMedia = vi.fn((_query: string) => mql as unknown as MediaQueryList)
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    matchMedia,
    listenerCount: () => listeners.size,
    fire(matches: boolean) {
      mql.matches = matches
      for (const l of [...listeners]) l({ matches } as MediaQueryListEvent)
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useNavDrawerStore.setState({ open: false })
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('頂欄「選單」鈕', () => {
  it('在頂欄最左邊（產品切換之前）、32×32、只在 < md 顯示；aria-controls 指向抽屜', () => {
    renderShell('admin')
    const btn = menuButton()
    const banner = screen.getByRole('banner')
    expect(banner.firstElementChild).toBe(btn)
    expect(btn.compareDocumentPosition(screen.getByRole('button', { name: '切換系統' }))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const c of ['md:hidden', 'h-8', 'w-8']) expect(classes(btn)).toContain(c)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', NAV_DRAWER_ID)
    expect(drawerEl()).not.toBeNull()
    expect(btn.querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  it.each<Role>(['user', 'guest'])('%s：沒有側欄，也沒有選單鈕與抽屜', role => {
    renderShell(role)
    expect(screen.queryByRole('button', { name: '開啟選單' })).toBeNull()
    expect(drawerEl()).toBeNull()
    expect(document.getElementById(SIDEBAR_ID)).toBeNull()
  })
})

describe('窄螢幕抽屜', () => {
  it('關閉時不在無障礙樹、不能聚焦；桌面側欄在 < md 隱藏、抽屜在 ≥ md 隱藏', () => {
    renderShell('admin')
    const drawer = drawerEl() as HTMLElement
    expect(drawer).toHaveAttribute('aria-hidden', 'true')
    expect(drawer).toHaveAttribute('inert')
    expect(classes(drawer)).toContain('invisible')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(classes(desktopSidebar())).toContain('hidden')
    expect(classes(desktopSidebar())).toContain('md:flex')
    expect(classes(drawer.parentElement as HTMLElement)).toContain('md:hidden')
  })

  it('打開：aria-expanded=true；從左側、232px、遮罩色、z-index 在頂欄之上對話框之下；焦點到第一個項目', async () => {
    const user = userEvent.setup()
    renderShell('admin')
    const dlg = await openDrawer(user)
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).not.toHaveAttribute('inert')
    for (const c of [
      'fixed', 'inset-y-0', 'left-0', 'w-[232px]', 'z-[46]', 'translate-x-0', 'bg-[var(--vw-surface)]',
    ]) expect(classes(dlg)).toContain(c)
    expect(classes(dlg)).not.toContain('invisible')
    const scrim = screen.getByTestId('nav-drawer-scrim')
    for (const c of ['fixed', 'inset-0', 'z-[45]', 'bg-[rgba(23,33,46,0.4)]']) expect(classes(scrim)).toContain(c)
    expect(within(dlg).getByRole('navigation', { name: '主選單' })).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: '排程管理' })).toHaveFocus()
  })

  it('抽屜一律展開樣式、沒有收合鈕，也不改變桌面側欄的收合狀態', async () => {
    localStorage.setItem(NAV_COLLAPSED_KEY, '1')
    const user = userEvent.setup()
    renderShell('super_admin')
    expect(classes(desktopSidebar())).toContain('w-14')
    const dlg = await openDrawer(user)
    expect(within(dlg).getByText('排程')).toBeInTheDocument()
    expect(within(dlg).getByText('系統')).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: '審計紀錄' })).toHaveTextContent('審計紀錄')
    expect(within(dlg).getByRole('button', { name: '審計紀錄' })).not.toHaveAttribute('title')
    expect(within(dlg).queryAllByTestId('nav-group-divider')).toHaveLength(0)
    expect(within(dlg).queryByRole('button', { name: /側欄/ })).toBeNull()
    expect(classes(desktopSidebar())).toContain('w-14')
    expect(localStorage.getItem(NAV_COLLAPSED_KEY)).toBe('1')
  })

  it('點遮罩關閉，焦點回選單鈕', async () => {
    const user = userEvent.setup()
    renderShell('admin')
    await openDrawer(user)
    await user.click(screen.getByTestId('nav-drawer-scrim'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(drawerEl()).toHaveAttribute('aria-hidden', 'true')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton()).toHaveFocus()
  })

  it('按 Esc 關閉，焦點回選單鈕', async () => {
    const user = userEvent.setup()
    renderShell('admin')
    await openDrawer(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(menuButton()).toHaveFocus()
  })

  it('點抽屜內項目：切換頁面、關閉、焦點回選單鈕', async () => {
    const user = userEvent.setup()
    renderShell('admin')
    const dlg = await openDrawer(user)
    await user.click(within(dlg).getByRole('button', { name: '統計分析' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(menuButton()).toHaveFocus()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(within(desktopSidebar()).getByRole('button', { name: '統計分析' }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('Tab／Shift+Tab 在抽屜內循環', async () => {
    const user = userEvent.setup()
    renderShell('admin')
    const dlg = await openDrawer(user)
    const [first, second, last] = within(dlg).getAllByRole('button')
    expect(first).toHaveFocus()
    await user.tab()
    expect(second).toHaveFocus()
    await user.tab()
    expect(last).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  // 與入口頁一致：面板本身 tabIndex=-1，點到空白處焦點停在面板上（不掉到 body），
  // 從面板按 Shift+Tab 也要繞回最後一項，焦點不會跑出抽屜。
  it('點到面板空白處時焦點停在面板上，Tab／Shift+Tab 仍在抽屜內', async () => {
    const user = userEvent.setup()
    renderShell('admin')
    const dlg = await openDrawer(user)
    const buttons = within(dlg).getAllByRole('button')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    expect(dlg).toHaveAttribute('tabindex', '-1')
    expect(classes(dlg)).toContain('focus:outline-none')
    await user.click(dlg)
    expect(dlg).toHaveFocus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.click(dlg)
    expect(dlg).toHaveFocus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('視窗放大到 ≥ md 時關閉、焦點不送回選單鈕；縮小的變化不關閉', async () => {
    const mq = stubMatchMedia()
    const user = userEvent.setup()
    renderShell('admin')
    await openDrawer(user)
    expect(mq.matchMedia).toHaveBeenCalledWith('(min-width: 768px)')
    act(() => mq.fire(false))
    expect(screen.getByRole('dialog', { name: '主選單' })).toBeInTheDocument()
    act(() => mq.fire(true))
    expect(screen.queryByRole('dialog')).toBeNull()
    // 放大後「選單」鈕已隱藏，不把焦點送回去。
    expect(menuButton()).not.toHaveFocus()
    expect(mq.listenerCount()).toBe(0)
  })

  it('Sidebar 卸載時把抽屜狀態歸零（下次掛載不會自己開著）', () => {
    useNavDrawerStore.setState({ open: true })
    const { unmount } = render(<Sidebar currentView="main" onNavigate={vi.fn()} role="admin" />)
    unmount()
    expect(useNavDrawerStore.getState().open).toBe(false)
  })
})
