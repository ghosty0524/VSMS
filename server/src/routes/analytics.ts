// server/src/routes/analytics.ts
// 統計頁「負載分布」的資料來源。刻意重用 Agent 走的 analyzeWorkload，
// 統計頁與 Agent 的數字才會一致；本路由不帶加班參數（需求排除加班）。
import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { analyzeWorkload, type WorkloadResult } from '../lib/workload.js'
import { monthsBetween, mergeMonthlyWorkloads, countSchedulesByEngineer } from '../lib/workloadRange.js'
import { normalizeStatsMode } from '../lib/statsMode.js'

const router = Router()
router.use(requireAuth)

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_MONTHS = 12

function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0]
  return undefined
}

/** 逗號分隔的多值參數；空字串或全空白視為未提供 */
function csv(val: unknown): string[] | undefined {
  const raw = qs(val)
  if (!raw) return undefined
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

router.get('/workload', async (req, res) => {
  const from = (qs(req.query.from) ?? '').trim()
  const to = (qs(req.query.to) ?? from).trim()
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) {
    res.status(400).json({ ok: false, message: 'from / to 須為 YYYY-MM' })
    return
  }
  if (to < from) {
    res.status(400).json({ ok: false, message: 'to 不可早於 from' })
    return
  }
  const months = monthsBetween(from, to)
  if (months.length > MAX_MONTHS) {
    res.status(400).json({ ok: false, message: `期間最多 ${MAX_MONTHS} 個月` })
    return
  }

  // 排程日期為 'YYYY/MM/DD' 字串；'31' 用字串比較涵蓋每種月長（比照 integration 路由）
  const rangeStart = `${from.replace('-', '/')}/01`
  const rangeEnd = `${to.replace('-', '/')}/31`
  const where: Record<string, unknown> = {
    isCancelled: false, // 已取消的排程不計入負載
    startDate: { lte: rangeEnd },
    endDate: { gte: rangeStart },
  }
  const categories = csv(req.query.categories)
  if (categories) where.category = { in: categories }
  const testUnits = csv(req.query.testUnits)
  if (testUnits) where.testUnit = { in: testUnits }
  const testEngineers = csv(req.query.testEngineers)
  if (testEngineers) where.testEngineer = { in: testEngineers }

  const rows = await prisma.schedule.findMany({
    where,
    select: { category: true, testEngineer: true, testUnit: true, timeResource: true, startDate: true, endDate: true },
  })
  const schedules = rows.filter(s => s.testEngineer)

  const categoryRows = await prisma.category.findMany()
  // DB 欄位為未受限的 VARCHAR，非法或缺漏值一律退回 counted
  const statsModes = Object.fromEntries(
    categoryRows.map(c => [c.value, normalizeStatsMode(c.statsMode)]),
  )

  // 例假日（非週末）取自政府行事曆匯入，只存一個年度；年度不符的月份僅排除週六日並提醒
  const calendar = await prisma.calendarConfig.findUnique({ where: { id: 1 } })
  const notes: string[] = []
  const notedYears = new Set<number>()
  const monthly: WorkloadResult[] = months.map(month => {
    const year = Number(month.slice(0, 4))
    let holidays: string[] = []
    if (calendar && calendar.year === year) {
      holidays = (calendar.nonWeekendHolidays as string[]) ?? []
    } else if (!notedYears.has(year)) {
      notedYears.add(year)
      notes.push(`行事曆未涵蓋 ${year} 年，工作日僅排除週六日、未排除國定假日`)
    }
    return analyzeWorkload({ month, schedules, holidays, statsModes })
  })

  const merged = mergeMonthlyWorkloads(monthly)
  const scheduleCounts = countSchedulesByEngineer(schedules, statsModes)
  res.json({
    from,
    to,
    workdays: merged.workdays,
    notes,
    engineers: merged.engineers.map(e => ({
      testEngineer: e.testEngineer,
      testUnits: e.testUnits,
      scheduleCount: scheduleCounts.get(e.testEngineer) ?? 0,
      baseScore: e.baseScore,
      rate: e.rate,
      level: e.level,
      unscheduledDays: e.unscheduledDays,
      partialDays: e.partialDays,
      cappedDays: e.cappedDays,
    })),
  })
})

export default router
