// server/src/__tests__/optionsPutVauth.test.ts
// Critical 2：PUT /api/options 是全刪重建。單一登入模式（AUTH_PROVIDER=vauth）下
// 單位與名冊由 vauth 的組織快照管理，前端唯一還會寫的只有顏色；若前端手上是一份
// 過期快照，全刪重建就會把 org-sync 剛建好的列刪掉、把 isActive 退回舊值，而且沒有
// 任何錯誤訊息。這裡驗證 vauth 分支只 patch 顏色／label／排序，local 分支維持原樣。
//
// 與 optionsPutEngineerGuard.test.ts 同樣用記憶體 prisma stub：正式的 DATABASE_URL
// 指向唯一一份 vsms 資料庫（沒有獨立測試庫），對真 prisma 呼叫 PUT 會整批 deleteMany
// 正式資料，絕對不能在測試中打真的 DB。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

interface FakeUnit { id: string; value: string; label: string; isActive: boolean; sortOrder: number; color: string | null; department: string | null }
interface FakeEngineer { id: string; value: string; label: string; isActive: boolean; sortOrder: number; color: string | null; testUnitId: string }

function makeFakePrisma() {
  const state = {
    categories: [] as Record<string, unknown>[],
    units: [
      { id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: 'SIT' },
      { id: 'u-sw', value: 'SIT-SW', label: 'SIT-SW', isActive: true, sortOrder: 1, color: null, department: 'SIT' },
    ] as FakeUnit[],
    engineers: [
      { id: 'e-rock', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null, testUnitId: 'u-hw' },
      { id: 'e-harry', value: 'Harry_Chen', label: 'Harry_Chen', isActive: true, sortOrder: 1, color: null, testUnitId: 'u-hw' },
      { id: 'e-ashley', value: 'Ashley_Liu', label: 'Ashley_Liu', isActive: true, sortOrder: 0, color: null, testUnitId: 'u-sw' },
    ] as FakeEngineer[],
    schedules: [] as { testEngineer: string }[],
    devices: [] as Record<string, unknown>[],
    restDays: { id: 1, weekends: true, specificDates: [] as string[] },
    audits: [] as unknown[],
  }

  const spies = {
    engineerDeleteMany: vi.fn(),
    testUnitDeleteMany: vi.fn(),
    testUnitCreate: vi.fn(),
  }

  const handle = () => ({
    category: {
      findMany: async () => state.categories,
      deleteMany: async () => { state.categories = [] },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => { state.categories.push(...data) },
    },
    device: { findMany: async () => state.devices },
    restDaysConfig: {
      findUnique: async () => state.restDays,
      upsert: async ({ update }: { update: { weekends: boolean; specificDates: string[] } }) => {
        state.restDays = { ...state.restDays, ...update }
        return state.restDays
      },
    },
    schedule: {
      findMany: async () => state.schedules.map(s => ({ testEngineer: s.testEngineer })),
    },
    testUnit: {
      findMany: async ({ include }: { include?: { engineers?: unknown } } = {}) =>
        [...state.units].sort((a, b) => a.sortOrder - b.sortOrder).map(u => (include?.engineers
          ? { ...u, engineers: state.engineers.filter(e => e.testUnitId === u.id).sort((a, b) => a.sortOrder - b.sortOrder) }
          : u)),
      deleteMany: async () => { spies.testUnitDeleteMany(); state.units = [] },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUnit> }) => {
        const row = state.units.find(u => u.id === where.id)
        if (!row) throw new Error(`no unit ${where.id}`)
        Object.assign(row, data)
        return row
      },
      create: async ({ data }: { data: Record<string, unknown> & { engineers?: { create: Omit<FakeEngineer, 'testUnitId'>[] } } }) => {
        spies.testUnitCreate(data)
        const { engineers, ...unit } = data
        state.units.push(unit as unknown as FakeUnit)
        state.engineers.push(...(engineers?.create ?? []).map(e => ({ ...e, testUnitId: unit.id as string })))
        return unit
      },
    },
    engineer: {
      findMany: async () => state.engineers,
      deleteMany: async () => { spies.engineerDeleteMany(); state.engineers = [] },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeEngineer> }) => {
        const row = state.engineers.find(e => e.id === where.id)
        if (!row) throw new Error(`no engineer ${where.id}`)
        Object.assign(row, data)
        return row
      },
    },
  })

  const prisma = {
    ...handle(),
    $transaction: async (cb: (tx: ReturnType<typeof handle>) => Promise<unknown>) => cb(handle()),
    user: { findUnique: async () => ({ username: 'tester', displayName: 'Tester' }) },
    auditLog: { create: async ({ data }: { data: unknown }) => { state.audits.push(data) } },
  }

  return { prisma, state, spies }
}

let currentPrisma: ReturnType<typeof makeFakePrisma>['prisma']
vi.mock('../lib/db.js', () => ({ get prisma() { return currentPrisma } }))

async function buildApp() {
  const { default: optionsRouter } = await import('../routes/options.js')
  const app = express()
  app.use(express.json())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = { sessionId: 's1', username: 'tester', role: 'admin' } as unknown as Request['session']
    next()
  })
  app.use('/api/options', optionsRouter)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : 'error' })
  })
  return app
}

// 過期前端快照：SIT-HW 被標成停用、Rock_Cai 整個不見、Harry_Chen 換了顏色，
// 另外還帶了一個資料庫裡沒有的單位（舊前端剛新增、尚未同步的殘留）。
const staleBody = {
  categories: [{ id: 'c1', value: 'FT', label: 'FT', isActive: true, sortOrder: 0, statsMode: 'count' }],
  devices: [],
  restDays: { weekends: false, specificDates: ['2026-10-10'] },
  testUnits: [
    {
      id: 'u-hw', value: 'SIT-HW', label: '硬體課', isActive: false, sortOrder: 5, color: '#112233', department: '亂寫',
      engineers: [{ id: 'e-harry', value: 'Harry_Chen', label: 'Harry_Chen', isActive: false, sortOrder: 9, color: '#aabbcc' }],
    },
    {
      id: 'u-ghost', value: 'GHOST', label: 'GHOST', isActive: true, sortOrder: 7, color: null, department: null,
      engineers: [{ id: 'e-ghost', value: 'Nobody', label: 'Nobody', isActive: true, sortOrder: 0, color: null }],
    },
  ],
}

const originalProvider = process.env.AUTH_PROVIDER
beforeEach(() => { vi.resetModules() })
afterEach(() => {
  if (originalProvider === undefined) delete process.env.AUTH_PROVIDER
  else process.env.AUTH_PROVIDER = originalProvider
})

describe('PUT /api/options under AUTH_PROVIDER=vauth', () => {
  it('過期快照不會刪掉同步來的名冊列，也不會改動 isActive／department', async () => {
    process.env.AUTH_PROVIDER = 'vauth'
    const fake = makeFakePrisma()
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options').send(staleBody)

    expect(res.status).toBe(200)
    expect(fake.spies.engineerDeleteMany).not.toHaveBeenCalled()
    expect(fake.spies.testUnitDeleteMany).not.toHaveBeenCalled()
    // body 裡沒提到的 Rock_Cai 與 Ashley_Liu 還在
    expect(fake.state.engineers.map(e => e.value).sort()).toEqual(['Ashley_Liu', 'Harry_Chen', 'Rock_Cai'])
    // isActive 一律不從 body 改
    expect(fake.state.engineers.find(e => e.value === 'Harry_Chen')!.isActive).toBe(true)
    expect(fake.state.units.find(u => u.value === 'SIT-HW')!.isActive).toBe(true)
    expect(fake.state.units.find(u => u.value === 'SIT-HW')!.department).toBe('SIT')
    // DB 裡沒有的單位／人員不會被建出來
    expect(fake.state.units.map(u => u.value).sort()).toEqual(['SIT-HW', 'SIT-SW'])
    expect(fake.spies.testUnitCreate).not.toHaveBeenCalled()
  })

  it('顏色、label 與排序仍會套用；categories 與 restDays 照舊全量寫入', async () => {
    process.env.AUTH_PROVIDER = 'vauth'
    const fake = makeFakePrisma()
    currentPrisma = fake.prisma
    await request(await buildApp()).put('/api/options').send(staleBody)

    const harry = fake.state.engineers.find(e => e.value === 'Harry_Chen')!
    expect(harry.color).toBe('#aabbcc')
    expect(harry.sortOrder).toBe(9)
    const hw = fake.state.units.find(u => u.value === 'SIT-HW')!
    expect(hw.color).toBe('#112233')
    expect(hw.label).toBe('硬體課')
    expect(hw.sortOrder).toBe(5)
    expect(fake.state.categories).toHaveLength(1)
    expect(fake.state.restDays).toMatchObject({ weekends: false, specificDates: ['2026-10-10'] })
    expect(fake.state.audits).toHaveLength(1)
  })

  it('回應是重新讀出的資料庫狀態，不是原樣回吐 body（前端才會重新同步）', async () => {
    process.env.AUTH_PROVIDER = 'vauth'
    const fake = makeFakePrisma()
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options').send(staleBody)

    // body 帶的 GHOST 不在回應裡（沒被建立），body 沒帶的 SIT-SW 在
    expect(res.body.testUnits.map((u: { value: string }) => u.value).sort()).toEqual(['SIT-HW', 'SIT-SW'])
    const hw = res.body.testUnits.find((u: { value: string }) => u.value === 'SIT-HW')
    // body 說 false，資料庫說 true —— 回應要是資料庫那份
    expect(hw.isActive).toBe(true)
    expect(hw.color).toBe('#112233')
    expect(hw.engineers.map((e: { value: string }) => e.value).sort()).toEqual(['Harry_Chen', 'Rock_Cai'])
  })
})

describe('PUT /api/options under AUTH_PROVIDER=local', () => {
  it('維持原本的全刪重建', async () => {
    process.env.AUTH_PROVIDER = 'local'
    const fake = makeFakePrisma()
    currentPrisma = fake.prisma
    const res = await request(await buildApp()).put('/api/options').send(staleBody)

    expect(res.status).toBe(200)
    expect(fake.spies.engineerDeleteMany).toHaveBeenCalled()
    expect(fake.spies.testUnitDeleteMany).toHaveBeenCalled()
    expect(fake.spies.testUnitCreate).toHaveBeenCalledTimes(2)
    // body 就是權威：Rock_Cai／Ashley_Liu 消失，GHOST 單位被建出來
    expect(fake.state.engineers.map(e => e.value).sort()).toEqual(['Harry_Chen', 'Nobody'])
    expect(fake.state.units.map(u => u.value).sort()).toEqual(['GHOST', 'SIT-HW'])
    expect(fake.state.units.find(u => u.value === 'SIT-HW')!.isActive).toBe(false)
    // 原樣回吐 body
    expect(res.body.testUnits.map((u: { value: string }) => u.value)).toEqual(['SIT-HW', 'GHOST'])
  })
})
