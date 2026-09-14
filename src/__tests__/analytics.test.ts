import { describe, it, expect } from 'vitest'
import {
  periodKey, parseYmd, isOverdue, statusCounts, dueCompletionRate,
  daysBetweenYmd, splitByStatsMode,
  classifyLevel, periodRange, periodKeysOfSchedules, aggregateByUnit,
} from '../lib/analytics'
import type { Schedule, CategoryOption, WorkloadEngineer } from '../types'

function makeSchedule(over: Partial<Schedule>): Schedule {
  return {
    id: '1', category: 'NPI', projectName: 'P', taskDescription: '', testUnit: 'SIT-HW',
    testEngineer: 'Eric', timeResource: 10, startDate: '2026/06/22', endDate: '2026/07/03',
    requiredPersonnel: '', testReport: '', isCompleted: false, isDelayed: false,
    isCancelled: false, completedAt: null, delayReason: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
    ...over,
  }
}

describe('periodKey', () => {
  it('formats month/quarter/year', () => {
    const d = parseYmd('2026/07/16')
    expect(periodKey(d, 'month')).toBe('2026/07')
    expect(periodKey(d, 'quarter')).toBe('2026 Q3')
    expect(periodKey(d, 'year')).toBe('2026')
  })
})

describe('isOverdue', () => {
  const today = '2026/07/16'
  it('true when past endDate and not completed/cancelled', () => {
    expect(isOverdue(makeSchedule({ endDate: '2026/07/15' }), today)).toBe(true)
  })
  it('false when completed or cancelled or not yet due', () => {
    expect(isOverdue(makeSchedule({ endDate: '2026/07/15', isCompleted: true }), today)).toBe(false)
    expect(isOverdue(makeSchedule({ endDate: '2026/07/15', isCancelled: true }), today)).toBe(false)
    expect(isOverdue(makeSchedule({ endDate: '2026/07/16' }), today)).toBe(false)
  })
})

describe('dueCompletionRate', () => {
  const today = '2026/07/16'
  it('counts only past-due, excludes cancelled', () => {
    const r = dueCompletionRate([
      makeSchedule({ endDate: '2026/07/01', isCompleted: true }),
      makeSchedule({ endDate: '2026/07/01' }),
      makeSchedule({ endDate: '2026/07/01', isCancelled: true }),
      makeSchedule({ endDate: '2026/12/31' }),
    ], today)
    expect(r.due).toBe(2)
    expect(r.completed).toBe(1)
    expect(r.rate).toBe(50)
  })
  it('rate is null when nothing is due', () => {
    expect(dueCompletionRate([makeSchedule({ endDate: '2026/12/31' })], today).rate).toBeNull()
  })
})

describe('statusCounts', () => {
  it('buckets by computeStatus including Cancelled', () => {
    const counts = statusCounts([
      makeSchedule({ isCancelled: true }),
      makeSchedule({ isCompleted: true }),
      makeSchedule({ isDelayed: true }),
    ])
    expect(counts.Cancelled).toBe(1)
    expect(counts.Completed).toBe(1)
    expect(counts.Delayed).toBe(1)
  })
})

describe('daysBetweenYmd', () => {
  it('computes day difference', () => {
    expect(daysBetweenYmd('2026/07/10', '2026/07/16')).toBe(6)
  })
})

function cat(value: string, statsMode: CategoryOption['statsMode']): CategoryOption {
  return { id: value, value, label: value, isActive: true, sortOrder: 0, statsMode }
}

describe('splitByStatsMode', () => {
  const categories = [
    cat('NPI', 'counted'),
    cat('出國', 'workload_only'),
    cat('教育訓練', 'excluded'),
  ]

  it('counted 同時進入統計與負載', () => {
    const r = splitByStatsMode([makeSchedule({ category: 'NPI' })], categories)
    expect(r.stats.map(s => s.category)).toEqual(['NPI'])
    expect(r.workload.map(s => s.category)).toEqual(['NPI'])
  })

  it('workload_only 不進統計但進負載', () => {
    const r = splitByStatsMode([makeSchedule({ category: '出國' })], categories)
    expect(r.stats).toHaveLength(0)
    expect(r.workload.map(s => s.category)).toEqual(['出國'])
  })

  it('excluded 兩者皆不進', () => {
    const r = splitByStatsMode([makeSchedule({ category: '教育訓練' })], categories)
    expect(r.stats).toHaveLength(0)
    expect(r.workload).toHaveLength(0)
  })

  it('類別已被刪除的排程視為 counted，寧可多算也不無聲漏掉', () => {
    const r = splitByStatsMode([makeSchedule({ category: '已刪除的類別' })], categories)
    expect(r.stats).toHaveLength(1)
    expect(r.workload).toHaveLength(1)
  })

  it('空類別清單不崩潰，全部視為 counted', () => {
    const r = splitByStatsMode(
      [makeSchedule({ category: 'NPI' }), makeSchedule({ category: '出國' })],
      [],
    )
    expect(r.stats).toHaveLength(2)
    expect(r.workload).toHaveLength(2)
  })

  it('statsMode 為非法值的類別視為 counted，寧可多算也不無聲漏掉', () => {
    const badCategories = [
      { id: 'X', value: 'X', label: 'X', isActive: true, sortOrder: 0, statsMode: 'nonsense' as CategoryOption['statsMode'] },
    ]
    const r = splitByStatsMode([makeSchedule({ category: 'X' })], badCategories)
    expect(r.stats.map(s => s.category)).toEqual(['X'])
    expect(r.workload.map(s => s.category)).toEqual(['X'])
  })
})

describe('classifyLevel（前端副本，門檻與 server/src/lib/workload.ts 相同）', () => {
  it('>100 超載、90-100 滿載、70-89 中等、<70 偏低', () => {
    expect(classifyLevel(100.1)).toBe('超載')
    expect(classifyLevel(100)).toBe('滿載')
    expect(classifyLevel(90)).toBe('滿載')
    expect(classifyLevel(89.9)).toBe('中等')
    expect(classifyLevel(70)).toBe('中等')
    expect(classifyLevel(69.9)).toBe('偏低')
  })
})

describe('periodRange', () => {
  it('月', () => {
    expect(periodRange('2026/07', 'month')).toEqual({ from: '2026-07', to: '2026-07' })
  })
  it('季', () => {
    expect(periodRange('2026 Q1', 'quarter')).toEqual({ from: '2026-01', to: '2026-03' })
    expect(periodRange('2026 Q4', 'quarter')).toEqual({ from: '2026-10', to: '2026-12' })
  })
  it('年', () => {
    expect(periodRange('2026', 'year')).toEqual({ from: '2026-01', to: '2026-12' })
  })
})

describe('periodKeysOfSchedules', () => {
  const today = new Date(2026, 8, 14)
  it('涵蓋每筆排程起迄之間的所有期間，加上今天所在期間，排序去重', () => {
    const keys = periodKeysOfSchedules(
      [
        { startDate: '2026/06/22', endDate: '2026/08/03' },
        { startDate: '2026/11/02', endDate: '2026/11/06' },
      ],
      'month', today,
    )
    expect(keys).toEqual(['2026/06', '2026/07', '2026/08', '2026/09', '2026/11'])
  })
  it('季尺度', () => {
    expect(periodKeysOfSchedules([{ startDate: '2026/03/30', endDate: '2026/04/02' }], 'quarter', today))
      .toEqual(['2026 Q1', '2026 Q2', '2026 Q3'])
  })
  it('沒有排程時只有今天', () => {
    expect(periodKeysOfSchedules([], 'year', today)).toEqual(['2026'])
  })
})

describe('aggregateByUnit', () => {
  const eng = (over: Partial<WorkloadEngineer>): WorkloadEngineer => ({
    testEngineer: 'X', testUnits: ['RA'], scheduleCount: 1, baseScore: 10, rate: 50, level: '偏低',
    unscheduledDays: 0, partialDays: 0, cappedDays: 0, ...over,
  })
  it('單位負載率＝testUnits 含該單位的人員平均，人數與筆數加總', () => {
    const units = aggregateByUnit([
      eng({ testEngineer: 'A', rate: 100, scheduleCount: 2 }),
      eng({ testEngineer: 'B', rate: 80, scheduleCount: 3 }),
      eng({ testEngineer: 'C', testUnits: ['RB'], rate: 30 }),
    ])
    expect(units).toEqual([
      { name: 'RA', rate: 90, level: '滿載', headcount: 2, scheduleCount: 5 },
      { name: 'RB', rate: 30, level: '偏低', headcount: 1, scheduleCount: 1 },
    ])
  })
  it('一人多單位在每個單位各算一次；平均取一位小數', () => {
    const units = aggregateByUnit([
      eng({ testEngineer: 'A', testUnits: ['RA', 'RB'], rate: 33.3 }),
      eng({ testEngineer: 'B', testUnits: ['RB'], rate: 50 }),
    ])
    expect(units.find(u => u.name === 'RA')).toEqual({ name: 'RA', rate: 33.3, level: '偏低', headcount: 1, scheduleCount: 1 })
    expect(units.find(u => u.name === 'RB')?.rate).toBe(41.7)
  })
  it('沒有單位的人歸「未分配」', () => {
    expect(aggregateByUnit([eng({ testUnits: [] })])[0].name).toBe('未分配')
  })
  it('依負載率降冪，同分依名稱', () => {
    const names = aggregateByUnit([
      eng({ testEngineer: 'A', testUnits: ['Z'], rate: 50 }),
      eng({ testEngineer: 'B', testUnits: ['M'], rate: 50 }),
      eng({ testEngineer: 'C', testUnits: ['K'], rate: 90 }),
    ]).map(u => u.name)
    expect(names).toEqual(['K', 'M', 'Z'])
  })
})
