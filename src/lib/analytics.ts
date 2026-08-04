import { isRestDay } from './restDays'
import { computeStatus } from './status'
import type { ScheduleStatus } from './status'
import type { Schedule, RestDaysConfig, CategoryOption } from '../types'

export type TimeScale = 'month' | 'quarter' | 'year'

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('/').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtYmd(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// 期間鍵的字典序即時間序：'2026/07'、'2026 Q3'、'2026'
export function periodKey(d: Date, scale: TimeScale): string {
  const y = d.getFullYear()
  if (scale === 'year') return String(y)
  if (scale === 'quarter') return `${y} Q${Math.floor(d.getMonth() / 3) + 1}`
  return `${y}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function isOverdue(s: Schedule, today: string): boolean {
  return !s.isCompleted && !s.isCancelled && s.endDate < today
}

export function statusCounts(schedules: Schedule[]): Record<ScheduleStatus, number> {
  const counts: Record<ScheduleStatus, number> = {
    Cancelled: 0, Completed: 0, Delayed: 0, Testing: 0, Planned: 0,
  }
  for (const s of schedules) counts[computeStatus(s)]++
  return counts
}

export interface DueCompletion { due: number; completed: number; rate: number | null }

// 已到期完成率：分母 = endDate 已過且未取消；分子 = 其中已完成
export function dueCompletionRate(schedules: Schedule[], today: string): DueCompletion {
  const due = schedules.filter(s => !s.isCancelled && s.endDate < today)
  const completed = due.filter(s => s.isCompleted).length
  return { due: due.length, completed, rate: due.length > 0 ? (completed / due.length) * 100 : null }
}

// 依重疊工作天比例把 timeResource 分攤到各期間；區間內工作天為 0 時整筆歸起始期間
export function allocateTimeResource(
  s: Schedule, scale: TimeScale, rest: RestDaysConfig,
): Record<string, number> {
  const start = parseYmd(s.startDate)
  const end = parseYmd(s.endDate)
  const perPeriod: Record<string, number> = {}
  let total = 0
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (isRestDay(d, rest)) continue
    const key = periodKey(d, scale)
    perPeriod[key] = (perPeriod[key] ?? 0) + 1
    total++
  }
  if (total === 0) return { [periodKey(start, scale)]: s.timeResource }
  const out: Record<string, number> = {}
  for (const [key, days] of Object.entries(perPeriod)) {
    out[key] = (s.timeResource * days) / total
  }
  return out
}

export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000)
}

/**
 * 依工作類別的 statsMode 把排程分成「計入專案統計」與「計入人力負載」兩份。
 * 判斷集中於此，避免散落到各分析元件而彼此不一致。
 * 類別在清單中查無對應時（類別被刪除後遺留的舊排程）一律視為 counted。
 */
const VALID_STATS_MODES: readonly CategoryOption['statsMode'][] = ['counted', 'workload_only', 'excluded']

// DB 欄位無型別約束，statsMode 可能是非法字串；查無對應或非法值一律視為
// counted，寧可多算也不誤落入 workload_only 之類的其他分支。
function normalizeStatsMode(value: CategoryOption['statsMode'] | undefined): CategoryOption['statsMode'] {
  return value !== undefined && VALID_STATS_MODES.includes(value) ? value : 'counted'
}

export function splitByStatsMode(
  schedules: Schedule[],
  categories: CategoryOption[],
): { stats: Schedule[]; workload: Schedule[] } {
  const modeOf = new Map(categories.map(c => [c.value, c.statsMode]))
  const stats: Schedule[] = []
  const workload: Schedule[] = []
  for (const s of schedules) {
    const mode = normalizeStatsMode(modeOf.get(s.category))
    if (mode === 'excluded') continue
    workload.push(s)
    if (mode === 'counted') stats.push(s)
  }
  return { stats, workload }
}
