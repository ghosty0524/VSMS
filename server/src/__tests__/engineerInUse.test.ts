// server/src/__tests__/engineerInUse.test.ts
// 需求三：刪除仍被引用的人員時擋下。PUT /api/options 是全刪重建（不在 body
// 中即等同刪除），因此檢查必須放在該路由的交易之前。這兩個純函式把「找出
// 被引用但即將消失的人員」與「組出錯誤訊息」抽出來，讓不變式可被測試守住。
import { describe, it, expect } from 'vitest'
import { findMissingReferencedEngineers, formatEngineerInUseMessage } from '../lib/engineerInUse.js'

describe('findMissingReferencedEngineers', () => {
  it('被引用的值不在 body 中時回報', () => {
    const result = findMissingReferencedEngineers(
      ['Ben_Ko', 'Ben_Ko', 'Alice_Wu'],
      ['Alice_Wu'],
    )
    expect(result).toEqual([{ value: 'Ben_Ko', count: 2 }])
  })

  it('未被引用者可正常移除（body 中沒有也不報）', () => {
    const result = findMissingReferencedEngineers(
      ['Alice_Wu'],
      ['Alice_Wu'],
    )
    expect(result).toEqual([])
  })

  it('空字串 testEngineer 不誤判為引用', () => {
    const result = findMissingReferencedEngineers(
      ['', '', 'Alice_Wu'],
      ['Alice_Wu'],
    )
    expect(result).toEqual([])
  })

  it('多位被引用者不在 body 中時，各自回報並統計筆數', () => {
    const result = findMissingReferencedEngineers(
      ['Ben_Ko', 'Carl_Lee', 'Carl_Lee', 'Carl_Lee'],
      [],
    )
    expect(result).toEqual([
      { value: 'Ben_Ko', count: 1 },
      { value: 'Carl_Lee', count: 3 },
    ])
  })

  it('body 為空且沒有排程引用時不報', () => {
    expect(findMissingReferencedEngineers([], [])).toEqual([])
  })
})

describe('formatEngineerInUseMessage', () => {
  it('單一人員時符合規格範例訊息', () => {
    const msg = formatEngineerInUseMessage([{ value: 'Ben_Ko', count: 18 }])
    expect(msg).toBe('「Ben_Ko」目前有 18 筆排程使用中，無法刪除。若該人員已離職，請改用「停用」。')
  })

  it('多位人員時各自列出名稱與筆數', () => {
    const msg = formatEngineerInUseMessage([
      { value: 'Ben_Ko', count: 18 },
      { value: 'Carl_Lee', count: 3 },
    ])
    expect(msg).toContain('「Ben_Ko」目前有 18 筆排程使用中')
    expect(msg).toContain('「Carl_Lee」目前有 3 筆排程使用中')
    expect(msg).toContain('停用')
  })
})
