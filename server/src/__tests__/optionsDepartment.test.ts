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
    category: { findMany: async () => [], deleteMany: async () => {}, createMany: async () => {} },
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
