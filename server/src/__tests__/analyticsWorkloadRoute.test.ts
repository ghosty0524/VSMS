// server/src/__tests__/analyticsWorkloadRoute.test.ts
// 掛一個只含 analytics 路由的最小 app。prisma 全部 mock：正式環境的
// DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

const { scheduleFindMany, calendarFindUnique, categoryFindMany } = vi.hoisted(() => ({
  scheduleFindMany: vi.fn(),
  calendarFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  prisma: {
    schedule: { findMany: scheduleFindMany },
    calendarConfig: { findUnique: calendarFindUnique },
    category: { findMany: categoryFindMany },
  },
}))
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  applyHeaderAuth: () => true,
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

import analyticsRouter from '../routes/analytics.js'

function app() {
  const a = express()
  a.use('/api/analytics', analyticsRouter)
  return a
}

const alice = {
  category: 'Regression', testEngineer: 'Alice', testUnit: 'RA',
  timeResource: 5, startDate: '2026/07/06', endDate: '2026/07/10',
}

beforeEach(() => {
  vi.clearAllMocks()
  scheduleFindMany.mockResolvedValue([])
  calendarFindUnique.mockResolvedValue(null)
  categoryFindMany.mockResolvedValue([])
})

describe('GET /api/analytics/workload 參數驗證', () => {
  it('缺 from 回 400', async () => {
    const res = await request(app()).get('/api/analytics/workload')
    expect(res.status).toBe(400)
    expect(scheduleFindMany).not.toHaveBeenCalled()
  })
  it('格式錯回 400', async () => {
    expect((await request(app()).get('/api/analytics/workload?from=2026/07')).status).toBe(400)
    expect((await request(app()).get('/api/analytics/workload?from=2026-13')).status).toBe(400)
  })
  it('to 早於 from 回 400', async () => {
    const res = await request(app()).get('/api/analytics/workload?from=2026-07&to=2026-06')
    expect(res.status).toBe(400)
  })
  it('超過 12 個月回 400', async () => {
    const res = await request(app()).get('/api/analytics/workload?from=2026-01&to=2027-01')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/analytics/workload 計算', () => {
  it('to 省略等於 from；單月結果含 scheduleCount 與 rate', async () => {
    scheduleFindMany.mockResolvedValue([alice])
    const res = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(res.status).toBe(200)
    expect(res.body.from).toBe('2026-07')
    expect(res.body.to).toBe('2026-07')
    expect(res.body.workdays).toBe(23)
    expect(res.body.engineers).toEqual([
      expect.objectContaining({
        testEngineer: 'Alice', testUnits: ['RA'], scheduleCount: 1,
        baseScore: 5, rate: 21.7, level: '偏低',
        unscheduledDays: 18, partialDays: 0, cappedDays: 0,
      }),
    ])
    expect(res.body.engineers[0]).not.toHaveProperty('limitations')
    expect(res.body.engineers[0]).not.toHaveProperty('overtimeHours')
  })

  it('跨月排程只算一筆，工作日兩月相加', async () => {
    scheduleFindMany.mockResolvedValue([{ ...alice, startDate: '2026/07/27', endDate: '2026/08/07' }])
    const res = await request(app()).get('/api/analytics/workload?from=2026-07&to=2026-08')
    expect(res.body.workdays).toBe(44)
    expect(res.body.engineers[0].scheduleCount).toBe(1)
    expect(res.body.engineers[0].baseScore).toBe(5)
  })

  it('篩選參數進 where，空 testEngineer 的排程不計', async () => {
    scheduleFindMany.mockResolvedValue([alice, { ...alice, testEngineer: '' }])
    const res = await request(app()).get(
      '/api/analytics/workload?from=2026-07&categories=NPI,AVL&testUnits=RA&testEngineers=Alice,Bob',
    )
    const where = scheduleFindMany.mock.calls[0][0].where
    expect(where).toMatchObject({
      isCancelled: false,
      startDate: { lte: '2026/07/31' },
      endDate: { gte: '2026/07/01' },
      category: { in: ['NPI', 'AVL'] },
      testUnit: { in: ['RA'] },
      testEngineer: { in: ['Alice', 'Bob'] },
    })
    expect(res.body.engineers.map((e: { testEngineer: string }) => e.testEngineer)).toEqual(['Alice'])
  })

  it('沒有篩選時 where 不含 in 條件', async () => {
    await request(app()).get('/api/analytics/workload?from=2026-07')
    const where = scheduleFindMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('category')
    expect(where).not.toHaveProperty('testUnit')
    expect(where).not.toHaveProperty('testEngineer')
  })

  it('行事曆年度相符時套用例假日，否則每個年份只留一則提醒', async () => {
    calendarFindUnique.mockResolvedValue({ id: 1, year: 2026, nonWeekendHolidays: ['2026-07-06'] })
    const ok = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(ok.body.workdays).toBe(22)
    expect(ok.body.notes).toEqual([])

    const miss = await request(app()).get('/api/analytics/workload?from=2027-01&to=2027-02')
    expect(miss.body.notes).toEqual(['行事曆未涵蓋 2027 年，工作日僅排除週六日、未排除國定假日'])
  })

  it('statsMode 為 excluded 的類別不進負載也不算筆數', async () => {
    categoryFindMany.mockResolvedValue([{ value: 'Leave', statsMode: 'excluded' }])
    scheduleFindMany.mockResolvedValue([{ ...alice, category: 'Leave' }])
    const res = await request(app()).get('/api/analytics/workload?from=2026-07')
    expect(res.body.engineers).toEqual([])
  })
})
