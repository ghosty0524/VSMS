# 負載分布改用 Agent 算法、審計紀錄保留兩個月 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 審計紀錄只保留兩個曆月；統計頁「負載分布」改打新的後端 API，重用 Agent 用的 `analyzeWorkload`（不含加班），顯示每人負載率％與等級。

**Architecture:** 後端新增 `/api/analytics/workload`，逐月呼叫既有 `server/src/lib/workload.ts` 的 `analyzeWorkload`，以純函式 `mergeMonthlyWorkloads` 合併季／年；前端 `LoadSection` 改為資料由 API 取得、單位維度在前端平均。算法只有後端一份。

**Tech Stack:** Express 5 + Prisma（MariaDB）、vitest + supertest（server）、React 19 + recharts 3 + vitest（前端）。

**Spec:** `docs/superpowers/specs/2026-09-14-workload-chart-and-audit-retention-design.md`

## Global Constraints

- 不修改 `server/src/lib/workload.ts` 的 `analyzeWorkload` 演算法或介面（C# 與 Agent 依賴它）。
- 前端不複製負載算法；只放 `classifyLevel` 門檻（與後端同值，註明兩份要同步）。
- 排程日期在 DB 為 `YYYY/MM/DD` 字串；API 的月份參數為 `YYYY-MM`。
- 工作區有別人未提交的 `server/src/lib/crypto.ts`、`server/src/routes/auth.ts`、`server/src/__tests__/loginPasswordValidation.test.ts`，**不得 add、不得 stash、不得還原**；commit 一律指名檔案。
- 測試指令：後端 `npx vitest run --config server/vitest.config.ts <file>`，前端 `npx vitest run <file>`。
- 回覆與註解用繁體中文；commit message 用英文，結尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- 所有 shell 指令在 `F:\vsms\vsms-export` 執行（cwd 會跨呼叫保留，跨 repo 一律絕對路徑）。

---

### Task 1: 審計紀錄保留兩個曆月

**Files:**
- Modify: `server/src/lib/storage.ts:21-28`
- Test: `server/src/__tests__/auditRetention.test.ts`（新建）

**Interfaces:**
- Produces: `export const AUDIT_RETENTION_MONTHS = 2`、`export function auditRetentionCutoff(now: Date): Date`。

- [ ] **Step 1: 寫失敗的測試**

```ts
// server/src/__tests__/auditRetention.test.ts
// storage.ts 頂層 import prisma；測試絕不能碰真的資料庫，先 mock 掉。
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ prisma: {} }))

import { auditRetentionCutoff, AUDIT_RETENTION_MONTHS } from '../lib/storage.js'

describe('auditRetentionCutoff 審計紀錄保留門檻', () => {
  it('保留兩個月', () => {
    expect(AUDIT_RETENTION_MONTHS).toBe(2)
  })

  it('往前推兩個曆月、時刻不變：9/14 10:30 → 7/14 10:30', () => {
    const cutoff = auditRetentionCutoff(new Date(2026, 8, 14, 10, 30))
    expect(cutoff).toEqual(new Date(2026, 6, 14, 10, 30))
  })

  it('跨年：1/15 → 前一年 11/15', () => {
    expect(auditRetentionCutoff(new Date(2027, 0, 15))).toEqual(new Date(2026, 10, 15))
  })

  it('目標月沒有該日時退回目標月最後一天：4/30 → 2/28，不溢位成 3/2', () => {
    expect(auditRetentionCutoff(new Date(2026, 3, 30))).toEqual(new Date(2026, 1, 28))
  })

  it('不改動傳入的 Date', () => {
    const now = new Date(2026, 8, 14)
    auditRetentionCutoff(now)
    expect(now).toEqual(new Date(2026, 8, 14))
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/auditRetention.test.ts`
Expected: FAIL，`auditRetentionCutoff` is not a function / not exported。

- [ ] **Step 3: 實作**

把 `server/src/lib/storage.ts` 第 21–28 行（`// Retention purge runs on a schedule…` 到 `purgeOldAuditLogs` 結束）換成：

```ts
// 清除排程獨立於每次寫入；保留門檻用「曆月」而非固定天數，
// 對外說「保留兩個月」時才與實際行為一致（9/14 清掉 7/14 以前）。
export const AUDIT_RETENTION_MONTHS = 2

export function auditRetentionCutoff(now: Date): Date {
  const cutoff = new Date(now)
  const targetMonth = cutoff.getMonth() - AUDIT_RETENTION_MONTHS
  cutoff.setMonth(targetMonth)
  // 4/30 往前兩個月沒有 2/30，setMonth 會溢位到 3/2；退回目標月最後一天
  if (cutoff.getMonth() !== ((targetMonth % 12) + 12) % 12) cutoff.setDate(0)
  return cutoff
}

export async function purgeOldAuditLogs(): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { timestamp: { lt: auditRetentionCutoff(new Date()) } } })
}
```

`scheduleAuditCleaner` 維持不變。

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/auditRetention.test.ts`
Expected: 5 passed。

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/storage.ts server/src/__tests__/auditRetention.test.ts
git commit -m "feat(audit): keep audit logs for two calendar months instead of 180 days

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 跨月合併純函式 `workloadRange.ts`

**Files:**
- Create: `server/src/lib/workloadRange.ts`
- Test: `server/src/__tests__/workloadRange.test.ts`（新建）

**Interfaces:**
- Consumes: `analyzeWorkload`, `classifyLevel`, `WorkloadResult`, `WorkloadLevel` from `server/src/lib/workload.ts`；`normalizeStatsMode` from `server/src/lib/statsMode.ts`。
- Produces:
  - `monthsBetween(from: string, to: string): string[]` — from～to（含）的每個 `YYYY-MM`。
  - `mergeMonthlyWorkloads(results: WorkloadResult[]): MergedWorkload`，其中
    `MergedWorkload = { workdays: number; engineers: MergedEngineerWorkload[] }`、
    `MergedEngineerWorkload = { testEngineer; testUnits: string[]; baseScore; rate; level: WorkloadLevel; unscheduledDays; partialDays; cappedDays }`。
  - `countSchedulesByEngineer(schedules: { category: string; testEngineer: string }[], statsModes: Record<string, CategoryStatsMode>): Map<string, number>` — statsMode 為 counted 的排程數。

- [ ] **Step 1: 寫失敗的測試**

```ts
// server/src/__tests__/workloadRange.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeWorkload, type WorkloadScheduleInput } from '../lib/workload.js'
import { monthsBetween, mergeMonthlyWorkloads, countSchedulesByEngineer } from '../lib/workloadRange.js'

// 2026-07 平日 23 天、2026-08 平日 21 天
function sched(over: Partial<WorkloadScheduleInput> = {}): WorkloadScheduleInput {
  return {
    category: 'Regression',
    testEngineer: 'Alice',
    testUnit: 'RA',
    timeResource: 5,
    startDate: '2026/07/06',
    endDate: '2026/07/10',
    ...over,
  }
}

describe('monthsBetween', () => {
  it('同月回一個', () => {
    expect(monthsBetween('2026-07', '2026-07')).toEqual(['2026-07'])
  })
  it('一季三個月', () => {
    expect(monthsBetween('2026-07', '2026-09')).toEqual(['2026-07', '2026-08', '2026-09'])
  })
  it('跨年', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('mergeMonthlyWorkloads', () => {
  it('單月合併與 analyzeWorkload 逐項相等', () => {
    const one = analyzeWorkload({ month: '2026-07', schedules: [sched(), sched({ testEngineer: 'Bob', timeResource: 30 })] })
    const merged = mergeMonthlyWorkloads([one])
    expect(merged.workdays).toBe(one.workdays)
    expect(merged.engineers.map(e => e.testEngineer)).toEqual(one.engineers.map(e => e.testEngineer))
    for (const e of one.engineers) {
      const m = merged.engineers.find(x => x.testEngineer === e.testEngineer)!
      expect(m).toEqual({
        testEngineer: e.testEngineer,
        testUnits: e.testUnits,
        baseScore: e.baseScore,
        rate: e.rate,
        level: e.level,
        unscheduledDays: e.unscheduledDays,
        partialDays: e.partialDays,
        cappedDays: e.cappedDays,
      })
    }
  })

  it('兩個月：基礎分、工作日、天數相加，負載率以合併後總數重算', () => {
    // 7 月：5 個工作日各強度 1 → 基礎分 5；8 月無排程 → 0
    const jul = analyzeWorkload({ month: '2026-07', schedules: [sched()] })
    const aug = analyzeWorkload({ month: '2026-08', schedules: [sched()] })
    const merged = mergeMonthlyWorkloads([jul, aug])
    expect(merged.workdays).toBe(44)
    const alice = merged.engineers[0]
    expect(alice.baseScore).toBe(5)
    expect(alice.rate).toBe(11.4) // 5 / 44 * 100 = 11.36 → 11.4
    expect(alice.level).toBe('偏低')
    expect(alice.unscheduledDays).toBe(18 + 21)
    expect(alice.partialDays).toBe(0)
    expect(alice.cappedDays).toBe(0)
  })

  it('testUnits 取聯集並排序', () => {
    const jul = analyzeWorkload({ month: '2026-07', schedules: [sched({ testUnit: 'RB' })] })
    const aug = analyzeWorkload({ month: '2026-08', schedules: [sched({ testUnit: 'RA', startDate: '2026/08/03', endDate: '2026/08/07' })] })
    expect(mergeMonthlyWorkloads([jul, aug]).engineers[0].testUnits).toEqual(['RA', 'RB'])
  })

  it('依負載率降冪，同分依姓名', () => {
    const jul = analyzeWorkload({
      month: '2026-07',
      schedules: [
        sched({ testEngineer: 'Zoe' }),
        sched({ testEngineer: 'Adam' }),
        sched({ testEngineer: 'Mia', timeResource: 30 }),
      ],
    })
    expect(mergeMonthlyWorkloads([jul]).engineers.map(e => e.testEngineer)).toEqual(['Mia', 'Adam', 'Zoe'])
  })

  it('空結果', () => {
    expect(mergeMonthlyWorkloads([])).toEqual({ workdays: 0, engineers: [] })
  })
})

describe('countSchedulesByEngineer', () => {
  it('只算 counted；workload_only 與 excluded 不算；查無類別視為 counted', () => {
    const map = countSchedulesByEngineer(
      [
        { category: 'NPI', testEngineer: 'Alice' },
        { category: 'Support', testEngineer: 'Alice' },
        { category: 'Leave', testEngineer: 'Alice' },
        { category: 'Ghost', testEngineer: 'Bob' },
      ],
      { NPI: 'counted', Support: 'workload_only', Leave: 'excluded' },
    )
    expect(map.get('Alice')).toBe(1)
    expect(map.get('Bob')).toBe(1)
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/workloadRange.test.ts`
Expected: FAIL，找不到 `../lib/workloadRange.js`。

- [ ] **Step 3: 實作**

```ts
// server/src/lib/workloadRange.ts
// 把 analyzeWorkload 的逐月結果合併成季／年：單日封頂已在每月內做完，
// 基礎分與工作日直接相加，負載率以合併後總數重算。
// 不改 analyzeWorkload 本身——它與 C# 版對齊、Agent 依賴它。
import { classifyLevel, type WorkloadResult, type WorkloadLevel } from './workload.js'
import { normalizeStatsMode } from './statsMode.js'
import type { CategoryStatsMode } from '../types.js'

export interface MergedEngineerWorkload {
  testEngineer: string
  testUnits: string[]
  baseScore: number
  rate: number // %
  level: WorkloadLevel
  unscheduledDays: number
  partialDays: number
  cappedDays: number
}

export interface MergedWorkload {
  workdays: number
  engineers: MergedEngineerWorkload[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

/** from～to（含）的每個月，'YYYY-MM'；呼叫端須先驗證 to >= from */
export function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export function mergeMonthlyWorkloads(results: WorkloadResult[]): MergedWorkload {
  const workdays = results.reduce((n, r) => n + r.workdays, 0)

  type Acc = { units: Set<string>; base: number; unscheduled: number; partial: number; capped: number }
  const byEngineer = new Map<string, Acc>()
  for (const r of results) {
    for (const e of r.engineers) {
      let acc = byEngineer.get(e.testEngineer)
      if (!acc) {
        acc = { units: new Set(), base: 0, unscheduled: 0, partial: 0, capped: 0 }
        byEngineer.set(e.testEngineer, acc)
      }
      e.testUnits.forEach(u => acc!.units.add(u))
      acc.base += e.baseScore
      acc.unscheduled += e.unscheduledDays
      acc.partial += e.partialDays
      acc.capped += e.cappedDays
    }
  }

  const engineers: MergedEngineerWorkload[] = [...byEngineer.entries()].map(([name, acc]) => {
    const baseScore = round2(acc.base)
    const rate = workdays > 0 ? round1((baseScore / workdays) * 100) : 0
    return {
      testEngineer: name,
      testUnits: [...acc.units].sort(),
      baseScore,
      rate,
      level: classifyLevel(rate),
      unscheduledDays: acc.unscheduled,
      partialDays: acc.partial,
      cappedDays: acc.capped,
    }
  })

  // 與 analyzeWorkload 相同的排序：rate 降冪，同分依姓名序數
  engineers.sort(
    (a, b) => b.rate - a.rate || (a.testEngineer < b.testEngineer ? -1 : a.testEngineer > b.testEngineer ? 1 : 0),
  )
  return { workdays, engineers }
}

/**
 * 每位工程師「statsMode 為 counted」的排程筆數。
 * analyzeWorkload 的 scheduleCount 是單月筆數，跨月排程在季／年合併時會被
 * 重複計算，因此筆數改由呼叫端以整段期間的排程清單另算。
 */
export function countSchedulesByEngineer(
  schedules: ReadonlyArray<{ category: string; testEngineer: string }>,
  statsModes: Record<string, CategoryStatsMode>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of schedules) {
    if (normalizeStatsMode(statsModes[s.category]) !== 'counted') continue
    out.set(s.testEngineer, (out.get(s.testEngineer) ?? 0) + 1)
  }
  return out
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/workloadRange.test.ts`
Expected: 9 passed。若「單月合併與 analyzeWorkload 逐項相等」失敗，先確認 `analyzeWorkload` 回傳的 `testUnits` 順序（它是插入順序、未排序）——測試用單一單位所以應相等；不要為了測試改 `analyzeWorkload`。

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/workloadRange.ts server/src/__tests__/workloadRange.test.ts
git commit -m "feat(workload): merge monthly workload results across a quarter or year

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 路由 `GET /api/analytics/workload`

**Files:**
- Create: `server/src/routes/analytics.ts`
- Modify: `server/src/index.ts:20-28`（import）與 `:85-88`（掛載）
- Test: `server/src/__tests__/analyticsWorkloadRoute.test.ts`（新建）

**Interfaces:**
- Consumes: Task 2 的 `monthsBetween`、`mergeMonthlyWorkloads`、`countSchedulesByEngineer`；`analyzeWorkload`；`normalizeStatsMode`；`requireAuth`。
- Produces: HTTP 回應
  `{ from, to, workdays, notes: string[], engineers: [{ testEngineer, testUnits, scheduleCount, baseScore, rate, level, unscheduledDays, partialDays, cappedDays }] }`。

- [ ] **Step 1: 寫失敗的測試**

```ts
// server/src/__tests__/analyticsWorkloadRoute.test.ts
// 掛一個只含 analytics 路由的最小 app。prisma 全部 mock：正式環境的
// DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

const { scheduleFindMany, calendarFindUnique, categoryFindMany } = vi.hoisted(() => ({
  scheduleFindMany: vi.fn(),
  calendarFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  prisma: {
    schedule: { findMany: scheduleFindMany },
    calendarConfig: { findUnique: calendarFindUnique },
    category: { findMany: categoryFindMany },
  },
}))
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  applyHeaderAuth: () => true,
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

import analyticsRouter from '../routes/analytics.js'

function app() {
  const a = express()
  a.use('/api/analytics', analyticsRouter)
  return a
}

const alice = {
  category: 'Regression', testEngineer: 'Alice', testUnit: 'RA',
  timeResource: 5, startDate: '2026/07/06', endDate: '2026/07/10',
}

beforeEach(() => {
  vi.clearAllMocks()
  scheduleFindMany.mockResolvedValue([])
  calendarFindUnique.mockResolvedValue(null)
  categoryFindMany.mockResolvedValue([])
})

describe('GET /api/analytics/workload 參數驗證', () => {
  it('缺 from 回 400', async () => {
    const res = await request(app()).get('/api/analytics/workload')
    expect(res.status).toBe(400)
    expect(scheduleFindMany).not.toHaveBeenCalled()
  })
  it('格式錯回 400', async () => {
    expect((await request(app()).get('/api/analytics/workload?from=2026/07')).status).toBe(400)
    expect((await request(app()).get('/api/analytics/workload?from=2026-13')).status).toBe(400)
  })
  it('to 早於 from 回 400', async () => {
    const res = await request(app()).get('/api/analytics/workload?from=2026-07&to=2026-06')
    expect(res.status).toBe(400)
  })
  it('超過 12 個月回 400', async () => {
    const res = await request(app()).get('/api/analytics/workload?from=2026-01&to=2027-01')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/analytics/workload 計算', () => {
  it('to 省略等於 from；單月結果含 scheduleCount 與 rate', async () => {
    scheduleFindMany.mockResolvedValue([alice])
    const res = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(res.status).toBe(200)
    expect(res.body.from).toBe('2026-07')
    expect(res.body.to).toBe('2026-07')
    expect(res.body.workdays).toBe(23)
    expect(res.body.engineers).toEqual([
      expect.objectContaining({
        testEngineer: 'Alice', testUnits: ['RA'], scheduleCount: 1,
        baseScore: 5, rate: 21.7, level: '偏低',
        unscheduledDays: 18, partialDays: 0, cappedDays: 0,
      }),
    ])
    expect(res.body.engineers[0]).not.toHaveProperty('limitations')
    expect(res.body.engineers[0]).not.toHaveProperty('overtimeHours')
  })

  it('跨月排程只算一筆，工作日兩月相加', async () => {
    scheduleFindMany.mockResolvedValue([{ ...alice, startDate: '2026/07/27', endDate: '2026/08/07' }])
    const res = await request(app()).get('/api/analytics/workload?from=2026-07&to=2026-08')
    expect(res.body.workdays).toBe(44)
    expect(res.body.engineers[0].scheduleCount).toBe(1)
    expect(res.body.engineers[0].baseScore).toBe(5)
  })

  it('篩選參數進 where，空 testEngineer 的排程不計', async () => {
    scheduleFindMany.mockResolvedValue([alice, { ...alice, testEngineer: '' }])
    await request(app()).get(
      '/api/analytics/workload?from=2026-07&categories=NPI,AVL&testUnits=RA&testEngineers=Alice,Bob',
    )
    const where = scheduleFindMany.mock.calls[0][0].where
    expect(where).toMatchObject({
      isCancelled: false,
      startDate: { lte: '2026/07/31' },
      endDate: { gte: '2026/07/01' },
      category: { in: ['NPI', 'AVL'] },
      testUnit: { in: ['RA'] },
      testEngineer: { in: ['Alice', 'Bob'] },
    })
  })

  it('沒有篩選時 where 不含 in 條件', async () => {
    await request(app()).get('/api/analytics/workload?from=2026-07')
    const where = scheduleFindMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('category')
    expect(where).not.toHaveProperty('testUnit')
    expect(where).not.toHaveProperty('testEngineer')
  })

  it('行事曆年度相符時套用例假日，否則每個年份只留一則提醒', async () => {
    calendarFindUnique.mockResolvedValue({ id: 1, year: 2026, nonWeekendHolidays: ['2026-07-06'] })
    const ok = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(ok.body.workdays).toBe(22)
    expect(ok.body.notes).toEqual([])

    const miss = await request(app()).get('/api/analytics/workload?from=2027-01&to=2027-02')
    expect(miss.body.notes).toEqual(['行事曆未涵蓋 2027 年，工作日僅排除週六日、未排除國定假日'])
  })

  it('statsMode 為 excluded 的類別不進負載也不算筆數', async () => {
    categoryFindMany.mockResolvedValue([{ value: 'Leave', statsMode: 'excluded' }])
    scheduleFindMany.mockResolvedValue([{ ...alice, category: 'Leave' }])
    const res = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(res.body.engineers).toEqual([])
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/analyticsWorkloadRoute.test.ts`
Expected: FAIL，找不到 `../routes/analytics.js`。

- [ ] **Step 3: 實作路由**

```ts
// server/src/routes/analytics.ts
// 統計頁「負載分布」的資料來源。刻意重用 Agent 走的 analyzeWorkload，
// 統計頁與 Agent 的數字才會一致；本路由不帶加班參數（需求排除加班）。
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { analyzeWorkload, type WorkloadResult } from '../lib/workload.js'
import { monthsBetween, mergeMonthlyWorkloads, countSchedulesByEngineer } from '../lib/workloadRange.js'
import { normalizeStatsMode } from '../lib/statsMode.js'

const router = Router()
router.use(requireAuth)

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_MONTHS = 12

function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0]
  return undefined
}

/** 逗號分隔的多值參數；空字串或全空白視為未提供 */
function csv(val: unknown): string[] | undefined {
  const raw = qs(val)
  if (!raw) return undefined
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

router.get('/workload', async (req, res) => {
  const from = (qs(req.query.from) ?? '').trim()
  const to = (qs(req.query.to) ?? from).trim()
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) {
    res.status(400).json({ ok: false, message: 'from / to 須為 YYYY-MM' })
    return
  }
  if (to < from) {
    res.status(400).json({ ok: false, message: 'to 不可早於 from' })
    return
  }
  const months = monthsBetween(from, to)
  if (months.length > MAX_MONTHS) {
    res.status(400).json({ ok: false, message: `期間最多 ${MAX_MONTHS} 個月` })
    return
  }

  // 排程日期為 'YYYY/MM/DD' 字串；'31' 用字串比較涵蓋每種月長（比照 integration 路由）
  const rangeStart = `${from.replace('-', '/')}/01`
  const rangeEnd = `${to.replace('-', '/')}/31`
  const where: Record<string, unknown> = {
    isCancelled: false, // 已取消的排程不計入負載
    startDate: { lte: rangeEnd },
    endDate: { gte: rangeStart },
  }
  const categories = csv(req.query.categories)
  if (categories) where.category = { in: categories }
  const testUnits = csv(req.query.testUnits)
  if (testUnits) where.testUnit = { in: testUnits }
  const testEngineers = csv(req.query.testEngineers)
  if (testEngineers) where.testEngineer = { in: testEngineers }

  const rows = await prisma.schedule.findMany({
    where,
    select: { category: true, testEngineer: true, testUnit: true, timeResource: true, startDate: true, endDate: true },
  })
  const schedules = rows.filter(s => s.testEngineer)

  const categoryRows = await prisma.category.findMany()
  // DB 欄位為未受限的 VARCHAR，非法或缺漏值一律退回 counted
  const statsModes = Object.fromEntries(
    categoryRows.map(c => [c.value, normalizeStatsMode(c.statsMode)]),
  )

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

  const merged = mergeMonthlyWorkloads(monthly)
  const scheduleCounts = countSchedulesByEngineer(schedules, statsModes)
  res.json({
    from,
    to,
    workdays: merged.workdays,
    notes,
    engineers: merged.engineers.map(e => ({
      testEngineer: e.testEngineer,
      testUnits: e.testUnits,
      scheduleCount: scheduleCounts.get(e.testEngineer) ?? 0,
      baseScore: e.baseScore,
      rate: e.rate,
      level: e.level,
      unscheduledDays: e.unscheduledDays,
      partialDays: e.partialDays,
      cappedDays: e.cappedDays,
    })),
  })
})

export default router
```

- [ ] **Step 4: 掛載到 index.ts**

在 `server/src/index.ts` 的 `import auditRouter from './routes/audit.js'` 下一行加：

```ts
import analyticsRouter from './routes/analytics.js'
```

在 `app.use('/api/audit', auditRouter)` 下一行加：

```ts
app.use('/api/analytics', analyticsRouter)
```

- [ ] **Step 5: 執行確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/analyticsWorkloadRoute.test.ts`
Expected: 10 passed。

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: 無輸出（0 錯誤）。若 `rows.filter(s => s.testEngineer)` 因 `testEngineer` 型別為 `string | null` 而讓 `analyzeWorkload` 的參數不合，改成 `rows.filter((s): s is typeof s & { testEngineer: string } => !!s.testEngineer)`。

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/analytics.ts server/src/index.ts server/src/__tests__/analyticsWorkloadRoute.test.ts
git commit -m "feat(analytics): workload endpoint reusing the agent algorithm without overtime

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 前端型別、API client 與純函式

**Files:**
- Modify: `src/types.ts`（檔尾新增型別）
- Modify: `src/lib/api.ts`（`api` 物件內新增 `getWorkload`）
- Modify: `src/lib/analytics.ts`（新增純函式；**先不要**移除 `allocateTimeResource`，Task 5 才移）
- Test: `src/__tests__/analytics.test.ts`（追加 describe）

**Interfaces:**
- Produces（`src/types.ts`）:
  ```ts
  export type WorkloadLevel = '超載' | '滿載' | '中等' | '偏低'
  export interface WorkloadEngineer { testEngineer: string; testUnits: string[]; scheduleCount: number; baseScore: number; rate: number; level: WorkloadLevel; unscheduledDays: number; partialDays: number; cappedDays: number }
  export interface WorkloadResponse { from: string; to: string; workdays: number; notes: string[]; engineers: WorkloadEngineer[] }
  ```
- Produces（`src/lib/api.ts`）: `api.getWorkload(params: { from: string; to: string; categories?: string[]; testUnits?: string[]; testEngineers?: string[] }): Promise<WorkloadResponse>`。
- Produces（`src/lib/analytics.ts`）:
  - `classifyLevel(rate: number): WorkloadLevel`
  - `LEVEL_COLORS: Record<WorkloadLevel, string>`、`LEVEL_ORDER: WorkloadLevel[]`
  - `periodRange(key: string, scale: TimeScale): { from: string; to: string }`
  - `periodKeysOfSchedules(schedules: Pick<Schedule,'startDate'|'endDate'>[], scale: TimeScale, today: Date): string[]`
  - `aggregateByUnit(engineers: WorkloadEngineer[]): UnitWorkload[]`，`UnitWorkload = { name: string; rate: number; level: WorkloadLevel; headcount: number; scheduleCount: number }`

- [ ] **Step 1: 寫失敗的測試**

在 `src/__tests__/analytics.test.ts` 的 import 補上 `classifyLevel, periodRange, periodKeysOfSchedules, aggregateByUnit`，並在檔尾追加：

```ts
describe('classifyLevel（前端副本，門檻與 server/src/lib/workload.ts 相同）', () => {
  it('>100 超載、90-100 滿載、70-89 中等、<70 偏低', () => {
    expect(classifyLevel(100.1)).toBe('超載')
    expect(classifyLevel(100)).toBe('滿載')
    expect(classifyLevel(90)).toBe('滿載')
    expect(classifyLevel(89.9)).toBe('中等')
    expect(classifyLevel(70)).toBe('中等')
    expect(classifyLevel(69.9)).toBe('偏低')
  })
})

describe('periodRange', () => {
  it('月', () => {
    expect(periodRange('2026/07', 'month')).toEqual({ from: '2026-07', to: '2026-07' })
  })
  it('季', () => {
    expect(periodRange('2026 Q1', 'quarter')).toEqual({ from: '2026-01', to: '2026-03' })
    expect(periodRange('2026 Q4', 'quarter')).toEqual({ from: '2026-10', to: '2026-12' })
  })
  it('年', () => {
    expect(periodRange('2026', 'year')).toEqual({ from: '2026-01', to: '2026-12' })
  })
})

describe('periodKeysOfSchedules', () => {
  const today = new Date(2026, 8, 14)
  it('涵蓋每筆排程起迄之間的所有期間，加上今天所在期間，排序去重', () => {
    const keys = periodKeysOfSchedules(
      [
        { startDate: '2026/06/22', endDate: '2026/08/03' },
        { startDate: '2026/11/02', endDate: '2026/11/06' },
      ],
      'month', today,
    )
    expect(keys).toEqual(['2026/06', '2026/07', '2026/08', '2026/09', '2026/11'])
  })
  it('季尺度', () => {
    expect(periodKeysOfSchedules([{ startDate: '2026/03/30', endDate: '2026/04/02' }], 'quarter', today))
      .toEqual(['2026 Q1', '2026 Q2', '2026 Q3'])
  })
  it('沒有排程時只有今天', () => {
    expect(periodKeysOfSchedules([], 'year', today)).toEqual(['2026'])
  })
})

describe('aggregateByUnit', () => {
  const eng = (over: Partial<WorkloadEngineer>): WorkloadEngineer => ({
    testEngineer: 'X', testUnits: ['RA'], scheduleCount: 1, baseScore: 10, rate: 50, level: '偏低',
    unscheduledDays: 0, partialDays: 0, cappedDays: 0, ...over,
  })
  it('單位負載率＝testUnits 含該單位的人員平均，人數與筆數加總', () => {
    const units = aggregateByUnit([
      eng({ testEngineer: 'A', rate: 100, scheduleCount: 2 }),
      eng({ testEngineer: 'B', rate: 80, scheduleCount: 3 }),
      eng({ testEngineer: 'C', testUnits: ['RB'], rate: 30 }),
    ])
    expect(units).toEqual([
      { name: 'RA', rate: 90, level: '滿載', headcount: 2, scheduleCount: 5 },
      { name: 'RB', rate: 30, level: '偏低', headcount: 1, scheduleCount: 1 },
    ])
  })
  it('一人多單位在每個單位各算一次；平均取一位小數', () => {
    const units = aggregateByUnit([
      eng({ testEngineer: 'A', testUnits: ['RA', 'RB'], rate: 33.3 }),
      eng({ testEngineer: 'B', testUnits: ['RB'], rate: 50 }),
    ])
    expect(units.find(u => u.name === 'RA')).toEqual({ name: 'RA', rate: 33.3, level: '偏低', headcount: 1, scheduleCount: 1 })
    expect(units.find(u => u.name === 'RB')?.rate).toBe(41.7)
  })
  it('沒有單位的人歸「未分配」', () => {
    expect(aggregateByUnit([eng({ testUnits: [] })])[0].name).toBe('未分配')
  })
  it('依負載率降冪，同分依名稱', () => {
    const names = aggregateByUnit([
      eng({ testEngineer: 'A', testUnits: ['Z'], rate: 50 }),
      eng({ testEngineer: 'B', testUnits: ['M'], rate: 50 }),
      eng({ testEngineer: 'C', testUnits: ['K'], rate: 90 }),
    ]).map(u => u.name)
    expect(names).toEqual(['K', 'M', 'Z'])
  })
})
```

並把測試檔頂端的 `import type { Schedule, RestDaysConfig, CategoryOption } from '../types'` 改為 `import type { Schedule, RestDaysConfig, CategoryOption, WorkloadEngineer } from '../types'`。

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/__tests__/analytics.test.ts`
Expected: FAIL，`classifyLevel` 等未匯出。

- [ ] **Step 3: 新增型別**

在 `src/types.ts` 檔尾追加：

```ts
// ── 負載分析（GET /api/analytics/workload）──────────────────
export type WorkloadLevel = '超載' | '滿載' | '中等' | '偏低'

export interface WorkloadEngineer {
  testEngineer: string
  testUnits: string[]
  scheduleCount: number
  baseScore: number
  rate: number // %
  level: WorkloadLevel
  unscheduledDays: number
  partialDays: number
  cappedDays: number
}

export interface WorkloadResponse {
  from: string // YYYY-MM
  to: string   // YYYY-MM
  workdays: number
  notes: string[]
  engineers: WorkloadEngineer[]
}
```

- [ ] **Step 4: 新增 API client**

`src/lib/api.ts` 的 type import 加上 `WorkloadResponse`；在 `api` 物件的 `// ── Schedules ──` 區塊之前加：

```ts
  // ── Analytics ─────────────────────────────────────────
  getWorkload: (params: {
    from: string; to: string
    categories?: string[]; testUnits?: string[]; testEngineers?: string[]
  }) => {
    const q = new URLSearchParams({ from: params.from, to: params.to })
    if (params.categories?.length) q.set('categories', params.categories.join(','))
    if (params.testUnits?.length) q.set('testUnits', params.testUnits.join(','))
    if (params.testEngineers?.length) q.set('testEngineers', params.testEngineers.join(','))
    return req<WorkloadResponse>('GET', `/analytics/workload?${q.toString()}`)
  },
```

- [ ] **Step 5: 新增純函式**

`src/lib/analytics.ts` 的 type import 改為 `import type { Schedule, RestDaysConfig, CategoryOption, WorkloadEngineer, WorkloadLevel } from '../types'`，檔尾追加：

```ts
// ── 負載分布（資料來自 GET /api/analytics/workload）──────────

// 門檻與 server/src/lib/workload.ts 的 classifyLevel 相同；前端無法從 server/
// 匯入，兩份要手動同步。只用於「單位」維度的平均值分級，人員的 level 一律用後端回傳值。
export function classifyLevel(rate: number): WorkloadLevel {
  if (rate > 100) return '超載'
  if (rate >= 90) return '滿載'
  if (rate >= 70) return '中等'
  return '偏低'
}

export const LEVEL_ORDER: WorkloadLevel[] = ['超載', '滿載', '中等', '偏低']
export const LEVEL_COLORS: Record<WorkloadLevel, string> = {
  超載: '#dc2626',
  滿載: '#f59e0b',
  中等: '#3b82f6',
  偏低: '#9ca3af',
}

const mm = (m: number) => String(m).padStart(2, '0')

// 期間鍵（periodKey 的輸出）→ API 的 from/to（YYYY-MM）
export function periodRange(key: string, scale: TimeScale): { from: string; to: string } {
  if (scale === 'year') return { from: `${key}-01`, to: `${key}-12` }
  if (scale === 'quarter') {
    const [y, q] = key.split(' Q')
    const first = (Number(q) - 1) * 3 + 1
    return { from: `${y}-${mm(first)}`, to: `${y}-${mm(first + 2)}` }
  }
  const [y, m] = key.split('/')
  return { from: `${y}-${m}`, to: `${y}-${m}` }
}

// 期間下拉的選項：每筆排程起迄之間逐月產生期間鍵，加上今天所在期間
export function periodKeysOfSchedules(
  schedules: ReadonlyArray<Pick<Schedule, 'startDate' | 'endDate'>>,
  scale: TimeScale,
  today: Date,
): string[] {
  const keys = new Set<string>([periodKey(today, scale)])
  for (const s of schedules) {
    const start = parseYmd(s.startDate)
    const end = parseYmd(s.endDate)
    for (const d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      keys.add(periodKey(d, scale))
    }
  }
  return [...keys].sort()
}

export interface UnitWorkload {
  name: string
  rate: number
  level: WorkloadLevel
  headcount: number
  scheduleCount: number
}

// 單位負載率＝testUnits 含該單位的人員負載率平均；一人多單位在每個單位各算一次
export function aggregateByUnit(engineers: WorkloadEngineer[]): UnitWorkload[] {
  const acc = new Map<string, { rates: number[]; scheduleCount: number }>()
  for (const e of engineers) {
    const units = e.testUnits.length > 0 ? e.testUnits : ['未分配']
    for (const u of units) {
      const a = acc.get(u) ?? { rates: [], scheduleCount: 0 }
      a.rates.push(e.rate)
      a.scheduleCount += e.scheduleCount
      acc.set(u, a)
    }
  }
  return [...acc.entries()]
    .map(([name, a]) => {
      const rate = Math.round((a.rates.reduce((x, y) => x + y, 0) / a.rates.length) * 10) / 10
      return { name, rate, level: classifyLevel(rate), headcount: a.rates.length, scheduleCount: a.scheduleCount }
    })
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name))
}
```

- [ ] **Step 6: 執行確認通過**

Run: `npx vitest run src/__tests__/analytics.test.ts`
Expected: 全部通過（原有 + 新增 12 個）。

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: 無輸出。

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/lib/api.ts src/lib/analytics.ts src/__tests__/analytics.test.ts
git commit -m "feat(analytics): workload API client, level thresholds and unit aggregation helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 重寫 LoadSection，接上 AnalyticsPage，移除舊算法

**Files:**
- Rewrite: `src/components/analytics/LoadSection.tsx`
- Modify: `src/components/analytics/AnalyticsPage.tsx:73-78`（註解）、`:132-136`（解構）、`:187`（LoadSection 呼叫）
- Modify: `src/lib/analytics.ts`（移除 `allocateTimeResource`、不再使用的 import）
- Modify: `src/__tests__/analytics.test.ts`（移除 `allocateTimeResource` describe 與 import）

**Interfaces:**
- Consumes: Task 4 的 `api.getWorkload`、`periodRange`、`periodKeysOfSchedules`、`aggregateByUnit`、`LEVEL_COLORS`、`LEVEL_ORDER`、`WorkloadResponse`、`WorkloadEngineer`、`UnitWorkload`；`AnalyticsFilter`（`AnalyticsPage.tsx` 已 export）。
- Produces: `LoadSection` props `{ filter: AnalyticsFilter; schedules: Schedule[] }`。

- [ ] **Step 1: 重寫 LoadSection**

整檔覆蓋 `src/components/analytics/LoadSection.tsx`：

```tsx
import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import ScaleToggle from './ScaleToggle'
import { SegmentedControl } from '../shared/SegmentedControl'
import { api, ApiError } from '../../lib/api'
import {
  periodKey, periodRange, periodKeysOfSchedules, aggregateByUnit, LEVEL_COLORS, LEVEL_ORDER,
} from '../../lib/analytics'
import type { TimeScale } from '../../lib/analytics'
import type { AnalyticsFilter } from './AnalyticsPage'
import type { Schedule, WorkloadResponse, WorkloadLevel } from '../../types'

type Dimension = 'engineer' | 'unit'

interface Props {
  // 類別／單位／人員篩選會送給 API；狀態篩選刻意不送——Agent 算法只排除已取消、不看狀態
  filter: AnalyticsFilter
  // 只用來推出期間下拉的選項，不參與計算
  schedules: Schedule[]
}

interface Row {
  name: string
  rate: number
  level: WorkloadLevel
  baseScore?: number
  scheduleCount: number
  cappedDays?: number
  unscheduledDays?: number
  headcount?: number
}

const LoadSection: React.FC<Props> = ({ filter, schedules }) => {
  const [scale, setScale] = useState<TimeScale>('month')
  const [period, setPeriod] = useState(() => periodKey(new Date(), 'month'))
  const [dim, setDim] = useState<Dimension>('engineer')
  const [result, setResult] = useState<WorkloadResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 篩選連續變更時，較早送出的請求可能較晚回來；只採用最後一次的結果
  const reqSeq = useRef(0)

  const periodOptions = useMemo(
    () => periodKeysOfSchedules(schedules, scale, new Date()),
    [schedules, scale],
  )

  const changeScale = (v: TimeScale) => {
    setScale(v)
    setPeriod(periodKey(new Date(), v))
  }

  const { categories, testUnits, testEngineers } = filter
  useEffect(() => {
    const seq = ++reqSeq.current
    const { from, to } = periodRange(period, scale)
    setLoading(true)
    setError(null)
    api.getWorkload({ from, to, categories, testUnits, testEngineers })
      .then(r => { if (seq === reqSeq.current) setResult(r) })
      .catch(e => {
        if (seq !== reqSeq.current) return
        setResult(null)
        setError(e instanceof ApiError ? e.message : '無法取得負載資料')
      })
      .finally(() => { if (seq === reqSeq.current) setLoading(false) })
  }, [period, scale, categories, testUnits, testEngineers])

  const data: Row[] = useMemo(() => {
    if (!result) return []
    if (dim === 'unit') {
      return aggregateByUnit(result.engineers).map(u => ({
        name: u.name, rate: u.rate, level: u.level, scheduleCount: u.scheduleCount, headcount: u.headcount,
      }))
    }
    return result.engineers.map(e => ({
      name: e.testEngineer, rate: e.rate, level: e.level, baseScore: e.baseScore,
      scheduleCount: e.scheduleCount, cappedDays: e.cappedDays, unscheduledDays: e.unscheduledDays,
    }))
  }, [result, dim])

  const chartHeight = Math.max(200, data.length * 32 + 60)
  const workdays = result?.workdays ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-700">負載分布（負載率％）</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ScaleToggle value={scale} onChange={changeScale} />
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none">
            {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <SegmentedControl
            ariaLabel="負載分組維度"
            value={dim}
            onChange={setDim}
            options={[
              { value: 'engineer', label: '人員' },
              { value: 'unit',     label: '單位' },
            ]}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
        {LEVEL_ORDER.map(level => (
          <span key={level} className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: LEVEL_COLORS[level] }} />
            {level}
          </span>
        ))}
        {workdays > 0 && <span>期間工作日 {workdays} 天</span>}
      </div>

      {error ? (
        <div className="flex items-center justify-center text-red-500 h-40 text-sm">{error}</div>
      ) : loading && !result ? (
        <div className="flex items-center justify-center text-gray-400 h-40 text-sm">載入中…</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 h-40 text-sm">此期間尚無負載資料</div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} unit="%" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={90} />
              <ReferenceLine x={100} stroke="#dc2626" strokeDasharray="4 4" />
              <Tooltip content={<LoadTooltip dim={dim} workdays={workdays} />} />
              <Bar dataKey="rate" isAnimationActive={false}>
                {data.map(d => <Cell key={d.name} fill={LEVEL_COLORS[d.level]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {result && result.notes.length > 0 && (
        <ul className="text-[11px] text-amber-600 space-y-0.5">
          {result.notes.map(n => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="text-[11px] text-gray-400">
        與 Agent 負載分析同一算法（不含加班加分）：每日強度＝(timeResource＋類別調整)÷區間工作日，單日 1.2 封頂；
        工作日依政府行事曆；已取消排程不計；狀態篩選不影響此圖。
        {dim === 'unit' && ' 單位負載率＝該期間有排程的所屬人員平均。'}
      </p>
    </div>
  )
}

interface TooltipProps {
  active?: boolean
  payload?: { payload: Row }[]
  dim: Dimension
  workdays: number
}

const LoadTooltip: React.FC<TooltipProps> = ({ active, payload, dim, workdays }) => {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs text-gray-700 space-y-0.5">
      <div className="font-semibold">{row.name}</div>
      <div>負載率 {row.rate.toFixed(1)}%（{row.level}）</div>
      {dim === 'engineer' ? (
        <>
          <div>基礎分 {row.baseScore?.toFixed(2)}／期間工作日 {workdays} 天</div>
          <div>排程 {row.scheduleCount} 筆</div>
          <div>封頂 {row.cappedDays} 天、未排程 {row.unscheduledDays} 天</div>
        </>
      ) : (
        <>
          <div>人數 {row.headcount} 人</div>
          <div>排程 {row.scheduleCount} 筆</div>
        </>
      )}
    </div>
  )
}

export default LoadSection
```

- [ ] **Step 2: 接上 AnalyticsPage**

`src/components/analytics/AnalyticsPage.tsx`：

1. 第 73 行註解 `// 圖表用的類別清單（colorOf 配色 / TrendSection / LoadSection）維持只取啟用中類別，` 改為 `// 圖表用的類別清單（colorOf 配色 / TrendSection）維持只取啟用中類別，`。
2. 第 132–136 行改為：

```tsx
  // 依類別的 statsMode 分流：統計類元件吃 stats；負載分布改由後端
  // /api/analytics/workload 自行套 statsMode，這裡不再需要 workload 那份
  const { stats: statsSchedules } = useMemo(
    () => splitByStatsMode(filtered, options.categories),
    [filtered, options.categories],
  )
```

3. 第 187 行改為：

```tsx
          <LoadSection filter={filter} schedules={filtered} />
```

- [ ] **Step 3: 移除舊算法**

`src/lib/analytics.ts`：刪除整個 `allocateTimeResource` 函式（含其上方註解 `// 依重疊工作天比例把 timeResource 分攤到各期間…`）。之後 `isRestDay` 與 `RestDaysConfig` 不再使用，刪除 `import { isRestDay } from './restDays'`，並從 type import 移除 `RestDaysConfig`。

`src/__tests__/analytics.test.ts`：刪除整個 `describe('allocateTimeResource', …)` 區塊、`noRest`、`weekendRest` 兩個常數，import 中移除 `allocateTimeResource` 與 `RestDaysConfig`。

- [ ] **Step 4: 執行前端測試與型別檢查**

Run: `npx vitest run`
Expected: 全部通過。

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: 無輸出。常見錯誤與處理：
- `Tooltip content` 的型別不合 → `<Tooltip content={(props) => <LoadTooltip {...(props as TooltipProps)} dim={dim} workdays={workdays} />} />`。
- `LoadSection.tsx` import `AnalyticsFilter` 與 `AnalyticsPage.tsx` import `LoadSection` 形成循環：只匯入 type（已用 `import type`），Vite 會抹掉，允許。

Run: `npx eslint src/components/analytics src/lib/analytics.ts`
Expected: 無錯誤。

- [ ] **Step 5: 瀏覽器驗證**

依記憶 `vtms-frontend-preview`：登入頁會擋住編輯器，VSMS 也有 `_dev-admin.html` / `_dev-stub.ts` 這種臨時 harness。先看 `_dev-stub.ts` 是否 stub 了 `/api/...`；若有，補一個 `/api/analytics/workload` 的 stub 回傳兩三位工程師，再用 preview 打開 `_dev-admin.html` 切到統計分析，確認：
- 長條依等級上色、100% 參考線、圖例、期間工作日。
- 切換單位維度 tooltip 顯示人數。
- 切季／年後期間下拉正確、無 console error。
截圖存到 scratchpad 供最後回報。若 harness 無法涵蓋統計頁，改以 `npm run test:all` 與型別檢查為準並在回報中說明未做瀏覽器驗證。

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/LoadSection.tsx src/components/analytics/AnalyticsPage.tsx src/lib/analytics.ts src/__tests__/analytics.test.ts
git commit -m "feat(analytics): load chart shows workload rate per engineer from the agent algorithm

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 全量驗證與部署

**Files:** 無新檔。

- [ ] **Step 1: 全量測試與型別**

Run: `npm run test:all`
Expected: 前後端全部通過（後端條數以 failures 為準）。

Run: `npx tsc -p tsconfig.app.json --noEmit; npx tsc -p server/tsconfig.json --noEmit`
Expected: 兩者皆無輸出。

Run: `git status --short`
Expected: 只剩別人的 `server/src/lib/crypto.ts`、`server/src/routes/auth.ts`、`server/src/__tests__/loginPasswordValidation.test.ts`、`.env.bak-20260827` 未提交；本計畫的檔案皆已 commit。

- [ ] **Step 2: 部署**

依記憶 `vtms-vsms-deployment`（VSMS 由 pm2 `vsms` 以 3001 服務，dist 由磁碟即時服務）與 `vsms-2026-09-09-three-changes`（別人未提交的 auth.ts 用 stash 繞過）：

1. 先備份：`Copy-Item -Recurse dist dist.stable-20260914-pre-workload`。
2. `git stash push -- server/src/lib/crypto.ts server/src/routes/auth.ts`（只 stash 別人的兩個檔，測試檔是 untracked 不受影響）。
3. `npm run build`（同時 build 前端 dist 與 server/dist）。
4. `pm2 restart vsms`，再 `pm2 logs vsms --lines 30 --nostream` 確認啟動無錯。
5. `git stash pop` 還原別人的修改，`git status --short` 確認兩檔回到 modified。
6. 用瀏覽器打 `https://<主機>:3001` 登入後開統計分析，確認負載分布有資料；另呼叫一次 `/api/analytics/workload?from=<本月>` 看回應。

若 pm2 restart 後 500，還原：`git stash pop`（若尚未）→ `Remove-Item -Recurse dist; Rename-Item dist.stable-20260914-pre-workload dist` → 重新 `npm run build` 前先 `git checkout <上一版 commit>` 或直接 `pm2 restart vsms` 用舊 server/dist（server/dist 未備份時以 `git revert` 三個 feat commit 後重 build）。

- [ ] **Step 3: 回報**

以繁體中文總結：兩項改動、驗證結果（測試條數、型別）、部署狀態、與現況的行為差異（狀態篩選不再影響負載圖、工作日改依政府行事曆）。
