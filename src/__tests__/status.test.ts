import { describe, it, expect } from 'vitest'
import { computeStatus } from '../lib/status'
import type { Schedule } from '../types'

function makeSchedule(over: Partial<Schedule>): Schedule {
  return {
    id: '1', category: 'NPI', projectName: 'P', taskDescription: '', testUnit: 'SIT-HW',
    testEngineer: 'Eric', timeResource: 5, startDate: '2026/01/05', endDate: '2026/01/09',
    requiredPersonnel: '', testReport: '', isCompleted: false, isDelayed: false,
    isCancelled: false, completedAt: null, delayReason: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
    ...over,
  }
}

describe('computeStatus with Cancelled', () => {
  it('Cancelled overrides Delayed', () => {
    expect(computeStatus(makeSchedule({ isCancelled: true, isDelayed: true }))).toBe('Cancelled')
  })
  it('Cancelled overrides Testing/Planned', () => {
    expect(computeStatus(makeSchedule({ isCancelled: true }))).toBe('Cancelled')
  })
  it('Completed still wins over Delayed when not cancelled', () => {
    expect(computeStatus(makeSchedule({ isCompleted: true, isDelayed: true }))).toBe('Completed')
  })
  it('past-start uncompleted schedule stays Testing', () => {
    expect(computeStatus(makeSchedule({}))).toBe('Testing')
  })
  it('future schedule is Planned', () => {
    const future = new Date(); future.setDate(future.getDate() + 30)
    const ymd = `${future.getFullYear()}/${String(future.getMonth() + 1).padStart(2, '0')}/${String(future.getDate()).padStart(2, '0')}`
    expect(computeStatus(makeSchedule({ startDate: ymd }))).toBe('Planned')
  })
})
