// server/src/routes/internal.ts
// 機器對機器的內部端點（vauth 推送組織快照）。掛在 ssoAdopt/guestReadOnly 之前，requireApiKey 逐路由掛。
import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireApiKey } from '../middleware/requireApiKey.js'
import { validateSnapshot, type OrgSnapshot } from '../lib/orgSync/types.js'
import { syncVsmsOrg } from '../lib/orgSync/apply.js'

const router = Router()

// 組織同步只在單一登入模式下有意義；本地模式（AUTH_PROVIDER=local）連端點都不該
// 存在——單位與名冊由設定頁自行管理，這條路徑若還通著就是一個只靠 API key 擋著、
// 能整批改寫名冊與權限的多餘表面。回 404 而不是 403，不透露端點存在與否。
function requireVauthMode(_req: Request, res: Response, next: NextFunction) {
  if (process.env.AUTH_PROVIDER !== 'vauth') {
    res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'API endpoint not found' })
    return
  }
  next()
}

router.post('/org-sync', requireVauthMode, requireApiKey, async (req, res) => {
  const problem = validateSnapshot(req.body)
  if (problem) { res.status(400).json({ error: problem }); return }
  const dryRun = String(req.query.dryRun ?? '') === '1'
  try {
    res.json(await syncVsmsOrg(req.body as OrgSnapshot, { dryRun }))
  } catch (err) {
    console.error('[orgSync] sync failed:', err)
    res.status(500).json({ error: 'org sync failed' })
  }
})

export default router
