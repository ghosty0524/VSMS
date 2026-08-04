// src/__tests__/optionsErrors.test.ts
// 需求三（前端）：formatUnitDeleteError 要把「單位刪不掉」的脈絡接在後端的
// ENGINEER_IN_USE 原文前面，且不得竄改後端原文本身。
import { describe, it, expect } from 'vitest'
import { formatUnitDeleteError } from '../lib/optionsErrors'

describe('formatUnitDeleteError', () => {
  it('前綴點出是單位刪不掉，並完整保留後端原文', () => {
    const backendMessage = '「Alice_Wu」目前有 3 筆排程使用中，無法刪除。若該人員已離職，請改用「停用」。'
    const result = formatUnitDeleteError('RA', backendMessage)
    expect(result).toContain('RA')
    expect(result).toContain(backendMessage)
    expect(result.endsWith(backendMessage)).toBe(true)
  })

  it('不同單位名稱與後端訊息都能正確代入', () => {
    const backendMessage = '「Bob」目前有 1 筆排程使用中，無法刪除。若該人員已離職，請改用「停用」。'
    const result = formatUnitDeleteError('QA', backendMessage)
    expect(result).toBe(`無法刪除測試單位「QA」，因為其人員仍被排程引用：${backendMessage}`)
  })
})
