// server/src/__tests__/usersRoleChange.test.ts
// PUT /api/users/:id 接受 role（admin ↔ user）。規則：不能改 super_admin、不能改自己、
// user → admin 清空 linkedEngineer 並套用 allowedUnits、admin → user 清空 allowedUnits
// 並把 linkedEngineer 設成 username；稽核的 changedFields 要含 role。
// prisma 與稽核全部 stub，測試絕不碰真 DB。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'

interface UserRow {
  id: string; username: string; displayName: string; passwordHash: string; role: 'super_admin' | 'admin' | 'user'
  isActive: boolean; allowedUnits: string[]; linkedEngineer: string
  canLinkVtms: boolean; canViewVtmsProgress: boolean; createdAt: Date; lastLoginAt: Date | null
}
interface State { users: UserRow[]; lastUpdate: Record<string, unknown> | null; audits: { action: string; changedFields: string[] }[] }

function makePrisma(users: UserRow[]) {
  const state: State = { users, lastUpdate: null, audits: [] }
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; username?: string } }) =>
        state.users.find(u => (where.id ? u.id === where.id : u.username === where.username)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        state.lastUpdate = data
        const u = state.users.find(x => x.id === where.id)!
        Object.assign(u, data)
        return u
      },
    },
  }
  return { prisma, state }
}

let current: ReturnType<typeof makePrisma>
vi.mock('../lib/db.js', () => ({ get prisma() { return current.prisma } }))
vi.mock('../lib/storage.js', () => ({
  appendAudit: async (_u: string, _d: string, action: string, _t: string, changedFields: string[]) => {
    current.state.audits.push({ action, changedFields })
  },
}))
vi.mock('../lib/crypto.js', () => ({ hashPassword: async (p: string) => `hash:${p}` }))

async function buildApp(sessionUsername = 'root') {
  const { default: usersRouter } = await import('../routes/users.js')
  const app = express()
  app.use(express.json())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = { sessionId: 's1', username: sessionUsername, role: 'super_admin' } as unknown as Request['session']
    next()
  })
  app.use('/api/users', usersRouter)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : 'error' })
  })
  return app
}

const row = (over: Partial<UserRow>): UserRow => ({
  id: 'id-' + over.username, username: 'x', displayName: 'x', passwordHash: 'h', role: 'user', isActive: true,
  allowedUnits: [], linkedEngineer: over.username ?? 'x', canLinkVtms: false, canViewVtmsProgress: false,
  createdAt: new Date('2026-01-01'), lastLoginAt: null, ...over,
})

beforeEach(() => { vi.resetModules() })

describe('PUT /api/users/:id — role', () => {
  it('user → admin：清空 linkedEngineer、套用 allowedUnits，稽核含 role', async () => {
    current = makePrisma([row({ username: 'root', role: 'super_admin' }), row({ username: 'Polson_Cheng', role: 'user' })])
    const res = await request(await buildApp()).put('/api/users/id-Polson_Cheng').send({ role: 'admin', allowedUnits: ['SIT-HW'] })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ role: 'admin', linkedEngineer: '', allowedUnits: ['SIT-HW'] })
    expect(current.state.audits[0].changedFields).toContain('role')
  })

  it('user → admin 沒帶 allowedUnits：預設全部（空陣列）', async () => {
    current = makePrisma([row({ username: 'root', role: 'super_admin' }), row({ username: 'Polson_Cheng', role: 'user' })])
    const res = await request(await buildApp()).put('/api/users/id-Polson_Cheng').send({ role: 'admin' })
    expect(res.status).toBe(200)
    expect(res.body.allowedUnits).toEqual([])
  })

  it('admin → user：清空 allowedUnits、linkedEngineer 設成 username', async () => {
    current = makePrisma([row({ username: 'root', role: 'super_admin' }), row({ username: 'Will_Wang', role: 'admin', allowedUnits: ['RA'], linkedEngineer: '' })])
    const res = await request(await buildApp()).put('/api/users/id-Will_Wang').send({ role: 'user' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ role: 'user', allowedUnits: [], linkedEngineer: 'Will_Wang' })
  })

  it('admin → user 同時帶 linkedEngineer：以 body 為準（不再因為舊角色是 admin 而 400）', async () => {
    current = makePrisma([row({ username: 'root', role: 'super_admin' }), row({ username: 'Will_Wang', role: 'admin', linkedEngineer: '' })])
    const res = await request(await buildApp()).put('/api/users/id-Will_Wang').send({ role: 'user', linkedEngineer: 'Will_Wang' })
    expect(res.status).toBe(200)
    expect(res.body.linkedEngineer).toBe('Will_Wang')
  })

  it('super_admin 的角色不可變更 → 403', async () => {
    current = makePrisma([row({ username: 'root', role: 'super_admin' }), row({ username: 'admin2', role: 'super_admin' })])
    const res = await request(await buildApp()).put('/api/users/id-admin2').send({ role: 'user' })
    expect(res.status).toBe(403)
    expect(current.state.lastUpdate).toBeNull()
  })

  it('不能變更自己的角色 → 403', async () => {
    current = makePrisma([row({ username: 'Will_Wang', role: 'admin' })])
    const res = await request(await buildApp('Will_Wang')).put('/api/users/id-Will_Wang').send({ role: 'user' })
    expect(res.status).toBe(403)
    expect(current.state.lastUpdate).toBeNull()
  })

  it('不合法的 role 值 → 400', async () => {
    current = makePrisma([row({ username: 'root', role: 'super_admin' }), row({ username: 'Polson_Cheng', role: 'user' })])
    const res = await request(await buildApp()).put('/api/users/id-Polson_Cheng').send({ role: 'super_admin' })
    expect(res.status).toBe(400)
  })

  it('role 與現值相同：不算變更、不進 changedFields', async () => {
    current = makePrisma([row({ username: 'root', role: 'super_admin' }), row({ username: 'Polson_Cheng', role: 'user' })])
    const res = await request(await buildApp()).put('/api/users/id-Polson_Cheng').send({ role: 'user', canLinkVtms: true })
    expect(res.status).toBe(200)
    expect(current.state.audits[0].changedFields).toEqual(['canLinkVtms'])
  })
})
