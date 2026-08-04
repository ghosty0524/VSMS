import { describe, it, expect } from 'vitest'
import type { OptionsMap, CategoryStatsMode } from '../types.js'

// PUT /api/options 是全刪重建，任何未被映射帶過去的欄位都會被靜默重設為預設值。
// 這兩個純函式把「GET 的映射」與「PUT 的映射」抽出來，讓不變式可被測試守住。
import { toCategoryResponse, toCategoryCreateData, normalizeStatsMode } from '../routes/optionsMapping.js'

describe('categories options round-trip', () => {
  it('GET 映射帶出 statsMode', () => {
    const row = {
      id: 'c1', value: '出國', label: '出國', isActive: true, sortOrder: 3,
      statsMode: 'workload_only',
    }
    expect(toCategoryResponse(row)).toEqual({
      id: 'c1', value: '出國', label: '出國', isActive: true, sortOrder: 3,
      statsMode: 'workload_only',
    })
  })

  it('GET 映射遇到缺漏或非法的 statsMode 時退回 counted 而非帶出垃圾值', () => {
    const baseRow = {
      id: 'c1', value: 'NPI', label: 'NPI', isActive: true, sortOrder: 0,
    }

    // 缺漏的 statsMode 欄位應退回 counted
    const missingRow = {
      ...baseRow,
    } as any
    expect(toCategoryResponse(missingRow).statsMode).toBe('counted')

    // 非法的 statsMode 值應退回 counted
    const bogusRow = {
      ...baseRow,
      statsMode: 'nonsense',
    }
    expect(toCategoryResponse(bogusRow).statsMode).toBe('counted')
  })

  it('PUT 映射寫回 statsMode', () => {
    const input: OptionsMap['categories'][number] = {
      id: 'c1', value: '出國', label: '出國', isActive: true, sortOrder: 3,
      statsMode: 'excluded' as CategoryStatsMode,
    }
    expect(toCategoryCreateData(input).statsMode).toBe('excluded')
  })

  it('PUT 映射遇到缺漏或非法的 statsMode 時退回 counted 而非寫入垃圾值', () => {
    const input = {
      id: 'c1', value: 'NPI', label: 'NPI', isActive: true, sortOrder: 0,
    } as OptionsMap['categories'][number]
    expect(toCategoryCreateData(input).statsMode).toBe('counted')

    const bogus = { ...input, statsMode: 'nonsense' as CategoryStatsMode }
    expect(toCategoryCreateData(bogus).statsMode).toBe('counted')
  })

  it('normalizeStatsMode 已匯出，供其他路由重用同一份驗證邏輯', () => {
    expect(normalizeStatsMode('workload_only')).toBe('workload_only')
    expect(normalizeStatsMode('nonsense')).toBe('counted')
    expect(normalizeStatsMode(undefined)).toBe('counted')
  })
})
