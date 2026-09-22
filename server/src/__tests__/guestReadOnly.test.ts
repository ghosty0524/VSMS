import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { guestReadOnly } from '../middleware/guestReadOnly.js'
import { tokenStore } from '../lib/sessionTokens.js'

function makeReq(over: {
  method?: string
  path?: string
  role?: string
  headers?: Record<string, string>
}): Request {
  return {
    method: over.method ?? 'GET',
    path: over.path ?? '/schedules',
    headers: over.headers ?? {},
    session: over.role ? { sessionId: 'sid-1', username: 'x', role: over.role } : {},
  } as unknown as Request
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.body = payload; return this },
  }
  return res as unknown as Response & { statusCode: number; body: { code?: string } }
}

describe('guestReadOnly middleware', () => {
  it('放行 guest 的 GET 請求', () => {
    const next = vi.fn() as NextFunction
    const res = makeRes()
    guestReadOnly(makeReq({ method: 'GET', role: 'guest' }), res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })

  it('擋下 guest 的 POST 請求（403 GUEST_READ_ONLY）', () => {
    const next = vi.fn() as NextFunction
    const res = makeRes()
    guestReadOnly(makeReq({ method: 'POST', path: '/schedules', role: 'guest' }), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('GUEST_READ_ONLY')
  })

  it('擋下 guest 的 PUT 與 DELETE', () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const next = vi.fn() as NextFunction
      const res = makeRes()
      guestReadOnly(makeReq({ method, path: '/schedules/abc', role: 'guest' }), res, next)
      expect(next).not.toHaveBeenCalled()
      expect(res.statusCode).toBe(403)
    }
  })

  it('放行 guest 的 POST /logout', () => {
    const next = vi.fn() as NextFunction
    const res = makeRes()
    guestReadOnly(makeReq({ method: 'POST', path: '/logout', role: 'guest' }), res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('不影響 admin / super_admin / user 的寫入請求', () => {
    for (const role of ['admin', 'super_admin', 'user']) {
      const next = vi.fn() as NextFunction
      const res = makeRes()
      guestReadOnly(makeReq({ method: 'POST', path: '/schedules', role }), res, next)
      expect(next).toHaveBeenCalledOnce()
      expect(res.statusCode).toBe(0)
    }
  })

  it('無 session 的請求直接放行（交由 requireAuth 回 401）', () => {
    const next = vi.fn() as NextFunction
    const res = makeRes()
    guestReadOnly(makeReq({ method: 'POST', path: '/schedules' }), res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('req.session 被上游 destroy 掉（undefined）時不丟 TypeError，直接放行', () => {
    const next = vi.fn() as NextFunction
    const res = makeRes()
    const req = { method: 'GET', path: '/config', headers: {}, session: undefined } as unknown as Request
    expect(() => guestReadOnly(req, res, next)).not.toThrow()
    expect(next).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(0)
  })

  it('可解析 X-Vsms-Session header token 的 guest 並擋下寫入', () => {
    tokenStore.set('guest-token-1', { username: 'Guest', role: 'guest' })
    const next = vi.fn() as NextFunction
    const res = makeRes()
    const req = makeReq({
      method: 'POST',
      path: '/schedules',
      headers: { 'x-vsms-session': 'guest-token-1' },
    })
    guestReadOnly(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    tokenStore.delete('guest-token-1')
  })
})
