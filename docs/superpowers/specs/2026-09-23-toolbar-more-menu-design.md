# VSMS 工具列「更多」選單（UI 統一第 3 項 C）設計規格

日期：2026-09-23
前一項：第 3 項 B（VTMS 單一捲軸）已於 2026-09-23 上線（VTMS 1.33.0）。

## 問題

`src/components/schedule/ScheduleToolbar.tsx` 的工具列在 1440px 寬時內容剛好塞滿（1416 / 1416，2026-09-03 實測），稍窄就要橫向捲動。其中匯入、匯出、下載範本、複製表格是低頻動作，卻和檢視切換、單位快篩搶同一排空間；主要動作「新增排程」在最左邊，和畫布設計（右側「更多｜新增排程」）不一致。

## 已定案的決策（2026-09-23 使用者選定）

1. **維持兩排**（條件列＋工具列），甘特圖起點維持 212px。不合成一排、不加「今天」按鈕、條件列不動。
2. 匯入、匯出、下載範本、複製表格收進工具列右側的「更多」選單。
3. 「新增排程」移到工具列最右邊，維持墨色主按鈕。
4. 全螢幕留在外面，改成只有圖示。
5. 做法：新增共用元件 `MenuButton`（不用原生 `<details>`、不引入 Radix／Headless UI）。

## 設計

### 1. `src/components/shared/MenuButton.tsx`（新檔）

```ts
export interface MenuItem {
  key: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
}
interface Props {
  label: string            // 按鈕文字，例如「更多」
  items: MenuItem[]
  ariaLabel?: string
  className?: string       // 觸發按鈕的樣式，沿用呼叫端的 BTN
}
export function MenuButton(props: Props): JSX.Element | null
```

- `items` 為空時回傳 `null`（整顆按鈕不顯示）。
- 觸發按鈕：文字＋`ChevronDown` 圖示，`aria-haspopup="menu"`、`aria-expanded`、`aria-controls` 指向清單。
- 清單用 `createPortal` 掛到 `document.body`，`position: fixed`，右緣對齊按鈕右緣、上緣在按鈕下方 4px；開啟時量一次按鈕的 `getBoundingClientRect()`，視窗 resize 或捲動（capture）時關閉選單。
  - **理由一**：工具列容器是 `overflow-x-auto`，會連帶讓縱向也變成裁切，清單放在裡面會被切掉。
  - **理由二**：全螢幕時甘特圖容器是 `fixed inset-0 z-[100]`，清單的 z-index 要是 `z-[110]`。全螢幕用的是 `document.documentElement.requestFullscreen()`，body 仍在全螢幕元素之內，portal 到 body 看得到。
- 清單 `role="menu"`，每項是 `<button role="menuitem">`，`tabIndex` 用 roving（只有目前那項是 0）。
- 鍵盤：
  - 開啟時焦點移到第一項；`ArrowDown`／`ArrowUp` 循環移動，`Home`／`End` 到頭尾；`Enter`／`Space` 執行（button 原生行為）。
  - `Escape` 關閉選單並把焦點還給觸發按鈕，而且要 `stopPropagation()`。甘特圖在「覆蓋模式」全螢幕（瀏覽器拒絕真正全螢幕時）會在 `window` 上監聽 Esc 來離開（`GanttChart.tsx` 約 350 行），選單的 Esc 不能漏上去，所以 Esc 用清單元素上的 `onKeyDown` 處理，不用 `useEscapeKey`（那是掛在 document 上的）。
    **瀏覽器真正全螢幕時例外**：Esc 由瀏覽器自己攔下並離開全螢幕，網頁擋不住，這是預期行為；離開全螢幕會改變視窗尺寸，選單因 resize 自動關閉，不會殘留。
  - `Tab` 關閉選單，焦點照瀏覽器預設往下走。
- 點清單外面（`mousedown`，排除觸發按鈕本身）關閉；點項目時先關閉、焦點還給觸發按鈕，再呼叫 `onSelect`（避免 `onSelect` 開的 Modal 搶到焦點後又被搶回來）。
- 樣式：白底、`border-slate-200`、`rounded-md`、`shadow-lg`、`py-1`、`min-w-[10rem]`；項目 `px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 focus:bg-slate-100`，圖示 13px 與文字間距 `gap-2`。灰階沿用 slate（VSMS 的 gray/slate/stone 已指向同一組墨色階）。

### 2. `ScheduleToolbar.tsx`

- 左側：刪掉「新增排程／匯入／匯出／範本」與其後的分隔線。其餘（「我的排程／全部」、甘特圖｜列表、按工程師｜按設備、單位快篩）不變。
- 右側群組（`ml-auto`），由左到右：
  1. 全螢幕：只留圖示（`Maximize2`／`Minimize2`），`title` 與 `aria-label` 為「全螢幕檢視」／「離開全螢幕（Esc）」，尺寸 `w-8 h-8`，與原範本鈕相同。
  2. `MenuButton label="更多"`。
  3. 新增排程（`canWrite` 才顯示），樣式與目前相同。
- 「更多」的項目（依序；條件不符的不放進陣列）：

  | 項目 | 圖示 | 條件 | 動作 |
  |---|---|---|---|
  | 匯入排程… | `Upload` | `canWrite` | `setShowImport(true)` |
  | 匯出… | `Download` | `canWrite` | `setShowExport(true)` |
  | 下載匯入範本 | `FileSpreadsheet` | `canWrite` | `downloadTemplate()` |
  | 複製表格 | `ClipboardCopy` | `viewMode === 'list'` | `onCopyList()` |

  測試人員與訪客在甘特圖模式沒有任何項目，「更多」不顯示；列表模式只有「複製表格」一項。
- 原本各按鈕的 `title` 說明（「從 Excel 匯入排程」「匯出排程或 Dashboard」「下載 Excel 匯入範本」「複製目前篩選結果的完整列表（可貼到 Excel、Word 或 Outlook）」）改放在項目的 `title`。
- 匯入、匯出兩個 Modal 與 `handleExportDashboard` 等邏輯不動。
- 更新檔頭註解：排程操作已從左側移到右側，次要動作在「更多」裡。

## 測試

- `src/__tests__/menuButton.test.tsx`（新）：
  - `items` 為空時什麼都不渲染；
  - 點按鈕開啟、`aria-expanded` 變 true、焦點在第一項；
  - `ArrowDown`／`ArrowUp` 循環、`Home`／`End`；
  - `Escape` 關閉、焦點回到按鈕，而且 `window` 上的 keydown 監聽器**收不到**這個 Esc；
  - 點外面關閉；點項目會呼叫 `onSelect` 並關閉；
  - 清單渲染在 `document.body` 底下，不在按鈕的父元素裡。
- `src/__tests__/scheduleToolbar-more.test.tsx`（新）：
  - admin、甘特圖：「更多」有匯入／匯出／範本三項，沒有複製表格；
  - admin、列表：多出「複製表格」，點下去呼叫 `onCopyList`；
  - user、甘特圖：沒有「更多」、沒有新增排程；user、列表：「更多」只有「複製表格」；
  - admin：新增排程是工具列最後一顆按鈕；全螢幕按鈕有 `aria-label`。
- 既有測試全過：`npm test`（前端）。前端型別檢查 `npx tsc -p tsconfig.app.json --noEmit` 維持 0 錯（2026-09-23 已清為 0）。

## 上線

純前端：備份 `dist` → `dist.stable-20260923-pre-3c`，只跑 `npx vite build`（**不要** `npm run build`，也不重啟 vsms）。部署前截改前／改後圖給使用者看：admin 甘特圖、admin 列表（選單展開）、user 列表、全螢幕中展開選單。

## 不在這次範圍

- 條件列與工具列合成一排、「今天」按鈕。
- 標題列、統計頁、系統設定頁。
