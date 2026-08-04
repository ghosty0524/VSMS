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

import { toTestUnitResponse, toTestUnitCreateData, toEngineerCreateData } from '../routes/optionsMapping.js'

describe('test unit and engineer color round-trip', () => {
  it('GET 映射帶出單位與工程師的 color', () => {
    const row = {
      id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, color: '#123456',
      engineers: [
        { id: 'e1', value: 'Willie', label: 'Willie', isActive: true, sortOrder: 0, color: '#abcdef' },
      ],
    }
    const out = toTestUnitResponse(row)
    expect(out.color).toBe('#123456')
    expect(out.engineers[0].color).toBe('#abcdef')
  })

  it('PUT 映射寫回 color', () => {
    const unit = {
      id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, color: '#123456',
      engineers: [],
    }
    expect(toTestUnitCreateData(unit).color).toBe('#123456')
    expect(toEngineerCreateData({
      id: 'e1', value: 'Willie', label: 'Willie', isActive: true, sortOrder: 0, color: '#abcdef',
    }).color).toBe('#abcdef')
  })

  it('未自訂顏色時寫入 null 而非 undefined', () => {
    const unit = { id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, engineers: [] }
    expect(toTestUnitCreateData(unit).color).toBeNull()
  })

  it('非法色碼一律落回 null，避免寫入垃圾值', () => {
    const unit = {
      id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 1,
      color: 'red', engineers: [],
    }
    expect(toTestUnitCreateData(unit).color).toBeNull()
  })
})
