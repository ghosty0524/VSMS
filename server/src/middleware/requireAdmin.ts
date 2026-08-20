import type { Request, Response, NextFunction } from 'express'
import { applyHeaderAuth } from './requireAuth.js'

/**
 * Admin 或 Super Admin。允許清單而非拒絕清單：新增角色時預設擋下，
 * 而不是預設放行。
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!applyHeaderAuth(req)) {
    res.status(401).json({ ok: false, message: 'Unauthorized' })
    return
  }
  if (req.session.role !== 'admin' && req.session.role !== 'super_admin') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  next()
}
