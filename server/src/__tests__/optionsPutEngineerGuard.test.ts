// server/src/__tests__/optionsPutEngineerGuard.test.ts
// Important 5：engineerInUse.test.ts 只測到純函式本身（對它自己的合約而言是對
// 的），但 Critical 1 的缺陷出在「路由傳給純函式的參數」，沒有任何測試打過
// PUT /api/options 這條路由。這裡用 supertest 掛一個只含 options 路由的最小
// app，並把 ../lib/db.js 換成記憶體版 prisma stub——正式環境的 DATABASE_URL
// 指到唯一一份 vsms 資料庫（沒有獨立測試庫），對真正的 prisma 呼叫
// $transaction 會整批 deleteMany() 正式的 categories/testUnits/engineers，
// 絕對不能在測試中打真的 DB。stub 讓交易語意（guard 失敗要 rollback、不能
// 呼叫任何 deleteMany）可被驗證，同時保證測試不會碰到正式資料。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

interface FakeEngineer { id: string; value: string; label: string; isActive: boolean; sortOrder: number; color: string | null; testUnitId: string }
interface FakeState {
  categories: unknown[]
  testUnits: unknown[]
  engineers: FakeEngineer[]
  schedules: { testEngineer: string }[]
  restDays: { id: number; weekends: boolean; specificDates: string[] }
  auditLogs: unknown[]
}

function makeTxHandle(state: FakeState) {
  return {
    engineer: {
      findMany: async ({ select }: { select?: { value?: boolean } } = {}) =>
        state.engineers.map(e => (select?.value ? { value: e.value } : e)),
      deleteMany: async () => { state.engineers = [] },
    },
    testUnit: {
      findMany: async () => state.testUnits,
      deleteMany: async () => { state.testUnits = [] },
      create: async ({ data }: { data: Record<string, unknown> & { engineers?: { create: Omit<FakeEngineer, 'testUnitId'>[] } } }) => {
        const { engineers, ...unit } = data
        const created = (engineers?.create ?? []).map(e => ({ ...e, testUnitId: unit.id as string }))
        state.testUnits.push({ ...unit, engineers: created })
        state.engineers.push(...created)
        return unit
      },
    },
    category: {
      deleteMany: async () => { state.categories = [] },
      createMany: async ({ data }: { data: unknown[] }) => { state.categories.push(...data) },
    },
    schedule: {
      findMany: async ({ select }: { select?: { testEngineer?: boolean } } = {}) =>
        state.schedules.map(s => (select?.testEngineer ? { testEngineer: s.testEngineer } : s)),
    },
    restDaysConfig: {
      upsert: async ({ update }: { update: { weekends: boolean; specificDates: string[] } }) => {
        state.restDays = { ...state.restDays, ...update }
        return state.restDays
      },
    },
  }
}

function makeFakePrisma(initial: { engineers: string[]; schedules: string[] }) {
  const state: FakeState = {
    categories: [],
    testUnits: [],
    engineers: initial.engineers.map((v, i) => ({
      id: `eng-${i}`, value: v, label: v, isActive: true, sortOrder: i, color: null, testUnitId: 'u-existing',
    })),
    schedules: initial.schedules.map(testEngineer => ({ testEngineer })),
    restDays: { id: 1, weekends: true, specificDates: [] },
    auditLogs: [],
  }

  const prisma = {
    // 舊實作在進交易「之前」就直接呼叫 prisma.schedule.findMany（不是
    // tx.schedule），因此頂層 prisma 也要提供同一組讀寫方法（委派到同一份
    // state），讓迴歸測試量到的是真正的行為差異（guard 邏輯本身），而不是
    // 因為 stub 形狀不合舊程式碼而意外拋出的 500。
    ...makeTxHandle(state),
    $transaction: async (cb: (tx: ReturnType<typeof makeTxHandle>) => Promise<void>) => cb(makeTxHandle(state)),
    user: {
      findUnique: async () => ({ username: 'tester', displayName: 'Tester' }),
    },
    auditLog: {
      create: async ({ data }: { data: unknown }) => { state.auditLogs.push(data) },
    },
  }

  return { prisma, state }
}

// options.ts 匯入 '../lib/db.js' 取得 { prisma }；storage.ts 的 appendAudit 也
// 從同一個檔案匯入。vi.mock 依解析後的模組路徑生效，兩邊會拿到同一份 stub。
let currentPrisma: ReturnType<typeof makeFakePrisma>['prisma']
vi.mock('../lib/db.js', () => ({
  get prisma() { return currentPrisma },
}))

async function buildApp() {
  const { default: optionsRouter } = await import('../routes/options.js')
  const app = express()
  app.use(express.json())
  // requireAuth 只檢查 req.session.sessionId，直接塞一個已登入的 session，
  // 略過 express-session／cookie 這層與本測試無關的機制
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

function makeBody(engineerValues: string[]) {
  return {
    categories: [],
    devices: [],
    restDays: { weekends: true, specificDates: [] },
    testUnits: [
      {
        id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 0, color: null,
        engineers: engineerValues.map((v, i) => ({
          id: `e-${v}`, value: v, label: v, isActive: true, sortOrder: i, color: null,
        })),
      },
    ],
  }
}

beforeEach(() => {
  vi.resetModules()
})

describe('PUT /api/options — engineer-in-use guard (route level)', () => {
  it('與人員無關的設定儲存，即使已有孤兒排程引用（如 Ben_Ko）也會成功', async () => {
    // 對照 CRITICAL 1 的正式場景：engineers 表裡只有 Alice_Wu，但 18 筆排程
    // 引用著早已不在 engineers 表中的 Ben_Ko。這是 Critical 1 的迴歸鎖：
    // 用舊實作（比對整個 body 而非「這次請求要移除的集合」）跑這個測試會得到
    // 400 ENGINEER_IN_USE，因為 Ben_Ko 不在 body 的引用者名單中就被視為「被移
        // 除」。新實作只看仍在 engineers 表中的人員，Ben_Ko 因此對 guard 不可見。
    const fake = makeFakePrisma({
      engineers: ['Alice_Wu'],
      schedules: Array.from({ length: 18 }, () => 'Ben_Ko'),
    })
    currentPrisma = fake.prisma
    const app = await buildApp()

    const body = makeBody(['Alice_Wu']) // 人員名單不變，只是一次「無關」的設定儲存
    const res = await request(app).put('/api/options').send(body)

    expect(res.status).toBe(200)
    expect(fake.state.engineers.map(e => e.value)).toEqual(['Alice_Wu'])
  })

  it('移除仍被排程引用的人員時回 400 ENGINEER_IN_USE，且不寫入（transaction rollback）', async () => {
    const fake = makeFakePrisma({
      engineers: ['Alice_Wu', 'Carl_Lee'],
      schedules: ['Carl_Lee', 'Carl_Lee'],
    })
    currentPrisma = fake.prisma
    const app = await buildApp()

    const body = makeBody(['Alice_Wu']) // Carl_Lee 從 body 中消失 = 移除
    const res = await request(app).put('/api/options').send(body)

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('ENGINEER_IN_USE')
    expect(res.body.message).toContain('Carl_Lee')
    expect(res.body.message).toContain('2')
    // guard 若沒擋在寫入前，engineers 表會被 deleteMany() 清空；驗證真的沒動
    expect(fake.state.engineers.map(e => e.value).sort()).toEqual(['Alice_Wu', 'Carl_Lee'])
  })

  it('移除沒有排程引用的人員可以成功', async () => {
    const fake = makeFakePrisma({
      engineers: ['Alice_Wu', 'Carl_Lee'],
      schedules: ['Alice_Wu'], // Carl_Lee 沒有任何排程引用
    })
    currentPrisma = fake.prisma
    const app = await buildApp()

    const body = makeBody(['Alice_Wu'])
    const res = await request(app).put('/api/options').send(body)

    expect(res.status).toBe(200)
    expect(fake.state.engineers.map(e => e.value)).toEqual(['Alice_Wu'])
  })

  it('空字串 testEngineer 不視為引用，移除人員仍可成功', async () => {
    const fake = makeFakePrisma({
      engineers: ['Alice_Wu'],
      schedules: ['', ''], // 尚未指派，不是對任何人員的引用
    })
    currentPrisma = fake.prisma
    const app = await buildApp()

    const body = makeBody([]) // 移除唯一的人員 Alice_Wu
    const res = await request(app).put('/api/options').send(body)

    expect(res.status).toBe(200)
    expect(fake.state.engineers).toEqual([])
  })
})
