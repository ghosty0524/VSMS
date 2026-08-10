import { describe, it, expect } from 'vitest'
import { matchesKeyword } from '../lib/scheduleKeywordMatch'
import type { Schedule } from '../types'

function makeSchedule(over: Partial<Schedule>): Schedule {
  return {
    id: '1', category: 'NPI', projectName: 'P', taskDescription: '', testUnit: 'SIT-HW',
    testEngineer: 'eric', timeResource: 5, startDate: '2026/01/05', endDate: '2026/01/09',
    requiredPersonnel: '', testReport: '', isCompleted: false, isDelayed: false,
    isCancelled: false, completedAt: null, delayReason: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '',
    adminFlag: false, adminFlagNote: '', userFlag: false, userFlagNote: '', device: '',
    ...over,
  }
}

const identityLabel = (v: string) => v

describe('matchesKeyword', () => {
  it('可用 testEngineer 存的 value 比對到', () => {
    const s = makeSchedule({ testEngineer: 'eric' })
    expect(matchesKeyword(s, 'eric', identityLabel)).toBe(true)
  })

  it('改名後可用目前的 label 比對到（value 與 label 不同）', () => {
    const s = makeSchedule({ testEngineer: 'eric' })
    const resolveLabel = (v: string) => (v === 'eric' ? 'Eric Wang' : v)
    expect(matchesKeyword(s, 'Wang', resolveLabel)).toBe(true)
  })

  it('大小寫不敏感', () => {
    const s = makeSchedule({ testEngineer: 'eric' })
    const resolveLabel = (v: string) => (v === 'eric' ? 'Eric Wang' : v)
    expect(matchesKeyword(s, 'ERIC WANG', resolveLabel)).toBe(true)
    expect(matchesKeyword(s, 'eric', resolveLabel)).toBe(true)
  })

  it('關鍵字命中既有的其他欄位（projectName）仍會比對到', () => {
    const s = makeSchedule({ projectName: 'ProjectAlpha' })
    expect(matchesKeyword(s, 'alpha', identityLabel)).toBe(true)
  })

  it('空字串（或全空白）關鍵字比對所有排程', () => {
    const s = makeSchedule({})
    expect(matchesKeyword(s, '', identityLabel)).toBe(true)
    expect(matchesKeyword(s, '   ', identityLabel)).toBe(true)
  })

  it('testEngineer 無對應 label 設定時，退回比對原始 value，不會重複比對或出錯', () => {
    const s = makeSchedule({ testEngineer: 'orphan-id' })
    const resolveLabel = (v: string) => v // 未設定時的常見實作：找不到就退回原始 value
    expect(matchesKeyword(s, 'orphan-id', resolveLabel)).toBe(true)
    expect(matchesKeyword(s, 'nomatch', resolveLabel)).toBe(false)
  })

  it('關鍵字不存在於任何欄位時回傳 false', () => {
    const s = makeSchedule({})
    expect(matchesKeyword(s, 'zzz-not-present-zzz', identityLabel)).toBe(false)
  })
})
