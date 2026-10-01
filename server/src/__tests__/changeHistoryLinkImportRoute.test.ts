// server/src/__tests__/changeHistoryLinkImportRoute.test.ts
// 掛一個只含 schedules 路由的最小 app。db、storage、通知、VTMS 全部 mock：
// 正式環境的 DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { scheduleRow, type ScheduleRow } from './helpers/scheduleRow.js'

const m = vi.hoisted(() => ({
  scheduleFindUnique: vi.fn(),
  scheduleUpdate: vi.fn(),
  scheduleFindMany: vi.fn(),
  txFindMany: vi.fn(),
  txDeleteMany: vi.fn(),
  txCreateMany: vi.fn(),
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  historyCreateMany: vi.fn(),
  planBatch: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  prisma: {
    schedule: { findUnique: m.scheduleFindUnique, update: m.scheduleUpdate, findMany: m.scheduleFindMany },
    user: { findUnique: m.userFindUnique },
    changeHistory: { createMany: m.historyCreateMany },
    $transaction: m.transaction,
  },
}))
vi.mock('../lib/storage.js', () => ({ appendAudit: vi.fn() }))
vi.mock('../lib/scheduleNotify.js', () => ({ notifyScheduleAssigned: vi.fn() }))
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  applyHeaderAuth: () => true,
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../lib/vtmsClient.js', () => ({
  listProjects: vi.fn(),
  listTestPlans: vi.fn(),
  getTestPlanProgress: vi.fn(),
  getTestPlanProgressBatch: m.planBatch,
}))

import schedulesRouter from '../routes/schedules.js'

function app(role: string, username = 'Will_Wang') {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => {
    (req as unknown as { session: object }).session = { role, username }
    next()
  })
  a.use('/api/schedules', schedulesRouter)
  return a
}

const written = () => m.historyCreateMany.mock.calls.flatMap(c => c[0].data)

const formBody = {
  category: 'NPI', projectName: 'PDN-250048 ECA-6710C', taskDescription: 'EMC 預測試：輻射與傳導兩項',
  testUnit: 'EMC', testEngineer: 'Lily_Lee', timeResource: 5, startDate: '2026/10/01', endDate: '2026/10/03',
  requiredPersonnel: 'Amy_Chen', testReport: '', isCompleted: false, isDelayed: false, isCancelled: false,
  delayReason: '', device: 'Chamber-A',
}

function givenExisting(row: ScheduleRow) {
  m.scheduleFindUnique.mockResolvedValue(row)
  m.scheduleUpdate.mockImplementation(async ({ data }) => ({ ...row, ...data }))
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CHANGE_HISTORY_ENABLED
  m.userFindUnique.mockResolvedValue({
    username: 'Will_Wang', displayName: 'Will', role: 'admin', allowedUnits: [], linkedEngineer: '', canLinkVtms: true,
  })
  m.transaction.mockImplementation(async (fn) => fn({
    schedule: { findMany: m.txFindMany, deleteMany: m.txDeleteMany, createMany: m.txCreateMany },
  }))
  m.txFindMany.mockResolvedValue([])
  m.txDeleteMany.mockResolvedValue({ count: 0 })
  m.txCreateMany.mockResolvedValue({ count: 0 })
  m.scheduleFindMany.mockResolvedValue([])
  m.historyCreateMany.mockResolvedValue({ count: 1 })
  m.planBatch.mockResolvedValue({ 'plan-1': { planId: 'plan-1', planName: 'EMC 預測試計畫' } })
  givenExisting(scheduleRow())
})

describe('排程變動歷程：網頁端 VTMS 關聯', () => {
  it('關聯計畫 → link，存計畫名稱', async () => {
    const res = await request(app('admin')).patch('/api/schedules/s1/vtms-link').send({ vtmsPlanId: 'plan-1' })

    expect(res.status).toBe(200)
    expect(written()[0]).toMatchObject({
      action: 'link', actor: 'Will_Wang', actorSource: 'user', planId: 'plan-1',
      changes: [{ field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: null, after: 'EMC 預測試計畫' }],
    })
  })

  it('解除關聯 → unlink，planId 記被解除的計畫', async () => {
    givenExisting(scheduleRow({ vtmsPlanId: 'plan-1' }))

    const res = await request(app('admin')).patch('/api/schedules/s1/vtms-link').send({ vtmsPlanId: null })

    expect(res.status).toBe(200)
    expect(written()[0]).toMatchObject({
      action: 'unlink', planId: 'plan-1',
      changes: [{ field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: 'EMC 預測試計畫', after: null }],
    })
  })

  it('VTMS 打不到時仍成功，計畫欄位退回存 id', async () => {
    m.planBatch.mockRejectedValue(new Error('VTMS request timed out'))

    const res = await request(app('admin')).patch('/api/schedules/s1/vtms-link').send({ vtmsPlanId: 'plan-1' })

    expect(res.status).toBe(200)
    expect(written()[0].changes).toEqual([
      { field: 'vtmsPlanId', label: 'VTMS 關聯計畫', before: null, after: 'plan-1' },
    ])
  })

  it('關聯到原本就關聯的計畫 → 不寫入', async () => {
    givenExisting(scheduleRow({ vtmsPlanId: 'plan-1' }))

    const res = await request(app('admin')).patch('/api/schedules/s1/vtms-link').send({ vtmsPlanId: 'plan-1' })

    expect(res.status).toBe(200)
    expect(m.historyCreateMany).not.toHaveBeenCalled()
  })
})

describe('排程變動歷程：整批匯入', () => {
  it('admin：範圍內被刪的舊排程各一列 delete、每筆新排程各一列 import，其他單位不記', async () => {
    m.userFindUnique.mockResolvedValue({
      username: 'Will_Wang', displayName: 'Will', role: 'admin', allowedUnits: ['EMC'], linkedEngineer: '', canLinkVtms: false,
    })
    const old1 = scheduleRow({
      id: 'old-1', projectName: 'pdn_240001 ECA-5500', taskDescription: '舊的 EMC 排程-機密', vtmsPlanId: 'plan-9',
    })
    const old2 = scheduleRow({
      id: 'old-2', projectName: 'PDN 待 PM 提供', taskDescription: '未定案-機密', testEngineer: '',
    })
    m.txFindMany.mockResolvedValue([old1, old2])
    m.scheduleFindMany.mockImplementation(async () => [
      scheduleRow({ id: 'other-unit', testUnit: 'Safety' }),
      ...m.txCreateMany.mock.calls.flatMap(c => c[0].data).map((d: Partial<ScheduleRow>) => scheduleRow({ ...d })),
    ])
    const rows = [
      { ...formBody },
      { ...formBody, projectName: 'PDN-250049 ECA-6711', taskDescription: '安規預測試' },
    ]

    const res = await request(app('admin')).put('/api/schedules/replace-all').send(rows)

    expect(res.status).toBe(200)
    // 刪除前先把範圍內的舊排程整列讀出來，範圍與刪除條件相同
    expect(m.txFindMany).toHaveBeenCalledWith({ where: { testUnit: { in: ['EMC'] } } })
    expect(m.txDeleteMany).toHaveBeenCalledWith({ where: { testUnit: { in: ['EMC'] } } })
    expect(m.txFindMany.mock.invocationCallOrder[0]).toBeLessThan(m.txDeleteMany.mock.invocationCallOrder[0])

    expect(m.historyCreateMany).toHaveBeenCalledTimes(1)
    const entries = written()
    const createdIds = m.txCreateMany.mock.calls[0][0].data.map((d: { id: string }) => d.id)
    expect(entries.map(e => [e.action, e.entityId])).toEqual([
      ['delete', 'old-1'],
      ['delete', 'old-2'],
      ['import', createdIds[0]],
      ['import', createdIds[1]],
    ])
    expect(entries[0]).toMatchObject({
      pdn: 'PDN-240001', projectLabel: 'pdn_240001 ECA-5500',
      entityLabel: 'pdn_240001 ECA-5500 / NPI / Lily_Lee', planId: 'plan-9',
      actor: 'Will_Wang', actorSource: 'user', changes: [],
    })
    expect(entries[1]).toMatchObject({
      pdn: null, projectLabel: 'PDN 待 PM 提供', entityLabel: 'PDN 待 PM 提供 / NPI',
      actor: 'Will_Wang', actorSource: 'user', changes: [],
    })
    // 被刪排程的任務說明不會進到歷程的任何欄位
    expect(JSON.stringify(entries)).not.toMatch(/機密/)
    expect(entries.slice(2).map(e => e.pdn)).toEqual(['PDN-250048', 'PDN-250049'])
    expect(entries[2].changes).toHaveLength(8)
    expect(entries.map(e => e.entityId)).not.toContain('other-unit')
  })

  it('super_admin 匯入 0 筆（清空全部）→ 每筆被刪的舊排程各一列 delete', async () => {
    m.userFindUnique.mockResolvedValue({
      username: 'Will_Wang', displayName: 'Will', role: 'super_admin', allowedUnits: [], linkedEngineer: '', canLinkVtms: false,
    })
    m.txFindMany.mockResolvedValue([
      scheduleRow({ id: 'old-1' }),
      scheduleRow({ id: 'old-2', projectName: 'PDN-250049 ECA-6711', testUnit: 'Safety' }),
    ])

    const res = await request(app('super_admin')).put('/api/schedules/replace-all').send([])

    expect(res.status).toBe(200)
    expect(m.txFindMany).toHaveBeenCalledWith({ where: {} })
    expect(m.txDeleteMany).toHaveBeenCalledWith({ where: {} })
    expect(written().map(e => [e.action, e.entityId, e.pdn, e.actor])).toEqual([
      ['delete', 'old-1', 'PDN-250048', 'Will_Wang'],
      ['delete', 'old-2', 'PDN-250049', 'Will_Wang'],
    ])
  })

  it('範圍內沒有舊排程且匯入 0 筆 → 不寫入', async () => {
    m.userFindUnique.mockResolvedValue({
      username: 'Will_Wang', displayName: 'Will', role: 'super_admin', allowedUnits: [], linkedEngineer: '', canLinkVtms: false,
    })

    const res = await request(app('super_admin')).put('/api/schedules/replace-all').send([])

    expect(res.status).toBe(200)
    expect(m.historyCreateMany).not.toHaveBeenCalled()
  })
})
