import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// vauthClient、prisma、establishSession 都 mock，測 ssoAdopt 的分支邏輯。
const getSsoUser = vi.fn()
vi.mock('../lib/vauthClient.js', () => ({ getSsoUser: (...a: unknown[]) => getSsoUser(...a) }))
const findUnique = vi.fn()
const create = vi.fn()
vi.mock('../lib/db.js', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a), create: (...a: unknown[]) => create(...a) } } }))
const establishSession = vi.fn()
vi.mock('../routes/auth.js', () => ({ establishSession: (...a: unknown[]) => establishSession(...a) }))

const { ssoAdopt } = await import('../middleware/ssoAdopt.js')

function app(sessionInit: Record<string, unknown>, headers: Record<string, string> = {}) {
  const a = express()
  a.use((req, _res, next) => {
    ;(req as unknown as { session: Record<string, unknown> }).session = { ...sessionInit }
    for (const [k, v] of Object.entries(headers)) req.headers[k.toLowerCase()] = v
    next()
  })
  a.use(ssoAdopt)
  a.get('/probe', (req, res) => res.json({ sessionId: (req as unknown as { session: { sessionId?: string } }).session.sessionId ?? null, established: establishSession.mock.calls.length }))
  return a
}

beforeEach(() => {
  process.env.AUTH_PROVIDER = 'vauth'
  getSsoUser.mockReset(); findUnique.mockReset(); create.mockReset(); establishSession.mockReset()
  establishSession.mockImplementation((req: { session: Record<string, unknown> }) => { req.session.sessionId = 'new-sid'; return Promise.resolve('new-sid') })
})

describe('VSMS ssoAdopt', () => {
  it('AUTH_PROVIDER=local 略過', async () => {
    process.env.AUTH_PROVIDER = 'local'
    await request(app({}, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(getSsoUser).not.toHaveBeenCalled()
  })

  it('已有 session 略過', async () => {
    await request(app({ sessionId: 'x' }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(getSsoUser).not.toHaveBeenCalled()
  })

  it('帶 x-vsms-session header 略過（交給 header 認證）', async () => {
    await request(app({}, { cookie: 'vportal_sso=abc', 'x-vsms-session': 'tok' })).get('/probe')
    expect(getSsoUser).not.toHaveBeenCalled()
  })

  it('無 vportal_sso cookie 略過', async () => {
    await request(app({}, { cookie: 'foo=1' })).get('/probe')
    expect(getSsoUser).not.toHaveBeenCalled()
  })

  it('vauth 認得且本地有該人 → establishSession', async () => {
    getSsoUser.mockResolvedValue({ id: 'u1', username: 'alice', displayName: 'Alice' })
    findUnique.mockResolvedValue({ id: 'u1', username: 'alice', displayName: 'Alice', role: 'user', isActive: true })
    const res = await request(app({}, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(create).not.toHaveBeenCalled()
    expect(res.body.established).toBe(1)
    expect(res.body.sessionId).toBe('new-sid')
  })

  it('vauth 認得但本地沒有 → 建 user 列後 establishSession', async () => {
    getSsoUser.mockResolvedValue({ id: 'u9', username: 'nina', displayName: 'Nina' })
    findUnique.mockResolvedValue(null)
    create.mockResolvedValue({ id: 'u9', username: 'nina', displayName: 'Nina', role: 'user', isActive: true })
    const res = await request(app({}, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0].data).toMatchObject({ id: 'u9', role: 'user', passwordHash: '!' })
    expect(res.body.established).toBe(1)
  })

  it('vauth 認不得 → 不建 session', async () => {
    getSsoUser.mockResolvedValue(null)
    const res = await request(app({}, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(res.body.sessionId).toBeNull()
    expect(establishSession).not.toHaveBeenCalled()
  })

  it('本地帳號停用 → 不建 session', async () => {
    getSsoUser.mockResolvedValue({ id: 'u2', username: 'bob', displayName: 'Bob' })
    findUnique.mockResolvedValue({ id: 'u2', username: 'bob', role: 'user', isActive: false })
    const res = await request(app({}, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(res.body.sessionId).toBeNull()
    expect(establishSession).not.toHaveBeenCalled()
  })
})
