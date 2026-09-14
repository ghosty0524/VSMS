// server/src/__tests__/workloadRange.test.ts
import { describe, it, expect } from 'vitest'
import { analyzeWorkload, type WorkloadScheduleInput } from '../lib/workload.js'
import { monthsBetween, mergeMonthlyWorkloads, countSchedulesByEngineer } from '../lib/workloadRange.js'

// 2026-07 平日 23 天、2026-08 平日 21 天
function sched(over: Partial<WorkloadScheduleInput> = {}): WorkloadScheduleInput {
  return {
    category: 'Regression',
    testEngineer: 'Alice',
    testUnit: 'RA',
    timeResource: 5,
    startDate: '2026/07/06',
    endDate: '2026/07/10',
    ...over,
  }
}

describe('monthsBetween', () => {
  it('同月回一個', () => {
    expect(monthsBetween('2026-07', '2026-07')).toEqual(['2026-07'])
  })
  it('一季三個月', () => {
    expect(monthsBetween('2026-07', '2026-09')).toEqual(['2026-07', '2026-08', '2026-09'])
  })
  it('跨年', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('mergeMonthlyWorkloads', () => {
  it('單月合併與 analyzeWorkload 逐項相等', () => {
    const one = analyzeWorkload({ month: '2026-07', schedules: [sched(), sched({ testEngineer: 'Bob', timeResource: 30 })] })
    const merged = mergeMonthlyWorkloads([one])
    expect(merged.workdays).toBe(one.workdays)
    expect(merged.engineers.map(e => e.testEngineer)).toEqual(one.engineers.map(e => e.testEngineer))
    for (const e of one.engineers) {
      const m = merged.engineers.find(x => x.testEngineer === e.testEngineer)!
      expect(m).toEqual({
        testEngineer: e.testEngineer,
        testUnits: e.testUnits,
        baseScore: e.baseScore,
        rate: e.rate,
        level: e.level,
        unscheduledDays: e.unscheduledDays,
        partialDays: e.partialDays,
        cappedDays: e.cappedDays,
      })
    }
  })

  it('兩個月：基礎分、工作日、天數相加，負載率以合併後總數重算', () => {
    // 7 月：5 個工作日各強度 1 → 基礎分 5；8 月無排程 → 0
    const jul = analyzeWorkload({ month: '2026-07', schedules: [sched()] })
    const aug = analyzeWorkload({ month: '2026-08', schedules: [sched()] })
    const merged = mergeMonthlyWorkloads([jul, aug])
    expect(merged.workdays).toBe(44)
    const alice = merged.engineers[0]
    expect(alice.baseScore).toBe(5)
    expect(alice.rate).toBe(11.4) // 5 / 44 * 100 = 11.36 → 11.4
    expect(alice.level).toBe('偏低')
    expect(alice.unscheduledDays).toBe(18 + 21)
    expect(alice.partialDays).toBe(0)
    expect(alice.cappedDays).toBe(0)
  })

  it('只在後一個月出現的人，前面缺席月份的工作日全算未排程', () => {
    const jul = analyzeWorkload({ month: '2026-07', schedules: [] })
    const aug = analyzeWorkload({ month: '2026-08', schedules: [sched({ startDate: '2026/08/03', endDate: '2026/08/07' })] })
    const alice = mergeMonthlyWorkloads([jul, aug]).engineers[0]
    expect(alice.unscheduledDays).toBe(23 + 16)
    expect(alice.baseScore).toBe(5)
  })

  it('testUnits 取聯集並排序', () => {
    const jul = analyzeWorkload({ month: '2026-07', schedules: [sched({ testUnit: 'RB' })] })
    const aug = analyzeWorkload({ month: '2026-08', schedules: [sched({ testUnit: 'RA', startDate: '2026/08/03', endDate: '2026/08/07' })] })
    expect(mergeMonthlyWorkloads([jul, aug]).engineers[0].testUnits).toEqual(['RA', 'RB'])
  })

  it('依負載率降冪，同分依姓名', () => {
    const jul = analyzeWorkload({
      month: '2026-07',
      schedules: [
        sched({ testEngineer: 'Zoe' }),
        sched({ testEngineer: 'Adam' }),
        sched({ testEngineer: 'Mia', timeResource: 30 }),
      ],
    })
    expect(mergeMonthlyWorkloads([jul]).engineers.map(e => e.testEngineer)).toEqual(['Mia', 'Adam', 'Zoe'])
  })

  it('空結果', () => {
    expect(mergeMonthlyWorkloads([])).toEqual({ workdays: 0, engineers: [] })
  })
})

describe('countSchedulesByEngineer', () => {
  it('只算 counted；workload_only 與 excluded 不算；查無類別視為 counted', () => {
    const map = countSchedulesByEngineer(
      [
        { category: 'NPI', testEngineer: 'Alice' },
        { category: 'Support', testEngineer: 'Alice' },
        { category: 'Leave', testEngineer: 'Alice' },
        { category: 'Ghost', testEngineer: 'Bob' },
      ],
      { NPI: 'counted', Support: 'workload_only', Leave: 'excluded' },
    )
    expect(map.get('Alice')).toBe(1)
    expect(map.get('Bob')).toBe(1)
  })
})
