// server/src/routes/audit.ts
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { requireAuth, requireSuperAdmin } from '../middleware/requireAuth.js'

const router = Router()
router.use(requireAuth, requireSuperAdmin)

router.get('/', async (req, res) => {
  const { from, to, username, action } = req.query as Record<string, string | undefined>

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(from && { timestamp: { gte: new Date(from) } }),
      ...(to && { timestamp: { lte: new Date(to + 'T23:59:59') } }),
      ...(username && { username }),
      ...(action && { action }),
    },
    orderBy: { timestamp: 'desc' },
  })

  res.json(logs.map(l => ({
    id: l.id,
    timestamp: l.timestamp.toISOString(),
    username: l.username,
    displayName: l.displayName,
    action: l.action,
    target: l.target,
    fields: (l.fields as string[]) ?? [],
  })))
})

export default router
