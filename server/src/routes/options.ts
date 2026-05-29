// server/src/routes/options.ts
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { OptionsMap } from '../types.js'

const router = Router()
router.use(requireAuth)

// GET /api/options
router.get('/', async (_req, res) => {
  const [categories, testUnits, restDays] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.testUnit.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { engineers: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.restDaysConfig.findUnique({ where: { id: 1 } }),
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

export default router
