// server/src/__tests__/summary.test.ts
// summaryFor 是純函式：today／settings／schedules 都直接餵入，不碰 prisma。
import { describe, it, expect } from 'vitest'
import { summaryFor } from '../lib/summary.js'

const weekendsOnly = { weekends: true, specificDates: [] as string[] }

// today = 2026/09/22（週二）。本週 = 週一 09/21 ～ 週日 09/27。
// 三個工作天內開始 = addWorkdays('2026/09/22', 3, weekendsOnly) = 09/25(五)，
// 視窗為 (09/22, 09/25]。
const today = '2026/09/22'

function sched(over: Partial<{ startDate: string; endDate: string; isCompleted: boolean; isCancelled: boolean }>) {
  return {
    startDate: '2026/09/22', endDate: '2026/09/22', isCompleted: false, isCancelled: false, ...over,
  }
}

describe('summaryFor', () => {
  it('counts schedules overlapping this week (Mon–Sun) as "本週我的排程"', () => {
    const schedules = [
      sched({ startDate: '2026/09/20', endDate: '2026/09/21' }), // 只到週一，有重疊
      sched({ startDate: '2026/09/26', endDate: '2026/09/29' }), // 從週六開始，有重疊
      sched({ startDate: '2026/09/28', endDate: '2026/09/30' }), // 下週一才開始，無重疊
      sched({ startDate: '2026/09/10', endDate: '2026/09/14' }), // 上週結束，無重疊
    ]
    const items = summaryFor(today, weekendsOnly, schedules)
    expect(items[0]).toMatchObject({ label: '本週我的排程', count: 2, linkUrl: '/vsms/' })
  })

  it('counts schedules starting within the next 3 working days (exclusive of today)', () => {
    const schedules = [
      sched({ startDate: '2026/09/22' }), // 今天開始，不算「即將」
      sched({ startDate: '2026/09/23' }), // 明天，在視窗內
      sched({ startDate: '2026/09/25' }), // 第三個工作天，在視窗內（含）
      sched({ startDate: '2026/09/26' }), // 超出視窗
    ]
    const items = summaryFor(today, weekendsOnly, schedules)
    expect(items[1]).toMatchObject({ label: '三個工作天內開始', count: 2, linkUrl: '/vsms/' })
  })

  it('counts overdue schedules whose endDate is before today', () => {
    const schedules = [
      sched({ endDate: '2026/09/21' }), // 逾期
      sched({ endDate: '2026/09/22' }), // 今天到期，不算逾期
      sched({ endDate: '2026/09/23' }), // 未到期
    ]
    const items = summaryFor(today, weekendsOnly, schedules)
    expect(items[2]).toMatchObject({ label: '逾期', count: 1, linkUrl: '/vsms/' })
  })

  it('excludes completed and cancelled schedules from every bucket', () => {
    const schedules = [
      sched({ startDate: '2026/09/20', endDate: '2026/09/25', isCompleted: true }),
      sched({ startDate: '2026/09/20', endDate: '2026/09/25', isCancelled: true }),
      sched({ endDate: '2026/09/10', isCompleted: true }),
      sched({ endDate: '2026/09/10', isCancelled: true }),
    ]
    const items = summaryFor(today, weekendsOnly, schedules)
    expect(items.map(i => i.count)).toEqual([0, 0, 0])
  })

  it('returns an empty-but-shaped result when there are no schedules', () => {
    const items = summaryFor(today, weekendsOnly, [])
    expect(items).toEqual([
      { label: '本週我的排程', count: 0, linkUrl: '/vsms/' },
      { label: '三個工作天內開始', count: 0, linkUrl: '/vsms/' },
      { label: '逾期', count: 0, linkUrl: '/vsms/' },
    ])
  })
})
