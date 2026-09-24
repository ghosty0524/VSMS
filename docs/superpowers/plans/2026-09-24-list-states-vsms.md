# VSMS 列表的載入／空／失敗狀態 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VSMS 新增共用 `ListState` 元件，修掉三處會誤導人的列表狀態：登入後初始化失敗永遠停在「載入資料中…」、人員頁讀帳號失敗後每個人都像沒有帳號、甘特圖／列表篩選後沒結果只有一句純文字而沒有清除按鈕。

**Architecture:** `src/components/shared/ListState.tsx` 把「有資料／失敗／載入中／篩選後沒結果／真的沒有」的判斷順序寫死，呼叫端只給事實（`loading`、`error`、`count`、`filtered`）。它另外匯出失敗狀態本體 `ListStateFailure`，讓全頁的 `LoadingScreen` 在新增的 `error`／`onRetry` 兩個選用 props 下顯示同一個失敗外觀。錯誤通知方式不動：toast 照舊。

**Tech Stack:** React 19、TypeScript、Tailwind v4、zustand；測試用 vitest（jsdom）＋ @testing-library/react ＋ @testing-library/user-event。

**Spec:** `F:\vportal\docs\superpowers\specs\2026-09-24-list-states-design.md`（本計畫只涵蓋「元件：ListState」的 VSMS 那一份、修正清單第 5～7 項、測試與上線段落的 VSMS 部分）

## Global Constraints

- Repo `F:\vsms\vsms-export`，commit 在目前分支 `feat/guest-role-and-uiux`（起點 HEAD `20d76ed`）。一律用絕對路徑。
- Commit message 用英文，結尾一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **絕對不要**執行 `git restore`、`git checkout`（檔案或分支）、`git stash`、`git reset`、`git clean`，或任何會丟掉工作樹修改的指令。需要舊版內容時用 `git show HEAD:<path>`。只 `git add` 自己改的檔案，並逐一指定路徑。
- 不要跑 `npm run build`，不要 `npx vite build`，不要 `pm2 restart`，不要部署。部署由 controller 依最後一節執行。
- 不要碰 repo 根目錄的 `_dev-*` 檔案（harness，git 已排除，只有 controller 在部署段落會改）。
- 指令：
  - 前端測試：`npm test`，也就是 `vitest run`，只跑 `src/__tests__`。
  - 單檔測試：`npx vitest run src/__tests__/<file>`。
  - 前端型別檢查：`npx tsc -p tsconfig.app.json --noEmit`，必須是 0 錯。
- 測試絕不碰真的後端或資料庫：store 用 zustand `setState` 塞資料或換掉 `init`，`api` 用 `vi.mock('../lib/api', …)`（照 `src/__tests__/personRow-vauth.test.tsx`、`src/__tests__/app-vauth-gate.test.tsx` 的寫法）。
- 工作樹的既有 `.tsx` 檔是 CRLF（`core.autocrlf=true`）。用 Edit 工具換片段沒問題；若改用腳本改檔，要處理 `\r\n`，改完 grep 驗證。新檔用 LF 即可（`MenuButton.tsx` 就是 LF）。
- 顏色：Tailwind 的 gray／slate／stone 都對應同一組墨色，`blue-*` 已重新定義成青綠。不要引進新的色系；失敗狀態用既有的 red（`text-red-700`、`bg-red-50`、`border-red-200`）。
- 用語（三系統相同，逐字照抄規格）：

  | 狀態 | 文字 | 按鈕 |
  |---|---|---|
  | 載入中 | 載入中… | — |
  | 沒有資料 | 目前沒有{名詞} | 可選（例如「新增排程」） |
  | 篩選後沒結果 | 沒有符合條件的{名詞} | 清除篩選（或「清除搜尋」，見各處） |
  | 讀取失敗 | 無法載入{名詞} | 重試 |

  `{名詞}` 由呼叫端傳入，例如「專案」「帳號」「公告」。失敗時在標題下方小字顯示原始錯誤訊息（有的話）。
- `ListState` 判斷順序（逐字照抄規格，寫死在元件裡）：
  1. `count > 0`：顯示 `children`。若同時有 `error`（例如重新整理失敗），在 `children` **上方**加一條錯誤提示（含重試），**不藏掉已經有的資料**。`loading` 為 true 時仍顯示 `children`（重新整理不閃爍）。
  2. `count === 0` 且有 `error`：只顯示失敗狀態。
  3. `count === 0` 且 `loading`：只顯示「載入中…」。
  4. `count === 0` 且 `filtered`：「沒有符合條件的{名詞}」＋清除按鈕（有 `onClearFilters` 才顯示）。
  5. 其餘：「目前沒有{名詞}」＋ `emptyAction`。
- 「有 `error`」的定義：`error` 不是 `null` 也不是 `undefined`（空字串也算失敗，只是沒有小字）。
- 外觀（規格）：置中、灰字（`text-gray-600` 標題／`text-gray-500` 說明），`compact` 時縮小間距；失敗狀態用 `text-red-700`＋錯誤小字；按鈕用 VSMS 次要按鈕樣式 `border border-slate-300 bg-white text-slate-600 rounded-md text-xs px-3 py-1.5`。載入中與空狀態 `role="status"`，失敗 `role="alert"`。
- 範圍外：VSMS 其他約 15 處手寫「尚無資料」、統計頁各區塊、甘特圖「全無排程」那一版（圖示＋「尚無工作排程」，保留不動）、設備視角的「尚無設備」、錯誤通知方式（toast 照舊）。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `F:\vsms\vsms-export\src\components\shared\ListState.tsx` | 新增 | `ListState`（判斷順序）＋`ListStateFailure`（失敗狀態本體，LoadingScreen 共用） |
| `F:\vsms\vsms-export\src\__tests__\listState.test.tsx` | 新增 | 五種情況、有資料時的錯誤提示、按鈕與 role |
| `F:\vsms\vsms-export\src\components\shared\LoadingScreen.tsx` | 修改 | 新增選用 props `error?: string`、`onRetry?: () => void` |
| `F:\vsms\vsms-export\src\components\ProtectedLayout.tsx` | 修改 | 初始化失敗記錄錯誤、顯示全頁失敗狀態、重試 |
| `F:\vsms\vsms-export\src\__tests__\protectedLayout-initError.test.tsx` | 新增 | 初始化失敗／重試／LoadingScreen 其他呼叫點不變 |
| `F:\vsms\vsms-export\src\components\settings\PeopleManager.tsx` | 修改 | 記錄 `usersError`，人員清單外包 `ListState` |
| `F:\vsms\vsms-export\src\__tests__\peopleManager-usersError.test.tsx` | 新增 | 讀帳號失敗時提示在名冊上方、名冊仍在、重試 |
| `F:\vsms\vsms-export\src\components\schedule\GanttChart.tsx` | 修改 | 工程師視角篩選後沒結果改用 `ListState`；傳 `onFilterChange` 給列表 |
| `F:\vsms\vsms-export\src\components\schedule\ScheduleListView.tsx` | 修改 | 新增 `onFilterChange` prop，篩選後沒結果改用 `ListState` |
| `F:\vsms\vsms-export\src\__tests__\schedule-filteredEmpty.test.tsx` | 新增 | 甘特圖與列表的「清除篩選」 |

Task 2～4 都依賴 Task 1 的 `ListState.tsx`；Task 2～4 彼此獨立。

---

### Task 1: `ListState` 共用元件

**Files:**
- Create: `F:\vsms\vsms-export\src\components\shared\ListState.tsx`
- Test: `F:\vsms\vsms-export\src\__tests__\listState.test.tsx`

**Interfaces:**
- Produces（Task 2～4 會用）：
  ```ts
  export interface ListStateProps {
    noun: string; loading: boolean; error?: string | null; count: number
    filtered?: boolean; onClearFilters?: () => void; clearLabel?: string
    onRetry?: () => void; emptyAction?: ReactNode; compact?: boolean; children: ReactNode
  }
  export function ListState(props: ListStateProps): JSX.Element
  export function ListStateFailure(props: { title: string; message?: string | null; onRetry?: () => void; compact?: boolean }): JSX.Element
  ```
  `ListStateFailure` 的根元素是 `role="alert"`；有 `message`（非空字串）才顯示小字；有 `onRetry` 才顯示「重試」按鈕。

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\listState.test.tsx`：

```tsx
// src/__tests__/listState.test.tsx
// ListState：列表區塊的載入／空／篩選後沒結果／失敗（UI 統一第 3 項 E）。
// 判斷順序寫死在元件裡，這裡把五種情況與「有資料時的錯誤提示」逐一釘住。
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListState } from '../components/shared/ListState'

const rows = <ul><li>PDN-260001</li></ul>

describe('ListState', () => {
  it('1. 有資料：只顯示資料，沒有狀態區塊', () => {
    render(<ListState noun="排程" loading={false} count={1}>{rows}</ListState>)
    expect(screen.getByText('PDN-260001')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('1. 有資料且 loading：照常顯示資料，不顯示「載入中…」', () => {
    render(<ListState noun="排程" loading count={1}>{rows}</ListState>)
    expect(screen.getByText('PDN-260001')).toBeInTheDocument()
    expect(screen.queryByText('載入中…')).toBeNull()
  })

  it('1. 有資料且有錯誤：資料仍在，錯誤提示在資料上方，重試會呼叫 onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<ListState noun="帳號" loading={false} error="HTTP 500" count={3} onRetry={onRetry}>{rows}</ListState>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入帳號')
    expect(alert).toHaveTextContent('HTTP 500')
    const data = screen.getByText('PDN-260001')
    expect(alert.compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('1. 有資料且有錯誤、沒給 onRetry：沒有重試按鈕', () => {
    render(<ListState noun="帳號" loading={false} error="HTTP 500" count={3}>{rows}</ListState>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull()
  })

  it('2. 沒有資料且失敗：只顯示失敗狀態，就算同時 loading、filtered 也一樣', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ListState noun="排程" loading filtered error="HTTP 503" count={0} onRetry={onRetry} onClearFilters={vi.fn()}>
        {rows}
      </ListState>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程')
    expect(alert).toHaveTextContent('HTTP 503')
    expect(screen.queryByText('載入中…')).toBeNull()
    expect(screen.queryByText(/沒有符合條件的/)).toBeNull()
    expect(screen.queryByText(/目前沒有/)).toBeNull()
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
    expect(screen.queryByText('PDN-260001')).toBeNull()

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('2. 錯誤訊息是空字串：仍是失敗狀態，只是沒有小字', () => {
    render(<ListState noun="排程" loading={false} error="" count={0}>{rows}</ListState>)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程')
    expect(alert.querySelectorAll('p')).toHaveLength(1)
  })

  it('3. 沒有資料且 loading：只顯示「載入中…」', () => {
    render(<ListState noun="排程" loading filtered count={0} onClearFilters={vi.fn()}>{rows}</ListState>)
    expect(screen.getByRole('status')).toHaveTextContent('載入中…')
    expect(screen.queryByText(/沒有符合條件的/)).toBeNull()
    expect(screen.queryByText(/目前沒有/)).toBeNull()
    expect(screen.queryByText('PDN-260001')).toBeNull()
  })

  it('4. 篩選後沒結果：顯示「沒有符合條件的…」，清除按鈕會呼叫 onClearFilters', async () => {
    const onClearFilters = vi.fn()
    const user = userEvent.setup()
    render(<ListState noun="排程" loading={false} filtered count={0} onClearFilters={onClearFilters}>{rows}</ListState>)
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')
    await user.click(screen.getByRole('button', { name: '清除篩選' }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('4. clearLabel 可以換成「清除搜尋」', () => {
    render(
      <ListState noun="排程" loading={false} filtered count={0} onClearFilters={vi.fn()} clearLabel="清除搜尋">
        {rows}
      </ListState>,
    )
    expect(screen.getByRole('button', { name: '清除搜尋' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
  })

  it('4. 沒給 onClearFilters：沒有清除按鈕', () => {
    render(<ListState noun="排程" loading={false} filtered count={0}>{rows}</ListState>)
    expect(screen.getByText('沒有符合條件的排程')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('5. 真的沒有：顯示「目前沒有…」與 emptyAction', () => {
    render(
      <ListState noun="排程" loading={false} count={0} emptyAction={<button type="button">新增排程</button>}>
        {rows}
      </ListState>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('目前沒有排程')
    expect(screen.getByRole('button', { name: '新增排程' })).toBeInTheDocument()
    expect(screen.queryByText('PDN-260001')).toBeNull()
  })

  it('沒有資料時不顯示重試按鈕，除非有錯誤', () => {
    render(<ListState noun="排程" loading={false} count={0} onRetry={vi.fn()}>{rows}</ListState>)
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/__tests__/listState.test.tsx`（在 `F:\vsms\vsms-export`）
Expected: FAIL，訊息是找不到 `../components/shared/ListState`（Failed to resolve import）。

- [ ] **Step 3: 實作元件**

建立 `F:\vsms\vsms-export\src\components\shared\ListState.tsx`：

```tsx
// src/components/shared/ListState.tsx
// 列表區塊的「載入中／沒有資料／篩選後沒結果／讀取失敗」（UI 統一第 3 項 E）。
//
// 判斷順序寫死在這裡，呼叫端只提供事實（loading、error、count、filtered），不自己
// 排先後。以前各處自己排，才會出現「還在讀、或讀取失敗，畫面卻顯示沒有資料」。
//
// 錯誤通知方式不在這裡統一：VSMS 照舊用 toast，這個元件只管列表區塊本身顯示什麼。
import type { ReactNode } from 'react'

export interface ListStateProps {
  /** 名詞，例如「排程」。 */
  noun: string
  /** 正在讀取（包含「還沒讀過」）。 */
  loading: boolean
  /** 讀取失敗的訊息；沒有錯誤時為 null 或 undefined。 */
  error?: string | null
  /** 目前可顯示的筆數（已套用篩選）。 */
  count: number
  /** 是否有篩選或搜尋條件在作用（決定「目前沒有」或「沒有符合條件的」）。 */
  filtered?: boolean
  /** 有提供才顯示「清除篩選」按鈕。 */
  onClearFilters?: () => void
  /** 清除按鈕的文字，預設「清除篩選」。 */
  clearLabel?: string
  /** 有提供才顯示「重試」按鈕。 */
  onRetry?: () => void
  /** 「目前沒有」時的下一步動作（例如新增按鈕）。 */
  emptyAction?: ReactNode
  compact?: boolean
  /** count > 0 時顯示的內容。 */
  children: ReactNode
}

/** VSMS 次要按鈕（與工具列的「更多」同一組框線與底色） */
const BUTTON = 'border border-slate-300 bg-white text-slate-600 rounded-md text-xs px-3 py-1.5 hover:bg-slate-50 transition-colors'

function boxClass(compact?: boolean): string {
  return `flex flex-col items-center justify-center text-center ${compact ? 'px-3 py-4' : 'p-10'}`
}

function titleClass(compact?: boolean): string {
  return `${compact ? 'text-sm' : 'text-base'} font-medium`
}

interface FailureProps {
  title: string
  /** 原始錯誤訊息；空字串或沒有時不顯示小字。 */
  message?: string | null
  onRetry?: () => void
  compact?: boolean
}

/**
 * 失敗狀態本體。ListState 的第 2 種情況與 LoadingScreen 的全頁失敗畫面共用
 * 這一份，兩處的外觀才會一致。
 */
export function ListStateFailure({ title, message, onRetry, compact }: FailureProps) {
  return (
    <div role="alert" className={boxClass(compact)}>
      <p className={`${titleClass(compact)} text-red-700`}>{title}</p>
      {message && <p className="mt-1 max-w-md break-words text-xs text-gray-500">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${compact ? 'mt-2' : 'mt-3'} ${BUTTON}`}>
          重試
        </button>
      )}
    </div>
  )
}

export function ListState({
  noun, loading, error, count, filtered, onClearFilters, clearLabel = '清除篩選',
  onRetry, emptyAction, compact, children,
}: ListStateProps) {
  const failed = error !== null && error !== undefined

  // 1. 有資料：一律顯示資料。loading 時照常顯示（重新整理不閃爍）；重新整理失敗
  //    時在資料上方加一條錯誤提示，不藏掉已經有的資料。
  if (count > 0) {
    if (!failed) return <>{children}</>
    return (
      <>
        <div role="alert"
          className="mb-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-700">無法載入{noun}</p>
            {error && <p className="mt-0.5 break-words text-xs text-gray-500">{error}</p>}
          </div>
          {onRetry && (
            <button type="button" onClick={onRetry} className={`shrink-0 ${BUTTON}`}>重試</button>
          )}
        </div>
        {children}
      </>
    )
  }

  // 2. 沒有資料且讀取失敗：只顯示失敗狀態。
  if (failed) {
    return <ListStateFailure title={`無法載入${noun}`} message={error} onRetry={onRetry} compact={compact} />
  }

  // 3. 沒有資料且還在讀：只顯示「載入中…」。
  if (loading) {
    return (
      <div role="status" className={boxClass(compact)}>
        <p className="text-sm text-gray-500">載入中…</p>
      </div>
    )
  }

  // 4. 篩選後沒結果。
  if (filtered) {
    return (
      <div role="status" className={boxClass(compact)}>
        <p className={`${titleClass(compact)} text-gray-600`}>沒有符合條件的{noun}</p>
        {onClearFilters && (
          <button type="button" onClick={onClearFilters} className={`${compact ? 'mt-2' : 'mt-3'} ${BUTTON}`}>
            {clearLabel}
          </button>
        )}
      </div>
    )
  }

  // 5. 真的沒有。
  return (
    <div role="status" className={boxClass(compact)}>
      <p className={`${titleClass(compact)} text-gray-600`}>目前沒有{noun}</p>
      {emptyAction && <div className={compact ? 'mt-2' : 'mt-3'}>{emptyAction}</div>}
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/__tests__/listState.test.tsx`
Expected: PASS，12 tests。

- [ ] **Step 5: 全套測試與型別檢查**

Run: `npm test`
Expected: 全部通過，0 failed。

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: 沒有輸出、exit 0。

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export
git add src/components/shared/ListState.tsx src/__tests__/listState.test.tsx
git commit -m "$(cat <<'EOF'
feat(shared): ListState decides loading / empty / filtered-empty / error for list blocks

One component owns the precedence (data > error > loading > filtered > empty) so
pages stop showing "no data" while a list is still loading or failed to load.
ListStateFailure is exported for the full-page LoadingScreen error state.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 登入後初始化失敗（`LoadingScreen` 新 props＋`ProtectedLayout`）

規格修正清單第 5 項：`Promise.all([initSchedules(), initOptions()])` 失敗時只 `console.error`，畫面永遠停在「載入資料中…」。改為記錄失敗，顯示全頁失敗狀態「無法載入排程資料」＋錯誤小字＋「重試」；重試清掉錯誤、重設 `initRef` 後再跑一次同一個初始化。`LoadingScreen` 的其他 3 個呼叫點（`src/App.tsx` 的「連線中…」「以訪客身分進入…」「導向入口頁…」）不傳新 props，行為不變。

**Files:**
- Modify: `F:\vsms\vsms-export\src\components\shared\LoadingScreen.tsx`（整份替換，原本 11 行）
- Modify: `F:\vsms\vsms-export\src\components\ProtectedLayout.tsx`（整份替換，原本 38 行）
- Test: `F:\vsms\vsms-export\src\__tests__\protectedLayout-initError.test.tsx`

**Interfaces:**
- Consumes：Task 1 的 `ListStateFailure`（`import { ListStateFailure } from './ListState'`）。
- Produces：`LoadingScreen({ text, error?, onRetry? })`。`error !== undefined` 時不轉圈，以 `text` 當失敗標題、`error` 當小字；`ProtectedLayout` 失敗時傳 `text="無法載入排程資料"`。

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\protectedLayout-initError.test.tsx`：

```tsx
// src/__tests__/protectedLayout-initError.test.tsx
// 登入後初始化（排程＋選項）失敗時，畫面要顯示失敗狀態與重試，不能永遠停在
// 「載入資料中…」（UI 統一第 3 項 E，規格修正清單第 5 項）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProtectedLayout } from '../components/ProtectedLayout'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { useAuthStore } from '../store/authStore'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'

const originalScheduleInit = useScheduleStore.getState().init
const originalOptionsInit = useOptionsStore.getState().init
const scheduleInit = vi.fn<() => Promise<void>>()
const optionsInit = vi.fn<() => Promise<void>>()

beforeEach(() => {
  scheduleInit.mockReset()
  optionsInit.mockReset()
  optionsInit.mockResolvedValue(undefined)
  useScheduleStore.setState({ init: scheduleInit })
  useOptionsStore.setState({ init: optionsInit })
  useAuthStore.setState({ isLoggedIn: true })
  // ProtectedLayout 失敗時仍會 console.error，測試輸出不要被洗版
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  useScheduleStore.setState({ init: originalScheduleInit })
  useOptionsStore.setState({ init: originalOptionsInit })
  vi.restoreAllMocks()
})

function renderLayout() {
  return render(<ProtectedLayout><p>主畫面</p></ProtectedLayout>)
}

describe('ProtectedLayout 初始化', () => {
  it('讀取中：顯示「載入資料中…」', () => {
    scheduleInit.mockReturnValue(new Promise<void>(() => {}))
    renderLayout()
    expect(screen.getByText('載入資料中…')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('成功：直接進入頁面', async () => {
    scheduleInit.mockResolvedValue(undefined)
    renderLayout()
    expect(await screen.findByText('主畫面')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('失敗：顯示「無法載入排程資料」與錯誤小字，不再停在載入中', async () => {
    scheduleInit.mockRejectedValue(new Error('HTTP 503'))
    renderLayout()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程資料')
    expect(alert).toHaveTextContent('HTTP 503')
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
    expect(screen.queryByText('載入資料中…')).toBeNull()
    expect(screen.queryByText('主畫面')).toBeNull()
  })

  it('按重試：重新跑同一個初始化，成功後進入頁面', async () => {
    scheduleInit
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    renderLayout()

    await user.click(await screen.findByRole('button', { name: '重試' }))

    expect(await screen.findByText('主畫面')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(scheduleInit).toHaveBeenCalledTimes(2)
    expect(optionsInit).toHaveBeenCalledTimes(2)
  })

  it('重試又失敗：仍是失敗狀態，顯示新的錯誤訊息', async () => {
    scheduleInit
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockRejectedValueOnce(new Error('HTTP 504'))
    const user = userEvent.setup()
    renderLayout()

    await user.click(await screen.findByRole('button', { name: '重試' }))

    expect(await screen.findByText('HTTP 504')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('無法載入排程資料')
    expect(scheduleInit).toHaveBeenCalledTimes(2)
  })
})

describe('LoadingScreen', () => {
  it('沒傳 error：維持原本的轉圈＋文字，沒有失敗狀態', () => {
    render(<LoadingScreen text="連線中…" />)
    expect(screen.getByText('連線中…')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('傳 error：標題用 text，錯誤放小字，有重試', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<LoadingScreen text="無法載入排程資料" error="HTTP 503" onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程資料')
    expect(alert).toHaveTextContent('HTTP 503')
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
```

說明：`ProtectedLayout` 是用 `useScheduleStore.getState().init`／`useOptionsStore.getState().init` 取初始化函式，所以測試用 `setState({ init: vi.fn() })` 換掉即可，不需要 mock `api`；`afterEach` 把原本的 `init` 放回去，避免污染其他測試檔共用的 store。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/__tests__/protectedLayout-initError.test.tsx`
Expected: FAIL。「讀取中」「成功」「沒傳 error」三項通過；「失敗」「按重試」「重試又失敗」三項因為 `findByRole('alert')`／`findByRole('button', { name: '重試' })` 找不到而逾時失敗；「傳 error」因為沒有 `role="alert"` 失敗。

- [ ] **Step 3: 改 `LoadingScreen`**

把 `F:\vsms\vsms-export\src\components\shared\LoadingScreen.tsx` 整份換成：

```tsx
import { ListStateFailure } from './ListState'

interface Props {
  text: string
  /** 有值（包含空字串）時不轉圈，改顯示失敗狀態：標題用 text，錯誤訊息放小字。 */
  error?: string
  /** 失敗狀態的「重試」；沒給就不顯示按鈕。 */
  onRetry?: () => void
}

/** 全頁載入畫面：spinner + 說明文字；傳入 error 時改為全頁失敗狀態 */
export function LoadingScreen({ text, error, onRetry }: Props) {
  if (error !== undefined) {
    return (
      <div className="h-screen flex flex-col items-center justify-center app-ground">
        <ListStateFailure title={text} message={error} onRetry={onRetry} />
      </div>
    )
  }
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 app-ground">
      <div className="w-8 h-8 rounded-full border-[3px] border-slate-300 border-t-blue-500 animate-spin" />
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  )
}
```

- [ ] **Step 4: 改 `ProtectedLayout`**

把 `F:\vsms\vsms-export\src\components\ProtectedLayout.tsx` 整份換成：

```tsx
// src/components/ProtectedLayout.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'
import { LoadingScreen } from './shared/LoadingScreen'

interface Props { children: React.ReactNode }

export function ProtectedLayout({ children }: Props) {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const [ready, setReady] = useState(false)
  // 初始化失敗的訊息。以前失敗只 console.error，畫面會永遠停在「載入資料中…」。
  const [initError, setInitError] = useState<string | null>(null)
  const initRef = useRef(false)

  const runInit = useCallback(() => {
    if (initRef.current) return
    initRef.current = true
    setInitError(null)

    const initSchedules = useScheduleStore.getState().init
    const initOptions = useOptionsStore.getState().init

    Promise.all([initSchedules(), initOptions()])
      .then(() => setReady(true))
      .catch(err => {
        console.error('Init failed:', err)
        initRef.current = false
        setInitError(err instanceof Error ? err.message : String(err))
      })
  }, [])

  useEffect(() => {
    if (!isLoggedIn) {
      initRef.current = false
      setReady(false)
      setInitError(null)
      return
    }
    runInit()
  }, [isLoggedIn, runInit])

  const retry = () => {
    initRef.current = false
    runInit()
  }

  if (!isLoggedIn) return null
  if (!ready) {
    return initError !== null
      ? <LoadingScreen text="無法載入排程資料" error={initError} onRetry={retry} />
      : <LoadingScreen text="載入資料中…" />
  }
  return <>{children}</>
}
```

重點：
- 初始化抽成 `runInit`（`useCallback`，無依賴），`useEffect` 與「重試」共用同一個函式，重試跑的就是同一個初始化。
- `runInit` 一開始 `setInitError(null)`，所以按下重試後畫面先回到「載入資料中…」轉圈，失敗才再顯示失敗狀態。
- 失敗時照舊 `console.error` 並把 `initRef.current` 設回 `false`；登出（`isLoggedIn` 變 false）時一併清掉 `initError`。
- `err` 不是 `Error` 時用 `String(err)`，確保傳給 `LoadingScreen` 的一定是字串（空字串也會顯示失敗狀態，只是沒有小字）。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/__tests__/protectedLayout-initError.test.tsx`
Expected: PASS，7 tests。

- [ ] **Step 6: 全套測試與型別檢查**

Run: `npm test`
Expected: 全部通過，0 failed（`app-vauth-gate.test.tsx` 仍過：它只用到 `LoadingScreen` 的舊用法）。

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: 沒有輸出、exit 0。

- [ ] **Step 7: Commit**

```bash
cd /f/vsms/vsms-export
git add src/components/shared/LoadingScreen.tsx src/components/ProtectedLayout.tsx src/__tests__/protectedLayout-initError.test.tsx
git commit -m "$(cat <<'EOF'
fix(layout): show a retryable error screen when post-login init fails

ProtectedLayout used to console.error and leave the "loading data" spinner up
forever. It now keeps the error, and LoadingScreen gains optional error/onRetry
props to show "無法載入排程資料" with the message and a retry that reruns the
same init. The other LoadingScreen call sites are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 人員管理讀帳號失敗（`PeopleManager`）

規格修正清單第 6 項：`api.getUsers()` 失敗只 toast，名冊照常從 options 畫出來，但所有人都像「沒有帳號」。改為記錄 `usersError`，在人員清單上方顯示「無法載入帳號」＋「重試」（`ListState` 第 1 種情況）。toast 保留。

**Files:**
- Modify: `F:\vsms\vsms-export\src\components\settings\PeopleManager.tsx`（import 區約 18 行、state 約 40 行、`loadUsers` 約 46–50 行、`inactiveCount` 約 54 行、上方清單約 186–190 行）
- Test: `F:\vsms\vsms-export\src\__tests__\peopleManager-usersError.test.tsx`

**Interfaces:**
- Consumes：Task 1 的 `ListState`（`import { ListState } from '../shared/ListState'`）。
- Produces：無（元件對外介面不變）。

`count` 的決定：上方清單畫出來的是卡片（每個測試單位歸入的部門卡，加上有「只有帳號的人」時的未歸屬卡），所以 `count` = 部門卡數＋未歸屬卡（0 或 1）。`buildPeopleModel` 對每個測試單位都會產生一個 group（即使該單位沒有人），所以只要有測試單位，count 就 > 0，卡片裡的「新增人員」輸入框不會被空狀態藏掉。`loading` 期間元件照舊提早 return「載入中...」（這一行不在本次範圍）。「已停用」區塊不包進 `ListState`。

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\peopleManager-usersError.test.tsx`：

```tsx
// src/__tests__/peopleManager-usersError.test.tsx
// 人員頁讀帳號失敗：名冊（來自 options）照常顯示，但上方要有「無法載入帳號」＋重試，
// 不能只靠會消失的 toast——toast 一走，每個人看起來都像「沒有帳號」
// （UI 統一第 3 項 E，規格修正清單第 6 項）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useOptionsStore } from '../store/optionsStore'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import type { OptionsMap } from '../types'

const apiMock = vi.hoisted(() => ({ getUsers: vi.fn() }))
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, ...apiMock } }
})

import { PeopleManager } from '../components/settings/PeopleManager'

const options: OptionsMap = {
  testUnits: [{
    id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: null,
    engineers: [{ id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null }],
  }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

beforeEach(() => {
  apiMock.getUsers.mockReset()
  useOptionsStore.setState({ options })
  useAuthStore.setState({ authProvider: 'local' })
  useToastStore.getState().clear()
})

describe('PeopleManager 讀帳號失敗', () => {
  it('上方顯示「無法載入帳號」＋錯誤小字＋重試，名冊仍在，toast 保留', async () => {
    apiMock.getUsers.mockRejectedValue(new Error('資料庫連線逾時'))
    render(<PeopleManager />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('無法載入帳號')
    expect(alert).toHaveTextContent('資料庫連線逾時')
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()

    // 名冊照常畫出來，而且在提示的下方
    const row = screen.getByText('Rock_Cai')
    expect(alert.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(useToastStore.getState().toasts.map(t => t.text)).toContain('載入帳號列表失敗')
  })

  it('按重試：重新讀帳號，成功後提示消失', async () => {
    apiMock.getUsers
      .mockRejectedValueOnce(new Error('資料庫連線逾時'))
      .mockResolvedValueOnce([])
    const user = userEvent.setup()
    render(<PeopleManager />)

    await user.click(await screen.findByRole('button', { name: '重試' }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(apiMock.getUsers).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Rock_Cai')).toBeInTheDocument()
  })

  it('讀取成功：沒有失敗提示', async () => {
    apiMock.getUsers.mockResolvedValue([])
    render(<PeopleManager />)
    expect(await screen.findByText('Rock_Cai')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/__tests__/peopleManager-usersError.test.tsx`
Expected: FAIL。前兩項因為 `findByRole('alert')`／`findByRole('button', { name: '重試' })` 找不到而逾時；「讀取成功」一項通過。

- [ ] **Step 3: 加 import**

在 `F:\vsms\vsms-export\src\components\settings\PeopleManager.tsx` 找到：

```tsx
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { PersonRow, PEOPLE_GRID } from './PersonRow'
```

換成：

```tsx
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { ListState } from '../shared/ListState'
import { PersonRow, PEOPLE_GRID } from './PersonRow'
```

- [ ] **Step 4: 加 `usersError` state，`loadUsers` 記錄錯誤**

找到：

```tsx
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<{ name: string; mode: 'edit' | 'create-account' } | null>(null)
```

換成：

```tsx
  const [loading, setLoading] = useState(true)
  // 讀帳號失敗的訊息。名冊來自 options，照常畫得出來，但每個人都會像「沒有帳號」，
  // 所以除了 toast 之外還要在清單上方留一條看得到的提示。
  const [usersError, setUsersError] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; mode: 'edit' | 'create-account' } | null>(null)
```

找到：

```tsx
  const loadUsers = async () => {
    try { setUsers(await api.getUsers()) }
    catch { toast.error('載入帳號列表失敗') }
    finally { setLoading(false) }
  }
```

換成：

```tsx
  const loadUsers = async () => {
    try {
      setUsers(await api.getUsers())
      setUsersError(null)
    } catch (e) {
      toast.error('載入帳號列表失敗')
      setUsersError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }
```

（`loadUsers` 也在停用／啟用、表單儲存後被呼叫；那些時候重讀失敗同樣會出現提示，成功就清掉，這是預期行為。）

- [ ] **Step 5: 算出上方清單的卡片數**

找到：

```tsx
  const inactiveCount = model.inactive.reduce((n, g) => n + g.people.length, 0)
```

換成：

```tsx
  const inactiveCount = model.inactive.reduce((n, g) => n + g.people.length, 0)
  const activeDepts = groupByDepartment(model.active, options.testUnits)
  /** 上方清單會畫出幾張卡片（部門卡＋未歸屬卡），給 ListState 判斷「有沒有資料」 */
  const activeCardCount = activeDepts.length + (model.unassigned.length > 0 ? 1 : 0)
```

- [ ] **Step 6: 上方清單外包 `ListState`**

找到：

```tsx
      {header}
      <div className="space-y-4">
        {groupByDepartment(model.active, options.testUnits).map(d => deptCard(d, 'active'))}
        {model.unassigned.length > 0 && groupCard({ unitId: null, unitLabel: UNASSIGNED_LABEL, people: model.unassigned }, 'active')}
      </div>
```

換成：

```tsx
      <ListState noun="帳號" loading={loading} error={usersError} count={activeCardCount}
        onRetry={() => { void loadUsers() }}>
        {header}
        <div className="space-y-4">
          {activeDepts.map(d => deptCard(d, 'active'))}
          {model.unassigned.length > 0 && groupCard({ unitId: null, unitLabel: UNASSIGNED_LABEL, people: model.unassigned }, 'active')}
        </div>
      </ListState>
```

- [ ] **Step 7: 跑測試確認通過**

Run: `npx vitest run src/__tests__/peopleManager-usersError.test.tsx`
Expected: PASS，3 tests。

- [ ] **Step 8: 全套測試與型別檢查**

Run: `npm test`
Expected: 全部通過，0 failed。

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: 沒有輸出、exit 0。

- [ ] **Step 9: Commit**

```bash
cd /f/vsms/vsms-export
git add src/components/settings/PeopleManager.tsx src/__tests__/peopleManager-usersError.test.tsx
git commit -m "$(cat <<'EOF'
fix(settings): keep a retry banner above the roster when loading accounts fails

The roster comes from options and still renders, but without accounts everyone
looked account-less once the toast faded. PeopleManager now records usersError
and wraps the active list in ListState, which shows "無法載入帳號" with the
message and a retry above the data. The toast stays.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 甘特圖與列表「篩選後沒結果」（`GanttChart`＋`ScheduleListView`）

規格修正清單第 7 項：甘特圖工程師視角（`GanttChart.tsx` 約 758–759 行）與列表（`ScheduleListView.tsx` 約 84–86 行）的「無符合篩選條件的排程」改用 `ListState`（名詞「排程」，`filtered`），「清除篩選」呼叫 `onFilterChange(EMPTY_FILTER)`，與條件列既有的「清除全部」一致（`FilterSortBar.tsx` 約 362 行 `onChange(EMPTY_FILTER)`）。`ScheduleListView` 原本拿不到 `onFilterChange`，由 `GanttChart` 傳入它的 `setFilterSort`。「全無排程」那一版（約 495–525 行）不動。

兩個檔案要同一個 commit：`ScheduleListView` 新增的是必填 prop，只改一邊型別檢查會壞。

**Files:**
- Modify: `F:\vsms\vsms-export\src\components\schedule\ScheduleListView.tsx`（import 約 10–11 行、`Props` 約 29–37 行、參數約 44–46 行、空狀態約 84–86 行）
- Modify: `F:\vsms\vsms-export\src\components\schedule\GanttChart.tsx`（import 約 16–18 行、`<ScheduleListView>` 約 592–600 行、工程師視角空狀態約 758–759 行）
- Test: `F:\vsms\vsms-export\src\__tests__\schedule-filteredEmpty.test.tsx`

**Interfaces:**
- Consumes：Task 1 的 `ListState`；既有的 `EMPTY_FILTER: FilterSortState` 與 `type FilterSortState`（`./FilterSortBar` 已匯出）。
- Produces：`ScheduleListView` 的 `Props` 新增必填 `onFilterChange: (v: FilterSortState) => void`。唯一呼叫點是 `GanttChart`。

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\schedule-filteredEmpty.test.tsx`：

```tsx
// src/__tests__/schedule-filteredEmpty.test.tsx
// 甘特圖與列表「篩選後沒結果」改用 ListState：顯示「沒有符合條件的排程」＋「清除篩選」，
// 按下去等於條件列的「清除全部」——onFilterChange(EMPTY_FILTER)
// （UI 統一第 3 項 E，規格修正清單第 7 項）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'
import { useAuthStore } from '../store/authStore'
import { GanttChart } from '../components/schedule/GanttChart'
import ScheduleListView from '../components/schedule/ScheduleListView'
import { EMPTY_FILTER } from '../components/schedule/FilterSortBar'
import type { OptionsMap, Schedule } from '../types'

const options: OptionsMap = {
  testUnits: [{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, department: 'SIT', engineers: [] }],
  categories: [],
  restDays: { weekends: false, specificDates: [] },
  devices: [],
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// 已完成的排程：預設篩選（DEFAULT_FILTER）隱藏 Completed，所以一進畫面就是
// 「有排程、但篩選後 0 筆」；清除篩選（EMPTY_FILTER 不限狀態）之後會出現。
const completed: Schedule = {
  id: 's1', category: 'NPI', projectName: 'PDN-260001', taskDescription: '',
  testUnit: 'SIT-HW', testEngineer: 'Rock_Cai', timeResource: 1,
  startDate: todayYmd(), endDate: todayYmd(),
  requiredPersonnel: '', testReport: '',
  isCompleted: true, isDelayed: false, isCancelled: false, completedAt: null, delayReason: '',
  createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
  adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
}

beforeEach(() => {
  localStorage.clear()
  useScheduleStore.setState({ schedules: [completed] })
  useOptionsStore.setState({ options })
  useAuthStore.setState({ role: 'admin', linkedEngineer: '', canViewVtmsProgress: false })
})

function renderGantt() {
  const user = userEvent.setup()
  render(
    <GanttChart showAddModal={false} onAddSchedule={vi.fn()} onCloseAddModal={vi.fn()}
      filterCollapsed onToggleFilter={vi.fn()} />,
  )
  return { user }
}

describe('甘特圖篩選後沒結果', () => {
  it('顯示「沒有符合條件的排程」＋清除篩選；按下後排程出現', async () => {
    const { user } = renderGantt()
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')
    expect(screen.queryByText('無符合篩選條件的排程')).toBeNull()

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.queryByText('沒有符合條件的排程')).toBeNull()
    expect(screen.getByTitle('PDN-260001')).toBeInTheDocument()
  })

  it('完全沒有排程時仍是原本的「尚無工作排程」，不是篩選後沒結果', () => {
    useScheduleStore.setState({ schedules: [] })
    renderGantt()
    expect(screen.getByText('尚無工作排程')).toBeInTheDocument()
    expect(screen.queryByText('沒有符合條件的排程')).toBeNull()
    expect(screen.queryByRole('button', { name: '清除篩選' })).toBeNull()
  })
})

describe('列表篩選後沒結果', () => {
  it('透過 GanttChart：清除篩選後列表出現排程', async () => {
    localStorage.setItem('vsms-main-view-mode', 'list')
    const { user } = renderGantt()
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.queryByText('沒有符合條件的排程')).toBeNull()
    expect(screen.getByTitle('PDN-260001')).toBeInTheDocument()
  })

  it('ScheduleListView 單獨 render：清除篩選呼叫 onFilterChange(EMPTY_FILTER)', async () => {
    const onFilterChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ScheduleListView schedules={[]} role="admin" linkedEngineer="" engLabel={v => v}
        options={options} onEdit={vi.fn()} onDelete={vi.fn()} onFilterChange={onFilterChange} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('沒有符合條件的排程')

    await user.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(onFilterChange).toHaveBeenCalledTimes(1)
    expect(onFilterChange).toHaveBeenCalledWith(EMPTY_FILTER)
  })

  it('ScheduleListView 有資料：照常顯示表格，沒有狀態區塊', () => {
    render(
      <ScheduleListView schedules={[completed]} role="admin" linkedEngineer="" engLabel={v => v}
        options={options} onEdit={vi.fn()} onDelete={vi.fn()} onFilterChange={vi.fn()} />,
    )
    expect(screen.getByTitle('PDN-260001')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
```

說明：`GanttChart` 預設篩選是 `DEFAULT_FILTER`（隱藏 Completed＋預設時間範圍），所以塞一筆今天、已完成的排程，一進畫面就是「有排程但篩選後 0 筆」。清除篩選後 `EMPTY_FILTER` 不限狀態、不限時間，排程會出現：甘特圖左欄與列表的 PDN 儲存格都帶 `title={projectName}`，所以用 `getByTitle('PDN-260001')` 驗證（已在 jsdom 實測兩種視圖都能 render）。`vsms-main-view-mode` 放在 localStorage，測試用它切到列表。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/__tests__/schedule-filteredEmpty.test.tsx`
Expected: FAIL。「甘特圖…按下後排程出現」「透過 GanttChart…」因為沒有 `role="status"` 失敗；「ScheduleListView 單獨 render」因為沒有「清除篩選」按鈕失敗。「尚無工作排程」與「有資料照常顯示表格」兩項通過。

- [ ] **Step 3: 改 `ScheduleListView`**

在 `F:\vsms\vsms-export\src\components\schedule\ScheduleListView.tsx` 找到：

```tsx
import { displayYmd } from '../../lib/dateFormat'
import type { Schedule, Role, OptionsMap } from '../../types'
```

換成：

```tsx
import { displayYmd } from '../../lib/dateFormat'
import { ListState } from '../shared/ListState'
import { EMPTY_FILTER, type FilterSortState } from './FilterSortBar'
import type { Schedule, Role, OptionsMap } from '../../types'
```

找到：

```tsx
  onEdit: (s: Schedule) => void
  onDelete: (s: Schedule) => void
}
```

換成：

```tsx
  onEdit: (s: Schedule) => void
  onDelete: (s: Schedule) => void
  /** 「清除篩選」用；與條件列的「清除全部」相同，傳入 EMPTY_FILTER */
  onFilterChange: (v: FilterSortState) => void
}
```

找到：

```tsx
  schedules, role, linkedEngineer, engLabel, options, onEdit, onDelete,
}: Props) {
```

換成：

```tsx
  schedules, role, linkedEngineer, engLabel, options, onEdit, onDelete, onFilterChange,
}: Props) {
```

找到：

```tsx
  if (schedules.length === 0) {
    return <div className="p-10 text-center text-gray-400 text-sm">無符合篩選條件的排程</div>
  }
```

換成：

```tsx
  // GanttChart 在「全無排程」時提早 return、不會掛載這個元件，所以 0 筆一定是
  // 篩選造成的。「清除篩選」與條件列的「清除全部」同一個動作。
  if (schedules.length === 0) {
    return (
      <ListState noun="排程" loading={false} count={0} filtered
        onClearFilters={() => onFilterChange(EMPTY_FILTER)}>
        {null}
      </ListState>
    )
  }
```

（`children` 傳 `{null}`：這裡只在 0 筆時用 `ListState`，有資料的表格照舊由下面的 return 負責，改動最小；`count={0}` 時 `ListState` 不會 render `children`。）

- [ ] **Step 4: 改 `GanttChart`**

在 `F:\vsms\vsms-export\src\components\schedule\GanttChart.tsx` 找到：

```tsx
import { FilterSortBar, DEFAULT_FILTER, DEFAULT_SORT_RULES } from './FilterSortBar'
import { ScheduleFormModal } from './ScheduleFormModal'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
```

換成：

```tsx
import { FilterSortBar, DEFAULT_FILTER, DEFAULT_SORT_RULES, EMPTY_FILTER } from './FilterSortBar'
import { ScheduleFormModal } from './ScheduleFormModal'
import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'
import { ListState } from '../shared/ListState'
```

找到（`<ScheduleListView` 那一段的結尾）：

```tsx
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
        />
```

換成：

```tsx
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
          onFilterChange={setFilterSort}
        />
```

找到（工程師視角）：

```tsx
        filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">無符合篩選條件的排程</div>
        ) : (
```

換成：

```tsx
        filtered.length === 0 ? (
          // 走到這裡代表 schedules 不是空的（全無排程的那一版在上面提早 return），
          // 所以 0 筆一定是篩選造成的。「清除篩選」與條件列的「清除全部」同一個動作。
          <ListState noun="排程" loading={false} count={0} filtered
            onClearFilters={() => setFilterSort(EMPTY_FILTER)}>
            {null}
          </ListState>
        ) : (
```

改完 grep 確認整個 `src` 已經沒有舊句子：

Run: `grep -rn "無符合篩選條件的排程" src`
Expected: 沒有輸出。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/__tests__/schedule-filteredEmpty.test.tsx`
Expected: PASS，5 tests。

- [ ] **Step 6: 全套測試與型別檢查**

Run: `npm test`
Expected: 全部通過，0 failed。

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: 沒有輸出、exit 0。

- [ ] **Step 7: Commit**

```bash
cd /f/vsms/vsms-export
git add src/components/schedule/ScheduleListView.tsx src/components/schedule/GanttChart.tsx src/__tests__/schedule-filteredEmpty.test.tsx
git commit -m "$(cat <<'EOF'
feat(schedule): filtered-empty gantt and list views offer a clear-filters button

Both "no schedules match the filters" states were plain text with no way out.
They now use ListState ("沒有符合條件的排程" + "清除篩選"), which calls
onFilterChange(EMPTY_FILTER) exactly like the filter bar's "清除全部".
GanttChart passes setFilterSort down to ScheduleListView for this.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## 部署（controller 執行，不派給 subagent）

### A. 改前截圖（在派 Task 1 之前拍）

harness 已在 repo 根目錄（`_dev-admin.html`、`_dev-admin.tsx`、`_dev-stub.ts`、`_dev-view.ts`、`_dev-fixtures/`，已列入 `.git/info/exclude`）。`F:\.claude\launch.json` 的 `vsms-harness` 起 vite `127.0.0.1:5175`。

1. 先在 harness 加兩個開關（只改 dev 檔案，不 commit）：
   - `F:\vsms\vsms-export\_dev-stub.ts`：找到
     ```ts
     const role = params.get('role') ?? 'super_admin'
     ```
     換成
     ```ts
     const role = params.get('role') ?? 'super_admin'
     // ?fail=init,users：模擬讀取失敗，拍失敗狀態用
     const fail = new Set((params.get('fail') ?? '').split(',').filter(Boolean))
     ```
     再找到
     ```ts
       if (path === '/schedules' && method === 'GET') return json(schedules)
     ```
     換成
     ```ts
       if (fail.has('init') && path === '/schedules' && method === 'GET') return json({ message: 'HTTP 503 Service Unavailable（harness 模擬）' }, 503)
       if (fail.has('users') && path === '/users' && method === 'GET') return json({ message: '資料庫連線逾時（harness 模擬）' }, 500)
       if (path === '/schedules' && method === 'GET') return json(schedules)
     ```
   - `F:\vsms\vsms-export\_dev-view.ts` 整份換成：
     ```ts
     // 臨時 harness：?view=settings 直接開設定頁、?tab=people 指定設定分頁（uiStore 持久化在 localStorage）。用完即刪。
     const q = new URLSearchParams(location.search)
     const v = q.get('view')
     if (v) localStorage.setItem('vsms-ui-state', JSON.stringify({ state: { view: v, filterCollapsed: true, settingsTab: q.get('tab') ?? 'categories', peopleInactiveOpen: false }, version: 0 }))
     ```
2. `preview_start` 名稱 `vsms-harness`，依序拍（1440 寬）：
   - 初始化失敗：`http://127.0.0.1:5175/_dev-admin.html?role=super_admin&fail=init`。改前：永遠轉圈「載入資料中…」。
   - 讀帳號失敗：`http://127.0.0.1:5175/_dev-admin.html?role=super_admin&view=settings&tab=people&fail=users`。改前：名冊在、帳號欄全空，只有一閃而過的 toast。
   - 甘特圖篩選後沒結果：`http://127.0.0.1:5175/_dev-admin.html?role=super_admin&view=main`，在條件列的搜尋框（`aria-label="搜尋排程"`）輸入 `zzz`。改前：純文字「無符合篩選條件的排程」。
   - 列表篩選後沒結果：同上，工具列「顯示方式」切到「列表」。改前：同一句純文字。
   - 切回「甘特圖」再離開（`vsms-main-view-mode` 存在 localStorage，會影響下一次開啟）。

### B. 改後截圖（Task 1～4 都 commit 之後）

同樣四個畫面再拍一次，預期：
- 初始化失敗：全頁置中紅字「無法載入排程資料」、小字「HTTP 503 Service Unavailable（harness 模擬）」、「重試」按鈕；按重試會先回到轉圈，因為 stub 仍失敗所以又回到失敗狀態（拿掉 `&fail=init` 重新整理則正常進入）。
- 讀帳號失敗：人員清單上方一條紅色提示「無法載入帳號」＋小字＋「重試」，名冊照常在下面。
- 甘特圖／列表：置中「沒有符合條件的排程」＋「清除篩選」；按下去搜尋框清空、條件列回到「清除全部」後的狀態、排程全部出現（包含已完成）。
- 另拍一張沒有 `fail` 的甘特圖首頁，確認正常畫面沒有任何變化。

把改前／改後並排給使用者看，**使用者同意後**才往下做。harness 的兩處修改保留（其他工作還在用這組 harness）。

### C. 建置與上線

1. 在 `F:\vsms\vsms-export` 確認工作樹乾淨、分支 `feat/guest-role-and-uiux`、四個 commit 都在：`git status --short`、`git log --oneline -5`。
2. 最後一次驗證：`npm test` 全過、`npx tsc -p tsconfig.app.json --noEmit` 0 錯。
3. 備份：`cp -r /f/vsms/vsms-export/dist /f/vsms/vsms-export/dist.stable-20260924-pre-3e`（若同名已存在就停下來問，不要覆蓋）。
4. 只跑 `npx vite build`（在 `F:\vsms\vsms-export`）。**不要**跑 `npm run build`，**不要** `pm2 restart vsms`：dist 由磁碟即時服務，前端修正只需 build。
5. 驗證正式站送出的 HTML 就是剛建出來的那份：
   ```bash
   curl -sk https://172.16.204.69/vsms/ | sha256sum
   sha256sum /f/vsms/vsms-export/dist/index.html
   ```
   兩個 hash 必須相同。再用瀏覽器開 `https://172.16.204.69/vsms/` 登入後確認甘特圖正常（正式站不做失敗模擬）。
6. master 快轉到 `feat/guest-role-and-uiux`（照往例部署時快轉）。推 GitHub **先問使用者**。
7. 更新畫布進度（3E VSMS → 已上線）與相關記憶。

**退版**：
```bash
rm -rf /f/vsms/vsms-export/dist
cp -r /f/vsms/vsms-export/dist.stable-20260924-pre-3e /f/vsms/vsms-export/dist
```
不需要重啟 vsms。退版後用第 5 步的 hash 比對確認正式站回到舊版。
