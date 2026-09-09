# PDN 對 VTMS 檢查與關聯修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 排程表單填入 PDN 後提示「VTMS 已建立此專案（N 個計畫）／尚未建立（相近：…）／無法查詢」，只給 admin 與 super_admin 看，只提示不擋儲存；並修好表單選了 VTMS 計畫卻存不進去的既有 bug。

**Architecture:** VTMS 新增一支 `GET /api/integration/projects`（API key），讓沒開計畫的專案也查得到。VSMS 後端加 `GET /api/schedules/vtms-project-check?pdn=`，比對邏輯抽成純函式 `matchPdn`，VTMS 打不到時回 200 `unavailable`。前端 PDN 欄位失焦查詢並顯示一行提示；儲存後若關聯有變動，呼叫既有的 `PATCH /api/schedules/:id/vtms-link`，該流程抽成純函式 `syncVtmsLink`。

**Tech Stack:** VTMS：Express 5 + drizzle-orm + vitest/supertest（測試與路由同目錄）。VSMS：Express 5 + Prisma 7 + vitest/supertest（`server/src/__tests__/`）、React 19 + Zustand。

## Global Constraints

- **設計文件**：`docs/superpowers/specs/2026-09-09-export-modal-people-tab-pdn-check-design.md` 第三節。有衝突以設計文件為準。
- **兩個 repo**：VTMS 在 `F:\vtms\vtms-export`（分支 `master`），VSMS 在 `F:\vsms\vsms-export`（分支 `feat/guest-role-and-uiux`）。**shell cwd 跨呼叫保留，指令一律用絕對路徑或先確認 `pwd`。**
- **ESM import 一律帶 `.js` 副檔名**（兩個 repo 的 server 都是 NodeNext）。
- **VTMS 型別檢查用 `npm run typecheck`**（`npx tsc --noEmit` 只檢查前端）。VTMS 測試：`npm run test:server -- --run <path>`。
- **VSMS 後端測試**：`npx vitest run --config server/vitest.config.ts`；前端：`npx vitest run`。VSMS server 型別檢查：`npx tsc -p server/tsconfig.json --noEmit`。
- **VSMS 前端既有 9 個 `tsc` 型別錯誤**，其中一個在 `ScheduleFormModal.tsx`（`vtmsPlanId` null）。本計畫會拿掉那一行，數量可能降到 8；**不得增加**。
- **不得執行 `npm run build`**（VSMS 會把別人未提交的 `auth.ts` / `crypto.ts` 編進 `server/dist`；VTMS 的 build 是部署）。**不得執行 `npx vite build`。** 部署是使用者決定的獨立步驟（Task 8）。
- **不得動 port 3001 / 4000 的常駐程序。**
- **絕不在測試中打真的 DB**：VSMS 後端測試一律 mock `../lib/db.js`；VTMS 一律 mock `../db/connection.js`。
- **`unavailable` 回 200 不回 502**：這是提示不是資料。
- **commit 訊息英文**，結尾 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。不推 GitHub。

---

### Task 1: VTMS 新端點 `GET /api/integration/projects`

**Files:**
- Modify: `F:\vtms\vtms-export\server\src\routes\integration.ts`（在 `router.get('/test-plans', …)` 之前插入）
- Test: `F:\vtms\vtms-export\server\src\routes\integration.projects.test.ts`

**Interfaces:**
- Consumes: `db`、`testProjects`、`testPlans`、`isNull`、`requireApiKey`（檔案已 import）
- Produces: `GET /api/integration/projects` → `{ id: string; name: string; productName: string; planCount: number }[]`

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vtms\vtms-export\server\src\routes\integration.projects.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 用「查的是哪一張表」分辨兩次 select，不用呼叫順序（同 integration.stats.test.ts）。
const { projectRows, planRows, selectSpy, tableRef } = vi.hoisted(() => {
  const projectRows = { value: [] as unknown[] };
  const planRows = { value: [] as unknown[] };
  const tableRef = { projects: null as unknown };
  const selectSpy = vi.fn(() => ({
    from: (table: unknown) => ({
      where: async () => (table === tableRef.projects ? projectRows.value : planRows.value),
    }),
  }));
  return { projectRows, planRows, selectSpy, tableRef };
});

vi.mock('../db/connection.js', () => ({ db: { select: selectSpy } }));
vi.mock('../middleware/requireApiKey.js', () => ({
  requireApiKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import express from 'express';
import { testProjects } from '../db/schema.js';
import integrationRouter from './integration.js';

tableRef.projects = testProjects;

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/integration', integrationRouter);
  return a;
}

beforeEach(() => {
  vi.clearAllMocks();
  projectRows.value = [];
  planRows.value = [];
});

describe('GET /api/integration/projects', () => {
  it('returns every live project with its plan count', async () => {
    projectRows.value = [
      { id: 'p1', name: 'PDN-1001', metadata: { productName: 'Alpha' } },
      { id: 'p2', name: 'PDN-1002', metadata: { productName: 'Beta' } },
    ];
    planRows.value = [{ projectId: 'p1' }, { projectId: 'p1' }, { projectId: 'p2' }];

    const res = await request(app()).get('/api/integration/projects');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'p1', name: 'PDN-1001', productName: 'Alpha', planCount: 2 },
      { id: 'p2', name: 'PDN-1002', productName: 'Beta', planCount: 1 },
    ]);
  });

  it('reports planCount 0 for a project with no plans — the whole reason this endpoint exists', async () => {
    projectRows.value = [{ id: 'p3', name: 'PDN-1003', metadata: { productName: 'Gamma' } }];
    planRows.value = [];

    const res = await request(app()).get('/api/integration/projects');

    expect(res.body).toEqual([{ id: 'p3', name: 'PDN-1003', productName: 'Gamma', planCount: 0 }]);
  });

  it('tolerates metadata without productName', async () => {
    projectRows.value = [{ id: 'p4', name: 'PDN-1004', metadata: {} }];

    const res = await request(app()).get('/api/integration/projects');

    expect(res.body[0].productName).toBe('');
  });

  it('returns an empty array when there are no projects', async () => {
    const res = await request(app()).get('/api/integration/projects');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vtms/vtms-export && npm run test:server -- --run server/src/routes/integration.projects.test.ts`
Expected: FAIL，第一項 status 404（路由不存在）

- [ ] **Step 3: 實作路由**

在 `F:\vtms\vtms-export\server\src\routes\integration.ts` 的 `router.get('/test-plans', requireApiKey, …)` **之前**插入：

```ts
// ── GET /api/integration/projects ────────────────────────────────────────────
// VSMS 在排程表單填 PDN 時用它判斷專案是否已在 VTMS 建立。/test-plans 只會
// 帶出「有計畫的專案」，剛建好還沒開計畫的專案會被誤判成不存在，所以另開一支。
// 專案的 name 就是 PDN Number（ProjectEditor 的欄位標籤）。
router.get('/projects', requireApiKey, async (_req, res) => {
  const projects = await db.select({
    id: testProjects.id, name: testProjects.name, metadata: testProjects.metadata,
  }).from(testProjects).where(isNull(testProjects.deletedAt));

  const planRows = await db.select({ projectId: testPlans.projectId })
    .from(testPlans).where(isNull(testPlans.deletedAt));
  const planCount = new Map<string, number>();
  for (const r of planRows) planCount.set(r.projectId, (planCount.get(r.projectId) ?? 0) + 1);

  res.json(projects.map(p => ({
    id: p.id,
    name: p.name,
    productName: (p.metadata as { productName?: string } | null)?.productName ?? '',
    planCount: planCount.get(p.id) ?? 0,
  })));
});
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vtms/vtms-export && npm run test:server -- --run server/src/routes/integration.projects.test.ts`
Expected: 4 passed

- [ ] **Step 5: 型別檢查與全套後端測試**

Run: `cd /f/vtms/vtms-export && npm run typecheck`
Expected: 無錯誤

Run: `cd /f/vtms/vtms-export && npm run test:server -- --run`
Expected: failures 為 0（總數會浮動，只看 failures，見 memory `vtms-server-test-count-unstable`）

- [ ] **Step 6: Commit（VTMS repo）**

```bash
cd /f/vtms/vtms-export && git add server/src/routes/integration.ts server/src/routes/integration.projects.test.ts && git commit -m "feat(integration): expose live projects with plan counts for VSMS PDN check

/test-plans only surfaces projects that already have a plan; a freshly
created project would look missing to VSMS. Additive, no schema change.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: VSMS `vtmsClient.listProjects` 與純函式 `matchPdn`

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\lib\vtmsClient.ts`（檔尾）
- Create: `F:\vsms\vsms-export\server\src\lib\pdnMatch.ts`
- Test: `F:\vsms\vsms-export\server\src\__tests__\pdnMatch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // vtmsClient.ts
  export interface VtmsProject { id: string; name: string; productName: string; planCount: number }
  export function listProjects(): Promise<VtmsProject[]>
  // pdnMatch.ts
  export type PdnCheck =
    | { status: 'found'; name: string; planCount: number }
    | { status: 'not_found'; similar: string[] }
  export const SIMILAR_LIMIT = 5
  export function matchPdn(pdn: string, projects: { name: string; planCount: number }[]): PdnCheck
  ```

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\server\src\__tests__\pdnMatch.test.ts`：

```ts
// server/src/__tests__/pdnMatch.test.ts
// PDN 對 VTMS 專案名稱的比對。VTMS 的 name 是自由文字，所以只做 trim + 不分
// 大小寫的相等；不相等時列出「互相包含」的名稱給人自己判斷，不自動修正。
import { describe, it, expect } from 'vitest'
import { matchPdn, SIMILAR_LIMIT } from '../lib/pdnMatch.js'

const projects = [
  { name: 'PDN-9999', planCount: 2 },
  { name: 'PDN-99990', planCount: 0 },
  { name: 'pdn-12345 ', planCount: 1 },
  { name: 'Other', planCount: 3 },
]

describe('matchPdn', () => {
  it('精確相等回 found 並帶原始名稱與計畫數', () => {
    expect(matchPdn('PDN-9999', projects)).toEqual({ status: 'found', name: 'PDN-9999', planCount: 2 })
  })

  it('比對忽略前後空白與大小寫，但回傳 VTMS 的原始寫法', () => {
    expect(matchPdn('  pdn-12345', projects)).toEqual({ status: 'found', name: 'pdn-12345 ', planCount: 1 })
  })

  it('不相等時列出雙向包含的名稱（少一碼會列出多一碼的、多一碼也會列出少一碼的）', () => {
    expect(matchPdn('PDN-999', projects)).toEqual({ status: 'not_found', similar: ['PDN-9999', 'PDN-99990'] })
    expect(matchPdn('PDN-999901', projects)).toEqual({ status: 'not_found', similar: ['PDN-9999', 'PDN-99990'] })
  })

  it('沒有相近名稱時 similar 為空陣列', () => {
    expect(matchPdn('ZZZ', projects)).toEqual({ status: 'not_found', similar: [] })
  })

  it('similar 依名稱排序且最多 SIMILAR_LIMIT 筆', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `PDN-1${i}`, planCount: 0 })).reverse()
    const r = matchPdn('PDN-1', many)
    expect(r.status).toBe('not_found')
    if (r.status === 'not_found') {
      expect(r.similar).toHaveLength(SIMILAR_LIMIT)
      expect(r.similar).toEqual(['PDN-10', 'PDN-11', 'PDN-12', 'PDN-13', 'PDN-14'])
    }
  })

  it('空清單回 not_found', () => {
    expect(matchPdn('PDN-1', [])).toEqual({ status: 'not_found', similar: [] })
  })

  it('空字串不會把整份清單當成相近', () => {
    expect(matchPdn('   ', projects)).toEqual({ status: 'not_found', similar: [] })
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/pdnMatch.test.ts`
Expected: FAIL，`Cannot find module '../lib/pdnMatch.js'`

- [ ] **Step 3: 實作 `pdnMatch.ts`**

建立 `F:\vsms\vsms-export\server\src\lib\pdnMatch.ts`：

```ts
// server/src/lib/pdnMatch.ts
//
// 排程的 projectName 就是 PDN；VTMS 專案的 name 也是 PDN，但兩邊都是自由
// 文字。這裡只做 trim + 不分大小寫的相等判斷；找不到時列出互相包含的名稱
// 給使用者自己看（例如少打一碼），不做任何自動修正，也不擋儲存。

export type PdnCheck =
  | { status: 'found'; name: string; planCount: number }
  | { status: 'not_found'; similar: string[] }

export const SIMILAR_LIMIT = 5

const norm = (s: string) => s.trim().toLowerCase()

export function matchPdn(pdn: string, projects: { name: string; planCount: number }[]): PdnCheck {
  const key = norm(pdn)
  if (!key) return { status: 'not_found', similar: [] }

  const exact = projects.find(p => norm(p.name) === key)
  if (exact) return { status: 'found', name: exact.name, planCount: exact.planCount }

  const similar = projects
    .filter(p => {
      const n = norm(p.name)
      return n.length > 0 && (n.includes(key) || key.includes(n))
    })
    .map(p => p.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, SIMILAR_LIMIT)

  return { status: 'not_found', similar }
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/pdnMatch.test.ts`
Expected: 7 passed

- [ ] **Step 5: 加 `listProjects` 到 vtmsClient**

在 `F:\vsms\vsms-export\server\src\lib\vtmsClient.ts` 的 `VtmsProgress` interface 之後加：

```ts
export interface VtmsProject {
  id: string
  /** 就是 PDN Number */
  name: string
  productName: string
  planCount: number
}
```

檔尾加：

```ts
export async function listProjects(): Promise<VtmsProject[]> {
  return vtmsGet<VtmsProject[]>('/api/integration/projects');
}
```

- [ ] **Step 6: 型別檢查**

Run: `cd /f/vsms/vsms-export && npx tsc -p server/tsconfig.json --noEmit`
Expected: 無錯誤

- [ ] **Step 7: Commit（VSMS repo）**

```bash
cd /f/vsms/vsms-export && git add server/src/lib/vtmsClient.ts server/src/lib/pdnMatch.ts server/src/__tests__/pdnMatch.test.ts && git commit -m "feat(vtms): add listProjects client and matchPdn for the PDN existence check

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: VSMS 路由 `GET /api/schedules/vtms-project-check`

**Files:**
- Modify: `F:\vsms\vsms-export\server\src\routes\schedules.ts:9`（import）、`:129` 之後（`/vtms-plans` 路由結束處，`/:id/vtms-progress` 之前）
- Test: `F:\vsms\vsms-export\server\src\__tests__\vtmsProjectCheckRoute.test.ts`

**Interfaces:**
- Consumes: `listProjects`（Task 2）、`matchPdn`（Task 2）
- Produces: `GET /api/schedules/vtms-project-check?pdn=<string>` → `PdnCheck | { status: 'unavailable' }`；非 admin/super_admin 403 `ROLE_NOT_ALLOWED`；空 pdn 400

- [ ] **Step 1: 確認 router 是 default export**

Run: `grep -n "^export default" /f/vsms/vsms-export/server/src/routes/schedules.ts`
Expected: `export default router`（若是具名匯出，測試的 import 要跟著改）。

- [ ] **Step 2: 寫失敗的測試**

建立 `F:\vsms\vsms-export\server\src\__tests__\vtmsProjectCheckRoute.test.ts`：

```ts
// server/src/__tests__/vtmsProjectCheckRoute.test.ts
// 掛一個只含 schedules 路由的最小 app。db 與 storage 全部 mock：正式環境的
// DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

const { listProjectsSpy } = vi.hoisted(() => ({ listProjectsSpy: vi.fn() }))

vi.mock('../lib/db.js', () => ({ prisma: {} }))
vi.mock('../lib/storage.js', () => ({ appendAudit: vi.fn() }))
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  applyHeaderAuth: () => true,
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../lib/vtmsClient.js', () => ({
  listProjects: listProjectsSpy,
  listTestPlans: vi.fn(),
  getTestPlanProgress: vi.fn(),
  getTestPlanProgressBatch: vi.fn(),
}))

import schedulesRouter from '../routes/schedules.js'

function app(role: string) {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => {
    (req as unknown as { session: object }).session = { role, username: 'tester' }
    next()
  })
  a.use('/api/schedules', schedulesRouter)
  return a
}

beforeEach(() => { vi.clearAllMocks() })

describe('GET /api/schedules/vtms-project-check', () => {
  it('user 角色 403', async () => {
    const res = await request(app('user')).get('/api/schedules/vtms-project-check?pdn=PDN-1')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('ROLE_NOT_ALLOWED')
    expect(listProjectsSpy).not.toHaveBeenCalled()
  })

  it('guest 角色 403', async () => {
    const res = await request(app('guest')).get('/api/schedules/vtms-project-check?pdn=PDN-1')
    expect(res.status).toBe(403)
  })

  it('空 pdn 400', async () => {
    const res = await request(app('admin')).get('/api/schedules/vtms-project-check?pdn=%20%20')
    expect(res.status).toBe(400)
    expect(listProjectsSpy).not.toHaveBeenCalled()
  })

  it('admin 找到專案回 found', async () => {
    listProjectsSpy.mockResolvedValue([{ id: 'p1', name: 'PDN-1', productName: 'A', planCount: 3 }])
    const res = await request(app('admin')).get('/api/schedules/vtms-project-check?pdn=pdn-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'found', name: 'PDN-1', planCount: 3 })
  })

  it('super_admin 找不到回 not_found 與相近名稱', async () => {
    listProjectsSpy.mockResolvedValue([{ id: 'p1', name: 'PDN-1234', productName: 'A', planCount: 0 }])
    const res = await request(app('super_admin')).get('/api/schedules/vtms-project-check?pdn=PDN-123')
    expect(res.body).toEqual({ status: 'not_found', similar: ['PDN-1234'] })
  })

  it('VTMS 打不到時回 200 unavailable，不是 502', async () => {
    listProjectsSpy.mockRejectedValue(new Error('VTMS request timed out'))
    const res = await request(app('admin')).get('/api/schedules/vtms-project-check?pdn=PDN-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'unavailable' })
  })
})
```

- [ ] **Step 3: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/vtmsProjectCheckRoute.test.ts`
Expected: FAIL（404 或 `listProjects` 不存在）。若失敗原因是 `schedules.ts` 在 import 時就打了沒 mock 的模組，把那個模組加進 `vi.mock` 清單，不要改成打真 DB。

- [ ] **Step 4: 實作路由**

`F:\vsms\vsms-export\server\src\routes\schedules.ts` 第 9 行：

```ts
import { listTestPlans, getTestPlanProgress } from '../lib/vtmsClient.js'
```

改為：

```ts
import { listTestPlans, getTestPlanProgress, listProjects } from '../lib/vtmsClient.js'
import { matchPdn } from '../lib/pdnMatch.js'
```

在 `router.get('/vtms-plans', …)` 的結尾 `});` 之後、`// GET /api/schedules/:id/vtms-progress` 之前插入：

```ts
// GET /api/schedules/vtms-project-check?pdn=… — 排程表單填 PDN 時提示 VTMS 是否已建專案。
// 只給能建排程的角色。這是提示不是資料：VTMS 停機時表單仍要能用，所以回 200
// unavailable 而不是 502；前端也不會因此擋儲存。
router.get('/vtms-project-check', async (req, res) => {
  if (req.session.role !== 'admin' && req.session.role !== 'super_admin') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const pdn = String(req.query.pdn ?? '').trim()
  if (!pdn) {
    res.status(400).json({ ok: false, message: 'pdn 為必填' })
    return
  }
  try {
    res.json(matchPdn(pdn, await listProjects()))
  } catch {
    res.json({ status: 'unavailable' })
  }
})
```

- [ ] **Step 5: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts server/src/__tests__/vtmsProjectCheckRoute.test.ts`
Expected: 6 passed

- [ ] **Step 6: 型別檢查與全套後端測試**

Run: `cd /f/vsms/vsms-export && npx tsc -p server/tsconfig.json --noEmit`
Expected: 無錯誤

Run: `cd /f/vsms/vsms-export && npx vitest run --config server/vitest.config.ts`
Expected: 全 PASS（含別人未提交的 `loginPasswordValidation.test.ts`，它本來就在工作區）

- [ ] **Step 7: Commit（VSMS repo）**

```bash
cd /f/vsms/vsms-export && git add server/src/routes/schedules.ts server/src/__tests__/vtmsProjectCheckRoute.test.ts && git commit -m "feat(schedules): add vtms-project-check for the schedule form PDN hint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 前端 api / types / store

**Files:**
- Modify: `F:\vsms\vsms-export\src\types.ts`（`VtmsTestPlan` interface 之後）
- Modify: `F:\vsms\vsms-export\src\lib\api.ts:130-132`（VTMS progress 區塊）
- Modify: `F:\vsms\vsms-export\src\store\scheduleStore.ts`
- Test: `F:\vsms\vsms-export\src\__tests__\scheduleStore-returnsSaved.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type VtmsProjectCheck =
    | { status: 'found'; name: string; planCount: number }
    | { status: 'not_found'; similar: string[] }
    | { status: 'unavailable' }
  // api.ts
  checkVtmsProject(pdn: string): Promise<VtmsProjectCheck>
  setVtmsLink(scheduleId: string, vtmsPlanId: string | null): Promise<Schedule>
  // scheduleStore.ts
  add(data): Promise<Schedule>          // 原本 Promise<void>
  update(id, data): Promise<Schedule>   // 原本 Promise<void>
  replaceInStore(schedule: Schedule): void
  ```

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\scheduleStore-returnsSaved.test.ts`：

```ts
// src/__tests__/scheduleStore-returnsSaved.test.ts
// 表單儲存後要拿到新排程的 id 才能呼叫 vtms-link，所以 add / update 要回傳
// 後端回來的 Schedule；replaceInStore 讓關聯後的回應可以寫回清單。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useScheduleStore } from '../store/scheduleStore'
import type { Schedule } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

const base: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> = {
  category: 'SIT', projectName: 'PDN-1', taskDescription: 'x', testUnit: 'RA', testEngineer: 'Ben_Ko',
  timeResource: 1, startDate: '2026/09/10', endDate: '2026/09/11', requiredPersonnel: '', testReport: '',
  isCompleted: false, isDelayed: false, isCancelled: false, completedAt: null, delayReason: '',
  adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
}
const saved = (over: Partial<Schedule>): Schedule => ({
  ...base, id: 's1', createdAt: '2026-09-09T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z',
  createdBy: 'a', updatedBy: 'a', ...over,
})

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

beforeEach(() => { useScheduleStore.setState({ schedules: [] }) })

describe('scheduleStore', () => {
  it('add 回傳後端建立的 Schedule 並加進清單', async () => {
    stubFetch(saved({ id: 'new-1' }))
    const result = await useScheduleStore.getState().add(base)
    expect(result.id).toBe('new-1')
    expect(useScheduleStore.getState().schedules.map(s => s.id)).toEqual(['new-1'])
  })

  it('update 回傳更新後的 Schedule', async () => {
    useScheduleStore.setState({ schedules: [saved({ id: 's1', testReport: '' })] })
    stubFetch(saved({ id: 's1', testReport: 'done' }))
    const result = await useScheduleStore.getState().update('s1', { testReport: 'done' })
    expect(result.testReport).toBe('done')
    expect(useScheduleStore.getState().schedules[0].testReport).toBe('done')
  })

  it('replaceInStore 以 id 取代既有那筆，不新增', async () => {
    useScheduleStore.setState({ schedules: [saved({ id: 's1' }), saved({ id: 's2' })] })
    useScheduleStore.getState().replaceInStore(saved({ id: 's1', vtmsPlanId: 'plan-9' }))
    const list = useScheduleStore.getState().schedules
    expect(list).toHaveLength(2)
    expect(list.find(s => s.id === 's1')?.vtmsPlanId).toBe('plan-9')
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/scheduleStore-returnsSaved.test.ts`
Expected: FAIL（`add` 回 undefined、`replaceInStore` 不存在）

- [ ] **Step 3: 改 types.ts**

在 `F:\vsms\vsms-export\src\types.ts` 的 `VtmsTestPlan` interface 結束後加：

```ts
/** GET /api/schedules/vtms-project-check 的回應。unavailable 是 200 不是錯誤。 */
export type VtmsProjectCheck =
  | { status: 'found'; name: string; planCount: number }
  | { status: 'not_found'; similar: string[] }
  | { status: 'unavailable' }
```

- [ ] **Step 4: 改 api.ts**

`F:\vsms\vsms-export\src\lib\api.ts` 頂端的 type import 加入 `VtmsProjectCheck`。把 VTMS progress 區塊：

```ts
  // ── VTMS progress ─────────────────────────────────────
  getScheduleVtmsProgress: (scheduleId: string) =>
    req<VtmsProgress>('GET', `/schedules/${scheduleId}/vtms-progress`),
```

改為：

```ts
  // ── VTMS ──────────────────────────────────────────────
  getScheduleVtmsProgress: (scheduleId: string) =>
    req<VtmsProgress>('GET', `/schedules/${scheduleId}/vtms-progress`),
  checkVtmsProject: (pdn: string) =>
    req<VtmsProjectCheck>('GET', `/schedules/vtms-project-check?pdn=${encodeURIComponent(pdn)}`),
  // 關聯只能走這支：POST/PUT 會把 vtmsPlanId 過濾掉（2026-07-06 安全強化）
  setVtmsLink: (scheduleId: string, vtmsPlanId: string | null) =>
    req<Schedule>('PATCH', `/schedules/${scheduleId}/vtms-link`, { vtmsPlanId }),
```

- [ ] **Step 5: 改 scheduleStore.ts**

把 interface 的：

```ts
  add: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => Promise<void>
  update: (id: string, data: Partial<Schedule>) => Promise<void>
```

改為：

```ts
  add: (data: Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>) => Promise<Schedule>
  update: (id: string, data: Partial<Schedule>) => Promise<Schedule>
  /** 用後端回來的整筆取代清單中同 id 的那筆（例如 vtms-link 之後） */
  replaceInStore: (schedule: Schedule) => void
```

把實作的 `add` / `update`：

```ts
  add: async (data) => {
    const schedule = await api.createSchedule(data)
    set((s) => ({ schedules: [...s.schedules, schedule] }))
  },

  update: async (id, data) => {
    const updated = await api.updateSchedule(id, data)
    set((s) => ({ schedules: s.schedules.map((x) => x.id === id ? updated : x) }))
  },
```

改為：

```ts
  add: async (data) => {
    const schedule = await api.createSchedule(data)
    set((s) => ({ schedules: [...s.schedules, schedule] }))
    return schedule
  },

  update: async (id, data) => {
    const updated = await api.updateSchedule(id, data)
    set((s) => ({ schedules: s.schedules.map((x) => x.id === id ? updated : x) }))
    return updated
  },

  replaceInStore: (schedule) => {
    set((s) => ({ schedules: s.schedules.map((x) => x.id === schedule.id ? schedule : x) }))
  },
```

- [ ] **Step 6: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/scheduleStore-returnsSaved.test.ts`
Expected: 3 passed

- [ ] **Step 7: 型別檢查**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `9`（`add`/`update` 從 void 改成有回傳值，對既有呼叫端相容）

- [ ] **Step 8: Commit（VSMS repo）**

```bash
cd /f/vsms/vsms-export && git add src/types.ts src/lib/api.ts src/store/scheduleStore.ts src/__tests__/scheduleStore-returnsSaved.test.ts && git commit -m "feat(store): return the saved schedule from add/update and add VTMS api helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 純函式 `syncVtmsLink`

**Files:**
- Create: `F:\vsms\vsms-export\src\lib\vtmsLinkAfterSave.ts`
- Test: `F:\vsms\vsms-export\src\__tests__\vtmsLinkAfterSave.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type VtmsLinkSync =
    | { status: 'skipped' }
    | { status: 'linked'; schedule: Schedule }
    | { status: 'failed'; error: unknown }
  export function syncVtmsLink(opts: {
    canLinkVtms: boolean
    savedId: string
    previous: string | null | undefined   // 開表單時的 schedule.vtmsPlanId
    next: string                          // 表單目前選的（'' = 不關聯）
    setLink: (id: string, planId: string | null) => Promise<Schedule>
  }): Promise<VtmsLinkSync>
  ```

- [ ] **Step 1: 寫失敗的測試**

建立 `F:\vsms\vsms-export\src\__tests__\vtmsLinkAfterSave.test.ts`：

```ts
// src/__tests__/vtmsLinkAfterSave.test.ts
// 修 bug：表單選的 VTMS 計畫從來沒存進去（POST/PUT 會把 vtmsPlanId 濾掉，
// 前端又從未呼叫 vtms-link）。儲存後的關聯流程抽成純函式，關聯失敗不能
// 讓「排程已儲存」這件事被誤報成失敗。
import { describe, it, expect, vi } from 'vitest'
import { syncVtmsLink } from '../lib/vtmsLinkAfterSave'
import type { Schedule } from '../types'

const linked = { id: 's1', vtmsPlanId: 'plan-1' } as Schedule

describe('syncVtmsLink', () => {
  it('沒有 canLinkVtms 權限：skipped，不呼叫 API', async () => {
    const setLink = vi.fn()
    const r = await syncVtmsLink({ canLinkVtms: false, savedId: 's1', previous: '', next: 'plan-1', setLink })
    expect(r).toEqual({ status: 'skipped' })
    expect(setLink).not.toHaveBeenCalled()
  })

  it('選擇沒變：skipped（undefined 與空字串視為相同）', async () => {
    const setLink = vi.fn()
    expect(await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: undefined, next: '', setLink })).toEqual({ status: 'skipped' })
    expect(await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: 'plan-1', next: 'plan-1', setLink })).toEqual({ status: 'skipped' })
    expect(setLink).not.toHaveBeenCalled()
  })

  it('新選了計畫：呼叫 setLink 並回 linked', async () => {
    const setLink = vi.fn().mockResolvedValue(linked)
    const r = await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: '', next: 'plan-1', setLink })
    expect(setLink).toHaveBeenCalledWith('s1', 'plan-1')
    expect(r).toEqual({ status: 'linked', schedule: linked })
  })

  it('取消關聯：以 null 呼叫 setLink', async () => {
    const setLink = vi.fn().mockResolvedValue({ id: 's1', vtmsPlanId: undefined } as Schedule)
    await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: 'plan-1', next: '', setLink })
    expect(setLink).toHaveBeenCalledWith('s1', null)
  })

  it('setLink 拋錯：回 failed 帶錯誤，不往外丟', async () => {
    const err = new Error('403')
    const setLink = vi.fn().mockRejectedValue(err)
    const r = await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: '', next: 'plan-1', setLink })
    expect(r).toEqual({ status: 'failed', error: err })
  })
})
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/vtmsLinkAfterSave.test.ts`
Expected: FAIL，`Cannot find module '../lib/vtmsLinkAfterSave'`

- [ ] **Step 3: 實作**

建立 `F:\vsms\vsms-export\src\lib\vtmsLinkAfterSave.ts`：

```ts
// src/lib/vtmsLinkAfterSave.ts
//
// 排程儲存後的 VTMS 關聯同步。POST/PUT /api/schedules 會把 vtmsPlanId 濾掉
// （只能透過 PATCH /:id/vtms-link 寫入，那支會檢查 canLinkVtms），所以表單
// 必須在拿到 saved.id 之後另外呼叫一次。關聯失敗時排程本身已經存好，呼叫端
// 要把這兩件事分開告訴使用者。
import type { Schedule } from '../types'

export type VtmsLinkSync =
  | { status: 'skipped' }
  | { status: 'linked'; schedule: Schedule }
  | { status: 'failed'; error: unknown }

export async function syncVtmsLink(opts: {
  canLinkVtms: boolean
  savedId: string
  previous: string | null | undefined
  next: string
  setLink: (id: string, planId: string | null) => Promise<Schedule>
}): Promise<VtmsLinkSync> {
  if (!opts.canLinkVtms) return { status: 'skipped' }
  if ((opts.previous ?? '') === opts.next) return { status: 'skipped' }
  try {
    const schedule = await opts.setLink(opts.savedId, opts.next || null)
    return { status: 'linked', schedule }
  } catch (error) {
    return { status: 'failed', error }
  }
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd /f/vsms/vsms-export && npx vitest run src/__tests__/vtmsLinkAfterSave.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit（VSMS repo）**

```bash
cd /f/vsms/vsms-export && git add src/lib/vtmsLinkAfterSave.ts src/__tests__/vtmsLinkAfterSave.test.ts && git commit -m "feat(schedule): add syncVtmsLink for the post-save link step

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 表單：PDN 提示與關聯修正

**Files:**
- Modify: `F:\vsms\vsms-export\src\components\schedule\ScheduleFormModal.tsx`：`:1-11`（import）、`:68-76`（store 與 state）、`:88-110`（開啟時的 effect）、`:150-179`（`handleSave`）、`:270-274`（PDN 欄位）

**Interfaces:**
- Consumes: `api.checkVtmsProject`、`api.setVtmsLink`、`replaceInStore`（Task 4）、`syncVtmsLink`（Task 5）、`toast`（`src/store/toastStore.ts`）、`VtmsProjectCheck`（Task 4）
- Produces: 無

- [ ] **Step 1: 改 import**

把：

```tsx
import { ApiError } from '../../lib/api'
```

改為：

```tsx
import { api, ApiError } from '../../lib/api'
import { toast } from '../../store/toastStore'
import { syncVtmsLink } from '../../lib/vtmsLinkAfterSave'
```

把：

```tsx
import type { Schedule, ScheduleFormValues, VtmsTestPlan } from '../../types'
```

改為：

```tsx
import type { Schedule, ScheduleFormValues, VtmsTestPlan, VtmsProjectCheck } from '../../types'
```

- [ ] **Step 2: store 與 state**

把：

```tsx
  const { add, update } = useScheduleStore()
```

改為：

```tsx
  const { add, update, replaceInStore } = useScheduleStore()
```

在 `const [vtmsPlanId, setVtmsPlanId] = useState<string>('')` 之後加：

```tsx
  // PDN 對 VTMS 的檢查結果。只提示，不影響 validate()，不擋儲存。
  const [pdnCheck, setPdnCheck] = useState<{ pdn: string; result: VtmsProjectCheck | 'loading' } | null>(null)

  const runPdnCheck = (raw: string) => {
    const pdn = raw.trim()
    if (isUser || !pdn) { setPdnCheck(null); return }
    setPdnCheck(cur => (cur && cur.pdn === pdn && cur.result !== 'loading') ? cur : { pdn, result: 'loading' })
    api.checkVtmsProject(pdn)
      .catch((): VtmsProjectCheck => ({ status: 'unavailable' }))
      .then(result => setPdnCheck(cur => (cur && cur.pdn === pdn) ? { pdn, result } : cur))
  }
```

（`runPdnCheck` 必須放在下一步的 `useEffect` 之前，否則 effect 內引用會撞 TDZ。）

- [ ] **Step 3: 開啟時對既有 PDN 查一次**

在開啟表單的 `useEffect` 裡，`setVtmsPlanId(schedule.vtmsPlanId ?? '')` 之後加一行：

```tsx
      runPdnCheck(schedule.projectName)
```

在 `else` 分支的 `setVtmsPlanId('')` 之後加：

```tsx
      setPdnCheck(null)
```

- [ ] **Step 4: 改 `handleSave`**

把 `data` 物件裡這一行刪掉（後端本來就會濾掉，留著只會誤導）：

```tsx
      ...(canLinkVtms ? { vtmsPlanId: vtmsPlanId || null } : {}),
```

把：

```tsx
    try {
      if (schedule) await update(schedule.id, data)
      else await add(data)
      onSaved?.({ isCompleted: data.isCompleted })
      onClose()
    } catch (err) {
```

改為：

```tsx
    try {
      const saved = schedule ? await update(schedule.id, data) : await add(data)
      // 關聯只能走 PATCH /:id/vtms-link；失敗時排程已經存好，分開講。
      const link = await syncVtmsLink({
        canLinkVtms, savedId: saved.id, previous: schedule?.vtmsPlanId, next: vtmsPlanId,
        setLink: api.setVtmsLink,
      })
      if (link.status === 'linked') replaceInStore(link.schedule)
      else if (link.status === 'failed') toast.error('排程已儲存，但 VTMS 關聯失敗，請重新開啟排程再試')
      onSaved?.({ isCompleted: data.isCompleted })
      onClose()
    } catch (err) {
```

- [ ] **Step 5: PDN 欄位加 onBlur 與提示**

在 `field` helper 之後（`inputCls` 附近）加提示的渲染函式：

```tsx
  const pdnHint = () => {
    if (!pdnCheck) return null
    const r = pdnCheck.result
    if (r === 'loading') return <p className="text-xs text-gray-400 mt-1">查詢 VTMS 中…</p>
    if (r.status === 'found') {
      return <p className="text-xs text-green-700 mt-1">VTMS 已建立此專案（{r.planCount} 個測試計畫）</p>
    }
    if (r.status === 'not_found') {
      return (
        <p className="text-xs text-amber-700 mt-1">
          VTMS 尚未建立此專案{r.similar.length > 0 ? `。相近：${r.similar.join('、')}` : ''}
        </p>
      )
    }
    return <p className="text-xs text-gray-400 mt-1">目前無法查詢 VTMS</p>
  }
```

把 PDN 欄位：

```tsx
                  {field('PDN Number', 'projectName', (
                    <input type="text" maxLength={FIELD_LIMITS.PROJECT_NAME} value={form.projectName}
                      onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
                      className={inputCls(false)} />
                  ), true)}
```

改為：

```tsx
                  {field('PDN Number', 'projectName', (
                    <>
                      <input type="text" maxLength={FIELD_LIMITS.PROJECT_NAME} value={form.projectName}
                        onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
                        onBlur={e => runPdnCheck(e.target.value)}
                        className={inputCls(false)} />
                      {pdnHint()}
                    </>
                  ), true)}
```

- [ ] **Step 6: 型別檢查與測試**

Run: `cd /f/vsms/vsms-export && npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `8` 或 `9`（拿掉的那行是既有錯誤之一；不得高於 9）

Run: `cd /f/vsms/vsms-export && npx vitest run`
Expected: 全 PASS

- [ ] **Step 7: Commit（VSMS repo）**

```bash
cd /f/vsms/vsms-export && git add src/components/schedule/ScheduleFormModal.tsx && git commit -m "feat(schedule): hint whether the PDN exists in VTMS and persist the plan link

The form has been sending vtmsPlanId in the create/update body since
2026-06-09, but the server strips it (2026-07-06 hardening) and nothing
ever called PATCH /:id/vtms-link, so the selection was silently lost.
Call it after save; a link failure is reported separately because the
schedule itself is already stored.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 實機驗證（不碰正式環境）

**Files:** 無變更。

- [ ] **Step 1: 起 VSMS 開發 server 打真的 VTMS**

VSMS 的 `.env` 已有 `VTMS_API_URL` / `VTMS_API_KEY`（指向正式 VTMS 4000）。**這時 VTMS 正式 server 還沒有 `/projects` 端點**，所以先只驗「unavailable 降級」：

```bash
cd /f/vsms/vsms-export && PORT=3002 npx tsx watch server/src/index.ts
```

用 Browser pane 開 `https://localhost:3002`，以 admin 登入（帳密在 `F:\Server note`；VSMS 單一 session，API 登入會踢掉瀏覽器，注意別在正式站同時登入），新增排程、填任一 PDN 後移開焦點：應顯示「目前無法查詢 VTMS」（VTMS 回 404），儲存不受影響。

- [ ] **Step 2: 驗 found / not_found**

改用 stub 驗比對與顯示，不需要 VTMS：在 harness（memory `vsms-ui-review-2026-09` 的 `_dev-stub.ts`）攔 `/api/schedules/vtms-project-check`，依 `pdn` 參數回 `{status:'found',name:'PDN-1',planCount:3}` 或 `{status:'not_found',similar:['PDN-1234','PDN-12345']}`。確認：
1. 綠字「VTMS 已建立此專案（3 個測試計畫）」。
2. 琥珀字「VTMS 尚未建立此專案。相近：PDN-1234、PDN-12345」。
3. `?role=user` 開編輯：唯讀摘要卡，沒有提示。
4. 提示存在時仍可正常儲存（stub 的 POST 回 201）。

- [ ] **Step 3: 驗關聯修正**

harness 的 stub 攔 `PATCH /api/schedules/:id/vtms-link`，記錄呼叫並回 `{...schedule, vtmsPlanId}`；`/me` 回 `canLinkVtms: true`。開有計畫可選的排程，選一個計畫儲存：stub 應收到一次 PATCH，且列表重開該排程時下拉仍選中。再把 stub 改成回 403：儲存後出現紅色 toast「排程已儲存，但 VTMS 關聯失敗…」，且排程本身仍在清單。

截圖 found 與 not_found 各一張留存。驗完刪除 `_dev-*` 檔。

---

### Task 8: 部署檢查清單（由使用者決定時間，逐項確認後才做）

**Files:** 無變更。

- [ ] **Step 1: 確認 VSMS 未提交的 server 變更怎麼處理**

Run: `cd /f/vsms/vsms-export && git status --short server/`

若仍列出 `server/src/routes/auth.ts`、`server/src/lib/crypto.ts`、`server/src/__tests__/loginPasswordValidation.test.ts`：**停下來問使用者**，那是別人未完成的登入驗證強化，一旦編譯並重啟 VSMS server 就會上線。兩個選項：一起上（需先跑該測試確認全過並由使用者拍板），或 `git stash push -- server/src/routes/auth.ts server/src/lib/crypto.ts server/src/__tests__/loginPasswordValidation.test.ts` 後再編譯、部署完 `git stash pop`。

- [ ] **Step 2: 確認時間不在通知窗口**

Run（PowerShell）: `Get-Date -Format "yyyy-MM-dd HH:mm dddd"`
工作日 09:00–09:35 之間**不要**重啟 VTMS（會觸發補跑寄信給主管）。不要用 bash 的 `TZ=` 判斷，這台機器會回 UTC。

- [ ] **Step 3: VTMS server 部署**

```bash
cd /f/vtms/vtms-export && npm run typecheck && npm run check:releases && npx tsc -p server/tsconfig.json && pm2.cmd restart vtms
```

驗證：`curl -sk -H "X-Api-Key: <VTMS_API_KEY>" https://localhost:4000/api/integration/projects | head -c 300` 回 JSON 陣列。

- [ ] **Step 4: VSMS server 部署**

```bash
cd /f/vsms/vsms-export && npx tsc -p server/tsconfig.json && pm2.cmd restart vsms
```

驗證：`pm2.cmd logs vsms --lines 20 --nostream` 無錯誤；正式站登入後開排程表單填 PDN，提示應為 found / not_found（此時前端仍是舊版，看不到提示是正常的，用 curl 帶 session 打 `/api/schedules/vtms-project-check?pdn=…` 確認即可）。

- [ ] **Step 5: VSMS 前端部署**

```bash
cd /f/vsms/vsms-export && xcopy /E /I /Y dist dist.stable-$(date +%Y%m%d)-pre-pdn && npx vite build
```

驗證：正式站硬重新整理，admin 開新增排程填 PDN 移開焦點，看到提示；選 VTMS 計畫儲存後重開，關聯仍在。

- [ ] **Step 6: 回收 stash**

若 Step 1 有 stash：`cd /f/vsms/vsms-export && git stash pop`，並確認 `git status --short server/` 回到部署前的樣子。
