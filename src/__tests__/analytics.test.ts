import { describe, it, expect } from 'vitest'
import {
  periodKey, parseYmd, isOverdue, statusCounts, dueCompletionRate,
  allocateTimeResource, daysBetweenYmd,
} from '../lib/analytics'
import type { Schedule, RestDaysConfig } from '../types'

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
const noRest: RestDaysConfig = { weekends: false, specificDates: [] }
const weekendRest: RestDaysConfig = { weekends: true, specificDates: [] }

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

describe('allocateTimeResource', () => {
  it('splits by working-day overlap across months (no rest days)', () => {
    // 2026/06/22–2026/07/03 共 12 天：6 月 9 天、7 月 3 天，timeResource 10
    const alloc = allocateTimeResource(makeSchedule({}), 'month', noRest)
    expect(alloc['2026/06']).toBeCloseTo(10 * 9 / 12, 5)
    expect(alloc['2026/07']).toBeCloseTo(10 * 3 / 12, 5)
  })
  it('skips weekends when weekends rest is on', () => {
    // 2026/06/22(一)–2026/06/26(五) 全為工作天 → 全數歸 6 月
    const alloc = allocateTimeResource(
      makeSchedule({ startDate: '2026/06/22', endDate: '2026/06/26', timeResource: 5 }),
      'month', weekendRest,
    )
    expect(alloc['2026/06']).toBeCloseTo(5, 5)
    expect(Object.keys(alloc)).toHaveLength(1)
  })
  it('falls back to start period when span has zero working days', () => {
    // 2026/06/27(六)–2026/06/28(日) 全為休息日
    const alloc = allocateTimeResource(
      makeSchedule({ startDate: '2026/06/27', endDate: '2026/06/28', timeResource: 3 }),
      'month', weekendRest,
    )
    expect(alloc).toEqual({ '2026/06': 3 })
  })
  it('allocations sum to timeResource', () => {
    const alloc = allocateTimeResource(makeSchedule({}), 'quarter', weekendRest)
    const sum = Object.values(alloc).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(10, 5)
  })
})

describe('daysBetweenYmd', () => {
  it('computes day difference', () => {
    expect(daysBetweenYmd('2026/07/10', '2026/07/16')).toBe(6)
  })
})
