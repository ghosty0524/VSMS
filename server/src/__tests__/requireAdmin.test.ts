import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'

function makeReq(role?: string, sessionId?: string): Request {
  return { session: { sessionId, role }, headers: {} } as unknown as Request
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.body = payload; return this },
  }
  return res as unknown as Response & { statusCode: number; body: unknown }
}

function ctx(role?: string, sessionId?: string) {
  return { req: makeReq(role, sessionId), res: makeRes(), next: vi.fn() as unknown as NextFunction }
}

describe('requireAdmin', () => {
  it('rejects an unauthenticated request with 401', () => {
    const { req, res, next } = ctx()
    requireAdmin(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects the user role with 403 and a machine-readable code', () => {
    const { req, res, next } = ctx('user', 'sid')
    requireAdmin(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ ok: false, code: 'ROLE_NOT_ALLOWED' })
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects the guest role with 403', () => {
    const { req, res, next } = ctx('guest', 'sid')
    requireAdmin(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('lets admin through', () => {
    const { req, res, next } = ctx('admin', 'sid')
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('lets super_admin through', () => {
    const { req, res, next } = ctx('super_admin', 'sid')
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
