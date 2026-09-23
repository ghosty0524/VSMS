# VSMS 工具列「更多」選單 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把工作排程頁工具列的匯入、匯出、下載範本、複製表格收進右側「更多」選單，新增排程移到最右邊，全螢幕改成只有圖示。

**Architecture:** 新增共用元件 `MenuButton`：一顆觸發按鈕，清單用 `createPortal` 掛到 `document.body` 並以 `position: fixed` 對齊按鈕，原因是工具列容器 `overflow-x-auto` 會裁掉內部的絕對定位元素。`ScheduleToolbar` 改用它，Modal 與匯出邏輯都不動。

**Tech Stack:** React 19、TypeScript、Tailwind v4、lucide-react、zustand；測試用 vitest（jsdom）＋ @testing-library/react ＋ @testing-library/user-event。

**Spec:** `F:\vsms\vsms-export\docs\superpowers\specs\2026-09-23-toolbar-more-menu-design.md`

## Global Constraints

- Repo `F:\vsms\vsms-export`，commit 在目前分支 `feat/guest-role-and-uiux`。一律用絕對路徑。
- Commit message 用英文，結尾一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **絕對不要**執行 `git restore`、`git checkout`（檔案或分支）、`git stash`、`git reset`、`git clean`，或任何會丟掉工作樹修改的指令。需要舊版內容時用 `git show HEAD:<path>`。只 `git add` 自己改的檔案，並逐一指定路徑。
- 不要跑 `npm run build`，不要 `npx vite build`，不要 `pm2 restart`，不要部署。部署由 controller 依最後一節執行。
- 指令：
  - 前端測試：`npm test`，也就是 `vitest run`，只跑 `src/__tests__`。
  - 單檔測試：`npx vitest run src/__tests__/<file>`。
  - 前端型別檢查：`npx tsc -p tsconfig.app.json --noEmit`，必須是 0 錯（2026-09-23 已清為 0）。
- 維持兩排：條件列（`FilterSortBar`）不動。不加「今天」按鈕。
- 「更多」的項目依序為：匯入排程…、匯出…、下載匯入範本、複製表格。
  - 前三項只有 `canWrite`（`role === 'super_admin' || role === 'admin'`）才有。
  - 「複製表格」只在 `viewMode === 'list'` 時出現。
  - 沒有任何項目時整顆「更多」不渲染。
- 項目的 `title`，照原按鈕的說明：
  - 「從 Excel 匯入排程」
  - 「匯出排程或 Dashboard」
  - 「下載 Excel 匯入範本」
  - 「複製目前篩選結果的完整列表（可貼到 Excel、Word 或 Outlook）」
- 右側群組由左到右依序：
  1. 全螢幕（只有圖示，`w-8 h-8`，`title` 與 `aria-label` 為「全螢幕檢視」／「離開全螢幕（Esc）」）
  2. 「更多 ▾」
  3. 「新增排程」（`canWrite` 才顯示，樣式不變）
- 選單清單：
  - `role="menu"`，z-index `z-[110]`，高過全螢幕容器的 `z-[100]`。
  - 項目是 `<button role="menuitem">`，用 roving tabindex。
  - 觸發按鈕帶 `aria-haspopup="menu"`、`aria-expanded`、`aria-controls`。
- 鍵盤與關閉行為：
  - 開啟時焦點移到第一項。
  - `ArrowDown`／`ArrowUp` 循環移動；`Home`／`End` 跳到頭尾。
  - `Escape` 關閉、把焦點還給按鈕，並 `stopPropagation()`，讓 `window` 上的監聽器收不到。
  - `Tab` 關閉。
  - 點外面（`mousedown`）、視窗 resize、任何捲動（capture）都會關閉。
  - 點項目時先關閉、焦點還給按鈕，再呼叫 `onSelect`。
- 灰階用 slate，其他色不動。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `F:\vsms\vsms-export\src\components\shared\MenuButton.tsx` | 新增 | 共用的「按鈕＋下拉選單」 |
| `F:\vsms\vsms-export\src\__tests__\menuButton.test.tsx` | 新增 | MenuButton 行為測試 |
| `F:\vsms\vsms-export\src\components\schedule\ScheduleToolbar.tsx` | 修改 | 次要動作改進「更多」、按鈕重排 |
| `F:\vsms\vsms-export\src\__tests__\scheduleToolbar-more.test.tsx` | 新增 | 工具列的角色／模式組合測試 |

---

### Task 1: `MenuButton` 共用元件

**Files:**
- Create: `F:\vsms\vsms-export\src\components\shared\MenuButton.tsx`
- Test: `F:\vsms\vsms-export\src\__tests__\menuButton.test.tsx`

**Interfaces:**
- Produces（Task 2 會用）：
  ```ts
  export interface MenuItem { key: string; label: string; icon?: ReactNode; title?: string; onSelect: () => void }
  export function MenuButton(props: { label: string; items: MenuItem[]; ariaLabel?: string; className?: string }): JSX.Element | null
  ```

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\menuButton.test.tsx`：

```tsx
// src/__tests__/menuButton.test.tsx
// MenuButton：工具列「更多」用的共用下拉選單。清單 portal 到 body（工具列是
// overflow-x-auto，放在裡面會被裁掉），Esc 不能漏到 window（甘特圖的覆蓋式全螢幕
// 在 window 上聽 Esc 來離開）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run（在 `F:\vsms\vsms-export`）：`npx vitest run src/__tests__/menuButton.test.tsx`
Expected：FAIL，原因是 `../components/shared/MenuButton` 不存在。

- [ ] **Step 3: 實作**

建立 `F:\vsms\vsms-export\src\components\shared\MenuButton.tsx`：

```tsx
// src/components/shared/MenuButton.tsx
//
// 「按鈕＋下拉選單」，工具列的「更多」用。
//
// 清單 portal 到 document.body 並用 position: fixed 對齊按鈕：工具列容器是
// overflow-x-auto，會連帶讓縱向也變成裁切，清單放在裡面會被切掉。全螢幕時甘特圖
// 容器是 fixed inset-0 z-[100]，所以清單是 z-[110]；全螢幕作用在整份文件
// （requestFullscreen 在 documentElement 上），掛在 body 仍看得到。
//
// Esc 在清單上處理並 stopPropagation：甘特圖的覆蓋式全螢幕（瀏覽器拒絕真全螢幕時）
// 在 window 上聽 Esc 來離開，選單的 Esc 不能漏上去。瀏覽器真全螢幕時 Esc 由瀏覽器
// 自己攔下離開全螢幕，網頁擋不住；離開全螢幕會 resize，選單因此自動關閉。
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  title?: string
  onSelect: () => void
}

interface Props {
  label: string
  items: MenuItem[]
  ariaLabel?: string
  /** 觸發按鈕的樣式，沿用呼叫端的按鈕樣式。 */
  className?: string
}

export function MenuButton({ label, items, ariaLabel, className }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  const count = items.length

  // 項目被拿光（例如切回甘特圖、沒有可複製的表格）時，不要留著一個打開的狀態，
  // 等項目回來時憑空彈出來。
  useEffect(() => { if (count === 0) setOpen(false) }, [count])

  useLayoutEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    // 位置是開啟當下量的；版面一動就關掉，不追著重算。
    const onLayoutChange = () => setOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onLayoutChange)
    window.addEventListener('scroll', onLayoutChange, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onLayoutChange)
      window.removeEventListener('scroll', onLayoutChange, true)
    }
  }, [open])

  if (count === 0) return null

  const toggle = () => {
    if (open) { setOpen(false); return }
    const r = buttonRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setActive(0)
    setOpen(true)
  }

  const closeAndRefocus = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const select = (item: MenuItem) => {
    // 先把焦點還給按鈕再執行：onSelect 常會開 Modal，Modal 拿到焦點後不該再被搶回來。
    closeAndRefocus()
    item.onSelect()
  }

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(i => (i + 1) % count); break
      case 'ArrowUp':   e.preventDefault(); setActive(i => (i - 1 + count) % count); break
      case 'Home':      e.preventDefault(); setActive(0); break
      case 'End':       e.preventDefault(); setActive(count - 1); break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        closeAndRefocus()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={toggle}
        className={className}
      >
        {label}
        <ChevronDown size={13} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel ?? label}
          onKeyDown={onMenuKeyDown}
          className="fixed z-[110] min-w-[10rem] py-1 bg-white border border-slate-200 rounded-md shadow-lg"
          style={{ top: pos.top, right: pos.right }}
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              ref={el => { itemRefs.current[i] = el }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              title={item.title}
              onClick={() => select(item)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700
                         whitespace-nowrap hover:bg-slate-50 focus:bg-slate-100"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run：`npx vitest run src/__tests__/menuButton.test.tsx`
Expected：11 passed。

如果 Esc 那一項失敗，代表 `window` 收到了 Esc，也就是 React 的 `stopPropagation` 沒擋住原生事件往上傳。
- 先確認清單的 `onKeyDown` 有沒有被觸發：焦點是否真的在清單的項目上。
- 不要為了讓測試通過去改測試的斷言。


- [ ] **Step 5: 跑整套與型別檢查**

Run：`npm test`
Expected：0 failed。

Run：`npx tsc -p tsconfig.app.json --noEmit`
Expected：沒有輸出（0 錯）。

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export
git add src/components/shared/MenuButton.tsx src/__tests__/menuButton.test.tsx
git commit -m "feat(ui): shared MenuButton — a button with a portal dropdown menu

The toolbar is overflow-x-auto, which clips anything positioned inside it, so
the list is portalled to body and fixed under the button (z above the
fullscreen overlay). Arrow keys, Home/End, Esc (kept away from the window
listener the overlay fullscreen uses), Tab, outside click, resize and scroll
all behave like a menu should.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `ScheduleToolbar` 改用「更多」

**Files:**
- Modify: `F:\vsms\vsms-export\src\components\schedule\ScheduleToolbar.tsx`
- Test: `F:\vsms\vsms-export\src\__tests__\scheduleToolbar-more.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `MenuButton` 與 `MenuItem`，從 `../shared/MenuButton` import：
  ```ts
  export interface MenuItem { key: string; label: string; icon?: ReactNode; title?: string; onSelect: () => void }
  export function MenuButton(props: { label: string; items: MenuItem[]; ariaLabel?: string; className?: string }): JSX.Element | null
  ```
  - `items` 為空時回傳 `null`。
  - 觸發按鈕的可及名稱是 `label` 加一個 chevron 圖示，所以測試要用 `getByRole('button', { name: /更多/ })` 來找。
- 其他既有介面：
  - `downloadTemplate(): void`，來自 `../../lib/excel`。
  - `DEFAULT_FILTER: FilterSortState`，來自 `./FilterSortBar`。
  - `Role = 'super_admin' | 'admin' | 'user' | 'guest'`。
  - 兩個 Modal 的 `isOpen` 為 false 時都 `return null`。

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\scheduleToolbar-more.test.tsx`：

```tsx
// src/__tests__/scheduleToolbar-more.test.tsx
// 工具列的次要動作收進「更多」（UI 統一第 3 項 C）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'
import { ScheduleToolbar } from '../components/schedule/ScheduleToolbar'
import { DEFAULT_FILTER } from '../components/schedule/FilterSortBar'
import type { OptionsMap, Role } from '../types'

const { downloadTemplateSpy } = vi.hoisted(() => ({ downloadTemplateSpy: vi.fn() }))
vi.mock('../lib/excel', async () => {
  const actual = await vi.importActual<typeof import('../lib/excel')>('../lib/excel')
  return { ...actual, downloadTemplate: downloadTemplateSpy }
})

const options: OptionsMap = {
  testUnits: [{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: 'SIT', engineers: [] }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

function renderToolbar(role: Role, viewMode: 'gantt' | 'list', overrides: Partial<Parameters<typeof ScheduleToolbar>[0]> = {}) {
  const props = {
    role,
    viewMode,
    onViewModeChange: vi.fn(),
    groupBy: 'engineer' as const,
    onGroupByChange: vi.fn(),
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
    onCopyList: vi.fn(),
    onAddSchedule: vi.fn(),
    filterSort: DEFAULT_FILTER,
    onFilterChange: vi.fn(),
    ...overrides,
  }
  const user = userEvent.setup()
  const utils = render(<ScheduleToolbar {...props} />)
  return { user, props, ...utils }
}

async function openMore(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /更多/ }))
  return within(screen.getByRole('menu')).getAllByRole('menuitem').map(el => el.textContent)
}

beforeEach(() => {
  vi.clearAllMocks()
  useScheduleStore.setState({ schedules: [] })
  useOptionsStore.setState({ options })
})

describe('ScheduleToolbar「更多」', () => {
  it('admin、甘特圖：更多裡有匯入／匯出／範本，沒有複製表格', async () => {
    const { user } = renderToolbar('admin', 'gantt')
    expect(await openMore(user)).toEqual(['匯入排程…', '匯出…', '下載匯入範本'])
  })

  it('admin、列表：多出複製表格，點下去呼叫 onCopyList', async () => {
    const { user, props } = renderToolbar('admin', 'list')
    expect(await openMore(user)).toEqual(['匯入排程…', '匯出…', '下載匯入範本', '複製表格'])
    await user.click(screen.getByRole('menuitem', { name: '複製表格' }))
    expect(props.onCopyList).toHaveBeenCalledTimes(1)
  })

  it('super_admin 與 admin 相同', async () => {
    const { user } = renderToolbar('super_admin', 'gantt')
    expect(await openMore(user)).toEqual(['匯入排程…', '匯出…', '下載匯入範本'])
  })

  it('項目保留原按鈕的說明文字', async () => {
    const { user } = renderToolbar('admin', 'list')
    await openMore(user)
    expect(screen.getByRole('menuitem', { name: '匯入排程…' })).toHaveAttribute('title', '從 Excel 匯入排程')
    expect(screen.getByRole('menuitem', { name: '匯出…' })).toHaveAttribute('title', '匯出排程或 Dashboard')
    expect(screen.getByRole('menuitem', { name: '下載匯入範本' })).toHaveAttribute('title', '下載 Excel 匯入範本')
    expect(screen.getByRole('menuitem', { name: '複製表格' }))
      .toHaveAttribute('title', '複製目前篩選結果的完整列表（可貼到 Excel、Word 或 Outlook）')
  })

  it('下載匯入範本呼叫 downloadTemplate', async () => {
    const { user } = renderToolbar('admin', 'gantt')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: '下載匯入範本' }))
    expect(downloadTemplateSpy).toHaveBeenCalledTimes(1)
  })

  it('匯入排程…開啟匯入視窗', async () => {
    const { user } = renderToolbar('admin', 'gantt')
    await openMore(user)
    await user.click(screen.getByRole('menuitem', { name: '匯入排程…' }))
    expect(screen.queryByRole('menu')).toBeNull()
    // ExcelImportModal 在 isOpen 時才渲染；以它的標題判斷有開起來
    expect(await screen.findByRole('heading', { name: '從 Excel 匯入排程' })).toBeInTheDocument()
  })

  it('user、甘特圖：沒有更多，也沒有新增排程', () => {
    renderToolbar('user', 'gantt')
    expect(screen.queryByRole('button', { name: /更多/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /新增排程/ })).toBeNull()
  })

  it('user、列表：更多只有複製表格', async () => {
    const { user } = renderToolbar('user', 'list')
    expect(await openMore(user)).toEqual(['複製表格'])
  })

  it('guest、甘特圖：沒有更多', () => {
    renderToolbar('guest', 'gantt')
    expect(screen.queryByRole('button', { name: /更多/ })).toBeNull()
  })

  it('admin：新增排程是工具列最後一顆按鈕，排在更多之後', () => {
    const { container } = renderToolbar('admin', 'gantt')
    const buttons = Array.from(container.querySelectorAll('button'))
    const last = buttons[buttons.length - 1]
    expect(last).toHaveTextContent('新增排程')
    const more = screen.getByRole('button', { name: /更多/ })
    expect(buttons.indexOf(more)).toBe(buttons.length - 2)
  })

  it('左側不再有匯入／匯出／範本按鈕', () => {
    renderToolbar('admin', 'gantt')
    expect(screen.queryByRole('button', { name: '匯入' })).toBeNull()
    expect(screen.queryByRole('button', { name: '匯出' })).toBeNull()
    expect(screen.queryByTitle('下載 Excel 匯入範本')).toBeNull()
  })

  it('全螢幕按鈕只有圖示、有 aria-label，切換時文字跟著變', () => {
    const { unmount } = renderToolbar('admin', 'gantt')
    const fs = screen.getByRole('button', { name: '全螢幕檢視' })
    expect(fs).toHaveAttribute('title', '全螢幕檢視')
    expect(fs.textContent).toBe('')
    unmount()
    renderToolbar('admin', 'gantt', { isFullscreen: true })
    expect(screen.getByRole('button', { name: '離開全螢幕（Esc）' })).toHaveAttribute('title', '離開全螢幕（Esc）')
  })
})
```

「匯入排程…開啟匯入視窗」這一項用 `ExcelImportModal` 開啟後的標題 `<h2>從 Excel 匯入排程</h2>` 判斷（`ExcelImportModal.tsx` 約 267 行）。工具列本身不會出現這段文字：原本的匯入按鈕 `title` 雖然也是這段，但 `title` 不算 heading。

- [ ] **Step 2: 跑測試確認失敗**

Run（在 `F:\vsms\vsms-export`）：`npx vitest run src/__tests__/scheduleToolbar-more.test.tsx`
Expected：大部分 FAIL，原因是還沒有「更多」按鈕、匯入與匯出仍是獨立按鈕。

- [ ] **Step 3: 改 `ScheduleToolbar.tsx`**

3a. **檔頭註解**：在第 15 行（`// 「外框為測試單位，內裡為測試人員」——改放進 title。`）之後補一段：

```tsx
//
// 2026-09（UI 統一第 3 項 C）：工具列在 1440px 寬時剛好塞滿，再窄就要橫向捲動。
// 匯入、匯出、下載範本、複製表格都是低頻動作，收進右側的「更多」；主要動作
// 「新增排程」移到最右邊，全螢幕只留圖示。條件列與工具列維持兩排（使用者選定）。
```

3b. **import**：第 17–20 行的 lucide import 保持不變（這些圖示仍會用在選單項目與全螢幕鈕上）。在 `import { SegmentedControl } from '../shared/SegmentedControl'` 下一行加：

```tsx
import { MenuButton, type MenuItem } from '../shared/MenuButton'
```

3c. **組出選單項目**：在 `toggleUnit` 函式定義之後、`return (` 之前加：

```tsx
  const fullscreenLabel = isFullscreen ? '離開全螢幕（Esc）' : '全螢幕檢視'

  // 順序固定：匯入、匯出、範本、複製表格。沒有任何項目時 MenuButton 不渲染。
  const moreItems: MenuItem[] = [
    ...(canWrite ? [
      { key: 'import', label: '匯入排程…', icon: <Upload size={13} />, title: '從 Excel 匯入排程', onSelect: () => setShowImport(true) },
      { key: 'export', label: '匯出…', icon: <Download size={13} />, title: '匯出排程或 Dashboard', onSelect: () => setShowExport(true) },
      { key: 'template', label: '下載匯入範本', icon: <FileSpreadsheet size={13} />, title: '下載 Excel 匯入範本', onSelect: downloadTemplate },
    ] : []),
    ...(viewMode === 'list' ? [
      { key: 'copy', label: '複製表格', icon: <ClipboardCopy size={13} />, title: '複製目前篩選結果的完整列表（可貼到 Excel、Word 或 Outlook）', onSelect: onCopyList },
    ] : []),
  ]
```

3d. **刪掉左側的排程操作**：把 `{/* ── 排程操作 ── */}` 那一整段（從 `{canWrite && (` 到它的 `)}`，包含新增排程、匯入、匯出、範本四顆按鈕與後面的分隔線 `<div className="w-px h-5 bg-slate-300 flex-shrink-0" />`）整段刪除。

3e. **換掉右側群組**：把 `{/* ── 右側工具 ── */}` 底下整個 `<div className="ml-auto flex flex-shrink-0 items-center gap-2 pl-2">…</div>` 換成：

```tsx
        {/* ── 右側工具：全螢幕、更多、主要動作 ── */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-2 pl-2">
          <button
            type="button"
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            onClick={onToggleFullscreen}
            className="flex flex-shrink-0 items-center justify-center w-8 h-8
                       rounded-md border border-slate-300 bg-white text-slate-600
                       hover:bg-slate-50 transition-colors"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <MenuButton label="更多" items={moreItems} className={BTN} />

          {canWrite && (
            <button
              type="button"
              onClick={onAddSchedule}
              className="flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                         rounded-md bg-stone-900 text-white hover:bg-stone-800
                         transition-colors active:scale-95"
            >
              <Plus size={14} strokeWidth={2.5} />
              新增排程
            </button>
          )}
        </div>
```

3f. 兩個 Modal（`ExcelImportModal`、`ExportModal`）與 `handleExportDashboard`、`saveDashboardHTML` 都不動。

- [ ] **Step 4: 跑測試確認通過**

Run：`npx vitest run src/__tests__/scheduleToolbar-more.test.tsx`
Expected：12 passed。

Run：`npm test`
Expected：0 failed。

如果既有測試因為「匯入／匯出按鈕不見了」失敗，先讀那個測試想驗證什麼：
- 如果它驗證的是位置與按鈕形式，就是這次刻意改掉的行為，改成透過「更多」操作，並在報告裡列出。
- 如果它驗證的是別的行為，就停下來回報，不要改。

- [ ] **Step 5: 型別檢查**

Run：`npx tsc -p tsconfig.app.json --noEmit`
Expected：沒有輸出（0 錯）。

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export
git add src/components/schedule/ScheduleToolbar.tsx src/__tests__/scheduleToolbar-more.test.tsx
git commit -m "feat(schedule): toolbar keeps secondary actions in a More menu

Import, export, template download and copy-table move into a More menu on
the right; Add schedule moves to the far right as the primary action and
fullscreen becomes an icon button. The toolbar no longer fills 1440px, so
narrower screens stop scrolling sideways. Two rows (filters + toolbar) stay.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 部署（controller 執行，不派給 subagent）

1. **改前改後截圖**，給使用者看過再部署。
   - 用 `F:\.claude\launch.json` 的 `vsms-harness`（vite 5175，綁 127.0.0.1）。
   - 在專案根目錄放 `_dev-admin.html`、`_dev-admin.tsx`、`_dev-stub.ts` 三個檔案（做法見記憶 `vsms-ui-review-2026-09`），用 `?role=` 切換角色。
   - 改前的畫面：用 `git show f9d1dd3:src/components/schedule/ScheduleToolbar.tsx` 取出舊版，放在 harness 旁邊臨時比對。不要用 `git checkout` 換檔。
   - 要截的畫面：
     - admin 甘特圖
     - admin 列表，選單展開
     - user 列表
     - 1280px 與 1440px 寬各一張，看工具列還會不會橫向捲動
   - 驗完刪掉 `_dev-*` 檔案。
2. 備份 `dist` → `dist.stable-20260923-pre-3c`。
3. 只跑 `npx vite build`，不要跑 `npm run build`，也不重啟 vsms。
4. 驗證正式站 `https://172.16.204.69/vsms/` 送出的 assets 與本機 `dist` 一致。
5. 推 GitHub 前先問使用者。VSMS 的 master 在部署時快轉到 `feat/guest-role-and-uiux`。
6. 更新畫布進度（3C → 已上線）與記憶 `workspace-ui-review-2026-09-23`。

**退版**：把 `dist.stable-20260923-pre-3c` 覆蓋回 `dist`。
