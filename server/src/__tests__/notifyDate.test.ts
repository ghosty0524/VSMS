import { describe, it, expect } from 'vitest'
import { computeSendDate, isRestDay, addDays, daysBetween } from '../lib/notifyDate.js'

const weekendsOnly = { weekends: true, specificDates: [] as string[] }
const noRest = { weekends: false, specificDates: [] as string[] }

describe('addDays', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(addDays('2026/08/31', 1)).toBe('2026/09/01')
    expect(addDays('2026/09/01', -1)).toBe('2026/08/31')
  })
  it('moves across a year boundary', () => {
    expect(addDays('2027/01/01', -1)).toBe('2026/12/31')
  })
  it('handles a leap day', () => {
    expect(addDays('2028/02/28', 1)).toBe('2028/02/29')
  })
})

describe('daysBetween', () => {
  it('counts whole days forward across a month boundary', () => {
    expect(daysBetween('2026/08/21', '2026/09/02')).toBe(12)
  })
  it('returns 0 for the same day and a negative count going backwards', () => {
    expect(daysBetween('2026/08/21', '2026/08/21')).toBe(0)
    expect(daysBetween('2026/08/24', '2026/08/21')).toBe(-3)
  })
})

describe('isRestDay', () => {
  it('treats Saturday and Sunday as rest days when weekends is on', () => {
    expect(isRestDay('2026/08/22', weekendsOnly)).toBe(true)  // 週六
    expect(isRestDay('2026/08/23', weekendsOnly)).toBe(true)  // 週日
    expect(isRestDay('2026/08/21', weekendsOnly)).toBe(false) // 週五
  })
  it('ignores weekends when the flag is off', () => {
    expect(isRestDay('2026/08/22', noRest)).toBe(false)
  })
  it('treats a listed specific date as a rest day regardless of the weekend flag', () => {
    expect(isRestDay('2026/08/21', { weekends: false, specificDates: ['2026/08/21'] })).toBe(true)
  })
})

describe('computeSendDate', () => {
  it('subtracts calendar days when the result is a workday', () => {
    // 2026/08/24 是週一 → 減 3 天 = 08/21 週五，是工作日
    expect(computeSendDate('2026/08/24', 3, weekendsOnly)).toBe('2026/08/21')
  })

  it('steps back off a weekend', () => {
    // 2026/08/26 是週三 → 減 3 天 = 08/23 週日 → 往前挪到 08/21 週五
    expect(computeSendDate('2026/08/26', 3, weekendsOnly)).toBe('2026/08/21')
  })

  it('steps back past a consecutive holiday block', () => {
    // 08/21(五) 與 08/20(四) 都是特定休息日 → 一路挪到 08/19(三)
    const settings = { weekends: true, specificDates: ['2026/08/20', '2026/08/21'] }
    expect(computeSendDate('2026/08/26', 3, settings)).toBe('2026/08/19')
  })

  it('does not step back at all when weekends are not rest days', () => {
    expect(computeSendDate('2026/08/26', 3, noRest)).toBe('2026/08/23')
  })

  it('crosses a year boundary', () => {
    expect(computeSendDate('2027/01/04', 3, noRest)).toBe('2027/01/01')
  })

  it('returns null when every candidate day within the cap is a rest day', () => {
    // 從 2026/08/23 起往前 40 天全部列為休息日 → 超過 30 天上限
    const dates: string[] = []
    let d = '2026/08/23'
    for (let i = 0; i < 40; i++) { dates.push(d); d = addDays(d, -1) }
    expect(computeSendDate('2026/08/26', 3, { weekends: true, specificDates: dates })).toBeNull()
  })
})
