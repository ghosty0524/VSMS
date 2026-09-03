import { describe, it, expect } from 'vitest'
import { daysUntil } from '../lib/excel'

/**
 * 這支測試存在的理由：
 *
 * excel.ts 原本自己實作 daysUntil，用 `new Date('2026-09-03')` 解析日期。
 * 那是 ISO 的「僅日期」格式，依規範解析為 UTC 午夜，而比較對象是本機午夜。
 * 在台北（UTC+8）差 8 小時，於是每個日期都多算一天。這份 Excel 是給
 * Copilot agent 讀的，數字錯一天會直接變成 agent 的錯誤回答，而且不會有
 * 任何測試或編譯錯誤提醒。
 *
 * 下面用固定的「今天」把邊界鎖住，特別是「即將到期」7 天視窗的兩端。
 */
describe('daysUntil（Agent Excel 的剩餘天數）', () => {
  const today = new Date(2026, 8, 3) // 2026/09/03 本機時間

  it('今日到期是 0 天，不是 1 天', () => {
    expect(daysUntil('2026/09/03', today)).toBe(0)
  })

  it('已經過期回傳負數', () => {
    expect(daysUntil('2026/09/02', today)).toBe(-1)
    expect(daysUntil('2026/08/27', today)).toBe(-7)
  })

  it('未來日期回傳正確天數', () => {
    expect(daysUntil('2026/09/04', today)).toBe(1)
    expect(daysUntil('2026/09/10', today)).toBe(7)
    expect(daysUntil('2026/09/11', today)).toBe(8)
  })

  // 「即將到期」的篩選條件是 days >= 0 && days <= 7。
  // 修正前這個視窗實際涵蓋的是「昨天到六天後」。
  it('7 天視窗的兩端：今天納入、7 天後納入、昨天排除、8 天後排除', () => {
    const inWindow = (d: string) => {
      const n = daysUntil(d, today)
      return n >= 0 && n <= 7
    }
    expect(inWindow('2026/09/02')).toBe(false) // 昨天，已逾期
    expect(inWindow('2026/09/03')).toBe(true)  // 今天到期
    expect(inWindow('2026/09/10')).toBe(true)  // 剛好 7 天後
    expect(inWindow('2026/09/11')).toBe(false) // 8 天後
  })

  it('跨月與跨年都正確', () => {
    expect(daysUntil('2026/10/03', new Date(2026, 8, 3))).toBe(30)
    expect(daysUntil('2027/01/01', new Date(2026, 11, 31))).toBe(1)
  })
})
