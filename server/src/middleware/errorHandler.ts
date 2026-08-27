import type { Request, Response, NextFunction } from 'express'
import { randomBytes } from 'node:crypto'

// 回給呼叫端的固定訊息。任何 err.message 都不得出現在回應裡：全域處理器接到的
// 是「沒被任何路由接住」的例外，內容可能是 bcrypt 的參數錯誤、Prisma 的 SQL 片段
// 或含絕對路徑的 ENOENT，對未認證的呼叫端來說全是內部細節。
// 真正的訊息只進 console.error，靠 errorId 對回來。
export const GENERIC_ERROR_MESSAGE = '伺服器發生未預期的錯誤，請聯絡管理員並提供錯誤代碼 (errorId)。'

// 4xx 是呼叫端自己的問題，狀態碼本身不算內部細節，照原樣回比一律 500 更有用
// （壞掉的 JSON body 回 400、找不到的靜態檔回 404）；訊息一樣是固定字串。
const CLIENT_ERRORS: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'Malformed request' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  403: { code: 'FORBIDDEN', message: 'Not allowed' },
  404: { code: 'NOT_FOUND', message: 'Resource not found' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload too large' },
}
const CLIENT_ERROR_FALLBACK = { code: 'CLIENT_ERROR', message: 'Request could not be processed' }

// express.static／res.sendFile 用 statusCode，http-errors（express.json 等）用 status，
// 兩個都要認。非 4xx 一律當成伺服器錯誤處理。
function clientStatusOf(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  const raw = (err as { status?: unknown; statusCode?: unknown })
  for (const value of [raw.status, raw.statusCode]) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 499) {
      return value
    }
  }
  return null
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  // 回應已經開始送出時不能再寫 body/標頭，交回 express 預設處理器中斷連線。
  if (res.headersSent) {
    next(err)
    return
  }

  // 短、可唸出口、可直接 grep 的關聯碼：使用者回報時貼這串就能找到那一筆日誌。
  const errorId = randomBytes(6).toString('hex')
  const where = `${req.method} ${req.originalUrl}`
  const clientStatus = clientStatusOf(err)

  if (clientStatus !== null) {
    console.warn(`[server] ${errorId} ${where} rejected (${clientStatus}):`, err)
    const { code, message } = CLIENT_ERRORS[clientStatus] ?? CLIENT_ERROR_FALLBACK
    res.status(clientStatus).json({ ok: false, code, message, errorId })
    return
  }

  // 第二個參數保持原始例外物件，console.error 才會印出完整堆疊。
  console.error(`[server] ${errorId} ${where} failed:`, err)
  res.status(500).json({ ok: false, code: 'INTERNAL_SERVER_ERROR', message: GENERIC_ERROR_MESSAGE, errorId })
}
