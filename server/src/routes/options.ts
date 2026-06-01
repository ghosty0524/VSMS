// server/src/routes/options.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { OptionsMap } from '../types.js'

const router = Router()
router.use(requireAuth)

// GET /api/options
router.get('/', async (_req, res) => {
  const [categories, testUnits, restDays, devices] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.testUnit.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { engineers: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.restDaysConfig.findUnique({ where: { id: 1 } }),
    prisma.device.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

  const result: OptionsMap = {
    categories: categories.map(({ id, value, label, isActive, sortOrder }) => ({
      id, value, label, isActive, sortOrder,
    })),
    testUnits: testUnits.map(({ id, value, label, isActive, sortOrder, engineers }) => ({
      id, value, label, isActive, sortOrder,
      engineers: engineers.map(({ id, value, label, isActive, sortOrder }) => ({
        id, value, label, isActive, sortOrder,
      })),
    })),
    restDays: {
      weekends: restDays?.weekends ?? true,
      specificDates: (restDays?.specificDates as string[]) ?? [],
    },
    devices: devices.map(({ id, value, label, isActive, sortOrder }) => ({
      id, value, label, isActive, sortOrder,
    })),
  }

  res.json(result)
})

// PUT /api/options — full atomic replacement
router.put('/', async (req, res) => {
  const username = req.session.username ?? 'unknown'
  const body = req.body as OptionsMap

  await prisma.$transaction(async (tx) => {
    // Delete in dependency order (engineers are cascade-deleted with testUnits)
    await tx.engineer.deleteMany()
    await tx.testUnit.deleteMany()
    await tx.category.deleteMany()

    // Create new categories
    if (body.categories.length > 0) {
      await tx.category.createMany({
        data: body.categories.map(c => ({
          id: c.id, value: c.value, label: c.label,
          isActive: c.isActive, sortOrder: c.sortOrder,
        })),
      })
    }

    // Create new testUnits with nested engineers
    for (const unit of body.testUnits) {
      await tx.testUnit.create({
        data: {
          id: unit.id, value: unit.value, label: unit.label,
          isActive: unit.isActive, sortOrder: unit.sortOrder,
          engineers: {
            create: unit.engineers.map(e => ({
              id: e.id, value: e.value, label: e.label,
              isActive: e.isActive, sortOrder: e.sortOrder,
            })),
          },
        },
      })
    }

    // Upsert restDaysConfig singleton
    await tx.restDaysConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        weekends: body.restDays.weekends,
        specificDates: body.restDays.specificDates,
      },
      update: {
        weekends: body.restDays.weekends,
        specificDates: body.restDays.specificDates,
      },
    })
  })

  const dbUser = await prisma.user.findUnique({ where: { username } })
  await appendAudit(username, dbUser?.displayName ?? username, 'UPDATE_SETTINGS', 'options', [])

  res.json(body)
})

// POST /api/options/devices — Admin / Super Admin only
router.post('/devices', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const { value, label, sortOrder } = req.body as { value: string; label: string; sortOrder: number }
  if (!value?.trim() || !label?.trim()) {
    res.status(400).json({ ok: false, message: '名稱不可空白' })
    return
  }
  const device = await prisma.device.create({
    data: { id: uuidv4(), value: value.trim(), label: label.trim(), isActive: true, sortOrder: sortOrder ?? 0 },
  })
  res.status(201).json({ id: device.id, value: device.value, label: device.label, isActive: device.isActive, sortOrder: device.sortOrder })
})

// PUT /api/options/devices/:id — Admin / Super Admin only
router.put('/devices/:id', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const { id } = req.params as { id: string }
  const { label, isActive, sortOrder } = req.body as { label?: string; isActive?: boolean; sortOrder?: number }
  const updated = await prisma.device.update({
    where: { id },
    data: {
      // ★ 只更新 label，value 為識別碼保持不動（避免破壞 Schedule.device 參照）
      ...(label !== undefined && { label: label.trim() }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  })
  res.json({ id: updated.id, value: updated.value, label: updated.label, isActive: updated.isActive, sortOrder: updated.sortOrder })
})

// DELETE /api/options/devices/:id — Admin / Super Admin only
router.delete('/devices/:id', async (req, res) => {
  if (req.session.role === 'user') {
    res.status(403).json({ ok: false, message: '權限不足', code: 'ROLE_NOT_ALLOWED' })
    return
  }
  const { id } = req.params as { id: string }
  const device = await prisma.device.findUnique({ where: { id } })
  if (!device) { res.status(404).json({ ok: false, message: '設備不存在' }); return }
  const inUse = await prisma.schedule.count({ where: { device: device.value } })
  if (inUse > 0) {
    res.status(400).json({
      ok: false,
      message: `此設備目前有 ${inUse} 筆排程使用中，無法刪除`,
      code: 'DEVICE_IN_USE',
    })
    return
  }
  await prisma.device.delete({ where: { id } })
  res.json({ ok: true })
})

export default router
