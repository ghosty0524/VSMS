# 排程啟動前預告通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** VSMS 排程在啟動前三個日曆天（落在休假日則往前挪）自動寄信通知需求人員，信件內容與副本收件人可依測試單位分別設定。

**Architecture:** 純函式（日期、收件人、範本、規則解析）集中在 `server/src/lib/`，各自對應一支 vitest 測試。`notifyRunner` 透過注入的 `NotifyStore` 與 `Mailer` 介面運作，因此可用假物件完整測試而不碰資料庫與 SMTP。觸發由掛在 `listen` 之後的 `node-cron` 負責，另開一支手動重跑 API 走同一支函式。

**Tech Stack:** TypeScript (ESM, NodeNext)、Express 5、Prisma 7 + MariaDB adapter、vitest、nodemailer、node-cron、React 19 + Zustand + Tailwind。

## Global Constraints

- **設計文件**：`docs/superpowers/specs/2026-08-20-schedule-advance-notification-design.md`。有衝突以設計文件為準。
- **日期格式一律 `YYYY/MM/DD`（斜線）**。`schedules.startDate`、`schedules.endDate`、`RestDaysConfig.specificDates` 都是這個格式，不做轉換。
- **ESM import 一律帶 `.js` 副檔名**（`import { x } from '../lib/y.js'`），即使原始檔是 `.ts`。這是 NodeNext 的要求，違反會在執行期炸掉。
- **不得執行 `npx prisma migrate dev`** — 它會要求 reset 資料庫。schema 變更一律以 `npx prisma db execute` 手動施作 additive DDL。
- **不得執行 `npm run build`** — 它會重建 `dist/`，而正式常駐程序（port 3001）即時從磁碟服務 `dist/`。型別檢查改用 `npx tsc -p server/tsconfig.json --noEmit`。
- **不得動 port 3001 的常駐程序**。需要跑 server 時用 `PORT=3002 npx tsx watch server/src/index.ts`。
- **前端既有 9 個 `tsc` 型別錯誤**（`App.tsx`、`ScheduleFormModal.tsx`、`GanttChart.tsx`、`LoadSection.tsx`、`RestDaysManager.tsx`、`main.tsx`、`excel-diff.test.ts`）。這些是既有問題，不要順手修，但也不要新增任何一個。
- **測試指令**：後端 `npx vitest run --config server/vitest.config.ts`，前端 `npx vitest run`，兩者一起 `npm run test:all`。
- **commit 訊息**：結尾加 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。直接 commit 到目前分支 `feat/guest-role-and-uiux`，不另開分支，不推 GitHub。

---

### Task 1: 抽出共用的台灣今日日期函式

`todayTaipei()` 目前藏在 `server/src/routes/integration.ts` 裡。通知功能也要用它，但 lib 不該 import route。先抽出來，順便讓它可注入時間以便測試。

**Files:**
- Create: `server/src/lib/today.ts`
- Create: `server/src/__tests__/today.test.ts`
- Modify: `server/src/routes/integration.ts`（刪除本地 `todayTaipei`，改 import）

**Interfaces:**
- Consumes: 無
- Produces: `todayTaipei(now?: Date): string` — 回傳 `YYYY/MM/DD`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/today.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { todayTaipei } from '../lib/today.js'

describe('todayTaipei', () => {
  it('returns the Taiwan calendar date as YYYY/MM/DD', () => {
    // 2026-08-20T03:00:00Z = 2026/08/20 11:00 台灣時間
    expect(todayTaipei(new Date('2026-08-20T03:00:00Z'))).toBe('2026/08/20')
  })

  it('is still the next Taiwan day just after UTC 16:00', () => {
    // 2026-08-20T16:00:00Z = 2026/08/21 00:00 台灣時間
    expect(todayTaipei(new Date('2026-08-20T16:00:00Z'))).toBe('2026/08/21')
  })

  it('is still the same Taiwan day just before UTC 16:00', () => {
    // 2026-08-20T15:59:00Z = 2026/08/20 23:59 台灣時間
    expect(todayTaipei(new Date('2026-08-20T15:59:00Z'))).toBe('2026/08/20')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/today.test.ts`

Expected: FAIL — `Failed to resolve import "../lib/today.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/lib/today.ts`：

```ts
// startDate/endDate 是台灣本地的日曆日期，所以「今天」也必須是台灣日期。
// 用 UTC 日期會讓台灣時間 00:00–08:00 之間的每個比較都早一天。
export function todayTaipei(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '/')
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/today.test.ts`

Expected: PASS（3 passed）

- [ ] **Step 5: 讓 integration.ts 改用共用版本**

在 `server/src/routes/integration.ts` 的 import 區塊加入：

```ts
import { todayTaipei } from '../lib/today.js';
```

然後刪除檔案中這一整段本地定義（含上方註解）：

```ts
// startDate/endDate are Taiwan-local calendar dates, so "today" has to be the
// Taiwan date too. Using the UTC date made every comparison a day early between
// 00:00 and 08:00 Taiwan time, which shifted the overdue / inProgress boundary.
function todayTaipei(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '/');
}
```

檔案中所有 `todayTaipei()` 的呼叫點都不用改（新函式的參數有預設值）。

- [ ] **Step 6: 跑完整後端測試與型別檢查**

Run: `npx vitest run --config server/vitest.config.ts`

Expected: PASS，測試數為原本的 98 + 3 = 101

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: 無輸出（exit 0）

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/today.ts server/src/__tests__/today.test.ts server/src/routes/integration.ts
git commit -m "refactor(server): extract todayTaipei into a shared lib module"
```

---

### Task 2: 寄信日計算

**Files:**
- Create: `server/src/lib/notifyDate.ts`
- Create: `server/src/__tests__/notifyDate.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `interface RestDaySettings { weekends: boolean; specificDates: string[] }`
  - `MAX_STEP_BACK_DAYS: number`（值為 30）
  - `isRestDay(ymd: string, settings: RestDaySettings): boolean`
  - `addDays(ymd: string, delta: number): string`
  - `daysBetween(fromYmd: string, toYmd: string): number`
  - `computeSendDate(startDate: string, leadDays: number, settings: RestDaySettings): string | null` — 超過往前挪上限時回傳 `null`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/notifyDate.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { computeSendDate, isRestDay, addDays, daysBetween } from '../lib/notifyDate.js'

const weekendsOnly = { weekends: true, specificDates: [] as string[] }
const noRest = { weekends: false, specificDates: [] as string[] }

describe('addDays', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(addDays('2026/08/31', 1)).toBe('2026/09/01')
    expect(addDays('2026/09/01', -1)).toBe('2026/08/31')
  })
  it('moves across a year boundary', () => {
    expect(addDays('2027/01/01', -1)).toBe('2026/12/31')
  })
  it('handles a leap day', () => {
    expect(addDays('2028/02/28', 1)).toBe('2028/02/29')
  })
})

describe('daysBetween', () => {
  it('counts whole days forward across a month boundary', () => {
    expect(daysBetween('2026/08/21', '2026/09/02')).toBe(12)
  })
  it('returns 0 for the same day and a negative count going backwards', () => {
    expect(daysBetween('2026/08/21', '2026/08/21')).toBe(0)
    expect(daysBetween('2026/08/24', '2026/08/21')).toBe(-3)
  })
})

describe('isRestDay', () => {
  it('treats Saturday and Sunday as rest days when weekends is on', () => {
    expect(isRestDay('2026/08/22', weekendsOnly)).toBe(true)  // 週六
    expect(isRestDay('2026/08/23', weekendsOnly)).toBe(true)  // 週日
    expect(isRestDay('2026/08/21', weekendsOnly)).toBe(false) // 週五
  })
  it('ignores weekends when the flag is off', () => {
    expect(isRestDay('2026/08/22', noRest)).toBe(false)
  })
  it('treats a listed specific date as a rest day regardless of the weekend flag', () => {
    expect(isRestDay('2026/08/21', { weekends: false, specificDates: ['2026/08/21'] })).toBe(true)
  })
})

describe('computeSendDate', () => {
  it('subtracts calendar days when the result is a workday', () => {
    // 2026/08/24 是週一 → 減 3 天 = 08/21 週五，是工作日
    expect(computeSendDate('2026/08/24', 3, weekendsOnly)).toBe('2026/08/21')
  })

  it('steps back off a weekend', () => {
    // 2026/08/26 是週三 → 減 3 天 = 08/23 週日 → 往前挪到 08/21 週五
    expect(computeSendDate('2026/08/26', 3, weekendsOnly)).toBe('2026/08/21')
  })

  it('steps back past a consecutive holiday block', () => {
    // 08/21(五) 與 08/20(四) 都是特定休息日 → 一路挪到 08/19(三)
    const settings = { weekends: true, specificDates: ['2026/08/20', '2026/08/21'] }
    expect(computeSendDate('2026/08/26', 3, settings)).toBe('2026/08/19')
  })

  it('does not step back at all when weekends are not rest days', () => {
    expect(computeSendDate('2026/08/26', 3, noRest)).toBe('2026/08/23')
  })

  it('crosses a year boundary', () => {
    expect(computeSendDate('2027/01/04', 3, noRest)).toBe('2027/01/01')
  })

  it('returns null when every candidate day within the cap is a rest day', () => {
    // 從 2026/08/23 起往前 40 天全部列為休息日 → 超過 30 天上限
    const dates: string[] = []
    let d = '2026/08/23'
    for (let i = 0; i < 40; i++) { dates.push(d); d = addDays(d, -1) }
    expect(computeSendDate('2026/08/26', 3, { weekends: true, specificDates: dates })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyDate.test.ts`

Expected: FAIL — `Failed to resolve import "../lib/notifyDate.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/lib/notifyDate.ts`：

```ts
export interface RestDaySettings {
  weekends: boolean
  /** YYYY/MM/DD */
  specificDates: string[]
}

/**
 * specificDates 是管理者手填的清單。貼錯一段連續日期時，無上限的往前挪迴圈
 * 會卡死整個 process — 而它與前端服務跑在同一個 process 裡。超過這個上限
 * 視為設定異常，由呼叫端記錄並跳過該筆。
 */
export const MAX_STEP_BACK_DAYS = 30

function toUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('/').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

export function addDays(ymd: string, delta: number): string {
  const d = toUtc(ymd)
  d.setUTCDate(d.getUTCDate() + delta)
  return fromUtc(d)
}

/** toYmd 減 fromYmd 的整天數；toYmd 較早時回傳負值。 */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((toUtc(toYmd).getTime() - toUtc(fromYmd).getTime()) / 86_400_000)
}

export function isRestDay(ymd: string, settings: RestDaySettings): boolean {
  if (settings.weekends) {
    const dow = toUtc(ymd).getUTCDay()
    if (dow === 0 || dow === 6) return true
  }
  return settings.specificDates.includes(ymd)
}

/**
 * 先減 leadDays 個日曆天，落在休息日再逐日往前挪。
 * 回傳 null 表示連續休息日超過 MAX_STEP_BACK_DAYS，屬設定異常。
 */
export function computeSendDate(
  startDate: string,
  leadDays: number,
  settings: RestDaySettings,
): string | null {
  let d = addDays(startDate, -leadDays)
  for (let stepped = 0; stepped <= MAX_STEP_BACK_DAYS; stepped++) {
    if (!isRestDay(d, settings)) return d
    d = addDays(d, -1)
  }
  return null
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyDate.test.ts`

Expected: PASS（14 passed）

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/notifyDate.ts server/src/__tests__/notifyDate.test.ts
git commit -m "feat(notify): compute the send date, stepping back off rest days"
```

---

### Task 3: 收件人解析

**Files:**
- Create: `server/src/lib/notifyRecipients.ts`
- Create: `server/src/__tests__/notifyRecipients.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `interface ResolvedRecipients { addresses: string[]; unresolved: string[] }`
  - `resolveRecipients(raw: string, mailDomain: string): ResolvedRecipients`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/notifyRecipients.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { resolveRecipients } from '../lib/notifyRecipients.js'

const DOMAIN = 'example.com.tw'

describe('resolveRecipients', () => {
  it('appends the domain to a single account name', () => {
    expect(resolveRecipients('Amy_Chen', DOMAIN)).toEqual({
      addresses: ['Amy_Chen@example.com.tw'],
      unresolved: [],
    })
  })

  it('splits on comma, ideographic comma, semicolon and whitespace', () => {
    const r = resolveRecipients('Amy_Chen, Kevin_Yu、Grace_Chen; Will_Wang Ben_Lin', DOMAIN)
    expect(r.addresses).toEqual([
      'Amy_Chen@example.com.tw',
      'Kevin_Yu@example.com.tw',
      'Grace_Chen@example.com.tw',
      'Will_Wang@example.com.tw',
      'Ben_Lin@example.com.tw',
    ])
    expect(r.unresolved).toEqual([])
  })

  it('splits on fullwidth comma and fullwidth semicolon', () => {
    const r = resolveRecipients('Amy_Chen，Kevin_Yu；Grace_Chen', DOMAIN)
    expect(r.addresses).toHaveLength(3)
  })

  it('passes through a token that already contains @ without appending the domain', () => {
    const r = resolveRecipients('wang@other.com, Amy_Chen', DOMAIN)
    expect(r.addresses).toEqual(['wang@other.com', 'Amy_Chen@example.com.tw'])
  })

  it('deduplicates case-insensitively, keeping the first spelling', () => {
    const r = resolveRecipients('Amy_Chen, amy_chen, Amy_Chen', DOMAIN)
    expect(r.addresses).toEqual(['Amy_Chen@example.com.tw'])
  })

  it('ignores empty tokens left by trailing or doubled separators', () => {
    const r = resolveRecipients(' , Amy_Chen ,, ', DOMAIN)
    expect(r.addresses).toEqual(['Amy_Chen@example.com.tw'])
    expect(r.unresolved).toEqual([])
  })

  it('reports a token that cannot form a valid address as unresolved', () => {
    const r = resolveRecipients('Amy_Chen, 王小明@, @broken', DOMAIN)
    expect(r.addresses).toEqual(['Amy_Chen@example.com.tw'])
    expect(r.unresolved).toEqual(['王小明@', '@broken'])
  })

  it('reports every token as unresolved when the domain is blank', () => {
    const r = resolveRecipients('Amy_Chen, Kevin_Yu', '')
    expect(r.addresses).toEqual([])
    expect(r.unresolved).toEqual(['Amy_Chen', 'Kevin_Yu'])
  })

  it('returns empty results for an empty field', () => {
    expect(resolveRecipients('', DOMAIN)).toEqual({ addresses: [], unresolved: [] })
    expect(resolveRecipients('   ', DOMAIN)).toEqual({ addresses: [], unresolved: [] })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRecipients.test.ts`

Expected: FAIL — `Failed to resolve import "../lib/notifyRecipients.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/lib/notifyRecipients.ts`：

```ts
export interface ResolvedRecipients {
  addresses: string[]
  /** 無法組成有效地址的原始 token，供 UI 提示管理者 */
  unresolved: string[]
}

// 半形/全形逗號、頓號、半形/全形分號，以及任何空白
const SEPARATORS = /[,，、;；\s]+/

const VALID_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * requiredPersonnel 是自由文字，內容為對齊後的公司帳號名。
 *
 * 已含 @ 的 token 原樣視為完整 email：對齊作業是人工進行的，過渡期必然出現
 * 混雜格式，硬拼 domain 會產出 wang@x.com@example.com 這種寄不出去又不易
 * 察覺的地址。
 */
export function resolveRecipients(raw: string, mailDomain: string): ResolvedRecipients {
  const addresses: string[] = []
  const unresolved: string[] = []
  const seen = new Set<string>()

  for (const token of (raw ?? '').split(SEPARATORS)) {
    const name = token.trim()
    if (!name) continue

    const candidate = name.includes('@') ? name : (mailDomain ? `${name}@${mailDomain}` : name)
    if (!VALID_ADDRESS.test(candidate)) {
      if (!unresolved.includes(name)) unresolved.push(name)
      continue
    }
    const key = candidate.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    addresses.push(candidate)
  }

  return { addresses, unresolved }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRecipients.test.ts`

Expected: PASS（9 passed）

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/notifyRecipients.ts server/src/__tests__/notifyRecipients.test.ts
git commit -m "feat(notify): resolve requiredPersonnel free text into mail addresses"
```

---

### Task 4: 範本變數插值與驗證

**Files:**
- Create: `server/src/lib/notifyTemplate.ts`
- Create: `server/src/__tests__/notifyTemplate.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `TEMPLATE_VARS: readonly string[]`
  - `type TemplateVar`
  - `type TemplateVars = Record<TemplateVar, string>`
  - `validateTemplate(template: string): { ok: true } | { ok: false; unknown: string[] }`
  - `renderTemplate(template: string, vars: TemplateVars): string`
  - `escapeHtml(value: string): string`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/notifyTemplate.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { validateTemplate, renderTemplate, escapeHtml, TEMPLATE_VARS } from '../lib/notifyTemplate.js'
import type { TemplateVars } from '../lib/notifyTemplate.js'

const vars: TemplateVars = {
  projectName: 'Falcon-X 車載模組',
  taskDescription: '高低溫循環測試',
  category: 'NPI',
  testUnit: 'EMC',
  testEngineer: 'Darius_Chang',
  device: 'Chamber-A',
  startDate: '2026/08/26',
  endDate: '2026/09/02',
  timeResource: '5',
  requiredPersonnel: 'Amy_Chen, Kevin_Yu',
  daysUntilStart: '3',
  systemUrl: 'https://vsms.local:3001',
}

describe('validateTemplate', () => {
  it('accepts a template using only whitelisted variables', () => {
    expect(validateTemplate('{{projectName}} 於 {{startDate}} 啟動')).toEqual({ ok: true })
  })
  it('accepts a template with no variables at all', () => {
    expect(validateTemplate('請提前備妥樣品。')).toEqual({ ok: true })
  })
  it('rejects an unknown variable and names it', () => {
    expect(validateTemplate('{{projectNmae}} 啟動')).toEqual({ ok: false, unknown: ['projectNmae'] })
  })
  it('reports each unknown variable once, in order of first appearance', () => {
    const r = validateTemplate('{{foo}} {{bar}} {{foo}}')
    expect(r).toEqual({ ok: false, unknown: ['foo', 'bar'] })
  })
  it('tolerates whitespace inside the braces', () => {
    expect(validateTemplate('{{ projectName }}')).toEqual({ ok: true })
  })
  it('lists every documented variable as valid', () => {
    for (const name of TEMPLATE_VARS) {
      expect(validateTemplate(`{{${name}}}`)).toEqual({ ok: true })
    }
  })
})

describe('renderTemplate', () => {
  it('substitutes whitelisted variables', () => {
    expect(renderTemplate('{{projectName}} / {{testUnit}}', vars))
      .toBe('Falcon-X 車載模組 / EMC')
  })
  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplate('{{ startDate }}', vars)).toBe('2026/08/26')
  })
  it('leaves an unknown placeholder untouched rather than emitting undefined', () => {
    expect(renderTemplate('{{nope}} 啟動', vars)).toBe('{{nope}} 啟動')
  })
  it('returns an empty string for an empty template', () => {
    expect(renderTemplate('', vars)).toBe('')
  })
})

describe('escapeHtml', () => {
  it('escapes the five characters that break HTML', () => {
    expect(escapeHtml(`<a href="x" alt='y'>&`))
      .toBe('&lt;a href=&quot;x&quot; alt=&#39;y&#39;&gt;&amp;')
  })
  it('escapes ampersands before the other entities', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Falcon-X 車載模組')).toBe('Falcon-X 車載模組')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyTemplate.test.ts`

Expected: FAIL — `Failed to resolve import "../lib/notifyTemplate.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/lib/notifyTemplate.ts`：

```ts
export const TEMPLATE_VARS = [
  'projectName', 'taskDescription', 'category', 'testUnit', 'testEngineer',
  'device', 'startDate', 'endDate', 'timeResource', 'requiredPersonnel',
  'daysUntilStart', 'systemUrl',
] as const

export type TemplateVar = typeof TEMPLATE_VARS[number]
export type TemplateVars = Record<TemplateVar, string>

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g
const KNOWN = new Set<string>(TEMPLATE_VARS)

/**
 * 存檔時執行，不是寄出時。管理者把變數名打錯必須當場被擋下 —— 等到寄出才
 * 發現，那批信已經寄出去了。
 */
export function validateTemplate(template: string): { ok: true } | { ok: false; unknown: string[] } {
  const unknown: string[] = []
  for (const m of (template ?? '').matchAll(PLACEHOLDER)) {
    const name = m[1]
    if (!KNOWN.has(name) && !unknown.includes(name)) unknown.push(name)
  }
  return unknown.length ? { ok: false, unknown } : { ok: true }
}

/** 未知變數原樣保留，不輸出 undefined —— 破綻要看得見，不要靜默吞掉。 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return (template ?? '').replace(PLACEHOLDER, (whole, name: string) =>
    KNOWN.has(name) ? vars[name as TemplateVar] ?? '' : whole)
}

export function escapeHtml(value: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyTemplate.test.ts`

Expected: PASS（13 passed）

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/notifyTemplate.ts server/src/__tests__/notifyTemplate.test.ts
git commit -m "feat(notify): whitelist-based template interpolation with save-time validation"
```

---

### Task 5: 測試單位規則解析（覆寫式繼承）

**Files:**
- Create: `server/src/lib/notifyRule.ts`
- Create: `server/src/__tests__/notifyRule.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `interface NotifyRuleRow { id: string; testUnit: string | null; enabled: boolean; subjectTemplate: string | null; introTemplate: string | null; outroTemplate: string | null; ccRecipients: string }`
  - `interface ResolvedRule { enabled: boolean; subject: string; intro: string; outro: string; ccRaw: string }`
  - `resolveRule(testUnit: string, rules: NotifyRuleRow[]): ResolvedRule | null`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/notifyRule.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { resolveRule } from '../lib/notifyRule.js'
import type { NotifyRuleRow } from '../lib/notifyRule.js'

const defaultRule: NotifyRuleRow = {
  id: 'default',
  testUnit: null,
  enabled: true,
  subjectTemplate: '[VSMS 排程預告] {{projectName}}',
  introTemplate: '以下排程即將啟動：',
  outroTemplate: '如有疑問請洽測試部。',
  ccRecipients: 'dept_head',
}

const emcRule: NotifyRuleRow = {
  id: 'emc',
  testUnit: 'EMC',
  enabled: true,
  subjectTemplate: null,
  introTemplate: 'EMC 單位提醒：請於測試前完成樣品備妥。',
  outroTemplate: null,
  ccRecipients: 'emc_window',
}

describe('resolveRule', () => {
  it('falls back to the default rule when the unit has none', () => {
    const r = resolveRule('RF', [defaultRule])
    expect(r).toEqual({
      enabled: true,
      subject: '[VSMS 排程預告] {{projectName}}',
      intro: '以下排程即將啟動：',
      outro: '如有疑問請洽測試部。',
      ccRaw: 'dept_head',
    })
  })

  it('uses the unit value where set and the default where null', () => {
    const r = resolveRule('EMC', [defaultRule, emcRule])
    expect(r?.subject).toBe('[VSMS 排程預告] {{projectName}}')     // null → 沿用預設
    expect(r?.intro).toBe('EMC 單位提醒：請於測試前完成樣品備妥。') // 覆寫
    expect(r?.outro).toBe('如有疑問請洽測試部。')                   // null → 沿用預設
  })

  it('treats an empty string as a deliberate blank, not as inherit', () => {
    const blanked: NotifyRuleRow = { ...emcRule, outroTemplate: '' }
    expect(resolveRule('EMC', [defaultRule, blanked])?.outro).toBe('')
  })

  it('concatenates the default cc with the unit cc', () => {
    expect(resolveRule('EMC', [defaultRule, emcRule])?.ccRaw).toBe('dept_head, emc_window')
  })

  it('omits the separator when one side has no cc', () => {
    const noCc: NotifyRuleRow = { ...emcRule, ccRecipients: '' }
    expect(resolveRule('EMC', [defaultRule, noCc])?.ccRaw).toBe('dept_head')
    const noDefaultCc: NotifyRuleRow = { ...defaultRule, ccRecipients: '' }
    expect(resolveRule('EMC', [noDefaultCc, emcRule])?.ccRaw).toBe('emc_window')
  })

  it('reports the unit rule as disabled even when the default is enabled', () => {
    const off: NotifyRuleRow = { ...emcRule, enabled: false }
    expect(resolveRule('EMC', [defaultRule, off])?.enabled).toBe(false)
  })

  it('uses the default enabled flag for a unit with no rule of its own', () => {
    const off: NotifyRuleRow = { ...defaultRule, enabled: false }
    expect(resolveRule('RF', [off])?.enabled).toBe(false)
  })

  it('returns null when no default rule exists', () => {
    expect(resolveRule('EMC', [emcRule])).toBeNull()
  })

  it('treats a null template on the default rule as an empty string', () => {
    const bare: NotifyRuleRow = { ...defaultRule, introTemplate: null, outroTemplate: null }
    const r = resolveRule('RF', [bare])
    expect(r?.intro).toBe('')
    expect(r?.outro).toBe('')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRule.test.ts`

Expected: FAIL — `Failed to resolve import "../lib/notifyRule.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/lib/notifyRule.ts`：

```ts
export interface NotifyRuleRow {
  id: string
  /** null = 預設規則 */
  testUnit: string | null
  enabled: boolean
  /** null = 沿用預設規則；空字串 = 刻意留白 */
  subjectTemplate: string | null
  introTemplate: string | null
  outroTemplate: string | null
  ccRecipients: string
}

export interface ResolvedRule {
  enabled: boolean
  subject: string
  intro: string
  outro: string
  /** 預設副本與單位副本串接後的原始字串，交給 resolveRecipients 切分去重 */
  ccRaw: string
}

/**
 * 覆寫式繼承：單位規則欄位為 null 時沿用預設規則。
 *
 * 刻意不做成複製式（每單位一份完整範本）—— 那樣共同措辭改一次要改 N 次，
 * 各單位內容必然逐漸漂移。
 */
export function resolveRule(testUnit: string, rules: NotifyRuleRow[]): ResolvedRule | null {
  const fallback = rules.find(r => r.testUnit === null)
  if (!fallback) return null

  const unit = rules.find(r => r.testUnit === testUnit) ?? null
  const inherit = (a: string | null, b: string | null) => (a !== null ? a : b) ?? ''

  const ccParts = [fallback.ccRecipients, unit?.ccRecipients ?? '']
    .map(s => s.trim())
    .filter(Boolean)

  return {
    enabled: unit ? unit.enabled : fallback.enabled,
    subject: inherit(unit?.subjectTemplate ?? null, fallback.subjectTemplate),
    intro: inherit(unit?.introTemplate ?? null, fallback.introTemplate),
    outro: inherit(unit?.outroTemplate ?? null, fallback.outroTemplate),
    ccRaw: ccParts.join(', '),
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRule.test.ts`

Expected: PASS（9 passed）

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/notifyRule.ts server/src/__tests__/notifyRule.test.ts
git commit -m "feat(notify): resolve per-test-unit rules with override-style inheritance"
```

---

### Task 6: 信件內容組裝（固定版型 + 可編輯段落）

**Files:**
- Create: `server/src/lib/notifyMailBody.ts`
- Create: `server/src/__tests__/notifyMailBody.test.ts`

**Interfaces:**
- Consumes: `TemplateVars`、`renderTemplate`、`escapeHtml`（Task 4）、`ResolvedRule`（Task 5）
- Produces:
  - `interface ScheduleForMail { projectName: string; taskDescription: string; category: string; testUnit: string; testEngineer: string; device: string; startDate: string; endDate: string; timeResource: number; requiredPersonnel: string }`
  - `buildTemplateVars(s: ScheduleForMail, systemUrl: string, daysUntilStart: number): TemplateVars`
  - `buildMailBody(rule: ResolvedRule, s: ScheduleForMail, vars: TemplateVars): { subject: string; text: string; html: string }`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/notifyMailBody.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildTemplateVars, buildMailBody } from '../lib/notifyMailBody.js'
import type { ScheduleForMail } from '../lib/notifyMailBody.js'
import type { ResolvedRule } from '../lib/notifyRule.js'

const schedule: ScheduleForMail = {
  projectName: 'Falcon-X 車載模組',
  taskDescription: '高低溫循環測試',
  category: 'NPI',
  testUnit: 'EMC',
  testEngineer: 'Darius_Chang',
  device: 'Chamber-A',
  startDate: '2026/08/26',
  endDate: '2026/09/02',
  timeResource: 5,
  requiredPersonnel: 'Amy_Chen, Kevin_Yu',
}

const rule: ResolvedRule = {
  enabled: true,
  subject: '[VSMS 排程預告] {{projectName}} 將於 {{startDate}} 啟動',
  intro: '{{testUnit}} 單位提醒：請於測試前完成樣品備妥。',
  outro: '如需異動請洽窗口。',
  ccRaw: '',
}

const vars = buildTemplateVars(schedule, 'https://vsms.local:3001', 3)

describe('buildTemplateVars', () => {
  it('stringifies timeResource and daysUntilStart', () => {
    expect(vars.timeResource).toBe('5')
    expect(vars.daysUntilStart).toBe('3')
  })
  it('carries the schedule fields through unchanged', () => {
    expect(vars.projectName).toBe('Falcon-X 車載模組')
    expect(vars.systemUrl).toBe('https://vsms.local:3001')
  })
})

describe('buildMailBody', () => {
  it('renders the subject template', () => {
    expect(buildMailBody(rule, schedule, vars).subject)
      .toBe('[VSMS 排程預告] Falcon-X 車載模組 將於 2026/08/26 啟動')
  })

  it('puts intro before the data table and outro after it, in the text version', () => {
    const { text } = buildMailBody(rule, schedule, vars)
    expect(text).toContain('EMC 單位提醒：請於測試前完成樣品備妥。')
    expect(text.indexOf('EMC 單位提醒')).toBeLessThan(text.indexOf('測試工程師'))
    expect(text.indexOf('測試工程師')).toBeLessThan(text.indexOf('如需異動請洽窗口。'))
  })

  it('includes every fixed table field in the text version', () => {
    const { text } = buildMailBody(rule, schedule, vars)
    for (const label of ['專案名稱', '測試單位', '測試工程師', '機台', '任務說明', '起迄日期', '工時']) {
      expect(text).toContain(label)
    }
    expect(text).toContain('Chamber-A')
    expect(text).toContain('2026/08/26 ~ 2026/09/02')
  })

  it('appends the system link to both versions', () => {
    const { text, html } = buildMailBody(rule, schedule, vars)
    expect(text).toContain('https://vsms.local:3001')
    expect(html).toContain('href="https://vsms.local:3001"')
  })

  it('escapes angle brackets from schedule data in the HTML version', () => {
    const risky = { ...schedule, projectName: 'Falcon<X>' }
    const riskyVars = buildTemplateVars(risky, 'https://vsms.local:3001', 3)
    const { html } = buildMailBody(rule, risky, riskyVars)
    expect(html).toContain('Falcon&lt;X&gt;')
    expect(html).not.toContain('<X>')
  })

  it('omits the intro block entirely when the template is blank', () => {
    const blank: ResolvedRule = { ...rule, intro: '', outro: '' }
    const { text, html } = buildMailBody(blank, schedule, vars)
    expect(text).not.toContain('\n\n\n')
    expect(html).not.toContain('<p></p>')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyMailBody.test.ts`

Expected: FAIL — `Failed to resolve import "../lib/notifyMailBody.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/lib/notifyMailBody.ts`：

```ts
import { renderTemplate, escapeHtml } from './notifyTemplate.js'
import type { TemplateVars } from './notifyTemplate.js'
import type { ResolvedRule } from './notifyRule.js'

export interface ScheduleForMail {
  projectName: string
  taskDescription: string
  category: string
  testUnit: string
  testEngineer: string
  device: string
  startDate: string
  endDate: string
  timeResource: number
  requiredPersonnel: string
}

export function buildTemplateVars(
  s: ScheduleForMail,
  systemUrl: string,
  daysUntilStart: number,
): TemplateVars {
  return {
    projectName: s.projectName ?? '',
    taskDescription: s.taskDescription ?? '',
    category: s.category ?? '',
    testUnit: s.testUnit ?? '',
    testEngineer: s.testEngineer ?? '',
    device: s.device ?? '',
    startDate: s.startDate ?? '',
    endDate: s.endDate ?? '',
    timeResource: String(s.timeResource ?? ''),
    requiredPersonnel: s.requiredPersonnel ?? '',
    daysUntilStart: String(daysUntilStart),
    systemUrl: systemUrl ?? '',
  }
}

/**
 * 資料表格由程式固定產生，不經範本 —— 管理者只能改主旨與前後文字段落，
 * 因此改不壞版面，而各單位的差異本來就集中在提醒詞。
 */
function tableRows(s: ScheduleForMail): Array<[string, string]> {
  return [
    ['專案名稱', s.projectName ?? ''],
    ['測試單位', s.testUnit ?? ''],
    ['測試工程師', s.testEngineer ?? ''],
    ['機台', s.device ?? ''],
    ['任務說明', s.taskDescription ?? ''],
    ['起迄日期', `${s.startDate} ~ ${s.endDate}`],
    ['工時', `${s.timeResource} 人天`],
  ]
}

export function buildMailBody(
  rule: ResolvedRule,
  s: ScheduleForMail,
  vars: TemplateVars,
): { subject: string; text: string; html: string } {
  const subject = renderTemplate(rule.subject, vars)
  const intro = renderTemplate(rule.intro, vars)
  const outro = renderTemplate(rule.outro, vars)
  const rows = tableRows(s)
  const url = vars.systemUrl

  const textParts = [
    intro,
    rows.map(([label, value]) => `${label}：${value}`).join('\n'),
    outro,
    url ? `系統連結：${url}` : '',
  ].filter(Boolean)

  const htmlParts = [
    intro ? `<p>${escapeHtml(intro)}</p>` : '',
    '<table cellpadding="6" cellspacing="0" border="0">' +
      rows.map(([label, value]) =>
        `<tr><td style="color:#666">${escapeHtml(label)}</td>` +
        `<td>${escapeHtml(value)}</td></tr>`).join('') +
      '</table>',
    outro ? `<p>${escapeHtml(outro)}</p>` : '',
    url ? `<p><a href="${escapeHtml(url)}">在 VSMS 中檢視</a></p>` : '',
  ].filter(Boolean)

  return {
    subject,
    text: textParts.join('\n\n'),
    html: htmlParts.join('\n'),
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyMailBody.test.ts`

Expected: PASS（8 passed）

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/notifyMailBody.ts server/src/__tests__/notifyMailBody.test.ts
git commit -m "feat(notify): build mail bodies from a fixed layout plus editable text blocks"
```

---

### Task 7: 資料庫 schema 與預設資料

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/manual/2026-08-20-notify.sql`
- Modify: `server/src/lib/storage.ts`（`initDb` 內補預設資料）

**Interfaces:**
- Consumes: 無
- Produces: prisma models `NotificationLog`、`NotifyRule`，以及 `NotifyConfig` 的 `leadDays` / `catchUpDays` / `mailDomain` 欄位

- [ ] **Step 1: 修改 prisma schema**

在 `prisma/schema.prisma` 的 `NotifyConfig` model 內，於 `systemUrl` 之後、`recipients` 之前插入三行：

```prisma
  leadDays        Int         @default(3)
  catchUpDays     Int         @default(3)
  mailDomain      String      @db.VarChar(100) @default("")
```

然後在檔案末端（`Device` model 之後）附加兩個新 model：

```prisma
model NotificationLog {
  id           String    @id @default(uuid())
  scheduleId   String    @db.VarChar(36)
  sendDate     String    @db.VarChar(10)
  status       String    @db.VarChar(20)
  recipients   String    @db.Text
  errorMessage String?   @db.Text
  attempts     Int       @default(0)
  sentAt       DateTime?
  createdAt    DateTime  @default(now())

  @@unique([scheduleId, sendDate])
  @@index([sendDate])
  @@map("notification_logs")
}

model NotifyRule {
  id              String   @id @default(uuid())
  testUnit        String?  @unique @db.VarChar(100)
  enabled         Boolean  @default(true)
  subjectTemplate String?  @db.Text
  introTemplate   String?  @db.Text
  outroTemplate   String?  @db.Text
  ccRecipients    String   @db.Text
  updatedAt       DateTime @updatedAt

  @@map("notify_rules")
}
```

- [ ] **Step 2: 寫手動 DDL**

建立目錄與檔案 `prisma/migrations/manual/2026-08-20-notify.sql`：

```sql
-- 排程啟動前預告通知。全部為 additive：新表 + 既有表加欄位。
-- MCP_API 用 Dapper，缺欄位是靜默失敗，因此絕不改動或移除既有欄位。
-- 不可用 prisma migrate dev（會要求 reset）；以 prisma db execute 施作。

ALTER TABLE `notify_config`
  ADD COLUMN `leadDays` INT NOT NULL DEFAULT 3,
  ADD COLUMN `catchUpDays` INT NOT NULL DEFAULT 3,
  ADD COLUMN `mailDomain` VARCHAR(100) NOT NULL DEFAULT '';

CREATE TABLE `notification_logs` (
  `id`           VARCHAR(191) NOT NULL,
  `scheduleId`   VARCHAR(36)  NOT NULL,
  `sendDate`     VARCHAR(10)  NOT NULL,
  `status`       VARCHAR(20)  NOT NULL,
  `recipients`   TEXT         NOT NULL,
  `errorMessage` TEXT         NULL,
  `attempts`     INT          NOT NULL DEFAULT 0,
  `sentAt`       DATETIME(3)  NULL,
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_logs_scheduleId_sendDate_key` (`scheduleId`, `sendDate`),
  KEY `notification_logs_sendDate_idx` (`sendDate`)
) DEFAULT CHARSET=utf8mb4;

CREATE TABLE `notify_rules` (
  `id`              VARCHAR(191) NOT NULL,
  `testUnit`        VARCHAR(100) NULL,
  `enabled`         TINYINT(1)   NOT NULL DEFAULT 1,
  `subjectTemplate` TEXT         NULL,
  `introTemplate`   TEXT         NULL,
  `outroTemplate`   TEXT         NULL,
  `ccRecipients`    TEXT         NOT NULL,
  `updatedAt`       DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notify_rules_testUnit_key` (`testUnit`)
) DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: 施作 DDL 並重新產生 client**

Run:

```bash
npx prisma db execute --file prisma/migrations/manual/2026-08-20-notify.sql
```

Expected: `Script executed successfully.`

Run:

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: 在 initDb 補預設資料**

在 `server/src/lib/storage.ts` 的 `initDb()` 內，緊接在 `RestDaysConfig` 的 upsert 之後插入：

```ts
  // Ensure NotifyConfig singleton（預設關閉，設定齊全前不寄任何信）
  await prisma.notifyConfig.upsert({
    where: { id: 1 },
    create: { id: 1, enabled: false },
    update: {},
  })

  // Ensure the default NotifyRule (testUnit = null) exists. resolveRule 沒有它
  // 就整批不寄信，所以這筆必須永遠在。
  const defaultRule = await prisma.notifyRule.findFirst({ where: { testUnit: null } })
  if (!defaultRule) {
    await prisma.notifyRule.create({
      data: {
        testUnit: null,
        enabled: true,
        subjectTemplate: '[VSMS 排程預告] {{projectName}} 將於 {{startDate}} 啟動',
        introTemplate: '您好，以下排程將於 {{daysUntilStart}} 天後啟動：',
        outroTemplate: '如需異動請至系統確認。',
        ccRecipients: '',
      },
    })
  }
```

- [ ] **Step 5: 驗證 schema 與程式碼一致**

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: 無輸出（exit 0）

Run: `npx vitest run --config server/vitest.config.ts`

Expected: PASS，測試數 101 + 14 + 9 + 13 + 9 + 8 = 154

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/manual/2026-08-20-notify.sql server/src/lib/storage.ts
git commit -m "feat(notify): add NotificationLog and NotifyRule tables with seeded defaults"
```

---

### Task 8: SMTP 寄信介面

**Files:**
- Create: `server/src/lib/mailer.ts`
- Modify: `package.json`（新增 `nodemailer` 與 `@types/nodemailer`）

**Interfaces:**
- Consumes: 無
- Produces:
  - `interface SendMailInput { to: string[]; cc: string[]; subject: string; text: string; html: string }`
  - `interface Mailer { send(input: SendMailInput): Promise<void> }`
  - `isMailerConfigured(): boolean`
  - `getMailer(): Mailer`

沒有單元測試：這一層只是把設定值交給 nodemailer，測它等於測 nodemailer。真正的驗證管道是 Task 12 的 `POST /api/notify/test`（寄測試信按鈕）。所有可測的邏輯都已經在 Task 2–6 抽成純函式。

- [ ] **Step 1: 安裝相依套件**

Run:

```bash
npm install nodemailer && npm install --save-dev @types/nodemailer
```

Expected: `added N packages`

- [ ] **Step 2: 寫實作**

建立 `server/src/lib/mailer.ts`：

```ts
import 'dotenv/config'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface SendMailInput {
  to: string[]
  cc: string[]
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(input: SendMailInput): Promise<void>
}

const env = () => ({
  host: process.env.SMTP_HOST?.trim() ?? '',
  port: Number(process.env.SMTP_PORT ?? 25),
  secure: process.env.SMTP_SECURE === 'true',
  from: process.env.SMTP_FROM?.trim() ?? '',
  user: process.env.SMTP_USER?.trim() ?? '',
  pass: process.env.SMTP_PASS ?? '',
})

/** SMTP_USER / SMTP_PASS 留空即以匿名轉發連線（多數內部 relay 的情形）。 */
export function isMailerConfigured(): boolean {
  const e = env()
  return Boolean(e.host && e.from)
}

let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (transporter) return transporter
  const e = env()
  if (!e.host || !e.from) {
    throw new Error(
      '[mailer] SMTP is not configured. Set SMTP_HOST and SMTP_FROM in .env.\n' +
      '  SMTP_USER / SMTP_PASS are optional — leave them blank for anonymous relay.'
    )
  }
  transporter = nodemailer.createTransport({
    host: e.host,
    port: e.port,
    secure: e.secure,
    auth: e.user ? { user: e.user, pass: e.pass } : undefined,
  })
  return transporter
}

export function getMailer(): Mailer {
  return {
    async send(input: SendMailInput): Promise<void> {
      await getTransporter().sendMail({
        from: env().from,
        to: input.to.join(', '),
        cc: input.cc.length ? input.cc.join(', ') : undefined,
        subject: input.subject,
        text: input.text,
        html: input.html,
      })
    },
  }
}
```

- [ ] **Step 3: 型別檢查**

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: 無輸出（exit 0）

- [ ] **Step 4: 補上 .env 範例說明**

在 `README.md` 的「正式部署」段落末端附加：

```markdown
### 排程預告通知（SMTP）

```
SMTP_HOST=
SMTP_PORT=25
SMTP_SECURE=false
SMTP_FROM=
SMTP_USER=        # 選填，留空即匿名轉發
SMTP_PASS=        # 選填
```

`SMTP_HOST` 或 `SMTP_FROM` 未設定時，通知功能會停用並在啟動時印出警告，
不會影響系統其他功能。
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/src/lib/mailer.ts README.md
git commit -m "feat(notify): add the SMTP mailer, with anonymous relay as the default"
```

---

### Task 9: 每日執行流程（含冪等與補寄）

**Files:**
- Create: `server/src/lib/notifyRunner.ts`
- Create: `server/src/__tests__/notifyRunner.test.ts`

**Interfaces:**
- Consumes: `todayTaipei`（Task 1）、`computeSendDate` / `RestDaySettings`（Task 2）、`resolveRecipients`（Task 3）、`resolveRule` / `NotifyRuleRow`（Task 5）、`buildTemplateVars` / `buildMailBody` / `ScheduleForMail`（Task 6）、`Mailer` / `SendMailInput`（Task 8）
- Produces:
  - `interface NotifyConfigRow { enabled: boolean; systemUrl: string; leadDays: number; catchUpDays: number; mailDomain: string }`
  - `interface CandidateSchedule extends ScheduleForMail { id: string }`
  - `interface NotificationLogRow { scheduleId: string; sendDate: string; status: string; attempts: number }`
  - `interface LogUpsert { scheduleId: string; sendDate: string; status: string; recipients: string; errorMessage: string | null; attempts: number; sentAt: Date | null }`
  - `interface NotifyStore { loadConfig(): Promise<NotifyConfigRow | null>; loadRestDays(): Promise<RestDaySettings>; loadRules(): Promise<NotifyRuleRow[]>; loadFallbackRecipients(): Promise<string[]>; findCandidates(today: string): Promise<CandidateSchedule[]>; findLogs(scheduleIds: string[]): Promise<NotificationLogRow[]>; upsertLog(entry: LogUpsert): Promise<void> }`
  - `interface RunResult { checked: number; sent: number; failed: number; skipped: number; errors: Array<{ scheduleId: string; message: string }> }`
  - `MAX_ATTEMPTS: number`（值為 3）
  - `runDailyNotify(store: NotifyStore, mailer: Mailer, now?: Date): Promise<RunResult>`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/notifyRunner.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { runDailyNotify } from '../lib/notifyRunner.js'
import type { NotifyStore, NotifyConfigRow, CandidateSchedule, NotificationLogRow, LogUpsert } from '../lib/notifyRunner.js'
import type { NotifyRuleRow } from '../lib/notifyRule.js'
import type { Mailer, SendMailInput } from '../lib/mailer.js'

// 2026/08/21 是週五。leadDays=3 → 08/24(一) 的寄信日正是 08/21。
const NOW = new Date('2026-08-21T00:30:00Z') // 台灣 08:30

const baseSchedule: CandidateSchedule = {
  id: 's1',
  projectName: 'Falcon-X',
  taskDescription: '高低溫循環測試',
  category: 'NPI',
  testUnit: 'EMC',
  testEngineer: 'Darius_Chang',
  device: 'Chamber-A',
  startDate: '2026/08/24',
  endDate: '2026/09/02',
  timeResource: 5,
  requiredPersonnel: 'Amy_Chen',
}

const defaultRule: NotifyRuleRow = {
  id: 'default', testUnit: null, enabled: true,
  subjectTemplate: '[VSMS] {{projectName}}',
  introTemplate: '即將啟動', outroTemplate: '', ccRecipients: '',
}

function makeStore(overrides: Partial<{
  config: NotifyConfigRow | null
  rules: NotifyRuleRow[]
  candidates: CandidateSchedule[]
  logs: NotificationLogRow[]
  fallback: string[]
}> = {}) {
  const upserts: LogUpsert[] = []
  const store: NotifyStore = {
    loadConfig: async () => overrides.config !== undefined ? overrides.config
      : { enabled: true, systemUrl: 'https://vsms.local:3001', leadDays: 3, catchUpDays: 3, mailDomain: 'example.com' },
    loadRestDays: async () => ({ weekends: true, specificDates: [] }),
    loadRules: async () => overrides.rules ?? [defaultRule],
    loadFallbackRecipients: async () => overrides.fallback ?? ['fallback@example.com'],
    findCandidates: async () => overrides.candidates ?? [baseSchedule],
    findLogs: async () => overrides.logs ?? [],
    upsertLog: async (e) => { upserts.push(e) },
  }
  return { store, upserts }
}

function makeMailer() {
  const sent: SendMailInput[] = []
  const mailer: Mailer = { async send(input) { sent.push(input) } }
  return { mailer, sent }
}

describe('runDailyNotify', () => {
  it('sends to the resolved requiredPersonnel address', async () => {
    const { store, upserts } = makeStore()
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toEqual(['Amy_Chen@example.com'])
    expect(sent[0].subject).toBe('[VSMS] Falcon-X')
    expect(result.sent).toBe(1)
    expect(upserts[0]).toMatchObject({ scheduleId: 's1', sendDate: '2026/08/21', status: 'sent' })
  })

  it('does nothing when the global switch is off', async () => {
    const { store } = makeStore({
      config: { enabled: false, systemUrl: '', leadDays: 3, catchUpDays: 3, mailDomain: 'example.com' },
    })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(result).toEqual({ checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] })
  })

  it('does not send twice for the same schedule and send date', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'sent', attempts: 1 }],
    })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('retries a previously failed send', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed', attempts: 1 }],
    })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(1)
    expect(upserts[0]).toMatchObject({ status: 'sent', attempts: 2 })
  })

  it('stops retrying once the send is marked permanently failed', async () => {
    const { store } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed_permanent', attempts: 3 }],
    })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
  })

  it('marks the send permanently failed on the third failure', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed', attempts: 2 }],
    })
    const mailer: Mailer = { async send() { throw new Error('ECONNREFUSED') } }
    const result = await runDailyNotify(store, mailer, NOW)
    expect(upserts[0]).toMatchObject({ status: 'failed_permanent', attempts: 3 })
    expect(upserts[0].errorMessage).toContain('ECONNREFUSED')
    expect(result.failed).toBe(1)
  })

  it('records a plain failure while attempts remain', async () => {
    const { store, upserts } = makeStore()
    const mailer: Mailer = { async send() { throw new Error('ETIMEDOUT') } }
    await runDailyNotify(store, mailer, NOW)
    expect(upserts[0]).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('catches up on a send date that has already passed', async () => {
    // 08/26(三) 啟動 → 寄信日 08/23(日) → 挪到 08/21(五)。今天是 08/24(一)，
    // 已過期兩天，仍在 catchUpDays=3 的視窗內。
    const late = { ...baseSchedule, startDate: '2026/08/26' }
    const { store } = makeStore({ candidates: [late] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, new Date('2026-08-24T00:30:00Z'))
    expect(sent).toHaveLength(1)
  })

  it('ignores a send date older than the catch-up window', async () => {
    // 今天 08/28，寄信日 08/21，超出 catchUpDays=3
    const { store } = makeStore()
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, new Date('2026-08-28T00:30:00Z'))
    expect(sent).toHaveLength(0)
    expect(result.sent).toBe(0)
  })

  it('ignores a send date still in the future', async () => {
    const { store } = makeStore()
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, new Date('2026-08-19T00:30:00Z'))
    expect(sent).toHaveLength(0)
  })

  it('skips a disabled unit without writing a log row', async () => {
    const emcOff: NotifyRuleRow = {
      id: 'emc', testUnit: 'EMC', enabled: false,
      subjectTemplate: null, introTemplate: null, outroTemplate: null, ccRecipients: '',
    }
    const { store, upserts } = makeStore({ rules: [defaultRule, emcOff] })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('adds the unit cc recipients alongside the default ones', async () => {
    const emc: NotifyRuleRow = {
      id: 'emc', testUnit: 'EMC', enabled: true,
      subjectTemplate: null, introTemplate: null, outroTemplate: null,
      ccRecipients: 'emc_window',
    }
    const withCc: NotifyRuleRow = { ...defaultRule, ccRecipients: 'dept_head' }
    const { store } = makeStore({ rules: [withCc, emc] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].cc).toEqual(['dept_head@example.com', 'emc_window@example.com'])
  })

  it('falls back to the fallback group when no recipient can be resolved', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store, upserts } = makeStore({ candidates: [noOne] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].to).toEqual(['fallback@example.com'])
    expect(sent[0].text).toContain('無法對應')
    expect(upserts[0].status).toBe('sent')
  })

  it('appends the domain to a fallback recipient stored as a bare account name', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '' }
    const { store } = makeStore({ candidates: [noOne], fallback: ['dept_inbox'] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].to).toEqual(['dept_inbox@example.com'])
  })

  it('records an error and keeps going when the send date cannot be resolved', async () => {
    const blocked: NotifyStore = {
      ...makeStore().store,
      loadRestDays: async () => {
        const dates: string[] = []
        const d = new Date(Date.UTC(2026, 7, 21))
        for (let i = 0; i < 40; i++) {
          dates.push(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`)
          d.setUTCDate(d.getUTCDate() - 1)
        }
        return { weekends: true, specificDates: dates }
      },
    }
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(blocked, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].scheduleId).toBe('s1')
  })

  it('records an error when the default rule is missing', async () => {
    const { store } = makeStore({ rules: [] })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(result.errors[0].message).toContain('default')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRunner.test.ts`

Expected: FAIL — `Failed to resolve import "../lib/notifyRunner.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/lib/notifyRunner.ts`：

```ts
import { todayTaipei } from './today.js'
import { computeSendDate, addDays, daysBetween } from './notifyDate.js'
import type { RestDaySettings } from './notifyDate.js'
import { resolveRecipients } from './notifyRecipients.js'
import { resolveRule } from './notifyRule.js'
import type { NotifyRuleRow } from './notifyRule.js'
import { buildTemplateVars, buildMailBody } from './notifyMailBody.js'
import type { ScheduleForMail } from './notifyMailBody.js'
import type { Mailer } from './mailer.js'

export interface NotifyConfigRow {
  enabled: boolean
  systemUrl: string
  leadDays: number
  catchUpDays: number
  mailDomain: string
}

export interface CandidateSchedule extends ScheduleForMail {
  id: string
}

export interface NotificationLogRow {
  scheduleId: string
  sendDate: string
  status: string
  attempts: number
}

export interface LogUpsert {
  scheduleId: string
  sendDate: string
  status: string
  recipients: string
  errorMessage: string | null
  attempts: number
  sentAt: Date | null
}

export interface NotifyStore {
  loadConfig(): Promise<NotifyConfigRow | null>
  loadRestDays(): Promise<RestDaySettings>
  loadRules(): Promise<NotifyRuleRow[]>
  loadFallbackRecipients(): Promise<string[]>
  /** 未完成、未取消、且 startDate > today */
  findCandidates(today: string): Promise<CandidateSchedule[]>
  findLogs(scheduleIds: string[]): Promise<NotificationLogRow[]>
  upsertLog(entry: LogUpsert): Promise<void>
}

export interface RunResult {
  checked: number
  sent: number
  failed: number
  skipped: number
  errors: Array<{ scheduleId: string; message: string }>
}

export const MAX_ATTEMPTS = 3

/**
 * 每日執行一次，也供手動重跑 API 呼叫。
 *
 * 冪等性最終靠 notification_logs 的 (scheduleId, sendDate) 唯一鍵保證 —— cron
 * 與手動重跑可能並行，這裡的 findLogs 檢查擋不住競態。
 */
export async function runDailyNotify(
  store: NotifyStore,
  mailer: Mailer,
  now: Date = new Date(),
): Promise<RunResult> {
  const result: RunResult = { checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] }

  const config = await store.loadConfig()
  if (!config?.enabled) return result

  const today = todayTaipei(now)
  const [restDays, rules, fallback, candidates] = await Promise.all([
    store.loadRestDays(),
    store.loadRules(),
    store.loadFallbackRecipients(),
    store.findCandidates(today),
  ])

  const windowStart = addDays(today, -config.catchUpDays)
  const logs = await store.findLogs(candidates.map(c => c.id))
  const logKey = (scheduleId: string, sendDate: string) => `${scheduleId} ${sendDate}`
  const logByKey = new Map(logs.map(l => [logKey(l.scheduleId, l.sendDate), l]))

  for (const schedule of candidates) {
    const sendDate = computeSendDate(schedule.startDate, config.leadDays, restDays)
    if (sendDate === null) {
      result.errors.push({
        scheduleId: schedule.id,
        message: `無法決定寄信日：${schedule.startDate} 往前挪超過上限，請檢查休息日設定`,
      })
      continue
    }
    if (sendDate > today || sendDate < windowStart) continue

    result.checked++

    const existing = logByKey.get(logKey(schedule.id, sendDate))
    if (existing && (existing.status === 'sent' || existing.status === 'failed_permanent')) {
      result.skipped++
      continue
    }

    const rule = resolveRule(schedule.testUnit, rules)
    if (!rule) {
      result.errors.push({
        scheduleId: schedule.id,
        message: '找不到預設通知規則（testUnit = null），整批不寄信',
      })
      continue
    }
    // 單位停用是設定狀態而非通知事件，刻意不寫 log —— 否則記錄頁會被大量
    // 無意義的列淹沒。日後重新啟用時，仍在補寄視窗內的排程還是會寄出。
    if (!rule.enabled) {
      result.skipped++
      continue
    }

    const primary = resolveRecipients(schedule.requiredPersonnel, config.mailDomain)
    const cc = resolveRecipients(rule.ccRaw, config.mailDomain)

    const usingFallback = primary.addresses.length === 0
    // fallback 也要走同一支解析：Recipient.name 存的可能是帳號名而非完整信箱，
    // 直接丟給 SMTP 會寄不出去。
    const to = usingFallback
      ? resolveRecipients(fallback.join(', '), config.mailDomain).addresses
      : primary.addresses
    if (to.length === 0) {
      result.errors.push({
        scheduleId: schedule.id,
        message: '需求人員無法對應，且未設定 fallback 收件人',
      })
      continue
    }

    // 以實際寄信日為基準，而不是 today —— 補寄時 today 已經晚於寄信日，
    // 用 today 會讓信裡的天數比實際預告量少。
    const daysUntilStart = Math.max(0, daysBetween(sendDate, schedule.startDate))
    const vars = buildTemplateVars(schedule, config.systemUrl, daysUntilStart)
    const body = buildMailBody(rule, schedule, vars)

    const notice = usingFallback
      ? `\n\n（此信原應寄給需求人員「${schedule.requiredPersonnel}」，但無法對應為有效信箱，故改寄至代收群組。）`
      : ''

    const attempts = (existing?.attempts ?? 0) + 1
    try {
      await mailer.send({
        to,
        cc: usingFallback ? [] : cc.addresses,
        subject: body.subject,
        text: body.text + notice,
        html: body.html + (notice ? `<p>${notice.trim()}</p>` : ''),
      })
      await store.upsertLog({
        scheduleId: schedule.id, sendDate, status: 'sent',
        recipients: [...to, ...(usingFallback ? [] : cc.addresses)].join(', '),
        errorMessage: null, attempts, sentAt: now,
      })
      result.sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await store.upsertLog({
        scheduleId: schedule.id, sendDate,
        status: attempts >= MAX_ATTEMPTS ? 'failed_permanent' : 'failed',
        recipients: [...to, ...(usingFallback ? [] : cc.addresses)].join(', '),
        errorMessage: message, attempts, sentAt: null,
      })
      result.failed++
    }
  }

  return result
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRunner.test.ts`

Expected: PASS（16 passed）

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/notifyRunner.ts server/src/__tests__/notifyRunner.test.ts
git commit -m "feat(notify): daily runner with idempotency, catch-up window and retry cap"
```

---

### Task 10: NotifyStore 的 Prisma 實作

**Files:**
- Create: `server/src/lib/notifyStore.ts`

**Interfaces:**
- Consumes: `NotifyStore` 及其所有型別（Task 9）、`prisma`（`server/src/lib/db.js`）
- Produces: `prismaNotifyStore: NotifyStore`

沒有單元測試：這一層只是把 `NotifyStore` 介面接到 prisma 查詢，沒有分支邏輯可測；真正的邏輯已在 Task 9 用假 store 測完。正確性由 Task 12 的 `POST /api/notify/run` 手動觸發驗證。

- [ ] **Step 1: 寫實作**

建立 `server/src/lib/notifyStore.ts`：

```ts
import { prisma } from './db.js'
import type {
  NotifyStore, NotifyConfigRow, CandidateSchedule, NotificationLogRow, LogUpsert,
} from './notifyRunner.js'
import type { RestDaySettings } from './notifyDate.js'
import type { NotifyRuleRow } from './notifyRule.js'

export const prismaNotifyStore: NotifyStore = {
  async loadConfig(): Promise<NotifyConfigRow | null> {
    const row = await prisma.notifyConfig.findUnique({ where: { id: 1 } })
    if (!row) return null
    return {
      enabled: row.enabled,
      systemUrl: row.systemUrl,
      leadDays: row.leadDays,
      catchUpDays: row.catchUpDays,
      mailDomain: row.mailDomain,
    }
  },

  async loadRestDays(): Promise<RestDaySettings> {
    const row = await prisma.restDaysConfig.findUnique({ where: { id: 1 } })
    return {
      weekends: row?.weekends ?? true,
      specificDates: (row?.specificDates as string[]) ?? [],
    }
  },

  async loadRules(): Promise<NotifyRuleRow[]> {
    const rows = await prisma.notifyRule.findMany()
    return rows.map(r => ({
      id: r.id,
      testUnit: r.testUnit,
      enabled: r.enabled,
      subjectTemplate: r.subjectTemplate,
      introTemplate: r.introTemplate,
      outroTemplate: r.outroTemplate,
      ccRecipients: r.ccRecipients,
    }))
  },

  async loadFallbackRecipients(): Promise<string[]> {
    const rows = await prisma.recipient.findMany({
      where: { isActive: true, notifyConfigId: 1 },
    })
    // Recipient.name 存的是帳號名或完整信箱，交由呼叫端已解析好的地址使用；
    // 這裡回傳原始字串陣列，runner 只在無法對應需求人員時才用到。
    return rows.map(r => r.name).filter(Boolean)
  },

  async findCandidates(today: string): Promise<CandidateSchedule[]> {
    const rows = await prisma.schedule.findMany({
      where: { isCompleted: false, isCancelled: false, startDate: { gt: today } },
      select: {
        id: true, projectName: true, taskDescription: true, category: true,
        testUnit: true, testEngineer: true, device: true,
        startDate: true, endDate: true, timeResource: true, requiredPersonnel: true,
      },
    })
    return rows
  },

  async findLogs(scheduleIds: string[]): Promise<NotificationLogRow[]> {
    if (scheduleIds.length === 0) return []
    const rows = await prisma.notificationLog.findMany({
      where: { scheduleId: { in: scheduleIds } },
      select: { scheduleId: true, sendDate: true, status: true, attempts: true },
    })
    return rows
  },

  async upsertLog(entry: LogUpsert): Promise<void> {
    await prisma.notificationLog.upsert({
      where: { scheduleId_sendDate: { scheduleId: entry.scheduleId, sendDate: entry.sendDate } },
      create: entry,
      update: {
        status: entry.status,
        recipients: entry.recipients,
        errorMessage: entry.errorMessage,
        attempts: entry.attempts,
        sentAt: entry.sentAt,
      },
    })
  },
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: 無輸出（exit 0）

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/notifyStore.ts
git commit -m "feat(notify): back the NotifyStore interface with prisma queries"
```

---

### Task 11: requireAdmin middleware

現有只有 `requireAuth` 與 `requireSuperAdmin`，admin 檢查散落在 `options.ts` 裡的 inline `role === 'user'` 判斷。通知路由整個 router 都要 admin，值得抽成 middleware。

**Files:**
- Create: `server/src/middleware/requireAdmin.ts`
- Create: `server/src/__tests__/requireAdmin.test.ts`

**Interfaces:**
- Consumes: `applyHeaderAuth`（`server/src/middleware/requireAuth.js`）
- Produces: `requireAdmin(req, res, next): void`

- [ ] **Step 1: 寫失敗的測試**

建立 `server/src/__tests__/requireAdmin.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'

function ctx(role?: string, sessionId?: string) {
  const req = { session: { sessionId, role }, headers: {} } as unknown as Request
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.body = payload; return this },
  } as unknown as Response & { statusCode: number; body: unknown }
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next }
}

describe('requireAdmin', () => {
  it('rejects an unauthenticated request with 401', () => {
    const { req, res, next } = ctx()
    requireAdmin(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects the user role with 403 and a machine-readable code', () => {
    const { req, res, next } = ctx('user', 'sid')
    requireAdmin(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ ok: false, code: 'ROLE_NOT_ALLOWED' })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects the guest role with 403', () => {
    const { req, res, next } = ctx('guest', 'sid')
    requireAdmin(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('lets admin through', () => {
    const { req, res, next } = ctx('admin', 'sid')
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('lets super_admin through', () => {
    const { req, res, next } = ctx('super_admin', 'sid')
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/requireAdmin.test.ts`

Expected: FAIL — `Failed to resolve import "../middleware/requireAdmin.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/middleware/requireAdmin.ts`：

```ts
import type { Request, Response, NextFunction } from 'express'
import { applyHeaderAuth } from './requireAuth.js'

/**
 * Admin 或 Super Admin。允許清單而非拒絕清單：新增角色時預設擋下，
 * 而不是預設放行。
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!applyHeaderAuth(req)) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }
  if (req.session.role !== 'admin' && req.session.role !== 'super_admin') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  next()
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/requireAdmin.test.ts`

Expected: PASS（5 passed）

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/requireAdmin.ts server/src/__tests__/requireAdmin.test.ts
git commit -m "feat(server): add a requireAdmin middleware with an allow-list check"
```

---

### Task 12: 通知 API 路由

**Files:**
- Create: `server/src/routes/notify.ts`
- Create: `server/src/__tests__/notifyRoutes.test.ts`
- Modify: `server/src/index.ts`（掛載 router）

**Interfaces:**
- Consumes: `requireAdmin`（Task 11）、`validateTemplate` / `TEMPLATE_VARS`（Task 4）、`prismaNotifyStore`（Task 10）、`runDailyNotify`（Task 9）、`getMailer` / `isMailerConfigured`（Task 8）、`resolveRule`（Task 5）、`resolveRecipients`（Task 3）、`buildTemplateVars` / `buildMailBody`（Task 6）、`appendAudit`（`server/src/lib/storage.js`）
- Produces: express router，掛在 `/api/notify`

- [ ] **Step 1: 寫失敗的測試**

只測不需要資料庫的部分：範本驗證的 400 回應與權限把關。

建立 `server/src/__tests__/notifyRoutes.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { templateFieldErrors } from '../routes/notify.js'

describe('templateFieldErrors', () => {
  it('returns no errors when every template is valid', () => {
    expect(templateFieldErrors({
      subjectTemplate: '[VSMS] {{projectName}}',
      introTemplate: null,
      outroTemplate: '',
    })).toEqual({})
  })

  it('names the offending field and the unknown variable', () => {
    const errors = templateFieldErrors({
      subjectTemplate: '{{projectNmae}}',
      introTemplate: null,
      outroTemplate: null,
    })
    expect(errors.subjectTemplate).toContain('projectNmae')
  })

  it('reports each bad field separately', () => {
    const errors = templateFieldErrors({
      subjectTemplate: '{{foo}}',
      introTemplate: '{{bar}}',
      outroTemplate: null,
    })
    expect(Object.keys(errors).sort()).toEqual(['introTemplate', 'subjectTemplate'])
  })

  it('ignores a null template', () => {
    expect(templateFieldErrors({
      subjectTemplate: null, introTemplate: null, outroTemplate: null,
    })).toEqual({})
  })
})

describe('notify router guards', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const { default: notifyRouter } = await import('../routes/notify.js')
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => { (req as unknown as { session: object }).session = {}; next() })
    app.use('/api/notify', notifyRouter)

    const res = await request(app).get('/api/notify/config')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRoutes.test.ts`

Expected: FAIL — `Failed to resolve import "../routes/notify.js"`

- [ ] **Step 3: 寫實作**

建立 `server/src/routes/notify.ts`：

```ts
import { Router } from 'express'
import type { Request } from 'express'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { validateTemplate, TEMPLATE_VARS } from '../lib/notifyTemplate.js'
import { resolveRule } from '../lib/notifyRule.js'
import { resolveRecipients } from '../lib/notifyRecipients.js'
import { buildTemplateVars, buildMailBody } from '../lib/notifyMailBody.js'
import { computeSendDate, daysBetween } from '../lib/notifyDate.js'
import { todayTaipei } from '../lib/today.js'
import { prismaNotifyStore } from '../lib/notifyStore.js'
import { runDailyNotify } from '../lib/notifyRunner.js'
import { getMailer, isMailerConfigured } from '../lib/mailer.js'

const router = Router()
router.use(requireAdmin)

type TemplateFields = {
  subjectTemplate: string | null
  introTemplate: string | null
  outroTemplate: string | null
}

// AuditAction 是封閉的字面聯集，沒有泛用的 'UPDATE' / 'CREATE' / 'DELETE'；
// 設定類異動一律記為 UPDATE_SETTINGS，差異寫在 target 與 fields 裡。
async function audit(req: Request, target: string, fields: string[]): Promise<void> {
  const username = req.session.username ?? ''
  const dbUser = await prisma.user.findUnique({ where: { username } })
  await appendAudit(username, dbUser?.displayName ?? username, 'UPDATE_SETTINGS', target, fields)
}

/**
 * 範本驗證發生在存檔時，不是寄出時。管理者把變數名打錯必須當場被擋下 ——
 * 等到寄出才發現，那批信已經寄出去了。
 */
export function templateFieldErrors(fields: TemplateFields): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of ['subjectTemplate', 'introTemplate', 'outroTemplate'] as const) {
    const value = fields[key]
    if (value === null || value === undefined) continue
    const result = validateTemplate(value)
    if (!result.ok) {
      errors[key] = `未知的變數：${result.unknown.join('、')}。可用變數：${TEMPLATE_VARS.join('、')}`
    }
  }
  return errors
}

// GET /api/notify/config
router.get('/config', async (_req, res) => {
  const row = await prisma.notifyConfig.findUnique({ where: { id: 1 } })
  const fallback = await prisma.recipient.findMany({ where: { notifyConfigId: 1 } })
  res.json({
    enabled: row?.enabled ?? false,
    systemUrl: row?.systemUrl ?? '',
    leadDays: row?.leadDays ?? 3,
    catchUpDays: row?.catchUpDays ?? 3,
    mailDomain: row?.mailDomain ?? '',
    smtpConfigured: isMailerConfigured(),
    fallbackRecipients: fallback.map(r => ({ id: r.id, name: r.name, note: r.note, isActive: r.isActive })),
    templateVars: TEMPLATE_VARS,
  })
})

// PUT /api/notify/config
router.put('/config', async (req, res) => {
  const body = req.body as Partial<{
    enabled: boolean; systemUrl: string; leadDays: number; catchUpDays: number; mailDomain: string
  }>
  if (body.leadDays !== undefined && (!Number.isInteger(body.leadDays) || body.leadDays < 1)) {
    res.status(422).json({ ok: false, errors: { leadDays: '提前天數必須是 1 以上的整數' } })
    return
  }
  if (body.catchUpDays !== undefined && (!Number.isInteger(body.catchUpDays) || body.catchUpDays < 0)) {
    res.status(422).json({ ok: false, errors: { catchUpDays: '補寄天數必須是 0 以上的整數' } })
    return
  }
  await prisma.notifyConfig.update({ where: { id: 1 }, data: body })
  await audit(req, '通知設定', Object.keys(body))
  res.json({ ok: true })
})

// GET /api/notify/rules
router.get('/rules', async (_req, res) => {
  const [rules, units] = await Promise.all([
    prisma.notifyRule.findMany(),
    prisma.testUnit.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ])
  res.json({
    rules,
    testUnits: units.map(u => ({ value: u.value, label: u.label })),
    templateVars: TEMPLATE_VARS,
  })
})

// POST /api/notify/rules — 為某個測試單位建立規則
router.post('/rules', async (req, res) => {
  const { testUnit } = req.body as { testUnit: string }
  if (!testUnit?.trim()) {
    res.status(422).json({ ok: false, errors: { testUnit: '測試單位不可空白' } })
    return
  }
  const created = await prisma.notifyRule.create({
    data: {
      testUnit: testUnit.trim(), enabled: true,
      subjectTemplate: null, introTemplate: null, outroTemplate: null, ccRecipients: '',
    },
  })
  await audit(req, `通知規則：${testUnit}（新增）`, [])
  res.json({ ok: true, rule: created })
})

// PUT /api/notify/rules/:id
router.put('/rules/:id', async (req, res) => {
  const body = req.body as Partial<TemplateFields & { enabled: boolean; ccRecipients: string }>
  const errors = templateFieldErrors({
    subjectTemplate: body.subjectTemplate ?? null,
    introTemplate: body.introTemplate ?? null,
    outroTemplate: body.outroTemplate ?? null,
  })
  if (Object.keys(errors).length) {
    res.status(422).json({ ok: false, errors })
    return
  }
  const existing = await prisma.notifyRule.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ ok: false, message: '找不到該規則' })
    return
  }
  // 預設規則的範本不得為 null —— resolveRule 沿用鏈的終點就是它。
  if (existing.testUnit === null) {
    for (const key of ['subjectTemplate', 'introTemplate', 'outroTemplate'] as const) {
      if (key in body && body[key] === null) {
        res.status(422).json({ ok: false, errors: { [key]: '預設規則不可設為「沿用預設」' } })
        return
      }
    }
  }
  await prisma.notifyRule.update({ where: { id: req.params.id }, data: body })
  await audit(req, `通知規則：${existing.testUnit ?? '預設'}`, Object.keys(body))
  res.json({ ok: true })
})

// DELETE /api/notify/rules/:id
router.delete('/rules/:id', async (req, res) => {
  const existing = await prisma.notifyRule.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ ok: false, message: '找不到該規則' })
    return
  }
  if (existing.testUnit === null) {
    res.status(400).json({ ok: false, message: '預設規則不可刪除', code: 'DEFAULT_RULE_PROTECTED' })
    return
  }
  await prisma.notifyRule.delete({ where: { id: req.params.id } })
  await audit(req, `通知規則：${existing.testUnit}（刪除）`, [])
  res.json({ ok: true })
})

// POST /api/notify/preview — 套用規則但不寄出
router.post('/preview', async (req, res) => {
  const { scheduleId } = req.body as { scheduleId: string }
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
  if (!schedule) {
    res.status(404).json({ ok: false, message: '找不到該排程' })
    return
  }
  const [config, rules, restDays] = await Promise.all([
    prisma.notifyConfig.findUnique({ where: { id: 1 } }),
    prisma.notifyRule.findMany(),
    prisma.restDaysConfig.findUnique({ where: { id: 1 } }),
  ])
  const rule = resolveRule(schedule.testUnit, rules)
  if (!rule) {
    res.status(400).json({ ok: false, message: '找不到預設通知規則' })
    return
  }
  const domain = config?.mailDomain ?? ''
  const primary = resolveRecipients(schedule.requiredPersonnel, domain)
  const cc = resolveRecipients(rule.ccRaw, domain)
  const leadDays = config?.leadDays ?? 3
  const sendDate = computeSendDate(schedule.startDate, leadDays, {
    weekends: restDays?.weekends ?? true,
    specificDates: (restDays?.specificDates as string[]) ?? [],
  })
  // 與 runner 同樣以寄信日為基準，預覽才會顯示實際會寄出的天數
  const daysUntilStart = sendDate ? Math.max(0, daysBetween(sendDate, schedule.startDate)) : leadDays
  const vars = buildTemplateVars(schedule, config?.systemUrl ?? '', daysUntilStart)
  const body = buildMailBody(rule, schedule, vars)

  res.json({
    subject: body.subject,
    text: body.text,
    html: body.html,
    to: primary.addresses,
    cc: cc.addresses,
    unresolved: primary.unresolved,
    sendDate,
    unitEnabled: rule.enabled,
  })
})

// GET /api/notify/logs
router.get('/logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500)
  const logs = await prisma.notificationLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const schedules = await prisma.schedule.findMany({
    where: { id: { in: logs.map(l => l.scheduleId) } },
    select: { id: true, projectName: true, testUnit: true, startDate: true },
  })
  const byId = new Map(schedules.map(s => [s.id, s]))
  res.json({
    logs: logs.map(l => ({
      ...l,
      projectName: byId.get(l.scheduleId)?.projectName ?? '(已刪除)',
      testUnit: byId.get(l.scheduleId)?.testUnit ?? '',
      startDate: byId.get(l.scheduleId)?.startDate ?? '',
    })),
  })
})

// POST /api/notify/run — 立即檢查並補寄
router.post('/run', async (req, res) => {
  if (!isMailerConfigured()) {
    res.status(400).json({ ok: false, message: 'SMTP 尚未設定，請先在 .env 設定 SMTP_HOST 與 SMTP_FROM' })
    return
  }
  const result = await runDailyNotify(prismaNotifyStore, getMailer())
  await audit(req, `手動執行通知：寄出 ${result.sent} 封`, [])
  res.json({ ok: true, ...result })
})

// POST /api/notify/test — 寄一封測試信
router.post('/test', async (req, res) => {
  const { to } = req.body as { to: string }
  if (!to?.trim()) {
    res.status(422).json({ ok: false, errors: { to: '收件地址不可空白' } })
    return
  }
  if (!isMailerConfigured()) {
    res.status(400).json({ ok: false, message: 'SMTP 尚未設定，請先在 .env 設定 SMTP_HOST 與 SMTP_FROM' })
    return
  }
  try {
    await getMailer().send({
      to: [to.trim()], cc: [],
      subject: '[VSMS] 通知功能測試信',
      text: `這是一封測試信，寄出時間 ${todayTaipei()}。收到即表示 SMTP 設定正確。`,
      html: `<p>這是一封測試信，寄出時間 ${todayTaipei()}。收到即表示 SMTP 設定正確。</p>`,
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({
      ok: false,
      message: `寄送失敗：${err instanceof Error ? err.message : String(err)}`,
    })
  }
})

export default router
```

- [ ] **Step 4: 掛載 router**

在 `server/src/index.ts` 的 router import 區塊末端加入：

```ts
import notifyRouter from './routes/notify.js'
```

在 `app.use('/api/calendar', calendarRouter)` 之後加入：

```ts
app.use('/api/notify', notifyRouter)
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyRoutes.test.ts`

Expected: PASS（5 passed）

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: 無輸出（exit 0）

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/notify.ts server/src/__tests__/notifyRoutes.test.ts server/src/index.ts
git commit -m "feat(notify): add the notify API with save-time template validation"
```

---

### Task 13: 每日排程觸發

**Files:**
- Modify: `server/src/index.ts`
- Modify: `package.json`（新增 `node-cron`）

**Interfaces:**
- Consumes: `runDailyNotify`（Task 9）、`prismaNotifyStore`（Task 10）、`getMailer` / `isMailerConfigured`（Task 8）
- Produces: 無（副作用：常駐排程）

- [ ] **Step 1: 安裝相依套件**

Run:

```bash
npm install node-cron && npm install --save-dev @types/node-cron
```

Expected: `added N packages`

- [ ] **Step 2: 加入排程啟動函式**

在 `server/src/index.ts` 的 import 區塊加入：

```ts
import cron from 'node-cron'
import { runDailyNotify } from './lib/notifyRunner.js'
import { prismaNotifyStore } from './lib/notifyStore.js'
import { getMailer, isMailerConfigured } from './lib/mailer.js'
```

在檔案末端、`app.listen` / `https.createServer` 那一段**之前**，加入這個函式：

```ts
// 每天 08:00（伺服器本地時間）檢查並寄出預告信。
//
// 必須在 listen 之後才啟動：本檔把 app export 給測試使用，掛在模組頂層會讓
// 每次跑測試都起一個排程器。
function startNotifyCron(): void {
  if (!isMailerConfigured()) {
    console.warn('[notify] SMTP is not configured — the daily notification job will not run.')
    console.warn('[notify] Set SMTP_HOST and SMTP_FROM in .env to enable it.')
    return
  }
  cron.schedule('0 8 * * *', () => {
    // 未捕捉的錯誤會拖垮同 process 的前端服務，一律吞在這裡並記錄。
    runDailyNotify(prismaNotifyStore, getMailer())
      .then(r => console.log(
        `[notify] daily run: checked=${r.checked} sent=${r.sent} failed=${r.failed} skipped=${r.skipped}` +
        (r.errors.length ? ` errors=${r.errors.length}` : '')))
      .catch(err => console.error('[notify] daily run failed:', err))
  })
  console.log('[notify] daily notification job scheduled at 08:00')
}
```

- [ ] **Step 3: 在兩個 listen 分支都呼叫它**

把 `https.createServer(...).listen(...)` 的 callback 改成：

```ts
  https.createServer({ cert, key }, app).listen(Number(PORT), () => {
    console.log(`VSMS Server running at https://localhost:${PORT}`)
    startNotifyCron()
  })
```

把 `app.listen(...)` 的 callback 改成：

```ts
  app.listen(Number(PORT), () => {
    console.log(`VSMS Server running at http://localhost:${PORT}`)
    startNotifyCron()
  })
```

- [ ] **Step 4: 驗證測試不會啟動排程器**

Run: `npx vitest run --config server/vitest.config.ts`

Expected: PASS，測試數 154 + 16 + 5 + 5 = 180。輸出中**不得**出現 `[notify] daily notification job scheduled`。

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: 無輸出（exit 0）

- [ ] **Step 5: 以非正式 PORT 實際啟動一次確認**

Run（在專案目錄下，另開終端機）：

```bash
PORT=3002 npx tsx server/src/index.ts
```

Expected: 輸出 `VSMS Server running at ...:3002`，後面接 `[notify] daily notification job scheduled at 08:00`（若 .env 未設 SMTP 則為兩行 warning）。確認後以 Ctrl-C 結束。**不要動 port 3001。**

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/src/index.ts
git commit -m "feat(notify): schedule the daily run at 08:00 after the server starts listening"
```

---

### Task 14: 前端 — API client 與型別

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/api.ts`

**Interfaces:**
- Consumes: Task 12 的 API 端點
- Produces:
  - `interface NotifyConfig`、`NotifyRule`、`NotifyLog`、`NotifyPreview`、`NotifyRunResult`
  - `api.notifyConfig()`、`api.updateNotifyConfig()`、`api.notifyRules()`、`api.createNotifyRule()`、`api.updateNotifyRule()`、`api.deleteNotifyRule()`、`api.notifyPreview()`、`api.notifyLogs()`、`api.notifyRun()`、`api.notifyTest()`

- [ ] **Step 1: 加入型別**

在 `src/types.ts` 末端附加：

```ts
export interface NotifyConfig {
  enabled: boolean
  systemUrl: string
  leadDays: number
  catchUpDays: number
  mailDomain: string
  smtpConfigured: boolean
  fallbackRecipients: { id: string; name: string; note: string; isActive: boolean }[]
  templateVars: string[]
}

export interface NotifyRule {
  id: string
  /** null = 預設規則 */
  testUnit: string | null
  enabled: boolean
  /** null = 沿用預設規則；空字串 = 刻意留白 */
  subjectTemplate: string | null
  introTemplate: string | null
  outroTemplate: string | null
  ccRecipients: string
}

export interface NotifyLog {
  id: string
  scheduleId: string
  sendDate: string
  status: 'sent' | 'failed' | 'failed_permanent'
  recipients: string
  errorMessage: string | null
  attempts: number
  sentAt: string | null
  createdAt: string
  projectName: string
  testUnit: string
  startDate: string
}

export interface NotifyPreview {
  subject: string
  text: string
  html: string
  to: string[]
  cc: string[]
  unresolved: string[]
  sendDate: string | null
  unitEnabled: boolean
}

export interface NotifyRunResult {
  ok: boolean
  checked: number
  sent: number
  failed: number
  skipped: number
  errors: { scheduleId: string; message: string }[]
}
```

- [ ] **Step 2: 加入 API 方法**

在 `src/lib/api.ts` 的第一行 import 補上新型別：

```ts
import type {
  Schedule, OptionsMap, Option, User, AuditLog, VtmsProgress,
  NotifyConfig, NotifyRule, NotifyLog, NotifyPreview, NotifyRunResult,
} from '../types'
```

在 `export const api = {` 物件內部末端（最後一個方法之後）附加：

```ts
  // ── Notify ────────────────────────────────────────────
  notifyConfig: () =>
    req<NotifyConfig>('GET', '/notify/config'),
  updateNotifyConfig: (patch: Partial<Omit<NotifyConfig, 'smtpConfigured' | 'fallbackRecipients' | 'templateVars'>>) =>
    req<{ ok: boolean }>('PUT', '/notify/config', patch),
  notifyRules: () =>
    req<{ rules: NotifyRule[]; testUnits: { value: string; label: string }[]; templateVars: string[] }>(
      'GET', '/notify/rules'),
  createNotifyRule: (testUnit: string) =>
    req<{ ok: boolean; rule: NotifyRule }>('POST', '/notify/rules', { testUnit }),
  updateNotifyRule: (id: string, patch: Partial<Omit<NotifyRule, 'id' | 'testUnit'>>) =>
    req<{ ok: boolean }>('PUT', `/notify/rules/${id}`, patch),
  deleteNotifyRule: (id: string) =>
    req<{ ok: boolean }>('DELETE', `/notify/rules/${id}`),
  notifyPreview: (scheduleId: string) =>
    req<NotifyPreview>('POST', '/notify/preview', { scheduleId }),
  notifyLogs: (limit = 200) =>
    req<{ logs: NotifyLog[] }>('GET', `/notify/logs?limit=${limit}`),
  notifyRun: () =>
    req<NotifyRunResult>('POST', '/notify/run'),
  notifyTest: (to: string) =>
    req<{ ok: boolean }>('POST', '/notify/test', { to }),
```

- [ ] **Step 3: 型別檢查**

Run: `npx tsc -p tsconfig.app.json --noEmit`

Expected: 僅出現既有的 9 個錯誤（見 Global Constraints），不得有新增。

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/lib/api.ts
git commit -m "feat(notify): add frontend types and API client methods"
```

---

### Task 15: 前端 — 通知設定與規則頁

**Files:**
- Create: `src/components/settings/NotifyManager.tsx`
- Modify: `src/store/uiStore.ts`（`SettingsTab` union 加 `'notify'`）
- Modify: `src/components/settings/SettingsPage.tsx`（`SettingsTab` union 與 tabs 陣列都要加）

**Interfaces:**
- Consumes: Task 14 的 `api.notify*` 方法與型別
- Produces: `export function NotifyManager()`

`SettingsTab` 這個字面聯集型別在 `uiStore.ts:6` 與 `SettingsPage.tsx:11` **各有一份**，兩處都要改，否則 `setSettingsTab('notify')` 會型別錯誤。

- [ ] **Step 1: 擴充 SettingsTab 型別（兩處）**

`src/store/uiStore.ts` 第 6 行改為：

```ts
type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users' | 'devices' | 'notify'
```

`src/components/settings/SettingsPage.tsx` 第 11 行改為：

```ts
type SettingsTab = 'categories' | 'units' | 'engineers' | 'restdays' | 'users' | 'devices' | 'notify'
```

- [ ] **Step 2: 建立 NotifyManager 元件**

建立 `src/components/settings/NotifyManager.tsx`：

```tsx
import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import type { NotifyConfig, NotifyRule } from '../../types'

export function NotifyManager() {
  const [config, setConfig] = useState<NotifyConfig | null>(null)
  const [rules, setRules] = useState<NotifyRule[]>([])
  const [testUnits, setTestUnits] = useState<{ value: string; label: string }[]>([])
  const [testTo, setTestTo] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    const [c, r] = await Promise.all([api.notifyConfig(), api.notifyRules()])
    setConfig(c); setRules(r.rules); setTestUnits(r.testUnits)
  }
  useEffect(() => { reload().catch(e => setMsg({ kind: 'err', text: String(e) })) }, [])

  const saveConfig = async (patch: Partial<NotifyConfig>) => {
    if (!config) return
    setConfig({ ...config, ...patch })
    try {
      await api.updateNotifyConfig(patch)
      setMsg({ kind: 'ok', text: '已儲存' })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })
      await reload()
    }
  }

  const saveRule = async (rule: NotifyRule, patch: Partial<NotifyRule>) => {
    setRules(rs => rs.map(r => r.id === rule.id ? { ...r, ...patch } : r))
    try {
      await api.updateNotifyRule(rule.id, patch)
      setMsg({ kind: 'ok', text: '已儲存' })
    } catch (e) {
      const text = e instanceof ApiError && e.fieldErrors
        ? Object.values(e.fieldErrors).join('；')
        : String(e)
      setMsg({ kind: 'err', text })
      await reload()
    }
  }

  const sendTest = async () => {
    if (!testTo.trim()) { setMsg({ kind: 'err', text: '請先填收件地址' }); return }
    setBusy(true)
    try {
      await api.notifyTest(testTo.trim())
      setMsg({ kind: 'ok', text: `測試信已寄至 ${testTo.trim()}` })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const runNow = async () => {
    setBusy(true)
    try {
      const r = await api.notifyRun()
      setMsg({ kind: 'ok', text: `檢查 ${r.checked} 筆，寄出 ${r.sent}，失敗 ${r.failed}，略過 ${r.skipped}` })
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally { setBusy(false) }
  }

  const addRule = async (unit: string) => {
    try { await api.createNotifyRule(unit); await reload() }
    catch (e) { setMsg({ kind: 'err', text: String(e) }) }
  }

  if (!config) return <p className="text-sm text-gray-400">載入中…</p>

  const defaultRule = rules.find(r => r.testUnit === null)
  const unitRules = rules.filter(r => r.testUnit !== null)
  const unusedUnits = testUnits.filter(u => !unitRules.some(r => r.testUnit === u.value))

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <p className={`text-sm rounded px-3 py-2 ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </p>
      )}

      {!config.smtpConfigured && (
        <p className="text-sm rounded px-3 py-2 bg-amber-50 text-amber-800">
          SMTP 尚未設定。請在伺服器的 .env 設定 SMTP_HOST 與 SMTP_FROM 後重啟服務。
        </p>
      )}

      {/* ── 全域設定 ── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">預告通知設定</h3>
        <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm">
          <input type="checkbox" checked={config.enabled}
            onChange={e => saveConfig({ enabled: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          <span>啟用預告通知（總開關）</span>
        </label>

        <div className="grid grid-cols-2 gap-4 max-w-md">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">提前天數</span>
            <input type="number" min={1} value={config.leadDays}
              onChange={e => setConfig({ ...config, leadDays: Number(e.target.value) })}
              onBlur={e => saveConfig({ leadDays: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">補寄視窗（天）</span>
            <input type="number" min={0} value={config.catchUpDays}
              onChange={e => setConfig({ ...config, catchUpDays: Number(e.target.value) })}
              onBlur={e => saveConfig({ catchUpDays: Number(e.target.value) })}
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-xs text-gray-600 mb-1">公司信箱網域（不含 @）</span>
            <input type="text" value={config.mailDomain}
              onChange={e => setConfig({ ...config, mailDomain: e.target.value })}
              onBlur={e => saveConfig({ mailDomain: e.target.value })}
              placeholder="example.com.tw"
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <label className="text-sm col-span-2">
            <span className="block text-xs text-gray-600 mb-1">系統連結（信件中的回連網址）</span>
            <input type="text" value={config.systemUrl}
              onChange={e => setConfig({ ...config, systemUrl: e.target.value })}
              onBlur={e => saveConfig({ systemUrl: e.target.value })}
              placeholder="https://vsms.example.com:3001"
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
        </div>

        <div className="flex gap-2 items-end mt-4">
          <label className="text-sm flex-1 max-w-xs">
            <span className="block text-xs text-gray-600 mb-1">測試收件地址</span>
            <input type="text" value={testTo} onChange={e => setTestTo(e.target.value)}
              placeholder="you@example.com.tw"
              className="w-full border border-gray-300 rounded px-2 py-1.5" />
          </label>
          <button type="button" onClick={sendTest} disabled={busy}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
            寄測試信
          </button>
          <button type="button" onClick={runNow} disabled={busy}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
            立即檢查並補寄
          </button>
        </div>
      </section>

      {/* ── 規則 ── */}
      <section className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">信件內容規則</h3>
        <p className="text-xs text-gray-500 mb-3">
          可用變數：{config.templateVars.map(v => `{{${v}}}`).join('、')}
        </p>

        {defaultRule && <RuleEditor rule={defaultRule} isDefault onSave={saveRule} />}

        {unitRules.map(rule => (
          <RuleEditor key={rule.id} rule={rule} isDefault={false} onSave={saveRule}
            onDelete={async () => { await api.deleteNotifyRule(rule.id); await reload() }} />
        ))}

        {unusedUnits.length > 0 && (
          <div className="flex gap-2 items-center mt-3">
            <span className="text-xs text-gray-600">為測試單位新增規則：</span>
            <select defaultValue="" onChange={e => { if (e.target.value) addRule(e.target.value) }}
              className="text-sm border border-gray-300 rounded px-2 py-1.5">
              <option value="">選擇單位…</option>
              {unusedUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        )}
      </section>
    </div>
  )
}

type DraftKey = 'subjectTemplate' | 'introTemplate' | 'outroTemplate' | 'ccRecipients'

function RuleEditor({ rule, isDefault, onSave, onDelete }: {
  rule: NotifyRule
  isDefault: boolean
  onSave: (rule: NotifyRule, patch: Partial<NotifyRule>) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  // 文字欄位先進 draft，onBlur 才送出。用 onChange 直接送會讓每按一個鍵就打一次
  // PUT，而 PUT 會跑範本驗證並寫 audit —— 打一句話等於幾十次寫入。
  const [draft, setDraft] = useState<Partial<Record<DraftKey, string>>>({})
  const valueOf = (key: DraftKey) => draft[key] ?? rule[key] ?? ''
  const commit = async (key: DraftKey) => {
    const next = draft[key]
    if (next === undefined || next === (rule[key] ?? '')) return
    setDraft(d => { const { [key]: _drop, ...rest } = d; return rest })
    await onSave(rule, { [key]: next })
  }

  const field = (key: 'subjectTemplate' | 'introTemplate' | 'outroTemplate', label: string) => {
    const inherits = rule[key] === null
    return (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-600">{label}</span>
          {!isDefault && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={inherits}
                onChange={e => onSave(rule, { [key]: e.target.checked ? null : '' })}
                className="w-3.5 h-3.5 rounded border-gray-300" />
              沿用預設
            </label>
          )}
        </div>
        <textarea rows={key === 'subjectTemplate' ? 1 : 2}
          value={valueOf(key)} disabled={inherits}
          onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
          onBlur={() => commit(key)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 disabled:bg-gray-100 disabled:text-gray-400" />
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">
          {isDefault ? '預設規則（所有單位的基底）' : rule.testUnit}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={rule.enabled}
              onChange={e => onSave(rule, { enabled: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-gray-300" />
            啟用
          </label>
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500">
              × 刪除
            </button>
          )}
        </div>
      </div>
      {field('subjectTemplate', '主旨')}
      {field('introTemplate', '開頭文字（資料表格之前）')}
      <p className="text-xs text-gray-400 mb-3">資料表格由系統固定產生，無法修改</p>
      {field('outroTemplate', '結尾文字（資料表格之後）')}
      <label className="text-sm block">
        <span className="block text-xs font-medium text-gray-600 mb-1">
          固定副本收件人（逗號分隔；會與預設規則的副本合併）
        </span>
        <input type="text" value={valueOf('ccRecipients')}
          onChange={e => setDraft(d => ({ ...d, ccRecipients: e.target.value }))}
          onBlur={() => commit('ccRecipients')}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
      </label>
    </div>
  )
}
```

- [ ] **Step 3: 掛上 tab**

在 `src/components/settings/SettingsPage.tsx` 的 import 區塊加入：

```tsx
import { NotifyManager } from './NotifyManager'
```

在 `tabs` 陣列中，`devices` 那一列之後加入：

```tsx
    { key: 'notify',     label: '預告通知' },
```

在 Tab 內容區塊，`{activeTab === 'engineers'  && <EngineerManager />}` 之後加入：

```tsx
        {activeTab === 'notify'     && <NotifyManager />}
```

- [ ] **Step 4: 型別檢查**

Run: `npx tsc -p tsconfig.app.json --noEmit`

Expected: 僅出現既有的 9 個錯誤，不得有新增。

- [ ] **Step 5: 實際跑起來確認**

Run（另開終端機，**不要動 port 3001**）：

```bash
npx vite --port 5174
```

以 admin 身分登入 → 系統設定 → 預告通知。確認：總開關可切換、四個欄位可存檔、預設規則的「沿用預設」核取方塊不出現、單位規則勾選「沿用預設」後文字框變灰且不可編輯。確認後 Ctrl-C 結束。

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/NotifyManager.tsx src/components/settings/SettingsPage.tsx src/store/uiStore.ts
git commit -m "feat(notify): add the notification settings and per-unit rule editor"
```

---

### Task 16: 前端 — 通知記錄

**Files:**
- Create: `src/components/settings/NotifyLogTable.tsx`
- Modify: `src/components/settings/NotifyManager.tsx`（在頁面底部加入記錄區塊）

**Interfaces:**
- Consumes: `api.notifyLogs()`、`NotifyLog`（Task 14）
- Produces: `export function NotifyLogTable()`

- [ ] **Step 1: 建立元件**

建立 `src/components/settings/NotifyLogTable.tsx`：

```tsx
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import type { NotifyLog } from '../../types'

const STATUS_STYLE: Record<NotifyLog['status'], string> = {
  sent: 'bg-green-50 text-green-700',
  failed: 'bg-amber-50 text-amber-700',
  failed_permanent: 'bg-red-50 text-red-700',
}

const STATUS_TEXT: Record<NotifyLog['status'], string> = {
  sent: '已寄出',
  failed: '失敗（明日重試）',
  failed_permanent: '永久失敗',
}

export function NotifyLogTable() {
  const [logs, setLogs] = useState<NotifyLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api.notifyLogs()
      .then(r => { setLogs(r.logs); setError(null) })
      .catch(e => setError(String(e)))
  }
  useEffect(reload, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!logs) return <p className="text-sm text-gray-400">載入中…</p>
  if (logs.length === 0) return <p className="text-sm text-gray-400">尚無通知記錄</p>

  return (
    <div className="overflow-x-auto">
      <button type="button" onClick={reload}
        className="mb-2 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
        重新整理
      </button>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-200">
            <th className="text-left py-2 px-2">寄信日</th>
            <th className="text-left py-2 px-2">專案</th>
            <th className="text-left py-2 px-2">單位</th>
            <th className="text-left py-2 px-2">狀態</th>
            <th className="text-left py-2 px-2">收件人</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(l => (
            <tr key={l.id} className="border-b border-gray-100 align-top">
              <td className="py-2 px-2 whitespace-nowrap">{l.sendDate}</td>
              <td className="py-2 px-2">{l.projectName}</td>
              <td className="py-2 px-2 whitespace-nowrap">{l.testUnit}</td>
              <td className="py-2 px-2 whitespace-nowrap">
                <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLE[l.status]}`}>
                  {STATUS_TEXT[l.status]}
                </span>
                {l.attempts > 1 && (
                  <span className="ml-1 text-xs text-gray-400">第 {l.attempts} 次</span>
                )}
              </td>
              <td className="py-2 px-2 text-xs text-gray-600 break-all">
                {l.recipients}
                {l.errorMessage && (
                  <span className="block text-red-600 mt-0.5">{l.errorMessage}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 接進設定頁**

在 `src/components/settings/NotifyManager.tsx` 的 import 區塊加入：

```tsx
import { NotifyLogTable } from './NotifyLogTable'
```

在 `NotifyManager` 回傳的 JSX 中，「信件內容規則」那個 `<section>` 之後、最外層 `</div>` 之前加入：

```tsx
      <section className="border-t border-gray-200 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">通知記錄</h3>
        <NotifyLogTable />
      </section>
```

- [ ] **Step 3: 型別檢查與完整測試**

Run: `npx tsc -p tsconfig.app.json --noEmit`

Expected: 僅出現既有的 9 個錯誤，不得有新增。

Run: `npm run test:all`

Expected: 前端 145 passed、後端 180 passed，全綠。

- [ ] **Step 4: 端對端確認**

Run（另開終端機）：

```bash
PORT=3002 npx tsx watch server/src/index.ts
```

另一個終端機：

```bash
VSMS_API_TARGET=https://localhost:3002 npx vite --port 5174
```

以 admin 登入 → 系統設定 → 預告通知。確認：

1. 填好 `mailDomain` 與 `systemUrl`，寄一封測試信，確認收得到。
2. 開啟總開關，按「立即檢查並補寄」，確認回報的數字合理。
3. 通知記錄出現對應的列，狀態為「已寄出」。
4. **再按一次「立即檢查並補寄」，確認 `sent` 為 0 而 `skipped` 增加** —— 這是冪等性的實地驗證。

確認後兩個終端機都 Ctrl-C 結束。**全程不要動 port 3001。**

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/NotifyLogTable.tsx src/components/settings/NotifyManager.tsx
git commit -m "feat(notify): show the notification log with failure details"
```

---

## 上線檢查清單

實作完成後、正式啟用前逐項確認：

- [ ] `.env` 已設定 `SMTP_HOST` 與 `SMTP_FROM`（`SMTP_USER` / `SMTP_PASS` 依 IT 回覆決定是否填）
- [ ] 已在正式環境按過「寄測試信」並確實收到
- [ ] `mailDomain` 與 `systemUrl` 已填正確值
- [ ] 預設規則的主旨、開頭、結尾文字已確認過措辭
- [ ] `requiredPersonnel` 的帳號名對齊作業已完成（此為前提，非本計畫範圍）
- [ ] **先只啟用一個測試單位**：預設規則 `enabled` 關閉、目標單位的規則 `enabled` 開啟，總開關開啟
- [ ] 試跑一至兩週後，再逐一開啟其餘單位
- [ ] 重啟 port 3001 常駐程序時挑離峰時段（VSMS 為單一 session，重啟會使線上使用者登出）
