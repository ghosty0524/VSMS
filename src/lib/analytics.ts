import { computeStatus } from './status'
import type { ScheduleStatus } from './status'
import type { Schedule, CategoryOption, WorkloadEngineer, WorkloadLevel } from '../types'

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

export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000)
}

/**
 * 依工作類別的 statsMode 把排程分成「計入專案統計」與「計入人力負載」兩份。
 * 判斷集中於此，避免散落到各分析元件而彼此不一致。
 * 類別在清單中查無對應時（類別被刪除後遺留的舊排程）一律視為 counted。
 */
// 前端無法從 server/ 匯入，此清單與 server/src/lib/statsMode.ts 為兩份獨立副本，
// 修改其中一份（例如新增模式）務必同步另一份，否則會在該端被靜默視為 counted。
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

// ── 負載分布（資料來自 GET /api/analytics/workload）──────────

// 門檻與 server/src/lib/workload.ts 的 classifyLevel 相同；前端無法從 server/
// 匯入，兩份要手動同步。只用於「單位」維度的平均值分級，人員的 level 一律用後端回傳值。
export function classifyLevel(rate: number): WorkloadLevel {
  if (rate > 100) return '超載'
  if (rate >= 90) return '滿載'
  if (rate >= 70) return '中等'
  return '偏低'
}

export const LEVEL_ORDER: WorkloadLevel[] = ['超載', '滿載', '中等', '偏低']
export const LEVEL_COLORS: Record<WorkloadLevel, string> = {
  超載: '#dc2626',
  滿載: '#f59e0b',
  中等: '#3b82f6',
  偏低: '#9ca3af',
}

const mm = (m: number) => String(m).padStart(2, '0')

// 期間鍵（periodKey 的輸出）→ API 的 from/to（YYYY-MM）
export function periodRange(key: string, scale: TimeScale): { from: string; to: string } {
  if (scale === 'year') return { from: `${key}-01`, to: `${key}-12` }
  if (scale === 'quarter') {
    const [y, q] = key.split(' Q')
    const first = (Number(q) - 1) * 3 + 1
    return { from: `${y}-${mm(first)}`, to: `${y}-${mm(first + 2)}` }
  }
  const [y, m] = key.split('/')
  return { from: `${y}-${m}`, to: `${y}-${m}` }
}

// 期間下拉的選項：每筆排程起迄之間逐月產生期間鍵，加上今天所在期間
export function periodKeysOfSchedules(
  schedules: ReadonlyArray<Pick<Schedule, 'startDate' | 'endDate'>>,
  scale: TimeScale,
  today: Date,
): string[] {
  const keys = new Set<string>([periodKey(today, scale)])
  for (const s of schedules) {
    const start = parseYmd(s.startDate)
    const end = parseYmd(s.endDate)
    for (const d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      keys.add(periodKey(d, scale))
    }
  }
  return [...keys].sort()
}

export interface UnitWorkload {
  name: string
  rate: number
  level: WorkloadLevel
  headcount: number
  scheduleCount: number
}

// 單位負載率＝testUnits 含該單位的人員負載率平均；一人多單位在每個單位各算一次
export function aggregateByUnit(engineers: WorkloadEngineer[]): UnitWorkload[] {
  const acc = new Map<string, { rates: number[]; scheduleCount: number }>()
  for (const e of engineers) {
    const units = e.testUnits.length > 0 ? e.testUnits : ['未分配']
    for (const u of units) {
      const a = acc.get(u) ?? { rates: [], scheduleCount: 0 }
      a.rates.push(e.rate)
      a.scheduleCount += e.scheduleCount
      acc.set(u, a)
    }
  }
  return [...acc.entries()]
    .map(([name, a]) => {
      const rate = Math.round((a.rates.reduce((x, y) => x + y, 0) / a.rates.length) * 10) / 10
      return { name, rate, level: classifyLevel(rate), headcount: a.rates.length, scheduleCount: a.scheduleCount }
    })
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name))
}
