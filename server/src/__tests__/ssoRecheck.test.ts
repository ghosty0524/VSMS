import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// vauthClient、auth.js 的 endLocalSession 都 mock，測 ssoRecheck 的分支邏輯。
const checkSsoSession = vi.fn()
vi.mock('../lib/vauthClient.js', () => ({ checkSsoSession: (...a: unknown[]) => checkSsoSession(...a) }))
const endLocalSession = vi.fn()
vi.mock('../routes/auth.js', () => ({ endLocalSession: (...a: unknown[]) => endLocalSession(...a) }))

const { ssoRecheck, SSO_RECHECK_MS } = await import('../middleware/ssoRecheck.js')
const { guestReadOnly } = await import('../middleware/guestReadOnly.js')

type FakeSession = Record<string, unknown> & {
  destroy: (cb: (err?: unknown) => void) => void
  regenerate: (cb: (err?: unknown) => void) => void
}

// 模擬 express-session 的真實語意：destroy() 之後 req.session 會變成 undefined，
// regenerate() 則換成一個全新的空 session。假 session 若只是 cb() 了事，
// 「destroy 之後還有中介層去讀 req.session.sessionId」這種 500 就測不出來
// （2026-09-21 撤銷 SSO 測試時 GET /api/config 實際發生過）。
function app(sessionInit: Record<string, unknown>, headers: Record<string, string> = {}) {
  const a = express()
  a.use((req, _res, next) => {
    const holder = req as unknown as { session: FakeSession | undefined }
    const make = (init: Record<string, unknown>): FakeSession => ({
      ...init,
      destroy: (cb) => { holder.session = undefined; cb() },
      regenerate: (cb) => { holder.session = make({}); cb() },
    })
    holder.session = make(sessionInit)
    for (const [k, v] of Object.entries(headers)) req.headers[k.toLowerCase()] = v
    next()
  })
  a.use(ssoRecheck)
  // 與 index.ts 的掛載順序一致：ssoRecheck 之後緊接 guestReadOnly，後者會讀 req.session。
  a.use(guestReadOnly)
  a.get('/api/config', (req, res) => {
    const session = (req as unknown as { session: FakeSession | undefined }).session
    res.json({ authProvider: 'vauth', sessionId: session?.sessionId ?? null })
  })
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
    // 放行時必須以「匿名」身分繼續：req.session 還在、但沒有 sessionId。
    expect(res.body.sessionId).toBeNull()
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
