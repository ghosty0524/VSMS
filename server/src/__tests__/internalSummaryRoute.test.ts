// server/src/__tests__/internalSummaryRoute.test.ts
// GET /api/internal/summary：vauth 入口頁卡片用。X-Api-Key 缺／錯 → 401；帳號不存在
// 或沒綁工程師 → 200 空陣列（不是 404，那是正常狀態）；成功回三項摘要。
// prisma 與 restDays 設定全部 stub，不碰真 DB。
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'

interface UserRow { username: string; linkedEngineer: string; isActive?: boolean }
interface ScheduleRow { testEngineer: string; startDate: string; endDate: string; isCompleted: boolean; isCancelled: boolean }

function makePrisma(users: UserRow[], schedules: ScheduleRow[]) {
  return {
    user: {
      findUnique: async ({ where }: { where: { username: string } }) =>
        (() => { const u = users.find(u => u.username === where.username); return u ? { isActive: true, ...u } : null })(),
    },
    schedule: {
      findMany: async ({ where }: { where: { testEngineer: string } }) =>
        schedules
          .filter(s => s.testEngineer === where.testEngineer)
          .map(({ startDate, endDate, isCompleted, isCancelled }) => ({ startDate, endDate, isCompleted, isCancelled })),
    },
    restDaysConfig: {
      findUnique: async () => ({ id: 1, weekends: true, specificDates: [] as string[] }),
    },
  }
}

let currentPrisma: ReturnType<typeof makePrisma>
vi.mock('../lib/db.js', () => ({ get prisma() { return currentPrisma } }))

async function buildApp() {
  const { default: internalRouter } = await import('../routes/internal.js')
  const app = express()
  app.use(express.json())
  app.use('/api/internal', internalRouter)
  return app
}

const originalKey = process.env.ORG_SYNC_API_KEY

beforeEach(() => {
  vi.resetModules()
  process.env.ORG_SYNC_API_KEY = 'test-key'
})

afterAll(() => {
  if (originalKey === undefined) delete process.env.ORG_SYNC_API_KEY
  else process.env.ORG_SYNC_API_KEY = originalKey
})

describe('GET /api/internal/summary', () => {
  it('缺 X-Api-Key → 401', async () => {
    currentPrisma = makePrisma([], [])
    const res = await request(await buildApp()).get('/api/internal/summary?username=Rock_Cai')
    expect(res.status).toBe(401)
  })

  it('X-Api-Key 錯誤 → 401', async () => {
    currentPrisma = makePrisma([], [])
    const res = await request(await buildApp())
      .get('/api/internal/summary?username=Rock_Cai')
      .set('X-Api-Key', 'wrong-key')
    expect(res.status).toBe(401)
  })

  it('帳號不存在 → 200 空陣列', async () => {
    currentPrisma = makePrisma([], [])
    const res = await request(await buildApp())
      .get('/api/internal/summary?username=Nobody')
      .set('X-Api-Key', 'test-key')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
  })

  it('帳號存在但沒綁工程師 → 200 空陣列', async () => {
    currentPrisma = makePrisma([{ username: 'admin1', linkedEngineer: '' }], [])
    const res = await request(await buildApp())
      .get('/api/internal/summary?username=admin1')
      .set('X-Api-Key', 'test-key')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
  })

  it('停用的帳號 → 200 空陣列（不回真實排程數）', async () => {
    currentPrisma = makePrisma([{ username: 'gone', linkedEngineer: 'Rock_Cai', isActive: false }], [
      { testEngineer: 'Rock_Cai', startDate: '2026/09/01', endDate: '2026/09/02', isCompleted: false, isCancelled: false },
    ])
    const res = await request(await buildApp())
      .get('/api/internal/summary?username=gone')
      .set('X-Api-Key', 'test-key')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
  })

  it('成功時回三項摘要，皆指向 /vsms/', async () => {
    currentPrisma = makePrisma(
      [{ username: 'Rock_Cai', linkedEngineer: 'Rock_Cai' }],
      [{ testEngineer: 'Rock_Cai', startDate: '2026/01/01', endDate: '2026/01/02', isCompleted: false, isCancelled: false }],
    )
    const res = await request(await buildApp())
      .get('/api/internal/summary?username=Rock_Cai')
      .set('X-Api-Key', 'test-key')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(3)
    expect(res.body.items.map((i: { linkUrl: string }) => i.linkUrl)).toEqual(['/vsms/', '/vsms/', '/vsms/'])
    expect(res.body.items.map((i: { label: string }) => i.label)).toEqual(['本週我的排程', '三個工作天內開始', '逾期'])
  })
})
