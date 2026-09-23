// src/__tests__/menuButton.test.tsx
// MenuButton：工具列「更多」用的共用下拉選單。清單 portal 到 body（工具列是
// overflow-x-auto，放在裡面會被裁掉），Esc 不能漏到 window（甘特圖的覆蓋式全螢幕
// 在 window 上聽 Esc 來離開）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuButton, type MenuItem } from '../components/shared/MenuButton'

function items(onSelect = vi.fn()): MenuItem[] {
  return [
    { key: 'a', label: '匯入排程…', title: '從 Excel 匯入排程', onSelect },
    { key: 'b', label: '匯出…', onSelect },
    { key: 'c', label: '下載匯入範本', onSelect },
  ]
}

function setup(list: MenuItem[] = items()) {
  const user = userEvent.setup()
  const utils = render(<div data-testid="host"><MenuButton label="更多" items={list} /></div>)
  const trigger = screen.getByRole('button', { name: /更多/ })
  return { user, trigger, ...utils }
}

afterEach(() => { vi.restoreAllMocks() })

describe('MenuButton', () => {
  it('沒有項目時什麼都不渲染', () => {
    render(<div data-testid="host"><MenuButton label="更多" items={[]} /></div>)
    expect(screen.getByTestId('host')).toBeEmptyDOMElement()
  })

  it('點按鈕開啟，焦點移到第一項，aria 狀態正確', async () => {
    const { user, trigger } = setup()
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    const menu = screen.getByRole('menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', menu.id)
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus()
    expect(screen.getAllByRole('menuitem')[0]).toHaveAttribute('title', '從 Excel 匯入排程')
  })

  it('清單掛在 body 底下，不在按鈕的容器裡', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    const menu = screen.getByRole('menu')
    expect(screen.getByTestId('host').contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
  })

  it('上下鍵循環、Home/End 到頭尾', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    const [a, b, c] = screen.getAllByRole('menuitem')

    await user.keyboard('{ArrowDown}')
    expect(b).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(a).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(c).toHaveFocus()
    await user.keyboard('{Home}')
    expect(a).toHaveFocus()
    await user.keyboard('{End}')
    expect(c).toHaveFocus()
    expect(a).toHaveAttribute('tabindex', '-1')
    expect(c).toHaveAttribute('tabindex', '0')
  })

  it('Esc 關閉、焦點回到按鈕，而且 window 收不到這個 Esc', async () => {
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    try {
      const { user, trigger } = setup()
      await user.click(trigger)
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('menu')).toBeNull()
      expect(trigger).toHaveFocus()
      expect(onWindowKey.mock.calls.some(([e]) => (e as KeyboardEvent).key === 'Escape')).toBe(false)
    } finally {
      window.removeEventListener('keydown', onWindowKey)
    }
  })

  it('點外面關閉', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('再點一次按鈕關閉', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('點項目：關閉、焦點回按鈕、呼叫 onSelect', async () => {
    const onSelect = vi.fn()
    const { user, trigger } = setup(items(onSelect))
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: '匯出…' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('Enter 執行目前那一項', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { user, trigger } = setup([
      { key: 'a', label: 'A', onSelect: first },
      { key: 'b', label: 'B', onSelect: second },
    ])
    await user.click(trigger)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('視窗 resize 或捲動時關閉', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    // 捲動事件不冒泡；打在 document 上，靠 window 的 capture 監聽收到
    document.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
  })

  it('Tab 關閉選單', async () => {
    const { user, trigger } = setup()
    await user.click(trigger)
    await user.tab()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  // 選單 portal 在 body 最後面；Tab／Shift+Tab 若照 DOM 順序走會離開文件或跳到
  // 別的角落，而不是接著觸發按鈕。修法是在 keydown 當下同步把焦點搬回按鈕、且不
  // preventDefault，讓瀏覽器接著算下一個 tab stop（見元件內註解）。
  //
  // 這裡直接對選單項目 fireEvent.keyDown('Tab' / shiftKey)，斷言選單關閉且焦點
  // 落回按鈕——這是元件的 keydown handler 實際做的事，可以精確驗證。
  //
  // 沒有用 user.tab() 斷言「Tab 到後面那顆、Shift+Tab 到前面那顆」：實測過，這個
  // repo 的 @testing-library/user-event 版本會在 dispatch 前就依「觸發當下」的
  // DOM tab 順序算好下一個焦點目標，不會採用 handler 內同步 focus() 造成的新
  // activeElement；因為選單項目是 portal 到 body 最後面，「下一個」在它算來就是
  // 不存在，實測最終 document.activeElement 會是 <body>（不是按鈕、也不是後面
  // 那顆按鈕）。也就是說 user.tab() 在 jsdom 裡量不出這個修正的效果，只能證明
  // handler 本身有沒有把焦點移回按鈕，所以改用 fireEvent 直接驗 handler 行為，
  // 真瀏覽器下的「接續 Tab／Shift+Tab」則交由本檔沒辦法涵蓋的手動驗證。
  it('Tab／Shift+Tab：keydown handler 關閉選單並把焦點同步移回觸發按鈕', async () => {
    const { user, trigger } = setup()

    await user.click(trigger)
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Tab', shiftKey: true })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})
