// server/src/__tests__/changeHistoryIntegrationRoute.test.ts
// 掛一個只含 integration 路由的最小 app。prisma 與 VTMS 全部 mock：正式環境的
// DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { scheduleRow, type ScheduleRow } from './helpers/scheduleRow.js'

const m = vi.hoisted(() => ({
  scheduleFindUnique: vi.fn(),
  scheduleUpdate: vi.fn(),
  scheduleFindMany: vi.fn(),
  historyCreateMany: vi.fn(),
  planBatch: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  prisma: {
    schedule: { findUnique: m.scheduleFindUnique, update: m.scheduleUpdate, findMany: m.scheduleFindMany },
    changeHistory: { createMany: m.historyCreateMany },
  },
}))
vi.mock('../lib/vtmsClient.js', () => ({ getTestPlanProgressBatch: m.planBatch }))

import integrationRouter from '../routes/integration.js'
import { syncActor } from '../lib/changeHistory.js'

const KEY = 'test-integration-key'

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/integration', integrationRouter)
  return a
}

const patch = (path: string) => request(app()).patch(`/api/integration${path}`).set('X-Api-Key', KEY)
const written = () => m.historyCreateMany.mock.calls.flatMap(c => c[0].data)

function givenExisting(row: ScheduleRow) {
  m.scheduleFindUnique.mockResolvedValue(row)
  m.scheduleUpdate.mockImplementation(async ({ data }) => ({ ...row, ...data }))
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CHANGE_HISTORY_ENABLED
  process.env.INTEGRATION_API_KEY = KEY
  m.historyCreateMany.mockResolvedValue({ count: 1 })
  m.planBatch.mockResolvedValue({ 'plan-1': { planId: 'plan-1', planName: 'EMC 預測試計畫' } })
  m.scheduleFindMany.mockResolvedValue([])
  givenExisting(scheduleRow())
})

describe('syncActor', () => {
  it('有帶取值；沒帶、不是字串或空白記 unknown；過長截到 100 字', () => {
    expect(syncActor({ actor: ' Will_Wang ' })).toBe('Will_Wang')
    expect(syncActor({ actor: 'system' })).toBe('system')
    expect(syncActor(undefined)).toBe('unknown')
    expect(syncActor({})).toBe('unknown')
    expect(syncActor({ actor: 123 })).toBe('unknown')
    expect(syncActor({ actor: '   ' })).toBe('unknown')
    expect(syncActor({ actor: 'x'.repeat(150) })).toBe('x'.repeat(100))
  })
})

describe('VTMS 同步呼叫的變動歷程', () => {
  it('delay 帶 actor → delay，延遲記前後值、延遲原因只記有改', async () => {
    const res = await patch('/schedules/s1/delay')
      .send({ date: '2026-10-01', content: '樣品延後到貨-內部說明', actor: 'Will_Wang' })

    expect(res.status).toBe(200)
    const [entry] = written()
    expect(entry).toMatchObject({
      action: 'delay', actor: 'Will_Wang', actorSource: 'vtms-sync', entityId: 's1',
      changes: [
        { field: 'isDelayed', label: '延遲', before: '否', after: '是' },
        { field: 'delayReason', label: '延遲原因', changed: true },
      ],
    })
    expect(JSON.stringify(entry)).not.toContain('樣品延後')
  })

  it('delay 沒帶 actor（舊版 VTMS）→ actor 記 unknown', async () => {
    await patch('/schedules/s1/delay').send({ date: '2026-10-01', content: '延後' })

    expect(written()[0]).toMatchObject({ action: 'delay', actor: 'unknown', actorSource: 'vtms-sync' })
  })

  it('vtms-plan 關聯 → link，存計畫名稱', async () => {
    const res = await patch('/schedules/s1/vtms-plan').send({ vtmsPlanId: 'plan-1', actor: 'Will_Wang' })

    expect(res.status).toBe(200)
    expect(written()[0]).toMatchObject({
      action: 'link', actor: 'Will_Wang', actorSource: 'vtms-sync', planId: 'plan-1',
      changes: [{ field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: null, after: 'EMC 預測試計畫' }],
    })
  })

  it('vtms-plan 解除 → unlink', async () => {
    givenExisting(scheduleRow({ vtmsPlanId: 'plan-1' }))

    await patch('/schedules/s1/vtms-plan').send({ vtmsPlanId: null, actor: 'Will_Wang' })

    expect(written()[0]).toMatchObject({
      action: 'unlink', planId: 'plan-1',
      changes: [{ field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: 'EMC 預測試計畫', after: null }],
    })
  })

  it('complete 帶 actor=system → complete', async () => {
    const res = await patch('/schedules/s1/complete').send({ actor: 'system' })

    expect(res.status).toBe(200)
    expect(written()[0]).toMatchObject({
      action: 'complete', actor: 'system', actorSource: 'vtms-sync',
      changes: [{ field: 'isCompleted', label: '完成', before: '否', after: '是' }],
    })
  })

  it('complete 遇到已取消的排程 → 不改也不記', async () => {
    givenExisting(scheduleRow({ isCancelled: true }))

    const res = await patch('/schedules/s1/complete').send({ actor: 'system' })

    expect(res.status).toBe(200)
    expect(m.scheduleUpdate).not.toHaveBeenCalled()
    expect(m.historyCreateMany).not.toHaveBeenCalled()
  })

  it('complete 重複呼叫（已完成）→ 沒有變動不記', async () => {
    givenExisting(scheduleRow({ isCompleted: true }))

    await patch('/schedules/s1/complete').send({ actor: 'system' })

    expect(m.historyCreateMany).not.toHaveBeenCalled()
  })

  it('plans/:planId/complete → 每筆被標完成的排程各一列，一次寫入', async () => {
    const chamber = scheduleRow({ id: 's-chamber', vtmsPlanId: 'p1' })
    const outsource = scheduleRow({ id: 's-outsource', vtmsPlanId: 'p1', device: 'Outsource' })
    const cancelled = scheduleRow({ id: 's-cancelled', vtmsPlanId: 'p1', isCancelled: true })
    const all = [cancelled, chamber, outsource]
    m.scheduleFindMany.mockResolvedValue(all)
    m.scheduleUpdate.mockImplementation(async ({ where, data }) => ({ ...all.find(s => s.id === where.id), ...data }))

    const res = await patch('/plans/p1/complete').send({ actor: 'system' })

    expect(res.body).toEqual({ planId: 'p1', completed: ['s-chamber', 's-outsource'], alreadyCompleted: 0, cancelled: 1 })
    expect(m.historyCreateMany).toHaveBeenCalledTimes(1)
    const entries = written()
    expect(entries.map(e => e.entityId)).toEqual(['s-chamber', 's-outsource'])
    for (const e of entries) {
      expect(e).toMatchObject({
        action: 'complete', actor: 'system', actorSource: 'vtms-sync', planId: 'p1',
        changes: [{ field: 'isCompleted', label: '完成', before: '否', after: '是' }],
      })
    }
  })

  it('歷程寫入失敗時 VTMS 的呼叫仍回 200', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.historyCreateMany.mockRejectedValue(new Error('db down'))

    const res = await patch('/schedules/s1/complete').send({ actor: 'system' })

    expect(res.status).toBe(200)
    expect(err).toHaveBeenCalledWith('change_history_error', expect.anything())
    err.mockRestore()
  })
})
