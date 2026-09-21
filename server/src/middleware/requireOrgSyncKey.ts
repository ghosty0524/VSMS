import { timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

// 組織同步端點專用的金鑰（ORG_SYNC_API_KEY）。刻意與 INTEGRATION_API_KEY 分開：
// 那把 key 也發給 MCP／Copilot 連接器，只該有唯讀查詢與少數排程欄位的權限，
// 不該附帶「整批改寫名冊與帳號角色」的能力。只收 X-Api-Key，不接受 Basic。
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function requireOrgSyncKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key']
  const expected = process.env.ORG_SYNC_API_KEY
  if (!expected || typeof key !== 'string' || !safeEqual(key, expected)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}
