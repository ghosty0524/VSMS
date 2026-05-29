# MySQL Migration + Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 VSMS 資料層從 JSON 檔案遷移至 MySQL 8.x（Prisma ORM），同時新增後端欄位驗證 middleware 修補 F12 繞過漏洞，並將 delayReason 上限從 500 提升至 5000 字。

**Architecture:** 後端新增 `validateSchedule` middleware 攔截所有 schedule 寫入，Prisma client 取代現有 readJson/writeJson，各 route 改為 async/await 模式，一次性遷移腳本將現有 JSON 匯入 MySQL。

**Tech Stack:** MySQL 8.x, Prisma ORM (`@prisma/client`), TypeScript ESM, Express 5, Vitest, Supertest

---

## 檔案對應總覽

| 動作 | 路徑 |
|------|------|
| **新增** | `prisma/schema.prisma` |
| **新增** | `server/src/lib/db.ts` |
| **新增** | `server/src/middleware/validateSchedule.ts` |
| **新增** | `server/src/__tests__/validateSchedule.test.ts` |
| **新增** | `scripts/migrate-json-to-mysql.ts` |
| **修改** | `server/src/lib/storage.ts` |
| **修改** | `server/src/index.ts` |
| **修改** | `server/src/routes/auth.ts` |
| **修改** | `server/src/routes/users.ts` |
| **修改** | `server/src/routes/options.ts` |
| **修改** | `server/src/routes/schedules.ts` |
| **修改** | `server/src/routes/audit.ts` |
| **修改** | `server/src/routes/notify.ts` |
| **修改** | `server/src/routes/calendar.ts` |
| **修改** | `src/constants.ts` |
| **修改** | `.env` / `.env.example` |
| **修改** | `package.json` |

---

## Task 1: Install Prisma + Create Schema + Setup MySQL

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json`
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Install Prisma dependencies**

在專案根目錄執行：

```bash
npm install @prisma/client
npm install --save-dev prisma
```

Expected output: packages added to node_modules, `package.json` updated

- [ ] **Step 2: Initialize Prisma**

```bash
npx prisma init --datasource-provider mysql
```

This creates `prisma/schema.prisma` and appends `DATABASE_URL` to `.env`.

- [ ] **Step 3: Create the database in MySQL**

Open MySQL client and run:

```sql
CREATE DATABASE IF NOT EXISTS vsms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

- [ ] **Step 4: Set DATABASE_URL in .env**

Open `.env` and ensure it contains (replace password with your actual MySQL root/user password):

```
PORT=3001
SESSION_SECRET=vsms-dev-secret
NODE_ENV=development
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/vsms"
```

- [ ] **Step 5: Set DATABASE_URL example in .env.example**

Open `.env.example` and add:

```
PORT=3001
SESSION_SECRET=change-this-in-production
NODE_ENV=production
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/vsms"
```

- [ ] **Step 6: Write the full Prisma schema**

Replace the contents of `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Schedule {
  id                String   @id @default(uuid())
  category          String   @db.VarChar(100)
  projectName       String   @db.VarChar(100)
  taskDescription   String   @db.VarChar(500)
  testUnit          String   @db.VarChar(100)
  testEngineer      String   @db.VarChar(100)
  timeResource      Int
  startDate         String   @db.VarChar(10)
  endDate           String   @db.VarChar(10)
  requiredPersonnel String   @db.VarChar(200)
  testReport        String   @db.VarChar(500)
  isCompleted       Boolean  @default(false)
  isDelayed         Boolean  @default(false)
  delayReason       String   @db.VarChar(5000)
  createdBy         String   @db.VarChar(100)
  updatedBy         String   @db.VarChar(100)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("schedules")
}

model User {
  id             String    @id @default(uuid())
  username       String    @unique @db.VarChar(100)
  displayName    String    @db.VarChar(50)
  passwordHash   String    @db.VarChar(64)
  role           UserRole
  isActive       Boolean   @default(true)
  allowedUnits   Json      @default("[]")
  linkedEngineer String    @db.VarChar(100) @default("")
  createdAt      DateTime  @default(now())
  lastLoginAt    DateTime?

  @@map("users")
}

enum UserRole {
  super_admin
  admin
  user
}

model Category {
  id        String  @id @default(uuid())
  value     String  @db.VarChar(100)
  label     String  @db.VarChar(100)
  isActive  Boolean @default(true)
  sortOrder Int

  @@map("categories")
}

model TestUnit {
  id        String     @id @default(uuid())
  value     String     @db.VarChar(100)
  label     String     @db.VarChar(100)
  isActive  Boolean    @default(true)
  sortOrder Int
  engineers Engineer[]

  @@map("test_units")
}

model Engineer {
  id         String   @id @default(uuid())
  value      String   @db.VarChar(100)
  label      String   @db.VarChar(100)
  isActive   Boolean  @default(true)
  sortOrder  Int
  testUnit   TestUnit @relation(fields: [testUnitId], references: [id], onDelete: Cascade)
  testUnitId String

  @@map("engineers")
}

model RestDaysConfig {
  id            Int     @id @default(1)
  weekends      Boolean @default(true)
  specificDates Json    @default("[]")

  @@map("rest_days_config")
}

model AuditLog {
  id          String   @id @default(uuid())
  timestamp   DateTime @default(now())
  username    String   @db.VarChar(100)
  displayName String   @db.VarChar(100)
  action      String   @db.VarChar(50)
  target      String   @db.VarChar(200)
  fields      Json     @default("[]")

  @@map("audit_logs")
}

model NotifyConfig {
  id              Int         @id @default(1)
  enabled         Boolean     @default(false)
  teamsWebhookUrl String      @db.VarChar(500) @default("")
  systemUrl       String      @db.VarChar(200) @default("http://localhost:3001")
  recipients      Recipient[]

  @@map("notify_config")
}

model Recipient {
  id             String       @id @default(uuid())
  name           String       @db.VarChar(100)
  note           String       @db.VarChar(200) @default("")
  isActive       Boolean      @default(true)
  notifyConfig   NotifyConfig @relation(fields: [notifyConfigId], references: [id])
  notifyConfigId Int

  @@map("recipients")
}

model CalendarConfig {
  id                 Int      @id @default(1)
  year               Int
  nonWeekendHolidays Json     @default("[]")
  sourceName         String?  @db.VarChar(200)
  updatedAt          DateTime @default(now())

  @@map("calendar_config")
}
```

- [ ] **Step 7: Run Prisma migration to create all tables**

```bash
npx prisma migrate dev --name init
```

Expected output:
```
✔ Generated Prisma Client
The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20260527000000_init/
    └─ migration.sql

Your database is now in sync with your schema.
```

- [ ] **Step 8: Generate Prisma client**

```bash
npx prisma generate
```

Expected output: `✔ Generated Prisma Client`

---

## Task 2: Create Prisma Client Singleton

**Files:**
- Create: `server/src/lib/db.ts`

- [ ] **Step 1: Create db.ts**

```typescript
// server/src/lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

---

## Task 3: Create validateSchedule Middleware (TDD)

**Files:**
- Create: `server/src/middleware/validateSchedule.ts`
- Create: `server/src/__tests__/validateSchedule.test.ts`

- [ ] **Step 1: Create the test file first**

```typescript
// server/src/__tests__/validateSchedule.test.ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { validateSchedule } from '../middleware/validateSchedule.js'

const app = express()
app.use(express.json())
app.post('/test', validateSchedule, (_req, res) => { res.json({ ok: true }) })

const validBody = {
  projectName: 'Test Project',
  taskDescription: 'Description',
  testUnit: 'SIT-HW',
  testEngineer: 'John',
  timeResource: 5,
  startDate: '2026/01/01',
  endDate: '2026/01/31',
  requiredPersonnel: 'John',
  testReport: '',
  isCompleted: false,
  isDelayed: false,
  delayReason: '',
}

describe('validateSchedule middleware', () => {
  it('passes a valid schedule body', async () => {
    const res = await request(app).post('/test').send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('rejects empty projectName', async () => {
    const res = await request(app).post('/test').send({ ...validBody, projectName: '' })
    expect(res.status).toBe(422)
    expect(res.body.errors.projectName).toBeDefined()
  })

  it('rejects projectName over 100 chars', async () => {
    const res = await request(app).post('/test').send({ ...validBody, projectName: 'A'.repeat(101) })
    expect(res.status).toBe(422)
    expect(res.body.errors.projectName).toBeDefined()
  })

  it('rejects empty testUnit', async () => {
    const res = await request(app).post('/test').send({ ...validBody, testUnit: '' })
    expect(res.status).toBe(422)
    expect(res.body.errors.testUnit).toBeDefined()
  })

  it('rejects non-integer timeResource', async () => {
    const res = await request(app).post('/test').send({ ...validBody, timeResource: 2.5 })
    expect(res.status).toBe(422)
    expect(res.body.errors.timeResource).toBeDefined()
  })

  it('rejects zero timeResource', async () => {
    const res = await request(app).post('/test').send({ ...validBody, timeResource: 0 })
    expect(res.status).toBe(422)
    expect(res.body.errors.timeResource).toBeDefined()
  })

  it('rejects startDate with wrong format (dashes)', async () => {
    const res = await request(app).post('/test').send({ ...validBody, startDate: '2026-01-01' })
    expect(res.status).toBe(422)
    expect(res.body.errors.startDate).toBeDefined()
  })

  it('rejects endDate before startDate', async () => {
    const res = await request(app).post('/test').send({ ...validBody, startDate: '2026/02/01', endDate: '2026/01/01' })
    expect(res.status).toBe(422)
    expect(res.body.errors.endDate).toBeDefined()
  })

  it('rejects missing delayReason when isDelayed is true', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isDelayed: true, delayReason: '' })
    expect(res.status).toBe(422)
    expect(res.body.errors.delayReason).toBeDefined()
  })

  it('rejects delayReason over 5000 chars', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isDelayed: true, delayReason: 'A'.repeat(5001) })
    expect(res.status).toBe(422)
    expect(res.body.errors.delayReason).toBeDefined()
  })

  it('accepts delayReason exactly 5000 chars', async () => {
    const res = await request(app).post('/test').send({ ...validBody, isDelayed: true, delayReason: 'A'.repeat(5000) })
    expect(res.status).toBe(200)
  })

  it('returns all errors at once when multiple fields are invalid', async () => {
    const res = await request(app).post('/test').send({
      ...validBody,
      projectName: '',
      testUnit: '',
      timeResource: -1,
    })
    expect(res.status).toBe(422)
    expect(Object.keys(res.body.errors).length).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail (file doesn't exist yet)**

```bash
npx vitest run --config server/vitest.config.ts server/src/__tests__/validateSchedule.test.ts
```

Expected: FAIL — `Cannot find module '../middleware/validateSchedule.js'`

- [ ] **Step 3: Create the validateSchedule middleware**

```typescript
// server/src/middleware/validateSchedule.ts
import type { Request, Response, NextFunction } from 'express'

const LIMITS = {
  PROJECT_NAME: 100,
  TASK_DESCRIPTION: 500,
  REQUIRED_PERSONNEL: 200,
  TEST_REPORT: 500,
  DELAY_REASON: 5000,
} as const

const DATE_REGEX = /^\d{4}\/\d{2}\/\d{2}$/

/**
 * Validates all Schedule write operations (POST & PUT).
 * Returns HTTP 422 with { errors: Record<string, string> } on failure.
 * Applies backend enforcement equivalent to the frontend FIELD_LIMITS.
 */
export function validateSchedule(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Record<string, unknown>
  const errors: Record<string, string> = {}

  // projectName: required, max 100
  if (!body.projectName || typeof body.projectName !== 'string' || body.projectName.trim() === '') {
    errors.projectName = '專案名稱為必填'
  } else if (body.projectName.length > LIMITS.PROJECT_NAME) {
    errors.projectName = `專案名稱不可超過 ${LIMITS.PROJECT_NAME} 字`
  }

  // taskDescription: optional, max 500
  if (typeof body.taskDescription === 'string' && body.taskDescription.length > LIMITS.TASK_DESCRIPTION) {
    errors.taskDescription = `任務描述不可超過 ${LIMITS.TASK_DESCRIPTION} 字`
  }

  // testUnit: required
  if (!body.testUnit || typeof body.testUnit !== 'string' || body.testUnit.trim() === '') {
    errors.testUnit = '測試單位為必填'
  }

  // testEngineer: required
  if (!body.testEngineer || typeof body.testEngineer !== 'string' || body.testEngineer.trim() === '') {
    errors.testEngineer = '測試人員為必填'
  }

  // timeResource: required, positive integer
  if (body.timeResource === undefined || body.timeResource === null) {
    errors.timeResource = '時間資源為必填'
  } else if (!Number.isInteger(body.timeResource) || (body.timeResource as number) <= 0) {
    errors.timeResource = '時間資源須為正整數'
  }

  // startDate: required, format YYYY/MM/DD
  if (!body.startDate || typeof body.startDate !== 'string' || !DATE_REGEX.test(body.startDate)) {
    errors.startDate = '開始日期格式須為 YYYY/MM/DD'
  }

  // endDate: required, format YYYY/MM/DD, must not be before startDate
  if (!body.endDate || typeof body.endDate !== 'string' || !DATE_REGEX.test(body.endDate)) {
    errors.endDate = '結束日期格式須為 YYYY/MM/DD'
  } else if (
    typeof body.startDate === 'string' &&
    DATE_REGEX.test(body.startDate) &&
    body.endDate < body.startDate
  ) {
    errors.endDate = '結束日期不可早於開始日期'
  }

  // requiredPersonnel: optional, max 200
  if (typeof body.requiredPersonnel === 'string' && body.requiredPersonnel.length > LIMITS.REQUIRED_PERSONNEL) {
    errors.requiredPersonnel = `所需人員不可超過 ${LIMITS.REQUIRED_PERSONNEL} 字`
  }

  // testReport: optional, max 500
  if (typeof body.testReport === 'string' && body.testReport.length > LIMITS.TEST_REPORT) {
    errors.testReport = `測試報告不可超過 ${LIMITS.TEST_REPORT} 字`
  }

  // delayReason: required when isDelayed=true, max 5000
  if (body.isDelayed === true) {
    if (!body.delayReason || typeof body.delayReason !== 'string' || body.delayReason.trim() === '') {
      errors.delayReason = '延遲原因為必填'
    } else if (body.delayReason.length > LIMITS.DELAY_REASON) {
      errors.delayReason = `延遲原因不可超過 ${LIMITS.DELAY_REASON} 字`
    }
  }

  if (Object.keys(errors).length > 0) {
    res.status(422).json({ errors })
    return
  }

  next()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run --config server/vitest.config.ts server/src/__tests__/validateSchedule.test.ts
```

Expected: all 12 tests PASS

---

## Task 4: Update DELAY_REASON Constant (Frontend)

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Update the constant**

In `src/constants.ts`, change line 12:

```typescript
// Before:
DELAY_REASON: 500,

// After:
DELAY_REASON: 5000,
```

The full `FIELD_LIMITS` block should now read:
```typescript
export const FIELD_LIMITS = {
  PROJECT_NAME: 100,
  TASK_DESCRIPTION: 500,
  REQUIRED_PERSONNEL: 200,
  TEST_REPORT: 500,
  DELAY_REASON: 5000,
  DISPLAY_NAME: 50,
} as const
```

---

## Task 5: Rewrite storage.ts (JSON → Prisma)

**Files:**
- Modify: `server/src/lib/storage.ts`

`storage.ts` will now only export two things:
- `appendAudit()` — async, writes to MySQL via Prisma
- `initDb()` — async, ensures singleton records exist and seeds default options if empty

- [ ] **Step 1: Replace the entire contents of server/src/lib/storage.ts**

```typescript
// server/src/lib/storage.ts
import { prisma } from './db.js'
import { v4 as uuidv4 } from 'uuid'
import type { AuditAction } from '../types.js'

// ── Audit ────────────────────────────────────────────────────
export async function appendAudit(
  username: string,
  displayName: string,
  action: AuditAction,
  target: string,
  fields: string[] = []
): Promise<void> {
  await prisma.auditLog.create({
    data: { username, displayName, action, target, fields },
  })
  // Keep last 180 days only
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 180)
  await prisma.auditLog.deleteMany({ where: { timestamp: { lt: cutoff } } })
}

// ── DB Initialisation ────────────────────────────────────────
export async function initDb(): Promise<void> {
  // Ensure RestDaysConfig singleton
  await prisma.restDaysConfig.upsert({
    where: { id: 1 },
    create: { id: 1, weekends: true, specificDates: [] },
    update: {},
  })

  // Ensure NotifyConfig singleton
  await prisma.notifyConfig.upsert({
    where: { id: 1 },
    create: { id: 1, enabled: false, teamsWebhookUrl: '', systemUrl: 'http://localhost:3001' },
    update: {},
  })

  // Seed default categories/testUnits only if completely empty (fresh install)
  const catCount = await prisma.category.count()
  if (catCount === 0) {
    function opt(id: string, value: string, sortOrder: number) {
      return { id, value, label: value, isActive: true, sortOrder }
    }
    function eng(id: string, name: string, idx: number) {
      return { id, value: name, label: name, isActive: true, sortOrder: idx }
    }

    await prisma.category.createMany({
      data: [
        opt('c1', 'NPI', 0), opt('c2', 'AVL', 1), opt('c3', '2nd Source', 2),
        opt('c4', 'Security', 3), opt('c5', 'Regression', 4),
      ],
    })

    const units = [
      { id: 'u1', name: 'SIT-HW', order: 0, engineers: ['Eric','Darius','Jacky','Polson','Willie','Harry','Hsuan','Jeffrey','Wayhon','Ben'] },
      { id: 'u2', name: 'SIT-SW', order: 1, engineers: ['Eric','Ashley','Kirin'] },
      { id: 'u3', name: 'RA',     order: 2, engineers: ['Will','Lily','Japon','Michael'] },
      { id: 'u4', name: 'SI',     order: 3, engineers: ['Brian','Wade','Raymond','Paul'] },
    ]

    for (const u of units) {
      await prisma.testUnit.create({
        data: {
          id: u.id, value: u.name, label: u.name, isActive: true, sortOrder: u.order,
          engineers: {
            create: u.engineers.map((name, i) => eng(`${u.id}e${i}`, name, i)),
          },
        },
      })
    }
  }
}
```

---

## Task 6: Update server/src/index.ts

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Replace the entire contents of server/src/index.ts**

```typescript
// server/src/index.ts
import express from 'express'
import session from 'express-session'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import authRouter from './routes/auth.js'
import schedulesRouter from './routes/schedules.js'
import optionsRouter from './routes/options.js'
import usersRouter from './routes/users.js'
import auditRouter from './routes/audit.js'
import notifyRouter from './routes/notify.js'
import calendarRouter from './routes/calendar.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const app = express()

app.use(express.json({ limit: '10mb' }))
app.use(session({
  secret: process.env.SESSION_SECRET ?? 'vsms-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}))

// ── API Routes ─────────────────────────────────────────
app.use('/api', authRouter)
app.use('/api/schedules', schedulesRouter)
app.use('/api/options', optionsRouter)
app.use('/api/users', usersRouter)
app.use('/api/audit', auditRouter)
app.use('/api/notify', notifyRouter)
app.use('/api/calendar', calendarRouter)

// ── Static (serve SPA in production) ──────────────────
const isProd = !process.argv[1]?.includes('tsx')
const distPath = isProd
  ? path.join(__dirname, '../../../dist')
  : path.join(__dirname, '../../dist')

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ── Start server (only when executed directly) ─────────
const isMain = process.argv[1] === __filename ||
               process.argv[1]?.endsWith('index.js') ||
               process.argv[1]?.endsWith('index.ts')

if (isMain) {
  const { initDb } = await import('./lib/storage.js')
  const { prisma } = await import('./lib/db.js')
  const PORT = process.env.PORT ?? 3001
  await prisma.$connect()
  await initDb()
  app.listen(Number(PORT), () => {
    console.log(`VSMS Server running at http://localhost:${PORT}`)
  })
}
```

---

## Task 7: Rewrite auth.ts Routes

**Files:**
- Modify: `server/src/routes/auth.ts`

> Note: `activeSessions` (in-memory session tracking) is unchanged. Only the JSON file reads/writes are replaced with Prisma.

- [ ] **Step 1: Replace the entire contents of server/src/routes/auth.ts**

```typescript
// server/src/routes/auth.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { sha256 } from '../lib/crypto.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { User } from '../types.js'

const router = Router()

// ── Session management ──────────────────────────────────────
const MAX_SESSIONS = 30
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

interface SessionInfo {
  sessionId: string
  username: string
  loginAt: Date
  lastActiveAt: Date
}

const activeSessions = new Map<string, SessionInfo>()

function cleanExpiredSessions(): void {
  const now = new Date()
  for (const [sid, info] of activeSessions.entries()) {
    if (now.getTime() - info.lastActiveAt.getTime() > SESSION_TIMEOUT_MS) {
      activeSessions.delete(sid)
    }
  }
}

function getActiveUserCount(): number {
  cleanExpiredSessions()
  const uniqueUsers = new Set([...activeSessions.values()].map(s => s.username))
  return uniqueUsers.size
}

function touchSession(sessionId: string): void {
  const info = activeSessions.get(sessionId)
  if (info) info.lastActiveAt = new Date()
}

// Helper: map Prisma User → app User type
function toUser(u: {
  id: string; username: string; displayName: string; passwordHash: string;
  role: string; isActive: boolean; allowedUnits: unknown; linkedEngineer: string;
  createdAt: Date; lastLoginAt: Date | null
}): User {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    passwordHash: u.passwordHash,
    role: u.role as User['role'],
    isActive: u.isActive,
    allowedUnits: (u.allowedUnits as string[]) ?? [],
    linkedEngineer: u.linkedEngineer,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? '',
  }
}

// ── POST /api/login ────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password, force } = req.body as {
    username?: string
    password: string
    force?: boolean
  }

  const userCount = await prisma.user.count()

  // First run: create Super Admin
  if (userCount === 0) {
    if (!password || password.length < 8) {
      res.status(400).json({ ok: false, message: '密碼至少需要 8 個字元' })
      return
    }
    const initUsername = username?.trim() || 'admin'
    const superAdmin = await prisma.user.create({
      data: {
        id: uuidv4(),
        username: initUsername,
        displayName: 'Super Admin',
        passwordHash: sha256(password),
        role: 'super_admin',
        isActive: true,
        allowedUnits: [],
        linkedEngineer: '',
      },
    })

    const sid = uuidv4()
    req.session.sessionId = sid
    req.session.username = superAdmin.username
    req.session.role = superAdmin.role as string

    activeSessions.set(sid, {
      sessionId: sid,
      username: superAdmin.username,
      loginAt: new Date(),
      lastActiveAt: new Date(),
    })

    await appendAudit(superAdmin.username, superAdmin.displayName, 'LOGIN', 'system')
    res.json({ ok: true, firstRun: true })
    return
  }

  // Normal login
  const loginUsername = username?.trim() || 'admin'
  const dbUser = await prisma.user.findFirst({
    where: { username: loginUsername, isActive: true },
  })

  if (!dbUser || sha256(password) !== dbUser.passwordHash) {
    res.status(401).json({ ok: false, message: '帳號或密碼錯誤' })
    return
  }

  cleanExpiredSessions()

  const existingEntry = [...activeSessions.entries()]
    .find(([, info]) => info.username === loginUsername)

  const otherUserCount = new Set(
    [...activeSessions.values()]
      .filter(s => s.username !== loginUsername)
      .map(s => s.username)
  ).size

  if (!existingEntry && otherUserCount >= MAX_SESSIONS) {
    res.status(403).json({
      ok: false,
      message: `目前已達登入人數上限（${MAX_SESSIONS} 人），請稍後再試`,
      code: 'MAX_SESSIONS_REACHED',
    })
    return
  }

  const hasDuplicate = !!existingEntry && existingEntry[0] !== req.session.sessionId
  if (hasDuplicate && !force) {
    res.json({ ok: false, warning: 'duplicate_session' })
    return
  }

  if (existingEntry) activeSessions.delete(existingEntry[0])

  const sid = uuidv4()
  req.session.sessionId = sid
  req.session.username = dbUser.username
  req.session.role = dbUser.role as string

  activeSessions.set(sid, {
    sessionId: sid,
    username: dbUser.username,
    loginAt: new Date(),
    lastActiveAt: new Date(),
  })

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { lastLoginAt: new Date() },
  })

  await appendAudit(dbUser.username, dbUser.displayName, 'LOGIN', 'system')
  res.json({ ok: true })
})

// ── POST /api/logout ───────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const dbUser = await prisma.user.findUnique({ where: { username } })
  await appendAudit(username, dbUser?.displayName ?? username, 'LOGOUT', 'system')

  if (req.session.sessionId) activeSessions.delete(req.session.sessionId)
  req.session.destroy(() => res.json({ ok: true }))
})

// ── GET /api/me ────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { username: req.session.username } })
  if (!dbUser) {
    res.status(401).json({ ok: false, message: 'User not found' })
    return
  }

  if (req.session.sessionId) touchSession(req.session.sessionId)

  res.json({
    ok: true,
    username: dbUser.username,
    displayName: dbUser.displayName,
    role: dbUser.role,
    allowedUnits: (dbUser.allowedUnits as string[]) ?? [],
    linkedEngineer: dbUser.linkedEngineer ?? '',
  })
})

// ── GET /api/sessions ──────────────────────────────────────
router.get('/sessions', requireAuth, (req, res) => {
  if (req.session.role !== 'super_admin') {
    res.status(403).json({ ok: false, message: '權限不足' })
    return
  }

  cleanExpiredSessions()
  const sessions = [...activeSessions.values()].map(s => ({
    username: s.username,
    loginAt: s.loginAt,
    lastActiveAt: s.lastActiveAt,
  }))

  res.json({
    ok: true,
    activeCount: getActiveUserCount(),
    maxSessions: MAX_SESSIONS,
    sessions,
  })
})

// ── POST /api/change-password ──────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body as {
    oldPassword: string
    newPassword: string
  }

  const dbUser = await prisma.user.findUnique({ where: { username: req.session.username } })
  if (!dbUser) {
    res.status(404).json({ ok: false, message: 'User not found' })
    return
  }
  if (sha256(oldPassword) !== dbUser.passwordHash) {
    res.status(401).json({ ok: false, message: '舊密碼錯誤' })
    return
  }
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ ok: false, message: '新密碼至少需要 8 個字元' })
    return
  }

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: sha256(newPassword) },
  })
  await appendAudit(dbUser.username, dbUser.displayName, 'UPDATE_USER', dbUser.username, ['passwordHash'])
  res.json({ ok: true })
})

export default router
```

---

## Task 8: Rewrite users.ts Routes

**Files:**
- Modify: `server/src/routes/users.ts`

- [ ] **Step 1: Replace the entire contents of server/src/routes/users.ts**

```typescript
// server/src/routes/users.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { sha256 } from '../lib/crypto.js'
import { requireAuth, requireSuperAdmin } from '../middleware/requireAuth.js'

const router = Router()
router.use(requireAuth, requireSuperAdmin)

// Helper: strip passwordHash from Prisma user
function safeUser(u: {
  id: string; username: string; displayName: string; role: string;
  isActive: boolean; allowedUnits: unknown; linkedEngineer: string;
  createdAt: Date; lastLoginAt: Date | null
}) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    allowedUnits: (u.allowedUnits as string[]) ?? [],
    linkedEngineer: u.linkedEngineer,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? '',
  }
}

// GET /api/users
router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(users.map(safeUser))
})

// POST /api/users
router.post('/', async (req, res) => {
  const { username, displayName, password, allowedUnits, role, linkedEngineer } = req.body as {
    username: string
    displayName?: string
    password: string
    allowedUnits?: string[]
    role?: 'admin' | 'user'
    linkedEngineer?: string
  }

  if (!username || !password || password.length < 8) {
    res.status(400).json({ ok: false, message: '帳號與密碼為必填，密碼至少 8 個字元' })
    return
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    res.status(409).json({ ok: false, message: '帳號已存在' })
    return
  }

  const newUser = await prisma.user.create({
    data: {
      id: uuidv4(),
      username,
      displayName: displayName?.trim() || username,
      passwordHash: sha256(password),
      role: role === 'user' ? 'user' : 'admin',
      isActive: true,
      allowedUnits: role === 'user' ? [] : (Array.isArray(allowedUnits) ? allowedUnits : []),
      linkedEngineer: role === 'user' ? (linkedEngineer?.trim() ?? '') : '',
    },
  })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'CREATE_USER', username, [])

  res.status(201).json(safeUser(newUser))
})

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!dbUser) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const { displayName, password, isActive, allowedUnits, linkedEngineer } = req.body as {
    displayName?: string
    password?: string
    isActive?: boolean
    allowedUnits?: string[]
    linkedEngineer?: string
  }
  const changedFields: string[] = []
  const updates: Record<string, unknown> = {}

  if (displayName !== undefined) {
    updates.displayName = displayName.trim() || dbUser.username
    changedFields.push('displayName')
  }

  if (password !== undefined && password !== '') {
    if (password.length < 8) {
      res.status(400).json({ ok: false, message: '新密碼長度至少需要 8 個字元' })
      return
    }
    updates.passwordHash = sha256(password)
    changedFields.push('passwordHash')
  }

  if (isActive !== undefined) {
    if (dbUser.role === 'super_admin') {
      res.status(403).json({ ok: false, message: 'Super Admin 狀態不可變更' })
      return
    }
    updates.isActive = isActive
    changedFields.push('isActive')
  }

  if (allowedUnits !== undefined && dbUser.role !== 'super_admin') {
    updates.allowedUnits = Array.isArray(allowedUnits) ? allowedUnits : []
    changedFields.push('allowedUnits')
  }

  if (linkedEngineer !== undefined) {
    if (dbUser.role !== 'user') {
      res.status(400).json({ ok: false, message: 'linkedEngineer 欄位僅適用於 User 角色帳號' })
      return
    }
    updates.linkedEngineer = linkedEngineer.trim()
    changedFields.push('linkedEngineer')
  }

  if (changedFields.length === 0) {
    res.status(400).json({ ok: false, message: '未提供任何要更新的欄位' })
    return
  }

  const updated = await prisma.user.update({ where: { id: dbUser.id }, data: updates })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'UPDATE_USER', dbUser.username, changedFields)

  res.json(safeUser(updated))
})

// DELETE /api/users/:id — soft disable
router.delete('/:id', async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!dbUser) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (dbUser.role === 'super_admin') {
    res.status(403).json({ ok: false, message: 'Super Admin 不可停用' })
    return
  }

  await prisma.user.update({ where: { id: dbUser.id }, data: { isActive: false } })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'DISABLE_USER', dbUser.username, ['isActive'])

  res.json({ ok: true })
})

// DELETE /api/users/:id/permanent
router.delete('/:id/permanent', async (req, res) => {
  const dbUser = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!dbUser) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (dbUser.role === 'super_admin') {
    res.status(403).json({ ok: false, message: 'Super Admin 不可刪除' })
    return
  }
  if (dbUser.isActive) {
    res.status(400).json({ ok: false, message: '請先停用帳號再執行刪除' })
    return
  }

  await prisma.user.delete({ where: { id: dbUser.id } })

  const operator = req.session.username ?? 'unknown'
  const opUser = await prisma.user.findUnique({ where: { username: operator } })
  await appendAudit(operator, opUser?.displayName ?? operator, 'DISABLE_USER', dbUser.username, ['permanently_deleted'])

  res.json({ ok: true, message: `帳號 ${dbUser.displayName} 已永久刪除` })
})

export default router
```

---

## Task 9: Rewrite options.ts Routes

**Files:**
- Modify: `server/src/routes/options.ts`

> This is the most complex route: GET must reconstruct `OptionsMap` from 4 tables; PUT must replace all options atomically using a transaction.

- [ ] **Step 1: Replace the entire contents of server/src/routes/options.ts**

```typescript
// server/src/routes/options.ts
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { OptionsMap } from '../types.js'

const router = Router()
router.use(requireAuth)

// GET /api/options
router.get('/', async (_req, res) => {
  const [categories, testUnits, restDays] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.testUnit.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { engineers: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.restDaysConfig.findUnique({ where: { id: 1 } }),
  ])

  const result: OptionsMap = {
    categories: categories.map(({ id, value, label, isActive, sortOrder }) => ({
      id, value, label, isActive, sortOrder,
    })),
    testUnits: testUnits.map(({ id, value, label, isActive, sortOrder, engineers }) => ({
      id, value, label, isActive, sortOrder,
      engineers: engineers.map(({ id, value, label, isActive, sortOrder }) => ({
        id, value, label, isActive, sortOrder,
      })),
    })),
    restDays: {
      weekends: restDays?.weekends ?? true,
      specificDates: (restDays?.specificDates as string[]) ?? [],
    },
  }

  res.json(result)
})

// PUT /api/options — full atomic replacement
router.put('/', async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const body = req.body as OptionsMap

  await prisma.$transaction(async (tx) => {
    // Delete in dependency order (engineers → testUnits → categories)
    await tx.engineer.deleteMany()
    await tx.testUnit.deleteMany()
    await tx.category.deleteMany()

    // Create new categories
    if (body.categories.length > 0) {
      await tx.category.createMany({
        data: body.categories.map(c => ({
          id: c.id, value: c.value, label: c.label,
          isActive: c.isActive, sortOrder: c.sortOrder,
        })),
      })
    }

    // Create new testUnits with nested engineers
    for (const unit of body.testUnits) {
      await tx.testUnit.create({
        data: {
          id: unit.id, value: unit.value, label: unit.label,
          isActive: unit.isActive, sortOrder: unit.sortOrder,
          engineers: {
            create: unit.engineers.map(e => ({
              id: e.id, value: e.value, label: e.label,
              isActive: e.isActive, sortOrder: e.sortOrder,
            })),
          },
        },
      })
    }

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
  })

  const dbUser = await prisma.user.findUnique({ where: { username } })
  await appendAudit(username, dbUser?.displayName ?? username, 'UPDATE_SETTINGS', 'options', [])

  res.json(body)
})

export default router
```

---

## Task 10: Rewrite schedules.ts + Wire validateSchedule

**Files:**
- Modify: `server/src/routes/schedules.ts`

> Key changes: all storage ops → Prisma async, add `validateSchedule` to POST and PUT routes, map DateTime back to ISO strings.

- [ ] **Step 1: Replace the entire contents of server/src/routes/schedules.ts**

```typescript
// server/src/routes/schedules.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validateSchedule } from '../middleware/validateSchedule.js'
import type { Schedule, User } from '../types.js'

const router = Router()
router.use(requireAuth)

// Helper: map Prisma Schedule → app Schedule type
function toSchedule(s: {
  id: string; category: string; projectName: string; taskDescription: string;
  testUnit: string; testEngineer: string; timeResource: number;
  startDate: string; endDate: string; requiredPersonnel: string;
  testReport: string; isCompleted: boolean; isDelayed: boolean;
  delayReason: string; createdBy: string; updatedBy: string;
  createdAt: Date; updatedAt: Date;
}): Schedule {
  return { ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }
}

async function getAllowedUnits(username: string): Promise<string[] | null> {
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return []
  if (user.role === 'super_admin') return null
  return (user.allowedUnits as string[]) ?? []
}

async function getUser(username: string) {
  return prisma.user.findUnique({ where: { username } })
}

function canAccessUnit(allowedUnits: string[] | null, testUnit: string): boolean {
  if (allowedUnits === null) return true
  if (allowedUnits.length === 0) return true
  return allowedUnits.includes(testUnit)
}

// GET /api/schedules
router.get('/', async (req, res) => {
  const schedules = await prisma.schedule.findMany({ orderBy: { createdAt: 'asc' } })
  const mapped = schedules.map(toSchedule)

  if (req.session.role === 'user') {
    const user = await getUser(req.session.username ?? '')
    const engineer = user?.linkedEngineer ?? ''
    res.json(mapped.filter(s => s.testEngineer === engineer))
    return
  }

  res.json(mapped)
})

// POST /api/schedules
router.post('/', validateSchedule, async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: 'User 角色無新增排程權限', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const username = req.session.username ?? 'unknown'
  const allowedUnits = await getAllowedUnits(username)
  const body = req.body as Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>

  if (!canAccessUnit(allowedUnits, body.testUnit)) {
    res.status(403).json({
      ok: false, message: `您無權限新增 ${body.testUnit} 的排程`, code: 'UNIT_NOT_ALLOWED',
    })
    return
  }

  const dbUser = await getUser(username)
  const displayName = dbUser?.displayName ?? username

  const schedule = await prisma.schedule.create({
    data: {
      id: uuidv4(),
      ...body,
      createdBy: username,
      updatedBy: username,
    },
  })

  await appendAudit(username, displayName, 'CREATE_SCHEDULE', schedule.id, [])
  res.status(201).json(toSchedule(schedule))
})

// PUT /api/schedules/replace-all
router.put('/replace-all', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: 'User 角色無匯入權限', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const username = req.session.username ?? 'unknown'
  const allowedUnits = await getAllowedUnits(username)
  const dbUser = await getUser(username)
  const displayName = dbUser?.displayName ?? username
  const incoming = req.body as Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[]

  if (allowedUnits !== null && allowedUnits.length > 0) {
    const blockedUnits = [...new Set(
      incoming.filter(d => !canAccessUnit(allowedUnits, d.testUnit)).map(d => d.testUnit)
    )]
    if (blockedUnits.length > 0) {
      res.status(403).json({
        ok: false, message: `您無權限匯入以下單位的排程：${blockedUnits.join('、')}`,
        code: 'UNIT_NOT_ALLOWED', blockedUnits,
      })
      return
    }
  }

  const now = new Date()

  if (allowedUnits === null || allowedUnits.length === 0) {
    // super_admin: replace all
    await prisma.$transaction(async (tx) => {
      await tx.schedule.deleteMany()
      await tx.schedule.createMany({
        data: incoming.map(d => ({
          id: uuidv4(), ...d,
          createdBy: username, updatedBy: username,
          createdAt: now, updatedAt: now,
        })),
      })
    })
  } else {
    // admin: only delete + replace schedules in their allowed units
    await prisma.$transaction(async (tx) => {
      await tx.schedule.deleteMany({
        where: { testUnit: { in: allowedUnits } },
      })
      if (incoming.length > 0) {
        await tx.schedule.createMany({
          data: incoming.map(d => ({
            id: uuidv4(), ...d,
            createdBy: username, updatedBy: username,
            createdAt: now, updatedAt: now,
          })),
        })
      }
    })
    // Schedules in other units remain untouched (no delete issued for them)
  }

  const all = await prisma.schedule.findMany({ orderBy: { createdAt: 'asc' } })
  await appendAudit(username, displayName, 'IMPORT_SCHEDULES', `${incoming.length} schedules`, [])
  res.json(all.map(toSchedule))
})

// PUT /api/schedules/:id
router.put('/:id', validateSchedule, async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const existing = await prisma.schedule.findUnique({ where: { id: req.params.id } })
  if (!existing) { res.status(404).json({ error: 'Not found' }); return }

  if (req.session.role === 'user') {
    const user = await getUser(username)
    const engineer = user?.linkedEngineer ?? ''
    const displayName = user?.displayName ?? username

    if (existing.testEngineer !== engineer) {
      res.status(403).json({ ok: false, message: '您只能修改指派給自己的排程', code: 'NOT_OWN_SCHEDULE' })
      return
    }
    const body = req.body as Partial<Schedule>
    if (body.testEngineer !== undefined && body.testEngineer !== engineer) {
      res.status(403).json({ ok: false, message: '不可變更測試人員欄位', code: 'CANNOT_CHANGE_ENGINEER' })
      return
    }

    const beforeRecord = existing as unknown as Record<string, unknown>
    const changedFields = Object.keys(body).filter(
      k => JSON.stringify(beforeRecord[k]) !== JSON.stringify((body as Record<string, unknown>)[k])
    )

    const updated = await prisma.schedule.update({
      where: { id: req.params.id },
      data: { ...body, testEngineer: engineer, updatedBy: username, updatedAt: new Date() },
    })
    await appendAudit(username, displayName, 'UPDATE_SCHEDULE', req.params.id, changedFields)
    res.json(toSchedule(updated))
    return
  }

  const allowedUnits = await getAllowedUnits(username)
  if (!canAccessUnit(allowedUnits, existing.testUnit)) {
    res.status(403).json({
      ok: false, message: `您無權限修改 ${existing.testUnit} 的排程`, code: 'UNIT_NOT_ALLOWED',
    })
    return
  }

  const dbUser = await getUser(username)
  const displayName = dbUser?.displayName ?? username
  const body = req.body as Record<string, unknown>
  const beforeRecord = existing as unknown as Record<string, unknown>
  const changedFields = Object.keys(body).filter(
    k => JSON.stringify(beforeRecord[k]) !== JSON.stringify(body[k])
  )

  const updated = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { ...body, updatedBy: username, updatedAt: new Date() },
  })
  await appendAudit(username, displayName, 'UPDATE_SCHEDULE', req.params.id, changedFields)
  res.json(toSchedule(updated))
})

// DELETE /api/schedules/:id
router.delete('/:id', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: 'User 角色無刪除排程權限', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const username = req.session.username ?? 'unknown'
  const allowedUnits = await getAllowedUnits(username)
  const target = await prisma.schedule.findUnique({ where: { id: req.params.id } })

  if (!target) { res.status(404).json({ error: 'Not found' }); return }
  if (!canAccessUnit(allowedUnits, target.testUnit)) {
    res.status(403).json({
      ok: false, message: `您無權限刪除 ${target.testUnit} 的排程`, code: 'UNIT_NOT_ALLOWED',
    })
    return
  }

  await prisma.schedule.delete({ where: { id: req.params.id } })
  const dbUser = await getUser(username)
  const displayName = dbUser?.displayName ?? username
  await appendAudit(username, displayName, 'DELETE_SCHEDULE', req.params.id, [])
  res.json({ ok: true })
})

export default router
```

---

## Task 11: Rewrite audit.ts Routes

**Files:**
- Modify: `server/src/routes/audit.ts`

- [ ] **Step 1: Replace the entire contents of server/src/routes/audit.ts**

```typescript
// server/src/routes/audit.ts
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { requireAuth, requireSuperAdmin } from '../middleware/requireAuth.js'

const router = Router()
router.use(requireAuth, requireSuperAdmin)

router.get('/', async (req, res) => {
  const { from, to, username, action } = req.query as Record<string, string | undefined>

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(from && { timestamp: { gte: new Date(from) } }),
      ...(to && { timestamp: { lte: new Date(to + 'T23:59:59') } }),
      ...(username && { username }),
      ...(action && { action }),
    },
    orderBy: { timestamp: 'desc' },
  })

  res.json(logs.map(l => ({
    id: l.id,
    timestamp: l.timestamp.toISOString(),
    username: l.username,
    displayName: l.displayName,
    action: l.action,
    target: l.target,
    fields: (l.fields as string[]) ?? [],
  })))
})

export default router
```

---

## Task 12: Rewrite notify.ts Routes

**Files:**
- Modify: `server/src/routes/notify.ts`

> The `POST /notify` route now reads config from MySQL. The `POST /notify/test` is unchanged (uses request body). The Teams Adaptive Card building logic is unchanged.

- [ ] **Step 1: Replace the entire contents of server/src/routes/notify.ts**

```typescript
// server/src/routes/notify.ts
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()
router.use(requireAuth)

function buildCard(body: object[]) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body,
      },
    }],
  }
}

// POST /api/notify
router.post('/', async (req, res) => {
  const config = await prisma.notifyConfig.findUnique({ where: { id: 1 } })

  if (!config?.enabled) {
    res.status(400).json({ ok: false, message: 'Teams 通知功能未開啟' })
    return
  }
  if (!config.teamsWebhookUrl) {
    res.status(400).json({ ok: false, message: '尚未設定 Teams Webhook URL' })
    return
  }

  const { summary } = req.body as { summary: string }
  const username = req.session.username ?? 'unknown'
  const dbUser = await prisma.user.findUnique({ where: { username } })
  const displayName = dbUser?.displayName ?? username
  const systemUrl = config.systemUrl || 'http://localhost:3001'

  const card = buildCard([
    { type: 'TextBlock', text: '📋 VSMS Dashboard 更新通知', weight: 'Bolder', size: 'Medium' },
    {
      type: 'FactSet',
      facts: [
        { title: '發佈時間', value: new Date().toLocaleString('zh-TW') },
        { title: '發佈人員', value: displayName },
      ],
    },
    { type: 'TextBlock', text: `本次更新摘要：\n${summary}`, wrap: true },
    { type: 'TextBlock', text: `📥 請點擊以下連結開啟系統下載最新 Dashboard\n${systemUrl}`, wrap: true, color: 'Accent' },
  ])

  try {
    const response = await fetch(config.teamsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    })
    if (!response.ok) {
      const text = await response.text()
      res.status(502).json({ ok: false, message: `Teams 回應錯誤：${text}` })
      return
    }
    await appendAudit(username, displayName, 'SEND_NOTIFICATION', 'teams', [])
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ ok: false, message: `無法連接 Teams Webhook：${String(err)}` })
  }
})

// POST /api/notify/test
router.post('/test', async (req, res) => {
  const { webhookUrl } = req.body as { webhookUrl: string }
  if (!webhookUrl) {
    res.status(400).json({ ok: false, message: '請提供 webhookUrl' })
    return
  }

  const card = buildCard([
    { type: 'TextBlock', text: '✅ VSMS Teams 通知測試', weight: 'Bolder', size: 'Medium' },
    { type: 'TextBlock', text: '此訊息為測試發送，表示 Webhook 設定正確。', wrap: true },
    { type: 'FactSet', facts: [{ title: '測試時間', value: new Date().toLocaleString('zh-TW') }] },
  ])

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    })
    if (!response.ok) {
      const text = await response.text()
      res.status(502).json({ ok: false, message: `Teams 回應錯誤：${text}` })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ ok: false, message: `無法連接 Webhook：${String(err)}` })
  }
})

export default router
```

---

## Task 13: Rewrite calendar.ts Routes

**Files:**
- Modify: `server/src/routes/calendar.ts`

> The Excel parsing logic (`parseGovernmentCalendar`) is unchanged. Only the storage (file → Prisma) changes.

- [ ] **Step 1: Replace only the store/read functions and route handlers in server/src/routes/calendar.ts**

Replace the full file with:

```typescript
// server/src/routes/calendar.ts
import { Router, Request, Response } from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/db.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const CN_MONTH: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8,
  '九': 9, '十': 10, '十一': 11, '十二': 12,
}

function toIsoDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getFillArgb(cell: ExcelJS.Cell): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fill = cell.fill as any
  if (!fill) return null
  const fg = fill.fgColor
  if (!fg) return null
  if (typeof fg.argb === 'string') return (fg.argb as string).toUpperCase()
  return null
}

async function parseGovernmentCalendar(rawBuffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  const ab = rawBuffer.buffer.slice(
    rawBuffer.byteOffset,
    rawBuffer.byteOffset + rawBuffer.byteLength
  ) as ArrayBuffer
  await wb.xlsx.load(ab)

  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Excel 工作表不存在')

  const titleText = String(ws.getCell(2, 2).value ?? '')
  const yearMatch = titleText.match(/(19|20)\d{2}/)
  const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear()

  const monthBlocks: { month: number; headerRow: number; startCol: number }[] = []

  ws.eachRow((row, rowNumber) => {
    row.eachCell((_cell, colNumber) => {
      const v = ws.getCell(rowNumber, colNumber).value
      if (v == null) return
      const s = String(v).trim()
      const month = CN_MONTH[s]
      if (!month) return
      const next2 = String(ws.getCell(rowNumber, colNumber + 2).value ?? '').trim()
      if (next2 !== '月') return
      const startCol = colNumber - 2
      const headerRow = rowNumber + 1
      if (String(ws.getCell(headerRow, startCol).value ?? '').trim() !== '日') return
      monthBlocks.push({ month, headerRow, startCol })
    })
  })

  if (monthBlocks.length === 0)
    throw new Error('找不到月份區塊（格式可能不是政府辦公日曆表）')

  const colorCount = new Map<string, number>()

  for (const blk of monthBlocks) {
    const gridStart = blk.headerRow + 1
    for (let w = 0; w < 6; w++) {
      const dayRow = gridStart + w * 2
      for (let dow = 0; dow < 7; dow++) {
        const cell = ws.getCell(dayRow, blk.startCol + dow)
        const val = cell.value
        if (typeof val !== 'number' || !Number.isInteger(val)) continue
        if (val < 1 || val > 31) continue
        const argb = getFillArgb(cell)
        if (argb && argb !== '00000000') {
          colorCount.set(argb, (colorCount.get(argb) ?? 0) + 1)
        }
      }
    }
  }

  const sortedColors = [...colorCount.entries()].sort((a, b) => b[1] - a[1])
  const holidayColor = sortedColors.length ? sortedColors[0][0] : null

  if (!holidayColor)
    throw new Error('偵測不到放假填色（此檔案可能未用顏色標示放假日）')

  const results = new Set<string>()

  for (const blk of monthBlocks) {
    const gridStart = blk.headerRow + 1
    for (let w = 0; w < 6; w++) {
      const dayRow = gridStart + w * 2
      for (let dow = 0; dow < 7; dow++) {
        const cell = ws.getCell(dayRow, blk.startCol + dow)
        const val = cell.value
        if (typeof val !== 'number' || !Number.isInteger(val)) continue
        const day = val
        if (day < 1 || day > 31) continue
        if (getFillArgb(cell) !== holidayColor) continue
        const iso = toIsoDate(year, blk.month, day)
        const wd = new Date(iso + 'T00:00:00').getDay()
        if (wd === 0 || wd === 6) continue
        results.add(iso)
      }
    }
  }

  const list = [...results].sort()
  return { year, holidayColor, nonWeekendHolidays: list }
}

// POST /api/calendar/import-government
router.post(
  '/import-government',
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const f = (req as Request & { file?: Express.Multer.File }).file
      if (!f) return res.status(400).json({ message: '缺少上傳檔案（file）' })

      const parsed = await parseGovernmentCalendar(f.buffer)

      await prisma.calendarConfig.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          year: parsed.year,
          nonWeekendHolidays: parsed.nonWeekendHolidays,
          sourceName: f.originalname,
          updatedAt: new Date(),
        },
        update: {
          year: parsed.year,
          nonWeekendHolidays: parsed.nonWeekendHolidays,
          sourceName: f.originalname,
          updatedAt: new Date(),
        },
      })

      return res.json({
        ok: true,
        year: parsed.year,
        detectedHolidayColor: parsed.holidayColor,
        nonWeekendHolidayCount: parsed.nonWeekendHolidays.length,
        sample: parsed.nonWeekendHolidays.slice(0, 12),
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '匯入失敗'
      return res.status(500).json({ ok: false, message: msg })
    }
  }
)

// GET /api/calendar/non-weekend-holidays
router.get('/non-weekend-holidays', async (req: Request, res: Response) => {
  const store = await prisma.calendarConfig.findUnique({ where: { id: 1 } })
  if (!store) return res.json({ year: null, nonWeekendHolidays: [] })

  const yearParam = Number(req.query.year)
  if (yearParam && store.year !== yearParam) {
    return res.json({ year: store.year, nonWeekendHolidays: [] })
  }

  return res.json({
    year: store.year,
    nonWeekendHolidays: (store.nonWeekendHolidays as string[]) ?? [],
  })
})

export default router
```

---

## Task 14: Write + Run Migration Script

**Files:**
- Create: `scripts/migrate-json-to-mysql.ts`

- [ ] **Step 1: Create the migration script**

```typescript
// scripts/migrate-json-to-mysql.ts
/**
 * One-time migration: JSON files → MySQL via Prisma
 * Safe to run multiple times (uses upsert).
 * Run: npx tsx scripts/migrate-json-to-mysql.ts
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const SERVER_DATA = path.join(ROOT, 'server', 'data')

const prisma = new PrismaClient()

function readJson<T>(dir: string, filename: string): T | null {
  const p = path.join(dir, filename)
  if (!fs.existsSync(p)) { console.log(`⚠️  Skipping missing file: ${p}`); return null }
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
}

async function migrateOptions() {
  console.log('\n📂 Migrating options.json...')
  const opts = readJson<{
    categories: { id: string; value: string; label: string; isActive: boolean; sortOrder: number }[]
    testUnits: { id: string; value: string; label: string; isActive: boolean; sortOrder: number;
      engineers: { id: string; value: string; label: string; isActive: boolean; sortOrder: number }[] }[]
    restDays: { weekends: boolean; specificDates: string[] }
  }>(DATA, 'options.json')
  if (!opts) return

  for (const c of opts.categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      create: { id: c.id, value: c.value, label: c.label, isActive: c.isActive, sortOrder: c.sortOrder },
      update: { value: c.value, label: c.label, isActive: c.isActive, sortOrder: c.sortOrder },
    })
  }
  console.log(`  ✓ ${opts.categories.length} categories`)

  for (const u of opts.testUnits) {
    await prisma.testUnit.upsert({
      where: { id: u.id },
      create: { id: u.id, value: u.value, label: u.label, isActive: u.isActive, sortOrder: u.sortOrder },
      update: { value: u.value, label: u.label, isActive: u.isActive, sortOrder: u.sortOrder },
    })
    for (const e of u.engineers) {
      await prisma.engineer.upsert({
        where: { id: e.id },
        create: { id: e.id, value: e.value, label: e.label, isActive: e.isActive, sortOrder: e.sortOrder, testUnitId: u.id },
        update: { value: e.value, label: e.label, isActive: e.isActive, sortOrder: e.sortOrder },
      })
    }
  }
  console.log(`  ✓ ${opts.testUnits.length} testUnits (+ engineers)`)

  await prisma.restDaysConfig.upsert({
    where: { id: 1 },
    create: { id: 1, weekends: opts.restDays.weekends, specificDates: opts.restDays.specificDates },
    update: { weekends: opts.restDays.weekends, specificDates: opts.restDays.specificDates },
  })
  console.log('  ✓ restDays')
}

async function migrateUsers() {
  console.log('\n👤 Migrating auth.json...')
  const store = readJson<{ users: {
    id: string; username: string; displayName: string; passwordHash: string;
    role: string; isActive: boolean; allowedUnits: string[]; linkedEngineer: string;
    createdAt: string; lastLoginAt: string
  }[] }>(DATA, 'auth.json')
  if (!store) return

  for (const u of store.users) {
    await prisma.user.upsert({
      where: { username: u.username },
      create: {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        passwordHash: u.passwordHash,
        role: u.role as 'super_admin' | 'admin' | 'user',
        isActive: u.isActive,
        allowedUnits: u.allowedUnits ?? [],
        linkedEngineer: u.linkedEngineer ?? '',
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
      },
      update: {
        displayName: u.displayName,
        passwordHash: u.passwordHash,
        role: u.role as 'super_admin' | 'admin' | 'user',
        isActive: u.isActive,
        allowedUnits: u.allowedUnits ?? [],
        linkedEngineer: u.linkedEngineer ?? '',
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
      },
    })
  }
  console.log(`  ✓ ${store.users.length} users`)
}

async function migrateSchedules() {
  console.log('\n📅 Migrating schedules.json...')
  const schedules = readJson<{
    id: string; category: string; projectName: string; taskDescription: string;
    testUnit: string; testEngineer: string; timeResource: number;
    startDate: string; endDate: string; requiredPersonnel: string;
    testReport: string; isCompleted: boolean; isDelayed: boolean;
    delayReason: string; createdBy: string; updatedBy: string;
    createdAt: string; updatedAt: string
  }[]>(DATA, 'schedules.json')
  if (!schedules) return

  for (const s of schedules) {
    await prisma.schedule.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        category: s.category, projectName: s.projectName, taskDescription: s.taskDescription,
        testUnit: s.testUnit, testEngineer: s.testEngineer, timeResource: s.timeResource,
        startDate: s.startDate, endDate: s.endDate, requiredPersonnel: s.requiredPersonnel,
        testReport: s.testReport, isCompleted: s.isCompleted, isDelayed: s.isDelayed,
        delayReason: s.delayReason ?? '', createdBy: s.createdBy, updatedBy: s.updatedBy,
        createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt),
      },
      update: {
        category: s.category, projectName: s.projectName, taskDescription: s.taskDescription,
        testUnit: s.testUnit, testEngineer: s.testEngineer, timeResource: s.timeResource,
        startDate: s.startDate, endDate: s.endDate, requiredPersonnel: s.requiredPersonnel,
        testReport: s.testReport, isCompleted: s.isCompleted, isDelayed: s.isDelayed,
        delayReason: s.delayReason ?? '', updatedBy: s.updatedBy, updatedAt: new Date(s.updatedAt),
      },
    })
  }
  console.log(`  ✓ ${schedules.length} schedules`)
}

async function migrateAudit() {
  console.log('\n📋 Migrating audit.json...')
  const logs = readJson<{
    id: string; timestamp: string; username: string; displayName: string;
    action: string; target: string; fields: string[]
  }[]>(DATA, 'audit.json')
  if (!logs) return

  for (const l of logs) {
    await prisma.auditLog.upsert({
      where: { id: l.id },
      create: {
        id: l.id,
        timestamp: new Date(l.timestamp),
        username: l.username,
        displayName: l.displayName,
        action: l.action,
        target: l.target,
        fields: l.fields ?? [],
      },
      update: {},  // audit logs are immutable
    })
  }
  console.log(`  ✓ ${logs.length} audit logs`)
}

async function migrateNotify() {
  console.log('\n🔔 Migrating notify.json...')
  const cfg = readJson<{
    enabled: boolean; teamsWebhookUrl: string; systemUrl: string;
    recipients: { id: string; name: string; note: string; isActive: boolean }[]
  }>(DATA, 'notify.json')
  if (!cfg) return

  await prisma.notifyConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      enabled: cfg.enabled,
      teamsWebhookUrl: cfg.teamsWebhookUrl ?? '',
      systemUrl: cfg.systemUrl ?? 'http://localhost:3001',
    },
    update: {
      enabled: cfg.enabled,
      teamsWebhookUrl: cfg.teamsWebhookUrl ?? '',
      systemUrl: cfg.systemUrl ?? 'http://localhost:3001',
    },
  })

  if (cfg.recipients) {
    for (const r of cfg.recipients) {
      await prisma.recipient.upsert({
        where: { id: r.id },
        create: { id: r.id, name: r.name, note: r.note ?? '', isActive: r.isActive, notifyConfigId: 1 },
        update: { name: r.name, note: r.note ?? '', isActive: r.isActive },
      })
    }
  }
  console.log(`  ✓ notifyConfig + ${cfg.recipients?.length ?? 0} recipients`)
}

async function migrateCalendar() {
  console.log('\n📅 Migrating server/data/calendar.json...')
  const cal = readJson<{
    year: number; nonWeekendHolidays: string[]; sourceName?: string; updatedAt: string
  }>(SERVER_DATA, 'calendar.json')
  if (!cal) return

  await prisma.calendarConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1, year: cal.year,
      nonWeekendHolidays: cal.nonWeekendHolidays,
      sourceName: cal.sourceName ?? null,
      updatedAt: new Date(cal.updatedAt),
    },
    update: {
      year: cal.year,
      nonWeekendHolidays: cal.nonWeekendHolidays,
      sourceName: cal.sourceName ?? null,
      updatedAt: new Date(cal.updatedAt),
    },
  })
  console.log(`  ✓ calendarConfig (year ${cal.year}, ${cal.nonWeekendHolidays.length} holidays)`)
}

async function main() {
  console.log('🚀 Starting JSON → MySQL migration...')
  try {
    await migrateOptions()
    await migrateUsers()
    await migrateSchedules()
    await migrateAudit()
    await migrateNotify()
    await migrateCalendar()
    console.log('\n✅ Migration complete. Original JSON files preserved as backup.')
  } catch (err) {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
```

- [ ] **Step 2: Run the migration script**

```bash
npx tsx scripts/migrate-json-to-mysql.ts
```

Expected output:
```
🚀 Starting JSON → MySQL migration...

📂 Migrating options.json...
  ✓ 5 categories
  ✓ 4 testUnits (+ engineers)
  ✓ restDays

👤 Migrating auth.json...
  ✓ N users

📅 Migrating schedules.json...
  ✓ N schedules

📋 Migrating audit.json...
  ✓ N audit logs

🔔 Migrating notify.json...
  ✓ notifyConfig + N recipients

📅 Migrating server/data/calendar.json...
  [✓ or ⚠️ Skipping missing file]

✅ Migration complete. Original JSON files preserved as backup.
```

---

## Task 15: Verify Everything Works

- [ ] **Step 1: Run the full test suite**

```bash
npm run test:server
```

Expected: all tests pass (including the new validateSchedule tests from Task 3)

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: `VSMS Server running at http://localhost:3001` with no Prisma errors

- [ ] **Step 3: Smoke test via browser**

Open `http://localhost:3001` and verify:

1. Login works (try with existing credentials that were migrated)
2. Schedule list loads (GET /api/schedules returns data)
3. Open a schedule → change `delayReason` to 2000 characters → save → should succeed
4. Try F12 → Console → run this fetch to test backend validation:

```javascript
fetch('/api/schedules', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    projectName: 'X'.repeat(200),  // over 100 char limit
    testUnit: 'SIT-HW',
    testEngineer: 'John',
    timeResource: 5,
    startDate: '2026/01/01',
    endDate: '2026/01/31',
    category: 'NPI',
    taskDescription: '',
    requiredPersonnel: '',
    testReport: '',
    isCompleted: false,
    isDelayed: false,
    delayReason: '',
  })
}).then(r => r.json()).then(console.log)
```

Expected: `{ errors: { projectName: "專案名稱不可超過 100 字" } }` with HTTP 422

5. Verify Settings > Options page still loads and saves correctly
6. Verify Audit log page shows existing migrated logs

- [ ] **Step 4: Check Prisma Studio (optional — visual DB inspection)**

```bash
npx prisma studio
```

Opens at `http://localhost:5555`. Browse each table to confirm data was migrated correctly.

---

## Notes

- **JSON files are preserved**: `data/*.json` and `server/data/calendar.json` are kept as backup. They are no longer read at runtime.
- **calendar.ts no longer uses `server/data/` directory** — the `DATA_DIR` and file-based functions have been removed. If `server/data/` directory only contained `calendar.json`, it can be deleted after confirming the migration succeeded.
- **`replace-all` admin path**: uses `WHERE testUnit IN (allowedUnits)` to delete only the unit's schedules, which is more precise than loading all schedules then filtering in memory.
- **appendAudit is now async** — all callers use `await appendAudit(...)`.
- **validateSchedule only applies to POST and PUT /:id** — the `replace-all` endpoint is bulk import and skips per-row validation intentionally (the frontend handles this via Excel diff review).
