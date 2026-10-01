// server/src/__tests__/changeHistorySchedulesRoute.test.ts
// 掛一個只含 schedules 路由的最小 app。db、storage、通知、VTMS 全部 mock：
// 正式環境的 DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
// changeHistory.ts 不 mock：要驗證從路由到 createMany 的整條路。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { scheduleRow, type ScheduleRow } from './helpers/scheduleRow.js'

const m = vi.hoisted(() => ({
  scheduleCreate: vi.fn(),
  scheduleFindUnique: vi.fn(),
  scheduleUpdate: vi.fn(),
  scheduleDelete: vi.fn(),
  userFindUnique: vi.fn(),
  historyCreateMany: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  prisma: {
    schedule: {
      create: m.scheduleCreate, findUnique: m.scheduleFindUnique,
      update: m.scheduleUpdate, delete: m.scheduleDelete,
    },
    user: { findUnique: m.userFindUnique },
    changeHistory: { createMany: m.historyCreateMany },
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
  getTestPlanProgressBatch: vi.fn().mockResolvedValue({}),
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

/** 與 scheduleRow() 預設值相同的完整表單內容。 */
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
  m.scheduleCreate.mockImplementation(async ({ data }) => scheduleRow({ ...data }))
  m.scheduleDelete.mockResolvedValue(scheduleRow())
  m.historyCreateMany.mockResolvedValue({ count: 1 })
  givenExisting(scheduleRow())
})

describe('排程變動歷程：網頁端新增／修改／刪除', () => {
  it('POST 新增 → 一列 create，記八個關鍵欄位', async () => {
    const res = await request(app('admin')).post('/api/schedules').send(formBody)

    expect(res.status).toBe(201)
    expect(written()).toHaveLength(1)
    const [entry] = written()
    expect(entry).toMatchObject({
      action: 'create', actor: 'Will_Wang', actorSource: 'user',
      entityType: 'schedule', entityId: res.body.id, pdn: 'PDN-250048',
    })
    expect(entry.changes.map((c: { field: string }) => c.field)).toEqual([
      'category', 'projectName', 'device', 'testUnit', 'testEngineer', 'timeResource', 'startDate', 'endDate',
    ])
  })

  it('PUT 管理者修改 → 記值欄位存前後值、任務說明只記有改', async () => {
    const res = await request(app('admin')).put('/api/schedules/s1').send({
      ...formBody, endDate: '2026/10/17', testEngineer: 'Will_Wang', taskDescription: '改成三項：輻射、傳導、ESD',
    })

    expect(res.status).toBe(200)
    const [entry] = written()
    expect(entry).toMatchObject({ action: 'update', actor: 'Will_Wang', actorSource: 'user', entityId: 's1' })
    expect(entry.changes).toEqual([
      { field: 'testEngineer', label: '測試人員', before: 'Lily_Lee', after: 'Will_Wang' },
      { field: 'endDate', label: '結束日', before: '2026/10/03', after: '2026/10/17' },
      { field: 'taskDescription', label: '任務說明', changed: true },
    ])
    // 整筆寫入物件都不含任務說明的新舊內容
    expect(entry.entityLabel).toBe('PDN-250048 ECA-6710C / NPI / Will_Wang')
    expect(JSON.stringify(entry)).not.toContain('ESD')
    expect(JSON.stringify(entry)).not.toContain('EMC 預測試')
  })

  it('PUT 只改主管旗標 → flag', async () => {
    const res = await request(app('admin')).put('/api/schedules/s1').send({ adminFlag: true, adminFlagNote: '交期有風險' })

    expect(res.status).toBe(200)
    expect(written()[0]).toMatchObject({
      action: 'flag',
      changes: [
        { field: 'adminFlag', label: '主管旗標', before: '否', after: '是' },
        { field: 'adminFlagNote', label: '主管旗標備註', changed: true },
      ],
    })
  })

  it('PUT 內容與現值相同 → 不寫入', async () => {
    const res = await request(app('admin')).put('/api/schedules/s1').send(formBody)

    expect(res.status).toBe(200)
    expect(m.historyCreateMany).not.toHaveBeenCalled()
  })

  it('PUT user 角色改自己的排程也會記', async () => {
    m.userFindUnique.mockResolvedValue({
      username: 'lily', displayName: 'Lily', role: 'user', allowedUnits: [], linkedEngineer: 'Lily_Lee',
    })

    const res = await request(app('user', 'lily')).put('/api/schedules/s1').send({ userFlag: true, userFlagNote: '設備還沒到' })

    expect(res.status).toBe(200)
    expect(written()[0]).toMatchObject({
      action: 'flag', actor: 'lily', actorSource: 'user',
      changes: [
        { field: 'userFlag', label: '使用者旗標', before: '否', after: '是' },
        { field: 'userFlagNote', label: '使用者旗標備註', changed: true },
      ],
    })
  })

  it('DELETE → 一列 delete，PDN 與標籤取刪除當下的資料', async () => {
    m.scheduleFindUnique.mockResolvedValue(scheduleRow({ vtmsPlanId: 'plan-1' }))

    const res = await request(app('admin')).delete('/api/schedules/s1')

    expect(res.status).toBe(200)
    expect(written()[0]).toMatchObject({
      action: 'delete', entityId: 's1', pdn: 'PDN-250048',
      entityLabel: 'PDN-250048 ECA-6710C / NPI / Lily_Lee',
      planId: 'plan-1', changes: [],
    })
    expect(JSON.stringify(written()[0])).not.toContain('EMC 預測試')
  })

  it('歷程寫入失敗時原請求仍成功', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.historyCreateMany.mockRejectedValue(new Error('db down'))

    const created = await request(app('admin')).post('/api/schedules').send(formBody)
    const updated = await request(app('admin')).put('/api/schedules/s1').send({ ...formBody, endDate: '2026/10/17' })

    expect(created.status).toBe(201)
    expect(updated.status).toBe(200)
    expect(err).toHaveBeenCalledWith('change_history_error', expect.anything())
    err.mockRestore()
  })
})
