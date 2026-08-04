// server/src/routes/options.ts
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/db.js'
import { appendAudit } from '../lib/storage.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { OptionsMap } from '../types.js'
import {
  toCategoryResponse, toCategoryCreateData,
  toTestUnitResponse, toTestUnitCreateData, toEngineerCreateData,
} from './optionsMapping.js'
import { findMissingReferencedEngineers, formatEngineerInUseMessage, type MissingEngineer } from '../lib/engineerInUse.js'

const router = Router()
router.use(requireAuth)

// ★ 需求三／finding 1+7：guard 只能擋「這次請求真的要移除、且仍被引用」的人員；
// 用丟例外的方式讓 $transaction 自動 rollback，路由再攔截並回 400。
class EngineerInUseError extends Error {
  constructor(public readonly missing: MissingEngineer[]) {
    super('ENGINEER_IN_USE')
  }
}

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
    categories: categories.map(toCategoryResponse),
    testUnits: testUnits.map(toTestUnitResponse),
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
  const bodyEngineerValues = body.testUnits.flatMap(u => u.engineers.map(e => e.value))

  try {
    await prisma.$transaction(async (tx) => {
      // ★ 需求三：人員的移除是全刪重建（不在 body 中即等同刪除），沒有 DELETE
      // 端點可掛引用檢查，因此在交易內、寫入之前先擋下「這次請求真的要移除、且
      // 仍被排程引用」的人員。
      //
      // ★ finding 1：只比對 body 會誤判——正式資料庫已有 18 筆排程引用
      // Ben_Ko，但 Ben_Ko 早就不在 engineers 表中（不是這次請求要移除的，而是
      // 已存在的孤兒）。所以先取得「目前仍在 engineers 表中」的 value 集合，
      // 把排程引用篩到只剩「引用到現行人員」的部分，再交給既有的純函式判斷
      // 是否被 body 移除。孤兒對這道防線因此完全不可見。
      //
      // ★ finding 7：讀取與寫入必須在同一筆交易內完成，讓 guard 看到的是與
      // 後續刪除同一份一致的快照，且不會被寫入操作重排到後面；guard 失敗時
      // 用丟例外觸發 rollback。注意這並未完全關閉競態視窗——tx.schedule.findMany
      // 只是普通、不加鎖的 SELECT，交易本身也沒有寫入 schedules 表，因此在
      // REPEATABLE READ 下，仍可能有另一筆交易在此刻插入排程並提交、引用到
      // 這裡即將刪除的人員。真要完全關閉需要 SELECT ... FOR UPDATE 或外鍵約束，
      // 兩者都超出本次範圍，這裡先接受此殘餘視窗。
      const existingEngineers = await tx.engineer.findMany({ select: { value: true } })
      const existingEngineerValues = new Set(existingEngineers.map(e => e.value))
      const schedules = await tx.schedule.findMany({ select: { testEngineer: true } })
      const referencedExistingEngineers = schedules
        .map(s => s.testEngineer)
        .filter(v => existingEngineerValues.has(v))
      const missing = findMissingReferencedEngineers(referencedExistingEngineers, bodyEngineerValues)
      if (missing.length > 0) {
        throw new EngineerInUseError(missing)
      }

      // Delete in dependency order (engineers are cascade-deleted with testUnits)
      await tx.engineer.deleteMany()
      await tx.testUnit.deleteMany()
      await tx.category.deleteMany()

      // Create new categories
      if (body.categories.length > 0) {
        await tx.category.createMany({
          data: body.categories.map(toCategoryCreateData),
        })
      }

      // Create new testUnits with nested engineers
      for (const unit of body.testUnits) {
        await tx.testUnit.create({
          data: {
            ...toTestUnitCreateData(unit),
            engineers: { create: unit.engineers.map(toEngineerCreateData) },
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
  } catch (err) {
    if (err instanceof EngineerInUseError) {
      res.status(400).json({
        ok: false,
        message: formatEngineerInUseMessage(err.missing),
        code: 'ENGINEER_IN_USE',
      })
      return
    }
    throw err
  }

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
