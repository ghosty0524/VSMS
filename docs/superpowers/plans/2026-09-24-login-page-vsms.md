# VSMS local 登入頁換色（UI 統一 4B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VSMS 的 local 模式登入頁只換外觀：標誌方塊改成 Validation Workspace 的勾勾圖形（底色 `--vw-accent`，VSMS 為青綠）、「登入」主按鈕改墨色、帳號與密碼輸入框改 40px＋token 邊框；背景、人數上限錯誤、重複登入警告、訪客入口的樣式與行為都不變。

**Architecture:** 只改 `src/components/layout/LoginPage.tsx` 一個元件：標誌換成 lucide `Check`（與 4A 頂欄標誌同一個圖形），兩個輸入框共用一個模組常數 `INPUT_CLASS`，主按鈕換成 VSMS 既有的墨色主按鈕 class（`bg-stone-900`＝`--vw-ink`）。版面結構、欄位、流程、store 呼叫全部不動。新增一個元件測試檔直接 render `LoginPage`，store 用 zustand `setState` 換掉 `login`／`guestLogin`／`clearErrors`，不碰任何 API。

**Tech Stack:** React 19、TypeScript、Tailwind v4（`@theme` 重新定義 gray／slate／stone 為共用墨色階、`blue-*` 為青綠）、zustand、lucide-react 1.11；測試用 vitest 4（jsdom）＋ @testing-library/react 16 ＋ @testing-library/user-event 14。

**Spec:** `F:\vportal\docs\superpowers\specs\2026-09-24-login-page-design.md`（本計畫涵蓋「共用視覺值」中 VSMS 用得到的部分、「C. VTMS／VSMS local 登入頁」的 VSMS 那一條、「測試」與「上線」的 VSMS 部分。入口頁與 VTMS 各有自己的計畫。）

## Global Constraints

- Repo `F:\vsms\vsms-export`，commit 在目前分支 `feat/guest-role-and-uiux`（起點 HEAD `673de7c`，與 master 同一點；master 在部署時快轉）。一律用絕對路徑（Bash 用 `/f/vsms/vsms-export/...`）；平行的 Bash 呼叫共用 cwd，每個指令都先 `cd /f/vsms/vsms-export &&`。
- Commit message 用英文，結尾一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **絕對不要**執行 `git restore`、`git checkout`（檔案或分支）、`git stash`、`git reset`、`git clean`，或任何會丟掉工作樹修改的指令。需要舊版內容時用 `git show HEAD:<path>`。只 `git add` 自己改的檔案，逐一列出路徑（本計畫只有 `src/components/layout/LoginPage.tsx` 與 `src/__tests__/loginPage.test.tsx`）。
- 不要跑 `npm run build`，不要 `npx vite build`，不要 `pm2`（任何子指令），不要部署。部署由 controller 依最後一節執行。
- 不要碰 repo 根目錄的 `_dev-*` 檔案與 `_dev-fixtures/`（harness，git 已排除，只有 controller 在部署段落會新增／刪除）。
- 不要改 `src/index.css`、`src/styles/workspace-tokens.css`（token 副本）、`src/store/authStore.ts`、`src/App.tsx`。不新增 token。
- 指令：
  - 前端測試：`npm test`（`vitest run`，只跑 `src/__tests__`）。起點基準：56 檔、433 條全過。
  - 單檔測試：`npx vitest run src/__tests__/<file>`。
  - 型別檢查：`npx tsc -p tsconfig.app.json --noEmit`，必須 0 錯（`src/__tests__` 也在檢查範圍內，測試碼也要過型別）。
- 測試絕不碰真的後端或資料庫：直接 render `LoginPage`，`useAuthStore.setState` 塞狀態並換掉 `login`／`guestLogin`／`clearErrors`（照 `src/__tests__/protectedLayout-initError.test.tsx` 換 store 函式的寫法），測試結束換回原函式。
- 行尾：`src/components/layout/LoginPage.tsx` 是 CRLF（`core.autocrlf=true`），用 Edit 工具換片段；不要用 Write 整份覆寫。改完用 node 驗證行尾（這台機器的 `python` 是 Store 佔位程式，會靜默不改檔，不要用）。新測試檔用 LF。
- 顏色一律用 token：
  - 標誌底色 `bg-[var(--vw-accent)]`（`src/index.css` 的 `:root` 定義為 `#0E6B63`）。
  - 輸入框邊框 `border-[var(--vw-border-strong)]`（`#D6DBE3`）。
  - 主按鈕 `bg-stone-900 hover:bg-stone-800 text-white`：VSMS 的 `@theme` 把 `stone-900` 指到 `var(--vw-ink)`（`#17212E`）、`stone-800` 指到 `var(--vw-primary-bg-hover)`，這是 VSMS 其他主按鈕的既有寫法，而且 `src/index.css` 的 `button.bg-stone-900` 規則會給主按鈕共用的投影。
  - `blue-*` 在 VSMS 已重新定義成青綠；輸入框的 focus 環 `focus:ring-blue-500` 維持原樣。
  - 規格裡「沒有 token 的左側副文字色（`#B8C0CC`、`#7C8797`）」只用在入口頁左欄；VSMS 不加左側品牌區，所以這兩個具名常數在 VSMS 不需要。
- 共用視覺值（規格原文，VSMS 用到的部分）：
  - 輸入框：高 40px、左右內距 12px、1px `#D6DBE3`（`--vw-border-strong`）、圓角 6px、14px 字 → `h-10 px-3 border border-[var(--vw-border-strong)] rounded-md text-sm`。
  - 主按鈕：高 44px、墨色底白字、15px 600、圓角 6px → `h-11 bg-stone-900 text-white text-[15px] font-semibold rounded-md`。
  - 標誌：28×28 圓角 7px 方塊，底色 `--vw-accent`，白色勾勾（lucide `Check`，與 4A 頂欄標誌同一個圖形）→ `w-7 h-7 rounded-[7px] bg-[var(--vw-accent)] text-white`，內放 `<Check size={18} strokeWidth={3} />`。
  - 背景維持 `app-ground`（`--app-ground: var(--vw-bg)`）。
- 不變的部分（規格「人數上限錯誤、重複登入警告（「繼續登入」／「取消」）、訪客入口的樣式與行為不變」）：人數上限紅框（`bg-red-50 border-red-200`＋`Users` 圖示）、一般錯誤那一行（`text-red-500 text-xs`）、重複登入警告黃框（`bg-amber-50 border-amber-200`，「繼續登入」`bg-amber-500`、「取消」白底灰框）、「或」分隔線、訪客按鈕（白底 `border-gray-300 text-gray-600 rounded-lg`）、白色卡片（`bg-white rounded-2xl shadow-lg p-8 max-w-sm`）、欄位標籤、`isChecking` 的「連線中…」畫面、vauth 模式不顯示表單的判斷，全部一個字都不改。
- **不加**左側品牌區、**不加**「忘記密碼請洽系統管理員」。
- 逐字 UI 文字（照抄，不要改寫；本頁全部字串）：
  - 標題「VSMS」（`<h1>`）、副標「Validation Schedule Management System」。
  - 欄位標籤「帳號」「密碼」；placeholder「請輸入帳號」「請輸入密碼」；`autoComplete` 分別是 `username`、`current-password`。
  - 主按鈕「登入」，送出中「登入中…」。
  - 分隔字「或」；訪客按鈕「以訪客身分瀏覽（唯讀）」。
  - 重複登入警告（store 產生）「目前已有其他人員登入此系統，若繼續登入，對方 session 將於下次操作時失效。」；按鈕「繼續登入」「取消」。
  - 人數上限錯誤（伺服器產生，畫面判斷的關鍵字是「上限」）「目前已達登入人數上限（30 人），請稍後再試」。
  - 讀取中「連線中…」。
- 範圍外：入口頁登入頁與修改密碼頁（vportal 計畫）、VTMS local 登入頁（VTMS 計畫）、vauth 後端、登入流程、`authStore`、`App.tsx` 的 vauth 閘門。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `F:\vsms\vsms-export\src\components\layout\LoginPage.tsx` | 修改（4 處片段） | 標誌換 Workspace 勾勾、加 `INPUT_CLASS` 常數並套到兩個輸入框、主按鈕換墨色 |
| `F:\vsms\vsms-export\src\__tests__\loginPage.test.tsx` | 新增 | 新外觀的斷言＋不變部分（重複登入警告、人數上限、訪客、vauth）的迴歸保護 |

目前沒有任何測試直接 render `LoginPage`；`src/__tests__/app-vauth-gate.test.tsx` 的「local 模式未登入 → 仍顯示本地登入頁」會間接 render 它（`findByRole('button', { name: /登入/ })`），必須照舊通過——所以標誌外框要 `aria-hidden`，不能多出第二個名稱含「登入」的按鈕。

---

### Task 1: local 登入頁換色

**Files:**
- Modify: `F:\vsms\vsms-export\src\components\layout\LoginPage.tsx`（第 1–5 行 import 區、第 41–46 行標誌、第 95–98 行帳號輸入框、第 110–112 行密碼輸入框、第 124–126 行主按鈕）
- Test: `F:\vsms\vsms-export\src\__tests__\loginPage.test.tsx`（新增）
- 既有測試 `F:\vsms\vsms-export\src\__tests__\app-vauth-gate.test.tsx` 不改，必須照舊全過。

**Interfaces:**
- Consumes: `useAuthStore`（`src/store/authStore.ts`）的 `isChecking`、`isLoggedIn`、`authProvider: 'local' | 'vauth'`、`loginError: string`、`loginWarning: string`、`login(username: string, password: string, force?: boolean): Promise<void>`、`guestLogin(): Promise<void>`、`clearErrors(): void`。元件本身不改這些呼叫。
- Produces: 標誌外框 `data-testid="login-logo"`（測試用）；`LoginPage` 的匯出名與 props（無）不變。

- [ ] **Step 1: 寫測試（新外觀會失敗，不變部分先通過）**

新增 `F:\vsms\vsms-export\src\__tests__\loginPage.test.tsx`：

```tsx
// src/__tests__/loginPage.test.tsx
// VSMS 的 local 模式登入頁（UI 統一 4B，只換色）：標誌改成 Validation Workspace 的
// 勾勾圖形、「登入」主按鈕改墨色、輸入框 40px＋token 邊框；背景、人數上限錯誤、
// 重複登入警告與訪客入口維持原樣。正式環境是單一登入（vauth），這一頁只在退版
// （AUTH_PROVIDER=local）時出現。
// 規格：F:\vportal\docs\superpowers\specs\2026-09-24-login-page-design.md 第 C 節。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../components/layout/LoginPage'
import { useAuthStore } from '../store/authStore'

const WARNING = '目前已有其他人員登入此系統，若繼續登入，對方 session 將於下次操作時失效。'
const LIMIT = '目前已達登入人數上限（30 人），請稍後再試'

const original = {
  login: useAuthStore.getState().login,
  guestLogin: useAuthStore.getState().guestLogin,
  clearErrors: useAuthStore.getState().clearErrors,
}
const login = vi.fn<(username: string, password: string, force?: boolean) => Promise<void>>()
const guestLogin = vi.fn<() => Promise<void>>()
// 照真的 clearErrors 清掉兩個訊息，畫面才會跟著收起警告。
const clearErrors = vi.fn(() => { useAuthStore.setState({ loginError: '', loginWarning: '' }) })

beforeEach(() => {
  login.mockReset()
  login.mockResolvedValue(undefined)
  guestLogin.mockReset()
  guestLogin.mockResolvedValue(undefined)
  clearErrors.mockClear()
  useAuthStore.setState({
    isChecking: false,
    isLoggedIn: false,
    authProvider: 'local',
    loginError: '',
    loginWarning: '',
    login,
    guestLogin,
    clearErrors,
  })
})

afterEach(() => {
  useAuthStore.setState({ ...original, loginError: '', loginWarning: '' })
})

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('請輸入帳號'), 'Will_Wang')
  await user.type(screen.getByPlaceholderText('請輸入密碼'), 'secret')
  await user.click(screen.getByRole('button', { name: '登入' }))
}

describe('LoginPage 外觀（UI 統一 4B）', () => {
  it('標誌是 Validation Workspace 的勾勾圖形，28×28、圓角 7px、底色 --vw-accent；標題與副標不變', () => {
    const { container } = render(<LoginPage />)
    const logo = screen.getByTestId('login-logo')
    expect(logo).toHaveAttribute('aria-hidden', 'true')
    expect(logo).toHaveClass('w-7', 'h-7', 'rounded-[7px]', 'bg-[var(--vw-accent)]', 'text-white')
    expect(logo).not.toHaveClass('bg-blue-600')
    // lucide Check：與 4A 頂欄標誌同一個圖形
    const svg = logo.querySelector('svg.lucide-check')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M20 6 9 17l-5-5')
    // 舊的剪貼簿圖形不在了
    expect(container.querySelector('path[d^="M9 5H7"]')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'VSMS' })).toBeInTheDocument()
    expect(screen.getByText('Validation Schedule Management System')).toBeInTheDocument()
  })

  it('「登入」主按鈕是墨色（stone-900＝--vw-ink）、44px、15px 粗體、圓角 6px', () => {
    render(<LoginPage />)
    const btn = screen.getByRole('button', { name: '登入' })
    expect(btn).toHaveAttribute('type', 'submit')
    expect(btn).toHaveClass(
      'bg-stone-900', 'hover:bg-stone-800', 'text-white',
      'h-11', 'text-[15px]', 'font-semibold', 'rounded-md',
    )
    expect(btn).not.toHaveClass('bg-blue-600')
  })

  it('帳號、密碼輸入框：高 40px、左右內距 12px、--vw-border-strong 邊框、圓角 6px、14px 字', () => {
    render(<LoginPage />)
    for (const placeholder of ['請輸入帳號', '請輸入密碼']) {
      const input = screen.getByPlaceholderText(placeholder)
      expect(input).toHaveClass('h-10', 'px-3', 'border', 'border-[var(--vw-border-strong)]', 'rounded-md', 'text-sm')
      expect(input).not.toHaveClass('border-gray-300')
    }
    expect(screen.getByPlaceholderText('請輸入帳號')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByPlaceholderText('請輸入密碼')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('背景維持 app-ground', () => {
    const { container } = render(<LoginPage />)
    expect(container.firstElementChild).toHaveClass('app-ground', 'h-screen')
  })

  it('不加左側品牌區，也不加「忘記密碼請洽系統管理員」', () => {
    render(<LoginPage />)
    expect(screen.queryByText('忘記密碼請洽系統管理員')).toBeNull()
    expect(screen.queryByText(/單一工作入口/)).toBeNull()
  })
})

describe('LoginPage 行為與不換色的部分維持原樣', () => {
  it('沒填帳密時「登入」停用；填好按下 → login(帳號, 密碼)', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: '登入' })).toBeDisabled()
    await fillAndSubmit(user)
    expect(login).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith('Will_Wang', 'secret', undefined)
  })

  it('重複登入警告：表單收起、黃框樣式不變，「繼續登入」以 force 重送', async () => {
    login.mockImplementation(async (_username, _password, force) => {
      if (!force) useAuthStore.setState({ loginWarning: WARNING })
    })
    const user = userEvent.setup()
    render(<LoginPage />)
    await fillAndSubmit(user)

    const warning = await screen.findByText(WARNING)
    expect(warning.parentElement).toHaveClass('bg-amber-50', 'border-amber-200')
    expect(screen.queryByPlaceholderText('請輸入帳號')).toBeNull()
    const proceed = screen.getByRole('button', { name: '繼續登入' })
    expect(proceed).toHaveClass('bg-amber-500')
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()

    await user.click(proceed)
    expect(login).toHaveBeenLastCalledWith('Will_Wang', 'secret', true)
  })

  it('重複登入警告按「取消」：清掉警告、回到空白表單', async () => {
    login.mockImplementation(async (_username, _password, force) => {
      if (!force) useAuthStore.setState({ loginWarning: WARNING })
    })
    const user = userEvent.setup()
    render(<LoginPage />)
    await fillAndSubmit(user)
    await screen.findByText(WARNING)

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(clearErrors).toHaveBeenCalled()
    expect(screen.queryByText(WARNING)).toBeNull()
    expect(screen.getByPlaceholderText('請輸入帳號')).toHaveValue('')
    expect(screen.getByPlaceholderText('請輸入密碼')).toHaveValue('')
  })

  it('人數上限錯誤：紅框（Users 圖示）照舊，表單內的一般錯誤行不重複顯示', () => {
    useAuthStore.setState({ loginError: LIMIT })
    render(<LoginPage />)
    const messages = screen.getAllByText(LIMIT)
    expect(messages).toHaveLength(1)
    const box = messages[0].closest('.bg-red-50')
    expect(box).not.toBeNull()
    expect(box).toHaveClass('border-red-200')
    expect(box?.querySelector('svg.lucide-users')).not.toBeNull()
  })

  it('一般錯誤（非上限）顯示在表單內那一行，樣式不變', () => {
    useAuthStore.setState({ loginError: '帳號或密碼錯誤' })
    render(<LoginPage />)
    expect(screen.getByText('帳號或密碼錯誤')).toHaveClass('text-red-500', 'text-xs')
  })

  it('訪客入口照舊：「或」分隔線與白底次按鈕，按下呼叫 guestLogin', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    expect(screen.getByText('或')).toBeInTheDocument()
    const guest = screen.getByRole('button', { name: '以訪客身分瀏覽（唯讀）' })
    expect(guest).toHaveClass('border-gray-300', 'text-gray-600', 'rounded-lg')
    await user.click(guest)
    expect(guestLogin).toHaveBeenCalledTimes(1)
  })

  it('單一登入模式（vauth）不顯示帳密表單', () => {
    useAuthStore.setState({ authProvider: 'vauth' })
    render(<LoginPage />)
    expect(screen.queryByPlaceholderText('請輸入帳號')).toBeNull()
    expect(screen.queryByRole('button', { name: '登入' })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認新外觀的三條失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/loginPage.test.tsx`
Expected: 12 條中 3 條 FAIL、9 條 PASS。失敗的是：
- 「標誌是 Validation Workspace 的勾勾圖形…」：`Unable to find an element by: [data-testid="login-logo"]`。
- 「「登入」主按鈕是墨色…」：`toHaveClass` 缺 `bg-stone-900` 等（目前是 `bg-blue-600`）。
- 「帳號、密碼輸入框…」：`toHaveClass` 缺 `h-10`、`border-[var(--vw-border-strong)]`、`rounded-md`。

其餘 9 條（背景、不加品牌區、行為與不換色的部分）現在就要通過；若有任何一條失敗，是測試寫錯，先停下回報，不要改元件去配合。

- [ ] **Step 3: 改 `LoginPage.tsx`（4 處片段，用 Edit 工具，檔案是 CRLF）**

**3a. import 區加 `Check`，並加入輸入框樣式常數。** 把

```tsx
import { Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

export function LoginPage() {
```

換成

```tsx
import { Check, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

// 輸入框（UI 統一 4B 共用視覺值）：高 40px、左右內距 12px、1px --vw-border-strong、
// 圓角 6px、14px 字。focus 環沿用 VSMS 的 blue（已重新定義成青綠）。
const INPUT_CLASS =
  'w-full h-10 px-3 text-sm border border-[var(--vw-border-strong)] rounded-md ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export function LoginPage() {
```

**3b. 標誌換成 Workspace 勾勾。** 把

```tsx
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
```

換成

```tsx
          {/* Validation Workspace 標誌：與全域頂欄（4A）同一個勾勾圖形，28×28、圓角 7px、底色 --vw-accent */}
          <div data-testid="login-logo" aria-hidden="true"
            className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] bg-[var(--vw-accent)] text-white mb-4">
            <Check size={18} strokeWidth={3} />
          </div>
```

**3c. 帳號輸入框。** 把

```tsx
                placeholder="請輸入帳號"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
```

換成

```tsx
                placeholder="請輸入帳號"
                autoFocus
                className={INPUT_CLASS}
```

**3d. 密碼輸入框。** 把

```tsx
                placeholder="請輸入密碼"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
```

換成

```tsx
                placeholder="請輸入密碼"
                className={INPUT_CLASS}
```

**3e. 「登入」主按鈕改墨色。** 把

```tsx
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
```

換成

```tsx
              className="w-full h-11 bg-stone-900 text-white text-[15px] font-semibold rounded-md
                hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
```

其他地方（人數上限紅框、重複登入黃框、一般錯誤行、「或」分隔線、訪客按鈕、卡片、標籤、`isChecking` 畫面、`authProvider !== 'vauth'` 判斷）一個字都不動。

- [ ] **Step 4: 驗證改動與行尾**

Run:
```bash
cd /f/vsms/vsms-export && grep -n "bg-blue-600\|w-14 h-14\|M9 5H7\|border-gray-300 rounded-lg px-3 py-2.5" src/components/layout/LoginPage.tsx; echo "---"; grep -c "INPUT_CLASS" src/components/layout/LoginPage.tsx; node -e "const s=require('fs').readFileSync('src/components/layout/LoginPage.tsx','utf8');const lf=(s.match(/\n/g)||[]).length,crlf=(s.match(/\r\n/g)||[]).length;console.log('LF',lf,'CRLF',crlf,lf===crlf?'OK':'MIXED')"; git diff --stat
```
Expected：`---` 之前沒有任何輸出；`INPUT_CLASS` 計數 `3`；node 印出 `OK`（LF 與 CRLF 數量相同）；`git diff --stat` 只列 `src/components/layout/LoginPage.tsx`（新測試檔是 untracked，不會出現在 diff stat）。若 node 印出 `MIXED`，把檔案內單獨的 `\n` 補成 `\r\n`（用 node 腳本，改完再跑一次這個檢查）。

- [ ] **Step 5: 跑本 task 的測試與相關既有測試**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/loginPage.test.tsx src/__tests__/app-vauth-gate.test.tsx`
Expected: PASS（`loginPage.test.tsx` 12 條全過；`app-vauth-gate.test.tsx` 一條都不能壞，特別是「local 模式未登入 → 仍顯示本地登入頁」）。

- [ ] **Step 6: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 57 檔、445 條全過、0 failures；tsc 沒有任何輸出。

- [ ] **Step 7: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/layout/LoginPage.tsx src/__tests__/loginPage.test.tsx && git commit -m "$(cat <<'EOF'
style(login): Workspace logo, ink primary button and token inputs on the local login page

UI unification 4B. The local login page only shows up when VSMS falls
back to AUTH_PROVIDER=local, so this is a colour pass only: the logo
becomes the same check-mark tile as the global topbar (on --vw-accent),
the sign-in button uses the ink primary style, and the username and
password inputs are 40px with the --vw-border-strong border. Layout,
the concurrent-limit error, the duplicate-login warning and the guest
entry are unchanged and now covered by tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## 部署（controller 執行，不派給 subagent）

### A. 臨時 harness 與改前截圖（在派 **Task 1** 之前做完）

既有 harness（`_dev-admin.html`／`_dev-admin.tsx`／`_dev-stub.ts`／`_dev-view.ts`）掛的是整個 `App`，而 `_dev-stub.ts` 的 `/api/me` 一律回登入成功，所以進不到登入頁；只有 `&auth=vauth` 時未登入又會被導回 `/`。這次不改那份共用 stub，另開一個**直接 render `LoginPage`** 的臨時 harness，不打任何 API。檔名 `_dev-*` 已列入 `.git/info/exclude`，**不得 commit**，全部做完後刪除（見 C 第 9 步）。

1. 新增 `F:\vsms\vsms-export\_dev-login.html`：

   ```html
   <!DOCTYPE html>
   <html lang="zh-TW">
     <head>
       <meta charset="UTF-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>VSMS login harness</title>
     </head>
     <body>
       <div id="root"></div>
       <script type="module" src="/_dev-login.tsx"></script>
     </body>
   </html>
   ```

2. 新增 `F:\vsms\vsms-export\_dev-login.tsx`：

   ```tsx
   // 臨時 harness（UI 統一 4B）：直接渲染 VSMS 的 local 登入頁，不打任何 API。用完即刪，不得 commit。
   // ?state=form（預設）| dup（重複登入警告）| limit（人數上限錯誤）| error（一般錯誤）
   // form 狀態下填帳密按「登入」會顯示重複登入警告；「繼續登入」「取消」「以訪客身分瀏覽」都不打 API。
   import { StrictMode } from 'react'
   import { createRoot } from 'react-dom/client'
   import './src/styles/workspace-tokens.css'
   import './src/index.css'
   import { LoginPage } from './src/components/layout/LoginPage'
   import { useAuthStore } from './src/store/authStore'

   const state = new URLSearchParams(location.search).get('state') ?? 'form'
   const WARNING = '目前已有其他人員登入此系統，若繼續登入，對方 session 將於下次操作時失效。'
   const LIMIT = '目前已達登入人數上限（30 人），請稍後再試'
   const BAD = '帳號或密碼錯誤'

   useAuthStore.setState({
     isChecking: false,
     isLoggedIn: false,
     authProvider: 'local',
     loginError: state === 'limit' ? LIMIT : state === 'error' ? BAD : '',
     loginWarning: state === 'dup' ? WARNING : '',
     login: async (_username: string, _password: string, force?: boolean) => {
       if (!force) useAuthStore.setState({ loginWarning: WARNING })
     },
     guestLogin: async () => {},
     checkAuth: async () => {},
   })

   createRoot(document.getElementById('root')!).render(
     <StrictMode>
       <LoginPage />
     </StrictMode>,
   )
   ```

3. `preview_start` 名稱 `vsms-harness`（`F:\.claude\launch.json`，vite `127.0.0.1:5175`，服務整個 repo 根目錄，所以 `/_dev-login.html` 直接可開）。先用瀏覽器窗格開 `http://127.0.0.1:5175/_dev-login.html` 確認畫面出來、console 沒有錯誤。
4. 改前截圖（Edge headless，PowerShell；存到 controller 的 scratchpad，下例用 `$env:TEMP\vsms-4b`，可換成 scratchpad 路徑）：

   ```powershell
   New-Item -ItemType Directory -Force "$env:TEMP\vsms-4b" | Out-Null
   $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
   $base = "http://127.0.0.1:5175/_dev-login.html"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4b\before-form-1440.png" "$base?state=form"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=375,812 --screenshot="$env:TEMP\vsms-4b\before-form-375.png" "$base?state=form"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4b\before-dup-1440.png" "$base?state=dup"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4b\before-limit-1440.png" "$base?state=limit"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-4b\before-error-1440.png" "$base?state=error"
   ```

   headless 若拍到空白（vite 首次編譯較慢），改用瀏覽器窗格（`computer` screenshot）拍同一組網址。改前預期：56px 青綠圓角方塊裡是白色剪貼簿圖示、「登入」是青綠按鈕、輸入框灰框圓角 8px；`dup` 是黃框警告＋「繼續登入」「取消」；`limit` 是紅框＋人形圖示；`error` 是表單內紅字一行。

### B. 改後截圖（Task 1 commit 之後）

vite dev server 會即時重載，用同一組指令把檔名的 `before-` 換成 `after-` 再拍一次。預期：
- `form`（1440）：卡片頂端是 28×28 青綠（`#0E6B63`）圓角 7px 方塊＋白色勾勾，下面「VSMS」與副標照舊；帳號、密碼輸入框 40px 高、淺灰（`#D6DBE3`）細框、圓角 6px；「登入」是 44px 墨色（`#17212E`）按鈕、15px 粗體，停用時半透明；「或」與「以訪客身分瀏覽（唯讀）」與改前一模一樣；頁面底色與改前相同（`app-ground`）。
- `form`（375）：卡片不超出畫面、沒有橫向捲軸（版面結構沒動，應與改前同樣）。
- `dup`、`limit`、`error`：除了標誌換成勾勾之外，警告框、紅框、紅字與改前完全一樣。
- 在瀏覽器窗格 `?state=form` 填任意帳密按「登入」→ 出現重複登入警告；按「取消」回到空白表單（行為不變）。

改前／改後並排給使用者看，**使用者同意後**才往下做。

### C. 建置與上線

只有前端；與入口頁、VTMS 的 4B 部署彼此獨立，不需要照順序。

1. 確認工作樹與分支：`cd /f/vsms/vsms-export && git status --short && git branch --show-current && git log --oneline -3`。預期：`git status --short` 沒有輸出（`_dev-*` 已被 exclude）、分支 `feat/guest-role-and-uiux`、最新一筆是 Task 1 的 commit。
2. 最後一次驗證：`cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`，全過、0 錯。
3. 備份：`cp -r /f/vsms/vsms-export/dist /f/vsms/vsms-export/dist.stable-20260924-pre-login`（若同名已存在就停下來問，不要覆蓋）。
4. 只跑 `cd /f/vsms/vsms-export && npx vite build`。**不要**跑 `npm run build`（它會連 server 一起 tsc），**不要** `pm2`（任何子指令）：dist 由磁碟即時服務，前端修正只需 build。
5. 確認新版登入頁進了 bundle（`vite-plugin-singlefile`，整包在 `dist/index.html`）：
   ```bash
   cd /f/vsms/vsms-export && grep -c "M9 5H7a2 2 0 00-2 2v12" dist/index.html; grep -cF 'rounded-[7px]' dist/index.html
   ```
   第一個必須是 `0`（舊剪貼簿圖形只在登入頁用過），第二個至少 `1`。
6. 驗證正式站送出的 HTML 就是剛建出來的那份：
   ```bash
   curl -sk https://172.16.204.69/vsms/ | sha256sum
   sha256sum /f/vsms/vsms-export/dist/index.html
   ```
   兩個 hash 必須相同。
7. 實機：正式環境是單一登入（`AUTH_PROVIDER=vauth`），local 登入頁在正式站看不到，**不要**為了看它去改 `AUTH_PROVIDER` 或重啟 vsms；登入頁本身以 B 的 harness 截圖為準。請使用者從入口頁（`https://172.16.204.69/`）登入後進 `/vsms/`，確認 VSMS 照常開啟、頂欄與排程畫面正常；入口頁的「以訪客身分瀏覽 VSMS（唯讀）」仍能進入訪客模式。登入由使用者操作，不代輸入帳密。
8. master 快轉到 `feat/guest-role-and-uiux`（照往例部署時快轉；只在能快轉時才動）：
   ```bash
   cd /f/vsms/vsms-export && git merge-base --is-ancestor master feat/guest-role-and-uiux && git branch -f master feat/guest-role-and-uiux && git log --oneline -1 master
   ```
   推 GitHub（`git push origin master feat/guest-role-and-uiux`）**先問使用者**，同意才推。
9. 刪除臨時 harness：`rm /f/vsms/vsms-export/_dev-login.html /f/vsms/vsms-export/_dev-login.tsx`，再 `ls /f/vsms/vsms-export/_dev-*` 確認只剩原本的 `_dev-admin.html`、`_dev-admin.tsx`、`_dev-stub.ts`、`_dev-view.ts`（與 `_dev-fixtures/`）。`preview_stop` 關掉 `vsms-harness`。
10. 更新畫布進度（4B VSMS → 已上線）與相關記憶（`workspace-ui-review-2026-09-23.md`：第 4B 項 VSMS 已上線、退版備份 `dist.stable-20260924-pre-login`）。

**退版**：
```bash
rm -rf /f/vsms/vsms-export/dist
cp -r /f/vsms/vsms-export/dist.stable-20260924-pre-login /f/vsms/vsms-export/dist
```
不需要重啟 vsms。退版後用第 6 步的 hash 比對確認正式站回到舊版。

---

## Self-Review

**1. 規格覆蓋（VSMS 範圍）**

| 規格要求 | 位置 |
|---|---|
| 標誌方塊改 Workspace 勾勾圖形、底色 `--vw-accent`（VSMS 青綠）；28×28、圓角 7px、lucide `Check` | Task 1 Step 3b；測試「標誌是 Validation Workspace 的勾勾圖形…」 |
| 標題維持「VSMS」、副標維持 | Step 3b 只換標誌外框；同一條測試斷言 h1 與副標 |
| 「登入」主按鈕改墨色（44px、墨色底白字、15px 600、圓角 6px） | Step 3e；測試「「登入」主按鈕是墨色…」 |
| 輸入框 40px、token 邊框（左右內距 12px、`--vw-border-strong`、圓角 6px、14px 字） | Step 3a `INPUT_CLASS`、3c、3d；測試「帳號、密碼輸入框…」 |
| 背景維持 `app-ground` | 未動；測試「背景維持 app-ground」 |
| 人數上限錯誤樣式與行為不變 | 未動；測試「人數上限錯誤…」「一般錯誤…」 |
| 重複登入警告（「繼續登入」／「取消」）樣式與行為不變；「VSMS 重複登入警告按鈕仍在」 | 未動；測試「重複登入警告…繼續登入」「…取消」 |
| 訪客入口樣式與行為不變 | 未動；測試「訪客入口照舊…」 |
| 不加左側品牌區、不加「忘記密碼請洽系統管理員」 | Global Constraints；測試「不加左側品牌區…」 |
| 登入頁既有測試維持通過 | Step 5 跑 `app-vauth-gate.test.tsx`；Step 6 全套 |
| 顏色用 token、不新增 token、不改副本 | Global Constraints；只用 `--vw-accent`、`--vw-border-strong`、`stone-900/800`（＝`--vw-ink`／`--vw-primary-bg-hover`） |
| 型別檢查與全套測試全過 | Step 6；部署 C 第 2 步 |
| 上線：只 `npx vite build`、備份 `dist`；改前／改後截圖含重複登入警告 | 部署 A／B／C |

**2. 佔位掃描**：測試檔整份給出；每個元件改動都有原文片段與新片段；harness 兩個檔案整份給出；指令與預期輸出都寫明。沒有 TBD／「比照」／「適當處理」。

**3. 名稱與型別一致**：`INPUT_CLASS` 在 3a 定義、3c／3d 使用，Step 4 計數 3（定義 1＋使用 2）。`data-testid="login-logo"` 在 3b 與測試一致。`login` 的 mock 型別 `(username: string, password: string, force?: boolean) => Promise<void>` 與 `AuthState.login` 相同；`guestLogin`、`clearErrors` 同理。harness 的 `useAuthStore.setState` 欄位名（`isChecking`、`isLoggedIn`、`authProvider`、`loginError`、`loginWarning`、`login`、`guestLogin`、`checkAuth`）都是 `authStore.ts` 既有欄位。測試數字：新檔 12 條，基準 56 檔／433 條 → 57 檔／445 條。

## 替規格決定的細節

1. **標誌尺寸**：規格 C 只說「標誌方塊改為 Workspace 勾勾圖形」，共用視覺值表寫 28×28、圓角 7px。照共用值把原本 56px 方塊縮成 28px（`mb-4` 與置中不動）；勾勾用 `Check size={18} strokeWidth={3}`，是 4A 頂欄 22px 方塊內 14px 勾勾的等比放大。
2. **主按鈕尺寸**：規格 C 對 VSMS 只寫「改墨色」，但共用視覺值是三系統共同的，所以一併套 44px、15px、600、圓角 6px（原本是 `py-2.5 text-sm font-medium rounded-lg`）。
3. **墨色用 `bg-stone-900` 而不是 `bg-[var(--vw-primary-bg)]`**：VSMS 的 `@theme` 已把 `stone-900` 指到 `--vw-ink`、`stone-800` 指到 `--vw-primary-bg-hover`，其他主按鈕都這樣寫，而且 `src/index.css` 的 `button.bg-stone-900` 會給主按鈕共用的投影；寫成任意值 class 會失去這條規則。
4. **卡片、欄位標籤、一般錯誤行、訪客按鈕不換**：規格 C 的 VSMS 條只列標誌、主按鈕、輸入框、背景，並明說上限錯誤、重複登入警告、訪客入口不變；卡片（`rounded-2xl shadow-lg p-8`）不套共用卡片值（圓角 12px、內距 40px），以免超出「只換色」。
5. **輸入框邊框寫成 `border-[var(--vw-border-strong)]`**：`gray-300` 在 VSMS 其實也指到同一個 token，但規格要「token 邊框」，寫明 token 讓意圖可讀、測試可斷言；focus 環 `ring-blue-500`（青綠）不動。
6. **harness 另開 `_dev-login.*`**：既有 stub 的 `/api/me` 一律登入成功、vauth 模式又會導回 `/`，無法停在登入頁；直接 render `LoginPage` 並塞 store 狀態，不改共用 stub，用完即刪。
7. **正式站看不到這一頁**：正式是 vauth，實機只驗 hash 與 VSMS 照常運作，登入頁外觀以 harness 截圖為準，不為驗證去切 `AUTH_PROVIDER`。
