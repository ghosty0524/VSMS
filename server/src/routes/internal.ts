// server/src/routes/internal.ts
// 機器對機器的內部端點（vauth 推送組織快照）。掛在 session/ssoAdopt 之前，requireApiKey 逐路由掛。
import { Router } from 'express'
import { requireApiKey } from '../middleware/requireApiKey.js'
import { validateSnapshot, type OrgSnapshot } from '../lib/orgSync/types.js'
import { syncVsmsOrg } from '../lib/orgSync/apply.js'

const router = Router()

router.post('/org-sync', requireApiKey, async (req, res) => {
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
