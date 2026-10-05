# 統一假日清單 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 VSMS、VTMS、MCP 全部只讀一份假日清單（`vsms.rest_days_config.specificDates`），週六日一律休息，並停用 `calendar_config`。

**Architecture:** 每個系統各有一支讀取函式（VSMS `server/src/lib/holidays.ts`、VTMS `jobs/sources/vsmsConfig.ts`、MCP `HolidayList` + `IntegrationRepository.GetHolidaysAsync`），負責查表、把 `YYYY/MM/DD` 或 `YYYY-MM-DD` 正規化成 ISO、略過格式不合的單筆、整列缺失或 JSON 壞掉時拋錯。VSMS 的政府日曆匯入改成在一個交易裡只新增不刪除地併進同一份清單；設定頁存檔會驗證並正規化日期。

**Tech Stack:** VSMS：Express + Prisma（MariaDB）+ React/zustand + vitest。VTMS：Express + drizzle + vitest。MCP：ASP.NET Core 8 + Dapper + xUnit。

**規格：** `docs/superpowers/specs/2026-10-05-unified-holiday-list-design.md`

## Global Constraints

- 唯一來源：`vsms.rest_days_config` 的 `id = 1` 那列的 `specificDates`；儲存格式一律 `YYYY/MM/DD`。
- 週六日在所有系統一律是休息日；`weekends` 欄位保留但沒有程式再讀，寫入一律 `true`。
- 讀取：每筆接受 `YYYY/MM/DD` 或 `YYYY-MM-DD`；格式不合的單筆略過並 warn；整列不存在或 JSON 無法解析就拋錯，**絕不退化成空清單**。
- 年度涵蓋：某年度在清單中沒有任何日期＝未匯入。註記文字逐字沿用：`行事曆未涵蓋 {year} 年，工作日僅排除週六日、未排除國定假日`。
- `calendar_config` 在 Task 11 之前不得刪除或改寫（退版依據，凍結到 2026-11-30）。
- 匯入政府日曆只新增不刪除；單月非週末假日 > 8 天整份拒絕（`MAX_WEEKDAY_HOLIDAYS_PER_MONTH = 8`，已上線，保留）。
- **git 安全**：禁止 `git restore`、`git checkout -- <file>`、`git stash`、`git reset`；只 `git add` 自己改的檔案。
- **時間**：改正式資料或重啟服務前，用 `powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'"` 確認台北時間並看到 `+08:00`（Git Bash 的 `TZ=Asia/Taipei date` 會靜默印 UTC）。VTMS 通知 09:00／09:30、VSMS 預告信 08:00；當天已過時間且還沒跑的 job 會在改完後 5 分鐘內補跑。
- 分支：VSMS 在 `feat/guest-role-and-uiux`；VTMS、vportal 在 `master`；MCP 沒有 git，改動前先備份原始碼資料夾。推 GitHub 前要問使用者。
- 指令（照抄，不要自己拼）：
  - VSMS 後端單檔測試：`npx vitest run --config server/vitest.config.ts <檔案>`；全部：`npm run test:server`
  - VSMS 前端單檔測試：`npx vitest run <檔案>`；全部：`npm test`
  - VSMS 型別檢查：`npx tsc -p server/tsconfig.json --noEmit` 與 `npx tsc --noEmit -p tsconfig.app.json`（**不是** `-p tsconfig.json`，那份是 references 殼，什麼都不檢查）
  - VTMS：`npm run test:server -- --run <檔案>`、`npm run typecheck`
  - MCP：在 `F:\mcp-api-src` 跑 `dotnet test VIB_All.sln`
- commit 訊息結尾加：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| 系統 | 檔案 | 責任 |
|---|---|---|
| VSMS | `server/src/lib/holidays.ts`（新） | 唯一讀取函式 `readHolidays`、正規化 `normalizeHolidayDates`、寫入驗證 `normalizeRestDatesForWrite`、註記文字 `uncoveredYearNote` |
| VSMS | `server/src/routes/analytics.ts`、`server/src/routes/integration.ts` | 負載分布改讀 `readHolidays` |
| VSMS | `server/src/lib/notifyDate.ts`、`lib/notifyStore.ts`、`routes/notify.ts` | 預告信日期：週末固定休息，`RestDaySettings` 只剩 `specificDates` |
| VSMS | `server/src/routes/options.ts` | 存檔時驗證並正規化 `specificDates`、`weekends` 固定 `true` |
| VSMS | `server/src/routes/calendar.ts` | 匯入改併進 `rest_days_config`；移除 `GET /non-weekend-holidays` |
| VSMS | `src/lib/restDays.ts`、`src/dashboard/script.ts`、`src/components/settings/RestDaysManager.tsx`、`src/components/settings/CalendarImport.tsx`、`src/store/optionsStore.ts` | 前端週末固定休息、拿掉開關、匯入單一請求並更新 store |
| VTMS | `server/src/jobs/sources/vsmsConfig.ts` | 改讀 `rest_days_config` |
| MCP | `vsms_Csharp/Services/HolidayList.cs`（新）、`IntegrationRepository.cs`、`IntegrationServiceImpl.cs`、`CoverageService.cs`、`IIntegrationService.cs` | 改讀 `rest_days_config` |
| vportal | `docs/guides/vsms/role-admin.md`、`settings.md`、`analytics.md` | 說明改成單一清單 |

---

### Task 1: 補資料（上線步驟 ①）

**Files:** 無程式碼變動。備份寫到 `F:\backups\unified-holidays-20261005\`。

**Interfaces:** Produces：`rest_days_config.specificDates` 含 `2026/02/27`，供 Task 2 起所有讀取端。

- [ ] **Step 1: 確認台北時間**

Run: `powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'"`
Expected: 看到 `+08:00`。這一步只加一個 2 月的日期，不影響今天是不是工作日，任何時間都可以做；記下時間供報告用。

- [ ] **Step 2: 備份並補上 2026/02/27**

在 `F:\vtms\vtms-export\server` 建立 `_tmp_add_0227.cjs`（那裡有 dotenv 與 mysql2）：

```js
require('dotenv').config({ path: 'F:/vtms/vtms-export/.env' });
const mysql = require('mysql2/promise');
const fs = require('fs');
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.DB_HOST, port: +e.DB_PORT, user: e.DB_USER, password: e.DB_PASSWORD, database: e.DB_NAME, dateStrings: true });
  fs.mkdirSync('F:/backups/unified-holidays-20261005', { recursive: true });
  await c.beginTransaction();
  const [[row]] = await c.query('SELECT id, weekends, CAST(specificDates AS CHAR) j FROM vsms.rest_days_config WHERE id=1 FOR UPDATE');
  fs.writeFileSync('F:/backups/unified-holidays-20261005/rest_days_config.before.json', JSON.stringify(row, null, 2));
  const [[cal]] = await c.query('SELECT id, year, CAST(nonWeekendHolidays AS CHAR) j, sourceName, updatedAt FROM vsms.calendar_config WHERE id=1');
  fs.writeFileSync('F:/backups/unified-holidays-20261005/calendar_config.before.json', JSON.stringify(cal, null, 2));
  const dates = JSON.parse(row.j);
  if (dates.includes('2026/02/27')) { await c.rollback(); console.log('already present'); return c.end(); }
  const next = [...dates, '2026/02/27'].sort();
  await c.query('UPDATE vsms.rest_days_config SET specificDates = CAST(? AS JSON) WHERE id = 1', [JSON.stringify(next)]);
  await c.commit();
  const [[after]] = await c.query('SELECT CAST(specificDates AS CHAR) j FROM vsms.rest_days_config WHERE id=1');
  console.log('after:', after.j);
  await c.end();
})().catch(err => { console.error(err.message); process.exit(1); });
```

Run: `cd F:/vtms/vtms-export/server && timeout 60 node _tmp_add_0227.cjs && rm -f _tmp_add_0227.cjs`
Expected: `after:` 那行是 16 筆、含 `"2026/02/27"` 與 `"2026/12/25"`。

- [ ] **Step 3: 確認兩份清單只差 12/25**

Run（同目錄，臨時腳本，跑完刪掉）：

```js
require('dotenv').config({ path: 'F:/vtms/vtms-export/.env' });
const mysql = require('mysql2/promise');
(async () => {
  const e = process.env;
  const c = await mysql.createConnection({ host: e.DB_HOST, port: +e.DB_PORT, user: e.DB_USER, password: e.DB_PASSWORD, database: e.DB_NAME });
  const [[cal]] = await c.query('SELECT nonWeekendHolidays h FROM vsms.calendar_config WHERE id=1');
  const [[rd]] = await c.query('SELECT specificDates s FROM vsms.rest_days_config WHERE id=1');
  const A = new Set(cal.h), B = new Set(rd.s.map(d => d.replace(/\//g, '-')));
  console.log('only calendar:', [...A].filter(d => !B.has(d)), 'only rest:', [...B].filter(d => !A.has(d)));
  await c.end();
})();
```

Expected: `only calendar: [] only rest: [ '2026-12-25' ]`

---

### Task 2: VSMS 唯一讀取函式 `lib/holidays.ts`

**Files:**
- Create: `F:\vsms\vsms-export\server\src\lib\holidays.ts`
- Test: `F:\vsms\vsms-export\server\src\__tests__\holidays.test.ts`

**Interfaces:**
- Produces:
  - `interface HolidayList { dates: string[]; years: Set<number> }`（`dates` 為 ISO、排序、去重）
  - `toIsoHoliday(value: string): string | null`
  - `normalizeHolidayDates(raw: unknown): HolidayList`（`raw` 可為陣列或 JSON 字串；非陣列或 JSON 壞掉拋錯）
  - `readHolidays(): Promise<HolidayList>`（`id=1` 列不存在拋錯）
  - `uncoveredYearNote(year: number): string`
  - `normalizeRestDatesForWrite(raw: unknown): { ok: true; dates: string[] } | { ok: false; bad: string[] }`（`dates` 為 `YYYY/MM/DD`、排序、去重）

- [ ] **Step 1: 寫失敗的測試**

```ts
// server/src/__tests__/holidays.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { restFindUnique } = vi.hoisted(() => ({ restFindUnique: vi.fn() }))
vi.mock('../lib/db.js', () => ({ prisma: { restDaysConfig: { findUnique: restFindUnique } } }))

import {
  toIsoHoliday, normalizeHolidayDates, readHolidays, uncoveredYearNote, normalizeRestDatesForWrite,
} from '../lib/holidays.js'

beforeEach(() => { vi.clearAllMocks() })

describe('toIsoHoliday', () => {
  it('斜線與 ISO 都轉成 ISO', () => {
    expect(toIsoHoliday('2026/02/27')).toBe('2026-02-27')
    expect(toIsoHoliday('2026-02-27')).toBe('2026-02-27')
    expect(toIsoHoliday(' 2026/12/25 ')).toBe('2026-12-25')
  })
  it('格式不合或不存在的日期回 null', () => {
    expect(toIsoHoliday('2026/2/27')).toBeNull()
    expect(toIsoHoliday('2026/02/30')).toBeNull()
    expect(toIsoHoliday('明天')).toBeNull()
  })
})

describe('normalizeHolidayDates', () => {
  it('混用格式、去重、排序，並列出年度', () => {
    const list = normalizeHolidayDates(['2026/12/25', '2026-02-27', '2026/02/27', '2027/01/01'])
    expect(list.dates).toEqual(['2026-02-27', '2026-12-25', '2027-01-01'])
    expect([...list.years].sort()).toEqual([2026, 2027])
  })
  it('接受 MySQL 回的 JSON 字串', () => {
    expect(normalizeHolidayDates('["2026/10/09"]').dates).toEqual(['2026-10-09'])
  })
  it('格式不合的單筆略過並 warn，其餘照用', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = normalizeHolidayDates(['2026/10/09', 'oops', 42])
    expect(list.dates).toEqual(['2026-10-09'])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
  it('空陣列是合法的：沒有任何年度', () => {
    expect(normalizeHolidayDates([])).toEqual({ dates: [], years: new Set() })
  })
  // 假日被靜默清空，國定假日就會被當工作日：JSON 壞掉或不是陣列一定要拋錯
  it('JSON 壞掉或不是陣列時拋錯', () => {
    expect(() => normalizeHolidayDates('["2026/10/09"')).toThrow(/specificDates/)
    expect(() => normalizeHolidayDates({ a: 1 })).toThrow(/specificDates/)
  })
})

describe('readHolidays', () => {
  it('讀 rest_days_config id=1 的 specificDates', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2026/10/09', '2026/10/26'] })
    const list = await readHolidays()
    expect(restFindUnique).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(list.dates).toEqual(['2026-10-09', '2026-10-26'])
  })
  it('整列不存在時拋錯，不退化成空清單', async () => {
    restFindUnique.mockResolvedValue(null)
    await expect(readHolidays()).rejects.toThrow(/rest_days_config/)
  })
})

describe('uncoveredYearNote', () => {
  it('文字與既有註記逐字相同', () => {
    expect(uncoveredYearNote(2027)).toBe('行事曆未涵蓋 2027 年，工作日僅排除週六日、未排除國定假日')
  })
})

describe('normalizeRestDatesForWrite', () => {
  it('兩種格式都收，一律存成斜線、排序、去重', () => {
    expect(normalizeRestDatesForWrite(['2026-10-10', '2026/02/27', '2026/10/10']))
      .toEqual({ ok: true, dates: ['2026/02/27', '2026/10/10'] })
  })
  it('任一筆不合法就整份拒絕並列出壞的值', () => {
    expect(normalizeRestDatesForWrite(['2026/02/27', '2026/02/30', 'x']))
      .toEqual({ ok: false, bad: ['2026/02/30', 'x'] })
  })
  it('不是陣列就拒絕', () => {
    expect(normalizeRestDatesForWrite(undefined)).toEqual({ ok: false, bad: ['undefined'] })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd F:/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/holidays.test.ts`
Expected: FAIL，`Failed to resolve import "../lib/holidays.js"`

- [ ] **Step 3: 實作**

```ts
// server/src/lib/holidays.ts
import { prisma } from './db.js'

/**
 * 全平台唯一的假日清單：rest_days_config.specificDates（設定頁「特定休息日」）。
 * VSMS、VTMS、MCP 都只讀這一份；週六日一律休息，不在清單裡。
 * 規格：docs/superpowers/specs/2026-10-05-unified-holiday-list-design.md
 *
 * 2026-10 以前另有一份 calendar_config（政府日曆匯入）供負載圖與 VTMS 使用，兩份各錯
 * 一天、設定頁改的不會生效到 VTMS，10 月整片誤判的資料因此藏了半年。別再開第二份。
 */
export interface HolidayList {
  /** ISO YYYY-MM-DD，排序、去重 */
  dates: string[]
  /** 清單中出現過的年度；不在這裡的年度＝那年的假日還沒匯入 */
  years: Set<number>
}

const DATE_RE = /^(\d{4})[/-](\d{2})[/-](\d{2})$/

/** 'YYYY/MM/DD' 或 'YYYY-MM-DD' → ISO；格式不合或不是真實日期回 null。 */
export function toIsoHoliday(value: string): string | null {
  const m = DATE_RE.exec(value.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) {
    return null
  }
  return `${y}-${mo}-${d}`
}

export function normalizeHolidayDates(raw: unknown): HolidayList {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw) as unknown
    } catch (err) {
      throw new Error(`rest_days_config.specificDates 不是合法的 JSON：${(err as Error).message}`, { cause: err })
    }
  }
  if (!Array.isArray(arr)) throw new Error('rest_days_config.specificDates 不是陣列')

  const set = new Set<string>()
  for (const v of arr) {
    const iso = typeof v === 'string' ? toIsoHoliday(v) : null
    // 單筆手誤不該讓整份清單失效：略過並留下紀錄，寫入端（options PUT）擋新的錯誤資料
    if (iso) set.add(iso)
    else console.warn('[holidays] 略過格式不合的休息日：', JSON.stringify(v))
  }
  const dates = [...set].sort()
  return { dates, years: new Set(dates.map(d => Number(d.slice(0, 4)))) }
}

export async function readHolidays(): Promise<HolidayList> {
  const row = await prisma.restDaysConfig.findUnique({ where: { id: 1 } })
  // initDb 開機時就會建這一列；缺列代表資料被動過，不能當成「沒有假日」繼續算
  if (!row) throw new Error('rest_days_config 沒有 id=1 的列')
  return normalizeHolidayDates(row.specificDates)
}

export function uncoveredYearNote(year: number): string {
  return `行事曆未涵蓋 ${year} 年，工作日僅排除週六日、未排除國定假日`
}

/** 設定頁存檔用：兩種格式都收、一律存成 YYYY/MM/DD；任一筆不合法就整份拒絕。 */
export function normalizeRestDatesForWrite(raw: unknown):
  | { ok: true; dates: string[] }
  | { ok: false; bad: string[] } {
  if (!Array.isArray(raw)) return { ok: false, bad: [String(raw)] }
  const bad: string[] = []
  const set = new Set<string>()
  for (const v of raw) {
    const iso = typeof v === 'string' ? toIsoHoliday(v) : null
    if (iso) set.add(iso.replace(/-/g, '/'))
    else bad.push(String(v))
  }
  return bad.length > 0 ? { ok: false, bad } : { ok: true, dates: [...set].sort() }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/holidays.test.ts`
Expected: PASS（13 tests）

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/holidays.ts server/src/__tests__/holidays.test.ts
git commit -m "feat(holidays): single reader for the platform holiday list (rest_days_config)"
```

---

### Task 3: 負載分布與 integration API 改讀 `readHolidays`

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\routes\analytics.ts`（約 75–89 行）
- Modify: `F:\vsms\vsms-export\server\src\routes\integration.ts`（約 305–313 行）
- Test: `F:\vsms\vsms-export\server\src\__tests__\analyticsWorkloadRoute.test.ts`

**Interfaces:** Consumes：Task 2 的 `readHolidays()`、`uncoveredYearNote(year)`。

- [ ] **Step 1: 改測試的 mock 與年度涵蓋案例（先讓它失敗）**

在 `analyticsWorkloadRoute.test.ts`：

把
```ts
const { scheduleFindMany, calendarFindUnique, categoryFindMany } = vi.hoisted(() => ({
  scheduleFindMany: vi.fn(),
  calendarFindUnique: vi.fn(),
```
改成
```ts
const { scheduleFindMany, restDaysFindUnique, categoryFindMany } = vi.hoisted(() => ({
  scheduleFindMany: vi.fn(),
  restDaysFindUnique: vi.fn(),
```

把 mock 裡的
```ts
    calendarConfig: { findUnique: calendarFindUnique },
```
改成
```ts
    restDaysConfig: { findUnique: restDaysFindUnique },
```

把 `beforeEach` 裡的
```ts
  calendarFindUnique.mockResolvedValue(null)
```
改成
```ts
  restDaysFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: [] })
```

把年度涵蓋那個測試整段換成：
```ts
  it('休息日清單有該年度時套用例假日，否則每個年份只留一則提醒', async () => {
    restDaysFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2026/07/06'] })
    const ok = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(ok.body.workdays).toBe(22)
    expect(ok.body.notes).toEqual([])

    const miss = await request(app()).get('/api/analytics/workload?from=2027-01&to=2027-02')
    expect(miss.body.notes).toEqual(['行事曆未涵蓋 2027 年，工作日僅排除週六日、未排除國定假日'])
  })

  it('休息日設定列不存在時回 500，不當成沒有假日', async () => {
    restDaysFindUnique.mockResolvedValue(null)
    const res = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(res.status).toBe(500)
  })
```

（2026 年 7 月有 23 個平日，扣掉 7/06 是 22。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/analyticsWorkloadRoute.test.ts`
Expected: FAIL（route 還在讀 `calendarConfig`，mock 裡沒有 → TypeError／workdays 為 23）

- [ ] **Step 3: 改 `analytics.ts`**

在檔頭 import 區加：
```ts
import { readHolidays, uncoveredYearNote } from '../lib/holidays.js'
```

把
```ts
  // 例假日（非週末）取自政府行事曆匯入，只存一個年度；年度不符的月份僅排除週六日並提醒
  const calendar = await prisma.calendarConfig.findUnique({ where: { id: 1 } })
  const notes: string[] = []
  const notedYears = new Set<number>()
  const monthly: WorkloadResult[] = months.map(month => {
    const year = Number(month.slice(0, 4))
    let holidays: string[] = []
    if (calendar && calendar.year === year) {
      holidays = (calendar.nonWeekendHolidays as string[]) ?? []
    } else if (!notedYears.has(year)) {
      notedYears.add(year)
      notes.push(`行事曆未涵蓋 ${year} 年，工作日僅排除週六日、未排除國定假日`)
    }
    return analyzeWorkload({ month, schedules, holidays, statsModes })
  })
```
換成
```ts
  // 例假日（非週末）取自全平台唯一的休息日清單；某年度清單裡沒有任何日期＝未匯入，提醒一次
  const holidayList = await readHolidays()
  const notes: string[] = []
  const notedYears = new Set<number>()
  const monthly: WorkloadResult[] = months.map(month => {
    const year = Number(month.slice(0, 4))
    if (!holidayList.years.has(year) && !notedYears.has(year)) {
      notedYears.add(year)
      notes.push(uncoveredYearNote(year))
    }
    return analyzeWorkload({ month, schedules, holidays: holidayList.dates, statsModes })
  })
```

VSMS 用 Express 5，async handler 的拋錯會自動交給錯誤處理回 500，不用另加 try/catch。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/analyticsWorkloadRoute.test.ts`
Expected: PASS

- [ ] **Step 5: 改 `integration.ts`**

檔頭 import 區加：
```ts
import { readHolidays, uncoveredYearNote } from '../lib/holidays.js';
```

把
```ts
  // 例假日（非週末）取自政府行事曆匯入；年度不符時僅排除週六日並註明
  const limitations: string[] = [];
  let holidays: string[] = [];
  const calendar = await prisma.calendarConfig.findUnique({ where: { id: 1 } });
  if (calendar && calendar.year === year) {
    holidays = (calendar.nonWeekendHolidays as string[]) ?? [];
  } else {
    limitations.push(`行事曆未涵蓋 ${year} 年，工作日僅排除週六日、未排除國定假日`);
  }
```
換成
```ts
  // 例假日（非週末）取自全平台唯一的休息日清單；該年度沒有任何日期時僅排除週六日並註明
  const limitations: string[] = [];
  const holidayList = await readHolidays();
  const holidays = holidayList.dates;
  if (!holidayList.years.has(year)) limitations.push(uncoveredYearNote(year));
```

- [ ] **Step 6: 型別檢查與後端全部測試**

Run: `npx tsc -p server/tsconfig.json --noEmit && npm run test:server`
Expected: 無型別錯誤；0 failed。

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/analytics.ts server/src/routes/integration.ts server/src/__tests__/analyticsWorkloadRoute.test.ts
git commit -m "feat(workload): read holidays from the rest-day list instead of calendar_config"
```

---

### Task 4: 預告信日期：週末固定休息

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\lib\notifyDate.ts`
- Modify: `F:\vsms\vsms-export\server\src\lib\notifyStore.ts:21-27`
- Modify: `F:\vsms\vsms-export\server\src\routes\notify.ts:330-333`
- Test: `server/src/__tests__/notifyDate.test.ts`（整檔替換）、`summary.test.ts:6`、`notifyRunner.test.ts:47,278`、`notifyRoutes.test.ts:360,379,862-875,891-897`

**Interfaces:** Produces：`interface RestDaySettings { specificDates: string[] }`（`weekends` 移除）；`isRestDay(ymd, settings)` 週六日一律回 `true`。

- [ ] **Step 1: 整檔替換 `notifyDate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { computeSendDate, isRestDay, addDays, addWorkdays, daysBetween, recentWorkdaysStart } from '../lib/notifyDate.js'

// 週六日一律是休息日（2026-10-05 起拿掉開關，規格 2026-10-05-unified-holiday-list-design）
const none = { specificDates: [] as string[] }

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

describe('addWorkdays', () => {
  it('skips the weekend when counting forward three working days', () => {
    // 2026/09/25 是週五 → 09/26(六)、09/27(日) 不計，09/28(一)=1、09/29(二)=2、09/30(三)=3
    expect(addWorkdays('2026/09/25', 3, none)).toBe('2026/09/30')
  })

  it('skips listed specific dates as well as weekends', () => {
    // 09/28(一) 被列為特休 → 不計；跳到 09/29(二)=1、09/30(三)=2、10/01(四)=3
    expect(addWorkdays('2026/09/25', 3, { specificDates: ['2026/09/28'] })).toBe('2026/10/01')
  })

  it('returns the same date when n is 0', () => {
    expect(addWorkdays('2026/09/25', 0, none)).toBe('2026/09/25')
  })
})

describe('recentWorkdaysStart', () => {
  it('counts today as the first working day and walks back over the weekend', () => {
    // 2026/09/23 是週三：23(三)=1、22(二)=2、21(一)=3、20(日)／19(六) 不計、18(五)=4、17(四)=5
    expect(recentWorkdaysStart('2026/09/23', 5, none)).toBe('2026/09/17')
  })

  it('skips listed specific dates as well as weekends', () => {
    // 09/22 特休 → 23=1、21=2、18=3、17=4、16=5
    expect(recentWorkdaysStart('2026/09/23', 5, { specificDates: ['2026/09/22'] })).toBe('2026/09/16')
  })

  it('does not count today when today is a rest day', () => {
    // 2026/09/27 是週日：25(五)=1、24=2、23=3、22=4、21=5
    expect(recentWorkdaysStart('2026/09/27', 5, none)).toBe('2026/09/21')
  })

  it('returns today for n <= 0', () => {
    expect(recentWorkdaysStart('2026/09/23', 0, none)).toBe('2026/09/23')
  })
})

describe('isRestDay', () => {
  it('always treats Saturday and Sunday as rest days', () => {
    expect(isRestDay('2026/08/22', none)).toBe(true)  // 週六
    expect(isRestDay('2026/08/23', none)).toBe(true)  // 週日
    expect(isRestDay('2026/08/21', none)).toBe(false) // 週五
  })
  it('treats a listed specific date as a rest day', () => {
    expect(isRestDay('2026/08/21', { specificDates: ['2026/08/21'] })).toBe(true)
  })
})

describe('computeSendDate', () => {
  it('counts back three working days, skipping the weekend entirely', () => {
    // 2026/08/24 是週一。往前數三個工作天：08/21(五)、08/20(四)、08/19(三)。
    // 舊的日曆天算法會停在 08/21 —— 兩者差兩天，這是本規則的關鍵差異。
    expect(computeSendDate('2026/08/24', 3, none)).toBe('2026/08/19')
  })

  it('does not count rest days towards the lead', () => {
    // 2026/08/26 是週三 → 08/25(二)、08/24(一)、[08/23 日、08/22 六 不計]、08/21(五)
    expect(computeSendDate('2026/08/26', 3, none)).toBe('2026/08/21')
  })

  it('skips a consecutive holiday block without consuming the lead', () => {
    // 08/25(二)、08/24(一) 之後撞上 08/23 日、08/22 六、08/21、08/20 兩個特定
    // 休息日，第三個工作天要一路數到 08/19(三)
    expect(computeSendDate('2026/08/26', 3, { specificDates: ['2026/08/20', '2026/08/21'] })).toBe('2026/08/19')
  })

  it('returns the start date itself when leadDays is not positive', () => {
    // 防呆：leadDays 是管理者可編輯的欄位，0 或負值不能讓迴圈失控
    expect(computeSendDate('2026/08/26', 0, none)).toBe('2026/08/26')
    expect(computeSendDate('2026/08/26', -5, none)).toBe('2026/08/26')
  })

  it('crosses a year boundary', () => {
    // 2027/01/04 是週一 → 01/01(五)=1、12/31(四)=2、12/30(三)=3
    expect(computeSendDate('2027/01/04', 3, none)).toBe('2026/12/30')
  })

  it('returns null when every candidate day within the cap is a rest day', () => {
    // 從 2026/08/23 起往前 40 天全部列為休息日 → 超過 30 天上限
    const dates: string[] = []
    let d = '2026/08/23'
    for (let i = 0; i < 40; i++) { dates.push(d); d = addDays(d, -1) }
    expect(computeSendDate('2026/08/26', 3, { specificDates: dates })).toBeNull()
  })
})
```

- [ ] **Step 2: 改其他測試的 settings 字面值**

- `summary.test.ts` 第 6 行：`const weekendsOnly = { weekends: true, specificDates: [] as string[] }` → `const weekendsOnly = { specificDates: [] as string[] }`
- `notifyRunner.test.ts` 第 47 行：`loadRestDays: async () => ({ weekends: true, specificDates: [] }),` → `loadRestDays: async () => ({ specificDates: [] }),`
- `notifyRunner.test.ts` 第 278 行：`return { weekends: true, specificDates: dates }` → `return { specificDates: dates }`
- `notifyRoutes.test.ts` 預覽測試（約 350–385 行）：把
  ```ts
    // 固定日期而非用「今天」推算 sendDate，避免測試結果隨執行日期的星期幾而
    // 飄動：2031/03/10 是週一，往前推 5 天的 2031/03/05 是週三（非週末），
    // 只有在 restDaysConfig.specificDates 真的被讀取時才會往前多挪一天。
  ```
  改成
  ```ts
    // 固定日期而非用「今天」推算 sendDate，避免測試結果隨執行日期的星期幾而
    // 飄動：2031/03/10 是週一，2031/03/05 是週三，落在往前數 5 個工作天的範圍內，
    // 只有在 restDaysConfig.specificDates 真的被讀取時才會往前多挪一天。
  ```
  `state.restDays = { id: 1, weekends: false, specificDates: [naiveSendDate] }` → `state.restDays = { id: 1, weekends: true, specificDates: [naiveSendDate] }`
  把
  ```ts
    const expectedSendDate = computeSendDate(startDate, leadDays, {
      weekends: false, specificDates: [naiveSendDate],
    })
    // 前提檢查：確定這個 fixture 真的會造成往前挪一天，不然下面的斷言測不出
    // 「忽略 specificDates」的回歸。
    expect(expectedSendDate).not.toBe(naiveSendDate)
  ```
  改成
  ```ts
    const expectedSendDate = computeSendDate(startDate, leadDays, { specificDates: [naiveSendDate] })
    // 前提檢查：確定這個 fixture 真的會造成往前挪一天，不然下面的斷言測不出
    // 「忽略 specificDates」的回歸。
    expect(expectedSendDate).not.toBe(computeSendDate(startDate, leadDays, { specificDates: [] }))
  ```
- `notifyRoutes.test.ts` 寄送紀錄窗測試（約 860–876 行）：把
  ```ts
    state.restDays = { id: 1, weekends: false, specificDates: [] } // 沒有休息日 → 窗＝最近 5 個日曆天（含今天）
    state.logs = [
      log({ id: 'in', sendDate: addDays(today, -4), updatedAt: longAgo }),
      log({ id: 'out', sendDate: addDays(today, -5), updatedAt: longAgo }),
    ]
  ```
  改成
  ```ts
    state.restDays = { id: 1, weekends: true, specificDates: [] }
    // 週末固定休息，窗起日隨今天星期幾變動，所以用同一支函式算邊界
    const windowStart = recentWorkdaysStart(today, 5, { specificDates: [] })
    state.logs = [
      log({ id: 'in', sendDate: windowStart, updatedAt: longAgo }),
      log({ id: 'out', sendDate: addDays(windowStart, -1), updatedAt: longAgo }),
    ]
  ```
  並把同一個測試裡的 `expect(res.body.windowStart).toBe(addDays(today, -4))` 改成 `expect(res.body.windowStart).toBe(windowStart)`
- `notifyRoutes.test.ts` 約 897 行：`recentWorkdaysStart(today, 5, { weekends: true, specificDates: [] })` → `recentWorkdaysStart(today, 5, { specificDates: [] })`

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/notifyDate.test.ts`
Expected: FAIL（`isRestDay` 在沒有 `weekends: true` 時不把週末當休息日，例如 `always treats Saturday and Sunday as rest days` 失敗）

- [ ] **Step 4: 改 `notifyDate.ts`**

把
```ts
export interface RestDaySettings {
  weekends: boolean
  /** YYYY/MM/DD */
  specificDates: string[]
}
```
換成
```ts
export interface RestDaySettings {
  /** YYYY/MM/DD。週六日不必列，一律是休息日（全平台共用的休息日清單，見 lib/holidays.ts） */
  specificDates: string[]
}
```

把
```ts
export function isRestDay(ymd: string, settings: RestDaySettings): boolean {
  if (settings.weekends) {
    const dow = toUtc(ymd).getUTCDay()
    if (dow === 0 || dow === 6) return true
  }
  return settings.specificDates.includes(ymd)
}
```
換成
```ts
export function isRestDay(ymd: string, settings: RestDaySettings): boolean {
  const dow = toUtc(ymd).getUTCDay()
  if (dow === 0 || dow === 6) return true
  return settings.specificDates.includes(ymd)
}
```

- [ ] **Step 5: 改 `notifyStore.ts` 與 `routes/notify.ts`**

`notifyStore.ts`：
```ts
  async loadRestDays(): Promise<RestDaySettings> {
    const row = await prisma.restDaysConfig.findUnique({ where: { id: 1 } })
    return {
      weekends: row?.weekends ?? true,
      specificDates: (row?.specificDates as string[]) ?? [],
    }
  },
```
→
```ts
  async loadRestDays(): Promise<RestDaySettings> {
    const row = await prisma.restDaysConfig.findUnique({ where: { id: 1 } })
    return { specificDates: (row?.specificDates as string[]) ?? [] }
  },
```

`routes/notify.ts` 預覽：
```ts
  const sendDate = computeSendDate(schedule.startDate, leadDays, {
    weekends: restDays?.weekends ?? true,
    specificDates: (restDays?.specificDates as string[]) ?? [],
  })
```
→
```ts
  const sendDate = computeSendDate(schedule.startDate, leadDays, {
    specificDates: (restDays?.specificDates as string[]) ?? [],
  })
```

- [ ] **Step 6: 型別檢查與後端全部測試**

Run: `npx tsc -p server/tsconfig.json --noEmit && npm run test:server`
Expected: 無型別錯誤；0 failed。若 tsc 指出還有測試字面值帶 `weekends` 給 `RestDaySettings`，把該欄位刪掉（只刪 `weekends`，不動 DB row 形狀的 fixture，例如 `state.restDays`）。

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/notifyDate.ts server/src/lib/notifyStore.ts server/src/routes/notify.ts server/src/__tests__/notifyDate.test.ts server/src/__tests__/summary.test.ts server/src/__tests__/notifyRunner.test.ts server/src/__tests__/notifyRoutes.test.ts
git commit -m "feat(notify): weekends are always rest days; drop the weekends flag from RestDaySettings"
```

---

### Task 5: 設定頁存檔驗證日期、`weekends` 固定寫 `true`

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\routes\options.ts`（`router.put('/')` 開頭）
- Test: `F:\vsms\vsms-export\server\src\__tests__\optionsPutVauth.test.ts`

**Interfaces:** Consumes：Task 2 的 `normalizeRestDatesForWrite(raw)`。

- [ ] **Step 1: 改既有斷言並加新測試**

`optionsPutVauth.test.ts` 的
```ts
    expect(fake.state.restDays).toMatchObject({ weekends: false, specificDates: ['2026-10-10'] })
```
改成
```ts
    // 寫入時正規化成 YYYY/MM/DD，週末開關固定 true（規格 2026-10-05-unified-holiday-list-design）
    expect(fake.state.restDays).toMatchObject({ weekends: true, specificDates: ['2026/10/10'] })
```

在 `describe('PUT /api/options under AUTH_PROVIDER=vauth', ...)` 內最後加：
```ts
  it('特定休息日有不合法的日期時整份拒絕，資料庫不動', async () => {
    process.env.AUTH_PROVIDER = 'vauth'
    const fake = makeFakePrisma()
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options')
      .send({ ...staleBody, restDays: { weekends: true, specificDates: ['2026/02/27', '2026/02/30'] } })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('2026/02/30')
    expect(fake.state.restDays).toEqual({ id: 1, weekends: true, specificDates: [] })
    expect(fake.state.audits).toHaveLength(0)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/optionsPutVauth.test.ts`
Expected: FAIL（存的是 `weekends: false`／`'2026-10-10'`；不合法日期回 200）

- [ ] **Step 3: 改 `options.ts`**

檔頭 import 區加：
```ts
import { normalizeRestDatesForWrite } from '../lib/holidays.js'
```

把
```ts
router.put('/', async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const body = req.body as OptionsMap
```
換成
```ts
router.put('/', async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const body = req.body as OptionsMap

  // 特定休息日是全平台唯一的假日清單（VTMS 通知、負載圖、MCP 都讀它），寫進去前先驗。
  // 週六日一律休息，weekends 只為相容保留，固定寫 true。
  const restDates = normalizeRestDatesForWrite(body.restDays?.specificDates)
  if (!restDates.ok) {
    res.status(400).json({ ok: false, message: `特定休息日格式不正確：${restDates.bad.join('、')}（請用 YYYY/MM/DD）` })
    return
  }
  body.restDays = { weekends: true, specificDates: restDates.dates }
```

兩處 `restDaysConfig.upsert` 已經讀 `body.restDays.weekends`／`body.restDays.specificDates`，不用改。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/optionsPutVauth.test.ts server/src/__tests__/optionsPutEngineerGuard.test.ts server/src/__tests__/optionsRoundTrip.test.ts server/src/__tests__/optionsDepartment.test.ts`
Expected: PASS。若其他 options 測試因斷言 `weekends: false` 或 ISO 日期而失敗，依同樣規則改斷言（`weekends: true`、斜線日期）。

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/options.ts server/src/__tests__/optionsPutVauth.test.ts
git commit -m "feat(options): validate and normalise rest dates on save; weekends is always true"
```

（若 Step 4 有改到其他 options 測試檔，一併 `git add`。）

---

### Task 6: 匯入政府日曆改併進休息日清單

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\routes\calendar.ts`（`POST /import-government` 的寫入段；刪除 `GET /non-weekend-holidays`）
- Test: `F:\vsms\vsms-export\server\src\__tests__\calendarImportRoute.test.ts`

**Interfaces:**
- Produces（回應）：`{ ok: true, year: number, detected: number, added: number, skipped: number, specificDates: string[] }`；`specificDates` 是寫入後的完整清單（`YYYY/MM/DD`）。失敗：`{ ok: false, message }`（422／500）。

- [ ] **Step 1: 改測試**

把檔頭的 mock 換成：
```ts
const { restFindUnique, restUpsert } = vi.hoisted(() => ({
  restFindUnique: vi.fn(),
  restUpsert: vi.fn(),
}))

// 刻意不提供 calendarConfig：route 若還去寫舊表，會在這裡直接 TypeError
vi.mock('../lib/db.js', () => {
  const tx = { restDaysConfig: { findUnique: restFindUnique, upsert: restUpsert } }
  return { prisma: { ...tx, $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) } }
})
```

`beforeEach` 換成：
```ts
beforeEach(() => {
  restFindUnique.mockReset()
  restUpsert.mockReset()
  restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: [] })
})
```

把「正常的日曆照常匯入」整段換成：
```ts
  it('正常的日曆併進休息日清單，回傳完整清單', async () => {
    const file = await buildCalendar(2026, [
      { month: 2, extraFilled: [16, 17, 18, 19, 20, 27] }, // 春節連假，單月 6 個平日
      { month: 10, extraFilled: [9, 26] },
    ])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    const expected = [
      '2026/02/16', '2026/02/17', '2026/02/18', '2026/02/19', '2026/02/20', '2026/02/27',
      '2026/10/09', '2026/10/26',
    ]
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, year: 2026, detected: 8, added: 8, skipped: 0, specificDates: expected })
    expect(restUpsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, weekends: true, specificDates: expected },
      update: { weekends: true, specificDates: expected },
    })
  })

  // 只新增不刪除：公司自訂休假與其他年度的日期都要留著
  it('既有的日期保留，重複的略過', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2025/12/25', '2026/10/09', '2026/11/20'] })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    const res = await request(app())
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.body).toMatchObject({ ok: true, detected: 2, added: 1, skipped: 1 })
    expect(res.body.specificDates).toEqual(['2025/12/25', '2026/10/09', '2026/10/26', '2026/11/20'])
  })
```

把「某個月平日假日多得不合理時整份拒絕」那段的最後一行
```ts
    expect(calendarUpsert).not.toHaveBeenCalled()
```
改成
```ts
    expect(restUpsert).not.toHaveBeenCalled()
```

在檔尾 `describe('POST /api/calendar/import-government', ...)` 內加：
```ts
  it('舊的 GET /non-weekend-holidays 已移除', async () => {
    const res = await request(app()).get('/api/calendar/non-weekend-holidays?year=2026')
    expect(res.status).toBe(404)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/calendarImportRoute.test.ts`
Expected: FAIL（route 還在呼叫 `prisma.calendarConfig.upsert` → 500；GET 還在 → 200）

- [ ] **Step 3: 改 `calendar.ts`**

把 `import-government` handler 裡從
```ts
      await prisma.calendarConfig.upsert({
```
到該 handler 成功回應
```ts
      return res.json({
        ok: true,
        year: parsed.year,
        detectedHolidayColor: parsed.holidayColor,
        nonWeekendHolidayCount: parsed.nonWeekendHolidays.length,
        sample: parsed.nonWeekendHolidays.slice(0, 12),
      })
```
為止整段換成：
```ts
      // 併進全平台唯一的休息日清單（rest_days_config）。只新增不刪除：清單裡手動加的
      // 公司休假與其他年度的日期都要留著；匯入錯的日期由管理員在同一個畫面刪除。
      // 不再寫 calendar_config（2026-10-05 停用，見 specs/2026-10-05-unified-holiday-list-design.md）。
      const incoming = parsed.nonWeekendHolidays.map(d => d.replace(/-/g, '/'))
      const merged = await prisma.$transaction(async tx => {
        const row = await tx.restDaysConfig.findUnique({ where: { id: 1 } })
        const existing = new Set((row?.specificDates as string[] | undefined) ?? [])
        const added = incoming.filter(d => !existing.has(d))
        const specificDates = [...existing, ...added].sort()
        await tx.restDaysConfig.upsert({
          where: { id: 1 },
          create: { id: 1, weekends: true, specificDates },
          update: { weekends: true, specificDates },
        })
        return { added: added.length, specificDates }
      })

      return res.json({
        ok: true,
        year: parsed.year,
        detected: incoming.length,
        added: merged.added,
        skipped: incoming.length - merged.added,
        specificDates: merged.specificDates,
      })
```

刪除整個 `GET /non-weekend-holidays` handler（從 `// GET /api/calendar/non-weekend-holidays` 註解到它的 `})` 為止）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/calendarImportRoute.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: 確認沒有其他人呼叫舊 GET**

Run: `grep -rn "non-weekend-holidays" src server/src --include=*.ts --include=*.tsx`
Expected: 只剩 `src/components/settings/CalendarImport.tsx`（Task 7 移除）與本測試。

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/calendar.ts server/src/__tests__/calendarImportRoute.test.ts
git commit -m "feat(calendar): import merges into the rest-day list in one transaction; stop writing calendar_config"
```

---

### Task 7: VSMS 前端

**Files:**
- Modify: `F:\vsms\vsms-export\src\lib\restDays.ts`
- Modify: `F:\vsms\vsms-export\src\dashboard\script.ts:128-136`
- Modify: `F:\vsms\vsms-export\src\components\settings\RestDaysManager.tsx`
- Modify: `F:\vsms\vsms-export\src\components\settings\CalendarImport.tsx`
- Modify: `F:\vsms\vsms-export\src\store\optionsStore.ts`
- Test: `F:\vsms\vsms-export\src\__tests__\restDays.test.ts`（新）、`F:\vsms\vsms-export\src\__tests__\calendarImport-store.test.tsx`（新）

**Interfaces:**
- Consumes：Task 6 的匯入回應 `{ ok, year, detected, added, skipped, specificDates }`。
- Produces：`useOptionsStore().applyRestDays(config: RestDaysConfig): void`（只更新 store，不 PUT）；`isRestDay(date: Date, config: Pick<RestDaysConfig, 'specificDates'>): boolean`。

- [ ] **Step 1: 寫失敗的測試**

```ts
// src/__tests__/restDays.test.ts
import { describe, it, expect } from 'vitest'
import { isRestDay } from '../lib/restDays'

describe('isRestDay（前端）', () => {
  it('週六日一律是休息日，不看 weekends 開關', () => {
    const cfg = { weekends: false, specificDates: [] as string[] }
    expect(isRestDay(new Date(2026, 9, 3), cfg)).toBe(true)  // 週六
    expect(isRestDay(new Date(2026, 9, 4), cfg)).toBe(true)  // 週日
    expect(isRestDay(new Date(2026, 9, 5), cfg)).toBe(false) // 週一
  })
  it('清單裡的日期是休息日', () => {
    expect(isRestDay(new Date(2026, 9, 9), { specificDates: ['2026/10/09'] })).toBe(true)
  })
})
```

```tsx
// src/__tests__/calendarImport-store.test.tsx
// 匯入改成後端一次完成：前端只發一個 POST，成功後用回應更新 store。
// 不更新 store 的話，設定頁下一次整份 PUT options 會把剛匯入的日期蓋掉。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalendarImport from '../components/settings/CalendarImport'
import { useOptionsStore } from '../store/optionsStore'
import { DEFAULT_OPTIONS } from '../constants'

beforeEach(() => { useOptionsStore.setState({ options: { ...DEFAULT_OPTIONS, restDays: { weekends: true, specificDates: ['2026/01/01'] } } }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('CalendarImport', () => {
  it('只呼叫一次匯入 API，並用回應的完整清單更新 store', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true, year: 2026, detected: 2, added: 1, skipped: 1, specificDates: ['2026/01/01', '2026/02/27'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<CalendarImport />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], '115年辦公日曆表.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /匯入/ }))

    expect(await screen.findByText('匯入成功（2026 年）')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/calendar/import-government')
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/01/01', '2026/02/27'])
  })

  it('後端拒絕時顯示訊息，store 不變', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false, message: '解析結果不合理：2026-10 有 18 個平日被判為放假',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })))

    const { container } = render(<CalendarImport />)
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'a.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /匯入/ }))

    expect(await screen.findByText(/2026-10 有 18 個平日/)).toBeTruthy()
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/01/01'])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd F:/vsms/vsms-export && npx vitest run src/__tests__/restDays.test.ts src/__tests__/calendarImport-store.test.tsx`
Expected: FAIL（`weekends: false` 時週末不算休息；匯入元件發了 3 個請求、store 沒更新）

- [ ] **Step 3: 改 `src/lib/restDays.ts`**

整檔換成：
```ts
import type { RestDaysConfig } from '../types'

/** 週六日一律休息；specificDates 是全平台共用的休息日清單（VSMS、VTMS、MCP）。 */
export function isRestDay(date: Date, config: Pick<RestDaysConfig, 'specificDates'>): boolean {
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return true
  const ymd = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  return config.specificDates.includes(ymd)
}
```

- [ ] **Step 4: 改 `src/dashboard/script.ts`**

把
```js
    if (cfg.weekends && (wd === 0 || wd === 6)) return true;
```
換成
```js
    if (wd === 0 || wd === 6) return true;
```

- [ ] **Step 5: 在 `optionsStore.ts` 加 `applyRestDays`**

`interface OptionsState` 裡 `setRestDays` 那行下面加：
```ts
  /** 只更新 store、不 PUT：伺服器已經寫好（例如政府日曆匯入），用它的回應同步畫面 */
  applyRestDays: (config: RestDaysConfig) => void
```

實作區 `setRestDays: async (config) => { ... },` 之後加：
```ts
  applyRestDays: (config) => {
    set({ options: { ...get().options, restDays: config } })
  },
```

- [ ] **Step 6: 改 `CalendarImport.tsx`**

刪掉檔頭的 `toYmd` 函式與 `import type { RestDaysConfig } from '../../types'`。

`ImportResult` 不變。把
```ts
  const { options, setRestDays } = useOptionsStore()
```
換成
```ts
  const { applyRestDays } = useOptionsStore()
```

把 `handleUpload` 裡 `try {` 到 `} catch` 之間整段換成：
```ts
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch(withBase('/api/calendar/import-government'), {
        method: 'POST',
        body: fd,
      })
      const json = await resp.json()

      if (!json.ok) {
        setResult({ ok: false, message: json.message ?? '匯入失敗' })
        return
      }

      // 後端已在同一個交易裡併進特定休息日；這裡只同步 store，不能再 PUT——
      // store 若留著舊清單，設定頁下一次整份存檔會把剛匯入的日期蓋掉。
      applyRestDays({ weekends: true, specificDates: json.specificDates })

      setResult({
        ok:                     true,
        year:                   json.year,
        nonWeekendHolidayCount: json.detected,
        added:                  json.added,
        skipped:                json.skipped,
      })
```

成功訊息
```tsx
                ✓ 已同步至下方「特定休息日」清單，可逐筆刪除。
```
改成
```tsx
                ✓ 已併入下方「特定休息日」清單（VSMS、VTMS、MCP 共用），可逐筆刪除。
```

- [ ] **Step 7: 改 `RestDaysManager.tsx`**

刪掉整個週末勾選框：
```tsx
      <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm">
        <input type="checkbox" checked={config.weekends}
          onChange={e => update({ weekends: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-blue-600" />
        <span>星期六、日設為休息日</span>
      </label>
```
換成
```tsx
      <p className="text-xs text-gray-500 mb-4">
        週六、週日固定休息。下方清單供 VSMS、VTMS、MCP 共用，新增或刪除立即全平台生效。
      </p>
```

- [ ] **Step 8: 跑前端測試與型別檢查**

Run: `npx vitest run src/__tests__/restDays.test.ts src/__tests__/calendarImport-store.test.tsx && npm test && npx tsc --noEmit -p tsconfig.app.json`
Expected: 全部 PASS、無型別錯誤。

- [ ] **Step 9: Commit**

```bash
git add src/lib/restDays.ts src/dashboard/script.ts src/store/optionsStore.ts src/components/settings/CalendarImport.tsx src/components/settings/RestDaysManager.tsx src/__tests__/restDays.test.ts src/__tests__/calendarImport-store.test.tsx
git commit -m "feat(settings): weekends always rest; calendar import is one request and syncs the store"
```

---

### Task 8: VSMS 部署

**Files:** 無程式碼變動。

- [ ] **Step 1: 全部驗證**

Run: `cd F:/vsms/vsms-export && npm run test:server && npm test && npx tsc -p server/tsconfig.json --noEmit && npx tsc --noEmit -p tsconfig.app.json`
Expected: 0 failed、無型別錯誤。

- [ ] **Step 2: 確認時間（避開 08:00 前後幾分鐘）**

Run: `powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'"`

- [ ] **Step 3: 備份、先 server 後前端**

```bash
cd F:/vsms/vsms-export
cp -r server/dist server/dist.stable-20261005-pre-unified-holidays
cp -r dist dist.stable-20261005-pre-unified-holidays
npx tsc -p server/tsconfig.json
grep -c "readHolidays" server/dist/src/routes/analytics.js
pm2 restart vsms
npx vite build
```
Expected: grep 輸出 ≥ 1；`vite build` 成功。（`npm run build` 的順序是前端先，不要用。）

- [ ] **Step 4: 上線驗證**

```bash
curl -sk https://172.16.204.69/vsms/api/health
pm2 logs vsms --lines 30 --nostream
```
Expected: `"status":"ok"`；log 沒有 `rest_days_config` 相關錯誤，重啟後沒有立即的 `[notify] daily run`。

用瀏覽器開 `https://172.16.204.69/vsms/` 的「統計分析 › 負載分布」，選 2026-10：工作日應為 20（10 月 22 個平日扣 10/09、10/26），且沒有「行事曆未涵蓋」提醒。再到「系統設定 › 休息日設定」確認週末勾選框已消失、清單有 16 筆。

---

### Task 9: VTMS 改讀休息日清單

**Files:**
- Modify: `F:\vtms\vtms-export\server\src\jobs\sources\vsmsConfig.ts`（整檔）
- Test: `F:\vtms\vtms-export\server\src\jobs\sources\vsmsConfig.test.ts`（整檔）

**Interfaces:** Produces：`readWorkdayCalendar(): Promise<WorkdayCalendar>`，`holidays` 為 ISO、排序、去重（呼叫端不變）。

- [ ] **Step 1: 整檔替換測試**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { executeSpy } = vi.hoisted(() => ({ executeSpy: vi.fn() }));

vi.mock('../../db/connection.js', () => ({ db: { execute: executeSpy } }));
vi.mock('../../config/env.js', () => ({ env: { vsmsDbSchema: 'vsms' } }));

import { readWorkdayCalendar } from './vsmsConfig.js';

// drizzle/mysql2 的 execute 回 [rows, fields]
const rows = (r: unknown[]) => [r, []];

beforeEach(() => {
  executeSpy.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T02:00:00Z')); // 台北 2026-10-05 10:00
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('readWorkdayCalendar', () => {
  it('reads rest_days_config and converts slash dates to ISO', async () => {
    executeSpy.mockResolvedValueOnce(rows([{ specificDates: ['2026/10/26', '2026/10/09'] }]));

    expect(await readWorkdayCalendar()).toEqual({ holidays: ['2026-10-09', '2026-10-26'] });
    expect(JSON.stringify(executeSpy.mock.calls[0][0])).toContain('rest_days_config');
  });

  it('accepts ISO entries and de-duplicates', async () => {
    executeSpy.mockResolvedValueOnce(rows([{ specificDates: ['2026-10-09', '2026/10/09'] }]));

    expect(await readWorkdayCalendar()).toEqual({ holidays: ['2026-10-09'] });
  });

  it('parses the column when MySQL hands back a JSON string', async () => {
    executeSpy.mockResolvedValueOnce(rows([{ specificDates: '["2026/10/09"]' }]));

    expect(await readWorkdayCalendar()).toEqual({ holidays: ['2026-10-09'] });
  });

  it('skips a malformed entry with a warning instead of dropping the whole list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    executeSpy.mockResolvedValueOnce(rows([{ specificDates: ['2026/10/09', '2026/13/40'] }]));

    expect(await readWorkdayCalendar()).toEqual({ holidays: ['2026-10-09'] });
    expect(warn.mock.calls.some(c => String(c[0]).includes('2026/13/40'))).toBe(true);
  });

  it('warns when the current year has no holidays yet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    executeSpy.mockResolvedValueOnce(rows([{ specificDates: ['2025/12/25'] }]));

    await readWorkdayCalendar();
    expect(warn.mock.calls.some(c => String(c[0]).includes('no holidays for 2026'))).toBe(true);
  });

  // 缺列或 JSON 壞掉都不能退化成空清單——那會讓排程把國定假日當工作日跑掉、
  // 寄出錯誤的主管信。必須丟出來，而且錯誤訊息要指名是哪張表、哪個欄位。
  it('rejects when the row is missing', async () => {
    executeSpy.mockResolvedValueOnce(rows([]));

    await expect(readWorkdayCalendar()).rejects.toThrow(/rest_days_config/);
  });

  it('rejects with a diagnosable error when the column holds malformed JSON', async () => {
    executeSpy.mockResolvedValueOnce(rows([{ specificDates: '["2026/10/09"' }]));

    await expect(readWorkdayCalendar()).rejects.toThrow(/specificDates/);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd F:/vtms/vtms-export && npm run test:server -- --run server/src/jobs/sources/vsmsConfig.test.ts`
Expected: FAIL（還在讀 `calendar_config.nonWeekendHolidays`）

- [ ] **Step 3: 整檔替換 `vsmsConfig.ts`**

```ts
import { sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { env } from '../../config/env.js';
import { todayTaipei, type WorkdayCalendar } from '../workdays.js';

/**
 * VSMS 的休息日清單，跨 schema 唯讀。
 *
 * 讀的是 rest_days_config.specificDates（VSMS 設定頁「特定休息日」）——全平台唯一的
 * 假日清單，VSMS 的甘特圖、預告信、負載圖與 MCP 都讀同一份。2026-10-05 以前這裡讀
 * calendar_config（政府日曆匯入），兩份各錯一天、設定頁改的不會生效到這裡，10 月整片
 * 誤判的資料藏了半年。規格：F:\vsms\vsms-export\docs\superpowers\specs\2026-10-05-unified-holiday-list-design.md
 *
 * 為什麼直接讀表而不走 HTTP：VSMS 的 integration API 沒有休息日的端點。加端點要改並
 * 重啟正式的 VSMS 服務；這張是幾乎不變的設定表，唯讀查詢的代價小得多。
 *
 * 主管信的收件人已經改由 vauth 的組織快照解析（見 sources/orgLeads.ts），
 * 不再跨庫讀 VSMS 的 notify_config / notify_rules。
 */

/** drizzle/mysql2 的 execute() 回 [rows, fields]；只取 rows。 */
function unwrap<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result[0] : result) as T[];
}

const DATE_RE = /^(\d{4})[/-](\d{2})[/-](\d{2})$/;

/** 'YYYY/MM/DD' 或 'YYYY-MM-DD' → ISO；格式不合或不是真實日期回 null。 */
function toIso(value: string): string | null {
  const m = DATE_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

export async function readWorkdayCalendar(): Promise<WorkdayCalendar> {
  const schema = env.vsmsDbSchema;
  const where = `\`${schema}\`.rest_days_config`;

  const rows = unwrap<{ specificDates: unknown }>(
    await db.execute(sql.raw(`SELECT specificDates FROM ${where} WHERE id = 1`)),
  );

  // 這裡刻意不要退化成 { holidays: [] }：這支模組餵給排程判斷哪天是工作日，
  // 假期清單一旦被靜默清空，國定假日就會被當成工作日，排程照跑、
  // 真的信會寄到主管信箱說當天有逾期。缺列或損毀的清單必須大聲失敗。
  //
  // 兩個呼叫端各自把這個 throw 記成 failed 的路徑不同，別搞混：
  // - job runner 在 collectFindings 裡呼叫，被 runJob 的 try/catch 接住，
  //   寫進它自己那一列的 status/errorMessage。
  // - scheduler 的 tick 在 job 迴圈**之前**的前導段呼叫，那時候還沒有任何
  //   run 列，所以 tick 有一段 recordPreambleFailure 專門補寫 failed 列。
  //   拿掉那一段的話，這個 throw 就只會每 5 分鐘印一次 stdout 而已。
  if (rows.length === 0) {
    throw new Error(`${where} 沒有 id=1 的列（VSMS 開機時會建立，缺列代表資料被動過）`);
  }

  const raw = rows[0].specificDates;
  // mysql2 對 JSON 欄位有時回已解析的陣列、有時回字串，兩種都要接。
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (err) {
      throw new Error(`${where}.specificDates 不是合法的 JSON：${(err as Error).message}`, { cause: err });
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${where}.specificDates 不是陣列`);
  }

  const holidays = new Set<string>();
  for (const v of parsed) {
    const iso = typeof v === 'string' ? toIso(v) : null;
    // 單筆手誤不該讓整天的通知停擺：略過並留紀錄（VSMS 設定頁存檔時已會擋新的錯誤）
    if (iso) holidays.add(iso);
    else console.warn(`[workdays] 略過格式不合的休息日：${JSON.stringify(v)}`);
  }

  const list = [...holidays].sort();
  const year = todayTaipei().slice(0, 4);
  if (!list.some(d => d.startsWith(`${year}-`))) {
    console.warn(`[workdays] no holidays for ${year} — 休息日清單還沒匯入今年的政府日曆，只排除週六日`);
  }
  return { holidays: list };
}
```

- [ ] **Step 4: 跑測試、型別檢查、server 全部測試**

Run: `npm run test:server -- --run server/src/jobs && npm run typecheck && npm run test:server -- --run`
Expected: 0 failed、typecheck 無輸出錯誤。（server 測試總條數會因 `docxGroupExpander.realTemplates` 浮動 1–2 條，只看 failed。）

- [ ] **Step 5: Commit 與 release check**

```bash
git add server/src/jobs/sources/vsmsConfig.ts server/src/jobs/sources/vsmsConfig.test.ts
git commit -m "fix(notify): read workdays from VSMS rest_days_config, the single platform holiday list"
npm run check:releases -- --ack
```
（這次對使用者唯一的差異是 12/25 不再發通知，不發改版公告。）

- [ ] **Step 6: 部署**

先確認台北時間（避開 09:00–09:35）：`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'"`

```bash
cd F:/vtms/vtms-export
cp -r server/dist server/dist.stable-20261005-pre-unified-holidays
npx tsc -p server/tsconfig.json
grep -c "rest_days_config" server/dist/jobs/sources/vsmsConfig.js
pm2 restart vtms
curl -sk https://172.16.204.69/vtms/api/health
```
Expected: grep ≥ 1；health `"status":"ok"`。

- [ ] **Step 7: 用正式讀取路徑驗證**

在 `F:\vtms\vtms-export\server` 建 `_tmp_verify.ts`，跑完刪掉：
```ts
import 'dotenv/config';
import { readWorkdayCalendar } from './src/jobs/sources/vsmsConfig.js';
import { isWorkday, previousWorkday } from './src/jobs/workdays.js';
const cal = await readWorkdayCalendar();
for (const d of ['2026-02-27', '2026-10-01', '2026-10-09', '2026-12-25', '2026-12-28'])
  console.log(d, isWorkday(d, cal) ? '工作日' : '假日', '前一工作日=', previousWorkday(d, cal));
process.exit(0);
```
Run: `DOTENV_CONFIG_PATH=F:/vtms/vtms-export/.env timeout 90 npx tsx _tmp_verify.ts; rm -f _tmp_verify.ts`
Expected：02-27 假日、10-01 工作日、10-09 假日、12-25 假日、12-28 工作日且前一工作日 = 2026-12-24。

---

### Task 10: MCP 改讀休息日清單

**Files:**
- Create: `F:\mcp-api-src\vsms_Csharp\Services\HolidayList.cs`
- Modify: `F:\mcp-api-src\vsms_Csharp\Services\IntegrationRepository.cs:200-207`
- Modify: `F:\mcp-api-src\vsms_Csharp\Services\IntegrationServiceImpl.cs`（`GetWorkloadAnalysisAsync` 約 169–184 行；刪除 `ParseHolidayJson` 約 503–519 行）
- Modify: `F:\mcp-api-src\vsms_Csharp\Services\CoverageService.cs`（130–136、165–173、234、240–290、313–328 行）
- Modify: `F:\mcp-api-src\vsms_Csharp\Services\IIntegrationService.cs:140-145`（刪 `CalendarConfigRow`）
- Test: `F:\mcp-api-src\Vtms.Api.Tests\VsmsHolidayListTests.cs`（新）
- Create: `F:\mcp-api-src\DEPLOY-20261005-holidays.md`

**Interfaces:**
- Produces：`public sealed record HolidayList(HashSet<string> Dates, HashSet<int> Years, IReadOnlyList<string> Skipped)`，`HolidayList.Parse(string? json)`、`HolidayList.ToIso(string value)`；`IntegrationRepository.GetHolidaysAsync(CancellationToken) : Task<HolidayList>`。

- [ ] **Step 1: 備份原始碼**

```bash
cd F:/mcp-api-src
cp -r vsms_Csharp _src_backup_20261005-holidays
```

- [ ] **Step 2: 寫失敗的測試**

```csharp
// Vtms.Api.Tests/VsmsHolidayListTests.cs
using VSMS.Api.Services;

namespace Vtms.Api.Tests;

/// <summary>
/// 2026-10-05 起假日只有一份：vsms.rest_days_config.specificDates（斜線日期）。
/// 規格：F:\vsms\vsms-export\docs\superpowers\specs\2026-10-05-unified-holiday-list-design.md
/// </summary>
public class VsmsHolidayListTests
{
    [Fact]
    public void Parses_slash_and_iso_dates_into_iso_and_years()
    {
        var list = HolidayList.Parse("[\"2026/12/25\",\"2026-02-27\",\"2026/02/27\",\"2027/01/01\"]");

        Assert.Equal(new[] { "2026-02-27", "2026-12-25", "2027-01-01" }, list.Dates.OrderBy(d => d, StringComparer.Ordinal));
        Assert.Equal(new[] { 2026, 2027 }, list.Years.OrderBy(y => y));
        Assert.Empty(list.Skipped);
    }

    [Fact]
    public void Skips_malformed_entries_but_keeps_the_rest()
    {
        var list = HolidayList.Parse("[\"2026/10/09\",\"2026/02/30\",42]");

        Assert.Equal(new[] { "2026-10-09" }, list.Dates);
        Assert.Equal(2, list.Skipped.Count);
    }

    [Fact]
    public void Empty_array_means_no_year_is_covered()
    {
        var list = HolidayList.Parse("[]");

        Assert.Empty(list.Dates);
        Assert.Empty(list.Years);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("[\"2026/10/09\"")]
    [InlineData("{\"a\":1}")]
    public void Throws_instead_of_returning_an_empty_list(string? json)
    {
        // 假日被靜默清空，國定假日就會被算成工作日——負載與覆蓋率都會悄悄算錯
        Assert.Throws<InvalidOperationException>(() => HolidayList.Parse(json));
    }

    [Fact]
    public void Workday_check_uses_the_parsed_dates()
    {
        var list = HolidayList.Parse("[\"2026/10/09\"]");

        Assert.False(IntegrationServiceImpl.IsWorkday("2026-10-09", list.Dates));
        Assert.True(IntegrationServiceImpl.IsWorkday("2026-10-08", list.Dates));
        Assert.False(IntegrationServiceImpl.IsWorkday("2026-10-10", list.Dates)); // 週六
    }
}
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `cd F:/mcp-api-src && dotnet test VIB_All.sln --filter VsmsHolidayListTests`
Expected: 編譯失敗，`The type or namespace name 'HolidayList' could not be found`

- [ ] **Step 4: 新增 `HolidayList.cs`**

```csharp
using System.Globalization;
using System.Text.Json;

namespace VSMS.Api.Services;

/// <summary>
/// 全平台唯一的假日清單：vsms.rest_days_config.specificDates（VSMS 設定頁「特定休息日」）。
/// 週六日一律休息，不在清單裡。2026-10-05 以前讀 calendar_config（政府日曆匯入、只存一個年度），
/// 兩份各錯一天，已停用。規格：F:\vsms\vsms-export\docs\superpowers\specs\2026-10-05-unified-holiday-list-design.md
/// </summary>
public sealed record HolidayList(HashSet<string> Dates, HashSet<int> Years, IReadOnlyList<string> Skipped)
{
    /// <summary>
    /// 清單 JSON → ISO 日期集合。單筆格式不合就略過（記在 Skipped）；
    /// 空值、JSON 壞掉或不是陣列一律拋錯，絕不退化成空清單。
    /// </summary>
    public static HolidayList Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            throw new InvalidOperationException("rest_days_config.specificDates 是空的");
        }

        List<JsonElement>? items;
        try
        {
            items = JsonSerializer.Deserialize<List<JsonElement>>(json);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException("rest_days_config.specificDates 不是合法的 JSON 陣列", ex);
        }

        if (items is null)
        {
            throw new InvalidOperationException("rest_days_config.specificDates 不是合法的 JSON 陣列");
        }

        var dates = new HashSet<string>(StringComparer.Ordinal);
        var skipped = new List<string>();
        foreach (var item in items)
        {
            var iso = item.ValueKind == JsonValueKind.String ? ToIso(item.GetString() ?? string.Empty) : null;
            if (iso is null)
            {
                skipped.Add(item.ToString());
            }
            else
            {
                dates.Add(iso);
            }
        }

        var years = dates.Select(d => int.Parse(d[..4], CultureInfo.InvariantCulture)).ToHashSet();
        return new HolidayList(dates, years, skipped);
    }

    /// <summary>'YYYY/MM/DD' 或 'YYYY-MM-DD' → ISO；格式不合或不是真實日期回 null。</summary>
    public static string? ToIso(string value)
    {
        var s = value.Trim().Replace('/', '-');
        return DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : null;
    }
}
```

- [ ] **Step 5: 改 `IntegrationRepository.cs`**

把
```csharp
    public async Task<CalendarConfigRow?> GetCalendarConfigAsync(CancellationToken cancellationToken)
    {
        using var connection = _connectionFactory.CreateConnection();
        return await connection.QueryFirstOrDefaultAsync<CalendarConfigRow>(new CommandDefinition(@"
SELECT id, year, nonWeekendHolidays
FROM calendar_config
WHERE id = 1", cancellationToken: cancellationToken));
    }
```
換成
```csharp
    /// <summary>全平台唯一的假日清單（rest_days_config），見 HolidayList。缺列拋錯。</summary>
    public async Task<HolidayList> GetHolidaysAsync(CancellationToken cancellationToken)
    {
        using var connection = _connectionFactory.CreateConnection();
        var json = await connection.QueryFirstOrDefaultAsync<string?>(new CommandDefinition(@"
SELECT CAST(specificDates AS CHAR)
FROM rest_days_config
WHERE id = 1", cancellationToken: cancellationToken));
        if (json is null)
        {
            throw new InvalidOperationException("rest_days_config 沒有 id=1 的列");
        }

        return HolidayList.Parse(json);
    }
```

- [ ] **Step 6: 改 `IntegrationServiceImpl.cs`**

把
```csharp
        var holidays = new HashSet<string>(StringComparer.Ordinal);

        var calendar = await _repository.GetCalendarConfigAsync(cancellationToken);
        if (calendar is not null && calendar.Year == year)
        {
            foreach (var item in ParseHolidayJson(calendar.NonWeekendHolidays))
            {
                holidays.Add(item);
            }
        }
        else
        {
            limitations.Add($"行事曆未涵蓋 {year} 年，工作日僅排除週六日、未排除國定假日");
        }
```
換成
```csharp
        var holidayList = await _repository.GetHolidaysAsync(cancellationToken);
        if (holidayList.Skipped.Count > 0)
        {
            _logger.LogWarning("rest_days_config 有 {Count} 筆格式不合的休息日被略過：{Items}",
                holidayList.Skipped.Count, string.Join(", ", holidayList.Skipped));
        }

        var holidays = holidayList.Dates;
        if (!holidayList.Years.Contains(year))
        {
            limitations.Add($"行事曆未涵蓋 {year} 年，工作日僅排除週六日、未排除國定假日");
        }
```

刪除整個 `internal static IEnumerable<string> ParseHolidayJson(string? json)` 方法（含其 `try/catch`）。

- [ ] **Step 7: 改 `CoverageService.cs`**

第 130 行
```csharp
        var (holidays, calendarYear) = await LoadHolidaysAsync(cancellationToken);
```
→
```csharp
        var holidayList = await _integration.GetHolidaysAsync(cancellationToken);
```

第 136 行
```csharp
            rows.Add(BuildRow(r, asOfDate, logsByPlan, assigneesByPlan, holidays, calendarYear, uncoveredYears));
```
→
```csharp
            rows.Add(BuildRow(r, asOfDate, logsByPlan, assigneesByPlan, holidayList.Dates, holidayList.Years, uncoveredYears));
```

`BuildRow` 與 `ApplyLogAudit` 兩處參數
```csharp
        int? calendarYear,
```
→
```csharp
        IReadOnlySet<int> holidayYears,
```

第 234 行
```csharp
        ApplyLogAudit(row, r, asOfDate, loggedIso, holidays, calendarYear, uncoveredYears);
```
→
```csharp
        ApplyLogAudit(row, r, asOfDate, loggedIso, holidays, holidayYears, uncoveredYears);
```

`ApplyLogAudit` 裡
```csharp
            if (year is not null && year != calendarYear)
```
→
```csharp
            if (year is not null && !holidayYears.Contains(year.Value))
```

刪除整個 `private async Task<(HashSet<string> Holidays, int? Year)> LoadHolidaysAsync(...)` 方法。

- [ ] **Step 8: 刪除 `CalendarConfigRow`**

`IIntegrationService.cs` 刪除：
```csharp
public sealed class CalendarConfigRow
{
    public int Id { get; set; }
    public int Year { get; set; }
    public string NonWeekendHolidays { get; set; } = "[]";
}
```
（`Data/VsmsDbContext.cs` 的 `CalendarConfigEntity` 在 Task 11 才刪，因為表還在。）

- [ ] **Step 9: 全部測試**

Run: `cd F:/mcp-api-src && grep -rn "GetCalendarConfigAsync\|ParseHolidayJson\|CalendarConfigRow" vsms_Csharp Vtms.Api.Tests Merged.Api --include=*.cs; dotnet test VIB_All.sln`
Expected: grep 無輸出；所有測試 PASS（新增 8 條）。

- [ ] **Step 10: 乾淨建置與發佈**

```bash
cd F:/mcp-api-src
rm -rf Merged.Api/bin Merged.Api/obj vsms_Csharp/bin vsms_Csharp/obj vtms_Csharp/bin vtms_Csharp/obj
dotnet publish Merged.Api -c Release -f net8.0 -o _publish_20261005-holidays
ls -l _publish_20261005-holidays/Merged.Api.dll _publish_20261005-holidays/VSMS.Api.dll _publish_20261005-holidays/Vtms.Api.dll
```
Expected: 三個 DLL 時間戳都是本次建置時間。

- [ ] **Step 10b: 部署前迴歸比對（本機新版 vs 線上舊版）**

背景啟動本機新版（跑完要停掉）：
```bash
cd F:/mcp-api-src/_publish_20261005-holidays && dotnet Merged.Api.dll --urls http://localhost:52304
```
另開一個 shell：
```bash
cd F:/mcp-api-src && node regression-compare.js https://appsrv2.lannerinc.com/McpAPI http://localhost:52304
```
Expected: 0 差異。兩邊連同一個資料庫，唯一可能的差異是查詢月份落在 2026-12 的工作量（12/25 新列為假日）；出現其他差異就停下來查，不要部署。

- [ ] **Step 11: 部署（依 DEPLOY.md 既有流程）**

用 PowerShell：
```powershell
$dst = '\\LEI-APPSVRPD2\webapp\Service\MCP_API'
$bak = '\\LEI-APPSVRPD2\webapp\Service\MCP_API_backup_20261005-holidays'
Copy-Item $dst $bak -Recurse -ErrorAction Stop
Copy-Item F:\mcp-api-src\app_offline.htm $dst -ErrorAction Stop
Start-Sleep -Seconds 5
foreach ($n in 'Merged.Api','VSMS.Api','Vtms.Api') { foreach ($ext in 'dll','pdb','xml') {
  Copy-Item "F:\mcp-api-src\_publish_20261005-holidays\$n.$ext" $dst -ErrorAction Stop } }
foreach ($n in 'Merged.Api','VSMS.Api','Vtms.Api') {
  (Get-FileHash "F:\mcp-api-src\_publish_20261005-holidays\$n.dll").Hash -eq (Get-FileHash "$dst\$n.dll").Hash }
Remove-Item "$dst\app_offline.htm" -ErrorAction Stop
```
Expected: 三行 `True`。

- [ ] **Step 12: 上線驗證**

Run: `curl -sk https://appsrv2.lannerinc.com/McpAPI/health`
Expected: 健康。再以 MCP 呼叫一次 `vsms_workload_analysis`（month=2026-10），回應的 limitations 不含「行事曆未涵蓋」、工作日 20。停掉 Step 10b 的本機程序。

- [ ] **Step 13: 寫 `DEPLOY-20261005-holidays.md`**

照 `DEPLOY-20261002-change-history.md` 的格式寫：計畫與規格路徑、部署時間、部署檔 `_publish_20261005-holidays`、目標、上一版備份 `MCP_API_backup_20261005-holidays`、原始碼快照 `_src_backup_20261005-holidays`、本版內容（改讀 rest_days_config、移除 CalendarConfigRow／ParseHolidayJson、缺列或壞 JSON 會讓工具回錯誤而非靜默算錯）、驗證結果（Step 9／12 的實際數字）、回滾步驟（放 app_offline → 從備份複製三組 dll/pdb/xml → Get-FileHash 比對 → 移除 app_offline）。工具 schema 未變，不需要到 Copilot Studio 重新整理。

---

### Task 11: 使用說明與記憶

**Files:**
- Modify: `F:\vportal\docs\guides\vsms\role-admin.md`（「假日行事曆」一節）
- Modify: `F:\vportal\docs\guides\vsms\settings.md:28-33`
- Modify: `F:\vportal\docs\guides\vsms\analytics.md:34`

- [ ] **Step 1: `role-admin.md`**

把「## 假日行事曆」到「## 其他設定」之間整段換成：
```markdown
## 假日行事曆

1. 在「系統設定」的「休息日設定」，找到「政府辦公日曆匯入」。
2. 按「選擇檔案」上傳政府「辦公日曆表」Excel 原檔，再按「匯入」。
3. 非週末的放假日會併進「特定休息日」清單。匯入只會新增，不會刪掉清單裡原有的日期。

「特定休息日」是全平台唯一的假日清單：VSMS 的甘特圖、預告通知、負載分布，VTMS 的異常通知，以及小P+ 查詢都依它判斷哪天是工作日。週六、週日固定休息，不必列入。新增或刪除一筆日期，立即全平台生效。

> [!WARNING]
> 匯入後請核對清單，日期不對就逐筆刪除。如果某個月有超過 8 個平日被判為放假，系統會拒絕整份檔案，清單不會變更。
```

- [ ] **Step 2: `settings.md`**

把
```markdown
1. 勾選「星期六、日設為休息日」。
2. 在「特定休息日」選日期，按「＋ 新增」。不要的按「× 刪除」。
```
換成
```markdown
週六、週日固定休息。在「特定休息日」選日期，按「＋ 新增」；不要的按「× 刪除」。這份清單供 VSMS、VTMS 與小P+ 共用，改了立即全平台生效。
```
並把
```markdown
系統管理員另外有「政府辦公日曆匯入」（SA），上傳政府辦公日曆表 Excel 原檔，自動加入非週末的放假日。
```
換成
```markdown
系統管理員另外有「政府辦公日曆匯入」（SA），上傳政府辦公日曆表 Excel 原檔，自動把非週末的放假日併進這份清單。詳見[系統管理員的工作](role-admin#假日行事曆)。
```

- [ ] **Step 3: `analytics.md`**

```markdown
> 工作日依匯入的政府行事曆計算，已取消的排程不計。上方的狀態篩選不影響負載圖，其他篩選會套用。
```
→
```markdown
> 工作日依系統設定的休息日清單計算（週六日固定休息），已取消的排程不計。上方的狀態篩選不影響負載圖，其他篩選會套用。
```

- [ ] **Step 4: 檢查並 commit**

Run: `cd F:/vportal && npm run check:guide`
Expected: `0 個錯誤、0 個警告`

```bash
git add docs/guides/vsms/role-admin.md docs/guides/vsms/settings.md docs/guides/vsms/analytics.md
git commit -m "docs(guide/vsms): one rest-day list for the whole platform; weekends always rest"
```

- [ ] **Step 5: 更新記憶**

更新 `C:\Users\ghosty_liu\.claude\projects\F--\memory\unified-holiday-list-design.md`：狀態改為「已上線」，記下各系統 commit、退版備份路徑（VSMS `server/dist.stable-20261005-pre-unified-holidays` 與 `dist.stable-…`、VTMS `server/dist.stable-20261005-pre-unified-holidays`、MCP `MCP_API_backup_20261005-holidays`）、`calendar_config` 預定 2026-11-30 後 DROP。同步改 `MEMORY.md` 那一行，以及 `vsms-calendar-config-october-corrupt.md` 補一句「已由統一清單取代」。

---

### Task 12（2026-11-30 之後）：移除 `calendar_config`

只在 Task 1–11 上線且到 2026-11-30 都沒有相關回報時執行。

**Files:**
- Modify: `F:\vsms\vsms-export\prisma\schema.prisma`（刪 `model CalendarConfig`）
- Modify: `F:\vsms\vsms-export\server\src\routes\calendar.ts`（若仍有 `calendarConfig` 引用）
- Modify: `F:\mcp-api-src\vsms_Csharp\Data\VsmsDbContext.cs`（刪 `CalendarConfigs`、`CalendarConfigEntity` 與其 `modelBuilder` 設定）

- [ ] **Step 1: 確認沒有讀取端**

Run:
```bash
grep -rn "calendarConfig\|calendar_config\|CalendarConfig" F:/vsms/vsms-export/server/src F:/vsms/vsms-export/src F:/vtms/vtms-export/server/src F:/mcp-api-src/vsms_Csharp F:/mcp-api-src/Merged.Api --include=*.ts --include=*.tsx --include=*.cs
```
Expected: 只剩 `VsmsDbContext.cs` 與 `schema.prisma`。

- [ ] **Step 2: 備份後 DROP**

```sql
-- 先把整張表 dump 到 F:\backups\unified-holidays-20261005\calendar_config.final.json（同 Task 1 的腳本寫法）
DROP TABLE vsms.calendar_config;
```

- [ ] **Step 3: 移除 model、重新 generate、重啟**

刪 `schema.prisma` 的 `model CalendarConfig { ... }`，`npx prisma generate`（不要 `prisma migrate dev`，見 vsms-prisma-drift），`npx tsc -p server/tsconfig.json`，`pm2 restart vsms`。MCP 刪 `VsmsDbContext` 對應後依 Task 10 Step 10–12 重新發佈。

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "chore(db): drop calendar_config, superseded by rest_days_config (2026-10-05)"
```
