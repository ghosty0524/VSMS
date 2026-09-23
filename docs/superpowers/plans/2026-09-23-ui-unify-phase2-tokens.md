# VSMS UI 統一第 2 項：改用共用 token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VSMS 改用 Validation Workspace 共用 token：墨色階的關鍵階、頁面底色與字型指向 `--vw-*`，主要按鈕改為墨色，青綠只留給連結、焦點與選取狀態。

**Architecture:** 共用副本 `src/styles/workspace-tokens.css` 由 vportal 的 `npm run check:tokens -- --write` 產生（已存在於工作目錄、尚未 commit）。`main.tsx` 在 `index.css` 之前載入它；`index.css` 的 Tailwind v4 `@theme` 把 gray／slate／stone 共用墨色階的幾個關鍵階改成 `var(--vw-*)`，所以既有的 `text-gray-500`、`border-gray-200` 等 class 不用改。主要按鈕原本借用 `bg-blue-600`（青綠），改成 `bg-stone-900`（墨色）。

**Tech Stack:** React + Vite + Tailwind v4、vitest。

**規格：** `F:\vportal\docs\superpowers\specs\2026-09-23-workspace-tokens-design.md`（第 1 節 token 表、第 3 節 VSMS、第 5 節測試）。

## Global Constraints

- token 值只來自共用副本；VSMS 自己只定義識別色 `--vw-accent: #0E6B63`、`--vw-accent-subtle: #E3F2F0`。**不得修改副本**（副本只能由 vportal 的 `check:tokens -- --write` 產生）。
- 墨色階對應：`100 → var(--vw-surface-subtle)`、`200 → var(--vw-border)`、`300 → var(--vw-border-strong)`、`500 → var(--vw-text-muted)`、`600 → var(--vw-text-secondary)`、`800 → var(--vw-primary-bg-hover)`、`900 → var(--vw-ink)`；gray、slate、stone 三組都要改；其餘階（50、400、700、950）保留原值。
- `--app-ground` 改為 `var(--vw-bg)`。
- 青綠色階 `--color-blue-*` 不動（它是 VSMS 識別色）。
- 主要按鈕改為 `bg-stone-900 … hover:bg-stone-800`；**選取狀態（甘特圖的選取、旗標）與登入頁（第 4 項）保留原樣**。
- 不動：甘特圖 `--gantt-*` token、`src/constants.ts` 資料色、匯出 dashboard `src/dashboard/*`、server。
- VSMS 沒有深色模式；共用副本裡的 `[data-theme="dark"]` 區塊在 VSMS 永遠不會生效。
- 測試 `npm test`；型別 `npx tsc -p tsconfig.app.json --noEmit`（0 錯誤）；共用檢查 `npm --prefix /f/vportal run check:tokens`。**不要跑 `npm run build`**。
- Git：在目前分支 `feat/guest-role-and-uiux` 上 commit（部署時 controller 會快轉 master），不切換分支、不 push。**不得使用 `git restore`、`git checkout -- <file>`、`git stash`、`git reset`、`git clean`**。不得 add `.superpowers/`。commit message 英文，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不要為了讓測試通過而改 production 行為。

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/styles/workspace-tokens.css` | commit（已由 vportal 產生） | 共用副本 |
| `src/main.tsx` | 修改 | 在 `index.css` 前 import 副本 |
| `src/index.css` | 修改 | 墨色階指向 token、識別色、頁面底、字型、主按鈕陰影 |
| 14 個元件 | 修改 | 主要按鈕 `bg-blue-600` → `bg-stone-900` |

---

### Task 1: 接上共用 token

**Files:**
- Commit: `src/styles/workspace-tokens.css`
- Modify: `src/main.tsx:3`
- Modify: `src/index.css`（`@theme` 內三組墨色階、字型 token、`:root` 的 `--app-ground`、`@layer base` 的主按鈕陰影規則）

- [ ] **Step 1: 確認副本存在且一致**

Run：`npm --prefix /f/vportal run check:tokens`
Expected: 「check:tokens 通過：3 份副本一致…」。若失敗（副本不存在），停下回報 NEEDS_CONTEXT，不要自己建立或修改副本。

- [ ] **Step 2: `main.tsx` 載入副本**

`src/main.tsx` 第 3 行 `import './index.css'` 之前加一行：

```ts
import './styles/workspace-tokens.css'
```

- [ ] **Step 3: 墨色階指向 token**

`src/index.css` 的 `@theme { … }` 裡，`--color-slate-*`、`--color-gray-*`、`--color-stone-*` 三組各自把下列七階的值換掉（其餘階不動）：

```css
  --color-slate-100: var(--vw-surface-subtle);
  --color-slate-200: var(--vw-border);
  --color-slate-300: var(--vw-border-strong);
  --color-slate-500: var(--vw-text-muted);
  --color-slate-600: var(--vw-text-secondary);
  --color-slate-800: var(--vw-primary-bg-hover);
  --color-slate-900: var(--vw-ink);
```

（gray、stone 兩組同樣七階，只換前綴。）原本的值依序是 `#F1F3F7`、`#E6EAF0`、`#D6DBE3`、`#64707F`、`#4B5666`、`#232D3B`、`#17212E`——除了 100、200、500 有些微差異，其餘和 token 相同，所以畫面改變集中在淺灰色塊、邊框與淡文字。

在墨色階那組註解的最後補一行：「100／200／300／500／600／800／900 指向共用 token（styles/workspace-tokens.css），其餘階是 VSMS 自有值。」

- [ ] **Step 4: 識別色與字型**

在 `@theme` 的 `/* ── 語意別名 ── */` 那組裡，`--color-accent: #0E6B63;` 保留；在 `@theme` 區塊**外面**的 `:root { --app-ground: … }` 區塊裡加上 VSMS 識別色，並把頁面底改成 token：

```css
:root {
  /* VSMS 的識別色（共用檔只規定名稱，值由各系統決定） */
  --vw-accent: #0E6B63;
  --vw-accent-subtle: #E3F2F0;
  /* 頁面底改用共用 token。原本 #E4E9F0 是為了讓白卡片看得出兩層；
     共用底色較亮，卡片的區隔改由邊框與陰影負責。 */
  --app-ground: var(--vw-bg);
}
```

（保留並改寫原本那段 `--app-ground` 的註解，不要留下「加深到對比 1.22」這種已不成立的說法。）

`@theme` 裡第 1 項加的兩行字型 token 改成指向共用 token：

```css
  --font-sans: var(--vw-font-sans);
  --font-mono: var(--vw-font-mono);
```

- [ ] **Step 5: 主要按鈕的陰影規則改認墨色**

`src/index.css` `@layer base` 裡原本的：

```css
  button.bg-blue-600:not(:disabled),
  a.bg-blue-600 {
    box-shadow: 0 1px 0 rgba(23, 33, 46, 0.14), 0 2px 5px rgba(14, 107, 99, 0.24);
  }
  button.bg-blue-600:not(:disabled):active {
    box-shadow: 0 1px 2px rgba(14, 107, 99, 0.28);
  }
  button.bg-blue-600:disabled { box-shadow: none; }
```

改成（選擇器換成主按鈕的新 class，陰影改墨色）：

```css
  button.bg-stone-900:not(:disabled),
  a.bg-stone-900 {
    box-shadow: 0 1px 0 rgba(23, 33, 46, 0.14), 0 2px 5px rgba(23, 33, 46, 0.18);
  }
  button.bg-stone-900:not(:disabled):active {
    box-shadow: 0 1px 2px rgba(23, 33, 46, 0.24);
  }
  button.bg-stone-900:disabled { box-shadow: none; }
```

上方註解「主要按鈕原本是一塊純平的青綠矩形」改成「主要按鈕是墨色（2026-09-23 共用 token）」，並把「bg-blue-600 也用在指示點之類的非互動元素上」改成 `bg-stone-900`。先 `grep -rn "bg-stone-900" src --include=*.tsx`，確認目前沒有非按鈕的互動元素會意外吃到陰影；若有，在報告中列出。

- [ ] **Step 6: 跑測試與檢查**

Run：`npm test`、`npx tsc -p tsconfig.app.json --noEmit`、`npm --prefix /f/vportal run check:tokens`
Expected: 全過。

- [ ] **Step 7: Commit**

```bash
git -C /f/vsms/vsms-export add src/styles/workspace-tokens.css src/main.tsx src/index.css
git -C /f/vsms/vsms-export commit -m "feat(ui): adopt the shared workspace tokens

The ink scale's key steps, the page ground and the font stack now point
at the shared --vw-* tokens; teal stays as VSMS's identity colour.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 主要按鈕改為墨色

**Files（逐處把主按鈕的 `bg-blue-600 … hover:bg-blue-700` 換成 `bg-stone-900 … hover:bg-stone-800`，其他 class 不動）：**
- `src/components/audit/AuditPage.tsx:125`
- `src/components/schedule/ExcelImportModal.tsx:341`（只換非覆蓋模式那一支：`'bg-blue-600 hover:bg-blue-700'` → `'bg-stone-900 hover:bg-stone-800'`；覆蓋模式的紅色不動）
- `src/components/schedule/ExportModal.tsx:142`
- `src/components/schedule/ScheduleFormModal.tsx:478`
- `src/components/schedule/ScheduleToolbar.tsx:125`（新增排程）
- `src/components/settings/CategoryManager.tsx:86`
- `src/components/settings/DeviceManager.tsx:117`（原為 `bg-blue-500 … hover:bg-blue-600`，同樣改成 `bg-stone-900 … hover:bg-stone-800`）
- `src/components/settings/NotifyManager.tsx:191`
- `src/components/settings/PeopleManager.tsx:129`、`:147`
- `src/components/settings/PersonFormModal.tsx:385`
- `src/components/settings/RestDaysManager.tsx:40`
- `src/components/settings/TestUnitManager.tsx:184`
- `src/components/shared/DeleteConfirmDialog.tsx:38`（只換非危險那一支：`'bg-blue-600 hover:bg-blue-700'` → `'bg-stone-900 hover:bg-stone-800'`）
- `src/components/shared/SessionExpiryWarning.tsx:57`

**不改：** `src/components/layout/LoginPage.tsx:41`、`:124`（第 4 項）、`src/components/schedule/FlagPopover.tsx:39`（旗標狀態）、`src/components/schedule/GanttChart.tsx:936`（選取狀態）。

- [ ] **Step 1: 逐處替換**

行號可能有幾行誤差，依內容比對。每處只換顏色 class，`disabled:*`、尺寸、圓角保留。

- [ ] **Step 2: 確認沒有漏網**

Run：`grep -rn "bg-blue-600\|bg-blue-500" src/components --include=*.tsx`
Expected: 只剩 LoginPage、FlagPopover、GanttChart 的選取狀態，以及 ExcelImportModal／DeleteConfirmDialog 以外不相關的用法；在報告中逐一說明每個剩下的命中為什麼不改。

- [ ] **Step 3: 跑測試**

Run：`npm test`、`npx tsc -p tsconfig.app.json --noEmit`
Expected: 全過。若有測試斷言 `bg-blue-600` class，改預期值並在報告中列出。

- [ ] **Step 4: Commit**

```bash
git -C /f/vsms/vsms-export add src/components
git -C /f/vsms/vsms-export commit -m "style(ui): primary buttons are ink, teal stays for selection and links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 改前／改後截圖（controller 執行，給使用者確認）

- [ ] 用 `F:\.claude\launch.json` 的 `vsms-harness` 開 `http://127.0.0.1:5175/_dev-admin.html?role=super_admin`，截甘特圖與設定頁（改前圖在 Task 1 開始前先截）。
- [ ] 重新量 2026-09-03 記錄過的三組對比：設備筆數（gray-400）、排序序號（stone-400）、甘特圖左欄工作內容（slate-500，在斑馬紋列上）；任何一組低於 4.5 就回報，不要自行調色。
- [ ] 確認白色卡片在新的頁面底上仍看得出層次；看不出來就回報，不要改回暗底。
- [ ] **使用者同意後才部署。**

---

## 部署（使用者看過截圖同意後）

1. 快轉 master：`git -C /f/vsms/vsms-export branch -f master HEAD`
2. 備份：`cp -r dist dist.stable-<日期>-pre-tokens`
3. `npm --prefix /f/vportal run check:tokens` 通過。
4. **只跑 `npx vite build`**（不要 `npm run build`）。不需要 `pm2 restart vsms`。
5. 驗證：正式站 HTML 與 dist 相同；訪客畫面主按鈕為墨色、青綠只在選取與連結。
6. 退版：`cp -r dist.stable-<日期>-pre-tokens/. dist/`（原地覆蓋）。
