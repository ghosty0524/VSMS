// server/src/routes/health.ts
import { Router } from 'express'

/**
 * 統一健康檢查（整合計畫第 10 章）：入口頁的健康看板每 60 秒輪詢，所有服務都回
 * 同一個形狀。做成工廠函式的理由同 build.ts：index.ts 要把它掛在 session 之前，
 * 否則看板的輪詢會不斷延長 rolling session，讓閒置逾時形同虛設。
 * DB 查不到就是 down（服務等於不能用），HTTP 503 讓 pm2 / 看板不用解析 body 也能判斷。
 */
export type HealthDeps = {
  service: string
  version: string
  /** dist/index.html 的 mtime（ISO），沒有 dist 時為 null。 */
  deployedAt: () => string | null
  /** 丟錯或逾時都視為 DB down。 */
  checkDb: () => Promise<void>
  timeoutMs?: number
}

function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('health check timed out')), ms)
    p.then(() => { clearTimeout(t); resolve() }, err => { clearTimeout(t); reject(err) })
  })
}

export function healthRouter(deps: HealthDeps) {
  const router = Router()
  router.get('/api/health', async (_req, res) => {
    let db: 'ok' | 'down' = 'ok'
    try { await withTimeout(deps.checkDb(), deps.timeoutMs ?? 2000) } catch { db = 'down' }
    const status = db === 'ok' ? 'ok' : 'down'
    res.status(status === 'ok' ? 200 : 503).json({
      status,
      service: deps.service,
      version: deps.version,
      deployedAt: deps.deployedAt(),
      time: new Date().toISOString(),
      checks: { db },
    })
  })
  return router
}
