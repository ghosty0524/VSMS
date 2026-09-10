# 組織層級：部與課（B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `test_units` 多一個可為空的 `department` 標籤；人員頁改成「部 → 課」分組，同一部門內跨課的人上浮到部級只列一次；admin 的管轄單位可以勾整個部門，存值仍是葉單位。

**Architecture:** 後端只做兩件事——`GET /api/options` 多回 `department`，`PUT /api/options` 接受它且「body 沒帶鍵時保留舊值」（全刪重建前先讀舊值）。前端純函式 `groupByDepartment`（分組與部級上浮）與 `allowedUnitsExpand`（部門勾選展開）各自可測；`PeopleManager` 與 `PersonFormModal` 只換渲染，A 的列樣式與表單不動。排程、名冊、C# 名冊、篩選、統計全部維持以葉單位為準。

**Tech Stack:** Express 5 + Prisma 7（MariaDB adapter）、vitest/supertest（server）、React 19 + Zustand + Tailwind v4、vitest（jsdom）。

## Global Constraints

- **設計文件**：`docs/superpowers/specs/2026-09-10-org-hierarchy-design.md`。有衝突以設計文件為準。
- **語意**：`department` 為 NULL 代表「這個單位自己就是一個部」。部級上浮規則：同一部門內出現在 >1 個課的人列在部級，不在各課重複；跨兩個部門的人在兩個部各列一次。
- **只加欄位、不動其他**：`engineers` 表、`schedules.testUnit`、`/api/integration/*`、甘特圖工具列、篩選列、排程表單、Excel 匯入匯出、統計頁一律不動。
- **相容**：舊前端的 `PUT /api/options` 不帶 `department` 鍵 → 後端視為「不變」而非清空。新前端配舊後端：`department` 為 undefined → 每單位自成一部。
- **`allowedUnits` 儲存格式不變**（葉單位 label 陣列），後端零改動。
- **schema 變更只能用 `npx prisma db execute --stdin`（一次一條 SQL），絕不執行 `prisma migrate dev`**（會要求 reset）。ALTER 在部署 task 才執行，開發期間不碰正式 DB。
- **測試絕不打真 DB**：server 測試一律 mock `../lib/db.js`（比照 `optionsPutEngineerGuard.test.ts`）。
- **ESM import 帶 `.js`**（server）。
- **不得執行 `npm run build` / `npx vite build`**；不得動 port 3001；部署是使用者決定後的最後一個 task。
- **型別檢查**：前端 `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` 維持 `8`；server `npx tsc -p server/tsconfig.json --noEmit` 乾淨。
- **測試指令**：前端 `npx vitest run`（目前 246）；server `npx vitest run --config server/vitest.config.ts`（目前 285＋別人未提交的那支）。
- **commit 訊息英文**，結尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`，commit 到 `feat/guest-role-and-uiux`。
- **工作區有別人未提交的 `server/src/routes/auth.ts`、`server/src/lib/crypto.ts`、`server/src/__tests__/loginPasswordValidation.test.ts` 與 `.env.bak-20260827`、`_dev-*`，任何 commit 都不得 stage 它們**——`git add` 一律指定路徑。
- 專案根目錄 `F:\vsms\vsms-export`，指令一律絕對路徑。

---

### Task 1: 後端 `department` 欄位——schema、mapping、GET 回傳、PUT 保留

**Files:**
- Modify: `prisma/schema.prisma`（`model TestUnit` 加一行）
- Modify: `server/src/types.ts:51-54`（`TestUnitOption` 加 `department?: string | null`）
- Modify: `server/src/routes/optionsMapping.ts`（`TestUnitRow`、`toTestUnitResponse`、`toTestUnitCreateData`）
- Modify: `server/src/routes/options.ts:54-106`（交易內先讀舊 department）
- Test: `server/src/__tests__/optionsDepartment.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // optionsMapping.ts
  export function normalizeDepartment(value: unknown): string | null   // trim 後空字串 → null；非字串 → null
  export function toTestUnitCreateData(u: TestUnitOption, fallbackDepartment: string | null)
  // 規則：'department' in u → normalizeDepartment(u.department)；否則 fallbackDepartment
  ```
- `GET /api/options` 的 `testUnits[i].department: string | null`。

- [ ] **Step 1: 寫失敗的測試**

寫入 `server/src/__tests__/optionsDepartment.test.ts`：

```ts
// server/src/__tests__/optionsDepartment.test.ts
// test_units.department 是 additive 欄位。PUT /api/options 是全刪重建，所以
// 「body 沒帶 department 鍵」必須被當成不變而不是清空——舊前端不會帶這個鍵。
// prisma 全部 stub（正式 DATABASE_URL 指到唯一一份 vsms 資料庫）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

interface UnitRow { id: string; value: string; label: string; isActive: boolean; sortOrder: number; color: string | null; department: string | null; engineers: unknown[] }
interface State { units: UnitRow[]; created: Record<string, unknown>[] }

function makeTx(state: State) {
  return {
    engineer: { findMany: async () => [], deleteMany: async () => {} },
    schedule: { findMany: async () => [] },
    testUnit: {
      findMany: async () => state.units,
      deleteMany: async () => { state.units = [] },
      create: async ({ data }: { data: Record<string, unknown> & { engineers?: { create: unknown[] } } }) => {
        const { engineers, ...unit } = data
        state.created.push(unit)
        state.units.push({ ...(unit as Omit<UnitRow, 'engineers'>), engineers: engineers?.create ?? [] })
        return unit
      },
    },
    category: { deleteMany: async () => {}, createMany: async () => {} },
    restDaysConfig: {
      findUnique: async () => ({ id: 1, weekends: true, specificDates: [] }),
      upsert: async () => ({}),
    },
    device: { findMany: async () => [] },
  }
}

function makePrisma(units: UnitRow[]) {
  const state: State = { units, created: [] }
  const prisma = {
    ...makeTx(state),
    $transaction: async (cb: (tx: ReturnType<typeof makeTx>) => Promise<void>) => cb(makeTx(state)),
    user: { findUnique: async () => ({ username: 'tester', displayName: 'Tester' }) },
    auditLog: { create: async () => {} },
  }
  return { prisma, state }
}

let currentPrisma: ReturnType<typeof makePrisma>['prisma']
vi.mock('../lib/db.js', () => ({ get prisma() { return currentPrisma } }))

async function buildApp() {
  const { default: optionsRouter } = await import('../routes/options.js')
  const app = express()
  app.use(express.json())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = { sessionId: 's1', username: 'tester', role: 'super_admin' } as unknown as Request['session']
    next()
  })
  app.use('/api/options', optionsRouter)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : 'error' })
  })
  return app
}

const unit = (over: Partial<UnitRow>): UnitRow => ({
  id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: 'SIT', engineers: [], ...over,
})
const body = (units: Record<string, unknown>[]) => ({
  categories: [], devices: [], restDays: { weekends: true, specificDates: [] },
  testUnits: units.map(u => ({ engineers: [], ...u })),
})

beforeEach(() => { vi.resetModules() })

describe('GET /api/options — department', () => {
  it('回傳每個單位的 department（NULL 照回 null）', async () => {
    const fake = makePrisma([unit({}), unit({ id: 'u-ra', value: 'RA', label: 'RA', sortOrder: 1, department: null })])
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).get('/api/options')
    expect(res.status).toBe(200)
    expect(res.body.testUnits.map((u: { value: string; department: string | null }) => [u.value, u.department]))
      .toEqual([['SIT-HW', 'SIT'], ['RA', null]])
  })
})

describe('PUT /api/options — department', () => {
  it('body 帶 department 就寫入', async () => {
    const fake = makePrisma([unit({ department: null })])
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options')
      .send(body([{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: 'SIT' }]))
    expect(res.status).toBe(200)
    expect(fake.state.created[0]).toMatchObject({ id: 'u-hw', department: 'SIT' })
  })

  it('body 沒帶 department 鍵（舊前端）→ 保留資料庫原值', async () => {
    const fake = makePrisma([unit({ department: 'SIT' })])
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options')
      .send(body([{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null }]))
    expect(res.status).toBe(200)
    expect(fake.state.created[0]).toMatchObject({ id: 'u-hw', department: 'SIT' })
  })

  it('body 帶空字串或空白 → 存 null（清掉部門）', async () => {
    const fake = makePrisma([unit({ department: 'SIT' })])
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options')
      .send(body([{ id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: '   ' }]))
    expect(res.status).toBe(200)
    expect(fake.state.created[0]).toMatchObject({ id: 'u-hw', department: null })
  })

  it('新單位（資料庫沒有這個 id）沒帶鍵 → null', async () => {
    const fake = makePrisma([])
    currentPrisma = fake.prisma
    await request(await buildApp()).put('/api/options')
      .send(body([{ id: 'u-new', value: 'QA', label: 'QA', isActive: true, sortOrder: 0, color: null }]))
    expect(fake.state.created[0]).toMatchObject({ id: 'u-new', department: null })
  })

  it('department 會 trim', async () => {
    const fake = makePrisma([])
    currentPrisma = fake.prisma
    await request(await buildApp()).put('/api/options')
      .send(body([{ id: 'u-new', value: 'QA', label: 'QA', isActive: true, sortOrder: 0, color: null, department: ' SIT ' }]))
    expect(fake.state.created[0]).toMatchObject({ department: 'SIT' })
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/optionsDepartment.test.ts`
Expected: FAIL（GET 回傳沒有 `department`；PUT 的 created 沒有 `department`）

- [ ] **Step 3: schema 與 server 型別**

`prisma/schema.prisma` 的 `model TestUnit` 在 `color` 之後加：

```prisma
  /** 所屬部門標籤；NULL = 這個單位自己就是一個部。只給畫面分組與管轄單位選擇用。 */
  department String? @db.VarChar(100)
```

`server/src/types.ts` 的 `TestUnitOption`：

```ts
export interface TestUnitOption extends Option {
  color?: string | null
  /** 所屬部門；null = 自成一部；undefined = 呼叫端沒表態（PUT 時保留舊值） */
  department?: string | null
  engineers: EngineerOption[]
}
```

Run: `cd /f/vsms/vsms-export && npx prisma generate 2>&1 | tail -1`（只重新產生 client，不碰 DB）

- [ ] **Step 4: mapping**

`server/src/routes/optionsMapping.ts`：`TestUnitRow` 加 `department: string | null`；加：

```ts
/** trim 後空字串或非字串一律 null（清掉部門） */
export function normalizeDepartment(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v ? v : null
}
```

`toTestUnitResponse` 回傳物件加 `department: row.department ?? null,`。

`toTestUnitCreateData` 改成：

```ts
/**
 * PUT 是全刪重建：body 沒帶 department 鍵（舊前端）要保留資料庫原值，
 * 所以由路由先讀舊值當 fallback 傳進來；帶了鍵就以 body 為準（含清空）。
 */
export function toTestUnitCreateData(u: TestUnitOption, fallbackDepartment: string | null) {
  return {
    id: u.id, value: u.value, label: u.label,
    isActive: u.isActive, sortOrder: u.sortOrder,
    color: normalizeColor(u.color),
    department: 'department' in u ? normalizeDepartment(u.department) : fallbackDepartment,
  }
}
```

- [ ] **Step 5: 路由**

`server/src/routes/options.ts` 的交易內，在 `const existingEngineers = …` 之前加：

```ts
      // department 是 additive 欄位；舊前端的 body 不會帶這個鍵，全刪重建前先把
      // 舊值讀出來，讓「沒表態」等於「不變」。
      const existingUnits = await tx.testUnit.findMany({ select: { id: true, department: true } })
      const existingDepartment = new Map(existingUnits.map(u => [u.id, u.department ?? null]))
```

建立單位那段改成：

```ts
      for (const unit of body.testUnits) {
        await tx.testUnit.create({
          data: {
            ...toTestUnitCreateData(unit, existingDepartment.get(unit.id) ?? null),
            engineers: { create: unit.engineers.map(toEngineerCreateData) },
          },
        })
      }
```

- [ ] **Step 6: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/optionsDepartment.test.ts`
Expected: 6 passed

- [ ] **Step 7: server 型別檢查與全套 server 測試**

Run: `cd /f/vsms/vsms-export && npx tsc -p server/tsconfig.json --noEmit`
Expected: 無錯誤。若 `optionsPutEngineerGuard.test.ts` 的 stub 因 `testUnit.findMany` 不存在而失敗，在那支測試的 `makeTxHandle` 的 `testUnit` 加 `findMany: async () => state.testUnits,`（只補 stub，不改斷言）。

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts`
Expected: 全 PASS

- [ ] **Step 8: Commit**

```bash
cd /f/vsms/vsms-export && git add prisma/schema.prisma server/src/types.ts server/src/routes/optionsMapping.ts server/src/routes/options.ts server/src/__tests__/optionsDepartment.test.ts && git commit -m "feat(options): additive test_units.department; PUT keeps the stored value when the key is absent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

（若 Step 7 改了 `optionsPutEngineerGuard.test.ts`，一併 `git add`。）

---

### Task 2: 前端型別、store 動作、「測試單位」分頁的部門輸入

**Files:**
- Modify: `src/types.ts:54-57`（`TestUnitOption` 加 `department?: string | null`）
- Modify: `src/store/optionsStore.ts`（interface 與實作加 `setTestUnitDepartment`）
- Modify: `src/components/settings/TestUnitManager.tsx`
- Test: `src/__tests__/optionsStore-department.test.ts`

**Interfaces:**
- Produces: `setTestUnitDepartment: (id: string, department: string | null) => Promise<void>`（一次 PUT）；`TestUnitOption.department?: string | null`。

- [ ] **Step 1: 寫失敗的測試**

寫入 `src/__tests__/optionsStore-department.test.ts`：

```ts
// src/__tests__/optionsStore-department.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useOptionsStore } from '../store/optionsStore'
import type { OptionsMap } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

function baseOptions(): OptionsMap {
  return {
    categories: [], restDays: { weekends: true, specificDates: [] }, devices: [],
    testUnits: [
      { id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: null, engineers: [] },
      { id: 'u-ra', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, color: null, department: null, engineers: [] },
    ],
  }
}

function stubFetchEcho() {
  const spy = vi.fn(async (_url: string, opts: RequestInit) => {
    const body = opts.body ? JSON.parse(opts.body as string) : {}
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => { useOptionsStore.setState({ options: baseOptions() }) })

describe('setTestUnitDepartment', () => {
  it('寫入部門並只發一次 PUT，其他單位不動', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().setTestUnitDepartment('u-hw', 'SIT')
    expect(spy).toHaveBeenCalledTimes(1)
    const units = useOptionsStore.getState().options.testUnits
    expect(units.find(u => u.id === 'u-hw')!.department).toBe('SIT')
    expect(units.find(u => u.id === 'u-ra')!.department).toBeNull()
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(sent.testUnits[0].department).toBe('SIT')
  })

  it('null 清掉部門', async () => {
    useOptionsStore.setState({ options: { ...baseOptions(), testUnits: baseOptions().testUnits.map(u => ({ ...u, department: 'SIT' })) } })
    stubFetchEcho()
    await useOptionsStore.getState().setTestUnitDepartment('u-hw', null)
    expect(useOptionsStore.getState().options.testUnits.find(u => u.id === 'u-hw')!.department).toBeNull()
  })

  it('PUT 失敗時 store 不變並拋出', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'x' }), { status: 500, headers: { 'Content-Type': 'application/json' } })))
    await expect(useOptionsStore.getState().setTestUnitDepartment('u-hw', 'SIT')).rejects.toThrow()
    expect(useOptionsStore.getState().options.testUnits.find(u => u.id === 'u-hw')!.department).toBeNull()
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/optionsStore-department.test.ts`
Expected: FAIL（型別或 `setTestUnitDepartment is not a function`）

- [ ] **Step 3: 型別與 store**

`src/types.ts` 的 `TestUnitOption`：

```ts
export interface TestUnitOption extends Option {
  color?: string | null
  /** 所屬部門；null 或 undefined = 自成一部（舊後端不回這個欄位） */
  department?: string | null
  engineers: EngineerOption[]
}
```

`src/store/optionsStore.ts` interface 在 `setTestUnitColor` 之後加：

```ts
  /** 所屬部門標籤（null = 自成一部），一次 PUT */
  setTestUnitDepartment: (id: string, department: string | null) => Promise<void>
```

實作在 `setTestUnitColor` 之後加：

```ts
  setTestUnitDepartment: async (id, department) => {
    const next = {
      ...get().options,
      testUnits: get().options.testUnits.map((u) => u.id === id ? { ...u, department } : u),
    }
    await persistOptions(next)
    set({ options: next })
  },
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/optionsStore-department.test.ts`
Expected: 3 passed

- [ ] **Step 5: `TestUnitManager` 加部門輸入**

在 `src/components/settings/TestUnitManager.tsx`：
- 從 store 多取 `setTestUnitDepartment`。
- 加 state `const [draftDepts, setDraftDepts] = useState<Record<string, string>>({})`。
- 計算既有部門建議清單：`const knownDepartments = [...new Set(options.testUnits.map(u => (u.department ?? '').trim()).filter(Boolean))].sort()`。
- 在一般顯示分支（`<span className="flex-1 …">{u.label}…</span>` 之後、「編輯」按鈕之前）插入：

```tsx
                  <input
                    list="vsms-department-list"
                    className="border rounded px-2 py-1 text-xs w-32"
                    placeholder="所屬部門（空白＝自成一部）"
                    title="同部門的單位在人員頁會排在同一張卡片；空白代表這個單位自己就是一個部"
                    value={draftDepts[u.id] ?? u.department ?? ''}
                    onChange={e => setDraftDepts(d => ({ ...d, [u.id]: e.target.value }))}
                    onBlur={async () => {
                      const draft = draftDepts[u.id]
                      if (draft === undefined) return
                      const next = draft.trim() || null
                      if (next !== (u.department ?? null)) {
                        try { await setTestUnitDepartment(u.id, next) }
                        catch (err) { setDeleteErrors(d => ({ ...d, [u.id]: err instanceof Error ? err.message : String(err) })) }
                      }
                      setDraftDepts(d => { const n = { ...d }; delete n[u.id]; return n })
                    }}
                  />
```

- 在最外層 `<div>` 內（清單之前）加一次 `<datalist id="vsms-department-list">{knownDepartments.map(d => <option key={d} value={d} />)}</datalist>`。
- 標題下加說明：`<p className="text-xs text-gray-400 mb-3">「所屬部門」只影響人員頁的分組與管轄單位的勾選方式；排程、篩選與統計仍以單位為準。</p>`

- [ ] **Step 6: 型別檢查與測試**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` → `8`
Run: `cd /f/vsms/vsms-export && npx eslint src/components/settings/TestUnitManager.tsx src/store/optionsStore.ts` → 0 errors
Run: `cd /f/vsms/vsms-export && npx vitest run` → 全 PASS（246 + 3 = 249）

- [ ] **Step 7: Commit**

```bash
cd /f/vsms/vsms-export && git add src/types.ts src/store/optionsStore.ts src/components/settings/TestUnitManager.tsx src/__tests__/optionsStore-department.test.ts && git commit -m "feat(units): department label on test units, editable from the unit settings tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 純函式 `groupByDepartment`——部 → 課與部級上浮

**Files:**
- Create: `src/lib/orgGroups.ts`
- Test: `src/__tests__/orgGroups.test.ts`

**Interfaces:**
- Consumes: `Person`、`PersonGroup` from `src/lib/peopleRows.ts`；`TestUnitOption`
- Produces:
  ```ts
  export interface SectionGroup { unitId: string; unitLabel: string; people: Person[] }
  export interface DeptGroup {
    department: string        // unit.department（trim）或（NULL 時）unit.label
    isSingleLevel: boolean    // 只有一個葉單位且 department 為 NULL
    deptLevel: Person[]       // 同一部門內出現在 >1 個課的人，依第一次出現順序
    sections: SectionGroup[]  // 依單位 sortOrder；只含輸入 groups 裡有的單位
  }
  export function departmentOf(unit: Pick<TestUnitOption, 'label' | 'department'>): string
  export function groupByDepartment(groups: PersonGroup[], testUnits: TestUnitOption[]): DeptGroup[]
  ```
  `groups` 裡 `unitId === null` 的組會被忽略（呼叫端另外處理「無單位」）。部門順序 = 該部門第一個葉單位的 `sortOrder`。

- [ ] **Step 1: 寫失敗的測試**

寫入 `src/__tests__/orgGroups.test.ts`：

```ts
// src/__tests__/orgGroups.test.ts
// 部 → 課分組與部級上浮。規則：同一部門內出現在 >1 個課的人列在部級一次；
// 跨兩個部門的人在兩個部各列一次；department 為 NULL 的單位自成一部。
import { describe, it, expect } from 'vitest'
import { groupByDepartment, departmentOf } from '../lib/orgGroups'
import type { Person, PersonGroup } from '../lib/peopleRows'
import type { TestUnitOption } from '../types'

const u = (id: string, label: string, sortOrder: number, department: string | null): TestUnitOption =>
  ({ id, value: label, label, isActive: true, sortOrder, color: null, department, engineers: [] })
const p = (name: string): Person => ({ name, label: name, memberships: [], rosterActive: true, account: null })
const g = (unitId: string, unitLabel: string, names: string[]): PersonGroup => ({ unitId, unitLabel, people: names.map(p) })

const units = [u('u-hw', 'SIT-HW', 0, 'SIT'), u('u-sw', 'SIT-SW', 1, 'SIT'), u('u-ra', 'RA', 2, null), u('u-si', 'SI', 3, null)]
const groups = [
  g('u-hw', 'SIT-HW', ['Rock_Cai', 'Ericct_Hsieh']),
  g('u-sw', 'SIT-SW', ['Ericct_Hsieh', 'Nervo_Kuo', 'Will_Wang']),
  g('u-ra', 'RA', ['Will_Wang', 'Lily_Lee']),
  g('u-si', 'SI', ['Brian_Kuo']),
]

describe('departmentOf', () => {
  it('有 department 用它（trim），沒有就用單位 label', () => {
    expect(departmentOf({ label: 'SIT-HW', department: ' SIT ' })).toBe('SIT')
    expect(departmentOf({ label: 'RA', department: null })).toBe('RA')
    expect(departmentOf({ label: 'RA' })).toBe('RA')
    expect(departmentOf({ label: 'RA', department: '   ' })).toBe('RA')
  })
})

describe('groupByDepartment', () => {
  it('部門依第一個葉單位的 sortOrder 排序，SIT 兩層、RA 與 SI 單層', () => {
    const d = groupByDepartment(groups, units)
    expect(d.map(x => [x.department, x.isSingleLevel])).toEqual([['SIT', false], ['RA', true], ['SI', true]])
    expect(d[0].sections.map(s => s.unitLabel)).toEqual(['SIT-HW', 'SIT-SW'])
  })

  it('同部門跨課的人上浮到部級一次，不再在各課重複', () => {
    const sit = groupByDepartment(groups, units)[0]
    expect(sit.deptLevel.map(x => x.name)).toEqual(['Ericct_Hsieh'])
    expect(sit.sections[0].people.map(x => x.name)).toEqual(['Rock_Cai'])
    expect(sit.sections[1].people.map(x => x.name)).toEqual(['Nervo_Kuo', 'Will_Wang'])
  })

  it('跨兩個部門的人在兩個部各列一次', () => {
    const d = groupByDepartment(groups, units)
    expect(d[0].sections[1].people.some(x => x.name === 'Will_Wang')).toBe(true)
    expect(d[1].sections[0].people.some(x => x.name === 'Will_Wang')).toBe(true)
    expect(d[0].deptLevel.some(x => x.name === 'Will_Wang')).toBe(false)
  })

  it('單層部門：sections 只有一個、deptLevel 為空', () => {
    const ra = groupByDepartment(groups, units)[1]
    expect(ra.sections).toHaveLength(1)
    expect(ra.deptLevel).toEqual([])
    expect(ra.sections[0].people.map(x => x.name)).toEqual(['Will_Wang', 'Lily_Lee'])
  })

  it('department 全為 NULL（舊後端）→ 每個單位自成一部', () => {
    const flat = units.map(x => ({ ...x, department: null }))
    const d = groupByDepartment(groups, flat)
    expect(d.map(x => x.department)).toEqual(['SIT-HW', 'SIT-SW', 'RA', 'SI'])
    expect(d.every(x => x.isSingleLevel)).toBe(true)
    expect(d[1].sections[0].people.map(x => x.name)).toEqual(['Ericct_Hsieh', 'Nervo_Kuo', 'Will_Wang'])
  })

  it('輸入 groups 沒有的單位不出現（停用區塊只傳有人的組）', () => {
    const d = groupByDepartment([g('u-sw', 'SIT-SW', ['Nervo_Kuo'])], units)
    expect(d).toHaveLength(1)
    expect(d[0].department).toBe('SIT')
    expect(d[0].sections.map(s => s.unitLabel)).toEqual(['SIT-SW'])
  })

  it('unitId 為 null 的組被忽略', () => {
    const d = groupByDepartment([{ unitId: null, unitLabel: '無單位', people: [p('admin')] }, ...groups], units)
    expect(d.flatMap(x => [...x.deptLevel, ...x.sections.flatMap(s => s.people)]).some(x => x.name === 'admin')).toBe(false)
  })

  it('同一部門只有一個課有人時，那個人不上浮', () => {
    const d = groupByDepartment([g('u-hw', 'SIT-HW', ['Ericct_Hsieh'])], units)
    expect(d[0].deptLevel).toEqual([])
    expect(d[0].sections[0].people.map(x => x.name)).toEqual(['Ericct_Hsieh'])
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/orgGroups.test.ts`
Expected: FAIL，`Cannot find module '../lib/orgGroups'`

- [ ] **Step 3: 實作**

寫入 `src/lib/orgGroups.ts`：

```ts
// src/lib/orgGroups.ts
//
// 人員頁的「部 → 課」分組。「部」只是 test_units.department 這個標籤，NULL 代表
// 這個單位自己就是一個部。排程、名冊、篩選、統計全部維持以葉單位為準；這裡
// 只決定畫面怎麼排。
//
// 部級上浮規則（可測、不是猜測）：同一部門內出現在 >1 個課的人列在部級一次，
// 不再在各課重複；跨兩個部門的人在兩個部各列一次，因為那是兩個部。
import type { TestUnitOption } from '../types'
import type { Person, PersonGroup } from './peopleRows'

export interface SectionGroup { unitId: string; unitLabel: string; people: Person[] }

export interface DeptGroup {
  department: string
  /** 只有一個葉單位且 department 為 NULL：畫成一層卡片 */
  isSingleLevel: boolean
  deptLevel: Person[]
  sections: SectionGroup[]
}

export function departmentOf(unit: Pick<TestUnitOption, 'label' | 'department'>): string {
  const d = (unit.department ?? '').trim()
  return d || unit.label
}

export function groupByDepartment(groups: PersonGroup[], testUnits: TestUnitOption[]): DeptGroup[] {
  const byUnitId = new Map(groups.filter(g => g.unitId !== null).map(g => [g.unitId as string, g]))
  const sortedUnits = [...testUnits].sort((a, b) => a.sortOrder - b.sortOrder).filter(u => byUnitId.has(u.id))

  // 部門依第一個葉單位出現的順序
  const depts = new Map<string, TestUnitOption[]>()
  for (const unit of sortedUnits) {
    const key = departmentOf(unit)
    const list = depts.get(key) ?? []
    list.push(unit)
    depts.set(key, list)
  }

  const result: DeptGroup[] = []
  for (const [department, units] of depts) {
    const isSingleLevel = units.length === 1 && !(units[0].department ?? '').trim()
    // 每個人在這個部門的幾個課裡出現
    const seen = new Map<string, { person: Person; count: number }>()
    for (const unit of units) {
      for (const person of byUnitId.get(unit.id)!.people) {
        const entry = seen.get(person.name)
        if (entry) entry.count += 1
        else seen.set(person.name, { person, count: 1 })
      }
    }
    const deptLevel = [...seen.values()].filter(e => e.count > 1).map(e => e.person)
    const lifted = new Set(deptLevel.map(p => p.name))
    const sections: SectionGroup[] = units.map(unit => {
      const g = byUnitId.get(unit.id)!
      return { unitId: unit.id, unitLabel: unit.label, people: g.people.filter(p => !lifted.has(p.name)) }
    })
    result.push({ department, isSingleLevel, deptLevel, sections })
  }
  return result
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/orgGroups.test.ts`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
cd /f/vsms/vsms-export && git add src/lib/orgGroups.ts src/__tests__/orgGroups.test.ts && git commit -m "feat(people): groupByDepartment — department/section grouping with department-level lift

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 純函式 `allowedUnitsExpand`——勾整個部門、存葉單位

**Files:**
- Create: `src/lib/allowedUnitsExpand.ts`
- Test: `src/__tests__/allowedUnitsExpand.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DeptUnits { department: string; unitLabels: string[]; isSingleLevel: boolean }
  export function groupUnitLabelsByDepartment(testUnits: TestUnitOption[]): DeptUnits[]  // 只含 isActive 的單位；順序同 groupByDepartment
  export type DeptCheckState = 'all' | 'some' | 'none'
  export function deptCheckState(selected: string[], unitLabels: string[]): DeptCheckState
  export function toggleDepartment(selected: string[], unitLabels: string[]): string[]  // all → 全部移除；否則補齊
  export function toggleUnit(selected: string[], label: string): string[]
  ```

- [ ] **Step 1: 寫失敗的測試**

寫入 `src/__tests__/allowedUnitsExpand.test.ts`：

```ts
// src/__tests__/allowedUnitsExpand.test.ts
// 管轄單位選擇器可以勾整個部門，但存進 allowedUnits 的永遠是葉單位 label，
// 後端零改動。
import { describe, it, expect } from 'vitest'
import { groupUnitLabelsByDepartment, deptCheckState, toggleDepartment, toggleUnit } from '../lib/allowedUnitsExpand'
import type { TestUnitOption } from '../types'

const u = (id: string, label: string, sortOrder: number, department: string | null, isActive = true): TestUnitOption =>
  ({ id, value: label, label, isActive, sortOrder, color: null, department, engineers: [] })
const units = [u('u-hw', 'SIT-HW', 0, 'SIT'), u('u-sw', 'SIT-SW', 1, 'SIT'), u('u-ra', 'RA', 2, null), u('u-old', 'OLD', 3, null, false)]

describe('groupUnitLabelsByDepartment', () => {
  it('依部門分組、只含啟用單位、單層旗標', () => {
    expect(groupUnitLabelsByDepartment(units)).toEqual([
      { department: 'SIT', unitLabels: ['SIT-HW', 'SIT-SW'], isSingleLevel: false },
      { department: 'RA', unitLabels: ['RA'], isSingleLevel: true },
    ])
  })
})

describe('deptCheckState', () => {
  it('all / some / none', () => {
    expect(deptCheckState(['SIT-HW', 'SIT-SW'], ['SIT-HW', 'SIT-SW'])).toBe('all')
    expect(deptCheckState(['SIT-HW'], ['SIT-HW', 'SIT-SW'])).toBe('some')
    expect(deptCheckState(['RA'], ['SIT-HW', 'SIT-SW'])).toBe('none')
    expect(deptCheckState([], [])).toBe('none')
  })
})

describe('toggleDepartment', () => {
  it('未全選 → 補齊（不重複、保留其他部門）', () => {
    expect(toggleDepartment(['RA', 'SIT-HW'], ['SIT-HW', 'SIT-SW'])).toEqual(['RA', 'SIT-HW', 'SIT-SW'])
  })
  it('已全選 → 全部移除', () => {
    expect(toggleDepartment(['RA', 'SIT-HW', 'SIT-SW'], ['SIT-HW', 'SIT-SW'])).toEqual(['RA'])
  })
})

describe('toggleUnit', () => {
  it('加入與移除', () => {
    expect(toggleUnit(['RA'], 'SIT-HW')).toEqual(['RA', 'SIT-HW'])
    expect(toggleUnit(['RA', 'SIT-HW'], 'SIT-HW')).toEqual(['RA'])
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/allowedUnitsExpand.test.ts`
Expected: FAIL，`Cannot find module`

- [ ] **Step 3: 實作**

寫入 `src/lib/allowedUnitsExpand.ts`：

```ts
// src/lib/allowedUnitsExpand.ts
//
// 管轄單位（users.allowedUnits）存的是葉單位 label 陣列，後端所有判斷都是
// allowedUnits.includes(schedule.testUnit)。這裡只讓 UI 可以「勾整個部門」，
// 存值前展開成葉單位；儲存格式不變，後端零改動。
import type { TestUnitOption } from '../types'
import { departmentOf } from './orgGroups'

export interface DeptUnits { department: string; unitLabels: string[]; isSingleLevel: boolean }
export type DeptCheckState = 'all' | 'some' | 'none'

export function groupUnitLabelsByDepartment(testUnits: TestUnitOption[]): DeptUnits[] {
  const active = [...testUnits].filter(u => u.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  const map = new Map<string, TestUnitOption[]>()
  for (const unit of active) {
    const key = departmentOf(unit)
    const list = map.get(key) ?? []
    list.push(unit)
    map.set(key, list)
  }
  return [...map].map(([department, units]) => ({
    department,
    unitLabels: units.map(u => u.label),
    isSingleLevel: units.length === 1 && !(units[0].department ?? '').trim(),
  }))
}

export function deptCheckState(selected: string[], unitLabels: string[]): DeptCheckState {
  if (unitLabels.length === 0) return 'none'
  const n = unitLabels.filter(l => selected.includes(l)).length
  return n === 0 ? 'none' : n === unitLabels.length ? 'all' : 'some'
}

export function toggleDepartment(selected: string[], unitLabels: string[]): string[] {
  if (deptCheckState(selected, unitLabels) === 'all') return selected.filter(l => !unitLabels.includes(l))
  return [...selected, ...unitLabels.filter(l => !selected.includes(l))]
}

export function toggleUnit(selected: string[], label: string): string[] {
  return selected.includes(label) ? selected.filter(l => l !== label) : [...selected, label]
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/allowedUnitsExpand.test.ts`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
cd /f/vsms/vsms-export && git add src/lib/allowedUnitsExpand.ts src/__tests__/allowedUnitsExpand.test.ts && git commit -m "feat(people): department-aware allowed-units helpers that still store leaf units

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 人員頁改用部 → 課分組；管轄單位選擇器依部門

**Files:**
- Modify: `src/components/settings/PeopleManager.tsx`（`groupCard` 與啟用／停用清單的渲染）
- Modify: `src/components/settings/PersonFormModal.tsx`（`showAllowedUnits` 那段的 chip 渲染）

**Interfaces:**
- Consumes: `groupByDepartment`、`DeptGroup`、`SectionGroup`（Task 3）；`groupUnitLabelsByDepartment`、`deptCheckState`、`toggleDepartment`、`toggleUnit`（Task 4）；既有 `rows()`、`PersonGroup`、`UNASSIGNED_LABEL`。
- Produces: 無（元件內部）。

- [ ] **Step 1: `PeopleManager` 的分組渲染**

import 加 `import { groupByDepartment, type DeptGroup, type SectionGroup } from '../../lib/orgGroups'`。

保留既有的 `groupCard`（單層卡片仍用它），新增：

```tsx
  /** 課的子區塊（部門卡片內） */
  const sectionBlock = (s: SectionGroup, variant: 'active' | 'inactive') => (
    <div key={s.unitId} className="mt-3">
      <p className="text-xs font-medium text-gray-500 mb-1">{s.unitLabel}<span className="ml-2 text-gray-400">{s.people.length} 人</span></p>
      <div className="overflow-x-auto"><div className="space-y-0.5">{rows(s.people, variant)}</div></div>
      {variant === 'active' && (
        <div className="flex gap-2 mt-2">
          <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="新增人員姓名（等於未來的帳號名稱）"
            value={newNames[s.unitId] ?? ''}
            onChange={e => setNewNames(n => ({ ...n, [s.unitId]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') void handleAdd(s.unitId) }} />
          <button type="button" onClick={() => handleAdd(s.unitId)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">新增</button>
        </div>
      )}
      {addErrors[s.unitId] && <p className="text-xs text-red-500 mt-1">{addErrors[s.unitId]}</p>}
    </div>
  )

  /** 部門卡片：單層部門直接沿用 groupCard；兩層部門先列部級再列各課 */
  const deptCard = (d: DeptGroup, variant: 'active' | 'inactive') => {
    if (d.isSingleLevel) {
      const s = d.sections[0]
      return groupCard({ unitId: s.unitId, unitLabel: s.unitLabel, people: s.people }, variant)
    }
    const total = d.deptLevel.length + d.sections.reduce((n, s) => n + s.people.length, 0)
    return (
      <div key={`dept-${d.department}`} className="border rounded-lg p-3">
        <p className="font-medium text-sm text-gray-600">{d.department}<span className="ml-2 text-xs text-gray-400">{total} 人</span></p>
        {d.deptLevel.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">部級<span className="ml-2 text-gray-400">跨課，{d.deptLevel.length} 人</span></p>
            <div className="overflow-x-auto"><div className="space-y-0.5">{rows(d.deptLevel, variant)}</div></div>
          </div>
        )}
        {d.sections.map(s => sectionBlock(s, variant))}
      </div>
    )
  }
```

把啟用清單的：

```tsx
        {model.active.map(g => groupCard(g, 'active'))}
```

改成：

```tsx
        {groupByDepartment(model.active, options.testUnits).map(d => deptCard(d, 'active'))}
```

把停用區塊的：

```tsx
            : <div className="space-y-4 mt-3">{model.inactive.map(g => groupCard(g, 'inactive'))}</div>
```

改成：

```tsx
            : (
              <div className="space-y-4 mt-3">
                {groupByDepartment(model.inactive, options.testUnits).map(d => deptCard(d, 'inactive'))}
                {model.inactive.filter(g => g.unitId === null).map(g => groupCard(g, 'inactive'))}
              </div>
            )
```

- [ ] **Step 2: `PersonFormModal` 的管轄單位依部門**

import 加 `import { groupUnitLabelsByDepartment, deptCheckState, toggleDepartment, toggleUnit } from '../../lib/allowedUnitsExpand'`。

在元件內（`allUnitLabels` 附近）加 `const deptUnits = groupUnitLabelsByDepartment(options.testUnits)`。

把 `showAllowedUnits && (…)` 區塊裡 `<div className="flex flex-wrap gap-2">{allUnitLabels.map(u => …)}</div>` 換成：

```tsx
                <div className="space-y-1.5">
                  {deptUnits.map(d => {
                    const state = deptCheckState(allowedUnits, d.unitLabels)
                    const chip = (label: string, checked: boolean, onChange: () => void, extra = '') => (
                      <label key={label} className={`text-xs px-2 py-1 rounded border cursor-pointer ${checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'} ${extra}`}>
                        <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
                        {label}
                      </label>
                    )
                    if (d.isSingleLevel) {
                      return <div key={d.department} className="flex flex-wrap gap-2">{chip(d.department, allowedUnits.includes(d.department), () => setAllowedUnits(l => toggleUnit(l, d.department)))}</div>
                    }
                    return (
                      <div key={d.department} className="flex flex-wrap items-center gap-2">
                        {chip(`${d.department}（整個部門）`, state === 'all', () => setAllowedUnits(l => toggleDepartment(l, d.unitLabels)), state === 'some' ? 'border-dashed' : '')}
                        <span className="text-gray-300">|</span>
                        {d.unitLabels.map(u => chip(u, allowedUnits.includes(u), () => setAllowedUnits(l => toggleUnit(l, u))))}
                      </div>
                    )
                  })}
                </div>
```

`allUnitLabels` 若因此不再使用就刪掉它，避免 eslint 未使用變數。`toggleIn` 若只剩單位歸屬籤在用就保留。

- [ ] **Step 3: 型別檢查、eslint、測試**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` → `8`
Run: `cd /f/vsms/vsms-export && npx eslint src/components/settings/PeopleManager.tsx src/components/settings/PersonFormModal.tsx` → 0 errors
Run: `cd /f/vsms/vsms-export && npx vitest run` → 全 PASS（249 + 9 + 6 = 264）

- [ ] **Step 4: Commit**

```bash
cd /f/vsms/vsms-export && git add src/components/settings/PeopleManager.tsx src/components/settings/PersonFormModal.tsx && git commit -m "feat(people): group the people page by department and section; allowed-units picker can select a whole department

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 實機驗證（harness，不碰正式環境）

**Files:** 無變更（`_dev-*` 檔已被 `.git/info/exclude` 排除）。

- [ ] **Step 1: 讓 harness 的 options 帶部門**

`_dev-fixtures/options.json` 的 `testUnits` 裡 SIT-HW 與 SIT-SW 加 `"department": "SIT"`（RA、SI 不加）。`_dev-stub.ts` 的 `PUT /options` 已是 echo，不用改。`preview_start` 開 `vsms-harness`，瀏覽 `http://127.0.0.1:5175/_dev-admin.html?role=super_admin`。

- [ ] **Step 2: 人員頁**

1. 第一張卡片標題 `SIT`，內有「部級」子區塊列出 Ericct_Hsieh（帶 SIT-HW、SIT-SW 兩個籤），SIT-HW 與 SIT-SW 子區塊都**不再**列 Ericct。
2. RA、SI 各是一張單層卡片，標題就是單位名。
3. 用 `javascript_tool` 量「編輯」「停用」的 x 座標仍各只有一個值（部級列與課列共用 `PEOPLE_GRID`）。
4. 展開「已停用」：也是部門分組。
5. 「測試單位」分頁：每個單位有「所屬部門」輸入框，SIT-HW 顯示 `SIT`，datalist 有 `SIT`。

- [ ] **Step 3: 管轄單位選擇器**

開一位 admin（harness 的 Will_Wang 若沒帳號就用「建立帳號 → 部級主管」）：管轄單位區塊出現 `SIT（整個部門）| SIT-HW SIT-SW` 一列與 `RA`、`SI` 各一列；勾 `SIT（整個部門）` 後 SIT-HW、SIT-SW 都亮；取消 SIT-HW 後部門籤變虛線框（半選）。用 `javascript_tool` 攔 stub 收到的 `createUser` body（在 `_dev-stub.ts` 的 `/users` POST 分支加 `(window as any).__lastUserBody = body`，不 commit），確認 `allowedUnits` 只含葉單位。

- [ ] **Step 4: 退化行為**

把 `_dev-fixtures/options.json` 的 `department` 全部拿掉重新載入：人員頁回到四張單層卡片（即 A 的樣子）。驗完把 fixtures 改回來或還原。

截圖 SIT 部門卡片一張留存。驗完 `preview_stop`。

- [ ] **Step 5: 最後確認**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"` → `8`
Run: `cd /f/vsms/vsms-export && npx tsc -p server/tsconfig.json --noEmit` → 乾淨
Run: `cd /f/vsms/vsms-export && npx vitest run` → 全 PASS；`npx vitest run --config server/vitest.config.ts` → 全 PASS

---

### Task 7: 部署 A + B 並推 GitHub（使用者已決定：B 完成後一起部署一起推）

**Files:** 無程式變更；會動正式 DB（一條 ALTER、一條 UPDATE）、重啟 VSMS server、重建 dist。

- [ ] **Step 1: 閘門——別人未提交的 server 變更**

Run: `cd /f/vsms/vsms-export && git status --short server/`
若列出 `auth.ts`、`crypto.ts`、`loginPasswordValidation.test.ts`：**先 stash 再編譯，部署完 pop**（使用者 2026-09-09 的決定是不讓它跟著上線）：
```bash
cd /f/vsms/vsms-export && git stash push -u -m "someone-else-login-validation" -- server/src/routes/auth.ts server/src/lib/crypto.ts server/src/__tests__/loginPasswordValidation.test.ts
```

- [ ] **Step 2: 時間與備份**

PowerShell：`Get-Date -Format "yyyy-MM-dd HH:mm dddd"`（不用 bash 的 `TZ`）。VSMS 的通知 job 只在 08:00 跑，重啟時間沒有窗口限制，但仍記錄時間。
```bash
cd /f/vsms/vsms-export && cmd //c "xcopy /E /I /Y /Q dist dist.stable-$(date +%Y%m%d)-pre-people" | tail -1
```

- [ ] **Step 3: schema（additive，一次一條）**

```bash
cd /f/vsms/vsms-export && echo "ALTER TABLE test_units ADD COLUMN department VARCHAR(100) NULL;" | npx prisma db execute --stdin
cd /f/vsms/vsms-export && echo "UPDATE test_units SET department='SIT' WHERE value IN ('SIT-HW','SIT-SW');" | npx prisma db execute --stdin
```

驗證（唯讀）：用 repo 的 prisma client 查 `testUnit.findMany({ select: { value: true, department: true } })`，預期 SIT-HW/SIT-SW = SIT、RA/SI = null。

- [ ] **Step 4: VSMS server**

```bash
cd /f/vsms/vsms-export && npx tsc -p server/tsconfig.json && grep -c "existingDepartment" server/dist/src/routes/options.js && pm2.cmd restart vsms
```
驗證：`curl -sk https://localhost:3001/api/options` 需要登入；改用 guest login（`POST /api/guest-login`）取得 cookie 後 `GET /api/options`，確認 `testUnits[].department` 出現且 SIT-HW 為 `SIT`；再 `POST /api/logout`。`pm2.cmd logs vsms --lines 20 --nostream` 無錯誤。

- [ ] **Step 5: VSMS 前端**

```bash
cd /f/vsms/vsms-export && npx vite build 2>&1 | tail -3 && curl -sk https://localhost:3001/ -o ./.prod-index.html && cmp ./.prod-index.html dist/index.html && echo PROD-MATCHES-DIST; rm -f ./.prod-index.html
```

- [ ] **Step 6: 還原 stash、推 GitHub**

```bash
cd /f/vsms/vsms-export && git stash pop && git status --short
cd /f/vsms/vsms-export && git push origin feat/guest-role-and-uiux
```

- [ ] **Step 7: 記錄**

在 `.superpowers/sdd/progress.md` 記部署時間、備份目錄名、commit 範圍；更新 memory `vsms-people-identity-and-org-model.md` 的進度段落。
