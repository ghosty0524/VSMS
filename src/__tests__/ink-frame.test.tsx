/// <reference types="vite/client" />
// src/__tests__/ink-frame.test.tsx
// 墨色框架（UI 統一收尾，規格 F:\vportal\docs\superpowers\specs\2026-09-24-ink-frame-design.md）：
// index.css 的 .vw-chrome token 對應與框架焦點框、頂欄／側欄／抽屜根元素帶 .vw-chrome、
// 框架裡不再用 :root 算好的 Tailwind 色階、下拉清單在框架外（白底）。
// jsdom 不算 CSS 變數與樣式層，CSS 只能讀原始字串（?raw）比對。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import indexCss from '../index.css?raw'
import tokensCss from '../styles/workspace-tokens.css?raw'
import { Topbar } from '../components/layout/Topbar'
import { Sidebar, SIDEBAR_ID, NAV_DRAWER_ID } from '../components/layout/Sidebar'
import { useAuthStore } from '../store/authStore'
import { useNavDrawerStore } from '../store/navDrawerStore'
import type { Role } from '../types'

// 規格「框架範圍的 token 對應」逐字。
const CHROME_MAP: Record<string, string> = {
  'vw-surface': 'var(--vw-chrome-side)',
  'vw-surface-subtle': 'var(--vw-chrome-hover)',
  'vw-border': 'var(--vw-chrome-border)',
  'vw-ink': 'var(--vw-chrome-text)',
  'vw-text-secondary': 'var(--vw-chrome-text-secondary)',
  'vw-text-muted': 'var(--vw-chrome-text-muted)',
  'vw-accent-subtle': 'var(--vw-chrome-active)',
  'vw-accent': 'var(--vw-accent-on-chrome)',
}

// 規格「新增的共用 token」淺色欄。
const CHROME_LIGHT: Record<string, string> = {
  'vw-chrome-top': '#17212E',
  'vw-chrome-side': '#1B2636',
  'vw-chrome-border': '#243042',
  'vw-chrome-hover': '#243042',
  'vw-chrome-active': '#2A3553',
  'vw-chrome-text': '#FFFFFF',
  'vw-chrome-text-secondary': '#B8C0CC',
  'vw-chrome-text-muted': '#8A95A6',
}

function ruleBody(css: string, re: RegExp): string {
  const m = css.match(re)
  if (!m) throw new Error(`找不到規則：${re}`)
  return m[1]
}

function customProps(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

// SVG 的 className 不是字串，一律讀 class 屬性。
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

// Tailwind 的中性與強調色階（index.css @theme）是 :root 上的變數，在 :root 就算成淺色值，
// .vw-chrome 換不掉；框架裡出現這些 class 就會是淺色主題的顏色。
const ROOT_RESOLVED_PALETTE =
  /^(?:[a-z-]+:)*(?:bg|text|border|ring|outline|fill|stroke|shadow)-(?:slate|gray|stone|blue)-\d{2,3}$/
function paletteClassesIn(root: Element): string[] {
  return [root, ...Array.from(root.querySelectorAll('*'))]
    .flatMap(el => classes(el).filter(c => ROOT_RESOLVED_PALETTE.test(c)))
}

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
  new Response('{}', { status: 404 }))

function login(role: Role) {
  useAuthStore.setState({
    isLoggedIn: true, isChecking: false, role, displayName: 'Will Wang', username: 'Will_Wang',
    authProvider: 'local',
  })
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

describe('CSS：框架 token', () => {
  it('共用 token 副本已由 vportal 同步框架 token（淺色）', () => {
    const root = customProps(ruleBody(tokensCss, /:root\s*\{([^}]*)\}/))
    for (const [name, value] of Object.entries(CHROME_LIGHT)) {
      expect(root[name]?.toUpperCase(), name).toBe(value)
    }
  })

  it('.vw-chrome 把一般 token 換成框架值（規格的對應表，一項不多一項不少）', () => {
    expect(customProps(ruleBody(indexCss, /\.vw-chrome\s*\{([^}]*)\}/))).toEqual(CHROME_MAP)
  })

  it('--vw-accent-on-chrome 是 #5FC4B8，定義在 VSMS 識別色 --vw-accent 旁邊', () => {
    const root = customProps(ruleBody(indexCss, /:root\s*\{([^}]*--vw-accent:[^}]*)\}/))
    expect(root['vw-accent']).toBe('#0E6B63')
    expect(root['vw-accent-on-chrome']).toBe('#5FC4B8')
  })

  it('標誌方塊用的 --color-accent 仍是 VSMS 識別色 #0E6B63', () => {
    expect(indexCss).toMatch(/--color-accent:\s*#0E6B63;/)
  })

  it('框架上的焦點框（focus-visible）用 --vw-accent-on-chrome', () => {
    const m = indexCss.match(/\.vw-chrome\s+:is\(([^)]*)\):focus-visible\s*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    expect(m![1].split(',').map(s => s.trim())).toEqual(['button', 'a', '[role="button"]', 'summary'])
    expect(m![2]).toMatch(/outline-color:\s*var\(--vw-accent-on-chrome\)/)
  })
})

describe('頂欄', () => {
  it('<header> 帶 .vw-chrome；底色 --vw-chrome-top、底線 --vw-border（框架裡＝--vw-chrome-border）、沒有陰影', () => {
    login('admin')
    render(<Topbar />)
    const header = screen.getByRole('banner')
    expect(classes(header)).toEqual(expect.arrayContaining([
      'vw-chrome', 'bg-[var(--vw-chrome-top)]', 'border-b', 'border-[var(--vw-border)]',
    ]))
    expect(classes(header)).not.toContain('bg-[var(--vw-surface)]')
    expect(classes(header).some(c => c.startsWith('shadow'))).toBe(false)
  })

  it.each<Role>(['super_admin', 'admin', 'user', 'guest'])('%s：頂欄裡沒有 slate／gray／stone／blue 色階 class', role => {
    login(role)
    render(<Topbar />)
    expect(paletteClassesIn(screen.getByRole('banner'))).toEqual([])
  })

  it('圖示鈕與頂欄連結：一般次要字、hover 換框架 hover 底與主要字；目前系統 active 底＋主要字', () => {
    login('super_admin')
    render(<Topbar />)
    for (const el of [screen.getByRole('button', { name: '開啟選單' }), screen.getByRole('link', { name: '通知' })]) {
      expect(classes(el)).toEqual(expect.arrayContaining([
        'text-[var(--vw-text-secondary)]', 'hover:bg-[var(--vw-surface-subtle)]', 'hover:text-[var(--vw-ink)]',
      ]))
    }
    const [vtms, vsms] = within(screen.getByRole('navigation', { name: '系統' })).getAllByRole('link')
    expect(classes(vtms)).toEqual(expect.arrayContaining([
      'text-[var(--vw-text-secondary)]', 'hover:bg-[var(--vw-surface-subtle)]', 'hover:text-[var(--vw-ink)]',
    ]))
    expect(vsms).toHaveAttribute('aria-current', 'page')
    expect(classes(vsms)).toEqual(expect.arrayContaining(['bg-[var(--vw-accent-subtle)]', 'text-[var(--vw-ink)]']))
  })

  it('產品名、使用者名是主要字；標誌方塊維持識別色底與白勾；頭像淺版識別色底、墨色字', () => {
    login('admin')
    render(<Topbar />)
    const switcher = screen.getByRole('button', { name: '切換系統' })
    const logo = switcher.firstElementChild as HTMLElement
    expect(classes(logo)).toEqual(expect.arrayContaining(['bg-[var(--color-accent)]', 'text-white']))
    expect(classes(logo)).not.toContain('bg-[var(--vw-accent)]')
    expect(classes(within(switcher).getByText('Validation Workspace'))).toContain('text-[var(--vw-ink)]')

    const userButton = screen.getByRole('button', { name: '使用者選單' })
    const avatar = userButton.firstElementChild as HTMLElement
    expect(avatar).toHaveTextContent('WI')
    expect(classes(avatar)).toEqual(expect.arrayContaining([
      'bg-[var(--vw-accent-on-chrome)]', 'text-[var(--vw-chrome-top)]',
    ]))
    expect(classes(within(userButton).getByText('Will Wang'))).toContain('text-[var(--vw-ink)]')
  })

  it('產品切換與使用者選單的清單掛在 body、不在 .vw-chrome 裡，維持白底', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    await user.click(screen.getByRole('button', { name: '切換系統' }))
    const switcher = screen.getByRole('menu', { name: '切換系統' })
    expect(switcher.parentElement).toBe(document.body)
    expect(switcher.closest('.vw-chrome')).toBeNull()
    expect(classes(switcher)).toContain('bg-white')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: '使用者選單' }))
    const userMenu = screen.getByRole('menu', { name: '使用者選單' })
    expect(userMenu.parentElement).toBe(document.body)
    expect(userMenu.closest('.vw-chrome')).toBeNull()
    expect(classes(userMenu)).toContain('bg-white')
  })

  it('使用者選單標頭的名稱與角色改用 token，不再有 text-slate-900／text-slate-500', async () => {
    login('admin')
    const user = userEvent.setup()
    render(<Topbar />)
    await user.click(screen.getByRole('button', { name: '使用者選單' }))
    const menu = screen.getByRole('menu', { name: '使用者選單' })
    const name = within(menu).getByText('Will Wang')
    const roleLabel = within(menu).getByText('管理者')
    expect(classes(name)).toContain('text-[var(--vw-ink)]')
    expect(classes(name)).not.toContain('text-slate-900')
    expect(classes(roleLabel)).toContain('text-[var(--vw-text-muted)]')
    expect(classes(roleLabel)).not.toContain('text-slate-500')
  })
})

describe('側欄與抽屜', () => {
  it('#app-sidebar 與 #app-nav-drawer 帶 .vw-chrome；底色 --vw-surface（框架裡＝--vw-chrome-side）、右邊線；沒有色階 class', () => {
    render(<Sidebar currentView="main" onNavigate={vi.fn()} role="super_admin" />)
    for (const id of [SIDEBAR_ID, NAV_DRAWER_ID]) {
      const el = document.getElementById(id) as HTMLElement
      expect(classes(el)).toEqual(expect.arrayContaining([
        'vw-chrome', 'bg-[var(--vw-surface)]', 'border-r', 'border-[var(--vw-border)]',
      ]))
      expect(paletteClassesIn(el)).toEqual([])
    }
  })

  it('目前項目：active 底、主要字、左側 3px 淺版識別色內陰影；一般項目次要字、hover 底＋主要字', () => {
    render(<Sidebar currentView="analytics" onNavigate={vi.fn()} role="super_admin" />)
    const aside = document.getElementById(SIDEBAR_ID) as HTMLElement
    const cur = within(aside).getByRole('button', { name: '統計分析' })
    expect(cur).toHaveAttribute('aria-current', 'page')
    expect(classes(cur)).toEqual(expect.arrayContaining([
      'bg-[var(--vw-accent-subtle)]', 'text-[var(--vw-ink)]', 'shadow-[inset_3px_0_0_var(--vw-accent-on-chrome)]',
    ]))
    expect(classes(cur)).not.toContain('text-[var(--vw-accent)]')
    const idle = within(aside).getByRole('button', { name: '排程管理' })
    expect(classes(idle)).toEqual(expect.arrayContaining([
      'text-[var(--vw-text-secondary)]', 'hover:bg-[var(--vw-surface-subtle)]', 'hover:text-[var(--vw-ink)]',
    ]))
  })

  it('分組標題與收合鈕用淡字；收合區上方線用 --vw-border（框架裡＝--vw-chrome-border）', () => {
    render(<Sidebar currentView="main" onNavigate={vi.fn()} role="super_admin" />)
    const aside = document.getElementById(SIDEBAR_ID) as HTMLElement
    expect(classes(within(aside).getByText('排程'))).toContain('text-[var(--vw-text-muted)]')
    const collapse = within(aside).getByRole('button', { name: '收合側欄' })
    expect(classes(collapse)).toEqual(expect.arrayContaining([
      'text-[var(--vw-text-muted)]', 'hover:bg-[var(--vw-surface-subtle)]', 'hover:text-[var(--vw-ink)]',
    ]))
    expect(classes(collapse)).not.toContain('text-[var(--vw-text-secondary)]')
    expect(classes(collapse.parentElement as HTMLElement)).toEqual(expect.arrayContaining([
      'border-t', 'border-[var(--vw-border)]',
    ]))
  })
})
