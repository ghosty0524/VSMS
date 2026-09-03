import { describe, it, expect } from 'vitest'
import { overdueDays } from '../lib/status'
import type { Schedule } from '../types'

/**
 * 逾期天數餵給甘特圖的「逾期尾巴」—— 尾巴從 bar 右緣量到今日線。
 *
 * 這裡守的是「逾期」與「延遲」不可合併：後端 integration.ts 把 overdue
 * 與 flaggedDelayed 分成兩個欄位回報給 Agent，前端若把 isDelayed 併進
 * 逾期判定，畫面與 Agent 的數字就會對不起來。
 */
function make(p: Partial<Schedule>): Schedule {
  return {
    id: 'x', projectName: 'PDN-260001', taskDescription: '', category: 'NPI',
    testUnit: 'SIT-HW', testEngineer: 'someone', device: '',
    startDate: '2026/08/01', endDate: '2026/08/20', timeResource: 5,
    requiredPersonnel: '', testReport: '', delayReason: '',
    isCompleted: false, isDelayed: false, isCancelled: false,
    adminFlag: false, userFlag: false, adminFlagNote: '', userFlagNote: '',
    ...p,
  } as Schedule
}

const TODAY = new Date(2026, 8, 3) // 2026/09/03

describe('overdueDays', () => {
  it('已過完成日且未結案 → 回傳天數', () => {
    expect(overdueDays(make({ endDate: '2026/08/27' }), TODAY)).toBe(7)
  })

  it('完成日就是今天 → 還沒逾期', () => {
    expect(overdueDays(make({ endDate: '2026/09/03' }), TODAY)).toBe(0)
  })

  it('完成日還沒到 → 0', () => {
    expect(overdueDays(make({ endDate: '2026/10/01' }), TODAY)).toBe(0)
  })

  it('已勾 Completed 就不算逾期，不管日期過多久', () => {
    expect(overdueDays(make({ endDate: '2026/01/01', isCompleted: true }), TODAY)).toBe(0)
  })

  it('已取消不算逾期', () => {
    expect(overdueDays(make({ endDate: '2026/01/01', isCancelled: true }), TODAY)).toBe(0)
  })

  it('被標記 Delayed 但完成日還沒到 → 不算逾期', () => {
    expect(overdueDays(make({ endDate: '2026/10/01', isDelayed: true }), TODAY)).toBe(0)
  })

  it('逾期但沒被標記 Delayed → 仍算逾期', () => {
    expect(overdueDays(make({ endDate: '2026/08/20', isDelayed: false }), TODAY)).toBe(14)
  })

  it('兩者同時成立時各自為政，不相加也不互相取消', () => {
    const s = make({ endDate: '2026/08/20', isDelayed: true })
    expect(overdueDays(s, TODAY)).toBe(14)
    expect(s.isDelayed).toBe(true)
  })

  it('endDate 空字串不崩潰', () => {
    expect(overdueDays(make({ endDate: '' }), TODAY)).toBe(0)
  })

  it('跨月與跨年都用日曆天計算', () => {
    expect(overdueDays(make({ endDate: '2025/12/25' }), TODAY)).toBe(252)
  })
})
