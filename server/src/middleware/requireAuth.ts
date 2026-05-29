import type { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.sessionId) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }
  next()
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.sessionId) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }
  if (req.session.role !== 'super_admin') {
    res.status(403).json({ ok: false, message: 'Forbidden: Super Admin only' })
    return
  }
  next()
}