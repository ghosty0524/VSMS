import type { Request, Response, NextFunction } from 'express'
import { applyHeaderAuth } from './requireAuth.js'

// Non-GET paths a guest may still call (mounted under /api, so no prefix here).
const GUEST_ALLOWED_NON_GET = new Set(['/logout'])

// Deny-by-default write guard: any mutating request from a guest session is
// rejected here, so new write endpoints are guest-safe without per-route checks.
export function guestReadOnly(req: Request, res: Response, next: NextFunction): void {
  // Resolve X-Vsms-Session header tokens too — requireAuth runs later per-route,
  // so cookie-less guests would otherwise slip past this guard.
  applyHeaderAuth(req)
  if (
    req.session?.role === 'guest' &&
    req.method !== 'GET' &&
    !GUEST_ALLOWED_NON_GET.has(req.path)
  ) {
    res.status(403).json({ ok: false, message: 'Guest 帳號僅可讀取資料', code: 'GUEST_READ_ONLY' })
    return
  }
  next()
}
