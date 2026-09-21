import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// vauthClient、auth.js 的 endLocalSession 都 mock，測 ssoRecheck 的分支邏輯。
const checkSsoSession = vi.fn()
vi.mock('../lib/vauthClient.js', () => ({ checkSsoSession: (...a: unknown[]) => checkSsoSession(...a) }))
const endLocalSession = vi.fn()
vi.mock('../routes/auth.js', () => ({ endLocalSession: (...a: unknown[]) => endLocalSession(...a) }))

const { ssoRecheck, SSO_RECHECK_MS } = await import('../middleware/ssoRecheck.js')

type FakeSession = Record<string, unknown> & { destroy: (cb: (err?: unknown) => void) => void }

function app(sessionInit: Record<string, unknown>, headers: Record<string, string> = {}) {
  const a = express()
  a.use((req, _res, next) => {
    const session: FakeSession = { ...sessionInit, destroy: (cb) => cb() }
    ;(req as unknown as { session: FakeSession }).session = session
    for (const [k, v] of Object.entries(headers)) req.headers[k.toLowerCase()] = v
    next()
  })
  a.use(ssoRecheck)
  a.get('/api/config', (_req, res) => { res.json({ authProvider: 'vauth' }) })
  a.get('/probe', (req, res) => {
    const session = (req as unknown as { session: FakeSession }).session
    res.json({ sessionId: session.sessionId ?? null, ssoCheckedAt: session.ssoCheckedAt ?? null })
  })
  return a
}

beforeEach(() => {
  process.env.AUTH_PROVIDER = 'vauth'
  checkSsoSession.mockReset()
  endLocalSession.mockReset()
})

describe('VSMS ssoRecheck', () => {
  it('AUTH_PROVIDER=local 略過', async () => {
    process.env.AUTH_PROVIDER = 'local'
    await request(app({ sessionId: 's1', role: 'user' }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(checkSsoSession).not.toHaveBeenCalled()
  })

  it('guest 略過', async () => {
    await request(app({ sessionId: 's1', role: 'guest' }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(checkSsoSession).not.toHaveBeenCalled()
  })

  it('無本地 session 略過', async () => {
    await request(app({ role: 'user' }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(checkSsoSession).not.toHaveBeenCalled()
  })

  it('無 vportal_sso cookie 略過', async () => {
    await request(app({ sessionId: 's1', role: 'user' }, { cookie: 'foo=1' })).get('/probe')
    expect(checkSsoSession).not.toHaveBeenCalled()
  })

  it('vauth 回 valid → next 放行，ssoCheckedAt 更新', async () => {
    checkSsoSession.mockResolvedValue('valid')
    const before = Date.now()
    const res = await request(app({ sessionId: 's1', role: 'user' }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(res.status).toBe(200)
    expect(res.body.sessionId).toBe('s1')
    expect(res.body.ssoCheckedAt).toBeGreaterThanOrEqual(before)
    expect(endLocalSession).not.toHaveBeenCalled()
  })

  it('vauth 回 revoked → 401 SSO_REVOKED，本地 session 被結束', async () => {
    checkSsoSession.mockResolvedValue('revoked')
    const res = await request(app({ sessionId: 's1', role: 'user' }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ ok: false, code: 'SSO_REVOKED' })
    expect(endLocalSession).toHaveBeenCalledTimes(1)
  })

  it('revoked 但打的是公開探測端點 /api/config → 結束 session 後放行（前端才讀得到 authProvider 並導回入口頁）', async () => {
    checkSsoSession.mockResolvedValue('revoked')
    const res = await request(app({ sessionId: 's1', role: 'user' }, { cookie: 'vportal_sso=abc' })).get('/api/config')
    expect(res.status).toBe(200)
    expect(res.body.authProvider).toBe('vauth')
    expect(endLocalSession).toHaveBeenCalledTimes(1)
  })

  it('vauth 回 unavailable（連不上）→ next 放行，ssoCheckedAt 不更新', async () => {
    checkSsoSession.mockResolvedValue('unavailable')
    const res = await request(app({ sessionId: 's1', role: 'user', ssoCheckedAt: 123 }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(res.status).toBe(200)
    expect(res.body.ssoCheckedAt).toBe(123)
    expect(endLocalSession).not.toHaveBeenCalled()
  })

  it('節流：距離上次確認未滿 SSO_RECHECK_MS → 不呼叫 vauth', async () => {
    const recentlyChecked = Date.now() - 10_000
    expect(recentlyChecked).toBeGreaterThan(Date.now() - SSO_RECHECK_MS)
    await request(app({ sessionId: 's1', role: 'user', ssoCheckedAt: recentlyChecked }, { cookie: 'vportal_sso=abc' })).get('/probe')
    expect(checkSsoSession).not.toHaveBeenCalled()
  })
})
