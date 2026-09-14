// server/src/lib/workloadRange.ts
// 把 analyzeWorkload 的逐月結果合併成季／年：單日封頂已在每月內做完，
// 基礎分與工作日直接相加，負載率以合併後總數重算。
// 不改 analyzeWorkload 本身——它與 C# 版對齊、Agent 依賴它。
import { classifyLevel, type WorkloadResult, type WorkloadLevel } from './workload.js'
import { normalizeStatsMode } from './statsMode.js'
import type { CategoryStatsMode } from '../types.js'

export interface MergedEngineerWorkload {
  testEngineer: string
  testUnits: string[]
  baseScore: number
  rate: number // %
  level: WorkloadLevel
  unscheduledDays: number
  partialDays: number
  cappedDays: number
}

export interface MergedWorkload {
  workdays: number
  engineers: MergedEngineerWorkload[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

/** from～to（含）的每個月，'YYYY-MM'；呼叫端須先驗證 to >= from */
export function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export function mergeMonthlyWorkloads(results: WorkloadResult[]): MergedWorkload {
  const workdays = results.reduce((n, r) => n + r.workdays, 0)
  let workdaysBefore = 0 // 已處理月份的工作日累計

  type Acc = { units: Set<string>; base: number; unscheduled: number; partial: number; capped: number }
  const byEngineer = new Map<string, Acc>()
  for (const r of results) {
    for (const e of r.engineers) {
      let acc = byEngineer.get(e.testEngineer)
      if (!acc) {
        // 先前月份沒列出這位工程師（該月無排程）：那些月的工作日全是未排程
        acc = { units: new Set(), base: 0, unscheduled: workdaysBefore, partial: 0, capped: 0 }
        byEngineer.set(e.testEngineer, acc)
      }
      for (const u of e.testUnits) acc.units.add(u)
      acc.base += e.baseScore
      acc.unscheduled += e.unscheduledDays
      acc.partial += e.partialDays
      acc.capped += e.cappedDays
    }
    // 本月沒列出的工程師（analyzeWorkload 只列有排程重疊者）：本月工作日全是未排程
    const listed = new Set(r.engineers.map(e => e.testEngineer))
    for (const [name, acc] of byEngineer) {
      if (!listed.has(name)) acc.unscheduled += r.workdays
    }
    workdaysBefore += r.workdays
  }

  const engineers: MergedEngineerWorkload[] = [...byEngineer.entries()].map(([name, acc]) => {
    const baseScore = round2(acc.base)
    const rate = workdays > 0 ? round1((baseScore / workdays) * 100) : 0
    return {
      testEngineer: name,
      testUnits: [...acc.units].sort(),
      baseScore,
      rate,
      level: classifyLevel(rate),
      unscheduledDays: acc.unscheduled,
      partialDays: acc.partial,
      cappedDays: acc.capped,
    }
  })

  // 與 analyzeWorkload 相同的排序：rate 降冪，同分依姓名序數
  engineers.sort(
    (a, b) => b.rate - a.rate || (a.testEngineer < b.testEngineer ? -1 : a.testEngineer > b.testEngineer ? 1 : 0),
  )
  return { workdays, engineers }
}

/**
 * 每位工程師「statsMode 為 counted」的排程筆數。
 * analyzeWorkload 的 scheduleCount 是單月筆數，跨月排程在季／年合併時會被
 * 重複計算，因此筆數改由呼叫端以整段期間的排程清單另算。
 */
export function countSchedulesByEngineer(
  schedules: ReadonlyArray<{ category: string; testEngineer: string }>,
  statsModes: Record<string, CategoryStatsMode>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of schedules) {
    if (normalizeStatsMode(statsModes[s.category]) !== 'counted') continue
    out.set(s.testEngineer, (out.get(s.testEngineer) ?? 0) + 1)
  }
  return out
}
