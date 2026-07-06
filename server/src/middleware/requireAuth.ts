import type { Request, Response, NextFunction } from 'express'
import { tokenStore } from '../lib/sessionTokens.js'

function applyHeaderAuth(req: Request): boolean {
  if (req.session.sessionId) return true
  const token = req.headers['x-vsms-session'] as string | undefined
  if (!token) return false
  const entry = tokenStore.get(token)
  if (!entry) return false
  req.session.sessionId = token
  req.session.username = entry.username
  req.session.role = entry.role as 'super_admin' | 'admin' | 'user'
  return true
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (applyHeaderAuth(req)) { next(); return }
  res.status(401).json({ ok: false, message: 'Unauthorized' })
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!applyHeaderAuth(req)) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }
  if (req.session.role !== 'super_admin') {
    res.status(403).json({ ok: false, message: 'Forbidden: Super Admin only' })
    return
  }
  next()
}