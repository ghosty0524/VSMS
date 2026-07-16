# Cancelled 狀態 + 統計分析頁改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增手動勾選的 Cancelled 排程狀態（深黑色標籤、與 Completed 互斥、僅 Admin 可操作），並將統計分析頁改版為行動導向 KPI、類別趨勢+圓餅圖、工作天數負載分布、風險清單、單位比較與延遲分析。

**Architecture:** 資料層在 `Schedule` 加 `isCancelled` 與 `completedAt` 兩欄（Prisma migration），狀態推導維持前後端各自的 `computeStatus` 複本（優先序 Cancelled > Completed > Delayed > Testing > Planned）。統計頁改為單一 sticky 全域篩選列 + 六個區塊元件，所有統計計算抽到純函式 `src/lib/analytics.ts` 以便 TDD。

**Tech Stack:** React 19 + zustand + recharts 3 + Tailwind 4（前端）；Express 5 + Prisma 7 (MySQL/MariaDB)（後端）；vitest + supertest（測試）。

**Spec:** `docs/superpowers/specs/2026-07-16-cancelled-status-and-analytics-redesign-design.md`

## Global Constraints

- 工作目錄：`F:\vsms\vsms-export`（分支 `feat/guest-role-and-uiux`）。
- **工作區有他人未提交的 WIP**：`server/src/routes/integration.ts`、`openapi-integration.yaml`、`server/vitest.config.ts`（modified）與 `server/src/lib/workload.ts`、`server/src/__tests__/workload.test.ts`（untracked）是 workload-analysis 功能的未完成工作。**絕不使用 `git add -A` / `git add .`**，每次 commit 只 add 該任務明確列出的檔案。Task 4 會動到 `integration.ts` —— 執行前該檔的 WIP 必須已由使用者處理（先行提交）；若仍是未提交狀態，停下來詢問使用者。
- 正式服務 pm2 `vsms` 常駐 port 3001，dist 由磁碟即時服務。**開發驗證一律用 vite dev server，不要動 3001。**
- Prisma migration 會直接套用到 `.env` 的 DATABASE_URL 資料庫（與 3001 共用）。本計畫只新增帶預設值/nullable 的欄位（additive、對運行中舊版程式無害）。**禁止 `prisma db push`**；若 `migrate dev` 出現任何 drift/reset 提示，停止並回報，不要接受。
- 狀態優先序：`Cancelled > Completed > Delayed > Testing > Planned`（前端 `src/lib/status.ts`、`src/lib/excel.ts`、`src/dashboard/script.ts` 三份複本都要一致）。
- Cancelled 狀態色：`bg: '#111827'`、`text: '#FFFFFF'`（匯出版 dashboard badge：`background:#111827; color:#F9FAFB`）。
- 類別色盤（已通過 dataviz validator，白底、最差相鄰 CVD ΔE 12.9，順序固定不可循環重排）：`#2a78d6, #eda100, #0891b2, #eb6834, #4a3aa7, #1baf7a, #e87ba4, #a16207`。顏色依「啟用類別清單的索引」指派（`index % 8`），篩選改變時顏色跟著類別走、不重排。
- 統計頁全面禁用 emoji；UI 文案為繁體中文。
- 測試指令：前端 `npx vitest run <file>`；後端 `npx vitest run --config server/vitest.config.ts <file>`。
- 統計比率一律排除 `isCancelled === true` 的排程。「已到期」定義：`endDate < today`（字串比較，格式 YYYY/MM/DD 可直接比）。

---

## Phase A：Cancelled 狀態

### Task 1: Prisma schema 新增 isCancelled / completedAt + migration

**Files:**
- Modify: `prisma/schema.prisma:22-23`（Schedule model）

**Interfaces:**
- Produces: DB 欄位 `schedules.isCancelled`（BOOLEAN NOT NULL DEFAULT false）、`schedules.completedAt`（DATETIME NULL）；Prisma Client 型別同步再生。

- [ ] **Step 1: 修改 schema**

在 `prisma/schema.prisma` 的 Schedule model 中，`isDelayed` 與 `delayReason` 之間插入兩行：

```prisma
  isCompleted       Boolean  @default(false)
  isDelayed         Boolean  @default(false)
  isCancelled       Boolean  @default(false)
  completedAt       DateTime?
  delayReason       String   @db.VarChar(5000)
```

- [ ] **Step 2: 產生並套用 migration**

Run: `npx prisma migrate dev --name add_cancelled_and_completed_at`
Expected: 新資料夾 `prisma/migrations/<timestamp>_add_cancelled_and_completed_at/migration.sql`，內容為兩句 `ALTER TABLE \`schedules\` ADD COLUMN ...`，且輸出 `Your database is now in sync`。若出現 drift 警告或 reset 提示 → 停止回報。

- [ ] **Step 3: 確認 migration 狀態乾淨**

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add isCancelled and completedAt columns to schedules"
```

---

### Task 2: 後端驗證 — isCancelled 型別 + 與 isCompleted 互斥

**Files:**
- Modify: `server/src/types.ts:16-17`（Schedule interface）
- Modify: `server/src/middleware/validateSchedule.ts:43-49`
- Test: `server/src/__tests__/validateSchedule.test.ts`

**Interfaces:**
- Produces: `collectScheduleErrors` 在 `isCancelled` 非布林、或 `isCancelled === true && isCompleted === true` 時回傳 `errors.isCancelled`；`Schedule` 型別含 `isCancelled: boolean`、`completedAt: string | null`。

- [ ] **Step 1: 寫失敗測試**

在 `server/src/__tests__/validateSchedule.test.ts` 追加（沿用檔內既有的 `validBody` 與 supertest app）：

```ts
  it('rejects isCancelled=true together with isCompleted=true', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isCancelled: true, isCompleted: true })
    expect(res.status).toBe(422)
    expect(res.body.errors.isCancelled).toBeDefined()
  })

  it('rejects non-boolean isCancelled', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isCancelled: 'yes' })
    expect(res.status).toBe(422)
    expect(res.body.errors.isCancelled).toBeDefined()
  })

  it('accepts isCancelled=true with isCompleted=false (and isDelayed=true allowed)', async () => {
    const res = await request(app).post('/test').send({
      ...validBody, isCancelled: true, isCompleted: false, isDelayed: true, delayReason: '設備延誤',
    })
    expect(res.status).toBe(200)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/validateSchedule.test.ts`
Expected: 前兩個新測試 FAIL（收到 200 而非 422）。

- [ ] **Step 3: 實作**

`server/src/types.ts` 的 `Schedule`，在 `isDelayed: boolean` 下加：

```ts
  isCancelled: boolean
  completedAt: string | null
```

`server/src/middleware/validateSchedule.ts` 的 `collectScheduleErrors`，在 `isDelayed` 檢查區塊（第 43–49 行）之後加：

```ts
  if (body.isCancelled !== undefined && typeof body.isCancelled !== 'boolean') {
    errors.isCancelled = 'isCancelled 須為布林值'
  }
  if (body.isCancelled === true && body.isCompleted === true) {
    errors.isCancelled = 'Cancelled 與 Completed 不可同時勾選'
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/validateSchedule.test.ts`
Expected: 全數 PASS。

- [ ] **Step 5: Commit**

```bash
git add server/src/types.ts server/src/middleware/validateSchedule.ts server/src/__tests__/validateSchedule.test.ts
git commit -m "feat: validate isCancelled (boolean, mutually exclusive with isCompleted)"
```

---

### Task 3: completedAt 轉換 helper + schedules 路由接線

**Files:**
- Create: `server/src/lib/completedAt.ts`
- Test: `server/src/__tests__/completedAt.test.ts`
- Modify: `server/src/routes/schedules.ts`

**Interfaces:**
- Produces: `completedAtPatch(prevIsCompleted: boolean, nextIsCompleted: boolean | undefined): { completedAt: Date | null } | {}` —— false→true 回 `{ completedAt: new Date() }`；true→false 回 `{ completedAt: null }`；未變或未帶欄位回 `{}`。
- Produces: `SCHEDULE_WRITABLE_FIELDS` 含 `'isCancelled'`；USER 分支剝除 `isCancelled`；API 回傳的 Schedule JSON 含 `isCancelled`、`completedAt`（ISO 字串或 null）。

- [ ] **Step 1: 寫失敗測試**

Create `server/src/__tests__/completedAt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { completedAtPatch } from '../lib/completedAt.js'

describe('completedAtPatch', () => {
  it('sets completedAt when transitioning false→true', () => {
    const patch = completedAtPatch(false, true)
    expect(patch).toHaveProperty('completedAt')
    expect((patch as { completedAt: Date }).completedAt).toBeInstanceOf(Date)
  })
  it('clears completedAt when transitioning true→false', () => {
    expect(completedAtPatch(true, false)).toEqual({ completedAt: null })
  })
  it('returns empty patch when isCompleted not in payload', () => {
    expect(completedAtPatch(true, undefined)).toEqual({})
    expect(completedAtPatch(false, undefined)).toEqual({})
  })
  it('returns empty patch when value unchanged', () => {
    expect(completedAtPatch(true, true)).toEqual({})
    expect(completedAtPatch(false, false)).toEqual({})
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/completedAt.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 helper**

Create `server/src/lib/completedAt.ts`:

```ts
// 維護 completedAt：isCompleted false→true 記錄當下時間、true→false 清空。
export function completedAtPatch(
  prevIsCompleted: boolean,
  nextIsCompleted: boolean | undefined,
): { completedAt: Date | null } | Record<string, never> {
  if (nextIsCompleted === undefined || nextIsCompleted === prevIsCompleted) return {}
  return { completedAt: nextIsCompleted ? new Date() : null }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/completedAt.test.ts`
Expected: 4 PASS。

- [ ] **Step 5: 接線 schedules.ts**

`server/src/routes/schedules.ts` 修改五處：

(a) import 區加：

```ts
import { completedAtPatch } from '../lib/completedAt.js'
```

(b) `SCHEDULE_WRITABLE_FIELDS` 第 20 行改為：

```ts
  'isCompleted', 'isDelayed', 'isCancelled', 'delayReason',
```

(c) `toSchedule` 的參數型別中，在 `delayReason: string;` 後加 `isCancelled: boolean; completedAt: Date | null;`，回傳物件加：

```ts
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
```

(d) POST `/`（第 102–104 行）的 create data 改為：

```ts
    data: {
      id: uuidv4(), ...body,
      ...completedAtPatch(false, (body as Record<string, unknown>).isCompleted as boolean | undefined),
      createdBy: username, updatedBy: username,
    },
```

(e) PUT `/:id` USER 分支：在 `const { adminFlag: _af, adminFlagNote: _afn, ...safeBody } = body` 之後加一行（USER 不可寫 isCancelled）：

```ts
    delete (safeBody as Record<string, unknown>).isCancelled
```

USER 分支的 update data 改為：

```ts
      data: {
        ...safeBody,
        ...completedAtPatch(existing.isCompleted, (safeBody as Record<string, unknown>).isCompleted as boolean | undefined),
        testEngineer: engineer, updatedBy: username, updatedAt: new Date(),
      },
```

admin 分支（第 324–327 行）的 update data 改為：

```ts
    data: {
      ...body,
      ...completedAtPatch(existing.isCompleted, body.isCompleted as boolean | undefined),
      updatedBy: username, updatedAt: new Date(),
    },
```

(f) PUT `/replace-all` 兩處 `createMany` 的 data map，在 `...d,` 之後加：

```ts
            completedAt: (d as Record<string, unknown>).isCompleted === true ? now : null,
```

注意：VTMS 關聯剝除邏輯（兩處 `if (existing.vtmsPlanId)` / `delete ... isCompleted/isDelayed/delayReason`）**不**剝除 `isCancelled` —— 維持原樣、不要加。

- [ ] **Step 6: 型別檢查 + 全部後端測試**

Run: `npx tsc -p server/tsconfig.json --noEmit && npx vitest run --config server/vitest.config.ts`
Expected: 無型別錯誤，測試全 PASS（workload.test.ts 為他人 WIP，若原本就 fail 不理會、只確認自己的測試通過）。

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/completedAt.ts server/src/__tests__/completedAt.test.ts server/src/routes/schedules.ts
git commit -m "feat: wire isCancelled and completedAt through schedule routes"
```

---

### Task 4: VTMS 整合 API — summary 排除取消 + complete 寫 completedAt

**前置條件：`server/src/routes/integration.ts` 的 workload WIP 已由使用者提交。`git status` 若顯示該檔仍為 modified，停止並詢問使用者。**

**Files:**
- Modify: `server/src/routes/integration.ts`

**Interfaces:**
- Produces: `GET /schedules/summary` 回傳新增 `cancelled` 欄位，`completed/delayed/inProgress/notStarted` 桶排除已取消；`buildWhereClause` 支援 `isCancelled` query 參數；`PATCH /schedules/:id/complete` 順帶維護 `completedAt`。

- [ ] **Step 1: 修改 buildWhereClause**

在 `const isDelayed = ...` 兩行後加：

```ts
  const isCancelled = qs(query.isCancelled);
  if (isCancelled !== undefined) where.isCancelled = isCancelled === 'true';
```

- [ ] **Step 2: 修改 summary 端點**

`GET /schedules/summary` 的統計區塊改為：

```ts
  const schedules = await prisma.schedule.findMany();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const total = schedules.length;
  const cancelled = schedules.filter(s => s.isCancelled).length;
  const active = schedules.filter(s => !s.isCancelled);
  const completed = active.filter(s => s.isCompleted).length;
  const delayed = active.filter(s => !s.isCompleted && s.isDelayed).length;
  // Mutually exclusive buckets: completed / delayed / inProgress / notStarted (+cancelled)
  const inProgress = active.filter(s => !s.isCompleted && !s.isDelayed && s.startDate <= today).length;
  const notStarted = active.filter(s => !s.isCompleted && !s.isDelayed && s.startDate > today).length;
  const byUnit: Record<string, number> = {};
  for (const s of schedules) {
    if (s.testUnit) byUnit[s.testUnit] = (byUnit[s.testUnit] ?? 0) + 1;
  }
  res.json({ total, completed, delayed, inProgress, notStarted, cancelled, byUnit });
```

- [ ] **Step 3: 修改 complete 端點**

import 加 `import { completedAtPatch } from '../lib/completedAt.js';`，`PATCH /schedules/:id/complete` 的 update 改為：

```ts
  const updated = await prisma.schedule.update({
    where: { id },
    data: { isCompleted: true, ...completedAtPatch(existing.isCompleted, true), updatedAt: new Date() },
  });
```

- [ ] **Step 4: 型別檢查**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: 無錯誤。

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/integration.ts
git commit -m "feat: exclude cancelled schedules from integration summary buckets"
```

---

### Task 5: 前端 types + computeStatus + 狀態色/類別色盤

**Files:**
- Modify: `src/types.ts`（Schedule、ScheduleFormValues）
- Modify: `src/lib/status.ts`
- Modify: `src/constants.ts`
- Test: `src/__tests__/status.test.ts`

**Interfaces:**
- Produces: `ScheduleStatus = 'Cancelled' | 'Completed' | 'Delayed' | 'Testing' | 'Planned'`；`computeStatus` 優先序 Cancelled 最高；`STATUS_COLORS.Cancelled = { bg: '#111827', text: '#FFFFFF' }`；`CATEGORY_COLORS: string[]`（8 色，供 Phase B 圖表用）。

- [ ] **Step 1: 寫失敗測試**

Create `src/__tests__/status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeStatus } from '../lib/status'
import type { Schedule } from '../types'

function makeSchedule(over: Partial<Schedule>): Schedule {
  return {
    id: '1', category: 'NPI', projectName: 'P', taskDescription: '', testUnit: 'SIT-HW',
    testEngineer: 'Eric', timeResource: 5, startDate: '2026/01/05', endDate: '2026/01/09',
    requiredPersonnel: '', testReport: '', isCompleted: false, isDelayed: false,
    isCancelled: false, completedAt: null, delayReason: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
    ...over,
  }
}

describe('computeStatus with Cancelled', () => {
  it('Cancelled overrides Delayed', () => {
    expect(computeStatus(makeSchedule({ isCancelled: true, isDelayed: true }))).toBe('Cancelled')
  })
  it('Cancelled overrides Testing/Planned', () => {
    expect(computeStatus(makeSchedule({ isCancelled: true }))).toBe('Cancelled')
  })
  it('Completed still wins over Delayed when not cancelled', () => {
    expect(computeStatus(makeSchedule({ isCompleted: true, isDelayed: true }))).toBe('Completed')
  })
  it('past-start uncompleted schedule stays Testing', () => {
    expect(computeStatus(makeSchedule({}))).toBe('Testing')
  })
  it('future schedule is Planned', () => {
    const future = new Date(); future.setDate(future.getDate() + 30)
    const ymd = `${future.getFullYear()}/${String(future.getMonth() + 1).padStart(2, '0')}/${String(future.getDate()).padStart(2, '0')}`
    expect(computeStatus(makeSchedule({ startDate: ymd }))).toBe('Planned')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/__tests__/status.test.ts`
Expected: FAIL（型別錯誤：Schedule 無 isCancelled；或 Cancelled 測試失敗）。

- [ ] **Step 3: 實作**

`src/types.ts` 的 `Schedule`，在 `isDelayed: boolean` 後加：

```ts
  isCancelled: boolean
  completedAt: string | null
```

`ScheduleFormValues`，在 `isDelayed: boolean` 後加：

```ts
  isCancelled: boolean
```

`src/lib/status.ts` 改為：

```ts
export type ScheduleStatus = 'Cancelled' | 'Completed' | 'Delayed' | 'Testing' | 'Planned'
```

`computeStatus` 第一行加：

```ts
  if (s.isCancelled) return 'Cancelled'
```

`src/constants.ts` 的 `STATUS_COLORS` 加：

```ts
  Cancelled: { bg: '#111827', text: '#FFFFFF' },
```

並於其後新增（取代舊圖表各自的 12 色盤，Phase B 使用）：

```ts
// 統計圖表類別色盤：dataviz validator 驗證通過（白底、最差相鄰 CVD ΔE 12.9）。
// 順序固定 —— 依啟用類別清單的索引指派（index % 8），不可依篩選結果重排。
export const CATEGORY_COLORS = [
  '#2a78d6', '#eda100', '#0891b2', '#eb6834',
  '#4a3aa7', '#1baf7a', '#e87ba4', '#a16207',
]
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/__tests__/status.test.ts`
Expected: 5 PASS。

- [ ] **Step 5: 修復既有編譯錯誤**

Run: `npx tsc -p tsconfig.app.json --noEmit`（若無此檔則 `npx tsc --noEmit`）
Expected: 可能出現使用 `Record<ScheduleStatus, ...>` 的地方缺 Cancelled key 的錯誤（`GanttChart.tsx` 的 `STATUS_GLYPH`、`STATUS_PRIORITY`）——那是 Task 7 的範圍，此步先確認錯誤僅限這兩處；若僅此兩處，允許在本 task 直接一併修（見 Task 7 Step 1 的值），並在 commit 訊息註明。

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/status.ts src/constants.ts src/__tests__/status.test.ts
git commit -m "feat: add Cancelled status with highest priority and category palette"
```

---

### Task 6: ScheduleFormModal — Cancelled checkbox

**Files:**
- Modify: `src/components/schedule/ScheduleFormModal.tsx`

**Interfaces:**
- Consumes: `ScheduleFormValues.isCancelled`（Task 5）。
- Produces: 表單送出 payload 含 `isCancelled`；UI 互斥（勾 Cancelled 停用並取消 Completed、勾 Completed 停用 Cancelled）；USER 角色停用。

- [ ] **Step 1: 表單狀態接線**

(a) `EMPTY` 常數：`isCompleted: false, isDelayed: false, delayReason: '',` 改為

```ts
  isCompleted: false, isDelayed: false, isCancelled: false, delayReason: '',
```

(b) `useEffect` 載入 schedule 時的 `setForm`，在 `isCompleted: schedule.isCompleted, isDelayed: schedule.isDelayed,` 後加：

```ts
        isCancelled: schedule.isCancelled,
```

(c) `handleSave` 的 `data` 物件，在 `isCompleted: form.isCompleted, isDelayed: form.isDelayed,` 改為：

```ts
      isCompleted: form.isCompleted, isDelayed: form.isDelayed,
      ...(isUser ? {} : { isCancelled: form.isCancelled }),
```

- [ ] **Step 2: Completed checkbox 互斥**

F11 Completed 的 `<input>` 改 `disabled={!!vtmsPlanId || form.isCancelled}`，className 條件同步改為 `${vtmsPlanId || form.isCancelled ? 'cursor-not-allowed opacity-50' : ''}`，label className 條件改為 `${vtmsPlanId || form.isCancelled ? 'text-gray-400' : 'text-gray-700'}`。

- [ ] **Step 3: 新增 Cancelled checkbox**

在「F13 延遲原因」區塊（`{form.isDelayed && field('延遲原因', ...)}`）**之後**加入：

```tsx
          {/* Cancelled：與 Completed 互斥、僅 Admin 可操作、VTMS 關聯不鎖定 */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isCancelled" checked={form.isCancelled}
              onChange={e => setForm(f => ({ ...f, isCancelled: e.target.checked, isCompleted: e.target.checked ? false : f.isCompleted }))}
              disabled={isUser || form.isCompleted}
              className={`w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 ${isUser || form.isCompleted ? 'cursor-not-allowed opacity-50' : ''}`} />
            <label htmlFor="isCancelled" className={`text-sm font-medium ${isUser || form.isCompleted ? 'text-gray-400' : 'text-gray-700'}`}>Cancelled（工作已取消）</label>
          </div>
```

- [ ] **Step 4: 型別檢查**

Run: `npx tsc --noEmit`（沿用專案 tsconfig 慣例）
Expected: 本檔無錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleFormModal.tsx
git commit -m "feat: add Cancelled checkbox to schedule form (admin-only, exclusive with Completed)"
```

---

### Task 7: GanttChart + FilterSortBar 支援 Cancelled

**Files:**
- Modify: `src/components/schedule/GanttChart.tsx:19-21,66-68`
- Modify: `src/components/schedule/FilterSortBar.tsx:89`

**Interfaces:**
- Consumes: `ScheduleStatus`（含 Cancelled）、`STATUS_COLORS.Cancelled`。

- [ ] **Step 1: GanttChart**

`STATUS_GLYPH`（第 19–21 行）改為：

```ts
const STATUS_GLYPH: Record<ScheduleStatus, string> = {
  Completed: '✓', Delayed: '!', Testing: '▶', Planned: '○', Cancelled: '✕',
}
```

`STATUS_PRIORITY`（第 66–68 行）改為：

```ts
const STATUS_PRIORITY: Record<ScheduleStatus, number> = {
  Completed: 0, Delayed: 1, Testing: 2, Planned: 3, Cancelled: 4,
}
```

（左側標籤第 816–826 行走 `STATUS_COLORS[status]`，自動生效，無需改。）

- [ ] **Step 2: FilterSortBar**

第 89 行改為：

```ts
const ALL_STATUSES: ScheduleStatus[] = ['Completed', 'Delayed', 'Testing', 'Planned', 'Cancelled']
```

`DEFAULT_FILTER.statuses` 維持 `['Delayed', 'Testing', 'Planned']` 不變 —— 登入預設同時隱藏 Completed 與 Cancelled（兩者皆終態），可在狀態下拉勾回。

- [ ] **Step 3: 型別檢查 + 全前端測試**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 無錯誤、全 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/GanttChart.tsx src/components/schedule/FilterSortBar.tsx
git commit -m "feat: show Cancelled status in gantt labels, sorting and status filter"
```

---

### Task 8: Excel 匯入/匯出 + 差異比對支援 isCancelled

**Files:**
- Modify: `src/lib/excel.ts`
- Modify: `src/components/schedule/ExcelImportModal.tsx`
- Test: `src/__tests__/excel-import-cancelled.test.ts`（新檔）

**Interfaces:**
- Produces: CSV/XLSX 欄位 `isCancelled`（TRUE/FALSE，位於 delayReason 之後）；`parseImportRows` 解析並驗證互斥；agent Excel 的 KPI 摘要含 Cancelled 且比率排除取消。

- [ ] **Step 1: 寫失敗測試**

Create `src/__tests__/excel-import-cancelled.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseImportRows } from '../lib/excel'

const baseRow = {
  category: 'NPI', projectName: 'PDN-1', taskDescription: '內容', testUnit: 'SIT-HW',
  testEngineer: 'Eric', timeResource: 5, startDate: '2026/05/01', endDate: '2026/05/31',
  requiredPersonnel: 'A', testReport: '', isCompleted: 'FALSE', isDelayed: 'FALSE',
  delayReason: '', device: '', adminFlag: '', adminFlagNote: '', userFlag: '', userFlagNote: '',
}

describe('parseImportRows isCancelled', () => {
  it('parses TRUE into isCancelled', () => {
    const r = parseImportRows([{ ...baseRow, isCancelled: 'TRUE' }])
    expect(r.errors).toHaveLength(0)
    expect(r.valid[0].isCancelled).toBe(true)
  })
  it('defaults to false when column missing', () => {
    const r = parseImportRows([baseRow])
    expect(r.valid[0].isCancelled).toBe(false)
  })
  it('rejects isCancelled + isCompleted both TRUE', () => {
    const r = parseImportRows([{ ...baseRow, isCancelled: 'TRUE', isCompleted: 'TRUE' }])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].messages.join()).toContain('isCancelled')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/__tests__/excel-import-cancelled.test.ts`
Expected: FAIL（valid[0].isCancelled 為 undefined / 型別錯誤）。

- [ ] **Step 3: 實作 excel.ts**

(a) `ImportRow` 加 `isCancelled?: unknown`（`isDelayed` 後）。

(b) `parseImportRows` 內，`const delayReason = str(r.delayReason)` 後加：

```ts
    const isCancelled = parseBool(r.isCancelled)
```

驗證訊息區（`if (startDate && endDate && ...)` 之後）加：

```ts
    if (isCancelled && isCompleted)
      msgs.push('isCancelled 與 isCompleted 不可同時為 TRUE')
```

`valid.push` 的物件中 `isCompleted, isDelayed, delayReason,` 改為 `isCompleted, isDelayed, isCancelled, delayReason, completedAt: null,`（`ImportResult['valid']` 是 `Omit<Schedule, ...>`，前端 `Schedule` 已含 `completedAt`，不補會編譯錯；匯入時後端 replace-all 會依 isCompleted 重設 completedAt，這裡固定給 null 即可）。

(c) `HEADERS`：`'isCompleted','isDelayed','delayReason',` 改為 `'isCompleted','isDelayed','isCancelled','delayReason',`。

(d) `downloadTemplate` 的 example：`'FALSE','FALSE',''` 改為 `'FALSE','FALSE','FALSE',''`。

(e) `exportSchedules` 的 rows：`s.isCompleted ? 'TRUE' : 'FALSE', s.isDelayed ? 'TRUE' : 'FALSE', s.delayReason,` 改為：

```ts
    s.isCompleted ? 'TRUE' : 'FALSE', s.isDelayed ? 'TRUE' : 'FALSE',
    s.isCancelled ? 'TRUE' : 'FALSE', s.delayReason,
```

(f) `computeStatus`（第 165 行複本）第一行加 `if (s.isCancelled) return 'Cancelled'`。

(g) `generateAgentExcel` KPI 區改為：

```ts
  const total     = schedules.length
  const cancelled = schedules.filter(s => s.isCancelled).length
  const active    = schedules.filter(s => !s.isCancelled)
  const completed = active.filter(s => s.isCompleted).length
  const delayed   = active.filter(s => s.isDelayed && !s.isCompleted).length
  const testing   = schedules.filter(s => computeStatus(s) === 'Testing').length
  const planned   = schedules.filter(s => computeStatus(s) === 'Planned').length
  const expiring7 = schedules.filter(s => {
    if (s.isCompleted || s.isCancelled) return false
    const days = daysUntil(s.endDate)
    return days >= 0 && days <= 7
  }).length
```

`kpiRows` 中完成率/延遲率的分母改用 `active.length`：

```ts
    { metric: 'Completed 數',      value: completed, note: `完成率 ${active.length ? ((completed/active.length)*100).toFixed(1) : 0}%（排除已取消）` },
    { metric: 'Delayed 數',        value: delayed,   note: `延遲率 ${active.length ? ((delayed/active.length)*100).toFixed(1) : 0}%（排除已取消）` },
```

並在 Planned 列之後插入：

```ts
    { metric: 'Cancelled 數',      value: cancelled, note: '已取消，不計入比率' },
```

`unitMap` 統計迴圈改為跳過取消：

```ts
  schedules.forEach(s => {
    if (s.isCancelled) return
    ...
  })
```

工作表三 `expiringList` 的 filter 同步改為 `if (s.isCompleted || s.isCancelled) return false`。

- [ ] **Step 4: 實作 ExcelImportModal 差異比對**

`src/components/schedule/ExcelImportModal.tsx`：

(a) 第 9 行 field union 加 `'isCancelled'`：`field: 'testReport' | 'isCompleted' | 'isDelayed' | 'isCancelled' | 'delayReason' | ...`。

(b) 第 24 行比對用型別加 `isCancelled: boolean`。

(c) 第 47–48 行（isDelayed diff）之後加：

```ts
    if (row.isCancelled !== match.isCancelled)
      diffs.push({ field: 'isCancelled', label: 'Cancelled', oldVal: boolStr(match.isCancelled), newVal: boolStr(row.isCancelled) })
```

- [ ] **Step 5: 跑測試確認通過 + 既有測試不破**

Run: `npx vitest run`
Expected: 新測試 3 PASS，`excel-diff.test.ts` 等既有測試 PASS（若其本地型別/測試資料缺欄位導致編譯錯，補 `isCancelled: false` 與 `completedAt: null`）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/excel.ts src/components/schedule/ExcelImportModal.tsx src/__tests__/excel-import-cancelled.test.ts src/__tests__/excel-diff.test.ts
git commit -m "feat: support isCancelled in excel import/export and agent workbook"
```

---

### Task 9: 匯出版 Dashboard 支援 Cancelled

**Files:**
- Modify: `src/dashboard/script.ts:16-21,44-52,103,596-603,636`
- Modify: `src/dashboard/template.ts:47,66-68`
- Modify: `src/dashboard/styles.ts:373-376`

**Interfaces:**
- Consumes: schedule JSON 內的 `isCancelled`（Task 3 起 API 已回傳）。

- [ ] **Step 1: script.ts**

(a) `STATUS_COLORS`（第 16–21 行）加一行：

```js
    'Cancelled': { bg:'#111827', text:'#F9FAFB' },
```

(b) `computeStatus`（第 44 行）第一行加：

```js
    if (s.isCancelled) return 'Cancelled';
```

(c) 預設隱藏（第 103 行）：`hiddenStatuses:['Completed'],` → `hiddenStatuses:['Completed','Cancelled'],`

(d) 狀態 checkbox 初始化（第 598 行）：`if (cb.value === 'Completed') cb.checked = false;` → `if (cb.value === 'Completed' || cb.value === 'Cancelled') cb.checked = false;`

(e) 甘特收合區的重設（第 619 行附近）：`state.hiddenStatuses = ['Completed'];` → `state.hiddenStatuses = ['Completed','Cancelled'];`

(f) 清除篩選（第 636 行）：`cb.checked = cb.value !== 'Completed';` → `cb.checked = cb.value !== 'Completed' && cb.value !== 'Cancelled';`

- [ ] **Step 2: template.ts**

第 47 行：

```ts
const ALL_STATUSES = ['Completed', 'Delayed', 'Testing', 'Planned', 'Cancelled'] as const
```

第 66–68 行 checkbox 預設勾選條件：`${s !== 'Completed' ? ' checked' : ''}` → `${s !== 'Completed' && s !== 'Cancelled' ? ' checked' : ''}`

- [ ] **Step 3: styles.ts**

`.status-Planned` 之後加：

```css
.status-Cancelled { background: #111827; color: #f9fafb; }
```

- [ ] **Step 4: 建置驗證**

Run: `npm run build`
Expected: vite build + server tsc 成功。

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/script.ts src/dashboard/template.ts src/dashboard/styles.ts
git commit -m "feat: support Cancelled status in exported dashboard"
```

---

## Phase B：統計分析頁改版

### Task 10: 統計純函式庫 src/lib/analytics.ts

**Files:**
- Create: `src/lib/analytics.ts`
- Test: `src/__tests__/analytics.test.ts`

**Interfaces:**
- Produces（Phase B 各元件都吃這組簽名）:
  - `type TimeScale = 'month' | 'quarter' | 'year'`
  - `parseYmd(s: string): Date`、`fmtYmd(d: Date): string`
  - `periodKey(d: Date, scale: TimeScale): string`（'2026/07' / '2026 Q3' / '2026'，字典序即時間序）
  - `isOverdue(s: Schedule, today: string): boolean`
  - `statusCounts(schedules: Schedule[]): Record<ScheduleStatus, number>`
  - `dueCompletionRate(schedules: Schedule[], today: string): { due: number; completed: number; rate: number | null }`
  - `allocateTimeResource(s: Schedule, scale: TimeScale, rest: RestDaysConfig): Record<string, number>`
  - `daysBetweenYmd(a: string, b: string): number`

- [ ] **Step 1: 寫失敗測試**

Create `src/__tests__/analytics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  periodKey, parseYmd, isOverdue, statusCounts, dueCompletionRate,
  allocateTimeResource, daysBetweenYmd,
} from '../lib/analytics'
import type { Schedule, RestDaysConfig } from '../types'

function makeSchedule(over: Partial<Schedule>): Schedule {
  return {
    id: '1', category: 'NPI', projectName: 'P', taskDescription: '', testUnit: 'SIT-HW',
    testEngineer: 'Eric', timeResource: 10, startDate: '2026/06/22', endDate: '2026/07/03',
    requiredPersonnel: '', testReport: '', isCompleted: false, isDelayed: false,
    isCancelled: false, completedAt: null, delayReason: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
    ...over,
  }
}
const noRest: RestDaysConfig = { weekends: false, specificDates: [] }
const weekendRest: RestDaysConfig = { weekends: true, specificDates: [] }

describe('periodKey', () => {
  it('formats month/quarter/year', () => {
    const d = parseYmd('2026/07/16')
    expect(periodKey(d, 'month')).toBe('2026/07')
    expect(periodKey(d, 'quarter')).toBe('2026 Q3')
    expect(periodKey(d, 'year')).toBe('2026')
  })
})

describe('isOverdue', () => {
  const today = '2026/07/16'
  it('true when past endDate and not completed/cancelled', () => {
    expect(isOverdue(makeSchedule({ endDate: '2026/07/15' }), today)).toBe(true)
  })
  it('false when completed or cancelled or not yet due', () => {
    expect(isOverdue(makeSchedule({ endDate: '2026/07/15', isCompleted: true }), today)).toBe(false)
    expect(isOverdue(makeSchedule({ endDate: '2026/07/15', isCancelled: true }), today)).toBe(false)
    expect(isOverdue(makeSchedule({ endDate: '2026/07/16' }), today)).toBe(false)
  })
})

describe('dueCompletionRate', () => {
  const today = '2026/07/16'
  it('counts only past-due, excludes cancelled', () => {
    const r = dueCompletionRate([
      makeSchedule({ endDate: '2026/07/01', isCompleted: true }),
      makeSchedule({ endDate: '2026/07/01' }),
      makeSchedule({ endDate: '2026/07/01', isCancelled: true }),
      makeSchedule({ endDate: '2026/12/31' }),
    ], today)
    expect(r.due).toBe(2)
    expect(r.completed).toBe(1)
    expect(r.rate).toBe(50)
  })
  it('rate is null when nothing is due', () => {
    expect(dueCompletionRate([makeSchedule({ endDate: '2026/12/31' })], today).rate).toBeNull()
  })
})

describe('statusCounts', () => {
  it('buckets by computeStatus including Cancelled', () => {
    const counts = statusCounts([
      makeSchedule({ isCancelled: true }),
      makeSchedule({ isCompleted: true }),
      makeSchedule({ isDelayed: true }),
    ])
    expect(counts.Cancelled).toBe(1)
    expect(counts.Completed).toBe(1)
    expect(counts.Delayed).toBe(1)
  })
})

describe('allocateTimeResource', () => {
  it('splits by working-day overlap across months (no rest days)', () => {
    // 2026/06/22–2026/07/03 共 12 天：6 月 9 天、7 月 3 天，timeResource 10
    const alloc = allocateTimeResource(makeSchedule({}), 'month', noRest)
    expect(alloc['2026/06']).toBeCloseTo(10 * 9 / 12, 5)
    expect(alloc['2026/07']).toBeCloseTo(10 * 3 / 12, 5)
  })
  it('skips weekends when weekends rest is on', () => {
    // 2026/06/22(一)–2026/06/26(五) 全為工作天 → 全數歸 6 月
    const alloc = allocateTimeResource(
      makeSchedule({ startDate: '2026/06/22', endDate: '2026/06/26', timeResource: 5 }),
      'month', weekendRest,
    )
    expect(alloc['2026/06']).toBeCloseTo(5, 5)
    expect(Object.keys(alloc)).toHaveLength(1)
  })
  it('falls back to start period when span has zero working days', () => {
    // 2026/06/27(六)–2026/06/28(日) 全為休息日
    const alloc = allocateTimeResource(
      makeSchedule({ startDate: '2026/06/27', endDate: '2026/06/28', timeResource: 3 }),
      'month', weekendRest,
    )
    expect(alloc).toEqual({ '2026/06': 3 })
  })
  it('allocations sum to timeResource', () => {
    const alloc = allocateTimeResource(makeSchedule({}), 'quarter', weekendRest)
    const sum = Object.values(alloc).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(10, 5)
  })
})

describe('daysBetweenYmd', () => {
  it('computes day difference', () => {
    expect(daysBetweenYmd('2026/07/10', '2026/07/16')).toBe(6)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/__tests__/analytics.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

Create `src/lib/analytics.ts`:

```ts
import { isRestDay } from './restDays'
import { computeStatus } from './status'
import type { ScheduleStatus } from './status'
import type { Schedule, RestDaysConfig } from '../types'

export type TimeScale = 'month' | 'quarter' | 'year'

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('/').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtYmd(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// 期間鍵的字典序即時間序：'2026/07'、'2026 Q3'、'2026'
export function periodKey(d: Date, scale: TimeScale): string {
  const y = d.getFullYear()
  if (scale === 'year') return String(y)
  if (scale === 'quarter') return `${y} Q${Math.floor(d.getMonth() / 3) + 1}`
  return `${y}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function isOverdue(s: Schedule, today: string): boolean {
  return !s.isCompleted && !s.isCancelled && s.endDate < today
}

export function statusCounts(schedules: Schedule[]): Record<ScheduleStatus, number> {
  const counts: Record<ScheduleStatus, number> = {
    Cancelled: 0, Completed: 0, Delayed: 0, Testing: 0, Planned: 0,
  }
  for (const s of schedules) counts[computeStatus(s)]++
  return counts
}

export interface DueCompletion { due: number; completed: number; rate: number | null }

// 已到期完成率：分母 = endDate 已過且未取消；分子 = 其中已完成
export function dueCompletionRate(schedules: Schedule[], today: string): DueCompletion {
  const due = schedules.filter(s => !s.isCancelled && s.endDate < today)
  const completed = due.filter(s => s.isCompleted).length
  return { due: due.length, completed, rate: due.length > 0 ? (completed / due.length) * 100 : null }
}

// 依重疊工作天比例把 timeResource 分攤到各期間；區間內工作天為 0 時整筆歸起始期間
export function allocateTimeResource(
  s: Schedule, scale: TimeScale, rest: RestDaysConfig,
): Record<string, number> {
  const start = parseYmd(s.startDate)
  const end = parseYmd(s.endDate)
  const perPeriod: Record<string, number> = {}
  let total = 0
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (isRestDay(d, rest)) continue
    const key = periodKey(d, scale)
    perPeriod[key] = (perPeriod[key] ?? 0) + 1
    total++
  }
  if (total === 0) return { [periodKey(start, scale)]: s.timeResource }
  const out: Record<string, number> = {}
  for (const [key, days] of Object.entries(perPeriod)) {
    out[key] = (s.timeResource * days) / total
  }
  return out
}

export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000)
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/__tests__/analytics.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics.ts src/__tests__/analytics.test.ts
git commit -m "feat: analytics pure helpers (period keys, overdue, due-completion, day allocation)"
```

---

### Task 11: AnalyticsPage — 單一 sticky 全域篩選列 + 版面骨架

**Files:**
- Modify: `src/components/analytics/AnalyticsPage.tsx`
- Create: `src/components/analytics/ScaleToggle.tsx`

**Interfaces:**
- Produces: `AnalyticsPage` 內部 `filtered: Schedule[]`（全頁單一篩選結果）、`categoryOptions: string[]`（啟用類別、固定順序）、`colorOf(cat: string): string`；`<ScaleToggle value onChange>`（TimeScale segmented control，後續 Task 13/14 共用）。
- 本 task 暫時仍渲染舊元件（KpiCards/TrendChart/LoadChart/ExpiringList）吃 `filtered`，Task 12–16 逐一替換。

- [ ] **Step 1: 建立 ScaleToggle**

Create `src/components/analytics/ScaleToggle.tsx`:

```tsx
import React from 'react'
import type { TimeScale } from '../../lib/analytics'

const OPTIONS: { value: TimeScale; label: string }[] = [
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
  { value: 'year', label: '年' },
]

interface Props {
  value: TimeScale
  onChange: (v: TimeScale) => void
}

const ScaleToggle: React.FC<Props> = ({ value, onChange }) => (
  <div className="inline-flex border border-gray-300 rounded-lg overflow-hidden text-xs">
    {OPTIONS.map(o => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)}
        className={`px-3 py-1 transition-colors ${
          value === o.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
        }`}>
        {o.label}
      </button>
    ))}
  </div>
)

export default ScaleToggle
```

- [ ] **Step 2: 改寫 AnalyticsPage**

改寫 `src/components/analytics/AnalyticsPage.tsx`：保留檔內 `MultiSelect` 元件與 `AnalyticsFilter` 型別原樣，其餘改為：

```tsx
// （檔頭 import 區）
import React, { useState, useMemo } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { useOptionsStore } from '../../store/optionsStore'
import { computeStatus } from '../../lib/status'
import { CATEGORY_COLORS } from '../../constants'
import KpiCards from './KpiCards'
import TrendChart from './TrendChart'
import LoadChart from './LoadChart'
import ExpiringList from './ExpiringList'

const STATUS_OPTIONS = ['Planned', 'Testing', 'Completed', 'Delayed', 'Cancelled']
```

（`MultiSelect`、`AnalyticsFilter`、`emptyFilter`、`isFilterEmpty` 保留；刪除 `FilterBar` 元件與三組區域 filter state。）

主元件改為：

```tsx
const AnalyticsPage: React.FC = () => {
  const schedules = useScheduleStore(s => s.schedules)
  const { options } = useOptionsStore()
  const [filter, setFilter] = useState<AnalyticsFilter>(emptyFilter)

  const categoryOptions = useMemo(
    () => options.categories.filter(c => c.isActive).map(c => c.label).sort(),
    [options.categories]
  )
  const unitOptions = useMemo(
    () => options.testUnits.filter(u => u.isActive).map(u => u.label).sort(),
    [options.testUnits]
  )
  const engineerOptions = useMemo(
    () => options.testUnits
      .flatMap(u => u.engineers)
      .filter(e => e.isActive)
      .map(e => e.label)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort(),
    [options.testUnits]
  )

  // 顏色跟著類別走（啟用類別清單索引），篩選不重排
  const colorOf = useMemo(() => {
    const map = new Map(categoryOptions.map((c, i) => [c, CATEGORY_COLORS[i % CATEGORY_COLORS.length]]))
    return (cat: string) => map.get(cat) ?? CATEGORY_COLORS[CATEGORY_COLORS.length - 1]
  }, [categoryOptions])

  const filtered = useMemo(() => schedules.filter(s => {
    if (filter.categories.length > 0 && !filter.categories.includes(s.category)) return false
    if (filter.testUnits.length > 0 && !filter.testUnits.includes(s.testUnit)) return false
    if (filter.testEngineers.length > 0 && !filter.testEngineers.includes(s.testEngineer)) return false
    if (filter.statuses.length > 0 && !filter.statuses.includes(computeStatus(s))) return false
    return true
  }), [schedules, filter])

  const hasFilter = !isFilterEmpty(filter)

  return (
    <div>
      {/* 全域篩選列：sticky 固定，捲動不消失 */}
      <div className="sticky top-0 z-30 bg-gray-100/95 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800 mr-2">統計分析</h2>
          <span className="text-xs text-gray-500">篩選</span>
          <MultiSelect label="工作類別" options={categoryOptions}
            selected={filter.categories} onChange={v => setFilter({ ...filter, categories: v })} />
          <MultiSelect label="測試單位" options={unitOptions}
            selected={filter.testUnits} onChange={v => setFilter({ ...filter, testUnits: v })} />
          <MultiSelect label="測試人員" options={engineerOptions}
            selected={filter.testEngineers} onChange={v => setFilter({ ...filter, testEngineers: v })} />
          <MultiSelect label="排程狀態" options={STATUS_OPTIONS}
            selected={filter.statuses} onChange={v => setFilter({ ...filter, statuses: v })} />
          {hasFilter && (
            <button type="button" onClick={() => setFilter(emptyFilter)}
              className="px-2.5 py-1 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
              重置
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">整體概覽</h3>
          <KpiCards schedules={filtered} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5">
          <TrendChart schedules={filtered} categories={categoryOptions} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">負載分布</h3>
          <LoadChart schedules={filtered} categories={categoryOptions} showTitle={false} />
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h3 className="text-base font-semibold text-gray-700">風險清單</h3>
          <ExpiringList schedules={filtered} showTitle={false} />
        </section>
      </div>
    </div>
  )
}

export default AnalyticsPage
```

注意：`colorOf` 本 task 尚未被使用（Task 13/14 才吃），TypeScript `noUnusedLocals` 若報錯，先在該行上方加 `// Task 13/14 使用` 並以 `void colorOf` 消音，Task 13 接上後移除。

- [ ] **Step 3: 建置 + 瀏覽器驗證**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 通過。
用 preview 工具啟動 dev server（`.claude/launch.json` 已有設定；沒有對應項目就新增 `{"name":"vsms-dev","runtimeExecutable":"npm","runtimeArgs":["run","dev:client"],"port":5173}`；後端 API 另以 `npm run dev:server` 背景執行或直接用完整 `npm run dev`）。以 admin 登入 → 統計分析頁：確認只剩一條篩選列、置頂捲動不消失、四區塊吃同一篩選、頁面無 emoji。

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/AnalyticsPage.tsx src/components/analytics/ScaleToggle.tsx
git commit -m "refactor: single sticky global filter bar on analytics page"
```

---

### Task 12: KpiSection（行動導向 KPI）

**Files:**
- Create: `src/components/analytics/KpiSection.tsx`
- Delete: `src/components/analytics/KpiCards.tsx`
- Modify: `src/components/analytics/AnalyticsPage.tsx`（換 import 與區塊內容）

**Interfaces:**
- Consumes: `statusCounts`、`dueCompletionRate`、`isOverdue`、`fmtYmd`（Task 10）。
- Produces: `<KpiSection schedules={Schedule[]} />`。

- [ ] **Step 1: 實作 KpiSection**

Create `src/components/analytics/KpiSection.tsx`:

```tsx
import React from 'react'
import { statusCounts, dueCompletionRate, isOverdue, fmtYmd } from '../../lib/analytics'
import type { Schedule } from '../../types'

const CHIPS: { key: 'Planned' | 'Testing' | 'Completed' | 'Delayed' | 'Cancelled'; label: string; cls: string }[] = [
  { key: 'Planned',   label: '計畫中', cls: 'bg-gray-100 text-gray-600' },
  { key: 'Testing',   label: '進行中', cls: 'bg-blue-50 text-blue-700' },
  { key: 'Completed', label: '已完成', cls: 'bg-green-50 text-green-700' },
  { key: 'Delayed',   label: '延遲中', cls: 'bg-red-50 text-red-700' },
  { key: 'Cancelled', label: '已取消', cls: 'bg-gray-900 text-white' },
]

interface Props { schedules: Schedule[] }

const KpiSection: React.FC<Props> = ({ schedules }) => {
  const today = fmtYmd(new Date())
  const counts = statusCounts(schedules)
  const overdue = schedules.filter(s => isOverdue(s, today)).length
  const dc = dueCompletionRate(schedules, today)
  const total = schedules.length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {CHIPS.map(c => (
          <span key={c.key} className={`px-2.5 py-0.5 rounded-full text-xs ${c.cls}`}>
            {c.label} {counts[c.key]}
          </span>
        ))}
        <span className="text-xs text-gray-400">總數 {total}（比率一律排除已取消）</span>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">進行中</p>
          <p className="text-2xl font-semibold text-gray-800 mt-1">{counts.Testing}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4">
          <p className="text-xs text-red-700">已逾期未完成</p>
          <p className="text-2xl font-semibold text-red-700 mt-1">{overdue}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">已到期完成率</p>
          <p className="text-2xl font-semibold text-gray-800 mt-1">
            {dc.rate === null ? '—' : `${dc.rate.toFixed(1)}%`}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">分母僅含已過完成日者（{dc.due} 筆）</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">延遲中</p>
          <p className="text-2xl font-semibold text-gray-800 mt-1">{counts.Delayed}</p>
        </div>
      </div>
    </div>
  )
}

export default KpiSection
```

- [ ] **Step 2: 換裝並刪除舊元件**

`AnalyticsPage.tsx`：`import KpiCards from './KpiCards'` → `import KpiSection from './KpiSection'`；`<KpiCards schedules={filtered} />` → `<KpiSection schedules={filtered} />`。刪除 `src/components/analytics/KpiCards.tsx`。

- [ ] **Step 3: 驗證**

Run: `npx tsc --noEmit`
Expected: 通過。瀏覽器確認：chips 一排 + 四張扁平卡，僅「已逾期未完成」紅色；勾一筆排程為 Cancelled 後（用表單），chips 的已取消 +1、比率分母不含它。

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/KpiSection.tsx src/components/analytics/AnalyticsPage.tsx
git rm src/components/analytics/KpiCards.tsx
git commit -m "feat: action-oriented KPI section (overdue, due-completion rate)"
```

---

### Task 13: TrendSection — 類別趨勢折線 + 圓餅 + 類別 chips + 刻度

**Files:**
- Create: `src/components/analytics/TrendSection.tsx`
- Delete: `src/components/analytics/TrendChart.tsx`
- Modify: `src/components/analytics/AnalyticsPage.tsx`

**Interfaces:**
- Consumes: `periodKey`、`parseYmd`、`TimeScale`（Task 10）；`ScaleToggle`（Task 11）；`colorOf`（Task 11）。
- Produces: `<TrendSection schedules categories colorOf />`，props：`schedules: Schedule[]`、`categories: string[]`、`colorOf: (cat: string) => string`。

- [ ] **Step 1: 實作 TrendSection**

Create `src/components/analytics/TrendSection.tsx`:

```tsx
import React, { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import ScaleToggle from './ScaleToggle'
import { periodKey, parseYmd } from '../../lib/analytics'
import type { TimeScale } from '../../lib/analytics'
import type { Schedule } from '../../types'

interface Props {
  schedules: Schedule[]
  categories: string[]
  colorOf: (cat: string) => string
}

const TrendSection: React.FC<Props> = ({ schedules, categories, colorOf }) => {
  const [scale, setScale] = useState<TimeScale>('month')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [piePeriod, setPiePeriod] = useState('全部')

  const visibleCats = categories.filter(c => !hidden.has(c))

  const toggleCat = (cat: string) => {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // 各排程依起始日歸屬期間
  const withPeriod = useMemo(
    () => schedules.map(s => ({ s, period: periodKey(parseYmd(s.startDate), scale) })),
    [schedules, scale]
  )

  const periodOptions = useMemo(
    () => ['全部', ...Array.from(new Set(withPeriod.map(x => x.period))).sort()],
    [withPeriod]
  )

  // 折線：每期間 × 類別 筆數
  const trendData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    withPeriod.forEach(({ s, period }) => {
      if (!map[period]) {
        map[period] = {}
        visibleCats.forEach(c => { map[period][c] = 0 })
      }
      if (map[period][s.category] !== undefined) map[period][s.category] += 1
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, counts]) => ({ period, ...counts }))
  }, [withPeriod, visibleCats])

  // 圓餅：選定期間內各類別占比
  const pieData = useMemo(() => {
    const rows = withPeriod.filter(x => piePeriod === '全部' || x.period === piePeriod)
    return visibleCats
      .map(cat => ({ name: cat, value: rows.filter(x => x.s.category === cat).length }))
      .filter(d => d.value > 0)
  }, [withPeriod, visibleCats, piePeriod])

  const pieTotal = pieData.reduce((a, b) => a + b.value, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-700">類別趨勢與占比</h3>
        <ScaleToggle value={scale} onChange={v => { setScale(v); setPiePeriod('全部') }} />
      </div>

      {/* 類別 chips：點擊即時顯示/隱藏，同時作用於折線與圓餅 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {categories.map(cat => {
          const off = hidden.has(cat)
          return (
            <button key={cat} type="button" onClick={() => toggleCat(cat)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                off ? 'border-gray-200 text-gray-400 line-through' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}>
              {!off && <span className="w-2 h-2 rounded-full" style={{ background: colorOf(cat) }} />}
              {cat}
            </button>
          )
        })}
        <span className="text-[11px] text-gray-400">點擊切換顯示類別</span>
      </div>

      {schedules.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 h-48 text-sm">尚無資料</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 min-w-0">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                {visibleCats.map(cat => (
                  <Line key={cat} type="monotone" dataKey={cat} stroke={colorOf(cat)}
                    strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-gray-400 mt-1">每期間新增排程數（依起始日期歸屬）</p>
          </div>

          <div className="min-w-0 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  innerRadius={55} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                  {pieData.map(d => <Cell key={d.name} fill={colorOf(d.name)} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 -mt-2">類別占比（共 {pieTotal} 筆）</p>
            <select value={piePeriod} onChange={e => setPiePeriod(e.target.value)}
              className="mt-2 border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none">
              {periodOptions.map(p => <option key={p} value={p}>{p === '全部' ? '期間：全部' : `期間：${p}`}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export default TrendSection
```

- [ ] **Step 2: 換裝並刪除舊元件**

`AnalyticsPage.tsx`：`import TrendChart from './TrendChart'` → `import TrendSection from './TrendSection'`；趨勢 section 改為：

```tsx
        <section className="bg-white rounded-xl border shadow-sm p-5">
          <TrendSection schedules={filtered} categories={categoryOptions} colorOf={colorOf} />
        </section>
```

（此時 `colorOf` 正式被使用，移除 Task 11 的 `void colorOf` 消音。）刪除 `src/components/analytics/TrendChart.tsx`。

- [ ] **Step 3: 驗證**

Run: `npx tsc --noEmit`
Expected: 通過。瀏覽器確認：月/季/年切換折線 X 軸；點類別 chip 折線與圓餅同步隱藏該類別；圓餅期間下拉能選特定月/季/年。

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/TrendSection.tsx src/components/analytics/AnalyticsPage.tsx
git rm src/components/analytics/TrendChart.tsx
git commit -m "feat: category trend with live toggles, time scale and share pie"
```

---

### Task 14: LoadSection — 工作天數堆疊負載

**Files:**
- Create: `src/components/analytics/LoadSection.tsx`
- Delete: `src/components/analytics/LoadChart.tsx`
- Modify: `src/components/analytics/AnalyticsPage.tsx`

**Interfaces:**
- Consumes: `allocateTimeResource`、`periodKey`、`TimeScale`（Task 10）；`ScaleToggle`；`useOptionsStore`（restDays）。
- Produces: `<LoadSection schedules categories colorOf />`。

- [ ] **Step 1: 實作 LoadSection**

Create `src/components/analytics/LoadSection.tsx`:

```tsx
import React, { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import ScaleToggle from './ScaleToggle'
import { useOptionsStore } from '../../store/optionsStore'
import { allocateTimeResource, periodKey } from '../../lib/analytics'
import type { TimeScale } from '../../lib/analytics'
import type { Schedule } from '../../types'

type Dimension = 'engineer' | 'unit'

interface Props {
  schedules: Schedule[]
  categories: string[]
  colorOf: (cat: string) => string
}

const LoadSection: React.FC<Props> = ({ schedules, categories, colorOf }) => {
  const { options } = useOptionsStore()
  const [scale, setScale] = useState<TimeScale>('month')
  const [period, setPeriod] = useState(() => periodKey(new Date(), 'month'))
  const [dim, setDim] = useState<Dimension>('engineer')

  const active = useMemo(() => schedules.filter(s => !s.isCancelled), [schedules])

  // 每筆排程的期間分攤（scale 變更時重算）
  const allocations = useMemo(
    () => active.map(s => ({ s, alloc: allocateTimeResource(s, scale, options.restDays) })),
    [active, scale, options.restDays]
  )

  const periodOptions = useMemo(() => {
    const keys = new Set<string>([periodKey(new Date(), scale)])
    allocations.forEach(({ alloc }) => Object.keys(alloc).forEach(k => keys.add(k)))
    return Array.from(keys).sort()
  }, [allocations, scale])

  const changeScale = (v: TimeScale) => {
    setScale(v)
    setPeriod(periodKey(new Date(), v))
  }

  const data = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    allocations.forEach(({ s, alloc }) => {
      const days = alloc[period] ?? 0
      if (days <= 0) return
      const key = (dim === 'engineer' ? s.testEngineer : s.testUnit) || '未分配'
      if (!map[key]) map[key] = {}
      map[key][s.category] = (map[key][s.category] ?? 0) + days
    })
    return Object.entries(map)
      .map(([name, counts]) => ({
        name, ...counts,
        _total: Object.values(counts).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b._total - a._total)
  }, [allocations, period, dim])

  const chartHeight = Math.max(200, data.length * 32 + 60)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-700">負載分布（工作天）</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ScaleToggle value={scale} onChange={changeScale} />
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none">
            {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="inline-flex border border-gray-300 rounded-lg overflow-hidden text-xs">
            {([['engineer', '人員'], ['unit', '單位']] as [Dimension, string][]).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setDim(v)}
                className={`px-3 py-1 transition-colors ${
                  dim === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 h-40 text-sm">此期間尚無負載資料</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={90} />
              <Tooltip formatter={(value: number | string, name: string) => [`${Number(value).toFixed(1)} 天`, name]} />
              {categories.map(cat => (
                <Bar key={cat} dataKey={cat} stackId="load" fill={colorOf(cat)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-400">
            跨期排程依重疊工作天比例分攤 timeResource；已取消排程不計入
          </p>
        </>
      )}
    </div>
  )
}

export default LoadSection
```

- [ ] **Step 2: 換裝並刪除舊元件**

`AnalyticsPage.tsx`：`import LoadChart from './LoadChart'` → `import LoadSection from './LoadSection'`；負載 section 改為（標題移入元件，section 外層不再放 h3）：

```tsx
        <section className="bg-white rounded-xl border shadow-sm p-5">
          <LoadSection schedules={filtered} categories={categoryOptions} colorOf={colorOf} />
        </section>
```

刪除 `src/components/analytics/LoadChart.tsx`。

- [ ] **Step 3: 驗證**

Run: `npx tsc --noEmit`
Expected: 通過。瀏覽器確認：預設顯示本月、每人一條堆疊 bar、tooltip 顯示各類別 X.X 天、無加總標籤；切「單位」維度、切季/年刻度期間下拉跟著變。

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/LoadSection.tsx src/components/analytics/AnalyticsPage.tsx
git rm src/components/analytics/LoadChart.tsx
git commit -m "feat: workload distribution in working days with scale/period/dimension controls"
```

---

### Task 15: RiskList — 逾期 + 即將到期

**Files:**
- Create: `src/components/analytics/RiskList.tsx`
- Delete: `src/components/analytics/ExpiringList.tsx`
- Modify: `src/components/analytics/AnalyticsPage.tsx`

**Interfaces:**
- Consumes: `isOverdue`、`daysBetweenYmd`、`fmtYmd`（Task 10）。
- Produces: `<RiskList schedules={Schedule[]} />`。

- [ ] **Step 1: 實作 RiskList**

Create `src/components/analytics/RiskList.tsx`:

```tsx
import React, { useMemo } from 'react'
import { isOverdue, daysBetweenYmd, fmtYmd } from '../../lib/analytics'
import type { Schedule } from '../../types'

interface Props { schedules: Schedule[] }

interface RiskRow {
  s: Schedule
  kind: 'overdue' | 'upcoming'
  days: number   // overdue: 逾期天數；upcoming: 剩餘天數
}

const RiskList: React.FC<Props> = ({ schedules }) => {
  const today = fmtYmd(new Date())

  const rows = useMemo<RiskRow[]>(() => {
    const overdue: RiskRow[] = schedules
      .filter(s => isOverdue(s, today))
      .map(s => ({ s, kind: 'overdue' as const, days: daysBetweenYmd(s.endDate, today) }))
      .sort((a, b) => b.days - a.days)
    const upcoming: RiskRow[] = schedules
      .filter(s => {
        if (s.isCompleted || s.isCancelled) return false
        const left = daysBetweenYmd(today, s.endDate)
        return left >= 0 && left <= 7
      })
      .map(s => ({ s, kind: 'upcoming' as const, days: daysBetweenYmd(today, s.endDate) }))
      .sort((a, b) => a.days - b.days)
    return [...overdue, ...upcoming]
  }, [schedules, today])

  if (rows.length === 0) {
    return <p className="text-gray-400 text-sm">目前無逾期或 7 天內到期的排程</p>
  }

  return (
    <div className="divide-y divide-gray-100">
      {rows.map(({ s, kind, days }) => (
        <div key={s.id}
          className="flex items-center gap-3 py-2 pl-3"
          style={{ borderLeft: `3px solid ${kind === 'overdue' ? '#DC2626' : '#D97706'}` }}>
          <span className="font-medium text-gray-800 min-w-[120px] truncate">{s.projectName}</span>
          <span className="text-gray-500 text-sm flex-1 truncate">
            {s.testEngineer || '-'} · {s.testUnit || '-'}
          </span>
          <span className="text-gray-500 text-sm">{s.endDate}</span>
          <span className={`text-sm font-semibold min-w-[80px] text-right ${
            kind === 'overdue' ? 'text-red-600' : 'text-amber-600'
          }`}>
            {kind === 'overdue' ? `逾期 ${days} 天` : days === 0 ? '今天到期' : `剩 ${days} 天`}
          </span>
        </div>
      ))}
    </div>
  )
}

export default RiskList
```

- [ ] **Step 2: 換裝並刪除舊元件**

`AnalyticsPage.tsx`：`import ExpiringList from './ExpiringList'` → `import RiskList from './RiskList'`；風險清單 section 內容換為 `<RiskList schedules={filtered} />`。刪除 `src/components/analytics/ExpiringList.tsx`。

- [ ] **Step 3: 驗證**

Run: `npx tsc --noEmit`
Expected: 通過。瀏覽器確認：逾期列（紅左緣、逾期 N 天）排在前、7 天內到期（黃左緣）在後；把一筆逾期排程勾 Cancelled 後從清單消失。

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/RiskList.tsx src/components/analytics/AnalyticsPage.tsx
git rm src/components/analytics/ExpiringList.tsx
git commit -m "feat: risk list with overdue rows ahead of upcoming deadlines"
```

---

### Task 16: UnitComparison + DelayAnalysis（雙欄）

**Files:**
- Create: `src/components/analytics/UnitComparison.tsx`
- Create: `src/components/analytics/DelayAnalysis.tsx`
- Modify: `src/components/analytics/AnalyticsPage.tsx`

**Interfaces:**
- Consumes: `dueCompletionRate`、`isOverdue`、`fmtYmd`（Task 10）；`computeStatus`。
- Produces: `<UnitComparison schedules />`、`<DelayAnalysis schedules />`。

- [ ] **Step 1: 實作 UnitComparison**

Create `src/components/analytics/UnitComparison.tsx`:

```tsx
import React, { useMemo } from 'react'
import { dueCompletionRate, isOverdue, fmtYmd } from '../../lib/analytics'
import { computeStatus } from '../../lib/status'
import type { Schedule } from '../../types'

interface Props { schedules: Schedule[] }

const UnitComparison: React.FC<Props> = ({ schedules }) => {
  const today = fmtYmd(new Date())

  const rows = useMemo(() => {
    const byUnit = new Map<string, Schedule[]>()
    schedules.filter(s => !s.isCancelled).forEach(s => {
      const key = s.testUnit || '未分配'
      byUnit.set(key, [...(byUnit.get(key) ?? []), s])
    })
    return Array.from(byUnit.entries())
      .map(([unit, list]) => ({
        unit,
        total: list.length,
        dc: dueCompletionRate(list, today),
        delayed: list.filter(s => computeStatus(s) === 'Delayed').length,
        overdue: list.filter(s => isOverdue(s, today)).length,
      }))
      .sort((a, b) => b.total - a.total)
  }, [schedules, today])

  if (rows.length === 0) return <p className="text-gray-400 text-sm">尚無資料</p>

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs">
            <th className="text-left py-1.5 font-medium">單位</th>
            <th className="text-right py-1.5 font-medium">排程數</th>
            <th className="text-right py-1.5 font-medium">已到期完成率</th>
            <th className="text-right py-1.5 font-medium">延遲中</th>
            <th className="text-right py-1.5 font-medium">逾期未完成</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.unit} className="border-t border-gray-100">
              <td className="py-2 text-gray-800">{r.unit}</td>
              <td className="py-2 text-right text-gray-600">{r.total}</td>
              <td className="py-2 text-right text-gray-600">
                {r.dc.rate === null ? '—' : `${r.dc.rate.toFixed(1)}%`}
              </td>
              <td className="py-2 text-right text-gray-600">{r.delayed}</td>
              <td className={`py-2 text-right font-medium ${r.overdue > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {r.overdue}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400 mt-2">指標定義與整體概覽一致，均排除已取消</p>
    </div>
  )
}

export default UnitComparison
```

- [ ] **Step 2: 實作 DelayAnalysis**

Create `src/components/analytics/DelayAnalysis.tsx`:

```tsx
import React, { useMemo } from 'react'
import { computeStatus } from '../../lib/status'
import type { Schedule } from '../../types'

interface Props { schedules: Schedule[] }

const DelayAnalysis: React.FC<Props> = ({ schedules }) => {
  const delayed = useMemo(
    () => schedules.filter(s => computeStatus(s) === 'Delayed'),
    [schedules]
  )

  const byUnit = useMemo(() => {
    const map = new Map<string, number>()
    delayed.forEach(s => {
      const key = s.testUnit || '未分配'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [delayed])

  if (delayed.length === 0) return <p className="text-gray-400 text-sm">目前無延遲中的排程</p>

  const max = byUnit[0][1]

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {byUnit.map(([unit, count]) => (
          <div key={unit} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 shrink-0">{unit}</span>
            <div className="flex-1 h-3 bg-gray-100 rounded-sm overflow-hidden">
              <div className="h-full bg-red-600 rounded-sm" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-xs text-gray-600 w-6 text-right">{count}</span>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs text-gray-400 mb-1.5">延遲原因</p>
        <div className="space-y-1.5">
          {delayed.map(s => (
            <p key={s.id} className="text-sm text-gray-600 leading-snug">
              <span className="font-medium text-gray-800">{s.projectName}</span>
              <span className="text-gray-400"> · {s.testEngineer || '-'}</span>
              {s.delayReason && <span> — {s.delayReason}</span>}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DelayAnalysis
```

- [ ] **Step 3: 接進 AnalyticsPage（雙欄）**

`AnalyticsPage.tsx` import 加：

```tsx
import UnitComparison from './UnitComparison'
import DelayAnalysis from './DelayAnalysis'
```

風險清單 section 之後加：

```tsx
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-700">單位執行比較</h3>
            <UnitComparison schedules={filtered} />
          </section>
          <section className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-700">延遲分析</h3>
            <DelayAnalysis schedules={filtered} />
          </section>
        </div>
```

- [ ] **Step 4: 驗證**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 通過。瀏覽器確認寬螢幕雙欄、窄螢幕單欄。

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/UnitComparison.tsx src/components/analytics/DelayAnalysis.tsx src/components/analytics/AnalyticsPage.tsx
git commit -m "feat: unit execution comparison and delay analysis sections"
```

---

### Task 17: 總驗證 — 測試、建置、端到端瀏覽器檢查

**Files:** 無新增（僅修復發現的問題）。

- [ ] **Step 1: 全部測試 + 建置**

Run: `npx vitest run && npx vitest run --config server/vitest.config.ts && npm run build`
Expected: 全 PASS、build 成功（workload.test.ts 若因他人 WIP 失敗，回報但不修）。

- [ ] **Step 2: 瀏覽器端到端驗證（vite dev server，勿動 3001）**

以 admin 登入逐項確認：

1. 表單：新增排程勾 Cancelled → Completed 被停用；勾 Completed → Cancelled 被停用；Cancelled + Delayed 可並存且延遲原因必填仍生效。
2. 主頁甘特圖：該排程左側標籤顯示深黑色 `✕ Cancelled`；狀態篩選下拉有 Cancelled 且預設未勾（隱藏）。
3. 以 USER 帳號登入編輯自己的排程：Cancelled checkbox 為停用灰色；存檔不影響 isCancelled。
4. 統計頁六區塊 + sticky 篩選列全部依規格運作；頁面無任何 emoji。
5. Excel 匯出檔含 isCancelled 欄；匯出版 Dashboard 的狀態列有 Cancelled checkbox（預設不勾）。
6. DB 抽查：`isCompleted` 勾選後該筆 `completedAt` 有值、取消勾選後清空（可用 Prisma Studio `npx prisma studio` 或直接再打開表單觀察）。

- [ ] **Step 3: 對照 spec 逐節檢查**

打開 `docs/superpowers/specs/2026-07-16-cancelled-status-and-analytics-redesign-design.md`，逐節確認皆有落地；有遺漏即補。

- [ ] **Step 4: Commit（若驗證期間有修復）**

```bash
git add <實際修改的檔案>
git commit -m "fix: address issues found during end-to-end verification"
```
