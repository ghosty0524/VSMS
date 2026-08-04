import { describe, it, expect } from 'vitest'
import { analyzeWorkload, classifyLevel, type WorkloadScheduleInput } from '../lib/workload.js'

// 2026-07：週末為 4,5,11,12,18,19,25,26 → 平日 23 天
const MONTH = '2026-07'

function sched(over: Partial<WorkloadScheduleInput> = {}): WorkloadScheduleInput {
  return {
    category: 'Regression', // 中性類別：無 timeResource 調整

    testEngineer: 'Alice',
    testUnit: 'RA',
    timeResource: 5,
    startDate: '2026/07/06', // 週一
    endDate: '2026/07/10',   // 週五
    ...over,
  }
}

describe('classifyLevel 分級', () => {
  it('依負載率分四級：>100 超載、90-100 滿載、70-89 中等、<70 偏低', () => {
    expect(classifyLevel(100.1)).toBe('超載')
    expect(classifyLevel(100)).toBe('滿載')
    expect(classifyLevel(90)).toBe('滿載')
    expect(classifyLevel(89.9)).toBe('中等')
    expect(classifyLevel(70)).toBe('中等')
    expect(classifyLevel(69.9)).toBe('偏低')
  })
})

describe('analyzeWorkload 負載分析', () => {
  it('計算目標月的商業工作日數（排除週六日與例假日）', () => {
    expect(analyzeWorkload({ month: MONTH, schedules: [] }).workdays).toBe(23)
    expect(
      analyzeWorkload({ month: MONTH, schedules: [], holidays: ['2026-07-06'] }).workdays
    ).toBe(22)
  })

  it('單一排程：timeResource 平均攤平到排程區間的每個工作日', () => {
    // timeResource 5 ÷ 5 個工作日 = 每日強度 1
    const r = analyzeWorkload({ month: MONTH, schedules: [sched()] })
    const e = r.engineers[0]
    expect(e.testEngineer).toBe('Alice')
    expect(e.baseScore).toBe(5)
    expect(e.unscheduledDays).toBe(18) // 23 - 5
    expect(e.partialDays).toBe(0)
    expect(e.cappedDays).toBe(0)
    expect(e.rate).toBe(21.7) // 5 / 23 * 100
    expect(e.level).toBe('偏低')
  })

  it('NPI 類別：計算強度時 timeResource + 3', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: 'NPI', timeResource: 2 })], // (2+3)/5 = 1
    })
    expect(r.engineers[0].baseScore).toBe(5)
  })

  it('AVL 類別：計算強度時 timeResource - 1', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: 'AVL', timeResource: 6 })], // (6-1)/5 = 1
    })
    expect(r.engineers[0].baseScore).toBe(5)
  })

  it('2nd Source 類別：計算方式等同 AVL（timeResource - 1）', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: '2nd Source', timeResource: 6 })], // (6-1)/5 = 1
    })
    expect(r.engineers[0].baseScore).toBe(5)
  })

  it('AVL 調整後不得為負：夾底為 0', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ category: 'AVL', timeResource: 0.5 })], // 0.5-1 → 0
    })
    expect(r.engineers[0].baseScore).toBe(0)
    expect(r.engineers[0].unscheduledDays).toBe(23)
  })

  it('同日多筆排程強度加總，單日以 1.2 封頂，並統計封頂天', () => {
    const r = analyzeWorkload({ month: MONTH, schedules: [sched(), sched()] }) // raw 2/日
    const e = r.engineers[0]
    expect(e.baseScore).toBe(6) // 1.2 × 5
    expect(e.cappedDays).toBe(5)
  })

  it('每日強度 <1 統計為部分覆蓋天', () => {
    const r = analyzeWorkload({ month: MONTH, schedules: [sched({ timeResource: 2.5 })] })
    const e = r.engineers[0]
    expect(e.baseScore).toBe(2.5)
    expect(e.partialDays).toBe(5)
  })

  it('跨月排程不裁切：強度以完整區間工作日計，僅目標月日期計分', () => {
    // 2026/06/22–2026/07/03：6月7個工作日＋7月3個 = 10；10÷10 = 每日 1
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ startDate: '2026/06/22', endDate: '2026/07/03', timeResource: 10 })],
    })
    const e = r.engineers[0]
    expect(e.baseScore).toBe(3) // 只算 7/1–7/3
    expect(e.unscheduledDays).toBe(20)
  })

  it('例假日同時從月工作日與排程區間工作日中排除', () => {
    // 7/6 為例假日：區間工作日剩 4 天 → 4÷4 = 每日 1，計分日為 7/7–7/10
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ timeResource: 4 })],
      holidays: ['2026-07-06'],
    })
    const e = r.engineers[0]
    expect(e.baseScore).toBe(4)
    expect(r.workdays).toBe(22)
  })

  it('加班加分＝時數÷6（6 小時折 1 分），獨立於封頂；查無加班者標註資料限制', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched(), sched({ testEngineer: 'Bob' })],
      overtime: { Alice: 6 },
    })
    const alice = r.engineers.find(e => e.testEngineer === 'Alice')!
    const bob = r.engineers.find(e => e.testEngineer === 'Bob')!
    expect(alice.overtimeHours).toBe(6)
    expect(alice.overtimeBonus).toBe(1)
    expect(alice.total).toBe(6) // base 5 + 1
    expect(bob.overtimeHours).toBeNull()
    expect(bob.overtimeBonus).toBeNull()
    expect(bob.total).toBe(5)
    expect(bob.limitations.join()).toContain('加班')
  })

  it('與目標月不重疊的排程不計入', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ startDate: '2026/08/03', endDate: '2026/08/07' })],
    })
    expect(r.engineers).toHaveLength(0)
  })

  it('區間內無任何工作日的排程跳過並標註限制', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [sched({ startDate: '2026/07/04', endDate: '2026/07/05' })], // 週六日
    })
    const e = r.engineers[0]
    expect(e.baseScore).toBe(0)
    expect(e.limitations.join()).toContain('工作日')
  })

  it('結果依負載率由高至低排序', () => {
    const r = analyzeWorkload({
      month: MONTH,
      schedules: [
        sched({ testEngineer: 'Low', timeResource: 1 }),
        sched({ testEngineer: 'High', timeResource: 5 }),
      ],
    })
    expect(r.engineers.map(e => e.testEngineer)).toEqual(['High', 'Low'])
  })
})
