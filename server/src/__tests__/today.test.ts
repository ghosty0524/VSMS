import { describe, it, expect } from 'vitest'
import { todayTaipei } from '../lib/today.js'

describe('todayTaipei', () => {
  it('returns the Taiwan calendar date as YYYY/MM/DD', () => {
    // 2026-08-20T03:00:00Z = 2026/08/20 11:00 台灣時間
    expect(todayTaipei(new Date('2026-08-20T03:00:00Z'))).toBe('2026/08/20')
  })

  it('is still the next Taiwan day just after UTC 16:00', () => {
    // 2026-08-20T16:00:00Z = 2026/08/21 00:00 台灣時間
    expect(todayTaipei(new Date('2026-08-20T16:00:00Z'))).toBe('2026/08/21')
  })

  it('is still the same Taiwan day just before UTC 16:00', () => {
    // 2026-08-20T15:59:00Z = 2026/08/20 23:59 台灣時間
    expect(todayTaipei(new Date('2026-08-20T15:59:00Z'))).toBe('2026/08/20')
  })
})
