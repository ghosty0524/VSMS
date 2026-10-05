# 休息日清單寫入加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補上休息日清單三個寫入弱點：匯入與設定存檔的權限、匯入與單筆變更的稽核、舊分頁整份 PUT 蓋掉清單。

**Architecture:** 新增 `server/src/lib/restDaysStore.ts` 作為休息日唯一的寫入路徑（交易內讀改寫＋process 內排隊）。新增單筆 API `POST/DELETE /api/options/rest-days`；`PUT /api/options` 改成限管理員且不再寫休息日；匯入改限系統管理員、走同一個寫入函式並記稽核。前端休息日區塊改用單筆 API。

**Tech Stack:** VSMS：Express 5 + Prisma（MariaDB）+ React/zustand + vitest + supertest。

**規格：** `docs/superpowers/specs/2026-10-05-rest-days-hardening-design.md`

## Global Constraints

- 休息日清單 `rest_days_config.specificDates`（`id = 1`）儲存格式一律 `YYYY/MM/DD`；寫入一律 `weekends: true`。
- 所有休息日寫入只經過 `updateRestDates`（`server/src/lib/restDaysStore.ts`）。`PUT /api/options` 不得再寫 `restDays`。
- 權限：匯入 `requireAuth, requireSuperAdmin`；`PUT /api/options` 與單筆 API `requireAdmin`；`GET /api/options` 維持 `requireAuth`。
- 稽核：`appendAudit(username, displayName, 'UPDATE_SETTINGS', 'restDays', fields)`；單筆 `['新增 YYYY/MM/DD']`／`['刪除 YYYY/MM/DD']`；匯入 `['匯入 <檔名>', '<年> 年', '新增 <n> 筆']`。清單沒有變動的單筆操作不記；被擋下的匯入不記。
- 缺列、壞 JSON、非陣列一律拋錯，絕不退化成空清單；既有清單有不合法項目時寫入端回 422，不默默丟掉。
- **git 安全**：禁止 `git restore`、`git checkout -- <file>`、`git stash`、`git reset`、`git clean`；只 `git add` 自己改的檔案。另一個工作階段可能同時在別的 worktree 修 `src/__tests__/topbar.test.tsx`，不要碰那個檔案。
- 分支：`feat/guest-role-and-uiux`，不要切換。
- 指令（照抄）：
  - 後端單檔：`npx vitest run --config server/vitest.config.ts <檔案>`；全部：`npm run test:server`
  - 前端單檔：`npx vitest run <檔案>`；全部：`npm test`（`src/__tests__/topbar.test.tsx` 目前有 4 個既有失敗，與本計畫無關，只要沒有新增失敗即可）
  - 型別：`npx tsc -p server/tsconfig.json --noEmit` 與 `npx tsc --noEmit -p tsconfig.app.json`
- commit 訊息結尾加（逐字）：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 時間：重啟正式服務前用 `powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'"` 確認台北時間（Git Bash 的 `TZ=Asia/Taipei date` 會印 UTC）。

## File Structure

| 檔案 | 責任 |
|---|---|
| `server/src/lib/holidays.ts` | 抽出 `parseHolidayJson`（JSON 字串解析＋非陣列拋錯） |
| `server/src/lib/restDaysStore.ts`（新） | `InvalidStoredHolidaysError`、`parseStoredRestDates`、`updateRestDates` |
| `server/src/routes/options.ts` | 單筆 API；`PUT` 加 `requireAdmin`、不再寫休息日 |
| `server/src/routes/calendar.ts` | 權限、改用 `updateRestDates`、稽核、檔名解碼 |
| `src/lib/api.ts`、`src/store/optionsStore.ts`、`src/components/settings/RestDaysManager.tsx`、`src/components/settings/CalendarImport.tsx` | 前端改用單筆 API、匯入帶 session header |
| `F:\vportal\docs\guides\vsms\role-admin.md` | 說明稽核 |

---

### Task 1: 共用寫入函式 `restDaysStore.ts`

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\lib\holidays.ts`
- Create: `F:\vsms\vsms-export\server\src\lib\restDaysStore.ts`
- Test: `F:\vsms\vsms-export\server\src\__tests__\restDaysStore.test.ts`（新）

**Interfaces:**
- Produces:
  - `holidays.ts`：`parseHolidayJson(raw: unknown): unknown[]`
  - `restDaysStore.ts`：`class InvalidStoredHolidaysError extends Error { readonly bad: string[] }`；`parseStoredRestDates(raw: unknown): string[]`；`updateRestDates(mutate: (dates: string[]) => string[]): Promise<{ before: string[]; after: string[] }>`

- [ ] **Step 1: 寫失敗的測試**

```ts
// server/src/__tests__/restDaysStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }))

vi.mock('../lib/db.js', () => {
  const tx = { restDaysConfig: { findUnique, upsert } }
  return { prisma: { ...tx, $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) } }
})

import { parseStoredRestDates, updateRestDates, InvalidStoredHolidaysError } from '../lib/restDaysStore.js'

const row = (specificDates: unknown) => ({ id: 1, weekends: true, specificDates })

beforeEach(() => { findUnique.mockReset(); upsert.mockReset() })

describe('parseStoredRestDates', () => {
  it('兩種格式都收，正規化成斜線、排序、去重', () => {
    expect(parseStoredRestDates(['2026-10-09', '2026/02/27', '2026/10/09'])).toEqual(['2026/02/27', '2026/10/09'])
  })
  it('接受 MySQL 回的 JSON 字串', () => {
    expect(parseStoredRestDates('["2026/11/20"]')).toEqual(['2026/11/20'])
  })
  it('壞 JSON 或不是陣列時拋錯', () => {
    expect(() => parseStoredRestDates('{oops')).toThrow(/specificDates/)
    expect(() => parseStoredRestDates({ a: 1 })).toThrow(/specificDates/)
  })
  it('有不合法的日期時丟 InvalidStoredHolidaysError 並列出', () => {
    try {
      parseStoredRestDates(['2026/10/09', '2026/02/30'])
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidStoredHolidaysError)
      expect((e as InvalidStoredHolidaysError).bad).toEqual(['2026/02/30'])
    }
  })
})

describe('updateRestDates', () => {
  it('讀出、套用變更、去重排序後寫回', async () => {
    findUnique.mockResolvedValue(row(['2026/10/26']))

    const r = await updateRestDates(d => [...d, '2026/10/09', '2026/10/26'])

    const after = ['2026/10/09', '2026/10/26']
    expect(r).toEqual({ before: ['2026/10/26'], after })
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, weekends: true, specificDates: after },
      update: { weekends: true, specificDates: after },
    })
  })

  it('清單沒有變動時不寫入', async () => {
    findUnique.mockResolvedValue(row(['2026/10/09']))

    await updateRestDates(d => [...d, '2026/10/09'])

    expect(upsert).not.toHaveBeenCalled()
  })

  it('缺列時拋錯、不寫入', async () => {
    findUnique.mockResolvedValue(null)

    await expect(updateRestDates(d => d)).rejects.toThrow(/id=1/)
    expect(upsert).not.toHaveBeenCalled()
  })

  // 兩個請求同時進來：第二個必須讀到第一個寫入後的清單，不能各自從舊清單算、互相蓋掉
  it('同時呼叫時依序執行，後者看得到前者的結果', async () => {
    let stored = ['2026/10/26']
    findUnique.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 5))
      return row(stored)
    })
    upsert.mockImplementation(async ({ update }: { update: { specificDates: string[] } }) => {
      stored = update.specificDates
    })

    await Promise.all([
      updateRestDates(d => [...d, '2026/10/09']),
      updateRestDates(d => [...d, '2026/12/25']),
    ])

    expect(stored).toEqual(['2026/10/09', '2026/10/26', '2026/12/25'])
  })

  it('前一個失敗不會卡住後面的呼叫', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row([]))

    await expect(updateRestDates(d => d)).rejects.toThrow()
    await expect(updateRestDates(d => [...d, '2026/10/09'])).resolves.toMatchObject({ after: ['2026/10/09'] })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd F:/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/restDaysStore.test.ts`
Expected: FAIL，`Failed to resolve import "../lib/restDaysStore.js"`

- [ ] **Step 3: 在 `holidays.ts` 抽出 `parseHolidayJson`**

把 `normalizeHolidayDates` 開頭的
```ts
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw) as unknown
    } catch (err) {
      throw new Error(`rest_days_config.specificDates 不是合法的 JSON：${(err as Error).message}`, { cause: err })
    }
  }
  if (!Array.isArray(arr)) throw new Error('rest_days_config.specificDates 不是陣列')
```
換成
```ts
  const arr = parseHolidayJson(raw)
```
並在 `normalizeHolidayDates` 之前加：
```ts
/** 欄位原始值：mysql2／Prisma 可能回已解析的陣列或 JSON 字串。解析失敗或不是陣列都拋錯。 */
export function parseHolidayJson(raw: unknown): unknown[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw) as unknown
    } catch (err) {
      throw new Error(`rest_days_config.specificDates 不是合法的 JSON：${(err as Error).message}`, { cause: err })
    }
  }
  if (!Array.isArray(arr)) throw new Error('rest_days_config.specificDates 不是陣列')
  return arr
}
```

- [ ] **Step 4: 新增 `restDaysStore.ts`**

```ts
// server/src/lib/restDaysStore.ts
import { prisma } from './db.js'
import { parseHolidayJson, normalizeRestDatesForWrite } from './holidays.js'

/**
 * 休息日清單（rest_days_config.specificDates）唯一的寫入路徑：單筆新增／刪除與政府日曆匯入
 * 都經過 updateRestDates。PUT /api/options 不再寫這份清單——它會把設定頁載入時的舊快照整份
 * 送回來，別的分頁一存檔就把剛改的日期蓋掉。規格：docs/superpowers/specs/2026-10-05-rest-days-hardening-design.md
 */

/** 既有清單有不合法的項目：寫入端不能默默丟掉（會吃掉管理員的資料），整個操作拒絕。 */
export class InvalidStoredHolidaysError extends Error {
  constructor(readonly bad: string[]) {
    super(`休息日清單有格式不合的日期：${bad.join('、')}`)
  }
}

/**
 * 寫入端讀既有清單：正規化成 YYYY/MM/DD、排序、去重；壞 JSON、非陣列拋錯，有不合法項目丟
 * InvalidStoredHolidaysError。讀取端（holidays.ts 的 readHolidays）是略過壞項目並 warn；
 * 寫入端要嚴格，因為結果會被寫回去。
 */
export function parseStoredRestDates(raw: unknown): string[] {
  const norm = normalizeRestDatesForWrite(parseHolidayJson(raw))
  if (!norm.ok) throw new InvalidStoredHolidaysError(norm.bad)
  return norm.dates
}

// VSMS 是單一 process（pm2 fork 模式），休息日的寫入全部在這條佇列上排隊：
// 新增、刪除、匯入同時進來時，後者一定讀到前者寫完的清單，不會互相蓋掉。
// 不用 SELECT … FOR UPDATE：Prisma 沒有原生支援，改用 raw SQL 會讓所有測試都得 mock raw query。
let queue: Promise<unknown> = Promise.resolve()

export function updateRestDates(
  mutate: (dates: string[]) => string[],
): Promise<{ before: string[]; after: string[] }> {
  const run = queue.then(() => prisma.$transaction(async tx => {
    const row = await tx.restDaysConfig.findUnique({ where: { id: 1 } })
    // initDb 開機時會建這一列；缺列代表資料被動過，不能當成「沒有假日」
    if (!row) throw new Error('rest_days_config 沒有 id=1 的列')
    const before = parseStoredRestDates(row.specificDates)
    const after = [...new Set(mutate(before))].sort()
    const changed = after.length !== before.length || after.some((d, i) => d !== before[i])
    if (changed) {
      await tx.restDaysConfig.upsert({
        where: { id: 1 },
        create: { id: 1, weekends: true, specificDates: after },
        update: { weekends: true, specificDates: after },
      })
    }
    return { before, after }
  }))
  // 失敗也要讓佇列往下走，否則一次錯誤會卡死之後所有寫入
  queue = run.catch(() => undefined)
  return run
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/restDaysStore.test.ts server/src/__tests__/holidays.test.ts`
Expected: PASS（restDaysStore 9 tests；holidays 既有 13 tests 照過）

- [ ] **Step 6: 後端全部測試與型別檢查**

Run: `npm run test:server && npx tsc -p server/tsconfig.json --noEmit`
Expected: 0 failed、無型別錯誤

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/holidays.ts server/src/lib/restDaysStore.ts server/src/__tests__/restDaysStore.test.ts
git commit -m "feat(rest-days): single serialized write path for the rest-day list"
```

---

### Task 2: 單筆 API 與 `PUT /api/options` 收權限、不再寫休息日

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\routes\options.ts`
- Modify: `F:\vsms\vsms-export\server\src\__tests__\optionsPutVauth.test.ts`
- Test: `F:\vsms\vsms-export\server\src\__tests__\optionsRestDaysRoute.test.ts`（新）

**Interfaces:**
- Consumes：Task 1 的 `updateRestDates`、`InvalidStoredHolidaysError`；`holidays.ts` 的 `toIsoHoliday(value: string): string | null`。
- Produces（HTTP）：`POST /api/options/rest-days` body `{ date }`、`DELETE /api/options/rest-days/:date` → 200 `{ weekends: true, specificDates: string[] }`；400 `{ ok: false, message }`；422 `{ ok: false, message }`；非管理員 403。

- [ ] **Step 1: 寫新路由測試（先失敗）**

```ts
// server/src/__tests__/optionsRestDaysRoute.test.ts
// 休息日改成單筆 API：每次只改一筆、回傳完整清單，別的分頁開著舊設定頁也蓋不掉。
// 用記憶體 prisma stub：沒有獨立測試庫，絕不能打真的 DB。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

const { state, upsert, auditSpy } = vi.hoisted(() => ({
  state: { stored: [] as unknown },
  upsert: vi.fn(),
  auditSpy: vi.fn(),
}))

vi.mock('../lib/db.js', () => {
  const tx = {
    restDaysConfig: {
      findUnique: async () => ({ id: 1, weekends: true, specificDates: state.stored }),
      upsert: async (args: { update: { specificDates: string[] } }) => {
        upsert(args)
        state.stored = args.update.specificDates
      },
    },
  }
  return {
    prisma: {
      ...tx,
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      user: { findUnique: async () => ({ username: 'boss', displayName: 'Boss' }) },
    },
  }
})
vi.mock('../lib/storage.js', () => ({ appendAudit: auditSpy }))

import optionsRouter from '../routes/options.js'

function app(role: string) {
  const a = express()
  a.use(express.json())
  a.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = { sessionId: 's1', username: 'boss', role } as unknown as Request['session']
    next()
  })
  a.use('/api/options', optionsRouter)
  return a
}

beforeEach(() => {
  state.stored = ['2026/10/26']
  upsert.mockReset()
  auditSpy.mockReset()
})

describe('POST /api/options/rest-days', () => {
  it('新增一筆並回傳排序後的完整清單、記稽核', async () => {
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/10/09' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ weekends: true, specificDates: ['2026/10/09', '2026/10/26'] })
    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays', ['新增 2026/10/09'])
  })

  it('也接受 YYYY-MM-DD，存成斜線', async () => {
    const res = await request(app('super_admin')).post('/api/options/rest-days').send({ date: '2026-12-25' })

    expect(res.body.specificDates).toEqual(['2026/10/26', '2026/12/25'])
  })

  it('已存在的日期：200、不寫入、不記稽核', async () => {
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/10/26' })

    expect(res.status).toBe(200)
    expect(res.body.specificDates).toEqual(['2026/10/26'])
    expect(upsert).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('日期不合法：400、不寫入', async () => {
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/02/30' })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('既有清單有不合法的日期：422 列出它、不寫入', async () => {
    state.stored = ['2026/10/26', '2026/13/01']
    const res = await request(app('admin')).post('/api/options/rest-days').send({ date: '2026/10/09' })

    expect(res.status).toBe(422)
    expect(res.body.message).toContain('2026/13/01')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('測試人員（user）403', async () => {
    const res = await request(app('user')).post('/api/options/rest-days').send({ date: '2026/10/09' })

    expect(res.status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/options/rest-days/:date', () => {
  it('刪除一筆並記稽核', async () => {
    const res = await request(app('admin')).delete('/api/options/rest-days/2026-10-26')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ weekends: true, specificDates: [] })
    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays', ['刪除 2026/10/26'])
  })

  it('不存在的日期：200、不寫入、不記稽核', async () => {
    const res = await request(app('admin')).delete('/api/options/rest-days/2026-10-09')

    expect(res.status).toBe(200)
    expect(res.body.specificDates).toEqual(['2026/10/26'])
    expect(upsert).not.toHaveBeenCalled()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('日期不合法：400', async () => {
    const res = await request(app('admin')).delete('/api/options/rest-days/not-a-date')

    expect(res.status).toBe(400)
  })

  it('測試人員（user）403', async () => {
    const res = await request(app('user')).delete('/api/options/rest-days/2026-10-26')

    expect(res.status).toBe(403)
  })
})

describe('PUT /api/options 權限', () => {
  it('測試人員（user）403，不碰資料庫', async () => {
    const res = await request(app('user')).put('/api/options')
      .send({ categories: [], testUnits: [], devices: [], restDays: { weekends: true, specificDates: [] } })

    expect(res.status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 改 `optionsPutVauth.test.ts`**

把
```ts
    // 寫入時正規化成 YYYY/MM/DD，週末開關固定 true（規格 2026-10-05-unified-holiday-list-design）
    expect(fake.state.restDays).toMatchObject({ weekends: true, specificDates: ['2026/10/10'] })
```
換成
```ts
    // PUT 不再寫休息日（規格 2026-10-05-rest-days-hardening）：body 帶的 2026-10-10 不得寫入
    expect(fake.state.restDays).toEqual({ id: 1, weekends: true, specificDates: [] })
```

把整個 `it('特定休息日有不合法的日期時整份拒絕，資料庫不動', ...)` 換成：
```ts
  it('body 帶不合法的休息日也照常儲存其他設定，休息日清單不動', async () => {
    process.env.AUTH_PROVIDER = 'vauth'
    const fake = makeFakePrisma()
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options')
      .send({ ...staleBody, restDays: { weekends: false, specificDates: ['2026/02/30'] } })

    expect(res.status).toBe(200)
    expect(fake.state.restDays).toEqual({ id: 1, weekends: true, specificDates: [] })
    expect(res.body.restDays).toEqual({ weekends: true, specificDates: [] })
  })
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/optionsRestDaysRoute.test.ts server/src/__tests__/optionsPutVauth.test.ts`
Expected: FAIL（新路由 404；`user` 角色 PUT 還能通過；PUT 還在寫休息日）

- [ ] **Step 4: 改 `options.ts` 的 import 與 PUT**

import 區：
- `import { Router } from 'express'` → `import { Router, type Request, type Response } from 'express'`
- 刪 `import { normalizeRestDatesForWrite } from '../lib/holidays.js'`
- 加：
```ts
import { requireAdmin } from '../middleware/requireAdmin.js'
import { toIsoHoliday } from '../lib/holidays.js'
import { updateRestDates, InvalidStoredHolidaysError } from '../lib/restDaysStore.js'
```

`putOptionsVauth` 裡刪除：
```ts
    await tx.restDaysConfig.upsert({
      where: { id: 1 },
      create: { id: 1, weekends: body.restDays.weekends, specificDates: body.restDays.specificDates },
      update: { weekends: body.restDays.weekends, specificDates: body.restDays.specificDates },
    })
```

`router.put('/', async (req, res) => {` 改成 `router.put('/', requireAdmin, async (req, res) => {`，並刪除緊接在 `const body = req.body as OptionsMap` 之後的整段：
```ts
  // 特定休息日是全平台唯一的假日清單（VTMS 通知、負載圖、MCP 都讀它），寫進去前先驗。
  // 週六日一律休息，weekends 只為相容保留，固定寫 true。
  const restDates = normalizeRestDatesForWrite(body.restDays?.specificDates)
  if (!restDates.ok) {
    res.status(400).json({ ok: false, message: `特定休息日格式不正確：${restDates.bad.join('、')}（請用 YYYY/MM/DD）` })
    return
  }
  body.restDays = { weekends: true, specificDates: restDates.dates }
```
換成：
```ts
  // body.restDays 一律忽略：休息日只能透過 /rest-days 單筆寫入。設定頁會把載入時的舊快照
  // 整份送回來，照寫就會把別人剛改的日期蓋掉（規格 2026-10-05-rest-days-hardening）。
```

local 分支交易裡刪除：
```ts
      // Upsert restDaysConfig singleton
      await tx.restDaysConfig.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          weekends: body.restDays.weekends,
          specificDates: body.restDays.specificDates,
        },
        update: {
          weekends: body.restDays.weekends,
          specificDates: body.restDays.specificDates,
        },
      })
```

local 分支最後的
```ts
  res.json(body)
})
```
換成
```ts
  // 休息日回資料庫的值，不是 body 的舊快照：前端用回應覆蓋 store，舊分頁存一次就同步了
  res.json({ ...body, restDays: (await readOptions()).restDays })
})
```

- [ ] **Step 5: 在 `options.ts` 加單筆 API**

在 `// POST /api/options/devices` 那段之前加：
```ts
// ── 休息日：單筆寫入（Admin / Super Admin），回傳寫入後的完整清單 ─────────
async function auditRestDays(req: Request, fields: string[]): Promise<void> {
  const username = req.session.username ?? 'unknown'
  const dbUser = await prisma.user.findUnique({ where: { username } })
  await appendAudit(username, dbUser?.displayName ?? username, 'UPDATE_SETTINGS', 'restDays', fields)
}

async function changeRestDay(req: Request, res: Response, rawDate: unknown, op: 'add' | 'remove'): Promise<void> {
  const iso = typeof rawDate === 'string' ? toIsoHoliday(rawDate) : null
  if (!iso) {
    res.status(400).json({ ok: false, message: '日期格式不正確（請用 YYYY/MM/DD）' })
    return
  }
  const date = iso.replace(/-/g, '/')
  try {
    const { before, after } = await updateRestDates(dates =>
      op === 'add' ? [...dates, date] : dates.filter(d => d !== date))
    if (after.length !== before.length) {
      await auditRestDays(req, [`${op === 'add' ? '新增' : '刪除'} ${date}`])
    }
    res.json({ weekends: true, specificDates: after })
  } catch (err) {
    if (err instanceof InvalidStoredHolidaysError) {
      res.status(422).json({ ok: false, message: `${err.message}。這些日期只可能是直接改資料庫寫進去的，請由系統管理員修正資料庫。` })
      return
    }
    throw err
  }
}

// POST /api/options/rest-days — body { date: 'YYYY/MM/DD' | 'YYYY-MM-DD' }
router.post('/rest-days', requireAdmin, async (req, res) => {
  await changeRestDay(req, res, (req.body as { date?: unknown } | undefined)?.date, 'add')
})

// DELETE /api/options/rest-days/:date — 路徑用 YYYY-MM-DD（不能有斜線）
router.delete('/rest-days/:date', requireAdmin, async (req, res) => {
  await changeRestDay(req, res, String(req.params.date), 'remove')
})
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/optionsRestDaysRoute.test.ts server/src/__tests__/optionsPutVauth.test.ts server/src/__tests__/optionsPutEngineerGuard.test.ts server/src/__tests__/optionsDepartment.test.ts server/src/__tests__/optionsRoundTrip.test.ts`
Expected: PASS

- [ ] **Step 7: 後端全部測試與型別檢查**

Run: `npm run test:server && npx tsc -p server/tsconfig.json --noEmit`
Expected: 0 failed、無型別錯誤

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/options.ts server/src/__tests__/optionsRestDaysRoute.test.ts server/src/__tests__/optionsPutVauth.test.ts
git commit -m "feat(options): single-entry rest-day API; PUT requires admin and no longer writes rest days"
```

---

### Task 3: 匯入加權限、走共用寫入、記稽核

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\routes\calendar.ts`
- Modify: `F:\vsms\vsms-export\server\src\__tests__\calendarImportRoute.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `updateRestDates`、`InvalidStoredHolidaysError`。
- Produces（HTTP，回應格式不變）：成功 `{ ok: true, year, detected, added, skipped, specificDates }`；未登入 401；非系統管理員 403。

- [ ] **Step 1: 改測試**

檔頭的 db mock：
```ts
vi.mock('../lib/db.js', () => {
  const tx = { restDaysConfig: { findUnique: restFindUnique, upsert: restUpsert } }
  return { prisma: { ...tx, $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) } }
})
```
換成
```ts
vi.mock('../lib/db.js', () => {
  const tx = { restDaysConfig: { findUnique: restFindUnique, upsert: restUpsert } }
  return {
    prisma: {
      ...tx,
      $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      user: { findUnique: async () => ({ username: 'boss', displayName: 'Boss' }) },
    },
  }
})
vi.mock('../lib/storage.js', () => ({ appendAudit: auditSpy }))
```
並把 `vi.hoisted` 那行改成也產生 `auditSpy`：
```ts
const { restFindUnique, restUpsert, auditSpy } = vi.hoisted(() => ({
  restFindUnique: vi.fn(),
  restUpsert: vi.fn(),
  auditSpy: vi.fn(),
}))
```
（若現有 hoisted 的寫法不同，保留原本兩個 spy，再加 `auditSpy: vi.fn()`。）

`app()` 換成可指定 session：
```ts
import type { Request, Response, NextFunction } from 'express'

function app(role: string | null = 'super_admin') {
  const a = express()
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (role) req.session = { sessionId: 's1', username: 'boss', role } as unknown as Request['session']
    else req.session = {} as unknown as Request['session']
    next()
  })
  a.use('/api/calendar', calendarRouter)
  return a
}
```

`beforeEach` 加 `auditSpy.mockReset()`。

在「正常的日曆併進休息日清單，回傳完整清單」測試最後加：
```ts
    // multer 把檔名當 latin1 解；稽核要存轉回 UTF-8 的中文檔名
    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays',
      ['匯入 115年辦公日曆表.xlsx', '2026 年', '新增 8 筆'])
```

在「某個月平日假日多得不合理時整份拒絕」測試最後加：
```ts
    expect(auditSpy).not.toHaveBeenCalled()
```

在 `describe('POST /api/calendar/import-government', ...)` 內加：
```ts
  it('未登入 401，不寫入', async () => {
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])
    const res = await request(app(null))
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(401)
    expect(restUpsert).not.toHaveBeenCalled()
  })

  it('部級主管（admin）403：匯入只限系統管理員', async () => {
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])
    const res = await request(app('admin'))
      .post('/api/calendar/import-government')
      .attach('file', file, '115年辦公日曆表.xlsx')

    expect(res.status).toBe(403)
    expect(restUpsert).not.toHaveBeenCalled()
  })

  it('沒有新增任何日期也記一筆匯入稽核', async () => {
    restFindUnique.mockResolvedValue({ id: 1, weekends: true, specificDates: ['2026/10/09', '2026/10/26'] })
    const file = await buildCalendar(2026, [{ month: 10, extraFilled: [9, 26] }])

    await request(app()).post('/api/calendar/import-government').attach('file', file, 'a.xlsx')

    expect(auditSpy).toHaveBeenCalledWith('boss', 'Boss', 'UPDATE_SETTINGS', 'restDays', ['匯入 a.xlsx', '2026 年', '新增 0 筆'])
  })
```

既有的 404 測試（舊 GET 已移除）改成用 `app()`（super_admin），斷言仍是 404。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/calendarImportRoute.test.ts`
Expected: FAIL（未登入與 admin 仍能匯入；沒有稽核呼叫）

- [ ] **Step 3: 改 `calendar.ts`**

import 區：
- 刪 `import { normalizeRestDatesForWrite } from '../lib/holidays.js'`
- 加：
```ts
import { appendAudit } from '../lib/storage.js'
import { requireAuth, requireSuperAdmin } from '../middleware/requireAuth.js'
import { updateRestDates, InvalidStoredHolidaysError } from '../lib/restDaysStore.js'
```

刪除檔案裡的 `class InvalidStoredHolidaysError …` 與 `function readStoredRestDates …`（含上方註解）。

在 `const router = Router()` 下一行加：
```ts
// 匯入會改全平台的假日清單（VSMS、VTMS、MCP 共用），只限系統管理員；畫面上這塊本來就標「SA」
router.use(requireAuth, requireSuperAdmin)
```

把 handler 裡從
```ts
      const incoming = parsed.nonWeekendHolidays.map(d => d.replace(/-/g, '/'))
      const merged = await prisma.$transaction(async tx => {
```
到成功回應 `return res.json({ ... })` 結束為止整段換成：
```ts
      const incoming = parsed.nonWeekendHolidays.map(d => d.replace(/-/g, '/'))
      const { before, after } = await updateRestDates(dates => [...dates, ...incoming])
      const added = after.length - before.length

      // multer 把檔名當 latin1 解，中文會變亂碼（2026-04 存進 calendar_config 的檔名就是）
      const fileName = Buffer.from(f.originalname, 'latin1').toString('utf8')
      const username = req.session.username ?? 'unknown'
      const dbUser = await prisma.user.findUnique({ where: { username } })
      await appendAudit(username, dbUser?.displayName ?? username, 'UPDATE_SETTINGS', 'restDays',
        [`匯入 ${fileName}`, `${parsed.year} 年`, `新增 ${added} 筆`])

      return res.json({
        ok: true,
        year: parsed.year,
        detected: incoming.length,
        added,
        skipped: incoming.length - added,
        specificDates: after,
      })
```
保留上方「併進全平台唯一的休息日清單…只新增不刪除…」那段註解；catch 區塊不變（`InvalidStoredHolidaysError` 現在從 `restDaysStore.js` 匯入）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/calendarImportRoute.test.ts`
Expected: PASS（既有 11 tests＋新增 3 tests）。若中文檔名斷言失敗，先印出 `f.originalname` 的實際值確認 supertest 送出的編碼，再判斷是測試還是解碼的問題；不要把斷言改成亂碼。

- [ ] **Step 5: 後端全部測試與型別檢查**

Run: `npm run test:server && npx tsc -p server/tsconfig.json --noEmit`
Expected: 0 failed、無型別錯誤

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/calendar.ts server/src/__tests__/calendarImportRoute.test.ts
git commit -m "fix(calendar): import requires super admin, writes through restDaysStore and is audited"
```

---

### Task 4: 前端改用單筆 API、匯入帶 session header

**Files:**
- Modify: `F:\vsms\vsms-export\src\lib\api.ts`
- Modify: `F:\vsms\vsms-export\src\store\optionsStore.ts`
- Modify: `F:\vsms\vsms-export\src\components\settings\RestDaysManager.tsx`
- Modify: `F:\vsms\vsms-export\src\components\settings\CalendarImport.tsx`
- Modify: `F:\vsms\vsms-export\src\__tests__\calendarImport-store.test.tsx`
- Test: `F:\vsms\vsms-export\src\__tests__\restDaysManager.test.tsx`（新）

**Interfaces:**
- Consumes（HTTP，Task 2）：`POST /api/options/rest-days` `{ date }`、`DELETE /api/options/rest-days/:date`（`YYYY-MM-DD`）→ `{ weekends: true, specificDates }`；錯誤時 `{ ok: false, message }`。
- Produces：`api.addRestDay(date: string): Promise<RestDaysConfig>`、`api.removeRestDay(date: string): Promise<RestDaysConfig>`；store `addRestDay(date)`、`removeRestDay(date)`（`setRestDays` 移除）。

- [ ] **Step 1: 寫失敗的測試**

```tsx
// src/__tests__/restDaysManager.test.tsx
// 休息日改成單筆 API：刪除只發一個 DELETE、用回應更新清單；失敗時顯示訊息、清單不變。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestDaysManager } from '../components/settings/RestDaysManager'
import { useOptionsStore } from '../store/optionsStore'
import { DEFAULT_OPTIONS } from '../constants'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  useOptionsStore.setState({
    options: { ...DEFAULT_OPTIONS, restDays: { weekends: true, specificDates: ['2026/10/09', '2026/10/26'] } },
  })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('RestDaysManager', () => {
  it('刪除只發一個 DELETE，並用回應更新清單', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => json({ weekends: true, specificDates: ['2026/10/26'] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<RestDaysManager />)
    await userEvent.click(screen.getAllByRole('button', { name: /刪除/ })[0])

    await waitFor(() => expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/10/26']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/options/rest-days/2026-10-09')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('失敗時顯示伺服器訊息，清單不變', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, message: '權限不足' }, 403)))

    render(<RestDaysManager />)
    await userEvent.click(screen.getAllByRole('button', { name: /刪除/ })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('權限不足')
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/10/09', '2026/10/26'])
  })

  it('不再有週末開關的整份存檔：store 沒有 setRestDays', () => {
    expect('setRestDays' in useOptionsStore.getState()).toBe(false)
  })
})

describe('optionsStore.addRestDay', () => {
  it('發一個 POST 帶 { date }，用回應更新 store', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      json({ weekends: true, specificDates: ['2026/10/09', '2026/10/26', '2026/12/25'] }))
    vi.stubGlobal('fetch', fetchMock)

    await useOptionsStore.getState().addRestDay('2026/12/25')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/api/options/rest-days')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ date: '2026/12/25' })
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/10/09', '2026/10/26', '2026/12/25'])
  })
})
```

在 `src/__tests__/calendarImport-store.test.tsx` 的 `describe('CalendarImport', ...)` 內加：
```tsx
  it('sessionStorage 有 session token 時，上傳要帶 X-Vsms-Session', async () => {
    sessionStorage.setItem('vsms-session-token', 'tok-123')
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({
      ok: true, year: 2026, detected: 0, added: 0, skipped: 0, specificDates: ['2026/01/01'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<CalendarImport />)
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'a.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /匯入/ }))
    await screen.findByText('匯入成功（2026 年）')

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['X-Vsms-Session']).toBe('tok-123')
    expect(init.credentials).toBe('include')
    sessionStorage.removeItem('vsms-session-token')
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd F:/vsms/vsms-export && npx vitest run src/__tests__/restDaysManager.test.tsx src/__tests__/calendarImport-store.test.tsx`
Expected: FAIL（刪除走整份 PUT；store 還有 `setRestDays`、沒有 `addRestDay`；匯入沒帶 header）

- [ ] **Step 3: `api.ts`**

型別 import 加 `RestDaysConfig`：
```ts
import type {
  Schedule, ScheduleCreateInput, OptionsMap, Option, User, AuditLog, VtmsProgress, VtmsProjectCheck,
  NotifyConfig, NotifyRule, NotifyLog, NotifyPreview, NotifyRunResult, FallbackRecipient,
  WorkloadResponse, RestDaysConfig,
} from '../types'
```

在 `updateOptions` 那行之後加：
```ts
  // ── 休息日（單筆寫入，回傳完整清單；PUT /options 不再寫休息日）──
  addRestDay: (date: string) =>
    req<RestDaysConfig>('POST', '/options/rest-days', { date }),
  removeRestDay: (date: string) =>
    req<RestDaysConfig>('DELETE', `/options/rest-days/${date.replace(/\//g, '-')}`),
```

- [ ] **Step 4: `optionsStore.ts`**

`interface OptionsState` 裡刪除 `setRestDays: (config: RestDaysConfig) => Promise<void>`，在 `applyRestDays` 那行之前加：
```ts
  /** 新增／刪除一個休息日：伺服器單筆寫入並回傳完整清單（規格 2026-10-05-rest-days-hardening） */
  addRestDay: (date: string) => Promise<void>
  removeRestDay: (date: string) => Promise<void>
```

實作區刪除整個 `setRestDays: async (config) => { ... },`，在 `applyRestDays` 之前加：
```ts
  addRestDay: async (date) => {
    get().applyRestDays(await api.addRestDay(date))
  },

  removeRestDay: async (date) => {
    get().applyRestDays(await api.removeRestDay(date))
  },
```

- [ ] **Step 5: `RestDaysManager.tsx`**

整檔換成：
```tsx
import { useState } from 'react'
import DatePicker from 'react-datepicker'
import { useOptionsStore } from '../../store/optionsStore'
import { displayYmd } from '../../lib/dateFormat'

function ymd(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}

export function RestDaysManager() {
  const { options, addRestDay, removeRestDay } = useOptionsStore()
  const dates = options.restDays?.specificDates ?? []
  const [newDate, setNewDate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 每次只改一筆、由伺服器回傳完整清單：別的分頁開著舊的設定頁也蓋不掉這份清單
  const run = async (op: () => Promise<void>): Promise<boolean> => {
    setError(null)
    try {
      await op()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗')
      return false
    }
  }

  const handleAdd = async () => {
    if (!newDate) return
    const v = ymd(newDate)
    if (dates.includes(v)) return
    if (await run(() => addRestDay(v))) setNewDate(null)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">休息日設定</h3>
      <p className="text-xs text-gray-500 mb-4">
        週六、週日固定休息。下方清單供 VSMS、VTMS、MCP 共用，新增或刪除立即全平台生效。
      </p>
      <p className="text-xs font-medium text-gray-600 mb-2">特定休息日（例：國定假日）</p>
      <div className="flex gap-2 mb-3">
        <DatePicker selected={newDate} onChange={(d: Date | null) => setNewDate(d)}
          dateFormat="yyyy/MM/dd" placeholderText="選擇日期"
          className="text-sm border border-gray-300 rounded px-2 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" onClick={handleAdd} disabled={!newDate}
          className="px-3 py-1.5 text-sm bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-40">
          ＋ 新增
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 mb-2">{error}</p>}
      {dates.length === 0 ? (
        <p className="text-xs text-gray-400">尚無特定休息日</p>
      ) : (
        <ul className="space-y-1">
          {dates.map(v => (
            <li key={v} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
              <span>{displayYmd(v)}</span>
              <button type="button" onClick={() => { void run(() => removeRestDay(v)) }}
                className="text-gray-400 hover:text-red-500 text-xs">× 刪除</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```
（說明文字那段 `<p>` 與現在檔案裡的內容相同，若有出入以現有檔案為準。）

- [ ] **Step 6: `CalendarImport.tsx` 帶 session header**

把
```ts
      const resp = await fetch(withBase('/api/calendar/import-government'), {
        method: 'POST',
        body: fd,
      })
```
換成
```ts
      // 跟 api.ts 的 req() 一樣帶 session：匯入現在要求系統管理員登入（規格 2026-10-05-rest-days-hardening）
      const token = sessionStorage.getItem('vsms-session-token')
      const resp = await fetch(withBase('/api/calendar/import-government'), {
        method: 'POST',
        body: fd,
        headers: token ? { 'X-Vsms-Session': token } : {},
        credentials: 'include',
      })
```

- [ ] **Step 7: 跑測試與型別檢查**

Run: `npx vitest run src/__tests__/restDaysManager.test.tsx src/__tests__/calendarImport-store.test.tsx && npm test && npx tsc --noEmit -p tsconfig.app.json && npx tsc -p server/tsconfig.json --noEmit`
Expected: 新測試全過；`npm test` 除 `topbar.test.tsx` 的既有失敗外沒有新的失敗；型別無錯誤。

- [ ] **Step 8: Commit**

```bash
git add src/lib/api.ts src/store/optionsStore.ts src/components/settings/RestDaysManager.tsx src/components/settings/CalendarImport.tsx src/__tests__/restDaysManager.test.tsx src/__tests__/calendarImport-store.test.tsx
git commit -m "feat(settings): rest days use the single-entry API; calendar upload sends the session header"
```

---

### Task 5: 使用說明

**Files:**
- Modify: `F:\vportal\docs\guides\vsms\role-admin.md`

- [ ] **Step 1: 補稽核說明**

在「## 假日行事曆」一節，把
```markdown
「特定休息日」是全平台唯一的假日清單：VSMS 的甘特圖、預告通知、負載分布，VTMS 的異常通知，以及小P+ 查詢都依它判斷哪天是工作日。週六、週日固定休息，不必列入。新增或刪除一筆日期，立即全平台生效。
```
換成
```markdown
「特定休息日」是全平台唯一的假日清單：VSMS 的甘特圖、預告通知、負載分布，VTMS 的異常通知，以及小P+ 查詢都依它判斷哪天是工作日。週六、週日固定休息，不必列入。新增或刪除一筆日期，立即全平台生效。

匯入與每一次新增、刪除休息日都會記在[審計紀錄](audit)，對象是 `restDays`，例如「匯入 115年辦公日曆表.xlsx、2026 年、新增 2 筆」。
```

- [ ] **Step 2: 檢查並 commit**

Run: `cd F:/vportal && npm run check:guide`
Expected: `0 個錯誤、0 個警告`

```bash
git add docs/guides/vsms/role-admin.md
git commit -m "docs(guide/vsms): rest-day imports and edits are in the audit log"
```

---

### Task 6: 部署（controller 執行）

**Files:** 無程式碼變動。

- [ ] **Step 1: 全部驗證**

Run: `cd F:/vsms/vsms-export && npm run test:server && npm test && npx tsc -p server/tsconfig.json --noEmit && npx tsc --noEmit -p tsconfig.app.json`
Expected: 後端 0 failed；前端只有 `topbar.test.tsx` 既有失敗（若另一個工作階段已修好就是 0）；型別無錯誤。

- [ ] **Step 2: 確認時間（避開 08:00 前後）後部署，先 server 後前端**

```bash
cd F:/vsms/vsms-export
cp -r server/dist server/dist.stable-20261005-pre-rest-days-hardening
cp -r dist dist.stable-20261005-pre-rest-days-hardening
npx tsc -p server/tsconfig.json
grep -c "updateRestDates" server/dist/src/routes/calendar.js
pm2 restart vsms
npx vite build
```

- [ ] **Step 3: 上線驗證（不需登入的部分）**

```bash
curl -sk https://172.16.204.69/vsms/api/health
curl -sk -o /dev/null -w "%{http_code}\n" -X POST https://localhost:3001/api/calendar/import-government
curl -sk -o /dev/null -w "%{http_code}\n" -X PUT -H "Content-Type: application/json" -d "{}" https://localhost:3001/api/options
curl -sk -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{\"date\":\"2026/10/09\"}" https://localhost:3001/api/options/rest-days
```
Expected: health ok；三個寫入請求都是 `401`（之前匯入是 400，代表進得到 handler）。再確認 `rest_days_config.specificDates` 仍是 16 筆、內容未變。

- [ ] **Step 4: 需要登入的驗證交給使用者**

請系統管理員在設定頁新增、刪除一筆測試日期（例如 2027/01/01 再刪掉），確認：清單即時更新；審計紀錄出現兩筆 `restDays [新增 2027/01/01]`、`restDays [刪除 2027/01/01]`；部級主管帳號看不到匯入區塊、但能新增刪除。
