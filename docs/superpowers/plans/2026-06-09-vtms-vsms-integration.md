# VTMS × VSMS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect VTMS (test management, port 4000, Drizzle/MySQL) and VSMS (schedule management, port 3001, Prisma/MySQL) via a REST API integration layer, enabling schedule-testplan linking, cross-system progress visibility, bidirectional state sync, testplan execution logs, and Copilot Studio Agent endpoints.

**Architecture:** VSMS stores the link (`vtmsPlanId` on Schedule). Each system exposes `/api/integration/*` routes authenticated by `X-Api-Key`. Frontends always call their own backend; backends proxy or push to each other using HTTP clients. VSMS state (isDelayed, isCompleted) for linked schedules is VTMS-driven via server-side push.

**Tech Stack:** Express 5, Drizzle ORM (VTMS), Prisma + PrismaMariaDb adapter (VSMS), MySQL, React 19 + TypeScript (both frontends), Node.js `fetch` for HTTP clients.

---

### Task 1: VSMS — Prisma schema migration

**Files:**
- Modify: `f:\vsms\vsms-export\prisma\schema.prisma`

- [ ] **Step 1: Add vtmsPlanId to Schedule model**

In `prisma/schema.prisma`, add inside the `Schedule` model after `device`:
```prisma
  vtmsPlanId    String?  @db.VarChar(36)
```

- [ ] **Step 2: Add permission flags to User model**

In `prisma/schema.prisma`, add inside the `User` model after `linkedEngineer`:
```prisma
  canLinkVtms         Boolean @default(false)
  canViewVtmsProgress Boolean @default(false)
```

- [ ] **Step 3: Run migration**

```bash
cd f:\vsms\vsms-export
npx prisma migrate dev --name add_vtms_integration
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Verify migration status**

```bash
npx prisma migrate status
```

Expected: `Database schema is up to date!`

- [ ] **Step 5: Commit**

```bash
git -C f:\vsms\vsms-export add prisma/schema.prisma prisma/migrations
git -C f:\vsms\vsms-export commit -m "feat(vsms): add vtmsPlanId and VTMS permission flags to schema"
```

---

### Task 2: VTMS — Add log_categories + test_plan_logs to schema

**Files:**
- Modify: `f:\vtms\vtms-export\server\src\db\schema.ts`
- Modify: `f:\vtms\vtms-export\server\src\lib\migrateColumns.ts`

- [ ] **Step 1: Add table definitions to schema.ts**

Append at the end of `server/src/db/schema.ts` (before `FILE_TABLE_MAP`):
```typescript
// ── Log Categories ────────────────────────────────────────────────────────────
export const logCategories = mysqlTable('log_categories', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  isBuiltIn: tinyint('isBuiltIn').notNull().default(0),
  isActive: tinyint('isActive').notNull().default(1),
  sortOrder: int('sortOrder').notNull().default(0),
  createdAt: varchar('createdAt', { length: 30 }).notNull(),
  updatedAt: varchar('updatedAt', { length: 30 }).notNull(),
});

// ── Test Plan Logs ────────────────────────────────────────────────────────────
export const testPlanLogs = mysqlTable('test_plan_logs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  testPlanId: varchar('testPlanId', { length: 36 }).notNull(),
  date: varchar('date', { length: 10 }).notNull(),
  item: varchar('item', { length: 500 }).notNull(),
  categoryId: varchar('categoryId', { length: 36 }).notNull(),
  categoryName: varchar('categoryName', { length: 100 }).notNull(),
  content: text('content').notNull(),
  authorId: varchar('authorId', { length: 36 }).notNull(),
  authorName: varchar('authorName', { length: 255 }).notNull(),
  createdAt: varchar('createdAt', { length: 30 }).notNull(),
  updatedAt: varchar('updatedAt', { length: 30 }).notNull(),
  deletedAt: varchar('deletedAt', { length: 30 }),
});
```

- [ ] **Step 2: Add createTable calls to migrateColumns.ts**

In `server/src/lib/migrateColumns.ts`, inside `runColumnMigrations()`, append:
```typescript
  await createTableIfMissing(`
    CREATE TABLE IF NOT EXISTS \`log_categories\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`name\` VARCHAR(100) NOT NULL UNIQUE,
      \`isBuiltIn\` TINYINT(1) NOT NULL DEFAULT 0,
      \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` VARCHAR(30) NOT NULL,
      \`updatedAt\` VARCHAR(30) NOT NULL,
      PRIMARY KEY (\`id\`)
    )
  `);

  await createTableIfMissing(`
    CREATE TABLE IF NOT EXISTS \`test_plan_logs\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`testPlanId\` VARCHAR(36) NOT NULL,
      \`date\` VARCHAR(10) NOT NULL,
      \`item\` VARCHAR(500) NOT NULL,
      \`categoryId\` VARCHAR(36) NOT NULL,
      \`categoryName\` VARCHAR(100) NOT NULL,
      \`content\` TEXT NOT NULL,
      \`authorId\` VARCHAR(36) NOT NULL,
      \`authorName\` VARCHAR(255) NOT NULL,
      \`createdAt\` VARCHAR(30) NOT NULL,
      \`updatedAt\` VARCHAR(30) NOT NULL,
      \`deletedAt\` VARCHAR(30) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_tpl_planId\` (\`testPlanId\`),
      INDEX \`idx_tpl_date\` (\`date\`)
    )
  `);
```

- [ ] **Step 3: Restart VTMS server and verify tables exist**

```bash
cd f:\vtms\vtms-export && npm run dev
```

Check MySQL: `SHOW TABLES LIKE 'log_categories'; SHOW TABLES LIKE 'test_plan_logs';`
Expected: both tables listed.

- [ ] **Step 4: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/db/schema.ts server/src/lib/migrateColumns.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): add log_categories and test_plan_logs schema"
```

---

### Task 3: Both systems — requireApiKey middleware

**Files:**
- Create: `f:\vtms\vtms-export\server\src\middleware\requireApiKey.ts`
- Create: `f:\vsms\vsms-export\server\src\middleware\requireApiKey.ts`

- [ ] **Step 1: Create VTMS requireApiKey**

Create `f:\vtms\vtms-export\server\src\middleware\requireApiKey.ts`:
```typescript
import { env } from '../config/env.js';
import type { Request, Response, NextFunction } from 'express';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (!env.integrationApiKey || key !== env.integrationApiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

- [ ] **Step 2: Create VSMS requireApiKey**

Create `f:\vsms\vsms-export\server\src\middleware\requireApiKey.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  const expected = process.env.INTEGRATION_API_KEY;
  if (!expected || key !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

- [ ] **Step 3: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/middleware/requireApiKey.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): add requireApiKey middleware"
git -C f:\vsms\vsms-export add server/src/middleware/requireApiKey.ts
git -C f:\vsms\vsms-export commit -m "feat(vsms): add requireApiKey middleware"
```

---

### Task 4: VTMS — env.ts update + .env additions

**Files:**
- Modify: `f:\vtms\vtms-export\server\src\config\env.ts`

- [ ] **Step 1: Add new fields to RuntimeEnv type and env object**

Replace the entire `env.ts` content with:
```typescript
export type RuntimeEnv = {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  requestBodyLimit: string;
  corsAllowedOrigins: string[];
  httpsCertFile: string | null;
  httpsKeyFile:  string | null;
  integrationApiKey: string;
  vsmsApiUrl: string;
  vsmsApiKey: string;
};

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return parsed;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export const env: RuntimeEnv = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: parsePort(process.env.PORT, 4000),
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || "2mb",
  corsAllowedOrigins: parseCsv(process.env.CORS_ALLOWED_ORIGINS),
  httpsCertFile: process.env.HTTPS_CERT_FILE?.trim() || null,
  httpsKeyFile:  process.env.HTTPS_KEY_FILE?.trim()  || null,
  integrationApiKey: process.env.INTEGRATION_API_KEY ?? '',
  vsmsApiUrl: process.env.VSMS_API_URL ?? 'http://localhost:3001',
  vsmsApiKey: process.env.VSMS_API_KEY ?? '',
};

export function describeRuntimeEnv() {
  return {
    nodeEnv: env.nodeEnv,
    port: env.port,
    requestBodyLimit: env.requestBodyLimit,
    corsAllowedOriginsCount: env.corsAllowedOrigins.length,
    https: env.httpsCertFile !== null && env.httpsKeyFile !== null,
  };
}
```

- [ ] **Step 2: Add env vars to VTMS .env**

In `f:\vtms\vtms-export\.env` (or create if missing), add:
```
INTEGRATION_API_KEY=vtms-integration-secret-change-me
VSMS_API_URL=http://localhost:3001
VSMS_API_KEY=vsms-integration-secret-change-me
```

- [ ] **Step 3: Add env vars to VSMS .env**

In `f:\vsms\vsms-export\.env`, add:
```
INTEGRATION_API_KEY=vsms-integration-secret-change-me
VTMS_API_URL=http://localhost:4000
VTMS_API_KEY=vtms-integration-secret-change-me
```

- [ ] **Step 4: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/config/env.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): add integration env vars to RuntimeEnv"
```

---

### Task 5: VSMS — vtmsClient.ts

**Files:**
- Create: `f:\vsms\vsms-export\server\src\lib\vtmsClient.ts`

- [ ] **Step 1: Create vtmsClient.ts**

```typescript
// server/src/lib/vtmsClient.ts
export interface VtmsTestPlan {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}

export interface VtmsProgressResults {
  pass: number; fail: number; conditional_pass: number;
  blocked: number; not_tested: number; not_applicable: number;
}

export interface VtmsProgress {
  planId: string;
  planName: string;
  planStatus: string;
  totalItems: number;
  latestRunStatus: string | null;
  results: VtmsProgressResults;
  completionPct: number;
}

const VTMS_URL = process.env.VTMS_API_URL ?? 'http://localhost:4000';
const VTMS_KEY = process.env.VTMS_API_KEY ?? '';

async function vtmsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${VTMS_URL}${path}`, {
    headers: { 'X-Api-Key': VTMS_KEY, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`VTMS ${res.status}: ${text}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export async function listTestPlans(): Promise<VtmsTestPlan[]> {
  return vtmsGet<VtmsTestPlan[]>('/api/integration/test-plans');
}

export async function getTestPlanProgress(planId: string): Promise<VtmsProgress> {
  return vtmsGet<VtmsProgress>(`/api/integration/test-plans/${planId}/progress`);
}

export async function getTestPlanProgressBatch(
  ids: string[]
): Promise<Record<string, VtmsProgress>> {
  if (ids.length === 0) return {};
  return vtmsGet<Record<string, VtmsProgress>>(
    `/api/integration/test-plans/progress-batch?ids=${ids.join(',')}`
  );
}
```

- [ ] **Step 2: Commit**

```bash
git -C f:\vsms\vsms-export add server/src/lib/vtmsClient.ts
git -C f:\vsms\vsms-export commit -m "feat(vsms): add vtmsClient HTTP client"
```

---

### Task 6: VTMS — vsmsClient.ts

**Files:**
- Create: `f:\vtms\vtms-export\server\src\lib\vsmsClient.ts`

- [ ] **Step 1: Create vsmsClient.ts**

```typescript
// server/src/lib/vsmsClient.ts
import { env } from '../config/env.js';

export interface VsmsSchedule {
  id: string;
  projectName: string;
  taskDescription: string;
  testEngineer: string;
  startDate: string;
  endDate: string;
  isCompleted: boolean;
  isDelayed: boolean;
  delayReason: string;
}

async function vsmsFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${env.vsmsApiUrl}${path}`, {
    method,
    headers: { 'X-Api-Key': env.vsmsApiKey, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`VSMS ${res.status}: ${text}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export async function getScheduleByPlanId(planId: string): Promise<VsmsSchedule | null> {
  try {
    return await vsmsFetch<VsmsSchedule>('GET', `/api/integration/schedules/by-plan/${planId}`);
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function notifyDelay(
  scheduleId: string,
  date: string,
  content: string
): Promise<void> {
  await vsmsFetch('PATCH', `/api/integration/schedules/${scheduleId}/delay`, { date, content });
}

export async function notifyComplete(scheduleId: string): Promise<void> {
  await vsmsFetch('PATCH', `/api/integration/schedules/${scheduleId}/complete`);
}
```

- [ ] **Step 2: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/lib/vsmsClient.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): add vsmsClient HTTP client"
```

---

### Task 7: VTMS — integration routes (read-only + Agent)

**Files:**
- Create: `f:\vtms\vtms-export\server\src\routes\integration.ts`

**Important:** Register `/test-plans/progress-batch` and `/test-plans/summary` BEFORE `/test-plans/:id/*` to prevent Express matching "progress-batch" as `:id`.

- [ ] **Step 1: Create integration.ts with all read-only endpoints**

```typescript
// server/src/routes/integration.ts
import { Router } from 'express';
import { db } from '../db/connection.js';
import { testPlans, testProjects, testRuns, testResults, taskAssignments, testPlanLogs } from '../db/schema.js';
import { eq, and, isNull, inArray, desc, sql, or } from 'drizzle-orm';
import { requireApiKey } from '../middleware/requireApiKey.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getScheduleByPlanId } from '../lib/vsmsClient.js';
import type { TestPlanItem } from '../types.js';

const router = Router();

// ── Helper: compute progress for a list of planIds ───────────────────────────
interface ProgressResults {
  pass: number; fail: number; conditional_pass: number;
  blocked: number; not_tested: number; not_applicable: number;
}

interface PlanProgress {
  planId: string; planName: string; planStatus: string;
  totalItems: number; latestRunStatus: string | null;
  results: ProgressResults; completionPct: number;
}

async function computeProgressBatch(planIds: string[]): Promise<Record<string, PlanProgress>> {
  if (planIds.length === 0) return {};

  const plans = await db.select({
    id: testPlans.id, name: testPlans.name, status: testPlans.status, items: testPlans.items,
  }).from(testPlans).where(
    and(inArray(testPlans.id, planIds), isNull(testPlans.deletedAt))
  );

  // Latest run per plan
  const runs = await db.select({
    id: testRuns.id, testPlanId: testRuns.testPlanId,
    status: testRuns.status, createdAt: testRuns.createdAt,
  }).from(testRuns).where(
    and(inArray(testRuns.testPlanId, planIds), isNull(testRuns.deletedAt))
  );

  const latestRunMap = new Map<string, { id: string; status: string }>();
  for (const r of runs) {
    const cur = latestRunMap.get(r.testPlanId);
    if (!cur || r.createdAt > cur.id) latestRunMap.set(r.testPlanId, { id: r.id, status: r.status });
  }

  // All results for latest runs
  const runIds = [...latestRunMap.values()].map(r => r.id);
  const resultRows = runIds.length > 0
    ? await db.select({ testRunId: testResults.testRunId, overallResult: testResults.overallResult })
        .from(testResults)
        .where(and(inArray(testResults.testRunId, runIds), isNull(testResults.deletedAt)))
    : [];

  const resultMap = new Map<string, Record<string, number>>();
  for (const r of resultRows) {
    if (!resultMap.has(r.testRunId)) resultMap.set(r.testRunId, {});
    const m = resultMap.get(r.testRunId)!;
    m[r.overallResult] = (m[r.overallResult] ?? 0) + 1;
  }

  const out: Record<string, PlanProgress> = {};
  for (const p of plans) {
    const items = (p.items as TestPlanItem[]) ?? [];
    const totalItems = items.length;
    const latestRun = latestRunMap.get(p.id);
    const counts = latestRun ? (resultMap.get(latestRun.id) ?? {}) : {};
    const pass = counts['pass'] ?? 0;
    const fail = counts['fail'] ?? 0;
    const cp = counts['conditional_pass'] ?? 0;
    const blocked = counts['blocked'] ?? 0;
    const notTested = counts['not_tested'] ?? 0;
    const na = counts['not_applicable'] ?? 0;
    const denominator = totalItems - na;
    const done = pass + fail + cp + blocked;
    const completionPct = denominator > 0 ? Math.round((done / denominator) * 100) : 0;
    out[p.id] = {
      planId: p.id, planName: p.name, planStatus: p.status,
      totalItems, latestRunStatus: latestRun?.status ?? null,
      results: { pass, fail, conditional_pass: cp, blocked, not_tested: notTested, not_applicable: na },
      completionPct,
    };
  }
  return out;
}

// ── GET /api/integration/test-plans ──────────────────────────────────────────
router.get('/test-plans', requireApiKey, async (_req, res) => {
  const plans = await db.select({
    id: testPlans.id, name: testPlans.name,
    projectId: testPlans.projectId, status: testPlans.status,
    plannedStartDate: testPlans.plannedStartDate, plannedEndDate: testPlans.plannedEndDate,
  }).from(testPlans).where(isNull(testPlans.deletedAt)).orderBy(testPlans.createdAt);

  const projectIds = [...new Set(plans.map(p => p.projectId))];
  const projects = projectIds.length > 0
    ? await db.select({ id: testProjects.id, name: testProjects.name })
        .from(testProjects).where(inArray(testProjects.id, projectIds))
    : [];
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(plans.map(p => ({ ...p, projectName: projMap.get(p.projectId) ?? '' })));
});

// ── GET /api/integration/test-plans/progress-batch ───────────────────────────
// MUST be registered before /:id routes
router.get('/test-plans/progress-batch', requireApiKey, async (req, res) => {
  const raw = String(req.query.ids ?? '');
  if (!raw) { res.json({}); return; }
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
  const result = await computeProgressBatch(ids);
  res.json(result);
});

// ── GET /api/integration/test-plans/summary ──────────────────────────────────
router.get('/test-plans/summary', requireApiKey, async (_req, res) => {
  const plans = await db.select({
    id: testPlans.id, status: testPlans.status, items: testPlans.items,
  }).from(testPlans).where(isNull(testPlans.deletedAt));

  const byStatus: Record<string, number> = {
    draft: 0, approved: 0, in_progress: 0, completed: 0, archived: 0,
  };
  for (const p of plans) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

  const activePlanIds = plans
    .filter(p => p.status === 'in_progress' || p.status === 'completed')
    .map(p => p.id);

  const progressMap = await computeProgressBatch(activePlanIds);

  let totalPass = 0, totalDone = 0;
  const plansAtRisk: { planId: string; planName: string; completionPct: number; failCount: number; blockedCount: number }[] = [];

  for (const p of Object.values(progressMap)) {
    const { pass, fail, conditional_pass: cp, blocked } = p.results;
    totalPass += pass + cp;
    totalDone += pass + fail + cp + blocked;
    if (
      p.planStatus === 'in_progress' &&
      ((fail + blocked) >= 3 || p.completionPct < 30)
    ) {
      plansAtRisk.push({
        planId: p.planId, planName: p.planName,
        completionPct: p.completionPct, failCount: fail, blockedCount: blocked,
      });
    }
  }

  const overallPassRate = totalDone > 0 ? Math.round((totalPass / totalDone) * 1000) / 10 : 0;
  res.json({ totalPlans: plans.length, byStatus, overallPassRate, plansAtRisk });
});

// ── GET /api/integration/test-plans/:id/progress ─────────────────────────────
router.get('/test-plans/:id/progress', requireApiKey, async (req, res) => {
  const planId = req.params.id;
  const map = await computeProgressBatch([planId]);
  const progress = map[planId];
  if (!progress) { res.status(404).json({ error: 'Plan not found' }); return; }
  res.json(progress);
});

// ── GET /api/integration/test-plans/:id/failures ─────────────────────────────
router.get('/test-plans/:id/failures', requireApiKey, async (req, res) => {
  const planId = req.params.id;
  const plan = await db.select({ id: testPlans.id, name: testPlans.name })
    .from(testPlans)
    .where(and(eq(testPlans.id, planId), isNull(testPlans.deletedAt)))
    .limit(1);
  if (plan.length === 0) { res.status(404).json({ error: 'Plan not found' }); return; }

  const latestRun = await db.select({ id: testRuns.id, name: testRuns.name })
    .from(testRuns)
    .where(and(eq(testRuns.testPlanId, planId), isNull(testRuns.deletedAt)))
    .orderBy(desc(testRuns.createdAt)).limit(1);

  if (latestRun.length === 0) {
    res.json({ planId, planName: plan[0].name, runId: null, runName: null, failures: [] });
    return;
  }

  const failures = await db.select({
    testCaseId: testResults.testCaseId, testCaseTitle: testResults.testCaseTitle,
    overallResult: testResults.overallResult, testerName: testResults.testerName,
    testDate: testResults.testDate, notes: testResults.notes,
  }).from(testResults).where(
    and(
      eq(testResults.testRunId, latestRun[0].id),
      isNull(testResults.deletedAt),
      or(eq(testResults.overallResult, 'fail'), eq(testResults.overallResult, 'blocked'))
    )
  );

  // Fetch caseNo from test_cases for each failure
  const { testCases: tcTable } = await import('../db/schema.js');
  const tcIds = failures.map(f => f.testCaseId);
  const caseNos = tcIds.length > 0
    ? await db.select({ id: tcTable.id, caseNo: tcTable.caseNo })
        .from(tcTable).where(inArray(tcTable.id, tcIds))
    : [];
  const caseNoMap = new Map(caseNos.map(c => [c.id, c.caseNo]));

  res.json({
    planId,
    planName: plan[0].name,
    runId: latestRun[0].id,
    runName: latestRun[0].name,
    failures: failures.map(f => ({
      testCaseId: f.testCaseId,
      caseNo: caseNoMap.get(f.testCaseId) ?? '',
      testCaseTitle: f.testCaseTitle,
      overallResult: f.overallResult,
      testerName: f.testerName,
      testDate: f.testDate,
      notes: f.notes ?? '',
    })),
  });
});

// ── GET /api/integration/test-plans/:id/logs (Copilot Agent) ─────────────────
router.get('/test-plans/:id/logs', requireApiKey, async (req, res) => {
  const planId = req.params.id;
  const logs = await db.select({
    id: testPlanLogs.id, date: testPlanLogs.date, item: testPlanLogs.item,
    categoryName: testPlanLogs.categoryName, content: testPlanLogs.content,
    authorName: testPlanLogs.authorName, createdAt: testPlanLogs.createdAt,
  }).from(testPlanLogs).where(
    and(eq(testPlanLogs.testPlanId, planId), isNull(testPlanLogs.deletedAt))
  ).orderBy(desc(testPlanLogs.createdAt));
  res.json(logs);
});

// ── GET /api/integration/linked-schedule/:planId (session auth proxy) ────────
router.get('/linked-schedule/:planId', requireAuth, async (req, res) => {
  const planId = req.params.planId;
  try {
    const schedule = await getScheduleByPlanId(planId);
    if (!schedule) { res.status(404).json({ error: 'No linked schedule' }); return; }
    res.json(schedule);
  } catch {
    res.status(502).json({ error: 'VSMS unavailable' });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/routes/integration.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): add integration API routes"
```

---

### Task 8: VTMS — Register integration router in index.ts

**Files:**
- Modify: `f:\vtms\vtms-export\server\src\index.ts`

- [ ] **Step 1: Add import**

After line `import utilRouter from './routes/util.js';`, add:
```typescript
import integrationRouter from './routes/integration.js';
```

- [ ] **Step 2: Register routes**

After line `app.use('/api/util', requireAuth, utilRouter);`, add:
```typescript
app.use('/api/integration', integrationRouter);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd f:\vtms\vtms-export && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Test API key protection manually**

```bash
curl -s http://localhost:4000/api/integration/test-plans
```
Expected: `{"error":"Unauthorized"}`

```bash
curl -s -H "X-Api-Key: vtms-integration-secret-change-me" http://localhost:4000/api/integration/test-plans
```
Expected: JSON array of test plans.

- [ ] **Step 5: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/index.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): register integration router"
```

---

### Task 9: VSMS — integration routes (read + write)

**Files:**
- Create: `f:\vsms\vsms-export\server\src\routes\integration.ts`

- [ ] **Step 1: Create integration.ts**

```typescript
// server/src/routes/integration.ts
import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireApiKey } from '../middleware/requireApiKey.js';
import { getTestPlanProgressBatch } from '../lib/vtmsClient.js';

const router = Router();
router.use(requireApiKey);

function computeStatus(s: { isCompleted: boolean; isDelayed: boolean; startDate: string; endDate: string }) {
  if (s.isCompleted) return 'Completed';
  if (s.isDelayed) return 'Delayed';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(s.startDate.replace(/\//g, '-'));
  const end = new Date(s.endDate.replace(/\//g, '-'));
  if (today >= start && today <= end) return 'Testing';
  return 'Planned';
}

// ── GET /api/integration/schedules ───────────────────────────────────────────
router.get('/schedules', async (req, res) => {
  const { testUnit, isCompleted, isDelayed, dateFrom, dateTo } = req.query;
  const where: Record<string, unknown> = {};
  if (testUnit) where.testUnit = testUnit;
  if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';
  if (isDelayed !== undefined) where.isDelayed = isDelayed === 'true';

  let schedules = await prisma.schedule.findMany({ where });

  if (dateFrom || dateTo) {
    const from = dateFrom ? String(dateFrom) : null;
    const to = dateTo ? String(dateTo) : null;
    schedules = schedules.filter(s => {
      if (from && s.startDate < from) return false;
      if (to && s.endDate > to) return false;
      return true;
    });
  }

  res.json(schedules.map(s => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })));
});

// ── GET /api/integration/schedules/summary ───────────────────────────────────
// MUST be before /schedules/by-plan/:planId
router.get('/schedules/summary', async (_req, res) => {
  const all = await prisma.schedule.findMany();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10).replace(/-/g, '/');

  const byUnit: Record<string, { total: number; completed: number; delayed: number; inProgress: number }> = {};
  let completed = 0, delayed = 0, inProgress = 0, notStarted = 0;

  for (const s of all) {
    const status = computeStatus(s);
    if (!byUnit[s.testUnit]) byUnit[s.testUnit] = { total: 0, completed: 0, delayed: 0, inProgress: 0 };
    byUnit[s.testUnit].total++;
    if (status === 'Completed') { completed++; byUnit[s.testUnit].completed++; }
    if (status === 'Delayed') { delayed++; byUnit[s.testUnit].delayed++; }
    if (status === 'Testing') { inProgress++; byUnit[s.testUnit].inProgress++; }
    if (!s.isCompleted && s.startDate.replace(/\//g, '-') > todayStr.replace(/\//g, '-')) notStarted++;
  }

  res.json({ total: all.length, completed, delayed, inProgress, notStarted, byUnit });
});

// ── GET /api/integration/schedules/by-plan/:planId ───────────────────────────
router.get('/schedules/by-plan/:planId', async (req, res) => {
  const s = await prisma.schedule.findFirst({ where: { vtmsPlanId: req.params.planId } });
  if (!s) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({
    id: s.id, projectName: s.projectName, taskDescription: s.taskDescription,
    testEngineer: s.testEngineer, startDate: s.startDate, endDate: s.endDate,
    isCompleted: s.isCompleted, isDelayed: s.isDelayed, delayReason: s.delayReason,
  });
});

// ── GET /api/integration/schedules-with-progress (A 功能) ───────────────────
router.get('/schedules-with-progress', async (req, res) => {
  const { testUnit, isCompleted, isDelayed, dateFrom, dateTo } = req.query;
  const where: Record<string, unknown> = {};
  if (testUnit) where.testUnit = testUnit;
  if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';
  if (isDelayed !== undefined) where.isDelayed = isDelayed === 'true';

  let schedules = await prisma.schedule.findMany({ where });
  if (dateFrom || dateTo) {
    const from = dateFrom ? String(dateFrom) : null;
    const to = dateTo ? String(dateTo) : null;
    schedules = schedules.filter(s => {
      if (from && s.startDate < from) return false;
      if (to && s.endDate > to) return false;
      return true;
    });
  }

  const linkedIds = [...new Set(
    schedules.filter(s => s.vtmsPlanId).map(s => s.vtmsPlanId!)
  )];

  let progressMap: Record<string, unknown> = {};
  if (linkedIds.length > 0) {
    try {
      progressMap = await getTestPlanProgressBatch(linkedIds);
    } catch {
      // VTMS unavailable — return schedules without progress
    }
  }

  res.json(schedules.map(s => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    vtmsProgress: s.vtmsPlanId ? (progressMap[s.vtmsPlanId] ?? null) : null,
  })));
});

// ── PATCH /api/integration/schedules/:id/delay ───────────────────────────────
router.patch('/schedules/:id/delay', async (req, res) => {
  const { date, content } = req.body as { date: string; content: string };
  if (!date || !content) { res.status(400).json({ error: 'date and content are required' }); return; }

  const s = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!s) { res.status(404).json({ error: 'Not found' }); return; }

  const appendLine = `\n[${date}] ${content.trim()}`;
  const newDelayReason = (s.delayReason ?? '').trimEnd() + appendLine;

  const updated = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { isDelayed: true, delayReason: newDelayReason, updatedBy: 'vtms-sync', updatedAt: new Date() },
  });

  res.json({ id: updated.id, isDelayed: updated.isDelayed, delayReason: updated.delayReason });
});

// ── PATCH /api/integration/schedules/:id/complete ────────────────────────────
router.patch('/schedules/:id/complete', async (req, res) => {
  const s = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!s) { res.status(404).json({ error: 'Not found' }); return; }

  const updated = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { isCompleted: true, updatedBy: 'vtms-sync', updatedAt: new Date() },
  });

  res.json({ id: updated.id, isCompleted: updated.isCompleted });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git -C f:\vsms\vsms-export add server/src/routes/integration.ts
git -C f:\vsms\vsms-export commit -m "feat(vsms): add integration API routes"
```

---

### Task 10: VSMS — Register integration router + update index.ts

**Files:**
- Modify: `f:\vsms\vsms-export\server\src\index.ts`

- [ ] **Step 1: Read current index.ts**

Read `f:\vsms\vsms-export\server\src\index.ts` to find where routes are registered.

- [ ] **Step 2: Add import and router registration**

Add import after existing route imports:
```typescript
import integration from './routes/integration.js';
```

Add registration (before error handler, no auth middleware — requireApiKey is on the router itself):
```typescript
app.use('/api/integration', integration);
```

- [ ] **Step 3: Verify compile and test**

```bash
cd f:\vsms\vsms-export && npx tsc --noEmit
```

Test: `curl -s http://localhost:3001/api/integration/schedules/summary` → `{"error":"Unauthorized"}`

Test with key: `curl -s -H "X-Api-Key: vsms-integration-secret-change-me" http://localhost:3001/api/integration/schedules/summary` → JSON stats object.

- [ ] **Step 4: Commit**

```bash
git -C f:\vsms\vsms-export add server/src/index.ts
git -C f:\vsms\vsms-export commit -m "feat(vsms): register integration router"
```

---

### Task 11: VTMS — logCategories routes + seed

**Files:**
- Create: `f:\vtms\vtms-export\server\src\routes\logCategories.ts`
- Modify: `f:\vtms\vtms-export\server\src\lib\seed.ts`
- Modify: `f:\vtms\vtms-export\server\src\index.ts`

- [ ] **Step 1: Create logCategories route**

```typescript
// server/src/routes/logCategories.ts
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { logCategories } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';

const router = Router();

// GET /api/log-categories
router.get('/', async (_req, res) => {
  const rows = await db.select().from(logCategories)
    .where(eq(logCategories.isActive, 1))
    .orderBy(asc(logCategories.sortOrder), asc(logCategories.name));
  res.json(rows.map(r => ({ ...r, isBuiltIn: Boolean(r.isBuiltIn), isActive: Boolean(r.isActive) })));
});

// POST /api/log-categories (admin only)
router.post('/', async (req, res) => {
  if (req.currentUser?.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' }); return;
  }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  const now = new Date().toISOString();
  const existing = await db.select({ id: logCategories.id })
    .from(logCategories).where(eq(logCategories.name, name.trim())).limit(1);
  if (existing.length > 0) { res.status(409).json({ error: 'Category name already exists' }); return; }

  const rows = await db.select({ sortOrder: logCategories.sortOrder })
    .from(logCategories).orderBy(asc(logCategories.sortOrder));
  const maxSort = rows.length > 0 ? Math.max(...rows.map(r => r.sortOrder)) : -1;

  await db.insert(logCategories).values({
    id: randomUUID(), name: name.trim(), isBuiltIn: 0, isActive: 1,
    sortOrder: maxSort + 1, createdAt: now, updatedAt: now,
  });
  const created = await db.select().from(logCategories)
    .where(eq(logCategories.name, name.trim())).limit(1);
  res.status(201).json({ ...created[0], isBuiltIn: false, isActive: true });
});

// DELETE /api/log-categories/:id (admin, non-built-in)
router.delete('/:id', async (req, res) => {
  if (req.currentUser?.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' }); return;
  }
  const row = await db.select().from(logCategories)
    .where(eq(logCategories.id, req.params.id)).limit(1);
  if (row.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  if (row[0].isBuiltIn) { res.status(403).json({ error: 'Built-in categories cannot be deleted' }); return; }
  await db.delete(logCategories).where(eq(logCategories.id, req.params.id));
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Add "Delay" seed to seed.ts**

In `server/src/lib/seed.ts`, the existing `seedIfEmpty` reads from JSON via readJson. Add a separate function for seeding the Delay category. At the bottom of `seed.ts`, add:

```typescript
import { db as vtmsDb } from '../db/connection.js';
import { logCategories } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function seedLogCategories(): Promise<void> {
  const existing = await vtmsDb.select({ id: logCategories.id })
    .from(logCategories).where(eq(logCategories.name, 'Delay')).limit(1);
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  await vtmsDb.insert(logCategories).values({
    id: randomUUID(), name: 'Delay', isBuiltIn: 1, isActive: 1,
    sortOrder: 0, createdAt: now, updatedAt: now,
  });
  console.log('[seed] Inserted built-in "Delay" log category');
}
```

- [ ] **Step 3: Call seedLogCategories in index.ts**

In `f:\vtms\vtms-export\server\src\index.ts`, after `await seedIfEmpty();`, add:
```typescript
import { seedLogCategories } from './lib/seed.js';
// ...
await seedLogCategories();
```

Also register the logCategories router:
```typescript
import logCategoriesRouter from './routes/logCategories.js';
// ...
app.use('/api/log-categories', requireAuth, logCategoriesRouter);
```

- [ ] **Step 4: Test seed**

Restart server and query:
```bash
curl -s -H "X-Api-Key: vtms-integration-secret-change-me" http://localhost:4000/api/integration/test-plans
# Then verify log categories:
# Login and: GET /api/log-categories → should include { name: "Delay", isBuiltIn: true }
```

- [ ] **Step 5: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/routes/logCategories.ts server/src/lib/seed.ts server/src/index.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): add log categories routes and Delay seed"
```

---

### Task 12: VTMS — testPlanLogs routes (with VSMS Delay + Completed sync)

**Files:**
- Create: `f:\vtms\vtms-export\server\src\routes\testPlanLogs.ts`
- Modify: `f:\vtms\vtms-export\server\src\index.ts`

- [ ] **Step 1: Create testPlanLogs.ts**

```typescript
// server/src/routes/testPlanLogs.ts
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { testPlanLogs, taskAssignments, testPlans, logCategories } from '../db/schema.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { getScheduleByPlanId, notifyDelay } from '../lib/vsmsClient.js';

const router = Router();

// Helper: check if the current user is an assignee of any task in this plan
async function isAssigneeOfPlan(userId: string, testPlanId: string): Promise<boolean> {
  const rows = await db.select({ id: taskAssignments.id })
    .from(taskAssignments)
    .where(and(
      eq(taskAssignments.testPlanId, testPlanId),
      eq(taskAssignments.assigneeId, userId),
      isNull(taskAssignments.deletedAt),
    ))
    .limit(1);
  return rows.length > 0;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/test-plans/:id/logs
router.get('/:id/logs', async (req, res) => {
  const logs = await db.select().from(testPlanLogs)
    .where(and(eq(testPlanLogs.testPlanId, req.params.id), isNull(testPlanLogs.deletedAt)))
    .orderBy(desc(testPlanLogs.date), desc(testPlanLogs.createdAt));
  res.json(logs);
});

// POST /api/test-plans/:id/logs
router.post('/:id/logs', async (req, res) => {
  const userId = req.currentUser?.id ?? '';
  const testPlanId = req.params.id;

  const authorized = req.currentUser?.role === 'admin'
    || await isAssigneeOfPlan(userId, testPlanId);
  if (!authorized) {
    res.status(403).json({ error: 'Only TestPlan assignees can add logs' }); return;
  }

  const { item, categoryId, content } = req.body as {
    item?: string; categoryId?: string; content?: string;
  };
  if (!item?.trim() || !categoryId || !content?.trim()) {
    res.status(400).json({ error: 'item, categoryId, and content are required' }); return;
  }

  const catRow = await db.select().from(logCategories)
    .where(eq(logCategories.id, categoryId)).limit(1);
  if (catRow.length === 0) { res.status(400).json({ error: 'Invalid categoryId' }); return; }

  const now = new Date().toISOString();
  const date = todayStr();
  const logId = randomUUID();
  const categoryName = catRow[0].name;

  await db.insert(testPlanLogs).values({
    id: logId, testPlanId, date, item: item.trim(), categoryId,
    categoryName, content: content.trim(),
    authorId: userId, authorName: req.currentUser?.displayName ?? userId,
    createdAt: now, updatedAt: now,
  });

  // Delay VSMS sync
  if (categoryName === 'Delay') {
    try {
      const plan = await db.select({ id: testPlans.id })
        .from(testPlans)
        .where(and(eq(testPlans.id, testPlanId), isNull(testPlans.deletedAt)))
        .limit(1);
      if (plan.length > 0) {
        // VTMS doesn't store vtmsPlanId; we need to ask VSMS for the linked schedule
        // Use vsmsClient to find if a schedule is linked to this plan
        const schedule = await getScheduleByPlanId(testPlanId);
        if (schedule) {
          await notifyDelay(schedule.id, date, content.trim());
        }
      }
    } catch (e) {
      console.error('[testPlanLogs] VSMS delay sync failed (non-fatal):', e);
    }
  }

  const created = await db.select().from(testPlanLogs)
    .where(eq(testPlanLogs.id, logId)).limit(1);
  res.status(201).json(created[0]);
});

// PATCH /api/test-plans/:planId/logs/:logId
router.patch('/:planId/logs/:logId', async (req, res) => {
  const userId = req.currentUser?.id ?? '';
  const log = await db.select().from(testPlanLogs)
    .where(and(eq(testPlanLogs.id, req.params.logId), isNull(testPlanLogs.deletedAt)))
    .limit(1);
  if (log.length === 0) { res.status(404).json({ error: 'Log not found' }); return; }

  const isAuthor = log[0].authorId === userId;
  const isToday = log[0].date === todayStr();

  if (!isAuthor || !isToday) {
    res.status(403).json({ error: 'You can only edit your own logs created today' }); return;
  }

  const { item, content } = req.body as { item?: string; content?: string };
  const updateData: Record<string, string> = { updatedAt: new Date().toISOString() };
  if (item?.trim()) updateData.item = item.trim();
  if (content?.trim()) updateData.content = content.trim();

  await db.update(testPlanLogs).set(updateData).where(eq(testPlanLogs.id, req.params.logId));
  const updated = await db.select().from(testPlanLogs)
    .where(eq(testPlanLogs.id, req.params.logId)).limit(1);
  res.json(updated[0]);
});

// DELETE /api/test-plans/:planId/logs/:logId
router.delete('/:planId/logs/:logId', async (req, res) => {
  const userId = req.currentUser?.id ?? '';
  const role = req.currentUser?.role ?? '';
  const log = await db.select().from(testPlanLogs)
    .where(and(eq(testPlanLogs.id, req.params.logId), isNull(testPlanLogs.deletedAt)))
    .limit(1);
  if (log.length === 0) { res.status(404).json({ error: 'Log not found' }); return; }

  const isAdmin = role === 'admin';
  const isAuthorToday = log[0].authorId === userId && log[0].date === todayStr();

  if (!isAdmin && !isAuthorToday) {
    res.status(403).json({ error: 'Cannot delete this log' }); return;
  }

  await db.update(testPlanLogs)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(testPlanLogs.id, req.params.logId));
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Register in index.ts**

Add import:
```typescript
import testPlanLogsRouter from './routes/testPlanLogs.js';
```

Add registration (after testPlans route):
```typescript
app.use('/api/test-plans', requireAuth, testPlanLogsRouter);
```

- [ ] **Step 3: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/routes/testPlanLogs.ts server/src/index.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): add testPlanLogs routes with VSMS delay sync"
```

---

### Task 13: VTMS — results.ts Completed trigger

**Files:**
- Modify: `f:\vtms\vtms-export\server\src\routes\results.ts`

- [ ] **Step 1: Read current results.ts PUT handler endpoint**

Find the `router.put('/:taskId', ...)` handler in `results.ts`. After the result is written (after `rows[idx] = {...}` and `writeJson` is called), add the completed check.

- [ ] **Step 2: Add checkAndNotifyCompleted helper**

Add at the top of `results.ts` (after existing imports):
```typescript
import { db } from '../db/connection.js';
import { taskAssignments, testResults, testPlans } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { getScheduleByPlanId, notifyComplete } from '../lib/vsmsClient.js';

async function checkAndNotifyCompleted(testPlanId: string, testRunId: string): Promise<void> {
  try {
    const tasks = await db.select({ id: taskAssignments.id })
      .from(taskAssignments)
      .where(and(
        eq(taskAssignments.testPlanId, testPlanId),
        eq(taskAssignments.testRunId, testRunId),
        isNull(taskAssignments.deletedAt),
        // flaggedForDeletion = 0 or null
      ));

    if (tasks.length === 0) return;

    const results = await db.select({ taskId: testResults.taskId })
      .from(testResults)
      .where(and(
        eq(testResults.testRunId, testRunId),
        isNull(testResults.deletedAt),
      ));

    const resultTaskIds = new Set(results.map(r => r.taskId));
    const allDone = tasks.every(t => resultTaskIds.has(t.id));
    if (!allDone) return;

    const schedule = await getScheduleByPlanId(testPlanId);
    if (!schedule || schedule.isCompleted) return;

    await notifyComplete(schedule.id);
  } catch (e) {
    console.error('[results] VSMS complete sync failed (non-fatal):', e);
  }
}
```

- [ ] **Step 3: Call checkAndNotifyCompleted after result is saved**

In the PUT `/:taskId` handler, after the line that writes the result (after `await writeJson('results.json', rows)`), add:
```typescript
    const savedResult = rows[idx];
    checkAndNotifyCompleted(savedResult.testPlanId, savedResult.testRunId).catch(() => {});
```

(Fire-and-forget — don't await, don't fail the response if VSMS is down.)

- [ ] **Step 4: Compile check**

```bash
cd f:\vtms\vtms-export && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git -C f:\vtms\vtms-export add server/src/routes/results.ts
git -C f:\vtms\vtms-export commit -m "feat(vtms): trigger VSMS completed sync after all tasks done"
```

---

### Task 14: VSMS — schedules.ts proxy endpoints + PATCH vtmsPlanId

**Files:**
- Modify: `f:\vsms\vsms-export\server\src\routes\schedules.ts`

- [ ] **Step 1: Update toSchedule helper to include vtmsPlanId**

In the `toSchedule` function signature, add `vtmsPlanId: string | null` to the parameter type, and add to the return value:
```typescript
vtmsPlanId: s.vtmsPlanId ?? undefined,
```

- [ ] **Step 2: Add vtmsClient imports**

At the top of `schedules.ts`, add:
```typescript
import { listTestPlans, getTestPlanProgress } from '../lib/vtmsClient.js';
```

- [ ] **Step 3: Add vtms-plans proxy endpoint**

After the existing route handlers, add:
```typescript
// GET /api/schedules/vtms-plans — proxy to VTMS, returns TestPlan list for dropdown
router.get('/vtms-plans', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { username: req.session.username ?? '' } });
  if (!user?.canLinkVtms && user?.role !== 'super_admin') {
    res.status(403).json({ error: 'canLinkVtms permission required' }); return;
  }
  try {
    const plans = await listTestPlans();
    res.json(plans);
  } catch {
    res.status(502).json({ error: 'VTMS unavailable' });
  }
});
```

- [ ] **Step 4: Add vtms-progress proxy endpoint**

```typescript
// GET /api/schedules/:id/vtms-progress — proxy to VTMS, returns progress for a linked plan
router.get('/:id/vtms-progress', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { username: req.session.username ?? '' } });
  if (!user?.canViewVtmsProgress && user?.role !== 'super_admin') {
    res.status(403).json({ error: 'canViewVtmsProgress permission required' }); return;
  }
  const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) { res.status(404).json({ error: 'Not found' }); return; }
  if (!schedule.vtmsPlanId) { res.json({ data: null }); return; }
  try {
    const progress = await getTestPlanProgress(schedule.vtmsPlanId);
    res.json({ data: progress });
  } catch {
    res.json({ data: null });
  }
});
```

- [ ] **Step 5: Add PATCH /api/schedules/:id/vtms-link endpoint**

```typescript
// PATCH /api/schedules/:id/vtms-link — set or clear vtmsPlanId (canLinkVtms only)
router.patch('/:id/vtms-link', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { username: req.session.username ?? '' } });
  if (!user?.canLinkVtms && user?.role !== 'super_admin') {
    res.status(403).json({ error: 'canLinkVtms permission required' }); return;
  }
  const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) { res.status(404).json({ error: 'Not found' }); return; }

  const { vtmsPlanId } = req.body as { vtmsPlanId: string | null };
  const updated = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { vtmsPlanId: vtmsPlanId ?? null, updatedBy: req.session.username ?? '', updatedAt: new Date() },
  });
  res.json(toSchedule(updated));
});
```

- [ ] **Step 6: Protect isCompleted/isDelayed/delayReason in PUT /:id for linked schedules**

In the existing `router.put('/:id', ...)` and `router.patch?` handlers, before applying the update, add a guard:
```typescript
  // If schedule is linked to VTMS, block changes to VTMS-controlled fields
  if (existing.vtmsPlanId) {
    const body = req.body as Partial<Schedule>;
    if ('isCompleted' in body || 'isDelayed' in body || 'delayReason' in body) {
      res.status(403).json({
        ok: false,
        message: '此排程已連結 VTMS，isCompleted/isDelayed/delayReason 由 VTMS 控制',
        code: 'VTMS_CONTROLLED',
      });
      return;
    }
  }
```

- [ ] **Step 7: Compile check**

```bash
cd f:\vsms\vsms-export && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git -C f:\vsms\vsms-export add server/src/routes/schedules.ts
git -C f:\vsms\vsms-export commit -m "feat(vsms): add VTMS proxy endpoints and vtmsPlanId link management"
```

---

### Task 15: VSMS — users.ts permission fields CRUD

**Files:**
- Modify: `f:\vsms\vsms-export\server\src\routes\users.ts`

- [ ] **Step 1: Update safeUser helper to include permission fields**

In the `safeUser` function, add to parameter type:
```typescript
  canLinkVtms: boolean;
  canViewVtmsProgress: boolean;
```

And add to return object:
```typescript
    canLinkVtms: u.canLinkVtms,
    canViewVtmsProgress: u.canViewVtmsProgress,
```

- [ ] **Step 2: Update POST /api/users to accept permission fields**

In the `router.post('/')` handler, add `canLinkVtms` and `canViewVtmsProgress` to the destructured body:
```typescript
  const { username, displayName, password, allowedUnits, role, linkedEngineer,
          canLinkVtms, canViewVtmsProgress } = req.body as { ... ; canLinkVtms?: boolean; canViewVtmsProgress?: boolean };
```

And in the `prisma.user.create` call:
```typescript
      canLinkVtms: canLinkVtms ?? false,
      canViewVtmsProgress: canViewVtmsProgress ?? false,
```

- [ ] **Step 3: Update PUT /api/users/:id to accept permission fields**

Read the existing PUT handler; add handling for the new fields in the update data:
```typescript
  const { displayName, isActive, allowedUnits, role, linkedEngineer,
          canLinkVtms, canViewVtmsProgress } = req.body as { ... };
  // In the update data object, add:
  // canLinkVtms: canLinkVtms ?? existing.canLinkVtms,
  // canViewVtmsProgress: canViewVtmsProgress ?? existing.canViewVtmsProgress,
```

- [ ] **Step 4: Compile check**

```bash
cd f:\vsms\vsms-export && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git -C f:\vsms\vsms-export add server/src/routes/users.ts
git -C f:\vsms\vsms-export commit -m "feat(vsms): expose VTMS permission flags in users CRUD"
```

---

### Task 16: VSMS — types.ts updates

**Files:**
- Modify: `f:\vsms\vsms-export\src\types.ts`

- [ ] **Step 1: Add vtmsPlanId to Schedule interface**

After `device: string` in the Schedule interface, add:
```typescript
  vtmsPlanId?: string
```

- [ ] **Step 2: Add permission fields to User interface**

After `lastLoginAt: string` in the User interface, add:
```typescript
  canLinkVtms: boolean
  canViewVtmsProgress: boolean
```

- [ ] **Step 3: Add VtmsProgress type**

After the existing interfaces, add:
```typescript
export interface VtmsProgressResults {
  pass: number; fail: number; conditional_pass: number;
  blocked: number; not_tested: number; not_applicable: number;
}

export interface VtmsProgress {
  planId: string;
  planName: string;
  planStatus: string;
  totalItems: number;
  latestRunStatus: string | null;
  results: VtmsProgressResults;
  completionPct: number;
}

export interface VtmsTestPlan {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}
```

- [ ] **Step 4: Compile check**

```bash
cd f:\vsms\vsms-export && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git -C f:\vsms\vsms-export add src/types.ts
git -C f:\vsms\vsms-export commit -m "feat(vsms): add vtmsPlanId and VTMS permission types"
```

---

### Task 17: VSMS Frontend — permission UI in AccountManagePage / UserManager

**Files:**
- Modify: `f:\vsms\vsms-export\src\components\settings\AccountManagePage.tsx` (or UserManager.tsx — read to determine which file contains the user edit form)

- [ ] **Step 1: Read AccountManagePage.tsx and UserManager.tsx to find user edit form**

Locate the form that has fields like `allowedUnits`, `linkedEngineer`, etc.

- [ ] **Step 2: Add VTMS permission checkboxes to user edit form**

In the user edit form, after the `linkedEngineer` field (or `allowedUnits` section), add:
```tsx
{/* VTMS 整合權限 */}
<div className="mt-4 border-t pt-4">
  <h4 className="text-sm font-medium text-gray-700 mb-2">VTMS 整合權限</h4>
  <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
    <input
      type="checkbox"
      checked={formData.canLinkVtms ?? false}
      onChange={e => setFormData(prev => ({ ...prev, canLinkVtms: e.target.checked }))}
    />
    可連結 VSMS 排程至 VTMS 測試計畫
  </label>
  <label className="flex items-center gap-2 text-sm text-gray-600">
    <input
      type="checkbox"
      checked={formData.canViewVtmsProgress ?? false}
      onChange={e => setFormData(prev => ({ ...prev, canViewVtmsProgress: e.target.checked }))}
    />
    可檢視 VTMS 測試進度統計
  </label>
</div>
```

- [ ] **Step 3: Ensure formData type includes the new fields**

Find the form state type/interface and add `canLinkVtms?: boolean; canViewVtmsProgress?: boolean`.

- [ ] **Step 4: Include in save payload**

When building the PUT/POST body for the user update, include `canLinkVtms` and `canViewVtmsProgress`.

- [ ] **Step 5: Commit**

```bash
git -C f:\vsms\vsms-export add src/components/settings/
git -C f:\vsms\vsms-export commit -m "feat(vsms): add VTMS permission checkboxes to user management UI"
```

---

### Task 18: VSMS Frontend — ScheduleFormModal VTMS link + lock

**Files:**
- Modify: `f:\vsms\vsms-export\src\components\schedule\ScheduleFormModal.tsx`

- [ ] **Step 1: Read the current ScheduleFormModal.tsx**

Find where form fields are rendered, where form state is managed, and where the submit handler calls the API.

- [ ] **Step 2: Add vtms-plans fetch + state**

In the component, add state and effect:
```tsx
const [vtmsPlans, setVtmsPlans] = useState<VtmsTestPlan[]>([]);
const [vtmsPlansLoading, setVtmsPlansLoading] = useState(false);

useEffect(() => {
  if (!currentUser?.canLinkVtms && currentUser?.role !== 'super_admin') return;
  setVtmsPlansLoading(true);
  api<VtmsTestPlan[]>('/api/schedules/vtms-plans')
    .then(setVtmsPlans)
    .catch(() => {})
    .finally(() => setVtmsPlansLoading(false));
}, [currentUser]);
```

- [ ] **Step 3: Add form field for VTMS link**

Only render when `currentUser?.canLinkVtms || currentUser?.role === 'super_admin'`. The field should appear after existing fields:
```tsx
{(currentUser?.canLinkVtms || currentUser?.role === 'super_admin') && (
  <div className="space-y-1">
    <label className="block text-sm font-medium text-gray-700">
      關聯 VTMS 測試計畫 <span className="text-gray-400 font-normal">（選填）</span>
    </label>
    {vtmsPlansLoading ? (
      <div className="h-9 bg-gray-100 rounded animate-pulse" />
    ) : (
      <select
        value={formData.vtmsPlanId ?? ''}
        onChange={e => setFormData(prev => ({ ...prev, vtmsPlanId: e.target.value || undefined }))}
        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— 不連結 —</option>
        {vtmsPlans.map(p => (
          <option key={p.id} value={p.id}>
            {p.projectName} / {p.name} [{p.status}]
          </option>
        ))}
      </select>
    )}
  </div>
)}
```

- [ ] **Step 4: Lock isCompleted / isDelayed for linked schedules**

Find the `isCompleted` and `isDelayed` checkbox fields. Wrap them to be disabled when `schedule?.vtmsPlanId`:
```tsx
<input
  type="checkbox"
  checked={formData.isCompleted}
  disabled={!!schedule?.vtmsPlanId}
  title={schedule?.vtmsPlanId ? '由 VTMS 控制' : undefined}
  onChange={...}
/>
```

Same pattern for `isDelayed` and `delayReason` (make `delayReason` input `readOnly` when linked).

- [ ] **Step 5: Handle vtmsPlanId in save — use PATCH /vtms-link**

After the main schedule save (PUT/POST), if `vtmsPlanId` changed, call:
```typescript
if (vtmsPlanIdChanged) {
  await api(`/api/schedules/${savedId}/vtms-link`, {
    method: 'PATCH',
    body: JSON.stringify({ vtmsPlanId: formData.vtmsPlanId ?? null }),
  });
}
```

- [ ] **Step 6: Compile check and commit**

```bash
cd f:\vsms\vsms-export && npx tsc --noEmit
git add src/components/schedule/ScheduleFormModal.tsx
git commit -m "feat(vsms): add VTMS plan link selector and lock for linked schedules"
```

---

### Task 19: VSMS Frontend — GanttLayout progress column + GanttChart badge

**Files:**
- Modify: `f:\vsms\vsms-export\src\components\schedule\GanttLayout.tsx`
- Modify: `f:\vsms\vsms-export\src\components\schedule\GanttChart.tsx`

- [ ] **Step 1: Read GanttLayout.tsx to understand row structure**

Find where schedule rows are rendered and the column headers.

- [ ] **Step 2: Add progress state to GanttLayout**

Add a progress map state that fetches progress for visible linked schedules:
```tsx
const [progressMap, setProgressMap] = useState<Record<string, VtmsProgress | null>>({});

useEffect(() => {
  if (!currentUser?.canViewVtmsProgress && currentUser?.role !== 'super_admin') return;
  const linkedSchedules = schedules.filter(s => s.vtmsPlanId);
  linkedSchedules.forEach(s => {
    api<{ data: VtmsProgress | null }>(`/api/schedules/${s.id}/vtms-progress`)
      .then(r => setProgressMap(prev => ({ ...prev, [s.id]: r.data })))
      .catch(() => setProgressMap(prev => ({ ...prev, [s.id]: null })));
  });
}, [schedules, currentUser]);
```

- [ ] **Step 3: Add VTMS 進度 column header and cell**

In the column headers (where `專案名稱`, `測試人員`, etc. headers are), add:
```tsx
{(currentUser?.canViewVtmsProgress || currentUser?.role === 'super_admin') && (
  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">VTMS 進度</th>
)}
```

In the row cells, add:
```tsx
{(currentUser?.canViewVtmsProgress || currentUser?.role === 'super_admin') && (
  <td className="px-3 py-2 text-sm">
    {!s.vtmsPlanId ? (
      <span className="text-gray-400 text-xs">未連結</span>
    ) : progressMap[s.id] === undefined ? (
      <span className="text-gray-300 text-xs">…</span>
    ) : progressMap[s.id] === null ? (
      <span className="text-gray-400 text-xs">—</span>
    ) : (
      <span className="text-xs">
        <span className="font-medium">{progressMap[s.id]!.completionPct}%</span>
        {' '}
        <span className="text-green-600">✓{progressMap[s.id]!.results.pass}</span>
        {' '}
        <span className="text-red-500">✗{progressMap[s.id]!.results.fail}</span>
        {progressMap[s.id]!.results.blocked > 0 && (
          <span className="text-orange-500"> ⊘{progressMap[s.id]!.results.blocked}</span>
        )}
      </span>
    )}
  </td>
)}
```

- [ ] **Step 4: Read GanttChart.tsx to find where bars are rendered**

- [ ] **Step 5: Add completionPct badge to Gantt bars**

After the bar element, add a badge that shows only when `canViewVtmsProgress` and a progress is available. Pass `progressMap` as a prop to GanttChart or use context.

```tsx
{canViewVtmsProgress && progress?.completionPct !== undefined && (
  <span
    className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white bg-black/30 px-1 rounded"
    title={`Pass: ${progress.results.pass}, Fail: ${progress.results.fail}, Blocked: ${progress.results.blocked}`}
  >
    {progress.completionPct}%
  </span>
)}
```

- [ ] **Step 6: Compile check and commit**

```bash
cd f:\vsms\vsms-export && npx tsc --noEmit
git -C f:\vsms\vsms-export add src/components/schedule/GanttLayout.tsx src/components/schedule/GanttChart.tsx
git -C f:\vsms\vsms-export commit -m "feat(vsms): add VTMS progress column and Gantt badge"
```

---

### Task 20: VTMS Frontend — TestPlanDetail VSMS schedule card

**Files:**
- Modify: `f:\vtms\vtms-export\src\components\test-plan\TestPlanDetail.tsx`

- [ ] **Step 1: Read TestPlanDetail.tsx to find where to add the card**

Look for the info cards/sections near the top of the detail view.

- [ ] **Step 2: Add state and fetch for linked schedule**

```tsx
const [vsmsSchedule, setVsmsSchedule] = useState<VsmsScheduleInfo | null | 'loading' | 'not-linked'>('loading');

useEffect(() => {
  if (!plan?.id) return;
  api<VsmsScheduleInfo>(`/api/integration/linked-schedule/${plan.id}`)
    .then(s => setVsmsSchedule(s))
    .catch(e => {
      if (e?.status === 404) setVsmsSchedule('not-linked');
      else setVsmsSchedule(null);
    });
}, [plan?.id]);
```

Where `VsmsScheduleInfo` is:
```typescript
interface VsmsScheduleInfo {
  id: string; projectName: string; taskDescription: string; testEngineer: string;
  startDate: string; endDate: string; isCompleted: boolean; isDelayed: boolean; delayReason: string;
}
```

- [ ] **Step 3: Render the schedule card**

```tsx
<div className="border rounded-lg p-4 bg-gray-50">
  <h3 className="text-sm font-semibold text-gray-700 mb-2">關聯 VSMS 排程</h3>
  {vsmsSchedule === 'loading' && <div className="h-16 bg-gray-200 rounded animate-pulse" />}
  {vsmsSchedule === 'not-linked' && (
    <p className="text-sm text-gray-400">此測試計畫尚未關聯 VSMS 排程</p>
  )}
  {vsmsSchedule === null && (
    <p className="text-sm text-gray-400">無法連線至 VSMS</p>
  )}
  {vsmsSchedule && vsmsSchedule !== 'loading' && vsmsSchedule !== 'not-linked' && (
    <div className="text-sm space-y-1">
      <div><span className="font-medium">專案：</span>{vsmsSchedule.projectName}</div>
      <div><span className="font-medium">說明：</span>{vsmsSchedule.taskDescription}</div>
      <div><span className="font-medium">工程師：</span>{vsmsSchedule.testEngineer}</div>
      <div><span className="font-medium">排程：</span>{vsmsSchedule.startDate} ～ {vsmsSchedule.endDate}</div>
      <div className="flex gap-3">
        {vsmsSchedule.isCompleted && (
          <span className="text-green-600 font-medium">✅ Completed</span>
        )}
        {vsmsSchedule.isDelayed && (
          <span className="text-orange-500 font-medium" title={vsmsSchedule.delayReason}>⚠️ Delayed</span>
        )}
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Compile check and commit**

```bash
cd f:\vtms\vtms-export && npx tsc --noEmit
git -C f:\vtms\vtms-export add src/components/test-plan/TestPlanDetail.tsx
git -C f:\vtms\vtms-export commit -m "feat(vtms): add VSMS linked schedule card in TestPlanDetail"
```

---

### Task 21: VTMS Frontend — MyTasksPage product name column + log button

**Files:**
- Modify: `f:\vtms\vtms-export\src\components\testing\MyTasksPage.tsx`

- [ ] **Step 1: Expand projects query type**

Find the `api<{ id: string; name: string }[]>('/api/projects')` call (around line 341). Change the type to:
```typescript
api<{ id: string; name: string; metadata: { productName: string } }[]>('/api/projects')
```

- [ ] **Step 2: Add productNameMap**

After the `projectMap` is built (around line 394), add:
```typescript
const productNameMap = new Map(projects.map(p => [p.id, p.metadata?.productName ?? '']));
```

- [ ] **Step 3: Add product name column to personal plan list header (line ~617)**

After `<th>專案</th>`, add:
```tsx
<th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">產品名稱</th>
```

- [ ] **Step 4: Add product name cell and log button to personal plan rows**

In the personal plan row (`<tr>` inside the list), after the 專案 `<td>`, add:
```tsx
<td className="px-3 py-2 text-sm text-gray-600">
  {productNameMap.get(plan.projectId) ?? ''}
</td>
```

Add a 日誌 button at the end of each row (before closing `</tr>`):
```tsx
<td className="px-3 py-2">
  <button
    onClick={() => { setSelectedPlanId(plan.id); setSidePanelMode('logs'); }}
    className="text-xs text-blue-600 hover:underline"
  >
    📋 日誌
  </button>
</td>
```

- [ ] **Step 5: Add state and sidePanelMode logic**

Add state:
```typescript
const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
const [sidePanelMode, setSidePanelMode] = useState<'tasks' | 'logs' | null>(null);
```

In the `sidePanelContent` logic (around line 874), add a case:
```tsx
if (sidePanelMode === 'logs' && selectedPlanId) {
  sidePanelContent = <PlanLogPanel planId={selectedPlanId} onClose={() => setSidePanelMode(null)} />;
}
```

- [ ] **Step 6: Repeat for admin plan list (line ~758)**

Apply the same column addition (`產品名稱` header, cell, and 日誌 button) to the admin plan list section.

- [ ] **Step 7: Compile check and commit**

```bash
cd f:\vtms\vtms-export && npx tsc --noEmit
git -C f:\vtms\vtms-export add src/components/testing/MyTasksPage.tsx
git -C f:\vtms\vtms-export commit -m "feat(vtms): add product name column and log button to MyTasksPage"
```

---

### Task 22: VTMS Frontend — PlanLogPanel component

**Files:**
- Create: `f:\vtms\vtms-export\src\components\testing\PlanLogPanel.tsx`

- [ ] **Step 1: Create PlanLogPanel.tsx**

```tsx
// src/components/testing/PlanLogPanel.tsx
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

interface LogCategory { id: string; name: string; isBuiltIn: boolean; }
interface PlanLog {
  id: string; date: string; item: string; categoryName: string;
  content: string; authorName: string; authorId: string; createdAt: string;
}
interface NewLogForm { item: string; categoryId: string; content: string; }

export default function PlanLogPanel({ planId, onClose }: { planId: string; onClose: () => void }) {
  const currentUser = useAuthStore(s => s.user);
  const [logs, setLogs] = useState<PlanLog[]>([]);
  const [categories, setCategories] = useState<LogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewLogForm>({ item: '', categoryId: '', content: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    Promise.all([
      api<PlanLog[]>(`/api/test-plans/${planId}/logs`),
      api<LogCategory[]>('/api/log-categories'),
    ]).then(([l, c]) => {
      setLogs(l);
      setCategories(c);
      if (c.length > 0) setForm(f => ({ ...f, categoryId: c[0].id }));
    }).finally(() => setLoading(false));
  }, [planId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.item.trim() || !form.categoryId || !form.content.trim()) {
      setError('請填寫所有欄位'); return;
    }
    setSubmitting(true);
    try {
      const created = await api<PlanLog>(`/api/test-plans/${planId}/logs`, {
        method: 'POST',
        body: JSON.stringify({ item: form.item, categoryId: form.categoryId, content: form.content }),
      });
      setLogs(prev => [created, ...prev]);
      setForm({ item: '', categoryId: categories[0]?.id ?? '', content: '' });
      setShowForm(false);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '新增失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(logId: string) {
    if (!confirm('確定刪除這筆日誌？')) return;
    try {
      await api(`/api/test-plans/${planId}/logs/${logId}`, { method: 'DELETE' });
      setLogs(prev => prev.filter(l => l.id !== logId));
    } catch {
      alert('刪除失敗');
    }
  }

  function canEdit(log: PlanLog) {
    return log.authorId === currentUser?.id && log.date === today;
  }
  function canDelete(log: PlanLog) {
    return currentUser?.role === 'admin' || (log.authorId === currentUser?.id && log.date === today);
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">執行日誌</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>

      <button
        onClick={() => setShowForm(v => !v)}
        className="mb-3 text-sm text-blue-600 hover:underline self-start"
      >
        {showForm ? '— 收起' : '+ 新增記錄'}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-2 bg-gray-50 p-3 rounded border text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">日期</label>
            <input value={today} readOnly className="w-full border rounded px-2 py-1 bg-gray-100 text-gray-500 text-xs" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">項目 *</label>
            <input
              value={form.item}
              onChange={e => setForm(f => ({ ...f, item: e.target.value }))}
              className="w-full border rounded px-2 py-1"
              placeholder="事件項目名稱"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">類別 *</label>
            <select
              value={form.categoryId}
              onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
              className="w-full border rounded px-2 py-1"
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">內容 *</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={3}
              className="w-full border rounded px-2 py-1 resize-none"
              placeholder="描述事件內容..."
            />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? '儲存中…' : '儲存'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">載入中…</div>
      ) : logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">尚無日誌記錄</div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          {logs.map(log => (
            <div key={log.id} className="border rounded p-3 bg-white text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{log.date}</span>
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{log.categoryName}</span>
              </div>
              <p className="font-medium text-gray-800">{log.item}</p>
              <p className="text-gray-600 mt-1 whitespace-pre-wrap">{log.content}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">— {log.authorName}</span>
                <div className="flex gap-2">
                  {canDelete(log) && (
                    <button onClick={() => handleDelete(log.id)} className="text-xs text-red-500 hover:underline">刪除</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Compile check and commit**

```bash
cd f:\vtms\vtms-export && npx tsc --noEmit
git -C f:\vtms\vtms-export add src/components/testing/PlanLogPanel.tsx
git -C f:\vtms\vtms-export commit -m "feat(vtms): add PlanLogPanel component"
```

---

### Task 23: VTMS Frontend — SettingsPage LogCategoryManager

**Files:**
- Create: `f:\vtms\vtms-export\src\components\settings\LogCategoryManager.tsx`
- Modify: `f:\vtms\vtms-export\src\components\settings\SettingsPage.tsx`

- [ ] **Step 1: Create LogCategoryManager.tsx**

```tsx
// src/components/settings/LogCategoryManager.tsx
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface LogCategory { id: string; name: string; isBuiltIn: boolean; isActive: boolean; }

export default function LogCategoryManager() {
  const [categories, setCategories] = useState<LogCategory[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<LogCategory[]>('/api/log-categories').then(setCategories).catch(() => {});
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const created = await api<LogCategory>('/api/log-categories', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setCategories(prev => [...prev, created]);
      setNewName('');
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '新增失敗');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`確定刪除類別「${name}」？`)) return;
    try {
      await api(`/api/log-categories/${id}`, { method: 'DELETE' });
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch {
      alert('刪除失敗');
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">日誌類別管理</h3>
      <div className="space-y-2">
        {categories.map(c => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2 border rounded bg-white text-sm">
            <span>{c.name}</span>
            {c.isBuiltIn ? (
              <span className="text-xs text-gray-400 flex items-center gap-1">🔒 內建</span>
            ) : (
              <button
                onClick={() => handleDelete(c.id, c.name)}
                className="text-xs text-red-500 hover:underline"
              >
                刪除
              </button>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="新增類別名稱"
          className="flex-1 border rounded px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={adding}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          新增
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add LogCategoryManager to SettingsPage**

Read `SettingsPage.tsx` to find where admin-only sections are added, then insert:
```tsx
import LogCategoryManager from './LogCategoryManager';
// ...
{currentUser?.role === 'admin' && (
  <section className="bg-white rounded-lg border p-6">
    <LogCategoryManager />
  </section>
)}
```

- [ ] **Step 3: Compile check and commit**

```bash
cd f:\vtms\vtms-export && npx tsc --noEmit
git -C f:\vtms\vtms-export add src/components/settings/LogCategoryManager.tsx src/components/settings/SettingsPage.tsx
git -C f:\vtms\vtms-export commit -m "feat(vtms): add LogCategoryManager to SettingsPage"
```

---

### Task 24: OpenAPI specs (both systems)

**Files:**
- Create: `f:\vtms\vtms-export\openapi-integration.yaml`
- Create: `f:\vsms\vsms-export\openapi-integration.yaml`

- [ ] **Step 1: Create VTMS openapi-integration.yaml**

```yaml
openapi: 3.0.3
info:
  title: VTMS Integration API
  version: 1.0.0
  description: Cross-system integration endpoints for VSMS and Copilot Studio Agent

servers:
  - url: http://localhost:4000
    description: Local development

security:
  - apiKey: []

components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: X-Api-Key
  schemas:
    ProgressResults:
      type: object
      properties:
        pass: { type: integer }
        fail: { type: integer }
        conditional_pass: { type: integer }
        blocked: { type: integer }
        not_tested: { type: integer }
        not_applicable: { type: integer }
    PlanProgress:
      type: object
      properties:
        planId: { type: string }
        planName: { type: string }
        planStatus: { type: string }
        totalItems: { type: integer }
        latestRunStatus: { type: string, nullable: true }
        results: { $ref: '#/components/schemas/ProgressResults' }
        completionPct: { type: integer }

paths:
  /api/integration/test-plans:
    get:
      summary: List all test plans
      operationId: listTestPlans
      responses:
        '200':
          description: Array of test plans
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id: { type: string }
                    name: { type: string }
                    projectId: { type: string }
                    projectName: { type: string }
                    status: { type: string }
                    plannedStartDate: { type: string, nullable: true }
                    plannedEndDate: { type: string, nullable: true }

  /api/integration/test-plans/progress-batch:
    get:
      summary: Batch progress query
      operationId: getProgressBatch
      parameters:
        - name: ids
          in: query
          required: true
          schema: { type: string }
          description: Comma-separated plan IDs (max 100)
      responses:
        '200':
          description: Map of planId to PlanProgress
          content:
            application/json:
              schema:
                type: object
                additionalProperties: { $ref: '#/components/schemas/PlanProgress' }

  /api/integration/test-plans/summary:
    get:
      summary: Test quality summary
      operationId: getTestPlansSummary
      responses:
        '200':
          description: Overall test quality stats
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalPlans: { type: integer }
                  byStatus: { type: object }
                  overallPassRate: { type: number }
                  plansAtRisk:
                    type: array
                    items:
                      type: object
                      properties:
                        planId: { type: string }
                        planName: { type: string }
                        completionPct: { type: integer }
                        failCount: { type: integer }
                        blockedCount: { type: integer }

  /api/integration/test-plans/{id}/progress:
    get:
      summary: Single plan progress
      operationId: getTestPlanProgress
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Plan progress
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PlanProgress' }
        '404':
          description: Plan not found

  /api/integration/test-plans/{id}/failures:
    get:
      summary: Failure details for a test plan
      operationId: getTestPlanFailures
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: List of failed/blocked test cases
          content:
            application/json:
              schema:
                type: object
                properties:
                  planId: { type: string }
                  planName: { type: string }
                  runId: { type: string, nullable: true }
                  runName: { type: string, nullable: true }
                  failures:
                    type: array
                    items:
                      type: object
                      properties:
                        testCaseId: { type: string }
                        caseNo: { type: string }
                        testCaseTitle: { type: string }
                        overallResult: { type: string }
                        testerName: { type: string }
                        testDate: { type: string }
                        notes: { type: string }

  /api/integration/test-plans/{id}/logs:
    get:
      summary: Execution logs for a test plan
      operationId: getTestPlanLogs
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Array of log entries
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id: { type: string }
                    date: { type: string }
                    item: { type: string }
                    categoryName: { type: string }
                    content: { type: string }
                    authorName: { type: string }
                    createdAt: { type: string }
```

- [ ] **Step 2: Create VSMS openapi-integration.yaml**

```yaml
openapi: 3.0.3
info:
  title: VSMS Integration API
  version: 1.0.0
  description: Cross-system integration endpoints for VTMS and Copilot Studio Agent

servers:
  - url: http://localhost:3001
    description: Local development

security:
  - apiKey: []

components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: X-Api-Key
  schemas:
    Schedule:
      type: object
      properties:
        id: { type: string }
        projectName: { type: string }
        taskDescription: { type: string }
        testUnit: { type: string }
        testEngineer: { type: string }
        startDate: { type: string }
        endDate: { type: string }
        isCompleted: { type: boolean }
        isDelayed: { type: boolean }
        delayReason: { type: string }
        vtmsPlanId: { type: string, nullable: true }

paths:
  /api/integration/schedules:
    get:
      summary: List schedules with optional filters
      operationId: listSchedules
      parameters:
        - { name: testUnit, in: query, schema: { type: string } }
        - { name: isCompleted, in: query, schema: { type: string } }
        - { name: isDelayed, in: query, schema: { type: string } }
        - { name: dateFrom, in: query, schema: { type: string } }
        - { name: dateTo, in: query, schema: { type: string } }
      responses:
        '200':
          description: Array of schedules
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Schedule' }

  /api/integration/schedules/summary:
    get:
      summary: Schedule health summary
      operationId: getSchedulesSummary
      responses:
        '200':
          description: Aggregate statistics
          content:
            application/json:
              schema:
                type: object
                properties:
                  total: { type: integer }
                  completed: { type: integer }
                  delayed: { type: integer }
                  inProgress: { type: integer }
                  notStarted: { type: integer }
                  byUnit: { type: object }

  /api/integration/schedules-with-progress:
    get:
      summary: Schedules with embedded VTMS progress (A feature)
      operationId: getSchedulesWithProgress
      parameters:
        - { name: testUnit, in: query, schema: { type: string } }
        - { name: isCompleted, in: query, schema: { type: string } }
        - { name: isDelayed, in: query, schema: { type: string } }
        - { name: dateFrom, in: query, schema: { type: string } }
        - { name: dateTo, in: query, schema: { type: string } }
      responses:
        '200':
          description: Schedules with vtmsProgress field
          content:
            application/json:
              schema:
                type: array
                items:
                  allOf:
                    - { $ref: '#/components/schemas/Schedule' }
                    - type: object
                      properties:
                        vtmsProgress:
                          nullable: true
                          type: object

  /api/integration/schedules/by-plan/{planId}:
    get:
      summary: Find schedule linked to a VTMS plan
      operationId: getScheduleByPlan
      parameters:
        - { name: planId, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          description: Linked schedule
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Schedule' }
        '404':
          description: No linked schedule

  /api/integration/schedules/{id}/delay:
    patch:
      summary: Mark schedule as delayed and append reason
      operationId: notifyDelay
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                date: { type: string }
                content: { type: string }
      responses:
        '200':
          description: Updated delay fields

  /api/integration/schedules/{id}/complete:
    patch:
      summary: Mark schedule as completed
      operationId: notifyComplete
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200':
          description: Updated isCompleted field
```

- [ ] **Step 3: Commit both**

```bash
git -C f:\vtms\vtms-export add openapi-integration.yaml
git -C f:\vtms\vtms-export commit -m "docs(vtms): add openapi-integration.yaml for Copilot Studio"
git -C f:\vsms\vsms-export add openapi-integration.yaml
git -C f:\vsms\vsms-export commit -m "docs(vsms): add openapi-integration.yaml for Copilot Studio"
```

---

## Self-Review Against Spec

| Requirement | Covered by Task(s) |
|-------------|-------------------|
| VSMS vtmsPlanId schema | Task 1 |
| VSMS canLinkVtms / canViewVtmsProgress | Task 1, 15, 17 |
| VTMS log_categories + test_plan_logs schema | Task 2 |
| requireApiKey middleware | Task 3 |
| VTMS env.ts | Task 4 |
| vtmsClient (VSMS→VTMS) | Task 5 |
| vsmsClient (VTMS→VSMS) | Task 6 |
| VTMS integration GET endpoints + Agent A/B/C | Task 7 |
| VTMS route registration | Task 8 |
| VSMS integration routes (read + write delay/complete) | Task 9 |
| VSMS route registration | Task 10 |
| VTMS logCategories routes + Delay seed | Task 11 |
| VTMS testPlanLogs routes + Delay VSMS sync | Task 12 |
| VTMS completed trigger in results.ts | Task 13 |
| VSMS schedules proxy + vtmsPlanId PATCH + lock | Task 14 |
| VSMS users permission fields | Task 15 |
| VSMS types.ts | Task 16 |
| VSMS user mgmt UI (permission checkboxes) | Task 17 |
| VSMS ScheduleFormModal (link + lock) | Task 18 |
| VSMS GanttLayout + GanttChart progress | Task 19 |
| VTMS TestPlanDetail schedule card | Task 20 |
| VTMS MyTasksPage product name + log button | Task 21 |
| VTMS PlanLogPanel | Task 22 |
| VTMS SettingsPage LogCategoryManager | Task 23 |
| OpenAPI specs | Task 24 |
