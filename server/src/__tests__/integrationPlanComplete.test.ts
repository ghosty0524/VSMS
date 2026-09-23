// server/src/__tests__/integrationPlanComplete.test.ts
// 掛一個只含 integration 路由的最小 app。prisma 全部 mock：正式環境的
// DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const { scheduleFindMany, scheduleUpdate } = vi.hoisted(() => ({
  scheduleFindMany: vi.fn(),
  scheduleUpdate: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  prisma: { schedule: { findMany: scheduleFindMany, update: scheduleUpdate } },
}))

import integrationRouter from '../routes/integration.js'

const KEY = 'test-integration-key'

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/integration', integrationRouter)
  return a
}

const complete = (planId: string) =>
  request(app()).patch(`/api/integration/plans/${planId}/complete`).set('X-Api-Key', KEY)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATION_API_KEY = KEY
  scheduleFindMany.mockResolvedValue([])
  scheduleUpdate.mockResolvedValue({})
})

describe('PATCH /api/integration/plans/:planId/complete', () => {
  it('把計畫底下沒取消、沒完成的排程都標完成，已取消的不動', async () => {
    scheduleFindMany.mockResolvedValue([
      { id: 's-cancelled', isCompleted: false, isCancelled: true },
      { id: 's-chamber', isCompleted: false, isCancelled: false },
      { id: 's-outsource', isCompleted: false, isCancelled: false },
    ])

    const res = await complete('p1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ planId: 'p1', completed: ['s-chamber', 's-outsource'], alreadyCompleted: 0, cancelled: 1 })
    expect(scheduleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { vtmsPlanId: 'p1' } }))
    expect(scheduleUpdate).toHaveBeenCalledTimes(2)
    const updatedIds = scheduleUpdate.mock.calls.map(c => c[0].where.id)
    expect(updatedIds).toEqual(['s-chamber', 's-outsource'])
    for (const [arg] of scheduleUpdate.mock.calls) {
      expect(arg.data.isCompleted).toBe(true)
      expect(arg.data.completedAt).toBeInstanceOf(Date)
      expect(arg.data.updatedAt).toBeInstanceOf(Date)
    }
  })

  it('重複呼叫是冪等的：都完成了就不再寫入', async () => {
    scheduleFindMany.mockResolvedValue([
      { id: 's-cancelled', isCompleted: false, isCancelled: true },
      { id: 's-chamber', isCompleted: true, isCancelled: false },
      { id: 's-outsource', isCompleted: true, isCancelled: false },
    ])

    const res = await complete('p1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ planId: 'p1', completed: [], alreadyCompleted: 2, cancelled: 1 })
    expect(scheduleUpdate).not.toHaveBeenCalled()
  })

  it('沒有排程連到這個計畫時回 200 與空結果，不是 404', async () => {
    const res = await complete('p-none')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ planId: 'p-none', completed: [], alreadyCompleted: 0, cancelled: 0 })
  })

  it('沒帶 API key 回 401，也不查資料庫', async () => {
    const res = await request(app()).patch('/api/integration/plans/p1/complete')

    expect(res.status).toBe(401)
    expect(scheduleFindMany).not.toHaveBeenCalled()
  })

  it('planId 只有空白時回 400', async () => {
    const res = await complete('%20')

    expect(res.status).toBe(400)
    expect(scheduleFindMany).not.toHaveBeenCalled()
  })
})
