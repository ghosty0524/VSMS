import { describe, it, expect } from 'vitest'
import { isRestDay } from '../lib/restDays'

describe('isRestDay（前端）', () => {
  it('週六日一律是休息日，不看 weekends 開關', () => {
    const cfg = { weekends: false, specificDates: [] as string[] }
    expect(isRestDay(new Date(2026, 9, 3), cfg)).toBe(true)  // 週六
    expect(isRestDay(new Date(2026, 9, 4), cfg)).toBe(true)  // 週日
    expect(isRestDay(new Date(2026, 9, 5), cfg)).toBe(false) // 週一
  })
  it('清單裡的日期是休息日', () => {
    expect(isRestDay(new Date(2026, 9, 9), { specificDates: ['2026/10/09'] })).toBe(true)
  })
})
