// server/src/middleware/canonicalRedirect.ts
import type { NextFunction, Request, Response } from 'express'

/**
 * 正式網址是 https://172.16.204.69/vsms/（經反向代理，見 F:\vportal）。這個中介層只
 * 處理一種情況：有人直接打舊的 https://IP:3001/... 開頁面 —— 把他帶去正式網址，路徑
 * 與查詢照舊，書籤與舊連結因此不會壞。
 *
 * 三種情況一律放行，缺一不可：
 *   1. 沒設定 PUBLIC_BASE_URL（dev、測試、還沒上代理）。
 *   2. 請求是代理轉進來的（代理會帶 x-forwarded-prefix）—— 否則會無限轉向。
 *   3. 不是瀏覽器導覽：API 客戶端（MCP API、VTMS 的 vsmsClient、Copilot agent）
 *      不會要 text/html，它們繼續走原 port 完全不受影響。
 */
export function canonicalRedirect(publicBaseUrl: string | undefined) {
  const base = publicBaseUrl?.trim().replace(/\/+$/, '') ?? ''
  return function redirect(req: Request, res: Response, next: NextFunction) {
    if (!base) return next()
    if (req.method !== 'GET') return next()
    if (req.headers['x-forwarded-prefix']) return next()
    const accept = req.headers.accept ?? ''
    if (!accept.includes('text/html')) return next()
    res.redirect(302, base + req.originalUrl)
  }
}
