// server/src/__tests__/usersOrgManaged.test.ts
// 單一登入模式（vauth）下，角色／管轄單位／對應人員／啟用狀態由入口頁的組織設定管理，
// VSMS 後端擋下這些欄位的本地修改（409 ORG_MANAGED）；canLinkVtms 等 VTMS 連結權限仍可改。
// local 模式不受影響。prisma 全部 stub，測試絕不碰真 DB。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
// update 的 mock 要回傳完整一列（不只是這次的 data diff），否則 routes/users.ts 的
// safeUser() 會在 u.createdAt.toISOString() 炸掉（與這個 guard 本身無關的既有陷阱）。
vi.mock('../lib/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({ id: 'u1', username: 'Rock_Cai', role: 'user' })),
      update: vi.fn(async (a: { data: object }) => ({
        id: 'u1', username: 'Rock_Cai', role: 'user', isActive: true, allowedUnits: [], linkedEngineer: '',
        canLinkVtms: false, canViewVtmsProgress: false, createdAt: new Date(), lastLoginAt: null,
        ...a.data,
      })),
    },
  },
}))
vi.mock('../lib/storage.js', () => ({ appendAudit: vi.fn() }))
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (_r: unknown, _s: unknown, n: () => void) => n(), applyHeaderAuth: () => true, requireSuperAdmin: (_r: unknown, _s: unknown, n: () => void) => n(),
}))
import usersRouter from '../routes/users.js'
function app() { const a = express(); a.use(express.json()); a.use((req, _res, next) => { (req as unknown as { session: object }).session = { role: 'super_admin', username: 'admin' }; next() }); a.use('/api/users', usersRouter); return a }
beforeEach(() => { process.env.AUTH_PROVIDER = 'vauth' })

describe('PUT /api/users/:id under vauth', () => {
  it('role / allowedUnits / linkedEngineer / isActive → 409 ORG_MANAGED', async () => {
    for (const body of [{ role: 'admin' }, { allowedUnits: ['RA'] }, { linkedEngineer: 'x' }, { isActive: false }]) {
      const res = await request(app()).put('/api/users/u1').send(body)
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ORG_MANAGED')
    }
  })
  it('canLinkVtms 仍可改', async () => {
    const res = await request(app()).put('/api/users/u1').send({ canLinkVtms: true })
    expect(res.status).toBe(200)
  })
  it('local 模式不受影響', async () => {
    process.env.AUTH_PROVIDER = 'local'
    const res = await request(app()).put('/api/users/u1').send({ canLinkVtms: true })
    expect(res.status).toBe(200)
  })
})
