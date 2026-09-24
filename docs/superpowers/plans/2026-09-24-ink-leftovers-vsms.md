# VSMS 墨色框架與遺留問題（UI 統一收尾）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VSMS 的全域頂欄、左側欄與窄螢幕抽屜改成墨色框架（內容區維持淺色），並修掉窄螢幕「開啟選單」鈕與產品切換之間只有 10px 的問題。

**Architecture:** 共用 token 副本由 vportal 同步（Task 1 只 commit 副本）。框架不另畫元件：`src/index.css` 新增 `.vw-chrome` class，在頂欄 `<header>`、側欄 `#app-sidebar`、抽屜 `#app-nav-drawer` 的根元素上把 `--vw-surface`、`--vw-ink` 等一般 token 換成 `--vw-chrome-*`，元件照舊寫 `var(--vw-*)` 就整片變色。VSMS 頂欄目前大量用 Tailwind 的 `slate-*`／`blue-*`，而這幾條色階在 `index.css` 的 `@theme` 是 `:root` 上的變數（`--color-slate-600: var(--vw-text-secondary)`），在 `:root` 就已算成淺色值，`.vw-chrome` 換不掉，所以頂欄整份改寫成直接用 `var(--vw-*)`，並加一條測試禁止框架裡再出現這幾條色階。產品切換的負邊距改成只在它是第一個元素時才套。

**Tech Stack:** React 19、TypeScript 6、Tailwind v4（4.2.3，`@tailwindcss/vite`）、zustand 5、lucide-react 1.11；測試用 vitest 4.1（jsdom）＋ @testing-library/react 16 ＋ @testing-library/user-event 14。

**Spec:**
- `F:\vportal\docs\superpowers\specs\2026-09-24-ink-frame-design.md`：本計畫涵蓋「做法：框架 token」「框架範圍的 token 對應」「視覺規則」「各系統 › VSMS」，以及「測試」「上線」的 VSMS 部分。VTMS 深色 D2 只影響 `data-theme="dark"`，VSMS 不設這個屬性，不受影響（副本照樣同步）。
- `F:\vportal\docs\superpowers\specs\2026-09-24-leftovers-design.md`：本計畫涵蓋「已定案」項目 3（C）的 VSMS 部分。項目 1、2、4、5 與項目 3 的 VTMS／入口頁部分不在 VSMS。

## Global Constraints

- Repo `F:\vsms\vsms-export`，commit 在目前分支 `feat/guest-role-and-uiux`（起點是本計畫的 commit，前一筆 `3f896a2`；master 在推 GitHub 時才快轉，見部署 C8）。一律用絕對路徑（Bash 用 `/f/vsms/vsms-export/...`）；平行的 Bash 呼叫共用 cwd，每個指令都先 `cd /f/vsms/vsms-export &&`（F:\ 下有三個 repo，cwd 錯了 git 不會提醒）。
- Commit message 用英文，結尾一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **絕對不要**執行 `git restore`、`git checkout`（檔案或分支）、`git stash`、`git reset`、`git clean`，或任何會丟掉工作樹修改的指令。需要舊版內容時用 `git show HEAD:<path>`。只 `git add` 自己改的檔案，逐一列出路徑（不要 `git add .`／`-A`）。
- 不要跑 `npm run build`，不要 `npx vite build`，不要 `pm2`（任何子指令），不要部署。部署由 controller 依最後一節執行。
- 不要碰 repo 根目錄的 `_dev-*` 檔案與 `_dev-fixtures/`（harness，git 已排除，只有 controller 在部署段落會改）。
- **不得手改** `src/styles/workspace-tokens.css`（共用 token 副本，來源是 `F:\vportal\tokens\workspace-tokens.css`，由 vportal 的 `npm run check:tokens -- --write` 寫入）。
- 指令：
  - 前端全套測試：`npm test`（`vitest run`，只跑 `src/__tests__`）。起點基準：58 檔、484 條全過。判斷迴歸看 failures，總數只供參考。
  - 單檔測試：`npx vitest run src/__tests__/<file>`。
  - 型別檢查：`npx tsc -p tsconfig.app.json --noEmit`，必須 0 錯（`src/__tests__` 也在範圍內；`noUnusedLocals`／`noUnusedParameters` 開著，沒用到的參數用 `_` 開頭）。**測試不能用 Node API**（`node:fs` 等）：tsc 找不到 node 型別，測試綠但型別檢查壞。讀 CSS 原始字串用 `?raw` 匯入，而且 `vitest.config.ts` 要把該 CSS 檔放進 `test.css.include` 白名單（vitest 預設把 `?raw` 的 CSS 也清成空字串；Task 2 會加）。
- 測試絕不碰真的後端或資料庫：`fetch` 用 `vi.stubGlobal('fetch', fetchMock)`，store 用 zustand `setState` 塞狀態（照 `src/__tests__/topbar.test.tsx`、`sidebar-drawer.test.tsx`）。
- 行尾：工作樹 `core.autocrlf=true`。`src/index.css`、`vitest.config.ts` 在工作樹是 **CRLF**；`Topbar.tsx`、`Sidebar.tsx`、測試檔、token 副本是 LF。一律用 Edit 工具換片段（Edit 會保留原行尾），新檔用 Write。若用腳本改檔要處理 `\r\n`，改完 grep 驗證（這台機器的 `python` 是 Store 佔位程式，會靜默不改檔，要用 node）。
- 顏色一律用 token：框架上用 `--vw-chrome-*` 與 `--vw-accent-on-chrome`（經 `.vw-chrome` 對應後，元件寫 `var(--vw-surface)`、`var(--vw-ink)` 等一般 token 即可）。除了規格明列的 `--vw-accent-on-chrome`，**不新增 token**。框架範圍內（`<header>`、`#app-sidebar`、`#app-nav-drawer` 底下）**不得**用 Tailwind 的 `slate-*`／`gray-*`／`stone-*`／`blue-*` 色階 class（在 `:root` 就算好了，框架換不掉）。
- **框架 token 逐字值**（規格表格；淺色是 VSMS 會用到的一組）：

  | token | 淺色 | 深色（只有 VTMS 用） |
  |---|---|---|
  | `--vw-chrome-top` | `#17212E` | `#0A1018` |
  | `--vw-chrome-side` | `#1B2636` | `#0B121B` |
  | `--vw-chrome-border` | `#243042` | `#1A2433` |
  | `--vw-chrome-hover` | `#243042` | `#1A2433` |
  | `--vw-chrome-active` | `#2A3553` | `#1E2A3A` |
  | `--vw-chrome-text` | `#FFFFFF` | `#FFFFFF` |
  | `--vw-chrome-text-secondary` | `#B8C0CC` | `#B8C0CC` |
  | `--vw-chrome-text-muted` | `#8A95A6` | `#8A95A6` |

  深色 D2（副本裡會有，VSMS 不用）：`--vw-bg #0E1520`、`--vw-surface #17212E`、`--vw-surface-subtle #1E2A3A`、`--vw-border #263345`、`--vw-border-strong #34425A`。
- **VSMS 自己的框架值**：`--vw-accent-on-chrome: #5FC4B8`，定義在 `src/index.css` 的 `--vw-accent`（`#0E6B63`）旁邊。產品切換標誌方塊維持 `#0E6B63` 底與白勾；使用者頭像底 `--vw-accent-on-chrome`、字 `#17212E`。
- **`.vw-chrome` 的 token 對應**（規格逐字）：
  ```css
  --vw-surface: var(--vw-chrome-side);
  --vw-surface-subtle: var(--vw-chrome-hover);
  --vw-border: var(--vw-chrome-border);
  --vw-ink: var(--vw-chrome-text);
  --vw-text-secondary: var(--vw-chrome-text-secondary);
  --vw-text-muted: var(--vw-chrome-text-muted);
  --vw-accent-subtle: var(--vw-chrome-active);
  --vw-accent: var(--vw-accent-on-chrome);
  ```
- **視覺規則**（規格逐字）：頂欄背景 `--vw-chrome-top`、底線 1px `--vw-chrome-border`、不加陰影；側欄與抽屜背景 `--vw-chrome-side`、右邊線 1px `--vw-chrome-border`；項目一般 `--vw-chrome-text-secondary`，hover 底 `--vw-chrome-hover`、字 `--vw-chrome-text`；目前項目底 `--vw-chrome-active`、字 `--vw-chrome-text`、左側 `inset 3px 0 0 var(--vw-accent-on-chrome)`；頂欄系統連結一般 `--vw-chrome-text-secondary`、目前系統底 `--vw-chrome-active`、字 `--vw-chrome-text`；分組標題與收合鈕 `--vw-chrome-text-muted`（淡字不得放在目前項目的底上）；鈴鐺紅色徽章不變；焦點框（focus-visible）在框架上用 `--vw-accent-on-chrome`；收合時的行為、tooltip 不變。
- 下拉清單（產品切換、使用者選單，`MenuButton`）與對話框**不在**框架範圍內：`MenuButton` 的清單已 portal 到 `document.body`，維持白底，不需要還原規則。甘特圖全螢幕（`fixed inset-0 z-[100]`）照樣蓋過框架。
- **UI 文字**：本計畫不新增、不改任何 UI 文字與 aria 名稱。沿用的逐字名稱：`aria-label="開啟選單"`、`aria-label="切換系統"`、`aria-label="使用者選單"`、`<nav aria-label="主選單">`、`<nav aria-label="系統">`、「收合側欄」／「展開側欄」、`id="app-sidebar"`、`id="app-nav-drawer"`、`id="vsms-nav-menu-button"`。
- 範圍外：入口頁與 VTMS、下拉清單與對話框改深色、內容區配色、頂欄與側欄的版面尺寸（4A／4C 的數值不動）。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `F:\vsms\vsms-export\src\styles\workspace-tokens.css` | Commit（Task 1，內容由 vportal 寫入） | 共用 token 副本：新增 `--vw-chrome-*`、深色 D2 |
| `F:\vsms\vsms-export\src\index.css` | 修改（Task 2） | `--vw-accent-on-chrome`、`.vw-chrome` token 對應、框架焦點框 |
| `F:\vsms\vsms-export\src\components\layout\Topbar.tsx` | 整份改寫（Task 2）、改一段 className（Task 3） | `<header>` 掛 `.vw-chrome`、所有顏色改 token；產品切換負邊距只在第一個元素時 |
| `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx` | 修改（Task 2） | 側欄與抽屜根元素掛 `.vw-chrome`；目前項目樣式、收合鈕淡字 |
| `F:\vsms\vsms-export\vitest.config.ts` | 修改（Task 2） | `test.css.include` 白名單，讓 `?raw` 讀得到 `index.css` 與 token 副本 |
| `F:\vsms\vsms-export\src\__tests__\ink-frame.test.tsx` | 新增（Task 2） | CSS 字串守門＋頂欄／側欄／抽屜的框架 class、色階禁用、清單在框架外 |
| `F:\vsms\vsms-export\src\__tests__\sidebar.test.tsx` | 修改一條測試（Task 2） | 目前頁的樣式改成框架上的選取樣式 |
| `F:\vsms\vsms-export\src\__tests__\topbar.test.tsx` | 檔尾加一組測試（Task 3） | 產品切換負邊距依有無選單鈕 |

相依：Task 2 需要 Task 1 的 `--vw-chrome-*`（`ink-frame.test.tsx` 第一條就檢查副本）；Task 3 的「找到」片段是 Task 2 改寫後的 `Topbar.tsx`，必須在 Task 2 之後做。

---

### Task 1: Commit 由 vportal 同步的共用 token 副本

**Files:**
- Commit: `F:\vsms\vsms-export\src\styles\workspace-tokens.css`（**不得手改**，內容由 vportal 計畫 Task 1 的 `npm run check:tokens -- --write` 寫入）

**Interfaces:**
- Consumes: vportal 計畫 Task 1 已完成（`F:\vportal\tokens\workspace-tokens.css` 已加上框架 token 與 D2，並寫好三份副本）。
- Produces（Task 2 使用）：副本 `:root` 有 `--vw-chrome-top`、`--vw-chrome-side`、`--vw-chrome-border`、`--vw-chrome-hover`、`--vw-chrome-active`、`--vw-chrome-text`、`--vw-chrome-text-secondary`、`--vw-chrome-text-muted`（值見 Global Constraints）。

**BLOCKED 條件**：以下任一步不符預期就**停下來回報 BLOCKED**，不要自己改副本、不要從 vportal 複製、不要動其他檔案。

- [ ] **Step 1: 確認 vportal 的 token 檢查通過**

Run: `cd /f/vportal && npm run check:tokens`
Expected: exit code 0（沒有 mismatch、沒有對比不足的訊息）。失敗 → BLOCKED（vportal 的 token task 還沒完成）。

- [ ] **Step 2: 確認 VSMS 工作樹只動到副本**

Run: `cd /f/vsms/vsms-export && git status --short && git diff --stat`
Expected: `git status --short` 只有一行 ` M src/styles/workspace-tokens.css`；`git diff --stat` 只列這一個檔案。
- 沒有任何輸出 → 副本尚未同步 → BLOCKED。
- 有其他檔案 → 停下回報（不要處理它們）。

- [ ] **Step 3: 確認副本與 vportal 來源逐位元組相同**

Run: `cmp /f/vportal/tokens/workspace-tokens.css /f/vsms/vsms-export/src/styles/workspace-tokens.css && echo SAME`
Expected: `SAME`。有差異 → BLOCKED。

- [ ] **Step 4: 確認框架 token 與 D2 的值符合規格**

Run:
```bash
cd /f/vsms/vsms-export && node -e '
const css = require("fs").readFileSync("src/styles/workspace-tokens.css", "utf8");
const block = sel => { const i = css.indexOf(sel + " {"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
const val = (body, name) => ((body.match(new RegExp("--" + name + "[ ]*:[ ]*(#[0-9A-Fa-f]{6})[ ]*;")) || [])[1] || "").toUpperCase();
const want = {
  ":root": { "vw-chrome-top": "#17212E", "vw-chrome-side": "#1B2636", "vw-chrome-border": "#243042", "vw-chrome-hover": "#243042", "vw-chrome-active": "#2A3553", "vw-chrome-text": "#FFFFFF", "vw-chrome-text-secondary": "#B8C0CC", "vw-chrome-text-muted": "#8A95A6" },
  "[data-theme=\"dark\"]": { "vw-chrome-top": "#0A1018", "vw-chrome-side": "#0B121B", "vw-chrome-border": "#1A2433", "vw-chrome-hover": "#1A2433", "vw-chrome-active": "#1E2A3A", "vw-chrome-text": "#FFFFFF", "vw-chrome-text-secondary": "#B8C0CC", "vw-chrome-text-muted": "#8A95A6", "vw-bg": "#0E1520", "vw-surface": "#17212E", "vw-surface-subtle": "#1E2A3A", "vw-border": "#263345", "vw-border-strong": "#34425A" },
};
let bad = 0;
for (const [sel, kv] of Object.entries(want)) for (const [k, v] of Object.entries(kv)) {
  const got = val(block(sel), k);
  if (got !== v) { bad++; console.log("MISMATCH", sel, k, got || "(missing)", "!=", v); }
}
console.log(bad ? "BAD " + bad : "OK 21");'
```
Expected: 最後一行 `OK 21`。出現 `MISMATCH`／`BAD` → BLOCKED（回報那幾行）。（正規式刻意不用反斜線：這台機器的 Bash 工具會吃掉單引號裡的 `\`。）

- [ ] **Step 5: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 0 failures（58 檔、484 條，總數只供參考）；tsc 沒有任何輸出。副本只新增變數、改深色值，VSMS 不設 `data-theme`，畫面不變。

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export && git add src/styles/workspace-tokens.css && git commit -m "$(cat <<'EOF'
chore(tokens): sync workspace tokens (chrome tokens, dark D2) from vportal

Adds the --vw-chrome-* frame tokens (light and dark) and the dark D2
values. Copied byte-for-byte by vportal's check:tokens --write; not
edited here. VSMS never sets data-theme="dark", so D2 has no effect.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

（`git add` 可能印出 "LF will be replaced by CRLF the next time Git touches it"：無害，副本在工作樹維持 LF，不要去「修」它。）

---

### Task 2: 墨色框架（頂欄、側欄、抽屜）

**Files:**
- Modify: `F:\vsms\vsms-export\vitest.config.ts`（CRLF；`exclude:` 那一行之後加 `css` 白名單）
- Create（測試）: `F:\vsms\vsms-export\src\__tests__\ink-frame.test.tsx`
- Modify（測試）: `F:\vsms\vsms-export\src\__tests__\sidebar.test.tsx`（「目前頁」那一條，第 103～108 行）
- Modify: `F:\vsms\vsms-export\src\index.css`（CRLF；三處插入）
- Modify（整份改寫）: `F:\vsms\vsms-export\src\components\layout\Topbar.tsx`
- Modify: `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx`（檔頭註解一行、`ITEM_CURRENT`、側欄 `<aside>` 與抽屜的 className、收合鈕 className）

**Interfaces:**
- Consumes（Task 1）：`--vw-chrome-top`、`--vw-chrome-side`、`--vw-chrome-border`、`--vw-chrome-hover`、`--vw-chrome-active`、`--vw-chrome-text`、`--vw-chrome-text-secondary`、`--vw-chrome-text-muted`（`:root`）。沿用 4C：`SIDEBAR_ID='app-sidebar'`、`NAV_DRAWER_ID='app-nav-drawer'`、`NAV_MENU_BUTTON_ID`、`sidebarVisible(role)`、`useNavDrawerStore`。
- Produces：
  - CSS class `.vw-chrome`（`src/index.css`，`@layer base`），自訂屬性 `--vw-accent-on-chrome: #5FC4B8`（`:root`）。
  - Task 3 要找的 `Topbar.tsx` 產品切換片段（本 task 改寫後的原文）：
    ```tsx
            items={switcherItems}
            className="flex flex-shrink-0 items-center gap-2 h-8 -ml-1.5 px-1.5 rounded-md
                       text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] transition-colors"
    ```

- [ ] **Step 1: 讓 vitest 讀得到 CSS 原始字串**

vitest 預設把所有 CSS（連 `?raw` 匯入）清成空字串，VSMS 之前沒有樣式字串測試，所以要先開白名單（比照 VTMS 的 `vitest.client.config.ts`）。只放這兩個檔：沒有任何測試用一般方式匯入它們，不會因此跑 Tailwind。

在 `F:\vsms\vsms-export\vitest.config.ts` 用 Edit 工具（檔案是 CRLF，Edit 會保留）找到：
```ts
    exclude: [...defaultExclude, '**/dist/**', '**/dist.stable-*/**', '.claude/**'],
```
換成：
```ts
    exclude: [...defaultExclude, '**/dist/**', '**/dist.stable-*/**', '.claude/**'],
    // jsdom 不套用樣式表，但 vitest 預設連 `?raw` 匯入的樣式表都會被清成空字串（css 預設不處理）。
    // ink-frame.test.tsx 要斷言 index.css 與共用 token 副本的原始文字，所以把這兩個檔案放進白名單，
    // 讓 Vite 的 raw loader 照常回傳內容（比照 VTMS 的 vitest.client.config.ts）。
    css: { include: [/\/src\/(index|styles\/workspace-tokens)\.css(\?.*)?$/] },
```
驗證：`cd /f/vsms/vsms-export && grep -c "css: { include" vitest.config.ts && file vitest.config.ts` → `1`，且仍顯示 `with CRLF line terminators`。

- [ ] **Step 2: 寫框架的失敗測試**

新增 `F:\vsms\vsms-export\src\__tests__\ink-frame.test.tsx`：

```tsx
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
```

- [ ] **Step 3: 側欄既有測試的「目前頁」改成框架上的選取樣式**

在 `F:\vsms\vsms-export\src\__tests__\sidebar.test.tsx` 找到：
```tsx
  it('目前頁：aria-current="page"＋VSMS 青綠選取色；其他項目沒有，hover 用 surface-subtle', () => {
    renderSidebar('super_admin', 'settings')
    const cur = screen.getByRole('button', { name: '系統設定' })
    expect(cur).toHaveAttribute('aria-current', 'page')
    expect(cur.className).toContain('bg-[var(--vw-accent-subtle)]')
    expect(cur.className).toContain('text-[var(--vw-accent)]')
```
換成：
```tsx
  it('目前頁：aria-current="page"＋框架上的選取樣式（active 底、主要字、左側 3px 淺版識別色線）；其他項目沒有，hover 用 surface-subtle', () => {
    renderSidebar('super_admin', 'settings')
    const cur = screen.getByRole('button', { name: '系統設定' })
    expect(cur).toHaveAttribute('aria-current', 'page')
    expect(cur.className).toContain('bg-[var(--vw-accent-subtle)]')
    expect(cur.className).toContain('text-[var(--vw-ink)]')
    expect(cur.className).toContain('shadow-[inset_3px_0_0_var(--vw-accent-on-chrome)]')
    expect(cur.className).not.toContain('text-[var(--vw-accent)]')
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/ink-frame.test.tsx src/__tests__/sidebar.test.tsx`
Expected: FAIL，15 條失敗——`ink-frame.test.tsx` 17 條裡 14 條失敗（「.vw-chrome 把一般 token…」拋「找不到規則」；頂欄、側欄的 class 斷言都不符），只有「共用 token 副本已由 vportal 同步」「--color-accent 仍是 #0E6B63」「清單掛在 body、不在 .vw-chrome 裡」3 條通過；`sidebar.test.tsx` 的「目前頁」1 條失敗。若「共用 token 副本」那條也失敗，表示 Task 1 沒做或副本內容不對，停下回報。

- [ ] **Step 5: `index.css` 加 `--vw-accent-on-chrome`、`.vw-chrome` 與框架焦點框**

`F:\vsms\vsms-export\src\index.css` 是 CRLF，用 Edit 工具做三處替換。

(a) 找到：
```css
  --vw-accent: #0E6B63;
  --vw-accent-subtle: #E3F2F0;
```
換成：
```css
  --vw-accent: #0E6B63;
  --vw-accent-subtle: #E3F2F0;
  /* 墨色框架（頂欄、側欄、抽屜）上用的淺版識別色：目前項目左側 3px 線、使用者頭像底、
     框架上的焦點框。規格：vportal/docs/superpowers/specs/2026-09-24-ink-frame-design.md */
  --vw-accent-on-chrome: #5FC4B8;
```

(b) 找到：
```css
  --app-ground: var(--vw-bg);
}
```
換成：
```css
  --app-ground: var(--vw-bg);
}

/* ────────────────────────────────────────────────────────────────
   墨色框架（UI 統一收尾，2026-09-24）

   頂欄 <header>、側欄 #app-sidebar、抽屜 #app-nav-drawer 掛 .vw-chrome：
   框架範圍內把一般 token 換成框架值（--vw-chrome-* 在共用檔），元件照舊寫
   var(--vw-surface)、var(--vw-ink) 這些，整片就變成墨色。頂欄的底另外用
   --vw-chrome-top（比側欄深一階），在 Topbar.tsx 直接指定。

   注意：上面 @theme 的 slate-*／gray-*／stone-*／blue-* 是 :root 上的變數
   （例如 --color-slate-600: var(--vw-text-secondary)），在 :root 就已經算成
   淺色值，這裡換不掉。框架裡的元素一律直接寫 var(--vw-*)，不要用這幾條色階。

   下拉清單（MenuButton）portal 到 body、對話框也不在框架裡，維持白底。
   放在 base 層：這裡的 color 只是框架裡沒寫字色的元素的預設值，utilities 要能蓋過。
   ──────────────────────────────────────────────────────────────── */
@layer base {
  .vw-chrome {
    --vw-surface: var(--vw-chrome-side);
    --vw-surface-subtle: var(--vw-chrome-hover);
    --vw-border: var(--vw-chrome-border);
    --vw-ink: var(--vw-chrome-text);
    --vw-text-secondary: var(--vw-chrome-text-secondary);
    --vw-text-muted: var(--vw-chrome-text-muted);
    --vw-accent-subtle: var(--vw-chrome-active);
    --vw-accent: var(--vw-accent-on-chrome);
    color: var(--vw-text-secondary);
  }
}
```

(c) 找到：
```css
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }
```
換成：
```css
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  /* 墨色框架上的焦點框改用淺版識別色：深青綠 #0E6B63 在墨色底上幾乎看不到。 */
  .vw-chrome :is(button, a, [role="button"], summary):focus-visible {
    outline-color: var(--vw-accent-on-chrome);
  }
```

驗證：`cd /f/vsms/vsms-export && file src/index.css && grep -c "vw-accent-on-chrome" src/index.css` → `with CRLF line terminators`、`3`（定義、`.vw-chrome` 裡的對應、焦點框）。

- [ ] **Step 6: 改寫 `Topbar.tsx`**

把 `F:\vsms\vsms-export\src\components\layout\Topbar.tsx` 整份換成（LF）：

```tsx
// src/components/layout/Topbar.tsx
//
// 全域頂欄（UI 統一 4A）。三系統各自實作、行為一致，規格：
// F:\vportal\docs\superpowers\specs\2026-09-24-global-topbar-design.md
//
// 由左到右：（< md 且有側欄時）「選單」鈕、產品切換（下拉）、並排連結、彈性空白、通知鈴鐺、使用者選單。
// 原本 Header 的導覽分頁搬到頂欄下方的左側欄（Sidebar，UI 統一 4C）；「回入口頁」由產品切換取代；
// 角色縮寫徽章（SA/A/U/G）改成使用者選單標頭裡的中文角色。
//
// 墨色框架（2026-09-24，規格 F:\vportal\docs\superpowers\specs\2026-09-24-ink-frame-design.md）：
// <header> 掛 .vw-chrome（index.css），框架範圍內 --vw-surface、--vw-ink 等 token 換成框架值；
// 頂欄底色另外用 --vw-chrome-top。這裡的顏色一律直接寫 var(--vw-*)：Tailwind 的 slate-*／blue-*
// 在 :root 就算好了，框架換不掉。刻意不跟框架走的兩個顏色：產品切換的標誌方塊維持 VSMS 識別色
// #0E6B63（--color-accent，index.css @theme），使用者頭像是淺版識別色底配墨色字（#17212E，
// 取 --vw-chrome-top）。下拉清單 portal 到 body、不在框架裡，維持白底，清單標頭照一般 token 上色。
//
// 連到入口頁與其他系統的網址都是站台根目錄的絕對路徑（/、/inbox、/change-password、
// /vtms/），不經 withBase：VSMS 部署在 /vsms/ 底下，加前綴會變成 /vsms/inbox。
import { Bell, Check, KeyRound, LogOut, Menu } from 'lucide-react'
import { MenuButton, type MenuItem } from '../shared/MenuButton'
import { useAuthStore } from '../../store/authStore'
import { useNavDrawerStore } from '../../store/navDrawerStore'
import { NAV_DRAWER_ID, NAV_MENU_BUTTON_ID, sidebarVisible } from './Sidebar'
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

  // 窄螢幕（< md）打開側欄抽屜的「選單」鈕（UI 統一 4C）。沒有側欄的角色（測試人員、訪客）不顯示。
  const showNavMenu = sidebarVisible(role)
  const drawerOpen = useNavDrawerStore(s => s.open)
  const setDrawerOpen = useNavDrawerStore(s => s.setOpen)

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

  // 顯示在白底的下拉清單裡（portal 到 body，不在框架內），token 是一般值。
  const userHeader = (
    <>
      <div className="text-[13px] font-semibold text-[var(--vw-ink)]">{displayName}</div>
      {role && <div className="text-xs text-[var(--vw-text-muted)]">{ROLE_LABELS[role]}</div>}
    </>
  )

  return (
    <header className="vw-chrome h-12 flex-shrink-0 flex items-center gap-4 px-4 whitespace-nowrap
                       bg-[var(--vw-chrome-top)] border-b border-[var(--vw-border)]">
      {showNavMenu && (
        <button
          id={NAV_MENU_BUTTON_ID}
          type="button"
          aria-label="開啟選單"
          aria-expanded={drawerOpen}
          aria-controls={NAV_DRAWER_ID}
          onClick={() => setDrawerOpen(true)}
          className="md:hidden flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md
                     text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]
                     transition-colors"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      )}
      <MenuButton
        label="Validation Workspace"
        ariaLabel="切換系統"
        align="left"
        size="md"
        items={switcherItems}
        className="flex flex-shrink-0 items-center gap-2 h-8 -ml-1.5 px-1.5 rounded-md
                   text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] transition-colors"
        trigger={
          <>
            <span aria-hidden="true"
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-md
                             bg-[var(--color-accent)] text-white">
              <Check size={14} strokeWidth={3} />
            </span>
            <span className="hidden sm:inline text-sm font-bold text-[var(--vw-ink)]">Validation Workspace</span>
          </>
        }
      />

      {inlineApps.length > 0 && (
        <nav aria-label="系統" className="hidden md:flex min-w-0 items-center gap-1 overflow-x-auto">
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
                              ? 'bg-[var(--vw-accent-subtle)] text-[var(--vw-ink)]'
                              : 'text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]'}`}
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
                     text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]
                     transition-colors"
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
                   text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] transition-colors"
        trigger={
          <>
            <span aria-hidden="true"
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full
                             bg-[var(--vw-accent-on-chrome)] text-[11px] font-bold text-[var(--vw-chrome-top)]">
              {avatarInitials(displayName)}
            </span>
            <span className="hidden sm:inline max-w-[160px] truncate text-[13px] text-[var(--vw-ink)]">{displayName}</span>
          </>
        }
      />
    </header>
  )
}
```

對照原檔（`git show HEAD:src/components/layout/Topbar.tsx`），改動只有：檔頭加「墨色框架」一段註解；`userHeader` 前加一行註解、兩個 class 換 token；`<header>` 加 `vw-chrome`、底色改 `--vw-chrome-top`；選單鈕、鈴鐺、兩個 `MenuButton` 觸發鈕、並排連結的 `slate-*`／`blue-*` 換成 token；標誌方塊 `bg-[var(--vw-accent)]` → `bg-[var(--color-accent)]`；頭像 `bg-[var(--vw-accent)] … text-white` → `bg-[var(--vw-accent-on-chrome)] … text-[var(--vw-chrome-top)]`；產品名與使用者名的字色換 `text-[var(--vw-ink)]`。其餘邏輯一字不動。

- [ ] **Step 7: `Sidebar.tsx` 掛框架 class、改目前項目與收合鈕**

在 `F:\vsms\vsms-export\src\components\layout\Sidebar.tsx`（LF）做五處替換。

(a) 找到：
```tsx
// - 選取色是 VSMS 的青綠（--vw-accent／--vw-accent-subtle）。
```
換成：
```tsx
// - 墨色框架（2026-09-24，規格 F:\vportal\docs\superpowers\specs\2026-09-24-ink-frame-design.md）：
//   桌面側欄與抽屜的根元素掛 .vw-chrome（index.css），框架範圍內 --vw-surface、--vw-ink 等 token
//   換成框架值，這裡的 class 照舊寫 var(--vw-*)。目前項目：active 底、主要字、左側 3px 淺版識別色
//   內陰影；分組標題與收合鈕用淡字。不要在這裡用 Tailwind 的 slate-*／blue-*（在 :root 就算好了，
//   框架換不掉）。
```

(b) 找到：
```tsx
const ITEM_CURRENT = 'bg-[var(--vw-accent-subtle)] text-[var(--vw-accent)]'
```
換成：
```tsx
const ITEM_CURRENT =
  'bg-[var(--vw-accent-subtle)] text-[var(--vw-ink)] shadow-[inset_3px_0_0_var(--vw-accent-on-chrome)]'
// 收合鈕：淡字（框架的 --vw-chrome-text-muted），hover 同一般項目。
const COLLAPSE_IDLE =
  'text-[var(--vw-text-muted)] hover:bg-[var(--vw-surface-subtle)] hover:text-[var(--vw-ink)]'
```

(c) 找到：
```tsx
        className={`hidden md:flex flex-shrink-0 flex-col bg-[var(--vw-surface)] border-r border-[var(--vw-border)]
```
換成：
```tsx
        className={`vw-chrome hidden md:flex flex-shrink-0 flex-col bg-[var(--vw-surface)] border-r border-[var(--vw-border)]
```

(d) 找到（收合鈕，檔內唯一以 `${ITEM_IDLE}` 結尾、沒有 `current ?` 的那一行）：
```tsx
            className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${ITEM_IDLE}`}
```
換成：
```tsx
            className={`${ITEM_BASE} ${collapsed ? 'justify-center px-0' : 'px-3'} ${COLLAPSE_IDLE}`}
```

(e) 找到：
```tsx
          className={`fixed inset-y-0 left-0 z-[46] flex w-[232px] flex-col bg-[var(--vw-surface)] focus:outline-none
```
換成：
```tsx
          className={`vw-chrome fixed inset-y-0 left-0 z-[46] flex w-[232px] flex-col bg-[var(--vw-surface)] focus:outline-none
```

驗證：`cd /f/vsms/vsms-export && grep -c "vw-chrome " src/components/layout/Sidebar.tsx` → `2`；`grep -c "COLLAPSE_IDLE" src/components/layout/Sidebar.tsx` → `2`。

- [ ] **Step 8: 跑本 task 的測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/ink-frame.test.tsx src/__tests__/sidebar.test.tsx src/__tests__/sidebar-drawer.test.tsx src/__tests__/topbar.test.tsx src/__tests__/app-topbar.test.tsx src/__tests__/menuButton-topbar.test.tsx`
Expected: PASS（`ink-frame` 17 條全過；其他檔一條都不能壞）。

- [ ] **Step 9: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 0 failures（寫計畫時在 repo 的暫存副本實跑過：59 檔、501 條，總數只供參考）；tsc 沒有任何輸出。

- [ ] **Step 10: Commit**

```bash
cd /f/vsms/vsms-export && git add vitest.config.ts src/__tests__/ink-frame.test.tsx src/__tests__/sidebar.test.tsx src/index.css src/components/layout/Topbar.tsx src/components/layout/Sidebar.tsx && git commit -m "$(cat <<'EOF'
feat(layout): ink frame for the topbar, sidebar and nav drawer

The topbar, the sidebar and the narrow-screen drawer get a .vw-chrome
class that swaps the general tokens for the shared --vw-chrome-* values,
so the frame turns ink while the content area stays light. The topbar
used Tailwind slate/blue classes, which resolve at :root and cannot be
re-scoped, so every colour there is now a var(--vw-*) token; a test bans
those palettes inside the frame. The current item gets the active
background, white text and a 3px --vw-accent-on-chrome (#5FC4B8) inset;
the product logo keeps #0E6B63. Dropdowns are portalled to body and stay
white. vitest now whitelists index.css and the token copy for ?raw.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 窄螢幕「開啟選單」鈕到產品切換回到 16px（遺留問題項目 3）

**Files:**
- Modify: `F:\vsms\vsms-export\src\components\layout\Topbar.tsx`（產品切換 `MenuButton` 的 `className`）
- Modify（測試）: `F:\vsms\vsms-export\src\__tests__\topbar.test.tsx`（檔尾加一個 `describe`）

**Interfaces:**
- Consumes（Task 2）：`Topbar.tsx` 裡的 `showNavMenu`（`sidebarVisible(role)`），以及 Task 2 改寫後的產品切換 className 片段（見 Task 2 的 Produces）。
- Produces：無（最後一個 task）。

- [ ] **Step 1: 寫失敗測試**

在 `F:\vsms\vsms-export\src\__tests__\topbar.test.tsx` **最後面**（最後一個 `describe` 的 `})` 之後）加上：

```tsx

describe('Topbar：產品切換的負邊距（窄螢幕選單鈕到切換鈕 16px）', () => {
  // 用空白切成 token 比對：直接比字串的話，'md:-ml-1.5' 會被當成包含 '-ml-1.5'。
  const switcherTokens = () => screen.getByRole('button', { name: '切換系統' }).className.split(/\s+/)

  it.each<Role>(['super_admin', 'admin'])('%s（有選單鈕）：負邊距只在 md 以上', role => {
    login(role, 'local')
    render(<Topbar />)
    expect(screen.getByRole('button', { name: '開啟選單' })).toBeInTheDocument()
    expect(switcherTokens()).toContain('md:-ml-1.5')
    expect(switcherTokens()).not.toContain('-ml-1.5')
  })

  it.each<Role>(['user', 'guest'])('%s（沒有選單鈕）：任何寬度都保留 -ml-1.5', role => {
    login(role, 'local')
    render(<Topbar />)
    expect(screen.queryByRole('button', { name: '開啟選單' })).toBeNull()
    expect(switcherTokens()).toContain('-ml-1.5')
    expect(switcherTokens()).not.toContain('md:-ml-1.5')
  })
})
```

（`login`、`Role`、`render`、`screen`、`Topbar` 都是這個檔案既有的匯入與函式。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/topbar.test.tsx`
Expected: FAIL，2 條失敗：「super_admin（有選單鈕）」「admin（有選單鈕）」——token 裡沒有 `md:-ml-1.5`。user／guest 兩條通過。

- [ ] **Step 3: 負邊距只在切換鈕是第一個元素時才套**

在 `F:\vsms\vsms-export\src\components\layout\Topbar.tsx` 找到：
```tsx
        items={switcherItems}
        className="flex flex-shrink-0 items-center gap-2 h-8 -ml-1.5 px-1.5 rounded-md
                   text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] transition-colors"
```
換成：
```tsx
        items={switcherItems}
        // -ml-1.5 把 6px 內距抵掉，讓標誌方塊貼齊頂欄 16px 的左緣，只有切換鈕是第一個元素時才要。
        // 窄螢幕「選單」鈕在它前面時不套，兩者間距維持 gap 的 16px；md 以上選單鈕隱藏，照舊套用。
        // md:-ml-1.5 與 -ml-1.5 都要以完整字面出現在原始碼裡，Tailwind 才產生得出來。
        className={`flex flex-shrink-0 items-center gap-2 h-8 ${showNavMenu ? 'md:-ml-1.5' : '-ml-1.5'} px-1.5 rounded-md
                   text-[var(--vw-text-secondary)] hover:bg-[var(--vw-surface-subtle)] transition-colors`}
```

- [ ] **Step 4: 跑本 task 的測試確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/topbar.test.tsx src/__tests__/ink-frame.test.tsx src/__tests__/sidebar-drawer.test.tsx`
Expected: PASS（`ink-frame` 的「頂欄裡沒有色階 class」與 `sidebar-drawer` 的「選單鈕在頂欄最左邊」都不能壞）。

- [ ] **Step 5: 全套測試＋型別檢查**

Run: `cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`
Expected: 0 failures（暫存副本實跑：59 檔、505 條，總數只供參考）；tsc 沒有任何輸出。

- [ ] **Step 6: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/layout/Topbar.tsx src/__tests__/topbar.test.tsx && git commit -m "$(cat <<'EOF'
fix(topbar): switcher keeps 16px from the menu button on narrow screens

The switcher's -ml-1.5 optically aligns its logo with the 16px topbar
edge when it is the first item. Since 4C put the menu button in front of
it below md, that margin ate the gap down to 10px. Apply it only from md
up when the menu button exists; roles without a sidebar keep it at every
width.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## 部署（controller 執行，不派給 subagent）

### A. 改前截圖（在派 **Task 2** 之前做完）

Task 1 只 commit token 副本，畫面不變；Task 2 起畫面才改，所以在派 Task 2 之前把改前畫面拍齊（Task 1 前後拍都可以）。

harness 在 repo 根目錄（`_dev-admin.html`、`_dev-admin.tsx`、`_dev-stub.ts`、`_dev-view.ts`、`_dev-fixtures/`，已列入 `.git/info/exclude`，**不得 commit**）。`F:\.claude\launch.json` 的 `vsms-harness` 起 vite `127.0.0.1:5175`。參數：`?role=super_admin|admin|user|guest`（`_dev-stub.ts`，預設 super_admin）、`&view=`／`&tab=`、`&auth=vauth`、`&nav=collapsed|expanded`（`_dev-view.ts`）。`_dev-view.ts` 另有這一輪預覽用的臨時參數 `&ink=1`（載入 `_dev-ink.css`）與 `&gap=`：**改前、改後截圖都不要帶**，它們在 C9 刪除。

1. `preview_start` 名稱 `vsms-harness`（已在跑就沿用）。用瀏覽器窗格開 `http://127.0.0.1:5175/_dev-admin.html?role=super_admin&view=main&nav=expanded` 確認畫面出來、console 沒有錯誤。harness 裡不要點會導頁的連結（`/`、`/vtms/`、`/inbox`、`/change-password`），也不要按「登出」。
2. 桌面寬（Edge headless，PowerShell；存到 controller 的 scratchpad，下例用 `$env:TEMP\vsms-ink`）：
   ```powershell
   New-Item -ItemType Directory -Force "$env:TEMP\vsms-ink" | Out-Null
   $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
   $base = "http://127.0.0.1:5175/_dev-admin.html"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-ink\before-sa-main-expanded.png" "$base?role=super_admin&view=main&nav=expanded"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-ink\before-sa-main-collapsed.png" "$base?role=super_admin&view=main&nav=collapsed"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-ink\before-admin-settings.png" "$base?role=admin&view=settings&tab=people&nav=expanded"
   & $edge --headless --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot="$env:TEMP\vsms-ink\before-guest-main.png" "$base?role=guest&view=main"
   ```
   headless 若拍到空白（vite 首次編譯較慢），改用瀏覽器窗格（`computer` screenshot）拍同一組網址。改前預期：白色頂欄、白色側欄，目前項目淡青綠底青綠字。
3. 瀏覽器窗格（互動與手機寬都在這裡拍）：
   - 1440 寬 `?role=super_admin&view=main&nav=expanded`：點「切換系統」→ 截圖（白色清單）→ Esc；點「使用者選單」→ 截圖（白色清單、名稱與「超級管理者」）→ Esc。按工具列「全螢幕檢視」→ 截圖（甘特圖蓋住頂欄與側欄）→ Esc 離開。
   - `resize_window` 寬 375、高 812，重新整理同一網址 → 截圖；點「開啟選單」→ 截圖（白色抽屜）→ Esc。
   - 量頂欄間距（在 375 與 360 寬各跑一次；360 用 `resize_window` 寬 360、高 780 後重新整理）：
     ```js
     await new Promise(r => setTimeout(r, 1500));
     (() => {
       const r = el => el ? el.getBoundingClientRect() : null
       const menu = r(document.getElementById('vsms-nav-menu-button'))
       const sw = document.querySelector('button[aria-label="切換系統"]')
       const logo = r(sw.querySelector('span'))
       return {
         width: window.innerWidth,
         menuToSwitcher: menu && menu.width > 0 ? Math.round(sw.getBoundingClientRect().left - menu.right) : null,
         logoLeft: Math.round(logo.left),
         overflowX: document.documentElement.scrollWidth - window.innerWidth,
       }
     })()
     ```
     改前預期（寫計畫時在 375 寬實測）：`menuToSwitcher: 10`、`logoLeft: 64`、`overflowX: 0`。再對 `?role=guest&view=main` 跑一次：`menuToSwitcher: null`、`logoLeft: 16`。1440 寬 super_admin：`menuToSwitcher: null`、`logoLeft: 16`。
   - 拍完 `resize_window` preset `desktop` 還原。

### B. 改後截圖（Task 1～3 都 commit 之後）

1. Edge headless 同一組指令，把 `before-` 換成 `after-`。預期：
   - 頂欄墨色 `#17212E`、底線 `#243042`；側欄 `#1B2636`、右邊線 `#243042`；「排程」「系統」小標淡灰（`#8A95A6`）；一般項目淺灰字（`#B8C0CC`）；目前項目（排程管理）底 `#2A3553`、白字、左側 3px 青綠線（`#5FC4B8`）；底部「收合側欄」淡灰字。
   - 頂欄「Validation Workspace」白字、左邊標誌方塊仍是深青綠 `#0E6B63` 白勾；並排連結 VTMS 淺灰字、VSMS 底 `#2A3553` 白字；鈴鐺淺灰、紅色徽章不變；頭像淺青綠 `#5FC4B8` 底、墨色縮寫、名稱白字。
   - 內容區（甘特圖、設定頁）與改前相同。
   - collapsed：56px 墨色側欄、置中圖示，目前項目同樣有 active 底與左側青綠線；分組分隔線是 `#243042`。
   - guest：頂欄墨色、沒有側欄與選單鈕，甘特圖佔滿寬。
2. 瀏覽器窗格 1440 寬 `?role=super_admin&view=main&nav=expanded`，用 `javascript_tool` 量實際顏色：
   ```js
   (() => {
     const cs = el => getComputedStyle(el)
     const h = document.querySelector('header')
     const a = document.getElementById('app-sidebar')
     const cur = a.querySelector('[aria-current="page"]')
     const logo = document.querySelector('button[aria-label="切換系統"] > span')
     const avatar = document.querySelector('button[aria-label="使用者選單"] > span')
     return {
       header: [cs(h).backgroundColor, cs(h).borderBottomColor, cs(h).boxShadow],
       side: [cs(a).backgroundColor, cs(a).borderRightColor],
       cur: [cs(cur).backgroundColor, cs(cur).color, cs(cur).boxShadow],
       logo: cs(logo).backgroundColor,
       avatar: [cs(avatar).backgroundColor, cs(avatar).color],
     }
   })()
   ```
   預期：`header` = `rgb(23, 33, 46)`、`rgb(36, 48, 66)`、`none`；`side` = `rgb(27, 38, 54)`、`rgb(36, 48, 66)`；`cur` = `rgb(42, 53, 83)`、`rgb(255, 255, 255)`、含 `rgb(95, 196, 184) 3px 0px 0px 0px inset`；`logo` = `rgb(14, 107, 99)`；`avatar` = `rgb(95, 196, 184)`、`rgb(23, 33, 46)`。
   - 點「切換系統」→ 截圖；`getComputedStyle(document.querySelector('[role="menu"]')).backgroundColor` 是 `rgb(255, 255, 255)`，清單文字深色可讀 → Esc。點「使用者選單」→ 截圖，同樣白底、名稱與角色深色字 → Esc。
   - 用鍵盤 Tab 走到側欄項目（`computer` key `Tab` 數次）→ 截圖：焦點框是淺青綠（`#5FC4B8`），看得清楚。
   - 按「全螢幕檢視」→ 截圖：甘特圖蓋過墨色頂欄與側欄；Esc 離開後框架恢復。
3. 瀏覽器窗格手機寬（`resize_window` 375×812 後重新整理 `?role=super_admin&view=main`）：
   - 截圖：墨色頂欄，☰ 淺灰。點「開啟選單」→ 截圖：抽屜 `#1B2636` 墨色、目前項目 active 底與青綠線，遮罩照舊。Esc 關閉。
   - 跑 A3 的量測：預期 `menuToSwitcher: 16`、`logoLeft: 70`、`overflowX: 0`。360 寬（360×780）同樣 `menuToSwitcher: 16`、`overflowX: 0`。`?role=guest&view=main`：`menuToSwitcher: null`、`logoLeft: 16`。1440 寬 super_admin：`logoLeft: 16`（桌面沒變）。
   - 拍完 `resize_window` preset `desktop` 還原。

改前／改後並排給使用者看，**使用者同意後**才往下做。

### C. 建置與上線

0. 規格的上線順序是**入口頁 → VSMS → VTMS 1.38.0**。確認 vportal 計畫的部署（入口頁墨色框架）已完成；若還沒，先問使用者要不要讓 VSMS 先上（兩者沒有程式相依，只是照順序）。
1. 確認工作樹與分支：`cd /f/vsms/vsms-export && git status --short && git branch --show-current && git log --oneline -5`。預期：`git status --short` 沒有輸出（`_dev-*` 已被 exclude）、分支 `feat/guest-role-and-uiux`、最新三筆依序是 Task 3、Task 2、Task 1 的 commit，再下面是本計畫的 commit。
2. 最後一次驗證：`cd /f/vsms/vsms-export && npm test && npx tsc -p tsconfig.app.json --noEmit`，0 failures、0 錯。
3. 備份：`cd /f/vsms/vsms-export && test ! -e dist.stable-20260924-pre-ink && cp -r dist dist.stable-20260924-pre-ink && ls -d dist.stable-20260924-pre-ink`（同名已存在時 `test` 失敗、不會覆蓋；那就停下來問）。
4. 只跑 `cd /f/vsms/vsms-export && npx vite build`。**不要**跑 `npm run build`（它會連 server 一起 tsc），**不要** `pm2`（任何子指令）：dist 由磁碟即時服務，前端修正只需 build。
5. 確認新版進了 bundle（`vite-plugin-singlefile`，整包在 `dist/index.html`；CSS 經壓縮後色碼是小寫，用 `-i`）：
   ```bash
   cd /f/vsms/vsms-export && grep -ci "vw-accent-on-chrome:#5fc4b8" dist/index.html; grep -c "\.vw-chrome{" dist/index.html; grep -ci "vw-chrome-top:#17212e" dist/index.html; grep -cF 'md\:-ml-1\.5' dist/index.html
   ```
   四個都至少 `1`。
6. 驗證正式站送出的 HTML 就是剛建出來的那份：
   ```bash
   curl -sk https://172.16.204.69/vsms/ | sha256sum
   sha256sum /f/vsms/vsms-export/dist/index.html
   ```
   兩個 hash 必須相同。
7. 實機（由使用者操作，**不代輸入帳密**）：請使用者從入口頁（`https://172.16.204.69/`）登入後進 `/vsms/`，確認：
   - 頂欄與左側欄是墨色、內容區淺色；從入口頁切到 VSMS 時框架顏色不跳（入口頁已上線的話）。
   - 目前項目有淺青綠左線；收合側欄後仍清楚；「切換系統」與使用者選單的清單是白底。
   - 甘特圖「全螢幕檢視」蓋過框架，離開後恢復。
   - 視窗拉到 768px 以下：墨色抽屜；☰ 與勾勾方塊之間的距離跟其他元素一樣（16px）。
   - 若方便：以訪客身分（入口頁「以訪客身分瀏覽 VSMS（唯讀）」）進來，墨色頂欄、沒有側欄。
8. 推 GitHub **先問使用者**。同意後才把 master 快轉到 `feat/guest-role-and-uiux` 並推：
   ```bash
   cd /f/vsms/vsms-export && git merge-base --is-ancestor master feat/guest-role-and-uiux && git branch -f master feat/guest-role-and-uiux && git log --oneline -1 master && git push origin master feat/guest-role-and-uiux
   ```
   `merge-base` 失敗（不能快轉）就停下來回報，不要合併或強推。
9. 清掉這一輪的臨時預覽檔（`_dev-*` 不進 git，這裡是單純的檔案整理）：
   - `F:\vsms\vsms-export\_dev-view.ts` 用 Edit 工具找到：
     ```ts
     if (nav === 'expanded') localStorage.setItem('vsms-nav-collapsed', '0')

     // 臨時：&ink=1 載入 B 墨色框架預覽樣式（_dev-ink.css）。
     if (q.get('ink') === '1') { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/_dev-ink.css'; document.head.appendChild(l) }

     // 臨時：&gap=16|8 預覽窄螢幕頂欄間距。
     { const g = q.get('gap'); if (g) { const st = document.createElement('style'); st.textContent = g === '16' ? 'header [class~="-ml-1.5"]{margin-left:0 !important}' : 'header{gap:8px !important} header [class~="-ml-1.5"]{margin-left:0 !important}'; document.head.appendChild(st) } }
     ```
     換成：
     ```ts
     if (nav === 'expanded') localStorage.setItem('vsms-nav-collapsed', '0')
     ```
   - 刪除 `rm /f/vsms/vsms-export/_dev-ink.css`。
   - 驗證：`cd /f/vsms/vsms-export && grep -cE "ink|gap" _dev-view.ts; grep -c "vsms-nav-collapsed" _dev-view.ts; ls _dev-ink.css; git status --short` → `0`、`2`、`ls` 報找不到檔案、`git status` 沒有輸出（改前只有這兩段臨時程式碼含 ink／gap）。
   - `preview_stop` 關掉 `vsms-harness`（入口頁與 VTMS 的部署若還要用瀏覽器窗格，不影響）。
10. 更新畫布進度（墨色框架 VSMS、項目 3 VSMS → 已上線）與相關記憶（`workspace-ui-review-2026-09-23.md`：VSMS 墨色框架與頂欄 16px 已上線、退版備份 `dist.stable-20260924-pre-ink`；`vsms-project-layout.md` 可補一句「框架顏色在 `index.css` 的 `.vw-chrome`；框架裡不能用 slate/blue 色階」）。

**退版**：
```bash
rm -rf /f/vsms/vsms-export/dist
cp -r /f/vsms/vsms-export/dist.stable-20260924-pre-ink /f/vsms/vsms-export/dist
```
不需要重啟 vsms。退版後用 C6 的 hash 比對確認正式站回到舊版。token 副本與 git 歷史不用動（舊版 bundle 不含框架 token，畫面回到白色框架）。

---

## Self-Review

**1. 規格覆蓋（VSMS 範圍）**

| 規格要求 | 位置 |
|---|---|
| 共用 token 只在 vportal 改、VSMS 只 commit 副本、不得手改、未同步就 BLOCKED | Task 1（Step 1～4 的 BLOCKED 條件）；Global Constraints |
| 新 token 名稱與色碼（淺色／深色）、D2 五個值 | Global Constraints 表格；Task 1 Step 4 逐值核對；`ink-frame.test.tsx`「共用 token 副本已由 vportal 同步」 |
| `.vw-chrome` 的 8 個 token 對應（寫在 `src/index.css`） | Task 2 Step 5(b)；測試「.vw-chrome 把一般 token 換成框架值」（`toEqual`，不多不少） |
| `--vw-accent-on-chrome` `#5FC4B8` 定義在識別色旁邊 | Task 2 Step 5(a)；測試「--vw-accent-on-chrome 是 #5FC4B8…」 |
| `<header>`、`#app-sidebar`、`#app-nav-drawer` 掛 `.vw-chrome` | Task 2 Step 6（header）、Step 7(c)(e)；測試「<header> 帶 .vw-chrome…」「#app-sidebar 與 #app-nav-drawer 帶 .vw-chrome…」 |
| 頂欄背景 `--vw-chrome-top`、底線 `--vw-chrome-border`、不加陰影 | Step 6 header class；測試同上（含「沒有陰影」）；部署 B2 實量 |
| 側欄與抽屜背景 `--vw-chrome-side`、右邊線 | `bg-[var(--vw-surface)]`＋`.vw-chrome` 對應；測試「#app-sidebar 與 #app-nav-drawer…」；B2 實量 |
| 項目一般次要字、hover 底＋主要字 | 既有 `ITEM_IDLE`（token 經對應變框架值）；測試「目前項目…一般項目…」 |
| 目前項目 active 底、主要字、`inset 3px 0 0 var(--vw-accent-on-chrome)` | Step 7(b) `ITEM_CURRENT`；`ink-frame` 與 `sidebar.test.tsx` 的目前頁測試；B2 實量 |
| 分組標題、收合鈕淡字；淡字不放在目前項目底上 | 分組標題既有 `text-[var(--vw-text-muted)]`；Step 7(b)(d) `COLLAPSE_IDLE`；目前項目改用 `--vw-ink`；測試「分組標題與收合鈕用淡字」 |
| 頂欄系統連結一般次要字、目前系統 active 底＋主要字 | Step 6 並排連結；測試「圖示鈕與頂欄連結…」 |
| 產品切換標誌方塊維持 `#0E6B63` 與白勾 | Step 6 `bg-[var(--color-accent)] text-white`；測試「標誌方塊維持識別色底與白勾」「--color-accent 仍是 #0E6B63」；B2 實量 |
| 使用者頭像底 `--vw-accent-on-chrome`、字 `#17212E` | Step 6 頭像；測試同上；B2 實量 |
| 鈴鐺紅色徽章不變 | Step 6 徽章 class 未動（`bg-[var(--vw-danger-solid)]`，不在 `.vw-chrome` 對應內） |
| 焦點框在框架上用 `--vw-accent-on-chrome` | Step 5(c)；測試「框架上的焦點框…」；B2 鍵盤截圖 |
| 收合紅點、tooltip 行為不變 | Sidebar 邏輯未動（VSMS 沒有徽章；`title` 規則未改）；既有 `sidebar.test.tsx` 全過 |
| Topbar 的 `text-slate-900`／`text-slate-500`（使用者名稱、角色）改 token | Step 6 `userHeader`；測試「使用者選單標頭的名稱與角色改用 token…」 |
| 少數寫死顏色另外處理 | Step 6 整份改寫（所有 slate／blue）；測試「頂欄裡沒有色階 class」（四種角色）、側欄與抽屜同樣檢查 |
| `MenuButton` 清單 portal 到 body、維持白底 | 未改 MenuButton；測試「清單掛在 body、不在 .vw-chrome 裡，維持白底」；B2 實量 `rgb(255, 255, 255)` |
| 甘特圖全螢幕照樣蓋過框架 | z-index 未動；部署 A3／B2 截圖 |
| 框架 token 對比（≥ 4.5） | vportal 的 `check:tokens`（Task 1 Step 1 確認通過） |
| 項目 3（C）VSMS：`${showNavMenu ? 'md:-ml-1.5' : '-ml-1.5'}`，兩個字面都完整出現 | Task 3 Step 3 |
| 項目 3 測試：split 空白比對 token；有側欄角色含 `md:-ml-1.5` 不含 `-ml-1.5`；沒有側欄的角色保留 `-ml-1.5` | Task 3 Step 1 |
| 截圖：VSMS 甘特圖展開、收合、手機抽屜、兩個清單白底 | 部署 A／B |
| 上線：只 `npx vite build`、備份 `dist`、順序入口頁 → VSMS → VTMS | 部署 C0、C3、C4 |
| 臨時預覽檔最後刪除 | 部署 C9（`_dev-view.ts` 兩段、`_dev-ink.css`） |
| 型別檢查與全套測試全過 | 每個 task 的全套測試＋型別檢查 |

**2. 佔位掃描**：新檔 `ink-frame.test.tsx` 與改寫的 `Topbar.tsx` 整份給出；`index.css`、`Sidebar.tsx`、`sidebar.test.tsx`、`vitest.config.ts`、`topbar.test.tsx`、`_dev-view.ts` 都給了原文片段與新片段（片段已在暫存副本逐一確認唯一）。Task 1 的核對腳本完整。沒有 TBD／「比照」／「適當處理」。

**3. 名稱與型別一致**：`.vw-chrome`、`--vw-accent-on-chrome`、`--vw-chrome-top` 等名稱在 index.css、Topbar、Sidebar、測試與部署量測一致。`COLLAPSE_IDLE` 在 Step 7(b) 定義、(d) 使用；`ITEM_CURRENT` 的新 class 字串與 `ink-frame`、`sidebar.test.tsx` 的斷言逐字相同（`shadow-[inset_3px_0_0_var(--vw-accent-on-chrome)]`）。Task 3 的「找到」片段就是 Task 2 Step 6 改寫後的原文（Task 2 Interfaces 也列出）。`SIDEBAR_ID`、`NAV_DRAWER_ID` 從 `Sidebar.tsx` 匯入（4C 已存在）。寫計畫時在 repo 的暫存副本（模擬同步後的 token 副本）實跑：Task 2 前 15 條失敗、Task 2 後 59 檔 501 條全過；Task 3 前 2 條失敗、後 505 條全過；兩次 tsc 0 錯；`vite build` 產物含 `.vw-chrome{…}`、`shadow-[inset_3px…]`、`md:-ml-1.5`、`bg-[var(--color-accent)]` 與 `--color-accent:#0e6b63`。

## 替規格決定的細節

1. **頂欄整份換 token，不只規格點名的兩個 class**：規格說 4A／4C 的頂欄與側欄「都已經只用 token 上色」，VSMS 的側欄是，但頂欄不是——選單鈕、鈴鐺、兩個觸發鈕、並排連結、產品名都用 `slate-*`／`blue-*`。這幾條色階在 `@theme` 是 `:root` 上的變數，建置後是 `.text-slate-600{color:var(--color-slate-600)}`＋`:root{--color-slate-600:var(--vw-text-secondary)}`，`--color-slate-600` 在 `:root` 就算成淺色，`.vw-chrome` 覆寫 `--vw-text-secondary` 對它沒有作用。所以全部改成 `var(--vw-*)`，並加「框架裡不得有這幾條色階」的測試。
2. **規格點名的 `text-slate-900`／`text-slate-500`（名稱、角色）其實在下拉清單的標頭裡**（portal 到 body、白底），不在框架內；照規格換成 `text-[var(--vw-ink)]`／`text-[var(--vw-text-muted)]`，在白底上值不變。頂欄上看得到的使用者名稱是觸發鈕裡的 `text-slate-800`，改成 `text-[var(--vw-ink)]`（規格：使用者名是主要字）。
3. **標誌方塊用 `--color-accent`**：規格的對應把框架裡的 `--vw-accent` 換成 `#5FC4B8`，標誌方塊原本是 `bg-[var(--vw-accent)]`，會變成淺青綠，跟「維持原本的識別色底 #0E6B63」衝突。改用 VSMS `@theme` 既有的語意別名 `--color-accent`（`#0E6B63`，`index.css` 的焦點框已引用，建置一定會輸出）。不新增 token。
4. **頭像字色取 `--vw-chrome-top`**：規格要 `#17212E`；框架裡 `--vw-ink` 已被換成白色，`text-slate-900` 雖然剛好算成 `#17212E`，但那是依賴「色階在 `:root` 算好」的副作用，跟決定 1 的規則相衝。`--vw-chrome-top` 淺色值正是 `#17212E`，語意上是「從頂欄鏤空的字」。
5. **觸發鈕（▾）與圖示鈕用次要字**：規格的次要字用途是「一般項目、頂欄連結、圖示鈕」；兩個 `MenuButton` 觸發鈕原本是 `text-slate-500`（淡字），它們的顏色只作用在 ▾ 圖示，歸到「圖示鈕」用次要字。
6. **目前項目字色從識別色改成主要字（白）**：規格「目前項目字 `--vw-chrome-text`」；原本 `text-[var(--vw-accent)]` 在框架裡會是 `#5FC4B8`。同時更新 `sidebar.test.tsx` 的舊斷言。
7. **`.vw-chrome` 放在 `@layer base` 並帶預設 `color: var(--vw-text-secondary)`**：讓框架裡沒寫字色的東西（目前沒有，防日後）不會繼承到深色字；放 base 層是為了讓 utilities 能蓋過。
8. **焦點框規則**選擇器與既有全域規則相同（`button`、`a`、`[role="button"]`、`summary`），只換 `outline-color`，其餘（寬度、offset）沿用。
9. **vitest 白名單**：VSMS 之前沒有樣式字串測試，vitest 預設把 `?raw` 的 CSS 也清成空字串，所以 `vitest.config.ts` 加 `test.css.include`（只放 `index.css` 與 token 副本，比照 VTMS）。測試不能用 `node:fs`（tsc 找不到 node 型別，暫存副本實測過）。
10. **改前截圖在 Task 2 之前**：Task 1 只 commit token 副本，畫面不變。
11. **Task 3 放在 Task 2 之後**：兩者改同一段 className；先做框架讓 Task 3 的 diff 只剩負邊距一件事，與規格的 commit 分組（VSMS 項目 3 一個 commit）一致。
12. **master 在推 GitHub 時才快轉**（使用者同意後），不能快轉就停下回報。
13. **臨時預覽檔在上線後才刪**（C9）：改前、改後截圖期間只是不帶 `&ink=`／`&gap=`；`&nav=` 參數保留。
