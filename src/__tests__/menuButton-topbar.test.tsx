// src/__tests__/menuButton-topbar.test.tsx
// MenuButton 為全域頂欄（UI 統一 4A）新增的能力：自訂觸發內容、靠左對齊、連結項目、
// 說明文字、目前項目打勾、分隔線、不可點的標頭、md 尺寸。工具列「更多」原本的行為
// 由 menuButton.test.tsx 守著，這裡不重複。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuButton, type MenuItem } from '../components/shared/MenuButton'

const rect = (left: number, right: number, bottom: number): DOMRect =>
  ({
    left, right, bottom, top: bottom - 32, width: right - left, height: 32,
    x: left, y: bottom - 32, toJSON: () => ({}),
  }) as DOMRect

const apps: MenuItem[] = [
  { key: 'home', label: '入口頁首頁', href: '#home' },
  { key: 'vtms', label: 'VTMS', description: '測試計畫', href: '#vtms' },
  { key: 'vsms', label: 'VSMS', description: '工作排程', href: '#vsms', current: true },
]

afterEach(() => { vi.restoreAllMocks() })

describe('MenuButton（頂欄用的擴充）', () => {
  it('trigger 取代 label 當按鈕內容，按鈕名稱取自 ariaLabel', () => {
    render(
      <MenuButton label="Validation Workspace" ariaLabel="切換系統"
        trigger={<span data-testid="logo">LOGO</span>}
        items={[{ key: 'a', label: 'A', onSelect: vi.fn() }]} />,
    )
    const btn = screen.getByRole('button', { name: '切換系統' })
    expect(within(btn).getByTestId('logo')).toBeInTheDocument()
    expect(btn).not.toHaveTextContent('Validation Workspace')
  })

  it('href 項目渲染成 role=menuitem 的連結，按下後關閉選單', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="系統" items={apps} />)
    await user.click(screen.getByRole('button', { name: /系統/ }))

    const link = screen.getByRole('menuitem', { name: '入口頁首頁' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '#home')
    expect(link).toHaveFocus()

    await user.click(link)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Space 觸發連結項目：關閉選單（<a> 不是表單控制項，Space 原生只會捲頁）', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="系統" items={apps} />)
    await user.click(screen.getByRole('button', { name: /系統/ }))

    const link = screen.getByRole('menuitem', { name: '入口頁首頁' })
    expect(link).toHaveFocus()
    await user.keyboard(' ')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Enter 觸發連結項目：關閉選單', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="系統" items={apps} />)
    await user.click(screen.getByRole('button', { name: /系統/ }))

    const link = screen.getByRole('menuitem', { name: '入口頁首頁' })
    expect(link).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Space 觸發按鈕項目：呼叫 onSelect 一次', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<MenuButton label="選單" items={[
      { key: 'pw', label: '修改密碼', href: '#pw' },
      { key: 'out', label: '登出', onSelect },
    ]} />)
    await user.click(screen.getByRole('button', { name: /選單/ }))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '登出' })).toHaveFocus()
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('上下鍵在連結與按鈕項目之間移動，Esc 關閉並把焦點還給按鈕', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="選單" items={[
      { key: 'pw', label: '修改密碼', href: '#pw' },
      { key: 'out', label: '登出', onSelect: vi.fn() },
    ]} />)
    const trigger = screen.getByRole('button', { name: /選單/ })
    await user.click(trigger)
    const [pw, out] = screen.getAllByRole('menuitem')

    expect(pw).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(out).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(pw).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(out).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('description 顯示在名稱下方；current 項目有 aria-current="page" 與打勾', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="系統" items={apps} />)
    await user.click(screen.getByRole('button', { name: /系統/ }))

    const vsms = screen.getByRole('menuitem', { name: /^VSMS/ })
    const vtms = screen.getByRole('menuitem', { name: /^VTMS/ })
    expect(within(vsms).getByText('工作排程')).toBeInTheDocument()
    expect(vsms).toHaveAttribute('aria-current', 'page')
    expect(vtms).not.toHaveAttribute('aria-current')
    expect(vsms.querySelector('svg')).not.toBeNull()
    expect(vtms.querySelector('svg')).toBeNull()
  })

  it('separatorBefore 在該項上方畫 role=separator', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="選單" items={[
      { key: 'pw', label: '修改密碼', href: '#pw' },
      { key: 'out', label: '登出', onSelect: vi.fn(), separatorBefore: true },
    ]} />)
    await user.click(screen.getByRole('button', { name: /選單/ }))
    const sep = within(screen.getByRole('menu')).getByRole('separator')
    expect(sep.nextElementSibling).toBe(screen.getByRole('menuitem', { name: '登出' }))
  })

  it('header 在清單頂端、不是 menuitem，並作為清單的描述；焦點落在第一個 menuitem', async () => {
    const user = userEvent.setup()
    render(
      <MenuButton label="Will Wang" ariaLabel="使用者選單"
        header={<><div>Will Wang</div><div>管理者</div></>}
        items={[{ key: 'out', label: '登出', onSelect: vi.fn() }]} />,
    )
    await user.click(screen.getByRole('button', { name: '使用者選單' }))

    const menu = screen.getByRole('menu', { name: '使用者選單' })
    const describedBy = menu.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const header = document.getElementById(describedBy as string)
    expect(header).toHaveTextContent('Will Wang')
    expect(header).toHaveTextContent('管理者')
    expect(menu.contains(header)).toBe(true)
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: '登出' })).toHaveFocus()
  })

  it('沒有 header 時清單不帶 aria-describedby', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="更多" items={[{ key: 'a', label: 'A', onSelect: vi.fn() }]} />)
    await user.click(screen.getByRole('button', { name: /更多/ }))
    expect(screen.getByRole('menu')).not.toHaveAttribute('aria-describedby')
  })

  it('align="left"：清單左緣對齊按鈕左緣', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="系統" align="left" items={apps} />)
    const btn = screen.getByRole('button', { name: /系統/ })
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue(rect(20, 180, 40))
    await user.click(btn)

    const menu = screen.getByRole('menu')
    expect(menu.style.left).toBe('20px')
    expect(menu.style.right).toBe('')
    expect(menu.style.top).toBe('44px')
  })

  it('預設 align="right"：清單右緣對齊按鈕右緣（jsdom 視窗寬 1024）', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="更多" items={[{ key: 'a', label: 'A', onSelect: vi.fn() }]} />)
    const btn = screen.getByRole('button', { name: /更多/ })
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue(rect(800, 900, 40))
    await user.click(btn)

    const menu = screen.getByRole('menu')
    expect(menu.style.right).toBe('124px')
    expect(menu.style.left).toBe('')
  })

  it('size="md"：13px 字、較寬的清單；預設 sm 維持「更多」原樣', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<MenuButton label="系統" size="md" items={apps} />)
    await user.click(screen.getByRole('button', { name: /系統/ }))
    expect(screen.getByRole('menu').className).toContain('min-w-[14rem]')
    expect(screen.getAllByRole('menuitem')[0].className).toContain('text-[13px]')
    unmount()

    render(<MenuButton label="更多" items={[{ key: 'a', label: 'A', onSelect: vi.fn() }]} />)
    await user.click(screen.getByRole('button', { name: /更多/ }))
    expect(screen.getByRole('menu').className).toContain('min-w-[10rem]')
    expect(screen.getAllByRole('menuitem')[0].className).toContain('text-xs')
  })

  it('清單 z-index 蓋過甘特圖全螢幕（z-[100]）', async () => {
    const user = userEvent.setup()
    render(<MenuButton label="系統" size="md" align="left" items={apps} />)
    await user.click(screen.getByRole('button', { name: /系統/ }))
    expect(screen.getByRole('menu').className).toContain('z-[110]')
  })
})
