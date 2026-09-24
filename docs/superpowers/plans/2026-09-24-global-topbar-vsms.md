# VSMS 全域頂欄與使用者選單（UI 統一 4A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 VSMS 的單排深色 `Header` 換成三系統共用規格的 48px 白色頂欄（產品切換＋並排連結＋通知鈴鐺＋使用者選單），原本的導覽分頁搬到頂欄下方 40px 的第二列。

**Architecture:** 共用的 `MenuButton`（3C）擴充成頂欄也能用（自訂觸發內容、靠左對齊、連結項目、說明、打勾、分隔線、標頭、md 尺寸），兩個下拉都用它，鍵盤與關閉行為不用重寫。vauth 的資料（`GET /portal/apps`、`GET /notify/inbox?limit=1`）由 `src/lib/topbarData.ts` 以站台根目錄的絕對路徑直接 `fetch`（不經 `withBase`、不經 `lib/api.ts`），`useTopbarData` hook 在頂欄掛載時各讀一次、失敗退回內建清單。`Topbar.tsx` 只負責組畫面；`NavTabs.tsx` 接手 `NAV_TABS` 與角色篩選；`App.tsx` 換掛載點，`Header.tsx` 刪除。

**Tech Stack:** React 19、TypeScript、Tailwind v4、zustand、lucide-react 1.11；測試用 vitest 4（jsdom）＋ @testing-library/react 16 ＋ @testing-library/user-event 14。

**Spec:** `F:\vportal\docs\superpowers\specs\2026-09-24-global-topbar-design.md`（本計畫涵蓋「頂欄規格」「資料來源」兩節的 VSMS 端、「各系統的放法」的 VSMS 那一條、「測試」與「上線」的 VSMS 部分。vauth 的 `showInTopbar` 欄位、入口頁、VTMS 各有自己的計畫）

## Global Constraints

- Repo `F:\vsms\vsms-export`，commit 在目前分支 `feat/guest-role-and-uiux`（起點 HEAD `43396db`；master 在部署時快轉）。一律用絕對路徑（Bash 用 `/f/vsms/vsms-export/...`）；平行的 Bash 呼叫共用 cwd，每個指令都先 `cd /f/vsms/vsms-export &&`。
- Commit message 用英文，結尾一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **絕對不要**執行 `git restore`、`git checkout`（檔案或分支）、`git stash`、`git reset`、`git clean`，或任何會丟掉工作樹修改的指令。需要舊版內容時用 `git show HEAD:<path>`。只 `git add` 自己改的檔案，逐一列出路徑（刪檔用 `git rm <path>`）。
- 不要跑 `npm run build`，不要 `npx vite build`，不要 `pm2`（任何子指令），不要部署。部署由 controller 依最後一節執行。
- 不要碰 repo 根目錄的 `_dev-*` 檔案與 `_dev-fixtures/`（harness，git 已排除，只有 controller 在部署段落會改）。
- 不要改 `src/lib/api.ts`：vauth 的請求不能走 `req()`（它會加 `/api` 前綴與 `X-Vsms-Session` 標頭，401＋`SSO_REVOKED` 時還會把 VSMS 登出）。
- 指令：
  - 前端測試：`npm test`（`vitest run`，只跑 `src/__tests__`）。起點基準：50 檔、365 條全過。
  - 單檔測試：`npx vitest run src/__tests__/<file>`。
  - 型別檢查：`npx tsc -p tsconfig.app.json --noEmit`，必須 0 錯（`src/__tests__` 也在檢查範圍內，測試碼也要過型別）。
- 測試絕不碰真的後端或資料庫：`fetch` 用 `vi.stubGlobal('fetch', fetchMock)`（照 `src/__tests__/authStore-crossLogout.test.ts`），store 用 zustand `setState` 塞狀態或換掉函式（照 `src/__tests__/protectedLayout-initError.test.tsx`）。
- 行尾：`src/App.tsx` 是 CRLF（`core.autocrlf=true`），用 Edit 工具換片段即可；若用腳本改檔要處理 `\r\n`，改完 grep 驗證（這台機器的 `python` 是 Store 佔位程式，會靜默不改檔，要用 node）。`MenuButton.tsx` 與新檔用 LF。
- 顏色：Tailwind 的 gray／slate／stone 都對應同一組墨色，`blue-*` 已重新定義成青綠（VSMS 的選取色：`border-blue-600 text-blue-700`、`bg-blue-50`）。頂欄底色與底線用共用 token：`bg-[var(--vw-surface)]`、`border-[var(--vw-border)]`；標誌與頭像底色 `bg-[var(--vw-accent)]`；未讀徽章紅底 `bg-[var(--vw-danger-solid)]`。不要引進新色系。
- 網址（全部是站台根目錄的絕對路徑，**不經 `withBase`**；VSMS 部署在 `/vsms/` 底下，加前綴會錯）：
  - vauth API：`/portal/apps`、`/notify/inbox?limit=1`，`fetch(url, { credentials: 'same-origin' })`。
  - 連結：入口頁首頁 `/`、通知 `/inbox`、修改密碼 `/change-password`（入口頁的 React Route；舊 Header 的 `/#change-password` 是錯的，入口頁是 BrowserRouter）、各系統用 `/portal/apps` 回來的 `url`。
  - 退回清單（讀取失敗或非 vauth 模式）：入口頁首頁 `/`、VTMS `/vtms/`、VSMS `/vsms/`，`showInTopbar` 全為真。實作上「入口頁首頁」是產品切換下拉固定的第一項，`FALLBACK_APPS` 只放 VTMS、VSMS，所以下拉在退回時正好是這三項。
  - `showInTopbar` 缺欄位（vauth 尚未上新版）時視為真：`a.showInTopbar !== false`。
- 逐字 UI 文字（照抄，不要改寫）：
  - 產品切換鈕：「Validation Workspace」（按鈕 `aria-label="切換系統"`，與入口頁、VTMS 一致；按鈕上看得到的文字仍是「Validation Workspace」）；下拉第一項「入口頁首頁」。
  - 鈴鐺 `aria-label="通知"`；未讀大於 99 顯示「99+」。
  - 使用者選單鈕 `aria-label="使用者選單"`、`aria-haspopup="menu"`。
  - VSMS 角色中文：`super_admin`「超級管理者」、`admin`「管理者」、`user`「測試人員」、`guest`「訪客（唯讀）」。
  - 選單項目：「修改密碼」「登出」。VSMS **沒有**「深色模式」「使用原介面」／「使用新介面」（那是 VTMS 專屬）；「顯示在頂欄」是入口頁後台的勾選框，VSMS 只讀 `showInTopbar` 欄位。
  - 「回入口頁」**移除**；角色縮寫徽章（SA／A／U／G）移除，改成使用者選單標頭的中文角色。
  - 導覽分頁：「排程管理」「統計分析」「系統設定」「審計紀錄」，`<nav aria-label="主導覽">`；並排連結 `<nav aria-label="系統">`。
- 頂欄版面（規格）：高 48px（`h-12`）、左右內距 16px（`px-4`）、元素間距 16px（`gap-4`）、`whitespace-nowrap`。由左到右：產品切換鈕（22×22 圓角方塊 `--vw-accent` 底＋白色勾勾＋「Validation Workspace」14px 粗體＋▾）→ 並排連結（每項 32px 高 `h-8`、左右內距 12px `px-3`、13px 中字重 `text-[13px] font-medium`，目前系統 `aria-current="page"`＋`bg-blue-50 text-blue-700`）→ 彈性空白 → 鈴鐺（32×32，lucide `Bell` 18px，右上角紅色數字徽章）→ 使用者選單鈕（26px 圓形頭像：名稱前兩個字元轉大寫，`--vw-accent` 底；名稱 13px；▾）。
- 第二列（規格）：`NAV_TABS` 移到頂欄下方，高 40px（`h-10`）、白底、底線；角色篩選不變（`superAdminOnly` 只給 `super_admin`；`userHidden` 對 `user`、`guest` 隱藏）；只有一個可見分頁時整列不渲染。
- 使用者選單內容（由上到下）：不可點的標頭（名稱，下一行中文角色）→「修改密碼」（只在 `authProvider === 'vauth'` 且不是訪客時出現，連到 `/change-password`；local 模式維持現狀：沒有入口）→ 分隔線（前面有項目時才畫）→「登出」（呼叫既有的 `useAuthStore` 的 `logout`，單一登出流程不動）。
- 通知鈴鐺：未讀數讀 `GET /notify/inbox?limit=1` 的 `unreadCount`，只在頂欄掛載時讀一次、不輪詢；非 vauth 模式與讀取失敗時不顯示數字（鈴鐺仍在）；訪客不讀，而且**訪客不顯示鈴鐺**（見文末「替規格決定的細節」）。0 則不顯示徽章。點擊前往 `/inbox`。
- 系統清單：`GET /portal/apps` 只在 vauth 模式、頂欄掛載時讀一次；讀取中並排連結先不畫（避免內建清單閃一下再被換掉），下拉在讀取中先用內建清單。
- 兩個下拉的行為（寫死，`MenuButton` 已具備，擴充時不得破壞）：點外面關閉；Esc 關閉並把焦點還給觸發按鈕（且 `stopPropagation`，不漏到 window，甘特圖覆蓋式全螢幕在 window 上聽 Esc）；上下鍵循環移動、Home／End 到頭尾；Tab 關閉並把焦點同步移回按鈕；清單 `role="menu"`、項目 `role="menuitem"`（連結項目也是 `role="menuitem"` 的 `<a>`）；按鈕 `aria-haspopup="menu"`、`aria-expanded`、開啟時 `aria-controls`；清單 portal 到 `document.body`、`position: fixed`、`z-[110]`（蓋過甘特圖全螢幕的 `z-[100]`）；視窗 resize 或捲動時關閉。
- 範圍外：vauth 的 `showInTopbar` 欄位與入口頁後台勾選框（vportal 計畫）、VTMS、登入頁（4B）、側欄（4C）、通知輪詢、單一登出流程重構。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `F:\vsms\vsms-export\src\components\shared\MenuButton.tsx` | 改寫 | 加 `trigger`、`align`、`header`、`size` props；`MenuItem` 加 `href`、`description`、`current`、`separatorBefore`，`onSelect` 改選用。預設值維持「更多」原樣 |
| `F:\vsms\vsms-export\src\__tests__\menuButton-topbar.test.tsx` | 新增 | 新 props 的行為；既有 `menuButton.test.tsx` 不動、必須照舊全過 |
| `F:\vsms\vsms-export\src\lib\topbarData.ts` | 新增 | 常數（目前系統代碼、退回清單、網址、角色中文）、`parsePortalApps`、`fetchPortalApps`、`fetchUnreadCount`、`formatUnreadBadge`、`avatarInitials` |
| `F:\vsms\vsms-export\src\__tests__\topbarData.test.ts` | 新增 | 純函式與兩支 fetch 的網址、錯誤處理 |
| `F:\vsms\vsms-export\src\components\layout\useTopbarData.ts` | 新增 | 掛載時讀一次系統清單與未讀數、失敗退回 |
| `F:\vsms\vsms-export\src\__tests__\useTopbarData.test.tsx` | 新增 | vauth／local／訪客／失敗／只讀一次 |
| `F:\vsms\vsms-export\src\components\layout\Topbar.tsx` | 新增 | 頂欄畫面：產品切換、並排連結、鈴鐺、使用者選單 |
| `F:\vsms\vsms-export\src\__tests__\topbar.test.tsx` | 新增 | 規格「測試」一節列的每一項 |
| `F:\vsms\vsms-export\src\components\layout\NavTabs.tsx` | 新增 | `NAV_TABS`、`visibleNavTabs`、40px 第二列 |
| `F:\vsms\vsms-export\src\__tests__\navTabs.test.tsx` | 新增 | 角色篩選、單一分頁不顯示、aria-current、點擊 |
| `F:\vsms\vsms-export\src\App.tsx` | 修改 | `Header` 換成 `Topbar`＋`NavTabs` |
| `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx` | 新增 | App 掛載順序：頂欄在上、分頁列在下、沒有「回入口頁」 |
| `F:\vsms\vsms-export\src\components\layout\Header.tsx` | 刪除 | 由 `Topbar`＋`NavTabs` 取代 |

相依：Task 3 用 Task 1 的 `MenuButton` 新 props 與 Task 2 的 `topbarData`／`useTopbarData`；Task 4 用 Task 3 的 `Topbar`。Task 1 與 Task 2 彼此獨立。

---

### Task 1: `MenuButton` 擴充成頂欄可用

**Files:**
- Modify（整份改寫）: `F:\vsms\vsms-export\src\components\shared\MenuButton.tsx`
- Test: `F:\vsms\vsms-export\src\__tests__\menuButton-topbar.test.tsx`（新增）
- 既有測試 `F:\vsms\vsms-export\src\__tests__\menuButton.test.tsx` 不改，必須照舊全過。

**Interfaces:**
- Consumes: 無。
- Produces（Task 3 會用）：
  ```ts
  export interface MenuItem {
    key: string
    label: string
    icon?: ReactNode
    title?: string
    onSelect?: () => void          // 按鈕項目：關閉、焦點回按鈕、再呼叫
    href?: string                   // 有值時渲染成 <a role="menuitem" href>，按下只關閉、交給瀏覽器導覽
    description?: string            // 名稱下一行，12px 淡字（空字串不渲染）
    current?: boolean               // 右側打勾＋aria-current="page"
    separatorBefore?: boolean       // 在這一項上方畫 role="separator"
  }
  export function MenuButton(props: {
    label: string
    items: MenuItem[]
    ariaLabel?: string
    className?: string
    trigger?: ReactNode             // 按鈕內容；預設顯示 label。▾ 一律附在後面
    align?: 'left' | 'right'        // 預設 'right'
    header?: ReactNode              // 清單頂端不可點的標頭，同時是清單的 aria-describedby
    size?: 'sm' | 'md'              // 預設 'sm'（原樣）；'md'：13px 字、py-2、min-w-[14rem]
  }): JSX.Element | null
  ```

- [ ] **Step 1: 寫失敗的測試**

新增 `F:\vsms\vsms-export\src\__tests__\menuButton-topbar.test.tsx`：

```tsx
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/menuButton-topbar.test.tsx`
Expected: FAIL（型別上 `trigger`／`align`／`header`／`size`／`href` 還不存在；執行時例如「href 項目」找不到 `role=menuitem` 的 `A`、`aria-describedby` 為 null、`style.left` 為 `''`）。

- [ ] **Step 3: 改寫 `MenuButton.tsx`**

把 `F:\vsms\vsms-export\src\components\shared\MenuButton.tsx` 整份換成：

```tsx
// src/components/shared/MenuButton.tsx
//
// 「按鈕＋下拉選單」。工具列的「更多」與全域頂欄（UI 統一 4A）的產品切換、
// 使用者選單共用。
//
// 清單 portal 到 document.body 並用 position: fixed 對齊按鈕：工具列容器是
// overflow-x-auto，會連帶讓縱向也變成裁切，清單放在裡面會被切掉。全螢幕時甘特圖
// 容器是 fixed inset-0 z-[100]，所以清單是 z-[110]；全螢幕作用在整份文件
// （requestFullscreen 在 documentElement 上），掛在 body 仍看得到。
//
// Esc 在清單上處理並 stopPropagation：甘特圖的覆蓋式全螢幕（瀏覽器拒絕真全螢幕時）
// 在 window 上聽 Esc 來離開，選單的 Esc 不能漏上去。瀏覽器真全螢幕時 Esc 由瀏覽器
// 自己攔下離開全螢幕，網頁擋不住；離開全螢幕會 resize，選單因此自動關閉。
//
// Tab 也不能只是關閉：清單 portal 在 body 最後面，若放任瀏覽器照 DOM 順序走，
// Tab 會直接離開文件（後面沒別的節點了），Shift+Tab 會跳到 #root 內最後一個可
// 聚焦元素，都不是「接著觸發按鈕」的位置。做法是在 keydown 當下同步把焦點搬回
// 按鈕、且不 preventDefault：瀏覽器算下一個 tab stop 是看事件處理完當下的
// activeElement，所以會從按鈕接著走，Tab 到「更多」後面那個、Shift+Tab 到前面那個。
//
// 頂欄用的擴充（預設值都維持「更多」原本的樣子）：
// - trigger：按鈕內容換成任意節點（標誌＋文字、頭像＋名稱），▾ 仍附在後面。
// - align：'left' 讓清單左緣對齊按鈕左緣（產品切換在頂欄最左邊）。
// - header：清單頂端不可點的標頭（使用者名稱＋角色），同時當清單的 aria-describedby。
// - size：'md' 是頂欄的 13px 字、較高的列與較寬的清單。
// - 項目可以是連結（href）：交給瀏覽器導覽，中鍵／Ctrl+點開新分頁都照常；
//   也可以帶說明（description）、標成目前項目（current：打勾＋aria-current）、
//   在上方畫分隔線（separatorBefore）。
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  title?: string
  /** 按鈕項目：選單先關閉、焦點回按鈕，再呼叫。 */
  onSelect?: () => void
  /** 有值時項目是 <a href>，按下只關閉選單，導覽交給瀏覽器。 */
  href?: string
  /** 名稱下一行的說明（12px 淡字）。 */
  description?: string
  /** 目前所在的項目：右側打勾，並加 aria-current="page"。 */
  current?: boolean
  /** 在這一項上方畫分隔線。 */
  separatorBefore?: boolean
}

interface Props {
  label: string
  items: MenuItem[]
  ariaLabel?: string
  /** 觸發按鈕的樣式，沿用呼叫端的按鈕樣式。 */
  className?: string
  /** 觸發按鈕的內容；不給就顯示 label。▾ 一律附在後面。 */
  trigger?: ReactNode
  /** 清單對齊按鈕的哪一側。預設 'right'（工具列「更多」）。 */
  align?: 'left' | 'right'
  /** 清單頂端不可點的標頭。 */
  header?: ReactNode
  /** 'sm'：工具列（預設）；'md'：頂欄。 */
  size?: 'sm' | 'md'
}

const ITEM_CLASS = {
  sm: 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 whitespace-nowrap hover:bg-slate-50 focus:bg-slate-100',
  md: 'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-800 whitespace-nowrap hover:bg-slate-50 focus:bg-slate-100',
} as const

const MENU_MIN_WIDTH = { sm: 'min-w-[10rem]', md: 'min-w-[14rem]' } as const

export function MenuButton({
  label, items, ariaLabel, className, trigger, align = 'right', header, size = 'sm',
}: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLElement | null>>([])
  const menuId = useId()
  const headerId = useId()

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
    if (r) {
      const top = r.bottom + 4
      // 靠右：工具列可以橫向捲動，按鈕捲到局部露出視窗外時 r.right 可能超過 innerWidth，
      // 算出來會是負值把清單推到畫面外；下限夾在 4px（跟清單其他邊距一致）。
      // 靠左：同理，r.left 可能是負值，一樣夾在 4px。
      setPos(align === 'left'
        ? { top, left: Math.max(4, r.left) }
        : { top, right: Math.max(4, window.innerWidth - r.right) })
    }
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
    item.onSelect?.()
  }

  // 連結項目：只關閉，導覽交給瀏覽器。不把焦點搬回按鈕——頁面馬上就要換掉；
  // 用 Ctrl／中鍵開新分頁時，原頁的焦點也不需要跳走。
  const follow = () => setOpen(false)

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
        // 不 preventDefault：關閉選單、把焦點同步移回觸發按鈕，再讓瀏覽器接手
        // 預設的 Tab 行為（見檔頭註解）。
        closeAndRefocus()
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
        {trigger ?? label}
        <ChevronDown size={13} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel ?? label}
          aria-describedby={header ? headerId : undefined}
          onKeyDown={onMenuKeyDown}
          className={`fixed z-[110] ${MENU_MIN_WIDTH[size]} py-1 bg-white border border-slate-200 rounded-md shadow-lg`}
          style={{ top: pos.top, left: pos.left, right: pos.right }}
        >
          {header && (
            <div id={headerId} role="none" className="px-3 pt-1.5 pb-2 mb-1 border-b border-slate-200">
              {header}
            </div>
          )}
          {items.map((item, i) => {
            const body = (
              <>
                {item.icon}
                {item.description
                  ? (
                    <span className="flex min-w-0 flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-slate-500">{item.description}</span>
                    </span>
                  )
                  : item.label}
                {item.current && (
                  <Check size={14} aria-hidden="true" className="ml-auto flex-shrink-0 text-blue-600" />
                )}
              </>
            )
            const shared = {
              role: 'menuitem',
              tabIndex: i === active ? 0 : -1,
              title: item.title,
              'aria-current': item.current ? ('page' as const) : undefined,
              className: ITEM_CLASS[size],
            }
            return (
              <Fragment key={item.key}>
                {item.separatorBefore && (
                  <div role="separator" className="my-1 border-t border-slate-200" />
                )}
                {item.href !== undefined
                  ? (
                    <a {...shared} ref={el => { itemRefs.current[i] = el }} href={item.href} onClick={follow}>
                      {body}
                    </a>
                  )
                  : (
                    <button {...shared} ref={el => { itemRefs.current[i] = el }} type="button"
                            onClick={() => select(item)}>
                      {body}
                    </button>
                  )}
              </Fragment>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
```

- [ ] **Step 4: 跑兩個 MenuButton 測試檔確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/menuButton-topbar.test.tsx src/__tests__/menuButton.test.tsx`
Expected: PASS（兩檔全過；`menuButton.test.tsx` 一條都不能壞）。

- [ ] **Step 5: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 全部測試通過、0 failures（`scheduleToolbar-more.test.tsx` 也要過，它用到「更多」）；tsc 沒有任何輸出。

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/shared/MenuButton.tsx src/__tests__/menuButton-topbar.test.tsx && git commit -m "$(cat <<'EOF'
feat(shared): MenuButton supports link items, header, left alignment and md size

The global topbar (UI unification 4A) needs two dropdowns with the same
keyboard and dismissal behaviour as the toolbar "more" menu: a product
switcher (links with descriptions, current item checked) and a user menu
(non-clickable name/role header, separator before logout). Defaults keep
the toolbar menu unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 頂欄資料來源（`topbarData`＋`useTopbarData`）

**Files:**
- Create: `F:\vsms\vsms-export\src\lib\topbarData.ts`
- Create: `F:\vsms\vsms-export\src\components\layout\useTopbarData.ts`
- Test: `F:\vsms\vsms-export\src\__tests__\topbarData.test.ts`（新增）
- Test: `F:\vsms\vsms-export\src\__tests__\useTopbarData.test.tsx`（新增）

**Interfaces:**
- Consumes: `Role`（`src/types.ts`：`'super_admin' | 'admin' | 'user' | 'guest'`）。
- Produces（Task 3 會用）：
  ```ts
  // src/lib/topbarData.ts
  export const CURRENT_APP_CODE = 'vsms'
  export interface TopbarApp { code: string; name: string; description: string; url: string; sortOrder: number; showInTopbar: boolean }
  export const FALLBACK_APPS: readonly TopbarApp[]      // VTMS(/vtms/)、VSMS(/vsms/)，showInTopbar 皆 true
  export const PORTAL_HOME_LABEL = '入口頁首頁'
  export const PORTAL_HOME_URL = '/'
  export const INBOX_URL = '/inbox'
  export const CHANGE_PASSWORD_URL = '/change-password'
  export const ROLE_LABELS: Record<Role, string>
  export function parsePortalApps(body: unknown): TopbarApp[]   // 形狀不對就 throw
  export function fetchPortalApps(): Promise<TopbarApp[]>       // !ok 就 reject
  export function fetchUnreadCount(): Promise<number>           // !ok 或欄位不對就 reject
  export function formatUnreadBadge(n: number | null): string | null  // null/0 → null；>99 → '99+'
  export function avatarInitials(name: string): string          // 前兩個字元轉大寫；空字串 → '?'

  // src/components/layout/useTopbarData.ts
  export interface TopbarData { apps: readonly TopbarApp[] | null; unreadCount: number | null }
  export function useTopbarData(opts: { vauth: boolean; guest: boolean }): TopbarData
  // apps：null 只出現在 vauth 模式讀取中；讀到用伺服器清單，失敗或非 vauth 用 FALLBACK_APPS
  // unreadCount：null＝不顯示數字（非 vauth、訪客、讀取中、失敗）
  ```

- [ ] **Step 1: 寫 `topbarData` 的失敗測試**

新增 `F:\vsms\vsms-export\src\__tests__\topbarData.test.ts`：

```ts
// src/__tests__/topbarData.test.ts
// 全域頂欄（UI 統一 4A）的資料來源：vauth 的系統入口與未讀數。兩支 API 都在站台
// 根目錄（不在 /vsms/ 底下），不經 withBase、不經 lib/api.ts。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CURRENT_APP_CODE, FALLBACK_APPS, ROLE_LABELS, PORTAL_HOME_LABEL, PORTAL_HOME_URL,
  INBOX_URL, CHANGE_PASSWORD_URL,
  parsePortalApps, fetchPortalApps, fetchUnreadCount, formatUnreadBadge, avatarInitials,
} from '../lib/topbarData'

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
  new Response('{}', { status: 200 }))

function respondOnce(status: number, body: unknown) {
  fetchMock.mockImplementationOnce(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('常數', () => {
  it('目前系統是 vsms；退回清單是 VTMS、VSMS，全部顯示在頂欄', () => {
    expect(CURRENT_APP_CODE).toBe('vsms')
    expect(FALLBACK_APPS.map(a => [a.code, a.name, a.url])).toEqual([
      ['vtms', 'VTMS', '/vtms/'],
      ['vsms', 'VSMS', '/vsms/'],
    ])
    expect(FALLBACK_APPS.every(a => a.showInTopbar)).toBe(true)
  })

  it('入口頁網址都是站台根目錄的絕對路徑', () => {
    expect(PORTAL_HOME_LABEL).toBe('入口頁首頁')
    expect(PORTAL_HOME_URL).toBe('/')
    expect(INBOX_URL).toBe('/inbox')
    expect(CHANGE_PASSWORD_URL).toBe('/change-password')
  })

  it('VSMS 角色中文', () => {
    expect(ROLE_LABELS).toEqual({
      super_admin: '超級管理者',
      admin: '管理者',
      user: '測試人員',
      guest: '訪客（唯讀）',
    })
  })
})

describe('parsePortalApps', () => {
  it('依 sortOrder 排序；缺 showInTopbar 視為真、false 保留；缺 description 補空字串', () => {
    const apps = parsePortalApps({ apps: [
      { code: 'lab', name: '實驗室', url: '/lab/', sortOrder: 3, showInTopbar: false },
      { code: 'vsms', name: 'VSMS', description: '排程', url: '/vsms/', sortOrder: 2 },
      { code: 'vtms', name: 'VTMS', description: '測試', url: '/vtms/', sortOrder: 1, showInTopbar: true },
    ] })
    expect(apps).toEqual([
      { code: 'vtms', name: 'VTMS', description: '測試', url: '/vtms/', sortOrder: 1, showInTopbar: true },
      { code: 'vsms', name: 'VSMS', description: '排程', url: '/vsms/', sortOrder: 2, showInTopbar: true },
      { code: 'lab', name: '實驗室', description: '', url: '/lab/', sortOrder: 3, showInTopbar: false },
    ])
  })

  it('略過缺 code／name／url 的項目', () => {
    const apps = parsePortalApps({ apps: [
      null,
      { code: 'x', name: 'X' },
      { code: 'vtms', name: 'VTMS', url: '/vtms/', sortOrder: 1 },
    ] })
    expect(apps.map(a => a.code)).toEqual(['vtms'])
  })

  it('形狀不對就 throw（由呼叫端退回內建清單）', () => {
    expect(() => parsePortalApps(null)).toThrow()
    expect(() => parsePortalApps({})).toThrow()
    expect(() => parsePortalApps([])).toThrow()
  })

  it('空清單是合法的（全部停用），不 throw', () => {
    expect(parsePortalApps({ apps: [] })).toEqual([])
  })
})

describe('fetchPortalApps', () => {
  it('打站台根目錄的 /portal/apps，帶同源 cookie', async () => {
    respondOnce(200, { apps: [{ code: 'vtms', name: 'VTMS', url: '/vtms/', sortOrder: 1 }] })
    const apps = await fetchPortalApps()
    expect(apps.map(a => a.code)).toEqual(['vtms'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/portal/apps')
    expect(init?.credentials).toBe('same-origin')
  })

  it('HTTP 錯誤時 reject', async () => {
    respondOnce(401, { code: 'NO_SESSION' })
    await expect(fetchPortalApps()).rejects.toThrow()
  })
})

describe('fetchUnreadCount', () => {
  it('打 /notify/inbox?limit=1，回傳 unreadCount', async () => {
    respondOnce(200, { items: [], unreadCount: 12, total: 40 })
    await expect(fetchUnreadCount()).resolves.toBe(12)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/notify/inbox?limit=1')
    expect(init?.credentials).toBe('same-origin')
  })

  it('HTTP 錯誤或沒有 unreadCount 時 reject', async () => {
    respondOnce(500, {})
    await expect(fetchUnreadCount()).rejects.toThrow()
    respondOnce(200, { items: [] })
    await expect(fetchUnreadCount()).rejects.toThrow()
  })
})

describe('formatUnreadBadge', () => {
  it('null 與 0 不顯示；1～99 照實；超過 99 顯示 99+', () => {
    expect(formatUnreadBadge(null)).toBeNull()
    expect(formatUnreadBadge(0)).toBeNull()
    expect(formatUnreadBadge(1)).toBe('1')
    expect(formatUnreadBadge(99)).toBe('99')
    expect(formatUnreadBadge(100)).toBe('99+')
    expect(formatUnreadBadge(1500)).toBe('99+')
  })
})

describe('avatarInitials', () => {
  it('名稱前兩個字元轉大寫', () => {
    expect(avatarInitials('Will Wang')).toBe('WI')
    expect(avatarInitials('paul')).toBe('PA')
    expect(avatarInitials('系統管理員')).toBe('系統')
    expect(avatarInitials('  訪客 ')).toBe('訪客')
  })

  it('空名稱顯示 ?', () => {
    expect(avatarInitials('')).toBe('?')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/topbarData.test.ts`
Expected: FAIL，錯誤是找不到模組 `../lib/topbarData`。

- [ ] **Step 3: 實作 `topbarData.ts`**

新增 `F:\vsms\vsms-export\src\lib\topbarData.ts`：

```ts
// src/lib/topbarData.ts
//
// 全域頂欄（UI 統一 4A）的資料來源與純函式。規格：
// F:\vportal\docs\superpowers\specs\2026-09-24-global-topbar-design.md
//
// 系統入口與收件匣都在 vauth，掛在站台根目錄（/portal/apps、/notify/inbox），
// 不在 VSMS 的 /vsms/ 前綴底下，所以這裡用絕對路徑直接 fetch，不經 withBase，
// 也不經 lib/api.ts 的 req()：那支會加 /api 前綴與 VSMS 的 session 標頭，401 時還會
// 走 SSO_REVOKED 的登出流程——vauth 讀不到不該讓 VSMS 登出。
// 同網域，瀏覽器會帶 SSO cookie（credentials: 'same-origin'）。
import type { Role } from '../types'

/** 本系統在 portal_apps 的代碼，用來標出「目前所在的系統」。內建代碼不能改名。 */
export const CURRENT_APP_CODE = 'vsms'

export interface TopbarApp {
  code: string
  name: string
  description: string
  url: string
  sortOrder: number
  showInTopbar: boolean
}

/**
 * 讀取失敗或非 vauth 模式時的內建清單。規格的退回清單是「入口頁首頁、VTMS、VSMS」；
 * 入口頁首頁是產品切換下拉固定的第一項，不在這裡，所以這裡只有兩個系統。
 * 說明文字與 vauth 的預設種子（auth/sql/008-portal.sql）相同。
 */
export const FALLBACK_APPS: readonly TopbarApp[] = [
  { code: 'vtms', name: 'VTMS', description: '測試計畫、任務、案例、報告', url: '/vtms/', sortOrder: 1, showInTopbar: true },
  { code: 'vsms', name: 'VSMS', description: '工作排程、設備排程、負載分析', url: '/vsms/', sortOrder: 2, showInTopbar: true },
]

export const PORTAL_HOME_LABEL = '入口頁首頁'
export const PORTAL_HOME_URL = '/'
export const INBOX_URL = '/inbox'
/** 入口頁的 React Route（BrowserRouter；舊 Header 的 /#change-password 其實只會到首頁）。 */
export const CHANGE_PASSWORD_URL = '/change-password'

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: '超級管理者',
  admin: '管理者',
  user: '測試人員',
  guest: '訪客（唯讀）',
}

/** GET /portal/apps 的回應 → 依 sortOrder 排好的清單。形狀不對就 throw。 */
export function parsePortalApps(body: unknown): TopbarApp[] {
  const list = typeof body === 'object' && body !== null ? (body as { apps?: unknown }).apps : undefined
  if (!Array.isArray(list)) throw new Error('portal apps: unexpected response')
  const apps: TopbarApp[] = []
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue
    const a = raw as Record<string, unknown>
    if (typeof a.code !== 'string' || typeof a.name !== 'string' || typeof a.url !== 'string') continue
    apps.push({
      code: a.code,
      name: a.name,
      description: typeof a.description === 'string' ? a.description : '',
      url: a.url,
      sortOrder: typeof a.sortOrder === 'number' ? a.sortOrder : 0,
      // 規格：前端讀不到 showInTopbar（vauth 還沒上新版）時視為真。
      showInTopbar: a.showInTopbar !== false,
    })
  }
  return apps.sort((x, y) => x.sortOrder - y.sortOrder)
}

export async function fetchPortalApps(): Promise<TopbarApp[]> {
  const res = await fetch('/portal/apps', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`portal apps: HTTP ${res.status}`)
  return parsePortalApps(await res.json())
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch('/notify/inbox?limit=1', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`inbox: HTTP ${res.status}`)
  const body = await res.json() as { unreadCount?: unknown } | null
  const n = body?.unreadCount
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error('inbox: unexpected response')
  return Math.floor(n)
}

/** 徽章文字；null 表示不顯示徽章。 */
export function formatUnreadBadge(n: number | null): string | null {
  if (n === null || !(n > 0)) return null
  return n > 99 ? '99+' : String(n)
}

/** 頭像縮寫：名稱前兩個字元轉大寫（Array.from 以免切壞 surrogate pair）。 */
export function avatarInitials(name: string): string {
  const head = Array.from(name.trim()).slice(0, 2).join('')
  return head ? head.toUpperCase() : '?'
}
```

- [ ] **Step 4: 跑 `topbarData` 測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/topbarData.test.ts`
Expected: PASS。

- [ ] **Step 5: 寫 `useTopbarData` 的失敗測試**

新增 `F:\vsms\vsms-export\src\__tests__\useTopbarData.test.tsx`：

```tsx
// src/__tests__/useTopbarData.test.tsx
// 頂欄掛載時各讀一次系統清單與未讀數（不輪詢）；失敗或非 vauth 退回內建清單、
// 不顯示數字；訪客不讀未讀數。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useTopbarData } from '../components/layout/useTopbarData'
import { FALLBACK_APPS } from '../lib/topbarData'

const APPS_URL = '/portal/apps'
const INBOX_URL = '/notify/inbox?limit=1'

type Route = { status: number; body: unknown }
let routes: Record<string, Route> = {}
const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const r = routes[String(input)]
  if (!r) return new Response('{}', { status: 404 })
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
const calls = (url: string) => fetchMock.mock.calls.filter(c => String(c[0]) === url).length
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

beforeEach(() => {
  fetchMock.mockClear()
  routes = {
    [APPS_URL]: { status: 200, body: { apps: [
      { code: 'vsms', name: 'VSMS', description: '排程', url: '/vsms/', sortOrder: 2, showInTopbar: true },
      { code: 'vtms', name: 'VTMS', description: '測試', url: '/vtms/', sortOrder: 1, showInTopbar: false },
    ] } },
    [INBOX_URL]: { status: 200, body: { items: [], unreadCount: 7, total: 9 } },
  }
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useTopbarData', () => {
  it('非 vauth：不打任何請求，直接用內建清單、不顯示數字', async () => {
    const { result } = renderHook(() => useTopbarData({ vauth: false, guest: false }))
    expect(result.current.apps).toEqual(FALLBACK_APPS)
    expect(result.current.unreadCount).toBeNull()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('vauth：讀取中 apps 為 null，讀到後換成伺服器清單與未讀數', async () => {
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    expect(result.current.apps).toBeNull()
    await waitFor(() => expect(result.current.apps?.map(a => a.code)).toEqual(['vtms', 'vsms']))
    expect(result.current.apps?.[0].showInTopbar).toBe(false)
    await waitFor(() => expect(result.current.unreadCount).toBe(7))
  })

  it('vauth：/portal/apps 失敗退回內建清單', async () => {
    routes[APPS_URL] = { status: 500, body: {} }
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    await waitFor(() => expect(result.current.apps).toEqual(FALLBACK_APPS))
  })

  it('vauth：未讀數讀取失敗不顯示數字', async () => {
    routes[INBOX_URL] = { status: 502, body: {} }
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    await waitFor(() => expect(calls(INBOX_URL)).toBe(1))
    await flush()
    expect(result.current.unreadCount).toBeNull()
  })

  it('訪客：仍讀系統清單，但不讀未讀數', async () => {
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: true }))
    await waitFor(() => expect(result.current.apps?.length).toBe(2))
    await flush()
    expect(calls(APPS_URL)).toBe(1)
    expect(calls(INBOX_URL)).toBe(0)
    expect(result.current.unreadCount).toBeNull()
  })

  it('只在掛載時讀一次：重新 render 不再打請求', async () => {
    const { result, rerender } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    await waitFor(() => expect(result.current.unreadCount).toBe(7))
    rerender()
    rerender()
    await flush()
    expect(calls(APPS_URL)).toBe(1)
    expect(calls(INBOX_URL)).toBe(1)
  })
})
```

- [ ] **Step 6: 跑測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/useTopbarData.test.tsx`
Expected: FAIL，錯誤是找不到模組 `../components/layout/useTopbarData`。

- [ ] **Step 7: 實作 `useTopbarData.ts`**

新增 `F:\vsms\vsms-export\src\components\layout\useTopbarData.ts`：

```ts
// src/components/layout/useTopbarData.ts
//
// 頂欄掛載時各讀一次系統清單與未讀數，不輪詢（規格「資料來源」）。
// - 系統清單：只在 vauth 模式讀；讀取中回 null（呼叫端先不畫並排連結，免得內建清單
//   閃一下又被換掉），失敗退回內建清單。非 vauth 直接用內建清單。
// - 未讀數：只在 vauth 模式、非訪客時讀；失敗、讀取中一律 null（不顯示數字）。
//   這支 API 在 vauth，不會延長 VSMS 自己的 session。
// vauth／guest 在頂欄掛載前就定了（checkAuth 先讀 config 再驗 session），effect 只會跑一次。
import { useEffect, useState } from 'react'
import { FALLBACK_APPS, fetchPortalApps, fetchUnreadCount, type TopbarApp } from '../../lib/topbarData'

export interface TopbarData {
  /** null：vauth 模式讀取中。 */
  apps: readonly TopbarApp[] | null
  /** null：不顯示數字（非 vauth、訪客、讀取中或讀取失敗）。 */
  unreadCount: number | null
}

export function useTopbarData({ vauth, guest }: { vauth: boolean; guest: boolean }): TopbarData {
  const [apps, setApps] = useState<readonly TopbarApp[] | null>(vauth ? null : FALLBACK_APPS)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)

  useEffect(() => {
    if (!vauth) { setApps(FALLBACK_APPS); return }
    let cancelled = false
    fetchPortalApps()
      .then(list => { if (!cancelled) setApps(list) })
      .catch(() => { if (!cancelled) setApps(FALLBACK_APPS) })
    return () => { cancelled = true }
  }, [vauth])

  useEffect(() => {
    if (!vauth || guest) { setUnreadCount(null); return }
    let cancelled = false
    fetchUnreadCount()
      .then(n => { if (!cancelled) setUnreadCount(n) })
      .catch(() => { if (!cancelled) setUnreadCount(null) })
    return () => { cancelled = true }
  }, [vauth, guest])

  return { apps, unreadCount }
}
```

- [ ] **Step 8: 跑本 task 的測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/topbarData.test.ts src/__tests__/useTopbarData.test.tsx`
Expected: PASS。

- [ ] **Step 9: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 全部通過、0 failures；tsc 沒有輸出。

- [ ] **Step 10: Commit**

```bash
cd /f/vsms/vsms-export && git add src/lib/topbarData.ts src/components/layout/useTopbarData.ts src/__tests__/topbarData.test.ts src/__tests__/useTopbarData.test.tsx && git commit -m "$(cat <<'EOF'
feat(topbar): read portal apps and unread count from vauth once on mount

GET /portal/apps and GET /notify/inbox?limit=1 live at the site root, so
they are fetched with absolute paths (no base path, not through api.ts).
Failures and local mode fall back to the built-in VTMS/VSMS list and hide
the unread number; guests never read the inbox.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `Topbar` 元件

**Files:**
- Create: `F:\vsms\vsms-export\src\components\layout\Topbar.tsx`
- Test: `F:\vsms\vsms-export\src\__tests__\topbar.test.tsx`（新增）

**Interfaces:**
- Consumes:
  - Task 1：`MenuButton`（props `label`、`ariaLabel`、`items`、`className`、`trigger`、`align`、`header`、`size`）、`MenuItem`（`href`、`description`、`current`、`separatorBefore`、`onSelect`、`icon`）。
  - Task 2：`CURRENT_APP_CODE`、`FALLBACK_APPS`、`PORTAL_HOME_LABEL`、`PORTAL_HOME_URL`、`INBOX_URL`、`CHANGE_PASSWORD_URL`、`ROLE_LABELS`、`avatarInitials`、`formatUnreadBadge`、`useTopbarData({ vauth, guest }) → { apps, unreadCount }`。
  - `useAuthStore`（`src/store/authStore.ts`）：`displayName`、`role`、`authProvider`、`logout`。
- Produces（Task 4 會用）：`export function Topbar(): JSX.Element`（無 props，全部從 store 讀）。徽章元素 `data-testid="topbar-unread"`。

- [ ] **Step 1: 寫失敗的測試**

新增 `F:\vsms\vsms-export\src\__tests__\topbar.test.tsx`：

```tsx
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/topbar.test.tsx`
Expected: FAIL，錯誤是找不到模組 `../components/layout/Topbar`。

- [ ] **Step 3: 實作 `Topbar.tsx`**

新增 `F:\vsms\vsms-export\src\components\layout\Topbar.tsx`：

```tsx
// src/components/layout/Topbar.tsx
//
// 全域頂欄（UI 統一 4A）。三系統各自實作、行為一致，規格：
// F:\vportal\docs\superpowers\specs\2026-09-24-global-topbar-design.md
//
// 由左到右：產品切換（下拉）、並排連結、彈性空白、通知鈴鐺、使用者選單。
// 原本 Header 的導覽分頁搬到頂欄下方的 NavTabs；「回入口頁」由產品切換取代；
// 角色縮寫徽章（SA/A/U/G）改成使用者選單標頭裡的中文角色。
//
// 連到入口頁與其他系統的網址都是站台根目錄的絕對路徑（/、/inbox、/change-password、
// /vtms/），不經 withBase：VSMS 部署在 /vsms/ 底下，加前綴會變成 /vsms/inbox。
import { Bell, Check, KeyRound, LogOut } from 'lucide-react'
import { MenuButton, type MenuItem } from '../shared/MenuButton'
import { useAuthStore } from '../../store/authStore'
import { useTopbarData } from './useTopbarData'
import {
  CURRENT_APP_CODE, FALLBACK_APPS, PORTAL_HOME_LABEL, PORTAL_HOME_URL, INBOX_URL,
  CHANGE_PASSWORD_URL, ROLE_LABELS, avatarInitials, formatUnreadBadge,
} from '../../lib/topbarData'

export function Topbar() {
  const displayName = useAuthStore(s => s.displayName)
  const role = useAuthStore(s => s.role)
  const authProvider = useAuthStore(s => s.authProvider)
  const logout = useAuthStore(s => s.logout)

  const vauth = authProvider === 'vauth'
  const guest = role === 'guest'
  const { apps, unreadCount } = useTopbarData({ vauth, guest })

  // 下拉：入口頁首頁固定第一項，接著列出所有啟用中的系統（不看 showInTopbar）。
  // vauth 讀取中（apps 為 null）先用內建清單。
  const switcherItems: MenuItem[] = [
    { key: '__portal-home', label: PORTAL_HOME_LABEL, href: PORTAL_HOME_URL },
    ...(apps ?? FALLBACK_APPS).map(a => ({
      key: a.code,
      label: a.name,
      description: a.description,
      href: a.url,
      current: a.code === CURRENT_APP_CODE,
    })),
  ]
  // 並排連結：只列 showInTopbar 的系統。讀取中不畫，免得內建清單閃一下又被換掉。
  const inlineApps = (apps ?? []).filter(a => a.showInTopbar)

  const badge = formatUnreadBadge(unreadCount)

  const userItems: MenuItem[] = []
  // 修改密碼：單一登入模式一律到入口頁；訪客沒有密碼可改；local 模式維持現狀（沒有入口）。
  if (vauth && !guest) {
    userItems.push({
      key: 'change-password', label: '修改密碼', icon: <KeyRound size={14} />, href: CHANGE_PASSWORD_URL,
    })
  }
  userItems.push({
    key: 'logout',
    label: '登出',
    icon: <LogOut size={14} />,
    // 沿用既有的單一登出流程（authStore.logout），這裡不另外處理。
    onSelect: () => { void logout() },
    // 標頭已有底線；前面沒有項目時不再多畫一條。
    separatorBefore: userItems.length > 0,
  })

  const userHeader = (
    <>
      <div className="text-[13px] font-semibold text-slate-900">{displayName}</div>
      {role && <div className="text-xs text-slate-500">{ROLE_LABELS[role]}</div>}
    </>
  )

  return (
    <header className="h-12 flex-shrink-0 flex items-center gap-4 px-4 whitespace-nowrap
                       bg-[var(--vw-surface)] border-b border-[var(--vw-border)]">
      <MenuButton
        label="Validation Workspace"
        ariaLabel="切換系統"
        align="left"
        size="md"
        items={switcherItems}
        className="flex flex-shrink-0 items-center gap-2 h-8 -ml-1.5 px-1.5 rounded-md
                   text-slate-500 hover:bg-slate-100 transition-colors"
        trigger={
          <>
            <span aria-hidden="true"
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-md
                             bg-[var(--vw-accent)] text-white">
              <Check size={14} strokeWidth={3} />
            </span>
            <span className="hidden sm:inline text-sm font-bold text-slate-900">Validation Workspace</span>
          </>
        }
      />

      {inlineApps.length > 0 && (
        <nav aria-label="系統" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {inlineApps.map(a => {
            const current = a.code === CURRENT_APP_CODE
            return (
              <a
                key={a.code}
                href={a.url}
                aria-current={current ? 'page' : undefined}
                className={`flex h-8 flex-shrink-0 items-center px-3 rounded-md text-[13px] font-medium
                            transition-colors
                            ${current
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                {a.name}
              </a>
            )
          })}
        </nav>
      )}

      <div className="flex-1" />

      {/* 訪客沒有收件匣（入口頁的訪客連結不帶 SSO 登入），不顯示鈴鐺 */}
      {!guest && (
        <a
          href={INBOX_URL}
          aria-label="通知"
          title="通知"
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md
                     text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <Bell size={18} />
          {badge && (
            <span
              data-testid="topbar-unread"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full
                         bg-[var(--vw-danger-solid)] text-white text-[10px] font-bold leading-4 text-center"
            >
              {badge}
            </span>
          )}
        </a>
      )}

      <MenuButton
        label={displayName}
        ariaLabel="使用者選單"
        size="md"
        header={userHeader}
        items={userItems}
        className="flex flex-shrink-0 items-center gap-2 h-8 pl-1 pr-1.5 rounded-md
                   text-slate-500 hover:bg-slate-100 transition-colors"
        trigger={
          <>
            <span aria-hidden="true"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full
                             bg-[var(--vw-accent)] text-[11px] font-bold text-white">
              {avatarInitials(displayName)}
            </span>
            <span className="hidden sm:inline text-[13px] text-slate-800">{displayName}</span>
          </>
        }
      />
    </header>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/topbar.test.tsx`
Expected: PASS。

- [ ] **Step 5: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 全部通過、0 failures；tsc 沒有輸出。（此時 `Topbar` 還沒掛到畫面上，App 仍用舊 `Header`。）

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/layout/Topbar.tsx src/__tests__/topbar.test.tsx && git commit -m "$(cat <<'EOF'
feat(topbar): Topbar with product switcher, app links, bell and user menu

Implements the shared 48px topbar spec for VSMS: Validation Workspace
switcher (portal home + every active app, current app checked), inline
links for apps shown in the topbar, unread badge (99+ cap, hidden for
guests), and a user menu with the VSMS role label, change password
(vauth, non-guest) and the existing single logout.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 導覽分頁搬到第二列、App 換上新頂欄

**Files:**
- Create: `F:\vsms\vsms-export\src\components\layout\NavTabs.tsx`
- Modify: `F:\vsms\vsms-export\src\App.tsx`（第 11 行 import；第 67～71 行 `<Header …/>`）
- Delete: `F:\vsms\vsms-export\src\components\layout\Header.tsx`
- Test: `F:\vsms\vsms-export\src\__tests__\navTabs.test.tsx`（新增）
- Test: `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx`（新增）

**Interfaces:**
- Consumes: Task 3 的 `Topbar()`；`Role`、`View`（`src/types.ts`，`View = 'main' | 'analytics' | 'settings' | 'audit' | 'accounts'`）。
- Produces:
  ```ts
  export interface NavTab { key: View; label: string; icon: ReactNode; superAdminOnly?: boolean; userHidden?: boolean }
  export const NAV_TABS: NavTab[]
  export function visibleNavTabs(role: Role | null): NavTab[]
  export function NavTabs(props: { currentView: View; onNavigate: (v: View) => void; role: Role | null }): JSX.Element | null
  ```

- [ ] **Step 1: 寫 `NavTabs` 的失敗測試**

新增 `F:\vsms\vsms-export\src\__tests__\navTabs.test.tsx`：

```tsx
// src/__tests__/navTabs.test.tsx
// 導覽分頁從頂欄搬到頂欄下方的第二列（UI 統一 4A）：40px、角色篩選規則不變、
// 只有一個可見分頁時整列不顯示。
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavTabs, visibleNavTabs } from '../components/layout/NavTabs'
import type { Role } from '../types'

describe('NavTabs', () => {
  it.each<[Role, string[]]>([
    ['super_admin', ['排程管理', '統計分析', '系統設定', '審計紀錄']],
    ['admin', ['排程管理', '統計分析', '系統設定']],
    ['user', ['排程管理']],
    ['guest', ['排程管理']],
  ])('%s 看得到的分頁', (role, labels) => {
    expect(visibleNavTabs(role).map(t => t.label)).toEqual(labels)
  })

  it.each<Role>(['user', 'guest'])('%s 只有一個分頁：整列不顯示', role => {
    const { container } = render(<NavTabs currentView="main" onNavigate={vi.fn()} role={role} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('多個分頁：40px 第二列、目前分頁有 aria-current、點擊切換頁面', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<NavTabs currentView="settings" onNavigate={onNavigate} role="super_admin" />)

    const nav = screen.getByRole('navigation', { name: '主導覽' })
    expect(nav.className).toContain('h-10')
    expect(within(nav).getAllByRole('button')).toHaveLength(4)
    expect(within(nav).getByRole('button', { name: '系統設定' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: '排程管理' })).not.toHaveAttribute('aria-current')

    await user.click(within(nav).getByRole('button', { name: '統計分析' }))
    expect(onNavigate).toHaveBeenCalledWith('analytics')
  })
})
```

- [ ] **Step 2: 寫 App 掛載的失敗測試**

新增 `F:\vsms\vsms-export\src\__tests__\app-topbar.test.tsx`：

```tsx
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
```

- [ ] **Step 3: 跑兩個測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/navTabs.test.tsx src/__tests__/app-topbar.test.tsx`
Expected: FAIL——`navTabs.test.tsx` 找不到模組 `../components/layout/NavTabs`；`app-topbar.test.tsx` 找不到 `banner` 裡的「Validation Workspace」按鈕（舊 Header 還在，而且找得到「回入口頁」）。

- [ ] **Step 4: 新增 `NavTabs.tsx`**

新增 `F:\vsms\vsms-export\src\components\layout\NavTabs.tsx`：

```tsx
// src/components/layout/NavTabs.tsx
//
// VSMS 的頁面導覽分頁（排程管理／統計分析／系統設定／審計紀錄）。UI 統一 4A 起從頂欄
// 搬到頂欄下方的第二列（40px，白底、底線）：48px 的頂欄放不下產品切換＋導覽＋右側。
// 角色篩選規則照舊；只有一個可見分頁（user、guest）時整列不顯示，免得留一排點不出
// 東西的分頁。選取樣式與系統設定頁的分頁同一套（底線式，border-blue-600 text-blue-700）。
import type { ReactNode } from 'react'
import { LayoutList, BarChart2, Settings, ClipboardList } from 'lucide-react'
import type { Role, View } from '../../types'

export interface NavTab {
  key: View
  label: string
  icon: ReactNode
  superAdminOnly?: boolean
  userHidden?: boolean
}

export const NAV_TABS: NavTab[] = [
  { key: 'main',      label: '排程管理', icon: <LayoutList    size={15} /> },
  { key: 'analytics', label: '統計分析', icon: <BarChart2     size={15} />, userHidden: true },
  { key: 'settings',  label: '系統設定', icon: <Settings      size={15} />, userHidden: true },
  { key: 'audit',     label: '審計紀錄', icon: <ClipboardList size={15} />, superAdminOnly: true },
]

export function visibleNavTabs(role: Role | null): NavTab[] {
  return NAV_TABS.filter(tab => {
    if (tab.superAdminOnly && role !== 'super_admin') return false
    if (tab.userHidden && (role === 'user' || role === 'guest')) return false
    return true
  })
}

interface Props {
  currentView: View
  onNavigate: (v: View) => void
  role: Role | null
}

export function NavTabs({ currentView, onNavigate, role }: Props) {
  const tabs = visibleNavTabs(role)
  if (tabs.length <= 1) return null

  return (
    <nav
      aria-label="主導覽"
      className="h-10 flex-shrink-0 flex items-stretch gap-1 px-4 overflow-x-auto whitespace-nowrap
                 bg-[var(--vw-surface)] border-b border-[var(--vw-border)]"
    >
      {tabs.map(tab => {
        const current = currentView === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={current ? 'page' : undefined}
            onClick={() => onNavigate(tab.key)}
            className={`flex flex-shrink-0 items-center gap-1.5 px-3 text-sm font-medium
                        border-b-2 transition-colors
                        ${current
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 5: `App.tsx` 換掛載點**

在 `F:\vsms\vsms-export\src\App.tsx` 用 Edit 工具做兩處替換（檔案是 CRLF，Edit 會保留）。

找到：
```tsx
import { Header } from './components/layout/Header'
```
換成：
```tsx
import { Topbar } from './components/layout/Topbar'
import { NavTabs } from './components/layout/NavTabs'
```

找到：
```tsx
        <Header
          currentView={view}
          onNavigate={setView}
          role={role}
        />
```
換成：
```tsx
        {/* 全域頂欄（UI 統一 4A）＋頂欄下方的導覽分頁列（只有一個可見分頁時不顯示） */}
        <Topbar />
        <NavTabs
          currentView={view}
          onNavigate={setView}
          role={role}
        />
```

- [ ] **Step 6: 刪除 `Header.tsx`，確認沒有殘留引用**

Run: `cd /f/vsms/vsms-export && git rm src/components/layout/Header.tsx && grep -rn "layout/Header" src`
Expected: `git rm` 印出 `rm 'src/components/layout/Header.tsx'`；grep 沒有任何輸出（exit code 1）。

- [ ] **Step 7: 跑本 task 的測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/navTabs.test.tsx src/__tests__/app-topbar.test.tsx src/__tests__/topbar.test.tsx src/__tests__/app-vauth-gate.test.tsx`
Expected: PASS。

- [ ] **Step 8: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 全部通過、0 failures（寫計畫時在 repo 的暫存副本實跑過：四個 task 做完是 56 檔、430 條；總數只供參考，判斷以 failures 為準）；tsc 沒有輸出。

- [ ] **Step 9: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/layout/NavTabs.tsx src/App.tsx src/__tests__/navTabs.test.tsx src/__tests__/app-topbar.test.tsx && git commit -m "$(cat <<'EOF'
feat(layout): mount the global topbar and move nav tabs to a second row

App now renders Topbar followed by NavTabs (40px, same role filters,
hidden when only one tab is visible). The old dark Header, its role
badges and the "back to portal" link are removed; the product switcher
replaces them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

（`Header.tsx` 的刪除已由 Step 6 的 `git rm` 放進暫存區，會一起進這個 commit。）

---

## 部署（controller 執行，不派給 subagent）

### A. harness 準備與改前截圖（在派 **Task 1** 之前做完）

真正改到畫面的是 Task 4，但 Task 1 動到工具列「更多」共用的 `MenuButton`，所以在派 Task 1 之前就把改前畫面拍齊，「更多」選單也當成迴歸基準。

harness 在 repo 根目錄（`_dev-admin.html`、`_dev-admin.tsx`、`_dev-stub.ts`、`_dev-view.ts`、`_dev-fixtures/`，已列入 `.git/info/exclude`，不 commit）。`F:\.claude\launch.json` 的 `vsms-harness` 起 vite `127.0.0.1:5175`。

1. 先讓 stub 回答 vauth 的兩支 API，並能切換 vauth 模式（只改 dev 檔案）。在 `F:\vsms\vsms-export\_dev-stub.ts`：
   - 找到
     ```ts
     const fail = new Set((params.get('fail') ?? '').split(',').filter(Boolean))
     ```
     換成
     ```ts
     const fail = new Set((params.get('fail') ?? '').split(',').filter(Boolean))
     // 頂欄（UI 統一 4A）：&auth=vauth 切到單一登入模式（預設 local，跟加這段之前的行為相同）；
     // &unread=N 指定未讀數（預設 3）；&fail=apps,inbox 模擬 vauth 讀取失敗。
     const authProvider = params.get('auth') === 'vauth' ? 'vauth' : 'local'
     const portalApps = [
       { code: 'vtms', name: 'VTMS', description: '測試計畫、任務、案例、報告', url: '/vtms/', sortOrder: 1, showInTopbar: true },
       { code: 'vsms', name: 'VSMS', description: '工作排程、設備排程、負載分析', url: '/vsms/', sortOrder: 2, showInTopbar: true },
       { code: 'lab', name: '實驗室預約', description: '設備與場地借用（harness 假資料）', url: '/lab/', sortOrder: 3, showInTopbar: false },
     ]
     ```
   - 找到
     ```ts
       if (!url.startsWith('/api')) return realFetch(input, init)
     ```
     換成
     ```ts
       if (url.startsWith('/portal/apps')) {
         await new Promise(r => setTimeout(r, 40))
         return fail.has('apps') ? json({ message: 'harness 模擬' }, 500) : json({ apps: portalApps })
       }
       if (url.startsWith('/notify/inbox')) {
         await new Promise(r => setTimeout(r, 40))
         return fail.has('inbox')
           ? json({ message: 'harness 模擬' }, 500)
           : json({ items: [], unreadCount: Number(params.get('unread') ?? '3'), total: 0 })
       }
       if (!url.startsWith('/api')) return realFetch(input, init)
     ```
   - 找到
     ```ts
       if (path === '/me') return json(
     ```
     在這一行**上方**插入一行：
     ```ts
       if (path === '/config') return json({ authProvider })
     ```
   - 驗證：`grep -n "portal/apps\|notify/inbox\|path === '/config'" /f/vsms/vsms-export/_dev-stub.ts` 應該各有一筆。
2. `preview_start` 名稱 `vsms-harness`。**沒展開選單的畫面**可以用瀏覽器窗格或 Edge headless `--screenshot` 拍；**展開選單的畫面一律用瀏覽器窗格**（`computer` screenshot）——Edge headless 的 `--screenshot` 會觸發 resize，`MenuButton` 一 resize 就關閉。harness 裡不要點任何會導頁的連結（`/`、`/vtms/`、`/inbox`、`/change-password` 在 vite 上都不是真頁面），也不要按「登出」（vauth 模式會 `location.replace('/')`）。
3. 改前依序拍（1440 寬，除非另註）：
   - `http://127.0.0.1:5175/_dev-admin.html?role=super_admin&view=main`：舊的深色單排 Header（VSMS 標誌、四個分頁、SA 徽章、回入口頁、登出）。
   - 同上加 `&auth=vauth`：多了「修改密碼」。
   - `?role=admin&view=main`、`?role=user`、`?role=guest`（後兩者沒有分頁）。
   - `?role=super_admin&view=main` 視窗寬 375。
   - `?role=super_admin&view=main`，按工具列「更多」展開（瀏覽器窗格）：Task 1 之後要一模一樣。

### B. 改後截圖（Task 1～4 都 commit 之後）

同一組 harness，預期：
- `?role=super_admin&view=main&auth=vauth`：48px 白色頂欄——左邊青綠方塊勾勾＋「Validation Workspace」▾、並排「VTMS」「VSMS」（VSMS 淡青綠底）、右邊鈴鐺帶紅色「3」、頭像「系統」＋「系統管理員」▾；下方 40px 白色分頁列四個分頁，「排程管理」青綠底線。沒有「實驗室預約」並排連結。
- 同上，展開產品切換（瀏覽器窗格）：入口頁首頁、VTMS（說明）、VSMS（說明、右側打勾）、實驗室預約（說明）；清單靠左對齊按鈕。
- 同上，展開使用者選單（瀏覽器窗格）：標頭「系統管理員」／「超級管理者」、修改密碼、分隔線、登出；清單靠右。
- 同上，切到「列表」或按甘特圖全螢幕後再開「更多」：與改前那張一致（z-index、樣式不變）。
- `&unread=150`：徽章「99+」。`&fail=apps`：並排仍是 VTMS、VSMS（內建清單），下拉三項。`&fail=inbox`：鈴鐺沒有數字。
- `?role=admin&view=settings&tab=people&auth=vauth`：分頁列三個，「系統設定」選取；設定頁內自己的分頁列在內容區，兩列不要混淆。
- `?role=user&auth=vauth`：只有頂欄、沒有分頁列；使用者選單角色「測試人員」。
- `?role=guest&auth=vauth`：沒有鈴鐺；使用者選單只有「訪客（唯讀）」標頭與「登出」。
- `?role=admin`（local）：鈴鐺在但沒數字；使用者選單沒有「修改密碼」。
- `?role=super_admin&view=main&auth=vauth` 視窗寬 375：產品名稱文字與使用者名稱收起，只剩標誌、並排連結、鈴鐺、頭像；分頁列可橫向捲動；頁面沒有橫向捲軸。

改前／改後並排給使用者看，**使用者同意後**才往下做。harness 的 stub 修改保留（之後其他工作也用得到；`_dev-*` 本來就不進 git）。

### C. 建置與上線

0. 規格的上線順序是 vauth → 入口頁 → VSMS → VTMS。先確認 vauth 已上新版（入口頁後台「系統入口」看得到「顯示在頂欄」勾選框）。若 vauth 還沒上，VSMS 先上也不會壞（讀不到 `showInTopbar` 視為真），但照順序來，有例外先問使用者。
1. 在 `F:\vsms\vsms-export` 確認工作樹乾淨、分支 `feat/guest-role-and-uiux`、四個 commit 都在：`cd /f/vsms/vsms-export && git status --short && git log --oneline -6`。
2. 最後一次驗證：`npm test` 全過、`npx tsc -p tsconfig.app.json --noEmit` 0 錯。
3. 備份：`cp -r /f/vsms/vsms-export/dist /f/vsms/vsms-export/dist.stable-20260924-pre-topbar`（若同名已存在就停下來問，不要覆蓋）。
4. 只跑 `cd /f/vsms/vsms-export && npx vite build`。**不要**跑 `npm run build`，**不要** `pm2 restart vsms`：dist 由磁碟即時服務，前端修正只需 build。
5. 驗證正式站送出的 HTML 就是剛建出來的那份：
   ```bash
   curl -sk https://172.16.204.69/vsms/ | sha256sum
   sha256sum /f/vsms/vsms-export/dist/index.html
   ```
   兩個 hash 必須相同。
6. 瀏覽器實機（`https://172.16.204.69/` 入口頁登入後進 `/vsms/`）：
   - 頂欄並排連結與入口頁「系統入口」設定一致；產品切換下拉列出所有啟用系統、VSMS 打勾；點「入口頁首頁」回到 `/`、點「VTMS」到 `/vtms/`。
   - 鈴鐺數字與入口頁收件匣的未讀數一致；點鈴鐺到 `https://172.16.204.69/inbox`。
   - 使用者選單角色正確；「修改密碼」開到入口頁的修改密碼頁（`/change-password`，不是首頁）。
   - DevTools Network：`/portal/apps`、`/notify/inbox?limit=1` 各只打一次（正式 build 沒有 StrictMode 的重複掛載），網址是站台根目錄、不是 `/vsms/portal/apps`。
   - 「登出」會結束使用者自己的登入狀態，**先問使用者**要不要實測；同意才按，確認回到入口頁登入畫面、再進 `/vtms/` 也是登出狀態。
7. master 快轉到 `feat/guest-role-and-uiux`（照往例部署時快轉）。推 GitHub **先問使用者**。
8. 更新畫布進度（4A VSMS → 已上線）與相關記憶（`workspace-ui-review-2026-09-23.md`：第 4A 項 VSMS 已上線、退版備份名稱）。

**退版**：
```bash
rm -rf /f/vsms/vsms-export/dist
cp -r /f/vsms/vsms-export/dist.stable-20260924-pre-topbar /f/vsms/vsms-export/dist
```
不需要重啟 vsms。退版後用第 5 步的 hash 比對確認正式站回到舊版。

---

## Self-Review

**1. 規格覆蓋（VSMS 範圍）**

| 規格要求 | 位置 |
|---|---|
| 48px、白底 `--vw-surface`、底線 `--vw-border`、px 16、gap 16 | Task 3 `Topbar` header class；Global Constraints |
| 產品切換鈕（22×22 accent 方塊＋白勾＋「Validation Workspace」14px 粗體＋▾） | Task 3 `trigger`；Task 1 `trigger` prop |
| 並排連結：`showInTopbar`、`sortOrder`、32px、px 12、13px 中字重、`aria-current` | Task 2 `parsePortalApps` 排序；Task 3 inline nav；測試 topbar「並排連結」 |
| 鈴鐺 32×32、Bell 18px、`aria-label="通知"`、紅色徽章、99+、到 `/inbox` | Task 3；Task 2 `formatUnreadBadge`；測試「通知鈴鐺」 |
| 使用者選單鈕：26px 頭像縮寫、名稱 13px、▾、`aria-label`、`aria-haspopup` | Task 3；Task 2 `avatarInitials`；Task 1 既有 `aria-haspopup` |
| 下拉：入口頁首頁 → `/`、所有啟用系統＋說明 12px、目前系統打勾 | Task 3 `switcherItems`；Task 1 `description`／`current` |
| 使用者選單：標頭名稱＋VSMS 角色中文；修改密碼（vauth、非訪客）；分隔線；登出沿用 `logout`；移除回入口頁 | Task 3 `userItems`／`userHeader`；Task 1 `header`／`separatorBefore`；測試「使用者選單」 |
| 下拉行為：點外面、Esc 還焦點、上下鍵、`role=menu/menuitem`、蓋過 `z-[100]` | Task 1（沿用＋新測試）；Task 3 鍵盤測試 |
| `/portal/apps` 讀一次、失敗或非 vauth 退回三項、`showInTopbar` 缺欄位視為真 | Task 2 `useTopbarData`／`parsePortalApps`／`FALLBACK_APPS`；測試 |
| 未讀數 `unreadCount`、只讀一次、失敗或非 vauth 不顯示、訪客不讀 | Task 2；Task 3 測試「只在掛載時讀一次」「訪客」「local」 |
| VSMS：`NAV_TABS` 移到第二列 40px 白底底線、角色篩選不變、只剩一個分頁不顯示 | Task 4 `NavTabs`；測試 navTabs、app-topbar |
| 既有型別檢查與全套測試全過 | 每個 task 的 Step「全套測試＋型別檢查」 |
| 上線：只 `npx vite build`、改前改後截圖、順序在 vauth 之後 | 部署 A／B／C |

VTMS 專屬（深色模式、介面切換、`--sticky-offset`、depth 麵包屑）與 vauth／入口頁的部分不在本計畫。

**2. 佔位掃描**：每個程式碼步驟都有完整內容；沒有 TBD／「比照」／「適當處理」。Header.tsx 的刪除有指令與驗證 grep。

**3. 名稱與型別一致**：`MenuItem` 的 `href`／`description`／`current`／`separatorBefore`／`onSelect?`、`MenuButton` 的 `trigger`／`align`／`header`／`size` 在 Task 1 定義、Task 3 使用，拼法一致。`topbarData` 匯出名（`CURRENT_APP_CODE`、`FALLBACK_APPS`、`PORTAL_HOME_LABEL`、`PORTAL_HOME_URL`、`INBOX_URL`、`CHANGE_PASSWORD_URL`、`ROLE_LABELS`、`parsePortalApps`、`fetchPortalApps`、`fetchUnreadCount`、`formatUnreadBadge`、`avatarInitials`）與 `useTopbarData({ vauth, guest }) → { apps, unreadCount }` 在 Task 2 定義、Task 3 與測試使用一致。`formatUnreadBadge` 接受 `number | null`，Task 3 直接傳 `unreadCount`。`NavTabs` props 與舊 `Header` 相同（`currentView`、`onNavigate`、`role`），App 的呼叫只換元件名。徽章 `data-testid="topbar-unread"` 在元件與測試一致。

## 替規格決定的細節

1. **退回清單的「入口頁首頁」**：規格把它列在退回清單裡，但正常模式下 `/portal/apps` 並不包含入口頁，而下拉第一項本來就固定是「入口頁首頁」。為了不讓它在退回時重複出現、也不讓並排連結在退回時多出一個「入口頁首頁」，`FALLBACK_APPS` 只放 VTMS、VSMS；退回時下拉正好是三項，並排連結是 VTMS、VSMS（與正常模式一致）。
2. **訪客不顯示鈴鐺**：規格只寫「VSMS 訪客不讀」未讀數。訪客從入口頁的訪客連結進來、沒有 SSO 登入，點鈴鐺到 `/inbox` 只會被彈去登入頁，所以連鈴鐺一起藏掉。local 模式則照規格字面：鈴鐺在、不顯示數字。
3. **訪客仍讀 `/portal/apps`**：規格寫「每個系統在頂欄掛載時讀一次」，沒排除訪客；訪客沒有 SSO 時會 401，退回內建清單，結果一樣。
4. **讀取中不畫並排連結**：避免內建清單閃一下又被管理員設定換掉；下拉在讀取中先用內建清單（使用者點得到東西）。
5. **退回清單的說明文字**用 vauth 預設種子（`auth/sql/008-portal.sql`）的文字。
6. **375px 寬**：產品名稱文字與使用者名稱在 `sm` 以下收起（按鈕仍有 `aria-label`）；並排連結在 `md` 以下隱藏（與入口頁一致，下拉裡有全部系統）。
7. **修改密碼網址**改成 `/change-password`：舊 Header 的 `/#change-password` 在 BrowserRouter 的入口頁其實只會到首頁。
8. **頂欄產品切換鈕的無障礙名稱**是「切換系統」（2026-09-24 三系統統一；看得到的文字仍是「Validation Workspace」，小螢幕收起時按鈕仍有名稱）。
