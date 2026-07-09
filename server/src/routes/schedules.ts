// server/src/routes/schedules.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validateSchedule, collectScheduleErrors } from '../middleware/validateSchedule.js'
import type { Schedule } from '../types.js'
import { listTestPlans, getTestPlanProgress } from '../lib/vtmsClient.js'

const router = Router()
router.use(requireAuth)

// Writable schedule fields. Everything else (id, createdBy, createdAt, ...)
// is server-managed; vtmsPlanId is deliberately excluded — it may only change
// through the /:id/vtms-link endpoint which checks the canLinkVtms permission.
const SCHEDULE_WRITABLE_FIELDS = [
  'category', 'projectName', 'taskDescription', 'testUnit', 'testEngineer',
  'timeResource', 'startDate', 'endDate', 'requiredPersonnel', 'testReport',
  'isCompleted', 'isDelayed', 'delayReason',
  'adminFlag', 'adminFlagNote', 'userFlag', 'userFlagNote', 'device',
] as const

function pickScheduleFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const field of SCHEDULE_WRITABLE_FIELDS) {
    if (field in body) picked[field] = body[field]
  }
  return picked
}

// Helper: map Prisma Schedule → app Schedule type (Date → ISO string)
function toSchedule(s: {
  id: string; category: string; projectName: string; taskDescription: string;
  testUnit: string; testEngineer: string; timeResource: number;
  startDate: string; endDate: string; requiredPersonnel: string;
  testReport: string; isCompleted: boolean; isDelayed: boolean;
  delayReason: string; createdBy: string; updatedBy: string;
  createdAt: Date; updatedAt: Date;
  adminFlag: boolean; adminFlagNote: string | null;
  userFlag: boolean; userFlagNote: string | null;
  device: string;
  vtmsPlanId: string | null;
}): Schedule {
  return {
    ...s,
    adminFlagNote: s.adminFlagNote ?? '',
    userFlagNote:  s.userFlagNote  ?? '',
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

async function getAllowedUnits(username: string): Promise<string[] | null> {
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return []
  if (user.role === 'super_admin') return null
  return (user.allowedUnits as string[]) ?? []
}

function canAccessUnit(allowedUnits: string[] | null, testUnit: string): boolean {
  if (allowedUnits === null) return true
  if (allowedUnits.length === 0) return true
  return allowedUnits.includes(testUnit)
}

// GET /api/schedules
router.get('/', async (req, res) => {
  const schedules = await prisma.schedule.findMany({ orderBy: { createdAt: 'asc' } })
  const mapped = schedules.map(toSchedule)
  // User / Guest 角色不可見 adminFlag / adminFlagNote
  if (req.session.role === 'user' || req.session.role === 'guest') {
    res.json(mapped.map(s => {
      const { adminFlag: _af, adminFlagNote: _afn, ...rest } = s
      return rest
    }))
    return
  }
  res.json(mapped)
})

// POST /api/schedules
router.post('/', validateSchedule, async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: 'User 角色無新增排程權限', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const username = req.session.username ?? 'unknown'
  const allowedUnits = await getAllowedUnits(username)
  const body = pickScheduleFields(req.body as Record<string, unknown>) as Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>

  if (!canAccessUnit(allowedUnits, body.testUnit)) {
    res.status(403).json({
      ok: false, message: `您無權限新增 ${body.testUnit} 的排程`, code: 'UNIT_NOT_ALLOWED',
    })
    return
  }

  const dbUser = await prisma.user.findUnique({ where: { username } })
  const displayName = dbUser?.displayName ?? username

  const schedule = await prisma.schedule.create({
    data: { id: uuidv4(), ...body, createdBy: username, updatedBy: username },
  })

  await appendAudit(username, displayName, 'CREATE_SCHEDULE', schedule.id, [])
  res.status(201).json(toSchedule(schedule))
})

// GET /api/schedules/vtms-plans — proxy to VTMS test plan list (for dropdown in schedule form)
router.get('/vtms-plans', async (req, res) => {
  // 表單專用資料，Guest 無填表需求，也不應間接讀到 VTMS 計畫清單
  if (req.session.role === 'guest') {
    res.status(403).json({ ok: false, message: 'Guest 帳號無此權限', code: 'GUEST_READ_ONLY' })
    return
  }
  try {
    const plans = await listTestPlans();
    res.json(plans);
  } catch {
    res.status(502).json({ error: 'VTMS unavailable' });
  }
});

// GET /api/schedules/:id/vtms-progress — proxy VTMS progress for this schedule's linked plan
router.get('/:id/vtms-progress', async (req, res) => {
  // canViewVtmsProgress exists as a user permission — enforce it server-side
  // (super_admin implicitly allowed)
  if (req.session.role !== 'super_admin') {
    const viewer = await prisma.user.findUnique({ where: { username: req.session.username ?? '' } });
    if (!viewer?.canViewVtmsProgress) {
      res.status(403).json({ ok: false, message: '無檢視 VTMS 進度權限', code: 'NO_VTMS_PROGRESS_PERMISSION' });
      return;
    }
  }
  const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) { res.status(404).json({ error: 'Not found' }); return; }
  if (!schedule.vtmsPlanId) { res.json(null); return; }
  try {
    const progress = await getTestPlanProgress(schedule.vtmsPlanId);
    res.json(progress);
  } catch {
    res.status(502).json({ error: 'VTMS unavailable' });
  }
});

// PATCH /api/schedules/:id/vtms-link — set or clear the VTMS plan link (canLinkVtms permission required)
router.patch('/:id/vtms-link', async (req, res) => {
  const username = req.session.username ?? 'unknown';
  const dbUser = await prisma.user.findUnique({ where: { username } });
  if (!dbUser?.canLinkVtms) {
    res.status(403).json({ error: 'Requires canLinkVtms permission' });
    return;
  }
  const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) { res.status(404).json({ error: 'Not found' }); return; }

  const vtmsPlanId = (req.body.vtmsPlanId as string | null | undefined) ?? null; // null to unlink
  const updated = await prisma.schedule.update({
    where: { id: req.params.id },
    data: { vtmsPlanId, updatedAt: new Date() },
  });
  res.json(toSchedule(updated));
});

// PUT /api/schedules/replace-all
router.put('/replace-all', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: 'User 角色無匯入權限', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const username = req.session.username ?? 'unknown'
  const allowedUnits = await getAllowedUnits(username)
  const dbUser = await prisma.user.findUnique({ where: { username } })
  const displayName = dbUser?.displayName ?? username

  if (!Array.isArray(req.body)) {
    res.status(400).json({ ok: false, message: '匯入格式錯誤：需為陣列' })
    return
  }
  const incoming = (req.body as Record<string, unknown>[])
    .map(pickScheduleFields) as Omit<Schedule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[]

  // Imported rows get the same validation as single creates
  const rowErrors: { index: number; errors: Record<string, string> }[] = []
  incoming.forEach((row, index) => {
    const errors = collectScheduleErrors(row as unknown as Record<string, unknown>, true)
    if (Object.keys(errors).length > 0) rowErrors.push({ index, errors })
  })
  if (rowErrors.length > 0) {
    res.status(422).json({
      ok: false,
      message: `匯入資料有 ${rowErrors.length} 筆驗證失敗`,
      rowErrors: rowErrors.slice(0, 20),
    })
    return
  }

  if (allowedUnits !== null && allowedUnits.length > 0) {
    const blockedUnits = [...new Set(
      incoming.filter(d => !canAccessUnit(allowedUnits, d.testUnit)).map(d => d.testUnit)
    )]
    if (blockedUnits.length > 0) {
      res.status(403).json({
        ok: false, message: `您無權限匯入以下單位的排程：${blockedUnits.join('、')}`,
        code: 'UNIT_NOT_ALLOWED', blockedUnits,
      })
      return
    }
  }

  const now = new Date()

  if (allowedUnits === null || allowedUnits.length === 0) {
    // super_admin: replace all
    await prisma.$transaction(async (tx) => {
      await tx.schedule.deleteMany()
      if (incoming.length > 0) {
        await tx.schedule.createMany({
          data: incoming.map(d => ({
            id: uuidv4(), ...d, createdBy: username, updatedBy: username,
            createdAt: now, updatedAt: now,
          })),
        })
      }
    })
  } else {
    // admin: only delete + replace schedules in their allowed units
    await prisma.$transaction(async (tx) => {
      await tx.schedule.deleteMany({ where: { testUnit: { in: allowedUnits } } })
      if (incoming.length > 0) {
        await tx.schedule.createMany({
          data: incoming.map(d => ({
            id: uuidv4(), ...d, createdBy: username, updatedBy: username,
            createdAt: now, updatedAt: now,
          })),
        })
      }
    })
  }

  const all = await prisma.schedule.findMany({ orderBy: { createdAt: 'asc' } })
  await appendAudit(username, displayName, 'IMPORT_SCHEDULES', `${incoming.length} schedules`, [])
  res.json(all.map(toSchedule))
})

// PUT /api/schedules/:id
router.put('/:id', validateSchedule, async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const scheduleId = req.params.id as string
  const existing = await prisma.schedule.findUnique({ where: { id: scheduleId } })
  if (!existing) { res.status(404).json({ error: 'Not found' }); return }

  if (req.session.role === 'user') {
    const user = await prisma.user.findUnique({ where: { username } })
    const engineer = user?.linkedEngineer ?? ''
    const displayName = user?.displayName ?? username

    if (existing.testEngineer !== engineer) {
      res.status(403).json({ ok: false, message: '您只能修改指派給自己的排程', code: 'NOT_OWN_SCHEDULE' })
      return
    }
    const body = pickScheduleFields(req.body as Record<string, unknown>) as Partial<Schedule>
    if (body.testEngineer !== undefined && body.testEngineer !== engineer) {
      res.status(403).json({ ok: false, message: '不可變更測試人員欄位', code: 'CANNOT_CHANGE_ENGINEER' })
      return
    }

    // ★ User 不可修改 adminFlag / adminFlagNote
    const { adminFlag: _af, adminFlagNote: _afn, ...safeBody } = body

    // ★ If linked to VTMS, isCompleted / isDelayed / delayReason are VTMS-controlled
    if (existing.vtmsPlanId) {
      delete (safeBody as Record<string, unknown>).isCompleted;
      delete (safeBody as Record<string, unknown>).isDelayed;
      delete (safeBody as Record<string, unknown>).delayReason;
    }

    const beforeRecord = existing as unknown as Record<string, unknown>
    const changedFields = Object.keys(safeBody).filter(
      k => JSON.stringify(beforeRecord[k]) !== JSON.stringify((safeBody as Record<string, unknown>)[k])
    )

    const updated = await prisma.schedule.update({
      where: { id: scheduleId },
      data: { ...safeBody, testEngineer: engineer, updatedBy: username, updatedAt: new Date() },
    })
    const userFlagFields = ['userFlag', 'userFlagNote']
    const isFlagOnly = changedFields.length > 0 && changedFields.every(f => userFlagFields.includes(f))
    if (isFlagOnly) {
      await appendAudit(username, displayName, 'FLAG_SCHEDULE', existing.projectName, changedFields)
    } else {
      await appendAudit(username, displayName, 'UPDATE_SCHEDULE', scheduleId, changedFields)
    }
    const { adminFlag: _af2, adminFlagNote: _afn2, ...safeResp } = toSchedule(updated)
    res.json(safeResp)
    return
  }

  const allowedUnits = await getAllowedUnits(username)
  if (!canAccessUnit(allowedUnits, existing.testUnit)) {
    res.status(403).json({
      ok: false, message: `您無權限修改 ${existing.testUnit} 的排程`, code: 'UNIT_NOT_ALLOWED',
    })
    return
  }

  const dbUser = await prisma.user.findUnique({ where: { username } })
  const displayName = dbUser?.displayName ?? username
  const body = pickScheduleFields(req.body as Record<string, unknown>)

  // ★ If linked to VTMS, isCompleted / isDelayed / delayReason are VTMS-controlled
  if (existing.vtmsPlanId) {
    delete body.isCompleted;
    delete body.isDelayed;
    delete body.delayReason;
  }

  const beforeRecord = existing as unknown as Record<string, unknown>
  const changedFields = Object.keys(body).filter(
    k => JSON.stringify(beforeRecord[k]) !== JSON.stringify(body[k])
  )

  const updated = await prisma.schedule.update({
    where: { id: scheduleId },
    data: { ...body, updatedBy: username, updatedAt: new Date() },
  })
  const flagFields = ['adminFlag', 'adminFlagNote', 'userFlag', 'userFlagNote']
  const isFlagOnly = changedFields.length > 0 && changedFields.every(f => flagFields.includes(f))
  if (isFlagOnly) {
    await appendAudit(username, displayName, 'FLAG_SCHEDULE', existing.projectName, changedFields)
  } else {
    await appendAudit(username, displayName, 'UPDATE_SCHEDULE', scheduleId, changedFields)
  }
  res.json(toSchedule(updated))
})

// DELETE /api/schedules/:id
router.delete('/:id', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: 'User 角色無刪除排程權限', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const username = req.session.username ?? 'unknown'
  const scheduleId = req.params.id as string
  const allowedUnits = await getAllowedUnits(username)
  const target = await prisma.schedule.findUnique({ where: { id: scheduleId } })

  if (!target) { res.status(404).json({ error: 'Not found' }); return }
  if (!canAccessUnit(allowedUnits, target.testUnit)) {
    res.status(403).json({
      ok: false, message: `您無權限刪除 ${target.testUnit} 的排程`, code: 'UNIT_NOT_ALLOWED',
    })
    return
  }

  await prisma.schedule.delete({ where: { id: scheduleId } })
  const dbUser = await prisma.user.findUnique({ where: { username } })
  const displayName = dbUser?.displayName ?? username
  await appendAudit(username, displayName, 'DELETE_SCHEDULE', scheduleId, [])
  res.json({ ok: true })
})

export default router
