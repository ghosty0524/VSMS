# VSMS UI 統一第 1 項 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VSMS 畫面上的狀態改顯示中文、日期時間統一格式、建立類按鈕統一叫「新增」、刪除按鈕降級為灰色（滑鼠移上才轉紅）、改用系統字。

**Architecture:** 純前端（`src/`），不動 server、API、DB。狀態值（`Planned` / `Testing` / `Completed` / `Delayed` / `Cancelled`）是程式內部與 Agent Excel 的契約，**一律不改**；只在「畫到畫面上」的那一刻經過新的 `statusLabel()` 轉成中文。日期同理：儲存格式 `YYYY/MM/DD` 不動，只在顯示時經過新的 `displayYmd()`／`formatDateTime()`。

**Tech Stack:** React + Vite + Tailwind v4（`@theme` token 在 `src/index.css`）、vitest + jsdom + Testing Library。

**依據：** 設計畫布 https://claude.ai/artifact/4Eyxohogg2wLDPdWFVKdq7 （Version 6）的「建議設計系統」畫板與 2026-09-23 的討論定案。

## Global Constraints

- 狀態中文詞表：`Planned`→`計畫中`、`Testing`→`測試中`、`Completed`→`已完成`、`Delayed`→`延遲`、`Cancelled`→`已取消`。
- **不得改動**：Agent Excel（`src/lib/excel.ts` 的 `狀態` 欄與 KPI 工作表，Copilot agent 會讀）、剪貼簿表格（`src/lib/clipboardTable.ts`）、匯入匯出 Excel、`server/` 全部、儲存用的日期字串、`STATUS_COLORS` / `STATUS_GLYPH` 的鍵。
- 排程表單的生命週期切換「進行中／已完成／已取消」保持原樣（它的「進行中」意思是「尚未結束」，涵蓋計畫中與測試中）。KPI 裡原本叫「進行中」的 Testing 改叫「測試中」，兩者就不再撞名。
- 日期時間顯示：`YYYY-MM-DD HH:mm`（24 小時、補零、不含秒）；稽核紀錄保留秒數 `YYYY-MM-DD HH:mm:ss`；純日期 `YYYY-MM-DD`。甘特圖時間軸標籤（`2026/09`、`09/29`）與 DatePicker 輸入格式不在這次範圍。
- 動作按鈕一律用「新增」；「建立時間」「建立者」這類欄位名稱與「尚未建立」這類描述不改。
- 刪除類按鈕平時灰色、滑鼠移上才轉紅；紅色實心只用在確認步驟（`DeleteConfirmDialog` 的確認鈕、設定頁的行內「刪除」確認鈕、匯入的「確認覆蓋」）。
- 字型：`--font-sans: "Microsoft JhengHei UI", "Microsoft JhengHei", "Segoe UI", system-ui, sans-serif`；`--font-mono: Consolas, "Cascadia Mono", ui-monospace, monospace`。不載外部字型。
- VSMS 沒有深色模式，這次也不加。
- 測試：`npm test`（前端 vitest）；型別檢查：`npx tsc -p tsconfig.app.json --noEmit`（目前應為 0 錯誤）。**不要跑 `npm run build`**（dist 由磁碟即時服務，build 就是上線；而且它會連 server 一起編）。
- Git：直接在 master 上 commit，不 push（推 GitHub 前要先問使用者）。**不得使用 `git restore`、`git checkout -- <file>`、`git stash`、`git reset`**。commit message 用英文，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不要為了讓測試通過而改 production 行為；測試若斷言舊文案，改測試的預期值。
- 狀態邏輯在專案裡有五份實作（見 `lib/status.ts`、`dashboard/script.ts`、`server/src/routes/integration.ts`、`lib/excel.ts`、`lib/analytics.ts`）。這次**只加顯示用的對照表，不碰任何一份計算邏輯**。

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/lib/status.ts` | 修改 | 新增 `STATUS_LABELS`、`statusLabel()` |
| `src/__tests__/status-labels.test.ts` | 新增 | 測對照表 |
| `src/lib/dateFormat.ts` | 新增 | `formatDateTime()`、`displayYmd()` |
| `src/__tests__/date-format.test.ts` | 新增 | 測日期格式 |
| `src/components/schedule/GanttChart.tsx`、`ScheduleListView.tsx`、`FilterSortBar.tsx` | 修改 | 狀態顯示、日期顯示、刪除鈕 |
| `src/components/analytics/*.tsx` | 修改 | 狀態用詞、日期顯示 |
| `src/lib/importImpact.ts` | 修改 | 差異清單欄位名稱中文化 |
| `src/dashboard/script.ts`、`template.ts`、`styles.ts` | 修改 | 匯出 dashboard 的狀態文字、字型 |
| `src/components/settings/*.tsx`、`audit/AuditPage.tsx` | 修改 | 日期、用詞、刪除鈕 |
| `src/index.css` | 修改 | 字型 token |

---

### Task 1: 狀態顯示對照表

**Files:**
- Modify: `src/lib/status.ts`（檔尾新增）
- Create: `src/__tests__/status-labels.test.ts`

**Interfaces:**
- Produces：
  - `export const STATUS_LABELS: Record<ScheduleStatus, string>`
  - `export function statusLabel(s: ScheduleStatus): string`

- [ ] **Step 1: 寫失敗測試**

`src/__tests__/status-labels.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { STATUS_LABELS, statusLabel, type ScheduleStatus } from '../lib/status'

describe('status labels', () => {
  it('maps every status to the shared Chinese wording', () => {
    expect(STATUS_LABELS).toEqual({
      Planned: '計畫中',
      Testing: '測試中',
      Completed: '已完成',
      Delayed: '延遲',
      Cancelled: '已取消',
    })
  })

  it('statusLabel returns the label for each status', () => {
    const all: ScheduleStatus[] = ['Planned', 'Testing', 'Completed', 'Delayed', 'Cancelled']
    expect(all.map(statusLabel)).toEqual(['計畫中', '測試中', '已完成', '延遲', '已取消'])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/__tests__/status-labels.test.ts`
Expected: FAIL，`STATUS_LABELS` 不存在。

- [ ] **Step 3: 在 `src/lib/status.ts` 檔尾新增**

```ts
/**
 * 狀態的畫面文字。只給「畫到畫面上」用：篩選、排序、Agent Excel、剪貼簿
 * 一律用英文狀態值，不要拿這裡的中文去比較或輸出。
 * 詞表與 VTMS、入口頁共用（2026-09-23 設計系統定案）。
 */
export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  Planned: '計畫中',
  Testing: '測試中',
  Completed: '已完成',
  Delayed: '延遲',
  Cancelled: '已取消',
}

export function statusLabel(s: ScheduleStatus): string {
  return STATUS_LABELS[s]
}
```

- [ ] **Step 4: 跑測試確認通過**

Run：`npx vitest run src/__tests__/status-labels.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C /f/vsms/vsms-export add src/lib/status.ts src/__tests__/status-labels.test.ts
git -C /f/vsms/vsms-export commit -m "feat(status): add display labels for schedule statuses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 管理介面的狀態改顯示中文

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx:216`, `:982`, `:1088`
- Modify: `src/components/schedule/ScheduleListView.tsx:123`
- Modify: `src/components/schedule/FilterSortBar.tsx:269`, `:387`
- Modify: `src/components/analytics/AnalyticsPage.tsx:40`, `:161`
- Modify: `src/components/analytics/KpiSection.tsx:7`, `:9`, `:35`, `:50`
- Modify: `src/components/analytics/UnitComparison.tsx:38`
- Modify: `src/components/analytics/DelayAnalysis.tsx:22`
- Modify: `src/lib/importImpact.ts:58-62`
- Test: `src/__tests__/filter-summary.test.ts`、`src/__tests__/excel-diff.test.ts`（視需要更新預期值）

**Interfaces:**
- Consumes：Task 1 的 `STATUS_LABELS`、`statusLabel`（`src/lib/status.ts`）
- 不改任何函式簽章；`hiddenStatuses()` 仍回傳英文狀態值。

- [ ] **Step 1: 寫失敗測試（篩選 chip 文字）**

`FilterSortBar` 沒有渲染測試（props 很多），所以把 chip 文字抽成純函式 `statusChipText` 來測。在 `src/__tests__/filter-summary.test.ts` 的 import 加上 `statusChipText`，檔尾新增：

```ts
describe('statusChipText', () => {
  it('預設篩選顯示中文的已隱藏狀態', () => {
    expect(statusChipText(DEFAULT_FILTER)).toBe('已完成、已取消')
  })
  it('隱藏超過兩個時改列出已選的狀態，也是中文', () => {
    const text = statusChipText({ ...DEFAULT_FILTER, statuses: ['Delayed'] as ScheduleStatus[] })
    expect(text).toContain('延遲')
    expect(text).not.toContain('Delayed')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/__tests__/filter-summary.test.ts`
Expected: FAIL，`statusChipText` 不存在。

- [ ] **Step 3: 甘特圖、列表、提示框**

每一處都在檔案頂端既有的 `import { computeStatus … } from '../../lib/status'` 裡加上 `statusLabel`。

- `GanttChart.tsx:982`：`{STATUS_GLYPH[status]} {status}` → `{STATUS_GLYPH[status]} {statusLabel(status)}`
- `GanttChart.tsx:1088`：`{STATUS_GLYPH[computeStatus(tooltip.s)]} {computeStatus(tooltip.s)}` → `{STATUS_GLYPH[computeStatus(tooltip.s)]} {statusLabel(computeStatus(tooltip.s))}`
- `ScheduleListView.tsx:123`：`{STATUS_GLYPH[status]} {status}` → `{STATUS_GLYPH[status]} {statusLabel(status)}`
- `GanttChart.tsx:216` 的 toast 文字改成：

```ts
toast.info('已標記為已完成。已完成的排程目前被「狀態」篩選隱藏，在篩選裡勾選「已完成」即可重新顯示。', 8000)
```

- [ ] **Step 4: 篩選列**

`FilterSortBar.tsx`：import 加上 `STATUS_LABELS`。
- `:387` 的狀態下拉加上 `optionLabels={STATUS_LABELS}`：

```tsx
<MultiSelectDropdown label="狀態" options={ALL_STATUSES} optionLabels={STATUS_LABELS}
  selected={value.statuses} onChange={statuses => set({ statuses: statuses as ScheduleStatus[] })} />
```

- 在 `hiddenStatuses`（`:132`）之後新增匯出函式：

```ts
/** 狀態 chip 的文字：擋掉 ≤2 個時列出被隱藏的，否則列出已選的。一律顯示中文。 */
export function statusChipText(v: FilterSortState): string {
  const hidden = hiddenStatuses(v)
  return hidden.length <= 2
    ? hidden.map(statusLabel).join('、')
    : summarizeSelection(v.statuses, STATUS_LABELS)
}
```

先看 `src/components/shared/MultiSelectDropdown.tsx:12` 的 `summarizeSelection` 參數順序，確認第二個參數就是 `optionLabels`；若不是，依實際簽章傳入。
- `:269`：`text: byHidden ? hidden.join('、') : summarizeSelection(value.statuses),` → `text: statusChipText(value),`（`byHidden` 仍用來決定 `label` 與 `icon`，保留）。
- `:262` 的註解 `「狀態：Delayed、Testing +1」` 改成 `「狀態：延遲、測試中 +1」`。

- [ ] **Step 5: 統計頁**

- `AnalyticsPage.tsx:161` 的「排程狀態」下拉加上 `optionLabels={STATUS_LABELS}`（import 自 `../../lib/status`）。
- `KpiSection.tsx:7`：`label: '進行中'` → `label: '測試中'`；`:9`：`label: '延遲中'` → `label: '延遲'`
- `KpiSection.tsx:35`：`<p className="text-xs text-gray-500">進行中</p>` → `測試中`；`:50`：`延遲中` → `延遲`
- `UnitComparison.tsx:38`：表頭 `延遲中` → `延遲`
- `DelayAnalysis.tsx:22`：`目前無延遲中的排程` → `目前沒有延遲的排程`

- [ ] **Step 6: 匯入差異清單**

`src/lib/importImpact.ts:58-62` 的三個 `label`：`'Completed'` → `'已完成'`、`'Delayed'` → `'延遲'`、`'Cancelled'` → `'已取消'`（`field` 值不動）。
`src/__tests__/excel-diff.test.ts:45-49` 若有自己的一份 `Completed` / `Delayed` 標籤副本並斷言 `label`，把預期值改成中文。

- [ ] **Step 7: 跑全部測試與型別檢查**

Run：`npm test` 然後 `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS、0 錯誤。

- [ ] **Step 8: Commit**

```bash
git -C /f/vsms/vsms-export add src/components/schedule/GanttChart.tsx src/components/schedule/ScheduleListView.tsx src/components/schedule/FilterSortBar.tsx src/components/analytics src/lib/importImpact.ts src/__tests__
git -C /f/vsms/vsms-export commit -m "feat(ui): show schedule statuses in Chinese on screen

Status values stay English everywhere they are compared or exported
(filters, Agent Excel, clipboard); only the rendered text changes.
KPI's Testing chip is now 測試中 so it no longer collides with the
schedule form's 進行中 (not yet finished).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 匯出 dashboard 的狀態文字

**Files:**
- Modify: `src/dashboard/script.ts:14-27`（新增對照表）、`:424`、`:514`、`:572`、`:597`
- Modify: `src/dashboard/template.ts:70`

匯出的 HTML 是給人看的獨立檔案。它的 CSS class（`status-Completed`）與篩選 checkbox 的 `value` 必須維持英文，只換看得到的文字。

- [ ] **Step 1: 寫失敗測試**

新增 `src/__tests__/dashboard-status-labels.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { generateDashboardHTML } from '../dashboard/template'

describe('exported dashboard status text', () => {
  it('shows Chinese status labels in the filter but keeps English values and classes', () => {
    const html = generateDashboardHTML([], {} as never)
    expect(html).toContain('value="Completed"')
    expect(html).toContain('status-Completed')
    expect(html).toMatch(/status-Completed">已完成</)
    expect(html).not.toMatch(/status-Completed">Completed</)
  })
})
```

若 `generateDashboardHTML` 的第二個參數型別需要真實結構，改用既有測試（`grep -rn generateDashboardHTML src/__tests__`）的 fixture。

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/__tests__/dashboard-status-labels.test.ts`
Expected: FAIL。

- [ ] **Step 3: `template.ts:70`**

```ts
`<label><input type="checkbox" class="status-cb" value="${s}"${s !== 'Completed' && s !== 'Cancelled' ? ' checked' : ''}> <span class="status-badge status-${s}">${s}</span></label>`
```

最後那個 `${s}` 改成 `${STATUS_LABELS[s]}`，並在檔案頂端 `import { STATUS_LABELS } from '../lib/status'`。

- [ ] **Step 4: `script.ts`（內嵌的原生 JS，不能 import）**

在 `script.ts:24-26` 的 `STATUS_GLYPH` 之後新增：

```js
  /* 狀態的畫面文字。對照 src/lib/status.ts 的 STATUS_LABELS，兩份要一起改。 */
  var STATUS_LABELS = {
    'Planned': '計畫中', 'Testing': '測試中', 'Completed': '已完成', 'Delayed': '延遲', 'Cancelled': '已取消',
  };
```

然後把四處「顯示用」的 `status` 換成 `STATUS_LABELS[status]`，class 裡的 `status-'+status+'` 不動：
- `:424`：`…color:'+sc.text+';">'+status+'</span>'` → `…color:'+sc.text+';">'+STATUS_LABELS[status]+'</span>'`
- `:514`：`status-'+status+'">'+status+'</span>` → `status-'+status+'">'+STATUS_LABELS[status]+'</span>`
- `:572`：`'+glyph+' '+status+'</span>` → `'+glyph+' '+STATUS_LABELS[status]+'</span>`
- `:597`：`status-'+status+'">'+status+'</span>` → `status-'+status+'">'+STATUS_LABELS[status]+'</span>`

- [ ] **Step 5: 跑全部測試**

Run：`npm test`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git -C /f/vsms/vsms-export add src/dashboard/script.ts src/dashboard/template.ts src/__tests__/dashboard-status-labels.test.ts
git -C /f/vsms/vsms-export commit -m "feat(dashboard): exported dashboard shows Chinese status labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 統一日期顯示

**Files:**
- Create: `src/lib/dateFormat.ts`
- Create: `src/__tests__/date-format.test.ts`
- Modify: `src/components/audit/AuditPage.tsx:201`
- Modify: `src/components/settings/PersonRow.tsx:91`
- Modify: `src/components/settings/NotifyLogTable.tsx:49-54`, `:101`, `:105`
- Modify: `src/components/schedule/ScheduleListView.tsx:140-141`
- Modify: `src/components/schedule/GanttChart.tsx:1100`
- Modify: `src/components/analytics/RiskList.tsx:78`
- Modify: `src/components/settings/RestDaysManager.tsx:49`
- Test: `src/__tests__/notifyLogTable.test.tsx:49-50`, `:108`

**Interfaces:**
- Produces：
  - `export function formatDateTime(v: string | Date | null | undefined, opts?: { seconds?: boolean }): string` —— 空值或無效回傳 `''`
  - `export function displayYmd(stored: string | null | undefined): string` —— 把儲存格式 `2026/09/29`（或 `2026/9/3`）轉成 `2026-09-29`；不經過 `Date`；空值回傳 `''`；不符格式時原樣回傳

- [ ] **Step 1: 寫失敗測試**

`src/__tests__/date-format.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { displayYmd, formatDateTime } from '../lib/dateFormat'

describe('formatDateTime', () => {
  const d = new Date(2026, 8, 3, 9, 5, 7) // local time

  it('formats as YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime(d)).toBe('2026-09-03 09:05')
    expect(formatDateTime(d.toISOString())).toBe('2026-09-03 09:05')
  })
  it('keeps seconds when asked (audit log)', () => {
    expect(formatDateTime(d, { seconds: true })).toBe('2026-09-03 09:05:07')
  })
  it('uses 24-hour time', () => {
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31 23:59')
  })
  it('returns empty string for empty or invalid input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('nope')).toBe('')
  })
})

describe('displayYmd', () => {
  it('turns the stored slash format into dashes', () => {
    expect(displayYmd('2026/09/29')).toBe('2026-09-29')
  })
  it('zero-pads unpadded stored values', () => {
    expect(displayYmd('2026/9/3')).toBe('2026-09-03')
  })
  it('does not shift the day through timezone parsing', () => {
    expect(displayYmd('2026/01/01')).toBe('2026-01-01')
  })
  it('returns empty for empty and leaves unknown shapes untouched', () => {
    expect(displayYmd('')).toBe('')
    expect(displayYmd(null)).toBe('')
    expect(displayYmd('TBD')).toBe('TBD')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/__tests__/date-format.test.ts`
Expected: FAIL，模組不存在。

- [ ] **Step 3: 建立 `src/lib/dateFormat.ts`**

```ts
/**
 * 畫面顯示用的日期格式，三個系統共用同一套規則（2026-09-23 設計系統定案）：
 *   日期時間 2026-09-03 09:05（24 小時、補零、不含秒；稽核紀錄可帶秒）
 *   日期     2026-09-03
 *
 * 只給畫面用。排程的 startDate／endDate 儲存格式是 YYYY/MM/DD，比較、
 * 送 API、匯入匯出都要用原字串——拿 ISO 格式去比會靜默比不到東西。
 */
const pad = (n: number) => String(n).padStart(2, '0')

export function formatDateTime(
  v: string | Date | null | undefined,
  opts: { seconds?: boolean } = {},
): string {
  if (v === null || v === undefined || v === '') return ''
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${opts.seconds ? `:${pad(d.getSeconds())}` : ''}`
  return `${date} ${time}`
}

/** 儲存格式 2026/09/29 → 顯示格式 2026-09-29。純字串處理，不經過 Date（避免時區位移）。 */
export function displayYmd(stored: string | null | undefined): string {
  if (!stored) return ''
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(stored)
  if (!m) return stored
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}
```

- [ ] **Step 4: 跑測試確認通過**

Run：`npx vitest run src/__tests__/date-format.test.ts`
Expected: PASS。

- [ ] **Step 5: 套用到畫面**

- `AuditPage.tsx:201`：`{new Date(log.timestamp).toLocaleString('zh-TW')}` → `{formatDateTime(log.timestamp, { seconds: true })}`
- `PersonRow.tsx:91`：`上次登入 {new Date(person.account.lastLoginAt).toLocaleDateString('zh-TW')}` → `上次登入 {formatDateTime(person.account.lastLoginAt).slice(0, 10)}`
- `NotifyLogTable.tsx`：刪掉 `:49-54` 的 `formatHandledAt` 函式；`:101` 改成 `{formatDateTime(l.updatedAt ?? l.createdAt) || (l.updatedAt ?? l.createdAt)}`（無效值時沿用舊行為：顯示原字串）；`:105` `{l.sendDate}` → `{displayYmd(l.sendDate)}`
- `ScheduleListView.tsx:140-141`：`{s.startDate}` → `{displayYmd(s.startDate)}`、`{s.endDate}` → `{displayYmd(s.endDate)}`
- `GanttChart.tsx:1100`：`{tooltip.s.startDate} ～ {tooltip.s.endDate}` → `{displayYmd(tooltip.s.startDate)} ～ {displayYmd(tooltip.s.endDate)}`
- `RiskList.tsx:78`：`{s.endDate}` → `{displayYmd(s.endDate)}`
- `RestDaysManager.tsx:49`：`<span>{v}</span>` → `<span>{displayYmd(v)}</span>`（刪除按鈕的 `filter(d => d !== v)` 仍用原值 `v`，不要動）

每個檔案 import `formatDateTime` 或 `displayYmd` 自對應的相對路徑 `…/lib/dateFormat`。

**不要動**：`dashboard/template.ts:58`、`lib/excel.ts:330`（匯出內容）、`ScheduleFormModal.tsx` 的 `formatDate`（同時用於儲存）、`clipboardTable.ts`、甘特圖時間軸標籤、所有 DatePicker。

- [ ] **Step 6: 更新通知紀錄測試的預期值**

`src/__tests__/notifyLogTable.test.tsx:49`、`:108` 的 `2026/08/27 14:05`、`2026/08/20 09:30` 改成 `2026-08-27 14:05`、`2026-08-20 09:30`；`:50` 的 `2026/08/25` 改成 `2026-08-25`。只改預期值，不改 fixture 輸入。

- [ ] **Step 7: 跑全部測試與型別檢查**

Run：`npm test` 然後 `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS、0 錯誤。

- [ ] **Step 8: Commit**

```bash
git -C /f/vsms/vsms-export add src/lib/dateFormat.ts src/__tests__/date-format.test.ts src/__tests__/notifyLogTable.test.tsx src/components/audit/AuditPage.tsx src/components/settings/PersonRow.tsx src/components/settings/NotifyLogTable.tsx src/components/schedule/ScheduleListView.tsx src/components/schedule/GanttChart.tsx src/components/analytics/RiskList.tsx src/components/settings/RestDaysManager.tsx
git -C /f/vsms/vsms-export commit -m "feat(ui): display dates as YYYY-MM-DD and datetimes as YYYY-MM-DD HH:mm

Display only: stored schedule dates keep the YYYY/MM/DD format that
comparisons and imports depend on.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 「建立」改「新增」

**Files:**
- Modify: `src/components/settings/PersonRow.tsx:97`
- Modify: `src/components/settings/PersonFormModal.tsx:269`
- Modify: `src/components/audit/AuditPage.tsx:18`, `:24`
- Modify: `src/components/schedule/GanttChart.tsx:519`
- Test: `src/__tests__/personRow-vauth.test.tsx:49`, `:59`

- [ ] **Step 1: 更新測試預期值（先讓它失敗）**

`personRow-vauth.test.tsx:49`、`:59` 的 `/建立帳號/` 改成 `/新增帳號/`。

- [ ] **Step 2: 跑測試確認失敗**

Run：`npx vitest run src/__tests__/personRow-vauth.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 改文案**

- `PersonRow.tsx:97`：按鈕 `建立帳號` → `新增帳號`
- `PersonFormModal.tsx:269`：區段標題 `建立帳號` → `新增帳號`
- `AuditPage.tsx:18`：`CREATE_SCHEDULE:  '建立排程',` → `'新增排程',`；`:24`：`CREATE_USER:      '建立帳號',` → `'新增帳號',`（只改顯示文字，鍵不動）
- `GanttChart.tsx:519`：`點擊上方的「＋ 新增排程」開始建立` → `點擊上方的「新增排程」加入第一筆排程`

`ScheduleFormModal.tsx:243`、`:248` 的「VTMS 已建立此專案」「VTMS 尚未建立此專案」是狀態描述，不改。`DeviceManager.tsx:102`「尚未建立任何設備」同理不改。

- [ ] **Step 4: 跑全部測試**

Run：`npm test`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C /f/vsms/vsms-export add src/components/settings/PersonRow.tsx src/components/settings/PersonFormModal.tsx src/components/audit/AuditPage.tsx src/components/schedule/GanttChart.tsx src/__tests__/personRow-vauth.test.tsx
git -C /f/vsms/vsms-export commit -m "feat(ui): use 新增 for create actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 刪除按鈕降級

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx:970`
- Modify: `src/components/schedule/ScheduleListView.tsx:158`
- Modify: `src/components/settings/CategoryManager.tsx:49`, `:75`
- Modify: `src/components/settings/TestUnitManager.tsx:97`, `:163`
- Modify: `src/components/settings/DeviceManager.tsx:63`, `:93`
- Modify: `src/components/settings/FallbackRecipients.tsx:83`
- Modify: `src/components/settings/PersonFormModal.tsx:369`, `:374`
- Modify: `src/components/schedule/FilterSortBar.tsx:579-586`

規則：觸發刪除的按鈕平時灰、滑鼠移上轉紅；真正執行刪除的確認鈕維持紅色實心（統一為 `bg-red-600 hover:bg-red-700`）。只換顏色相關的 class，尺寸、圓角、間距 class 保留原樣。

- [ ] **Step 1: 圖示按鈕（甘特圖左欄、列表）**

- `GanttChart.tsx:970`：`bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600` → `text-stone-500 hover:bg-red-50 hover:text-red-600`
- `ScheduleListView.tsx:158`：`bg-red-50 text-red-500 hover:bg-red-100` → `text-stone-500 hover:bg-red-50 hover:text-red-600`

- [ ] **Step 2: 設定頁的「刪除」觸發鈕**

以下每處把顏色 class 換成 `border border-stone-300 text-stone-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700`：
- `CategoryManager.tsx:75`：原 `bg-red-100 text-red-600 … hover:bg-red-200`
- `TestUnitManager.tsx:163`：原 `bg-red-100 text-red-600 hover:bg-red-200`
- `DeviceManager.tsx:93`：原 `bg-red-50 text-red-600 hover:bg-red-100`
- `FallbackRecipients.tsx:83`：原 `text-red-600 border border-gray-300 … hover:bg-red-50`
- `PersonFormModal.tsx:369`「從名冊刪除此人」：原 `bg-red-100 text-red-700 hover:bg-red-200`
- `PersonFormModal.tsx:374`「⚠ 永久刪除帳號」：原 `bg-red-600 text-white hover:bg-red-700`（它會先開 `DeleteConfirmDialog`，所以自己降級；對話框裡的確認鈕維持紅色實心）

- [ ] **Step 3: 行內確認鈕（真正執行刪除，維持紅色實心）**

`CategoryManager.tsx:49`、`TestUnitManager.tsx:97`、`DeviceManager.tsx:63` 的 `bg-red-500 text-white` 統一改成 `bg-red-600 text-white hover:bg-red-700`。

- [ ] **Step 4: 篩選面板的「✕ 清除全部」**

`FilterSortBar.tsx:579-586` 的 `border border-red-200 text-red-500 bg-white hover:bg-red-50` → `border border-stone-300 text-stone-600 bg-white hover:border-red-300 hover:bg-red-50 hover:text-red-600`

不改：`DeleteConfirmDialog.tsx` 的確認鈕、`ExcelImportModal.tsx:160`「確認覆蓋」與 `:341`「檢視覆蓋影響」（覆蓋模式的紅色是刻意的警示）、`NotifyManager.tsx:308` 與 `RestDaysManager.tsx:51`（已經是灰字、滑鼠移上轉紅）、`FilterSortBar.tsx:353`（同上）。

- [ ] **Step 5: 跑全部測試與型別檢查**

Run：`npm test` 然後 `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS、0 錯誤（測試以按鈕名稱查詢，不看 class）。

- [ ] **Step 6: Commit**

```bash
git -C /f/vsms/vsms-export add src/components/schedule/GanttChart.tsx src/components/schedule/ScheduleListView.tsx src/components/schedule/FilterSortBar.tsx src/components/settings
git -C /f/vsms/vsms-export commit -m "style(ui): delete triggers stay neutral until hovered

Solid red is kept for the buttons that actually perform the delete
(confirm dialog, inline confirm, import overwrite).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 系統字

**Files:**
- Modify: `src/index.css`（`@theme` 區塊內，`--animate-fade-in` 之前）
- Modify: `src/dashboard/styles.ts:5`

- [ ] **Step 1: 加字型 token**

`src/index.css` 的 `@theme { … }` 裡，在 `/* ── 語意別名 ── */` 那組之後、`--animate-fade-in` 之前新增：

```css
  /* ── 字型：三個系統共用，用戶端都是 Windows，不載外部字型 ─────── */
  --font-sans: "Microsoft JhengHei UI", "Microsoft JhengHei", "Segoe UI", system-ui, sans-serif;
  --font-mono: Consolas, "Cascadia Mono", ui-monospace, monospace;
```

（Tailwind v4 的 preflight 用 `--font-sans` 當 `html` 的預設字型，`font-mono` class 用 `--font-mono`。）

- [ ] **Step 2: 匯出 dashboard 字型**

`src/dashboard/styles.ts:5`：

```css
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans TC', sans-serif;
```

改成：

```css
  font-family: 'Microsoft JhengHei UI', 'Microsoft JhengHei', 'Segoe UI', system-ui, sans-serif;
```

- [ ] **Step 3: 跑全部測試**

Run：`npm test`
Expected: PASS。

- [ ] **Step 4: 用 harness 驗證畫面**

用 `F:\.claude\launch.json` 的 `vsms-harness`（vite 5175，綁 127.0.0.1）開 `http://127.0.0.1:5175/_dev-admin.html?role=super_admin`（harness 檔案做法見記憶 vsms-ui-review-2026-09；`_dev-*` 已在 `.git/info/exclude`，驗完刪掉）。確認：甘特圖與列表的狀態是中文；篩選 chip 顯示「已隱藏 已完成、已取消」；列表日期是 `2026-09-29`；刪除圖示平時灰色、滑鼠移上轉紅；字型是微軟正黑體（DevTools computed `font-family`）。截圖附在回報裡。

- [ ] **Step 5: Commit**

```bash
git -C /f/vsms/vsms-export add src/index.css src/dashboard/styles.ts
git -C /f/vsms/vsms-export commit -m "style(ui): use the shared Windows system font stack

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 部署（不屬於實作任務，由使用者決定時間）

1. 備份：`cp -r dist dist.stable-<日期>-pre-ui1`
2. **只跑 `npx vite build`**，不要跑 `npm run build`（後者會連 server 一起編進 `server/dist`）。前端 only，不需要 `pm2 restart vsms`。
3. 驗證：https://172.16.204.69/vsms/ 狀態中文、日期格式、刪除鈕顏色；匯出一次 Agent Excel，確認「狀態」欄仍是英文。
4. 退版：`cp -r dist.stable-<日期>-pre-ui1/. dist/`（原地覆蓋，不要 `rm -rf dist`）。

## 不在這份計畫內

- 甘特圖人員色改調色盤（第 3 項）。
- 剪貼簿表格的狀態文字（貼到 Excel／Word 的資料，另外決定）。
- DatePicker 與時間軸標籤的日期格式。
