// server/src/__tests__/vtmsProjectCheckRoute.test.ts
// 掛一個只含 schedules 路由的最小 app。db 與 storage 全部 mock：正式環境的
// DATABASE_URL 指到唯一一份 vsms 資料庫，測試絕不能碰真的 prisma。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

const { listProjectsSpy } = vi.hoisted(() => ({ listProjectsSpy: vi.fn() }))

vi.mock('../lib/db.js', () => ({ prisma: {} }))
vi.mock('../lib/storage.js', () => ({ appendAudit: vi.fn() }))
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  applyHeaderAuth: () => true,
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}))
vi.mock('../lib/vtmsClient.js', () => ({
  listProjects: listProjectsSpy,
  listTestPlans: vi.fn(),
  getTestPlanProgress: vi.fn(),
  getTestPlanProgressBatch: vi.fn(),
}))

import schedulesRouter from '../routes/schedules.js'

function app(role: string) {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => {
    (req as unknown as { session: object }).session = { role, username: 'tester' }
    next()
  })
  a.use('/api/schedules', schedulesRouter)
  return a
}

beforeEach(() => { vi.clearAllMocks() })

describe('GET /api/schedules/vtms-project-check', () => {
  it('user 角色 403', async () => {
    const res = await request(app('user')).get('/api/schedules/vtms-project-check?pdn=PDN-1')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('ROLE_NOT_ALLOWED')
    expect(listProjectsSpy).not.toHaveBeenCalled()
  })

  it('guest 角色 403', async () => {
    const res = await request(app('guest')).get('/api/schedules/vtms-project-check?pdn=PDN-1')
    expect(res.status).toBe(403)
  })

  it('空 pdn 400', async () => {
    const res = await request(app('admin')).get('/api/schedules/vtms-project-check?pdn=%20%20')
    expect(res.status).toBe(400)
    expect(listProjectsSpy).not.toHaveBeenCalled()
  })

  it('admin 找到專案回 found', async () => {
    listProjectsSpy.mockResolvedValue([{ id: 'p1', name: 'PDN-1', productName: 'A', planCount: 3 }])
    const res = await request(app('admin')).get('/api/schedules/vtms-project-check?pdn=pdn-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'found', name: 'PDN-1', planCount: 3 })
  })

  it('super_admin 找不到回 not_found 與相近名稱', async () => {
    listProjectsSpy.mockResolvedValue([{ id: 'p1', name: 'PDN-1234', productName: 'A', planCount: 0 }])
    const res = await request(app('super_admin')).get('/api/schedules/vtms-project-check?pdn=PDN-123')
    expect(res.body).toEqual({ status: 'not_found', similar: ['PDN-1234'] })
  })

  it('VTMS 打不到時回 200 unavailable，不是 502', async () => {
    listProjectsSpy.mockRejectedValue(new Error('VTMS request timed out'))
    const res = await request(app('admin')).get('/api/schedules/vtms-project-check?pdn=PDN-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'unavailable' })
  })
})
