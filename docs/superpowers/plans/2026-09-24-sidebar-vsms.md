# VSMS 左側欄（UI 統一 4C）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 4A 放在頂欄下方的 40px 導覽分頁列換成三系統共用規格的左側欄（分組、可收合、狀態記在 localStorage），窄螢幕改為從頂欄最左邊「選單」鈕打開的抽屜。

**Architecture:** 新檔 `src/components/layout/Sidebar.tsx` 接手 `NavTabs.tsx` 的導覽資料與角色篩選（改成兩組 `NAV_GROUPS`），並同時負責桌面側欄（≥ md，232／56px 可收合）與窄螢幕抽屜（< md）。抽屜開關狀態放在新的 zustand store `navDrawerStore`，因為開關鈕在 `Topbar`、抽屜在 `Sidebar`，兩者在 `App` 裡是兄弟元件。`App.tsx` 把頂欄下方改成「側欄＋內容區」一列；`NavTabs.tsx` 與它的測試刪除。甘特圖寬度是 CSS 決定的（SVG 寬＝天數×22px，外層是橫向捲動容器，不量容器寬度），側欄收合時內容區變寬、甘特圖可視範圍自動變大，不需要改甘特圖程式碼；只要內容區 `min-w-0`。

**Tech Stack:** React 19、TypeScript 6、Tailwind v4、zustand 5、lucide-react 1.11；測試用 vitest 4（jsdom）＋ @testing-library/react 16 ＋ @testing-library/user-event 14。

**Spec:** `F:\vportal\docs\superpowers\specs\2026-09-24-sidebar-design.md`（本計畫涵蓋「共用側欄規格」套用到 VSMS、「各系統 › VSMS」一節、「測試」與「上線」的 VSMS 部分。入口頁與 VTMS 各有自己的計畫）

## Global Constraints

- Repo `F:\vsms\vsms-export`，commit 在目前分支 `feat/guest-role-and-uiux`（起點是本計畫的 commit，前一筆 `cde4bbb`；master 在部署時快轉）。一律用絕對路徑（Bash 用 `/f/vsms/vsms-export/...`）；平行的 Bash 呼叫共用 cwd，每個指令都先 `cd /f/vsms/vsms-export &&`。
- Commit message 用英文，結尾一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **絕對不要**執行 `git restore`、`git checkout`（檔案或分支）、`git stash`、`git reset`、`git clean`，或任何會丟掉工作樹修改的指令。需要舊版內容時用 `git show HEAD:<path>`。只 `git add` 自己改的檔案，逐一列出路徑（刪檔用 `git rm <path>`）。
- 不要跑 `npm run build`，不要 `npx vite build`，不要 `pm2`（任何子指令），不要部署。部署由 controller 依最後一節執行。
- 不要碰 repo 根目錄的 `_dev-*` 檔案與 `_dev-fixtures/`（harness，git 已排除，只有 controller 在部署段落會改）。
- 指令：
  - 前端全套測試：`npm test`（`vitest run`，只跑 `src/__tests__`）。起點基準：57 檔、445 條全過。判斷迴歸看 failures，總數只供參考。
  - 單檔測試：`npx vitest run src/__tests__/<file>`。
  - 型別檢查：`npx tsc -p tsconfig.app.json --noEmit`，必須 0 錯（`src/__tests__` 也在檢查範圍內，測試碼也要過型別；`noUnusedLocals`／`noUnusedParameters` 開著，沒用到的參數要用 `_` 開頭）。
- 測試絕不碰真的後端或資料庫：`fetch` 用 `vi.stubGlobal('fetch', fetchMock)`，store 用 zustand `setState` 塞狀態（照 `src/__tests__/app-topbar.test.tsx`、`topbar.test.tsx`）。localStorage 用 jsdom 內建的，每個測試前 `localStorage.clear()`；丟例外用 `vi.spyOn(Storage.prototype, 'getItem' | 'setItem')`。
- 行尾：`src/App.tsx` 在工作樹是 CRLF（`core.autocrlf=true`），用 Edit 工具換片段即可（Edit 會保留行尾）。`Topbar.tsx` 與新檔是 LF。若用腳本改檔要處理 `\r\n`，改完 grep 驗證（這台機器的 `python` 是 Store 佔位程式，會靜默不改檔，要用 node）。
- 顏色一律用 token（`--vw-surface`、`--vw-border`、`--vw-surface-subtle`、`--vw-text-muted`、`--vw-text-secondary`、`--vw-ink`、`--vw-accent`、`--vw-accent-subtle`、`--vw-radius-control`），寫成 Tailwind 任意值 class，例如 `bg-[var(--vw-surface)]`。不新增 token、不改 `src/styles/workspace-tokens.css`、不改 `src/index.css`。唯一例外是遮罩色：規格逐字給了 `rgba(23,33,46,.4)`，沒有對應 token 又不得新增，照抄成 `bg-[rgba(23,33,46,0.4)]`（見文末「替規格決定的細節」）。頂欄既有的 `slate-*` class 在 VSMS 已指到同一組墨色 token，「選單」鈕沿用鈴鐺的寫法。
- **逐字 UI 文字**（照抄，不要改寫）：
  - 分組標題：「排程」「系統」。
  - 項目：「排程管理」（`main`）、「統計分析」（`analytics`）、「系統設定」（`settings`）、「審計紀錄」（`audit`）。
  - 收合鈕：展開時看得到文字「收合側欄」、`aria-label="收合側欄"`；收合時只有圖示、`aria-label="展開側欄"`。
  - 頂欄選單鈕：`aria-label="開啟選單"`。
  - 側欄 `<aside id="app-sidebar">`，裡面 `<nav aria-label="主選單">`；抽屜 `<div id="app-nav-drawer" role="dialog" aria-modal="true" aria-label="主選單">`（三系統一致的 id 與名稱，2026-09-24 與入口頁計畫對齊）。
  - 項目一律帶 `aria-label`＝項目名稱（VSMS 沒有徽章，不加數字）；`title` 只在收合時加。
- **共用側欄規格的逐字數值**：
  - 展開寬 **232px**（`w-[232px]`）、收合寬 **56px**（`w-14`）；寬度變化 **150ms** 過場，`prefers-reduced-motion: reduce` 時不加（`motion-safe:transition-[width] duration-150`）。
  - 側欄底色 `var(--vw-surface)`、右邊框 1px `var(--vw-border)`；側欄左右內距 **8px**（`px-2`）；導覽區自己捲動（`overflow-y-auto`）。
  - 分組標題 **11px**、600、`var(--vw-text-muted)`、字距 **0.04em**、左右內距 **12px**（`text-[11px] font-semibold text-[var(--vw-text-muted)] tracking-[0.04em] px-3`）；組與組之間 **16px**（`gap-4`）。
  - 項目高 **36px**（`h-9`）、左右內距 **12px**（`px-3`）、圓角 `var(--vw-radius-control)`、lucide 圖示 **18px**、文字 **13px**、圖示與文字間距 **10px**（`gap-2.5`）、項目上下間距 **2px**（`gap-0.5`）。
  - 目前頁 `aria-current="page"`，VSMS 青綠：`bg-[var(--vw-accent-subtle)] text-[var(--vw-accent)]`；hover `var(--vw-surface-subtle)` 底。
  - 收合鈕固定在側欄最底部（不隨項目捲動）、高 **36px**、圖示 `PanelLeftClose`（展開時）／`PanelLeftOpen`（收合時）、`aria-expanded` 反映展開狀態、`aria-controls` 指向側欄（`id="app-sidebar"`）。
  - 收合時：只顯示圖示（置中）；項目加上 `title`＝項目名稱（`aria-label` 展開時也有）；分組標題改成 **24px** 寬、1px 的分隔線，置中、上下 **8px**（`mx-auto my-2 h-px w-6`）。
  - localStorage 鍵 **`vsms-nav-collapsed`**：`'1'`＝收合、`'0'`＝展開；讀不到或讀取丟例外一律展開、寫入失敗不報錯；預設展開。
  - 窄螢幕 **< md（768px）**：側欄不佔版面，改為抽屜——從左側滑出、寬 **232px**、一律展開樣式、沒有收合鈕；遮罩 **`rgba(23,33,46,.4)`**；z-index 高於頂欄與頁面內容、低於對話框（VSMS 對話框是 `z-50`，頁面內容最高 `z-40`，遮罩 `z-[45]`、抽屜面板 `z-[46]`，面板在遮罩之上）。抽屜滿版高、蓋住頂欄；打開時滑入 150ms，`prefers-reduced-motion` 時不滑（`motion-safe:`）。
  - 「選單」鈕：頂欄最左邊（產品切換鈕之前）、**32×32**（`h-8 w-8`）、lucide `Menu` 18px、`aria-expanded`、`aria-controls` 指向抽屜（`id="app-nav-drawer"`）、只在 < md 顯示（`md:hidden`）。
  - 關閉抽屜：點遮罩、按 Esc、點抽屜內任一項目（由點擊本身關閉，不另外監聽頁面切換）、視窗放大到 ≥ md（`matchMedia('(min-width: 768px)')`）。關閉後焦點回「選單」鈕，唯獨視窗放大那種不送（那時鈕已隱藏）；打開時焦點到抽屜第一個項目；Tab／Shift+Tab 在抽屜內循環。
- VSMS 專屬（規格「各系統 › VSMS」）：
  - 角色篩選沿用 4A 的規則：`superAdminOnly` 只給 `super_admin`；`userHidden` 對 `user`、`guest` 隱藏。篩選後沒有項目的組整組不顯示。
  - 可見項目只有一個（`user`、`guest`）時整個側欄與「選單」鈕都不渲染，內容區佔滿寬度。
  - 4A 的 40px 第二列分頁（`NavTabs`）移除。
  - 甘特圖全螢幕（`fixed inset-0 z-[100]`）照樣蓋住側欄與頂欄：桌面側欄不設 z-index，遮罩與抽屜 `z-[45]`／`z-[46]` < 100。
  - VSMS 沒有徽章，規格的「徽章收合改紅點」不適用。
- 範圍外：入口頁與 VTMS、麵包屑、全域搜尋、新增或改名側欄項目（「設備排程」仍是排程管理內的切換）、甘特圖元件本身。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx` | 新增（Task 1）、整份改寫（Task 2） | `NAV_GROUPS`、`visibleNavGroups`、`sidebarVisible`、收合狀態的 localStorage 讀寫、桌面側欄；Task 2 加抽屜 |
| `F:\vsms\vsms-export\src\__tests__\sidebar.test.tsx` | 新增（Task 1） | 分組與項目依角色、目前頁、尺寸 class、收合與 localStorage（取代 `navTabs.test.tsx`） |
| `F:\vsms\vsms-export\src\App.tsx` | 修改（Task 1） | `NavTabs` 換成「側欄＋內容區」一列；內容區 `min-w-0` |
| `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx` | 整份改寫（Task 1）、加兩行斷言（Task 2） | App 外框：頂欄在上、側欄在頂欄下方內容區左邊、沒有第二列、user／guest 沒有側欄 |
| `F:\vsms\vsms-export\src\components\layout\NavTabs.tsx` | 刪除（Task 1） | 由 `Sidebar` 取代 |
| `F:\vsms\vsms-export\src\__tests__\navTabs.test.tsx` | 刪除（Task 1） | 由 `sidebar.test.tsx` 取代 |
| `F:\vsms\vsms-export\src\components\layout\Topbar.tsx` | 改一行註解（Task 1）；加「選單」鈕（Task 2） | 頂欄最左邊的抽屜開關 |
| `F:\vsms\vsms-export\src\store\navDrawerStore.ts` | 新增（Task 2） | 抽屜開關狀態 `{ open, setOpen }` |
| `F:\vsms\vsms-export\src\__tests__\sidebar-drawer.test.tsx` | 新增（Task 2） | 「選單」鈕與抽屜：開關、焦點、Tab 循環、遮罩／Esc／項目／放大視窗關閉、user／guest 不顯示 |

相依：Task 2 用 Task 1 的 `Sidebar`、`visibleNavGroups`、`sidebarVisible`、`SIDEBAR_ID`、`NAV_COLLAPSED_KEY`。Task 1 做完、Task 2 還沒做時，側欄在所有寬度都顯示（手機寬度也佔 232px）；這是中間狀態，不部署。

---

### Task 1: 導覽分頁列換成可收合的左側欄

**Files:**
- Create: `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx`
- Create（測試）: `F:\vsms\vsms-export\src\__tests__\sidebar.test.tsx`
- Modify: `F:\vsms\vsms-export\src\App.tsx`（第 12 行 import；第 66～100 行 `<Topbar />` 到 `</main>`）
- Modify: `F:\vsms\vsms-export\src\components\layout\Topbar.tsx`（第 7 行註解）
- Modify（整份改寫）: `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx`
- Delete: `F:\vsms\vsms-export\src\components\layout\NavTabs.tsx`
- Delete: `F:\vsms\vsms-export\src\__tests__\navTabs.test.tsx`

**Interfaces:**
- Consumes: `Role`（`src/types.ts`：`'super_admin' | 'admin' | 'user' | 'guest'`）、`View`（`src/types.ts`：`'main' | 'analytics' | 'settings' | 'audit' | 'accounts'`）；`LucideIcon` 型別（`lucide-react`）。
- Produces（Task 2 會用）：
  ```ts
  // src/components/layout/Sidebar.tsx
  export interface NavItem { key: View; label: string; icon: LucideIcon; superAdminOnly?: boolean; userHidden?: boolean }
  export interface NavGroup { title: string; items: NavItem[] }
  export const NAV_GROUPS: NavGroup[]
  export function visibleNavGroups(role: Role | null): NavGroup[]   // 篩掉看不到的項目，再拿掉空組
  export function sidebarVisible(role: Role | null): boolean        // 可見項目 > 1
  export const SIDEBAR_ID = 'app-sidebar'
  export const NAV_COLLAPSED_KEY = 'vsms-nav-collapsed'
  export function readNavCollapsed(): boolean                       // '1' → true；其他、讀取丟例外 → false
  export function writeNavCollapsed(collapsed: boolean): void       // 寫 '1'／'0'；丟例外吞掉
  export function Sidebar(props: { currentView: View; onNavigate: (v: View) => void; role: Role | null }): JSX.Element | null
  ```
  DOM 約定（Task 2 與測試依賴）：桌面側欄外框 `<aside id="app-sidebar">`；裡面 `<nav aria-label="主選單">`（可捲動）＋底部收合鈕（在 nav 外）；每組是 `role="group"`、`aria-label`＝組名；收合時的分隔線 `data-testid="nav-group-divider"`。

- [ ] **Step 1: 寫側欄的失敗測試**

新增 `F:\vsms\vsms-export\src\__tests__\sidebar.test.tsx`：

```tsx
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

  it('目前頁：aria-current="page"＋VSMS 青綠選取色；其他項目沒有，hover 用 surface-subtle', () => {
    renderSidebar('super_admin', 'settings')
    const cur = screen.getByRole('button', { name: '系統設定' })
    expect(cur).toHaveAttribute('aria-current', 'page')
    expect(cur.className).toContain('bg-[var(--vw-accent-subtle)]')
    expect(cur.className).toContain('text-[var(--vw-accent)]')
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
```

- [ ] **Step 2: 改寫 App 外框測試（失敗）**

把 `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx` 整份換成：

```tsx
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
    expect(screen.getByText('甘特圖替身')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 跑兩個測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/sidebar.test.tsx src/__tests__/app-topbar.test.tsx`
Expected: FAIL——兩檔都找不到模組 `../components/layout/Sidebar`。

- [ ] **Step 4: 新增 `Sidebar.tsx`**

新增 `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx`：

```tsx
// src/components/layout/Sidebar.tsx
//
// VSMS 的左側欄（UI 統一 4C），取代 4A 放在頂欄下方的 40px 導覽分頁列。三系統各自實作、
// 行為一致，規格：F:\vportal\docs\superpowers\specs\2026-09-24-sidebar-design.md
//
// - 分組：「排程」（排程管理、統計分析）、「系統」（系統設定、審計紀錄）。角色篩選沿用 4A：
//   superAdminOnly 只給 super_admin；userHidden 對 user、guest 隱藏。篩選後沒有項目的組整組拿掉。
// - 可見項目只有一個（user、guest）時整個側欄不渲染，內容區佔滿寬度。
// - 展開 232px、收合 56px；寬度 150ms 過場，只在允許動畫時（motion-safe:）。收合狀態記在
//   localStorage 的 vsms-nav-collapsed（'1' 收合、'0' 展開），讀不到一律展開、寫入失敗不報錯。
// - 選取色是 VSMS 的青綠（--vw-accent／--vw-accent-subtle）。
//
// 甘特圖不用跟著改：它的 SVG 寬是「天數 × 22px」、外層是橫向捲動容器，寬度全由 CSS 決定，
// 側欄收合時內容區變寬、可視範圍自動變大；統計頁的 recharts ResponsiveContainer 自己用
// ResizeObserver 重畫。App 的內容區要 min-w-0，甘特圖才不會把 flex 列撐開。
import { useState } from 'react'
import {
  LayoutList, BarChart2, Settings, ClipboardList, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role, View } from '../../types'

export interface NavItem {
  key: View
  label: string
  icon: LucideIcon
  superAdminOnly?: boolean
  userHidden?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '排程',
    items: [
      { key: 'main',      label: '排程管理', icon: LayoutList },
      { key: 'analytics', label: '統計分析', icon: BarChart2, userHidden: true },
    ],
  },
  {
    title: '系統',
    items: [
      { key: 'settings', label: '系統設定', icon: Settings, userHidden: true },
      { key: 'audit',    label: '審計紀錄', icon: ClipboardList, superAdminOnly: true },
    ],
  },
]

function itemVisible(item: NavItem, role: Role | null): boolean {
  if (item.superAdminOnly && role !== 'super_admin') return false
  if (item.userHidden && (role === 'user' || role === 'guest')) return false
  return true
}

/** 依角色篩掉看不到的項目，再拿掉沒有項目的組。 */
export function visibleNavGroups(role: Role | null): NavGroup[] {
  return NAV_GROUPS
    .map(g => ({ title: g.title, items: g.items.filter(i => itemVisible(i, role)) }))
    .filter(g => g.items.length > 0)
}

/** 可見項目超過一個才有側欄（只有一頁可看的角色不顯示）。 */
export function sidebarVisible(role: Role | null): boolean {
  return visibleNavGroups(role).reduce((n, g) => n + g.items.length, 0) > 1
}

export const SIDEBAR_ID = 'app-sidebar'
export const NAV_COLLAPSED_KEY = 'vsms-nav-collapsed'

/** 讀不到（無痕、被封鎖、值不是 '1'）一律視為展開。 */
export function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** 寫入失敗（無痕、被封鎖、容量滿）不報錯，只是下次不記得。 */
export function writeNavCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // 刻意忽略
  }
}

const ITEM_BASE =
  'flex h-9 w-full items-center gap-2.5 rounded-[var(--vw-radius-control)] text-[13px] font-medium whitespace-nowrap transition-colors'
const ITEM_IDLE =
  'text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]'
const ITEM_CURRENT = 'bg-[var(--vw-accent-subtle)] text-[var(--vw-accent)]'

interface NavGroupsProps {
  groups: NavGroup[]
  currentView: View
  collapsed: boolean
  onSelect: (v: View) => void
}

function NavGroups({ groups, currentView, collapsed, onSelect }: NavGroupsProps) {
  return (
    <div className={`flex flex-col ${collapsed ? '' : 'gap-4'}`}>
      {groups.map(group => (
        <div key={group.title} role="group" aria-label={group.title}>
          {collapsed
            ? (
              <div
                data-testid="nav-group-divider"
                aria-hidden="true"
                className="mx-auto my-2 h-px w-6 bg-[var(--vw-border)]"
              />
            )
            : (
              <div
                aria-hidden="true"
                className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.04em] text-[var(--vw-text-muted)]"
              >
                {group.title}
              </div>
            )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(item => {
              const current = item.key === currentView
              const Icon = item.icon
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-current={current ? 'page' : undefined}
                    aria-label={item.label}
                    title={collapsed ? item.label : undefined}
                    onClick={() => onSelect(item.key)}
                    className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${current ? ITEM_CURRENT : ITEM_IDLE}`}
                  >
                    <Icon size={18} aria-hidden="true" className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  role: Role | null
}

export function Sidebar({ currentView, onNavigate, role }: Props) {
  const [collapsed, setCollapsed] = useState(readNavCollapsed)

  if (!sidebarVisible(role)) return null
  const groups = visibleNavGroups(role)

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    writeNavCollapsed(next)
  }

  return (
    <aside
      id={SIDEBAR_ID}
      className={`flex flex-shrink-0 flex-col bg-[var(--vw-surface)] border-r border-[var(--vw-border)]
                  motion-safe:transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-[232px]'}`}
    >
      <nav aria-label="主選單" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-3">
        <NavGroups groups={groups} currentView={currentView} collapsed={collapsed} onSelect={onNavigate} />
      </nav>
      <div className="flex-shrink-0 px-2 py-2 border-t border-[var(--vw-border)]">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? '展開側欄' : '收合側欄'}
          aria-expanded={!collapsed}
          aria-controls={SIDEBAR_ID}
          title={collapsed ? '展開側欄' : undefined}
          className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${ITEM_IDLE}`}
        >
          {collapsed
            ? <PanelLeftOpen size={18} aria-hidden="true" className="flex-shrink-0" />
            : <PanelLeftClose size={18} aria-hidden="true" className="flex-shrink-0" />}
          {!collapsed && <span>收合側欄</span>}
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: 跑側欄測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/sidebar.test.tsx`
Expected: PASS。

- [ ] **Step 6: `App.tsx` 換版面**

在 `F:\vsms\vsms-export\src\App.tsx` 用 Edit 工具做兩處替換（檔案是 CRLF，Edit 會保留）。

找到：
```tsx
import { NavTabs } from './components/layout/NavTabs'
```
換成：
```tsx
import { Sidebar } from './components/layout/Sidebar'
```

找到（整段，從註解到 `</main>`）：
```tsx
        {/* 全域頂欄（UI 統一 4A）＋頂欄下方的導覽分頁列（只有一個可見分頁時不顯示） */}
        <Topbar />
        <NavTabs
          currentView={view}
          onNavigate={setView}
          role={role}
        />
        <main className="flex-1 min-h-0 overflow-hidden">
          {view === 'main' && (
            <div className="h-full p-3">
              <GanttChart
                showAddModal={showAddModal}
                onAddSchedule={() => setShowAddModal(true)}
                onCloseAddModal={() => setShowAddModal(false)}
                filterCollapsed={filterCollapsed}
                onToggleFilter={() => setFilterCollapsed(!filterCollapsed)}
              />
            </div>
          )}
          {view === 'analytics' && (role === 'super_admin' || role === 'admin') && (
            <div className="h-full overflow-y-auto">
              <AnalyticsPage />
            </div>
          )}
          {view === 'settings' && (role === 'super_admin' || role === 'admin') && (
            <div className="h-full overflow-y-auto">
              <SettingsPage />
            </div>
          )}
          {view === 'audit' && role === 'super_admin' && (
            <div className="h-full overflow-y-auto">
              <AuditPage />
            </div>
          )}
        </main>
```
換成：
```tsx
        {/* 全域頂欄（UI 統一 4A）。頂欄下方是「左側欄＋內容區」一列（UI 統一 4C）；
            只有一個可見頁面的角色（測試人員、訪客）不渲染側欄，內容區佔滿寬度。
            整頁是 h-screen、不捲動，頂欄因此一直在最上面；側欄高度＝視窗扣掉頂欄，自己捲動。 */}
        <Topbar />
        <div className="flex-1 min-h-0 flex">
          <Sidebar
            currentView={view}
            onNavigate={setView}
            role={role}
          />
          {/* min-w-0：甘特圖的 SVG 比內容區寬，靠內層的橫向捲動容器吸收，不能讓它撐開這一列。
              側欄收合時內容區跟著變寬，甘特圖寬度由 CSS 決定，不需要重算。 */}
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
            {view === 'main' && (
              <div className="h-full p-3">
                <GanttChart
                  showAddModal={showAddModal}
                  onAddSchedule={() => setShowAddModal(true)}
                  onCloseAddModal={() => setShowAddModal(false)}
                  filterCollapsed={filterCollapsed}
                  onToggleFilter={() => setFilterCollapsed(!filterCollapsed)}
                />
              </div>
            )}
            {view === 'analytics' && (role === 'super_admin' || role === 'admin') && (
              <div className="h-full overflow-y-auto">
                <AnalyticsPage />
              </div>
            )}
            {view === 'settings' && (role === 'super_admin' || role === 'admin') && (
              <div className="h-full overflow-y-auto">
                <SettingsPage />
              </div>
            )}
            {view === 'audit' && role === 'super_admin' && (
              <div className="h-full overflow-y-auto">
                <AuditPage />
              </div>
            )}
          </main>
        </div>
```

- [ ] **Step 7: 更新 `Topbar.tsx` 的檔頭註解**

在 `F:\vsms\vsms-export\src\components\layout\Topbar.tsx` 找到：
```tsx
// 原本 Header 的導覽分頁搬到頂欄下方的 NavTabs；「回入口頁」由產品切換取代；
```
換成：
```tsx
// 原本 Header 的導覽分頁搬到頂欄下方的左側欄（Sidebar，UI 統一 4C）；「回入口頁」由產品切換取代；
```

- [ ] **Step 8: 刪除 `NavTabs.tsx` 與它的測試，確認沒有殘留引用**

Run: `cd /f/vsms/vsms-export && git rm src/components/layout/NavTabs.tsx src/__tests__/navTabs.test.tsx && grep -rn "NavTabs\|visibleNavTabs\|NAV_TABS" src`
Expected: `git rm` 印出兩行 `rm '...'`；grep 沒有任何輸出（exit code 1）。

- [ ] **Step 9: 跑本 task 的測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/sidebar.test.tsx src/__tests__/app-topbar.test.tsx src/__tests__/topbar.test.tsx src/__tests__/app-vauth-gate.test.tsx`
Expected: PASS。

- [ ] **Step 10: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 0 failures（檔數仍是 57：少 `navTabs.test.tsx`、多 `sidebar.test.tsx`；寫計畫時在 repo 的暫存副本實跑過是 57 檔、471 條，總數只供參考）；tsc 沒有任何輸出。

- [ ] **Step 11: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/layout/Sidebar.tsx src/__tests__/sidebar.test.tsx src/App.tsx src/components/layout/Topbar.tsx src/__tests__/app-topbar.test.tsx && git commit -m "$(cat <<'EOF'
feat(layout): replace the nav tab row with a collapsible sidebar

UI unification 4C. The 40px second-row tabs become a left sidebar under
the topbar with two groups (schedule / system), the same role filters,
232px expanded / 56px collapsed with a 150ms width transition, and the
collapsed state kept in localStorage (vsms-nav-collapsed). Roles with a
single page (user, guest) get no sidebar. The content area is min-w-0 so
the gantt chart simply shows more days when the sidebar collapses.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

（`NavTabs.tsx` 與 `navTabs.test.tsx` 的刪除已由 Step 8 的 `git rm` 放進暫存區，會一起進這個 commit。）

---

### Task 2: 窄螢幕抽屜與頂欄「選單」鈕

**Files:**
- Create: `F:\vsms\vsms-export\src\store\navDrawerStore.ts`
- Modify（整份改寫）: `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx`
- Modify: `F:\vsms\vsms-export\src\components\layout\Topbar.tsx`（import 兩行、`useTopbarData` 之後加三行、產品切換 `MenuButton` 之前插入按鈕、檔頭註解一行）
- Modify: `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx`（加兩行斷言）
- Create（測試）: `F:\vsms\vsms-export\src\__tests__\sidebar-drawer.test.tsx`

**Interfaces:**
- Consumes（Task 1）：`NAV_GROUPS`、`visibleNavGroups`、`sidebarVisible`、`SIDEBAR_ID`、`NAV_COLLAPSED_KEY`、`readNavCollapsed`、`writeNavCollapsed`、`Sidebar` 的 props（不變）。
- Produces：
  ```ts
  // src/store/navDrawerStore.ts
  export const useNavDrawerStore: UseBoundStore<StoreApi<{ open: boolean; setOpen: (open: boolean) => void }>>

  // src/components/layout/Sidebar.tsx（新增的匯出，其餘同 Task 1）
  export const NAV_DRAWER_ID = 'app-nav-drawer'
  export const NAV_MENU_BUTTON_ID = 'vsms-nav-menu-button'
  export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'
  ```
  DOM 約定：桌面側欄 `<aside id="app-sidebar">` 改成 `hidden md:flex`；抽屜外層 `md:hidden`，裡面是遮罩（`data-testid="nav-drawer-scrim"`）與 `#app-nav-drawer`（`role="dialog"`、`aria-modal="true"`、`aria-label="主選單"`，z-[46]，裡面 `<nav aria-label="主選單">`；遮罩 z-[45]）。抽屜一直掛著，關閉時 `aria-hidden="true"`＋`inert`＋`invisible -translate-x-full`，所以「選單」鈕的 `aria-controls` 永遠指得到東西。

- [ ] **Step 1: 寫抽屜與「選單」鈕的失敗測試**

新增 `F:\vsms\vsms-export\src\__tests__\sidebar-drawer.test.tsx`：

```tsx
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
```

- [ ] **Step 2: App 外框測試加上「選單」鈕的斷言**

在 `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx` 做兩處替換。

找到：
```tsx
    expect(within(topbar).getByRole('button', { name: '切換系統' })).toBeInTheDocument()
    expect(topbar.contains(sidebar)).toBe(false)
```
換成：
```tsx
    expect(within(topbar).getByRole('button', { name: '切換系統' })).toBeInTheDocument()
    expect(within(topbar).getByRole('button', { name: '開啟選單' })).toBeInTheDocument()
    expect(topbar.contains(sidebar)).toBe(false)
```

找到：
```tsx
    expect(sidebarEl()).toBeNull()
    expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
```
換成：
```tsx
    expect(sidebarEl()).toBeNull()
    expect(screen.queryByRole('navigation', { name: '主選單' })).toBeNull()
    expect(screen.queryByRole('button', { name: '開啟選單' })).toBeNull()
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/sidebar-drawer.test.tsx src/__tests__/app-topbar.test.tsx`
Expected: FAIL——`sidebar-drawer.test.tsx` 找不到模組 `../store/navDrawerStore`（`NAV_DRAWER_ID`、`DESKTOP_MEDIA_QUERY` 也還沒匯出）；`app-topbar.test.tsx` 的 super_admin 那條找不到「開啟選單」按鈕。

- [ ] **Step 4: 新增 `navDrawerStore.ts`**

新增 `F:\vsms\vsms-export\src\store\navDrawerStore.ts`：

```ts
// src/store/navDrawerStore.ts
//
// 窄螢幕（< md）側欄抽屜的開關狀態（UI 統一 4C）。開關鈕在頂欄（Topbar），抽屜在側欄
// （Sidebar），兩者在 App 裡是兄弟元件，所以狀態放在 store。不持久化：重新整理一律關閉。
import { create } from 'zustand'

interface NavDrawerState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useNavDrawerStore = create<NavDrawerState>()(set => ({
  open: false,
  setOpen: open => set({ open }),
}))
```

- [ ] **Step 5: 改寫 `Sidebar.tsx`（加抽屜）**

把 `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx` 整份換成：

```tsx
// src/components/layout/Sidebar.tsx
//
// VSMS 的左側欄（UI 統一 4C），取代 4A 放在頂欄下方的 40px 導覽分頁列。三系統各自實作、
// 行為一致，規格：F:\vportal\docs\superpowers\specs\2026-09-24-sidebar-design.md
//
// - 分組：「排程」（排程管理、統計分析）、「系統」（系統設定、審計紀錄）。角色篩選沿用 4A：
//   superAdminOnly 只給 super_admin；userHidden 對 user、guest 隱藏。篩選後沒有項目的組整組拿掉。
// - 可見項目只有一個（user、guest）時整個側欄（連同抽屜；頂欄的「選單」鈕也看同一個判斷）
//   不渲染，內容區佔滿寬度。
// - ≥ md：桌面側欄，展開 232px、收合 56px；寬度 150ms 過場，只在允許動畫時（motion-safe:）。
//   收合狀態記在 localStorage 的 vsms-nav-collapsed（'1' 收合、'0' 展開），讀不到一律展開、
//   寫入失敗不報錯。
// - < md：桌面側欄隱藏，改成頂欄「選單」鈕打開的抽屜（232px、一律展開樣式、沒有收合鈕）。
//   開關狀態在 navDrawerStore。抽屜一直掛著、關閉時 aria-hidden＋inert，讓「選單」鈕的
//   aria-controls 永遠指得到。遮罩 z-[45]、面板 z-[46]：高於頁面內容（最高 z-40）與頂欄，低於對話框（z-50）；
//   甘特圖全螢幕是 z-[100]，照樣蓋住側欄與抽屜。
//   打開時焦點到第一個項目、Tab 在抽屜內循環；點遮罩、Esc、點項目、視窗放大到 ≥ md 都會關閉，
//   關閉後焦點回「選單」鈕（視窗放大那種除外：鈕已隱藏）。只有打開時滑入；關閉是立即隱藏（visibility 不做過場，
//   打開當下才能馬上把焦點放進去）。
// - 選取色是 VSMS 的青綠（--vw-accent／--vw-accent-subtle）。
//
// 甘特圖不用跟著改：它的 SVG 寬是「天數 × 22px」、外層是橫向捲動容器，寬度全由 CSS 決定，
// 側欄收合時內容區變寬、可視範圍自動變大；統計頁的 recharts ResponsiveContainer 自己用
// ResizeObserver 重畫。App 的內容區要 min-w-0，甘特圖才不會把 flex 列撐開。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  LayoutList, BarChart2, Settings, ClipboardList, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavDrawerStore } from '../../store/navDrawerStore'
import type { Role, View } from '../../types'

export interface NavItem {
  key: View
  label: string
  icon: LucideIcon
  superAdminOnly?: boolean
  userHidden?: boolean
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: '排程',
    items: [
      { key: 'main',      label: '排程管理', icon: LayoutList },
      { key: 'analytics', label: '統計分析', icon: BarChart2, userHidden: true },
    ],
  },
  {
    title: '系統',
    items: [
      { key: 'settings', label: '系統設定', icon: Settings, userHidden: true },
      { key: 'audit',    label: '審計紀錄', icon: ClipboardList, superAdminOnly: true },
    ],
  },
]

function itemVisible(item: NavItem, role: Role | null): boolean {
  if (item.superAdminOnly && role !== 'super_admin') return false
  if (item.userHidden && (role === 'user' || role === 'guest')) return false
  return true
}

/** 依角色篩掉看不到的項目，再拿掉沒有項目的組。 */
export function visibleNavGroups(role: Role | null): NavGroup[] {
  return NAV_GROUPS
    .map(g => ({ title: g.title, items: g.items.filter(i => itemVisible(i, role)) }))
    .filter(g => g.items.length > 0)
}

/** 可見項目超過一個才有側欄（只有一頁可看的角色不顯示）。頂欄「選單」鈕也用這個判斷。 */
export function sidebarVisible(role: Role | null): boolean {
  return visibleNavGroups(role).reduce((n, g) => n + g.items.length, 0) > 1
}

export const SIDEBAR_ID = 'app-sidebar'
export const NAV_DRAWER_ID = 'app-nav-drawer'
export const NAV_MENU_BUTTON_ID = 'vsms-nav-menu-button'
export const NAV_COLLAPSED_KEY = 'vsms-nav-collapsed'
/** Tailwind 的 md 斷點（48rem＝768px）。視窗放大到這個寬度就關閉抽屜。 */
export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

/** 讀不到（無痕、被封鎖、值不是 '1'）一律視為展開。 */
export function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** 寫入失敗（無痕、被封鎖、容量滿）不報錯，只是下次不記得。 */
export function writeNavCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // 刻意忽略
  }
}

const ITEM_BASE =
  'flex h-9 w-full items-center gap-2.5 rounded-[var(--vw-radius-control)] text-[13px] font-medium whitespace-nowrap transition-colors'
const ITEM_IDLE =
  'text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]'
const ITEM_CURRENT = 'bg-[var(--vw-accent-subtle)] text-[var(--vw-accent)]'

interface NavGroupsProps {
  groups: NavGroup[]
  currentView: View
  collapsed: boolean
  onSelect: (v: View) => void
}

function NavGroups({ groups, currentView, collapsed, onSelect }: NavGroupsProps) {
  return (
    <div className={`flex flex-col ${collapsed ? '' : 'gap-4'}`}>
      {groups.map(group => (
        <div key={group.title} role="group" aria-label={group.title}>
          {collapsed
            ? (
              <div
                data-testid="nav-group-divider"
                aria-hidden="true"
                className="mx-auto my-2 h-px w-6 bg-[var(--vw-border)]"
              />
            )
            : (
              <div
                aria-hidden="true"
                className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.04em] text-[var(--vw-text-muted)]"
              >
                {group.title}
              </div>
            )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(item => {
              const current = item.key === currentView
              const Icon = item.icon
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-current={current ? 'page' : undefined}
                    aria-label={item.label}
                    title={collapsed ? item.label : undefined}
                    onClick={() => onSelect(item.key)}
                    className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${current ? ITEM_CURRENT : ITEM_IDLE}`}
                  >
                    <Icon size={18} aria-hidden="true" className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  role: Role | null
}

export function Sidebar({ currentView, onNavigate, role }: Props) {
  const [collapsed, setCollapsed] = useState(readNavCollapsed)
  const drawerOpen = useNavDrawerStore(s => s.open)
  const setDrawerOpen = useNavDrawerStore(s => s.setOpen)
  const drawerRef = useRef<HTMLDivElement>(null)

  // 關閉後焦點回「選單」鈕（在頂欄 Topbar，用 id 找）。視窗放大到 ≥ md 時那顆鈕已隱藏，
  // 傳 false 略過。
  const closeDrawer = useCallback((returnFocus: boolean = true) => {
    setDrawerOpen(false)
    if (returnFocus) document.getElementById(NAV_MENU_BUTTON_ID)?.focus()
  }, [setDrawerOpen])

  // 打開時焦點到第一個項目。
  useEffect(() => {
    if (drawerOpen) drawerRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [drawerOpen])

  // Esc 關閉。掛在 document 並 stopPropagation：甘特圖的覆蓋式全螢幕在 window 上聽 Esc。
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  // 視窗放大到 ≥ md 時關閉（桌面側欄接手）。
  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) closeDrawer(false) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [drawerOpen, closeDrawer])

  // 卸載（登出、角色變成沒有側欄）時歸零，下次掛載不會自己開著。
  useEffect(() => () => { useNavDrawerStore.getState().setOpen(false) }, [])

  if (!sidebarVisible(role)) return null
  const groups = visibleNavGroups(role)

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    writeNavCollapsed(next)
  }

  const selectFromDrawer = (v: View) => {
    onNavigate(v)
    closeDrawer()
  }

  // Tab 在抽屜內循環：抽屜裡可聚焦的只有項目按鈕。
  const onDrawerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <aside
        id={SIDEBAR_ID}
        className={`hidden md:flex flex-shrink-0 flex-col bg-[var(--vw-surface)] border-r border-[var(--vw-border)]
                    motion-safe:transition-[width] duration-150 ${collapsed ? 'w-14' : 'w-[232px]'}`}
      >
        <nav aria-label="主選單" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-3">
          <NavGroups groups={groups} currentView={currentView} collapsed={collapsed} onSelect={onNavigate} />
        </nav>
        <div className="flex-shrink-0 px-2 py-2 border-t border-[var(--vw-border)]">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? '展開側欄' : '收合側欄'}
            aria-expanded={!collapsed}
            aria-controls={SIDEBAR_ID}
            title={collapsed ? '展開側欄' : undefined}
            className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${ITEM_IDLE}`}
          >
            {collapsed
              ? <PanelLeftOpen size={18} aria-hidden="true" className="flex-shrink-0" />
              : <PanelLeftClose size={18} aria-hidden="true" className="flex-shrink-0" />}
            {!collapsed && <span>收合側欄</span>}
          </button>
        </div>
      </aside>

      <div className="md:hidden">
        <div
          data-testid="nav-drawer-scrim"
          aria-hidden="true"
          onClick={() => closeDrawer()}
          className={`fixed inset-0 z-[45] bg-[rgba(23,33,46,0.4)] motion-safe:transition-opacity duration-150
                      ${drawerOpen ? 'opacity-100' : 'invisible opacity-0'}`}
        />
        <div
          ref={drawerRef}
          id={NAV_DRAWER_ID}
          role="dialog"
          aria-modal="true"
          aria-label="主選單"
          aria-hidden={drawerOpen ? undefined : true}
          inert={!drawerOpen}
          onKeyDown={onDrawerKeyDown}
          className={`fixed inset-y-0 left-0 z-[46] flex w-[232px] flex-col bg-[var(--vw-surface)]
                      border-r border-[var(--vw-border)] shadow-lg motion-safe:transition-transform duration-150
                      ${drawerOpen ? 'translate-x-0' : 'invisible -translate-x-full'}`}
        >
          <nav aria-label="主選單" className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
            <NavGroups groups={groups} currentView={currentView} collapsed={false} onSelect={selectFromDrawer} />
          </nav>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 6: `Topbar.tsx` 加「選單」鈕**

在 `F:\vsms\vsms-export\src\components\layout\Topbar.tsx` 做四處替換。

(a) 找到：
```tsx
// 由左到右：產品切換（下拉）、並排連結、彈性空白、通知鈴鐺、使用者選單。
```
換成：
```tsx
// 由左到右：（< md 且有側欄時）「選單」鈕、產品切換（下拉）、並排連結、彈性空白、通知鈴鐺、使用者選單。
```

(b) 找到：
```tsx
import { Bell, Check, KeyRound, LogOut } from 'lucide-react'
import { MenuButton, type MenuItem } from '../shared/MenuButton'
import { useAuthStore } from '../../store/authStore'
```
換成：
```tsx
import { Bell, Check, KeyRound, LogOut, Menu } from 'lucide-react'
import { MenuButton, type MenuItem } from '../shared/MenuButton'
import { useAuthStore } from '../../store/authStore'
import { useNavDrawerStore } from '../../store/navDrawerStore'
import { NAV_DRAWER_ID, NAV_MENU_BUTTON_ID, sidebarVisible } from './Sidebar'
```

(c) 找到：
```tsx
  const { apps, unreadCount } = useTopbarData({ vauth, guest })
```
換成：
```tsx
  const { apps, unreadCount } = useTopbarData({ vauth, guest })

  // 窄螢幕（< md）打開側欄抽屜的「選單」鈕（UI 統一 4C）。沒有側欄的角色（測試人員、訪客）不顯示。
  const showNavMenu = sidebarVisible(role)
  const drawerOpen = useNavDrawerStore(s => s.open)
  const setDrawerOpen = useNavDrawerStore(s => s.setOpen)
```

(d) 找到：
```tsx
    <header className="h-12 flex-shrink-0 flex items-center gap-4 px-4 whitespace-nowrap
                       bg-[var(--vw-surface)] border-b border-[var(--vw-border)]">
      <MenuButton
        label="Validation Workspace"
```
換成：
```tsx
    <header className="h-12 flex-shrink-0 flex items-center gap-4 px-4 whitespace-nowrap
                       bg-[var(--vw-surface)] border-b border-[var(--vw-border)]">
      {showNavMenu && (
        <button
          id={NAV_MENU_BUTTON_ID}
          type="button"
          aria-label="開啟選單"
          aria-expanded={drawerOpen}
          aria-controls={NAV_DRAWER_ID}
          onClick={() => setDrawerOpen(true)}
          className="md:hidden flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md
                     text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      )}
      <MenuButton
        label="Validation Workspace"
```

- [ ] **Step 7: 跑本 task 的測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/sidebar-drawer.test.tsx src/__tests__/sidebar.test.tsx src/__tests__/app-topbar.test.tsx src/__tests__/topbar.test.tsx`
Expected: PASS（`sidebar.test.tsx` 與 `topbar.test.tsx` 一條都不能壞）。

- [ ] **Step 8: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 0 failures（寫計畫時在暫存副本實跑過：58 檔、483 條，總數只供參考）；tsc 沒有任何輸出。

- [ ] **Step 9: Commit**

```bash
cd /f/vsms/vsms-export && git add src/store/navDrawerStore.ts src/components/layout/Sidebar.tsx src/components/layout/Topbar.tsx src/__tests__/sidebar-drawer.test.tsx src/__tests__/app-topbar.test.tsx && git commit -m "$(cat <<'EOF'
feat(layout): narrow-screen nav drawer opened from the topbar menu button

Below md the sidebar no longer takes layout space: a 32x32 menu button at
the far left of the topbar opens a 232px drawer (always expanded, no
collapse button) over a scrim, above the page and below dialogs. Focus
moves into the drawer and Tab cycles inside it; the scrim, Esc, choosing
an item or widening the window to md closes it and returns focus to the
button. Roles without a sidebar get no menu button.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## 部署（controller 執行，不派給 subagent）

### A. harness 準備與改前截圖（在派 **Task 1** 之前做完）

Task 1 就會把第二列分頁換成側欄，所以派 Task 1 之前把改前畫面拍齊。

harness 在 repo 根目錄（`_dev-admin.html`、`_dev-admin.tsx`、`_dev-stub.ts`、`_dev-view.ts`、`_dev-fixtures/`，已列入 `.git/info/exclude`，**不得 commit**）。`F:\.claude\launch.json` 的 `vsms-harness` 起 vite `127.0.0.1:5175`。既有參數：`?role=super_admin|admin|user|guest`（`_dev-stub.ts`，預設 super_admin；`user` 就是測試人員）、`&view=`／`&tab=`（`_dev-view.ts`）、`&auth=vauth`、`&unread=`、`&fail=`。

1. 加一個參數讓截圖能指定收合狀態（只改 dev 檔案）。在 `F:\vsms\vsms-export\_dev-view.ts` **最後面**加上：
   ```ts
   // 側欄（UI 統一 4C）：&nav=collapsed／expanded 先寫好收合狀態（localStorage vsms-nav-collapsed）；不帶就沿用上次。
   const nav = q.get('nav')
   if (nav === 'collapsed') localStorage.setItem('vsms-nav-collapsed', '1')
   if (nav === 'expanded') localStorage.setItem('vsms-nav-collapsed', '0')
   ```
   驗證：`grep -n "vsms-nav-collapsed" /f/vsms/vsms-export/_dev-view.ts` 應該有兩筆。改前這個參數沒有作用（還沒有側欄），不影響改前截圖。這段修改保留（`_dev-*` 本來就不進 git）。
2. `preview_start` 名稱 `vsms-harness`。先用瀏覽器窗格開 `http://127.0.0.1:5175/_dev-admin.html?role=super_admin&view=main` 確認畫面出來、console 沒有錯誤。harness 裡不要點會導頁的連結（`/`、`/vtms/`、`/inbox`、`/change-password`），也不要按「登出」。
3. 改前截圖（Edge headless，PowerShell；存到 controller 的 scratchpad，下例用 `$env:TEMP\vsms-4c`，可換成 scratchpad 路徑）：

   ```powershell
   New-Item -ItemType Directory -Force "$env:TEMP\vsms-4c" | Out-Null
   $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
   $base = "http://127.0.0.1:5175/_dev-admin.html"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\before-sa-main.png" "$base?role=super_admin&view=main"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\before-sa-main-vauth.png" "$base?role=super_admin&view=main&auth=vauth"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\before-sa-analytics.png" "$base?role=super_admin&view=analytics"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\before-admin-settings.png" "$base?role=admin&view=settings&tab=people"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\before-user-main.png" "$base?role=user&view=main"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\before-guest-main.png" "$base?role=guest&view=main"
   ```

   headless 若拍到空白（vite 首次編譯較慢），改用瀏覽器窗格（`computer` screenshot）拍同一組網址。改前預期：48px 頂欄下方是 40px 白色分頁列（super_admin 四個分頁、admin 三個、user／guest 沒有分頁列），甘特圖佔滿頂欄與分頁列以下的全寬。
4. 瀏覽器窗格（Edge headless 最小寬度約 500px，手機寬與互動畫面都在這裡拍）：
   - `?role=super_admin&view=main`，按工具列的「全螢幕檢視」→ 截圖（甘特圖蓋住頂欄與分頁列），再按「離開全螢幕（Esc）」或 Esc 離開。
   - `resize_window` preset `mobile`（375×812）後重新整理 `?role=super_admin&view=main` → 截圖（分頁列可橫向捲動）；用 `javascript_tool` 記下 `[document.documentElement.scrollWidth, window.innerWidth]`，改後要比對（兩個值應相等＝沒有橫向捲動）。
   - 拍完 `resize_window` preset `desktop` 還原。

### B. 改後截圖（Task 1、Task 2 都 commit 之後）

1. Edge headless，同一組指令把 `before-` 換成 `after-`，並在網址加上 `&nav=expanded`；另外多拍收合版：

   ```powershell
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\after-sa-main-collapsed.png" "$base?role=super_admin&view=main&nav=collapsed"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\after-sa-analytics-collapsed.png" "$base?role=super_admin&view=analytics&nav=collapsed"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4c\after-admin-settings-collapsed.png" "$base?role=admin&view=settings&tab=people&nav=collapsed"
   ```

   預期：
   - `after-sa-main`（展開）：頂欄下方沒有分頁列；左邊 232px 白色側欄、右側 1px 邊線。「排程」小標（11px 灰字）下是「排程管理」（淡青綠底、青綠字、LayoutList 圖示）與「統計分析」；隔 16px 是「系統」小標、「系統設定」「審計紀錄」。側欄最底部隔一條線是 PanelLeftClose 圖示＋「收合側欄」。甘特圖在側欄右邊。
   - `after-sa-main-collapsed`：側欄 56px，只剩置中圖示；兩個小標變成置中的短分隔線；最底部只有 PanelLeftOpen 圖示。甘特圖比展開版多看得到約 8 天（176px ÷ 22px）。
   - `after-sa-analytics`（展開／收合）：兩張的圖表都填滿內容區寬度（收合版較寬），沒有被截掉或留白。
   - `after-admin-settings`：側欄三個項目、「系統設定」選取；設定頁自己的分頁列在內容區裡。
   - `after-user-main`、`after-guest-main`：沒有側欄，甘特圖佔滿全寬（跟改前一樣少了分頁列）。
   - `after-sa-main-vauth`：頂欄內容與改前相同（1440 寬看不到「選單」鈕）。
2. 瀏覽器窗格（1440 寬）：
   - `?role=super_admin&view=main&nav=expanded`：`javascript_tool` 量 `document.querySelector('main').getBoundingClientRect().width`；按「收合側欄」，等 300ms 再量一次，應該多 176（232−56）；甘特圖的時間軸看得到更多天、沒有空白條。重新整理後仍是收合（localStorage）；把滑鼠停在收合的「統計分析」上會出現原生提示「統計分析」（或用 `find`／`read_page` 確認 `title`）。按「展開側欄」還原。
   - `?role=super_admin&view=analytics&nav=expanded`：量 `document.querySelector('.recharts-surface')?.getAttribute('width')`；收合、等 500ms 再量，數字變大（recharts 跟著重畫）。
   - `?role=super_admin&view=main`，按「全螢幕檢視」：甘特圖（`z-[100]`）蓋住頂欄與側欄；Esc 離開後側欄還在、狀態不變。
3. 瀏覽器窗格手機寬（`resize_window` preset `mobile` 後重新整理）：
   - `?role=super_admin&view=main`：沒有側欄；頂欄最左邊是 ☰（「選單」鈕），接著產品切換的勾勾方塊。`javascript_tool` 量 `[document.documentElement.scrollWidth, window.innerWidth]`，兩者相等（沒有橫向捲動）。
   - 點 ☰：左側滑出 232px 白色抽屜（展開樣式、有「排程」「系統」小標、沒有收合鈕），右邊是半透明深色遮罩蓋住頂欄與甘特圖；焦點框在「排程管理」→ 截圖。
   - 按 Esc → 抽屜關閉、焦點框回到 ☰。再開 → 點遮罩 → 關閉。再開 → 點「統計分析」→ 換到統計頁、抽屜關閉。
   - 再開抽屜，`resize_window` preset `desktop` → 抽屜消失、桌面側欄出現（`read_page` 確認沒有 `dialog`）。
   - `resize_window` preset `mobile` 後重新整理 `?role=user&view=main`：沒有 ☰。
   - 拍完 `resize_window` preset `desktop` 還原。

改前／改後並排給使用者看，**使用者同意後**才往下做。

### C. 建置與上線

0. 規格的上線順序是入口頁 → VSMS → VTMS 1.37.0。先確認入口頁的 4C 已上線（`https://172.16.204.69/` 入口頁側欄沒有「系統」分組、頂欄最左邊窄螢幕有「選單」鈕）；若入口頁還沒上，先問使用者要不要讓 VSMS 先上（兩者沒有程式相依，只是照順序）。
1. 確認工作樹與分支：`cd /f/vsms/vsms-export && git status --short && git branch --show-current && git log --oneline -4`。預期：`git status --short` 沒有輸出（`_dev-*` 已被 exclude）、分支 `feat/guest-role-and-uiux`、最新兩筆是 Task 2、Task 1 的 commit，再下面是本計畫的 commit。
2. 最後一次驗證：`cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`，0 failures、0 錯。
3. 備份：`cp -r /f/vsms/vsms-export/dist /f/vsms/vsms-export/dist.stable-20260924-pre-sidebar`（若同名已存在就停下來問，不要覆蓋）。
4. 只跑 `cd /f/vsms/vsms-export && npx vite build`。**不要**跑 `npm run build`（它會連 server 一起 tsc），**不要** `pm2`（任何子指令）：dist 由磁碟即時服務，前端修正只需 build。
5. 確認新版進了 bundle（`vite-plugin-singlefile`，整包在 `dist/index.html`；用 ASCII 字串比對，不受中文跳脫影響）：
   ```bash
   cd /f/vsms/vsms-export && grep -c "vsms-nav-collapsed" dist/index.html; grep -c "app-nav-drawer" dist/index.html
   ```
   兩個都至少 `1`。
6. 驗證正式站送出的 HTML 就是剛建出來的那份：
   ```bash
   curl -sk https://172.16.204.69/vsms/ | sha256sum
   sha256sum /f/vsms/vsms-export/dist/index.html
   ```
   兩個 hash 必須相同。
7. 實機（由使用者操作，**不代輸入帳密**）：請使用者從入口頁（`https://172.16.204.69/`）登入後進 `/vsms/`，確認：
   - 管理者帳號：左側欄分組與項目正確、目前頁青綠；按「收合側欄」變窄、甘特圖變寬；重新整理後仍收合；再展開。
   - 甘特圖「全螢幕檢視」蓋住頂欄與側欄，離開後恢復。
   - 把瀏覽器視窗拉到 768px 以下：側欄消失、頂欄最左邊出現「選單」鈕，抽屜開關正常、沒有橫向捲動。
   - 若方便：測試人員帳號或入口頁「以訪客身分瀏覽 VSMS（唯讀）」進來，沒有側欄也沒有「選單」鈕。
8. master 快轉到 `feat/guest-role-and-uiux`（照往例部署時快轉；只在能快轉時才動）：
   ```bash
   cd /f/vsms/vsms-export && git merge-base --is-ancestor master feat/guest-role-and-uiux && git branch -f master feat/guest-role-and-uiux && git log --oneline -1 master
   ```
   推 GitHub（`git push origin master feat/guest-role-and-uiux`）**先問使用者**，同意才推。
9. `preview_stop` 關掉 `vsms-harness`；`_dev-view.ts` 的 `&nav=` 參數保留（`_dev-*` 不進 git）。
10. 更新畫布進度（4C VSMS → 已上線）與相關記憶（`workspace-ui-review-2026-09-23.md`：第 4C 項 VSMS 已上線、退版備份 `dist.stable-20260924-pre-sidebar`；`vsms-project-layout.md` 可補一句「導覽在 `Sidebar.tsx`，收合鍵 `vsms-nav-collapsed`」）。

**退版**：
```bash
rm -rf /f/vsms/vsms-export/dist
cp -r /f/vsms/vsms-export/dist.stable-20260924-pre-sidebar /f/vsms/vsms-export/dist
```
不需要重啟 vsms。退版後用第 6 步的 hash 比對確認正式站回到舊版。使用者瀏覽器裡的 `vsms-nav-collapsed` 在舊版沒有作用，不用清。

---

## Self-Review

**1. 規格覆蓋（VSMS 範圍）**

| 規格要求 | 位置 |
|---|---|
| 側欄在頂欄下方、內容區左邊，高度填滿剩餘高度、自己捲動；頂欄固定在上方 | Task 1 App（`flex-1 min-h-0 flex` 列、`h-screen` 不捲動）、`nav overflow-y-auto`；測試 app-topbar「沒有第二列」「頂欄在最上面」、sidebar「導覽區自己捲動」 |
| 底色 `--vw-surface`、右邊框 1px `--vw-border` | Task 1 Sidebar 外框；測試「展開寬 232px；底色、右邊框用 token」 |
| 展開 232／收合 56px、150ms、reduced-motion 不加 | `w-[232px]`／`w-14`、`motion-safe:transition-[width] duration-150`；同上測試＋收合測試 |
| 分組標題 11px／600／muted／0.04em／12px；組間 16px | `NavGroups` 標題 class、`gap-4`；測試「分組標題」 |
| 項目 36px／12px／圓角 token／18px 圖示／13px／間距 10px／上下 2px；側欄內距 8px | `ITEM_BASE`、`px-3`、`size={18}`、`gap-0.5`、nav `px-2`；測試「項目：…」「導覽區自己捲動、左右內距 8px」 |
| 目前頁 `aria-current` ＋ VSMS 青綠；hover `--vw-surface-subtle` | `ITEM_CURRENT`／`ITEM_IDLE`；測試「目前頁」 |
| 收合鈕在底部、不捲動、36px、PanelLeftClose／Open、「收合側欄」文字、aria-label、aria-expanded、aria-controls | Sidebar 底部區塊；測試「預設展開」「按下收合」「收合鈕固定在底部」 |
| 收合時只剩圖示、項目 title＋aria-label、標題變 24px 分隔線上下 8px | `NavGroups` collapsed 分支（`aria-label` 一律帶）；測試「收合時：…」「展開時項目的 aria-label…」 |
| localStorage `vsms-nav-collapsed`、`'1'`／`'0'`、讀不到展開、寫入失敗不報錯、預設展開、重新掛載讀回 | `readNavCollapsed`／`writeNavCollapsed`；測試「重新掛載」「值為…」「讀取丟例外」「寫入丟例外」 |
| 徽章紅點 | VSMS 沒有徽章，不適用（Global Constraints 註明） |
| < md 抽屜：從左滑出、232px、一律展開、遮罩 `rgba(23,33,46,.4)`、z 高於頂欄與內容低於對話框、沒有收合鈕 | Task 2 Sidebar 抽屜（遮罩 `z-[45]`、面板 `z-[46]`）；測試「打開」「抽屜一律展開樣式」 |
| 「選單」鈕：頂欄最左、32×32、`Menu`、`aria-label="開啟選單"`、`aria-expanded`、`aria-controls`、只在 < md | Task 2 Topbar (d)；測試「在頂欄最左邊…」 |
| 關閉：遮罩、Esc、項目、放大到 ≥ md；焦點回選單鈕；打開焦點到第一項；Tab 循環 | `closeDrawer`、三個 effect、`onDrawerKeyDown`；測試「點遮罩」「按 Esc」「點抽屜內項目」「Tab 循環」「視窗放大」 |
| 窄螢幕沒有橫向捲動 | 桌面側欄 `hidden md:flex`、抽屜 fixed；部署 A4／B3 量 `scrollWidth` |
| 側欄不顯示時「選單」鈕也不顯示 | `sidebarVisible` 共用；測試 sidebar-drawer「user／guest」、app-topbar user／guest |
| VSMS 分組與項目、角色篩選、空組不顯示 | `NAV_GROUPS`、`visibleNavGroups`；測試「分組與項目依角色」「admin：兩組」 |
| 只有一個可見項目時側欄與選單鈕都不顯示、內容區佔滿 | `sidebarVisible`；測試 sidebar「整個側欄不渲染」、app-topbar user／guest |
| 第二列分頁移除 | Task 1 刪 `NavTabs.tsx`、App 改版面；測試「沒有 4A 的第二列分頁」 |
| 甘特圖全螢幕照樣蓋住；收合後甘特圖跟著變大 | 桌面側欄無 z-index、抽屜 `z-[45]`／`z-[46]`；內容區 `min-w-0`（測試「內容區 flex-1 min-w-0」）；部署 B2 實量寬度與全螢幕 |
| 選取色 `--vw-accent`／`--vw-accent-subtle` | `ITEM_CURRENT` |
| 既有 NavTabs 測試改寫；型別檢查與全套測試全過 | `navTabs.test.tsx` → `sidebar.test.tsx`；每個 task 的「全套測試＋型別檢查」 |
| 上線：只 `npx vite build`、備份 `dist`；改前／改後截圖（admin 展開、收合、手機抽屜；tester 無側欄） | 部署 A／B／C |

**2. 佔位掃描**：三個新檔與改寫檔整份給出；`App.tsx`、`Topbar.tsx`、`app-topbar.test.tsx`（Task 2）給了原文片段與新片段；harness 修改給了完整程式碼。沒有 TBD／「比照」／「適當處理」。

**3. 名稱與型別一致**：`SIDEBAR_ID='app-sidebar'`、`NAV_COLLAPSED_KEY='vsms-nav-collapsed'`、`NAV_DRAWER_ID='app-nav-drawer'`、`NAV_MENU_BUTTON_ID='vsms-nav-menu-button'`、`DESKTOP_MEDIA_QUERY='(min-width: 768px)'` 在 Sidebar 定義，Topbar 與兩個測試檔用同一組名稱。`visibleNavGroups`／`sidebarVisible` 參數都是 `Role | null`，Topbar 傳 authStore 的 `role`（`Role | null`）。`useNavDrawerStore` 的 `open`／`setOpen` 在 store、Sidebar、Topbar、測試一致。`Sidebar` props（`currentView`、`onNavigate`、`role`）與舊 `NavTabs` 相同，App 只換元件名。`data-testid` 的 `nav-group-divider`、`nav-drawer-scrim` 在元件與測試一致。Task 2 整份改寫的 Sidebar 保留 Task 1 的所有匯出與 class，`sidebar.test.tsx` 不用改（它只檢查 `w-*` 等 class，不檢查 `flex`）。

## 替規格決定的細節

1. **元件改名 `Sidebar.tsx`**：規格寫「`NavTabs.tsx` 改為側欄元件」。內容全換（分組、收合、抽屜），檔名留著 NavTabs 會誤導，所以新增 `Sidebar.tsx`、刪掉 `NavTabs.tsx`，`NAV_TABS`／`visibleNavTabs` 改成 `NAV_GROUPS`／`visibleNavGroups`（規則不變）。
2. **遮罩色照抄 `rgba(23,33,46,.4)`**：這是規格逐字值、三系統共用，而現有 token 沒有遮罩色、又不得新增 token。另一個寫法 `color-mix(in srgb, var(--vw-ink) 40%, transparent)` 算出來相同，但 Tailwind 產生的退路是不透明的 `--vw-ink`，舊瀏覽器會整片黑，所以不用。
3. **z-index 45／46**：VSMS 頁面內容最高 `z-40`（篩選面板），對話框 `z-50`（確認框、表單、匯出），逾時警告 `z-[60]`、通知 `z-[70]`；遮罩取 `z-[45]`、抽屜面板 `z-[46]`（面板在遮罩之上）夾在中間。頂欄沒有 z-index，一樣被蓋住。
4. **抽屜與側欄的 id、名稱與入口頁計畫對齊**：側欄 `<aside id="app-sidebar">`＋`<nav aria-label="主選單">`；抽屜 `<div id="app-nav-drawer" role="dialog" aria-modal="true" aria-label="主選單">`，裡面同樣是 `<nav aria-label="主選單">`；項目一律帶 `aria-label`、`title` 只在收合時；視窗放大關閉時不送回焦點。抽屜一直掛著，關閉時 `aria-hidden`＋`inert`＋`invisible`，讓 `aria-controls` 永遠指得到元素。
5. **只有打開時滑入**：關閉是立即隱藏。`visibility` 若也做過場，打開當下元素還是 hidden，焦點放不進去；遮罩同理只做透明度。
6. **抽屜狀態放 zustand store**（`navDrawerStore`）：開關鈕在 `Topbar`、抽屜在 `Sidebar`，兩者在 App 是兄弟；用 store 不必改 `Topbar` 的 props、也不必把狀態拉進 CRLF 的 `App.tsx`。`Sidebar` 卸載時歸零。
7. **關閉後的焦點**用 `document.getElementById('vsms-nav-menu-button')` 找頂欄的鈕（這個 id 規格與對齊訊息都沒指定，沿用 VSMS 前綴）；視窗放大到 ≥ md 而關閉時呼叫 `closeDrawer(false)`，不送焦點（那時鈕已 `display:none`）。
8. **頂欄固定**：VSMS 整頁是 `h-screen`、內容區自己捲動，頂欄本來就不會捲走，不需要 `sticky`。側欄高度由 flex 列撐滿（等於 `calc(100vh - 48px)`），不寫死算式。
9. **甘特圖不改程式碼**：SVG 寬是資料決定的、外層橫向捲動，可視寬度由 CSS 決定；列虛擬化只看高度（收合不改高度）。只要內容區 `min-w-0`。統計頁 recharts 的 `ResponsiveContainer` 自帶 ResizeObserver。改後截圖實量 `main` 寬度多 176px、recharts 寬度變大。
10. **收合鈕上方畫一條 `--vw-border` 分隔線**、收合時補 `title="展開側欄"`：規格只說固定在底部，分隔線讓它跟可捲動的項目區分開。
11. **分組的無障礙名稱**：每組 `role="group"`＋`aria-label`＝組名；看得到的標題 `aria-hidden`，避免重複念，收合時標題換成分隔線、組名仍在。
12. **項目字重 `font-medium`**（規格沒寫），與頂欄並排連結一致；目前頁只換底色與字色。
13. **Task 1 中間狀態**：Task 1 做完、Task 2 前，側欄在所有寬度都顯示（手機也佔 232px）；兩個 task 都 commit 才部署。
