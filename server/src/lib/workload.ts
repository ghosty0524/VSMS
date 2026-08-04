// server/src/lib/workload.ts
// 工程師負載分析核心演算法（自 Copilot Studio Agent 指示移入後端）：
// 每日強度 = timeResource ÷ 排程完整區間工作日數
//（類別調整：NPI +3、AVL/2nd Source -1、其餘如 Regression 不調整，夾底 0），
// 同日多筆加總、單日 1.2 封頂，月基礎分為目標月各工作日分數總和；
// 加班加分 = 時數 ÷ 6，即 6 小時折 1 分（獨立、不封頂）。

import type { CategoryStatsMode } from '../types.js'

export interface WorkloadScheduleInput {
  category: string
  testEngineer: string
  testUnit?: string | null
  timeResource: number
  startDate: string // 'YYYY/MM/DD' 或 'YYYY-MM-DD'
  endDate: string
}

export type WorkloadLevel = '超載' | '滿載' | '中等' | '偏低'

export interface EngineerWorkload {
  testEngineer: string
  testUnits: string[]
  scheduleCount: number
  baseScore: number
  overtimeHours: number | null
  overtimeBonus: number | null
  total: number
  rate: number // %
  level: WorkloadLevel
  unscheduledDays: number
  partialDays: number // 封頂前 0 < raw < 1
  cappedDays: number  // 封頂前 raw >= 1.2
  limitations: string[]
}

export interface WorkloadResult {
  month: string
  workdays: number
  engineers: EngineerWorkload[]
}

const DAILY_CAP = 1.2
const OVERTIME_HOURS_PER_POINT = 6 // 每 6 小時加班折 1 分
// 類別對 timeResource 的調整量；調整後不得為負
const CATEGORY_ADJUSTMENT: Record<string, number> = { NPI: 3, AVL: -1, '2nd Source': -1 }

export function classifyLevel(rate: number): WorkloadLevel {
  if (rate > 100) return '超載'
  if (rate >= 90) return '滿載'
  if (rate >= 70) return '中等'
  return '偏低'
}

const toIso = (d: string) => d.replace(/\//g, '-')
const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

function isWorkday(iso: string, holidays: Set<string>): boolean {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay()
  return dow !== 0 && dow !== 6 && !holidays.has(iso)
}

/** 起迄（含）之間的所有日期，ISO 字串 */
function datesBetween(startIso: string, endIso: string): string[] {
  const out: string[] = []
  const cur = new Date(startIso + 'T00:00:00Z')
  const end = new Date(endIso + 'T00:00:00Z')
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export function analyzeWorkload(opts: {
  month: string // 'YYYY-MM'
  schedules: WorkloadScheduleInput[]
  holidays?: string[] // ISO 例假日（非週末），來自 CalendarConfig
  overtime?: Record<string, number> // 工程師 → 當月加班時數
  // 工作類別 → 統計模式。未提供或查無對應的類別一律視為 counted，
  // 因此舊呼叫端的行為完全不變。
  statsModes?: Record<string, CategoryStatsMode>
}): WorkloadResult {
  const { month, schedules, overtime } = opts
  const holidays = new Set(opts.holidays ?? [])
  const statsModes = opts.statsModes ?? {}

  const [y, m] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  const monthWorkdays = datesBetween(monthStart, monthEnd).filter(d => isWorkday(d, holidays))

  type Acc = {
    raw: Map<string, number> // 月工作日 → 封頂前強度加總
    units: Set<string>
    scheduleCount: number
    limitations: string[]
  }
  const byEngineer = new Map<string, Acc>()

  for (const s of schedules) {
    const start = toIso(s.startDate)
    const end = toIso(s.endDate)
    if (end < monthStart || start > monthEnd || end < start) continue // 與目標月無重疊

    const statsMode = statsModes[s.category] ?? 'counted'
    if (statsMode === 'excluded') continue // 此類別既不計筆數也不佔產能

    let acc = byEngineer.get(s.testEngineer)
    if (!acc) {
      acc = { raw: new Map(), units: new Set(), scheduleCount: 0, limitations: [] }
      byEngineer.set(s.testEngineer, acc)
    }
    if (statsMode === 'counted') {
      acc.scheduleCount++
    } else {
      // workload_only：佔用產能但不是專案，於此註明以免呼叫端誤判筆數
      acc.limitations.push(`類別「${s.category}」設定為不計專案數，其排程未計入 scheduleCount`)
    }
    if (s.testUnit) acc.units.add(s.testUnit)

    const spanWorkdays = datesBetween(start, end).filter(d => isWorkday(d, holidays))
    if (spanWorkdays.length === 0) {
      acc.limitations.push(`排程「${start}～${end}」區間內無任何工作日，未計入強度`)
      continue
    }
    const effective = Math.max(0, s.timeResource + (CATEGORY_ADJUSTMENT[s.category] ?? 0))
    const intensity = effective / spanWorkdays.length
    for (const d of spanWorkdays) {
      if (d < monthStart || d > monthEnd) continue // 只累計目標月（不裁切分母）
      acc.raw.set(d, (acc.raw.get(d) ?? 0) + intensity)
    }
  }

  const engineers: EngineerWorkload[] = [...byEngineer.entries()].map(([name, acc]) => {
    let base = 0
    let unscheduledDays = 0
    let partialDays = 0
    let cappedDays = 0
    for (const d of monthWorkdays) {
      const raw = acc.raw.get(d) ?? 0
      base += Math.min(raw, DAILY_CAP)
      if (raw === 0) unscheduledDays++
      else if (raw < 1) partialDays++
      if (raw >= DAILY_CAP) cappedDays++
    }

    const overtimeHours = overtime && name in overtime ? overtime[name] : null
    const overtimeBonus = overtimeHours === null ? null : round2(overtimeHours / OVERTIME_HOURS_PER_POINT)
    const limitations = [...acc.limitations]
    if (overtimeBonus === null) {
      limitations.push('查無加班紀錄，總分未含加班加分')
    }

    const total = round2(base + (overtimeBonus ?? 0))
    const rate = monthWorkdays.length > 0 ? round1((total / monthWorkdays.length) * 100) : 0
    return {
      testEngineer: name,
      testUnits: [...acc.units],
      scheduleCount: acc.scheduleCount,
      baseScore: round2(base),
      overtimeHours,
      overtimeBonus,
      total,
      rate,
      level: classifyLevel(rate),
      unscheduledDays,
      partialDays,
      cappedDays,
      limitations,
    }
  })

  engineers.sort((a, b) => b.rate - a.rate)
  return { month, workdays: monthWorkdays.length, engineers }
}
