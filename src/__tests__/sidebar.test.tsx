// src/__tests__/sidebar.test.tsx
// VSMS 左側欄（UI 統一 4C）：分組與項目依角色、目前頁、尺寸、收合與 localStorage。
// 取代 4A 的 navTabs.test.tsx。窄螢幕抽屜與頂欄「選單」鈕在 sidebar-drawer.test.tsx。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Sidebar, visibleNavGroups, sidebarVisible, NAV_COLLAPSED_KEY, SIDEBAR_ID,
} from '../components/layout/Sidebar'
import type { Role, View } from '../types'

function renderSidebar(role: Role = 'super_admin', currentView: View = 'main') {
  const onNavigate = vi.fn()
  const utils = render(<Sidebar currentView={currentView} onNavigate={onNavigate} role={role} />)
  return { onNavigate, ...utils }
}
const sidebarEl = () => document.getElementById(SIDEBAR_ID) as HTMLElement
const mainNav = () => screen.getByRole('navigation', { name: '主選單' })

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('Sidebar：分組與項目依角色', () => {
  it.each<[Role, Array<[string, string[]]>]>([
    ['super_admin', [['排程', ['排程管理', '統計分析']], ['系統', ['系統設定', '審計紀錄']]]],
    ['admin', [['排程', ['排程管理', '統計分析']], ['系統', ['系統設定']]]],
    ['user', [['排程', ['排程管理']]]],
    ['guest', [['排程', ['排程管理']]]],
  ])('%s 的分組與項目（篩選後沒有項目的組整組拿掉）', (role, expected) => {
    expect(visibleNavGroups(role).map(g => [g.title, g.items.map(i => i.label)])).toEqual(expected)
  })

  it('項目對應的頁面代碼與順序', () => {
    expect(visibleNavGroups('super_admin').flatMap(g => g.items.map(i => i.key)))
      .toEqual(['main', 'analytics', 'settings', 'audit'])
  })

  it.each<[Role, boolean]>([
    ['super_admin', true], ['admin', true], ['user', false], ['guest', false],
  ])('%s 顯示側欄：%s', (role, visible) => {
    expect(sidebarVisible(role)).toBe(visible)
  })

  it.each<Role>(['user', 'guest'])('%s 只有一個可見項目：整個側欄不渲染', role => {
    const { container } = renderSidebar(role)
    expect(container).toBeEmptyDOMElement()
  })

  it('admin：「排程」「系統」兩組；「系統」組只有系統設定', () => {
    renderSidebar('admin')
    const nav = mainNav()
    const sched = within(nav).getByRole('group', { name: '排程' })
    const sys = within(nav).getByRole('group', { name: '系統' })
    expect(within(sched).getAllByRole('button').map(b => b.textContent)).toEqual(['排程管理', '統計分析'])
    expect(within(sys).getAllByRole('button').map(b => b.textContent)).toEqual(['系統設定'])
  })
})

describe('Sidebar：版面、目前頁與點擊', () => {
  it('展開寬 232px；底色、右邊框用 token；寬度 150ms 過場只在允許動畫時', () => {
    renderSidebar()
    const cls = sidebarEl().className
    for (const c of [
      'w-[232px]', 'bg-[var(--vw-surface)]', 'border-r', 'border-[var(--vw-border)]',
      'motion-safe:transition-[width]', 'duration-150',
    ]) expect(cls).toContain(c)
  })

  it('導覽區自己捲動、左右內距 8px；收合鈕固定在底部、不在捲動區裡、高 36px', () => {
    renderSidebar()
    const nav = mainNav()
    expect(nav.className).toContain('overflow-y-auto')
    expect(nav.className).toContain('px-2')
    const btn = screen.getByRole('button', { name: '收合側欄' })
    expect(nav.contains(btn)).toBe(false)
    expect(sidebarEl().tagName).toBe('ASIDE')
    expect(sidebarEl().lastElementChild?.contains(btn)).toBe(true)
    expect(btn.className).toContain('h-9')
  })

  it('分組標題：11px、600、muted 色、字距 0.04em、左右 12px；組間 16px', () => {
    renderSidebar()
    // 限定在桌面側欄裡找：Task 2 之後抽屜一直掛著，同樣的標題文字也在抽屜裡（aria-hidden，
    // role 查詢會略過，但 getByText 不會）。
    const title = within(sidebarEl()).getByText('排程')
    for (const c of [
      'text-[11px]', 'font-semibold', 'text-[var(--vw-text-muted)]', 'tracking-[0.04em]', 'px-3',
    ]) expect(title.className).toContain(c)
    const groupsWrap = within(mainNav()).getByRole('group', { name: '排程' }).parentElement as HTMLElement
    expect(groupsWrap.className).toContain('gap-4')
  })

  it('項目：36px 高、左右 12px、圓角 token、13px 字、圖示與文字間距 10px、圖示 18px；項目間距 2px', () => {
    renderSidebar()
    const item = screen.getByRole('button', { name: '排程管理' })
    for (const c of ['h-9', 'px-3', 'rounded-[var(--vw-radius-control)]', 'text-[13px]', 'gap-2.5']) {
      expect(item.className).toContain(c)
    }
    expect(item.querySelector('svg')?.getAttribute('width')).toBe('18')
    expect(item.closest('ul')?.className).toContain('gap-0.5')
  })

  it('目前頁：aria-current="page"＋框架上的選取樣式（active 底、主要字、左側 3px 淺版識別色線）；其他項目沒有，hover 用 surface-subtle', () => {
    renderSidebar('super_admin', 'settings')
    const cur = screen.getByRole('button', { name: '系統設定' })
    expect(cur).toHaveAttribute('aria-current', 'page')
    expect(cur.className).toContain('bg-[var(--vw-accent-subtle)]')
    expect(cur.className).toContain('text-[var(--vw-ink)]')
    expect(cur.className).toContain('shadow-[inset_3px_0_0_var(--vw-accent-on-chrome)]')
    expect(cur.className).not.toContain('text-[var(--vw-accent)]')
    const other = screen.getByRole('button', { name: '排程管理' })
    expect(other).not.toHaveAttribute('aria-current')
    expect(other.className).toContain('hover:bg-[var(--vw-surface-subtle)]')
    expect(within(mainNav()).getAllByRole('button')
      .filter(b => b.getAttribute('aria-current') === 'page')).toHaveLength(1)
  })

  it('點項目呼叫 onNavigate(頁面代碼)', async () => {
    const user = userEvent.setup()
    const { onNavigate } = renderSidebar()
    await user.click(screen.getByRole('button', { name: '審計紀錄' }))
    expect(onNavigate).toHaveBeenCalledWith('audit')
  })
})

describe('Sidebar：收合', () => {
  it('預設展開：收合鈕文字「收合側欄」、aria-expanded=true、aria-controls 指向側欄', () => {
    renderSidebar()
    const btn = screen.getByRole('button', { name: '收合側欄' })
    expect(btn).toHaveTextContent('收合側欄')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(btn).toHaveAttribute('aria-controls', SIDEBAR_ID)
    expect(sidebarEl().className).toContain('w-[232px]')
  })

  it('展開時項目的 aria-label 是項目名稱、沒有 title（title 只在收合時）', () => {
    renderSidebar()
    const item = screen.getByRole('button', { name: '統計分析' })
    expect(item).toHaveAttribute('aria-label', '統計分析')
    expect(item).not.toHaveAttribute('title')
  })

  it('按下收合：寬 56px、寫入 localStorage=1、收合鈕只剩圖示且名稱改「展開側欄」', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole('button', { name: '收合側欄' }))
    expect(sidebarEl().className).toContain('w-14')
    expect(sidebarEl().className).not.toContain('w-[232px]')
    expect(localStorage.getItem(NAV_COLLAPSED_KEY)).toBe('1')
    const btn = screen.getByRole('button', { name: '展開側欄' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', SIDEBAR_ID)
    expect(btn.textContent).toBe('')
  })

  it('收合時：項目只剩置中的圖示，title 與可存取名稱是項目名稱；分組標題變成 24px 分隔線', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole('button', { name: '收合側欄' }))
    const item = screen.getByRole('button', { name: '統計分析' })
    expect(item).toHaveAttribute('title', '統計分析')
    expect(item).toHaveAttribute('aria-label', '統計分析')
    expect(item.textContent).toBe('')
    expect(item.className).toContain('justify-center')
    expect(within(sidebarEl()).queryByText('排程')).toBeNull()
    const dividers = screen.getAllByTestId('nav-group-divider')
    expect(dividers).toHaveLength(2)
    for (const c of ['w-6', 'h-px', 'mx-auto', 'my-2']) expect(dividers[0].className).toContain(c)
    expect(within(mainNav()).getByRole('group', { name: '系統' })).toBeInTheDocument()
  })

  it('再按一次展開：寫入 0、回到 232px', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole('button', { name: '收合側欄' }))
    await user.click(screen.getByRole('button', { name: '展開側欄' }))
    expect(localStorage.getItem(NAV_COLLAPSED_KEY)).toBe('0')
    expect(sidebarEl().className).toContain('w-[232px]')
    expect(screen.getByRole('button', { name: '收合側欄' })).toHaveTextContent('收合側欄')
  })

  it('重新掛載後讀回收合狀態', async () => {
    const user = userEvent.setup()
    const first = renderSidebar()
    await user.click(screen.getByRole('button', { name: '收合側欄' }))
    first.unmount()
    renderSidebar()
    expect(sidebarEl().className).toContain('w-14')
    expect(screen.getByRole('button', { name: '展開側欄' })).toBeInTheDocument()
  })

  it.each([['0'], ['true'], ['']])('localStorage 值為 %j：展開', v => {
    localStorage.setItem(NAV_COLLAPSED_KEY, v)
    renderSidebar()
    expect(sidebarEl().className).toContain('w-[232px]')
  })

  it('localStorage 讀取丟例外（無痕、被封鎖）：視為展開、不報錯', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderSidebar()
    expect(sidebarEl().className).toContain('w-[232px]')
    expect(err).not.toHaveBeenCalled()
  })

  it('localStorage 寫入丟例外：照樣收合、不報錯', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole('button', { name: '收合側欄' }))
    expect(sidebarEl().className).toContain('w-14')
    expect(err).not.toHaveBeenCalled()
  })
})
