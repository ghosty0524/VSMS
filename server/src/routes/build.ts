// server/src/routes/build.ts
import { Router } from 'express'
import { getBuildVersion } from '../lib/buildVersion.js'

/**
 * 前端版本探測路由。刻意做成「傳入 distPath、回傳 Router」而不是像其他
 * routes/*.ts 直接 export default router：index.ts 需要在解析出 distPath
 * 之後、且必須在 app.use(session(...)) 之前掛上這條路由（見 index.ts 內的
 * 說明），用函式包一層才能把 distPath 帶進來，同時維持這條路由不吃到任何
 * session middleware。
 */
export function buildVersionRouter(distPath: string) {
  const router = Router()
  router.get('/api/build', (_req, res) => {
    res.json({ build: getBuildVersion(distPath) })
  })
  return router
}
