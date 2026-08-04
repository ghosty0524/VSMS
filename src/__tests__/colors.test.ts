import { describe, it, expect } from 'vitest'
import {
  readableTextColor,
  deriveEngineerColor,
  resolveUnitColor,
  resolveEngineerColor,
  contrastRatio,
} from '../lib/colors'
import type { OptionsMap } from '../types'

function opts(over: Partial<OptionsMap> = {}): OptionsMap {
  return {
    categories: [],
    restDays: { weekends: true, specificDates: [] },
    devices: [],
    testUnits: [
      {
        id: 'u1', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0,
        engineers: [
          { id: 'e0', value: 'Eric',   label: 'Eric',   isActive: true, sortOrder: 0 },
          { id: 'e1', value: 'Darius', label: 'Darius', isActive: true, sortOrder: 1 },
        ],
      },
      {
        id: 'u2', value: 'RA', label: 'RA', isActive: true, sortOrder: 1,
        engineers: [
          { id: 'e2', value: 'Eric',   label: 'Eric',   isActive: true, sortOrder: 0 },
        ],
      },
    ],
    ...over,
  }
}

describe('readableTextColor', () => {
  it('亮橘底（RA 單位色）選深字', () => {
    expect(readableTextColor('#F5A623')).toBe('#1e293b')
  })

  it('近黑底選白字', () => {
    expect(readableTextColor('#111827')).toBe('#ffffff')
  })

  it('一律選對比較高的那一個', () => {
    for (const hex of ['#4A90D9', '#F472B6', '#9B59B6', '#86EFAC', '#ffffff', '#000000']) {
      const picked = readableTextColor(hex)
      const other = picked === '#ffffff' ? '#1e293b' : '#ffffff'
      expect(contrastRatio(hex, picked)).toBeGreaterThanOrEqual(contrastRatio(hex, other))
    }
  })
})

describe('deriveEngineerColor', () => {
  it('索引 0 與單位色完全相同', () => {
    expect(deriveEngineerColor('#4A90D9', 0).toLowerCase()).toBe('#4a90d9')
  })

  it('同單位不同索引產生相異顏色', () => {
    const colors = [0, 1, 2, 3].map(i => deriveEngineerColor('#4A90D9', i))
    expect(new Set(colors).size).toBe(4)
  })

  it('索引循環後不會超出色碼格式', () => {
    for (let i = 0; i < 20; i++) {
      expect(deriveEngineerColor('#4A90D9', i)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('resolveUnitColor', () => {
  it('未自訂時回退到內建單位色', () => {
    expect(resolveUnitColor('SIT-HW', opts()).toLowerCase()).toBe('#4a90d9')
  })

  it('自訂色優先於內建色', () => {
    const o = opts()
    o.testUnits[0].color = '#123456'
    expect(resolveUnitColor('SIT-HW', o)).toBe('#123456')
  })

  it('未知單位回退到 EXTRA_COLORS 而非崩潰', () => {
    expect(resolveUnitColor('NOPE', opts())).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('resolveEngineerColor', () => {
  it('未自訂時由所屬單位色衍生', () => {
    expect(resolveEngineerColor('Eric', 'SIT-HW', opts()).toLowerCase()).toBe('#4a90d9')
  })

  it('自訂色優先於衍生色', () => {
    const o = opts()
    o.testUnits[0].engineers[1].color = '#abcdef'
    expect(resolveEngineerColor('Darius', 'SIT-HW', o)).toBe('#abcdef')
  })

  it('同名工程師隸屬不同單位時，以 unitValue 配對取色', () => {
    const o = opts()
    o.testUnits[0].engineers[0].color = '#111111'
    o.testUnits[1].engineers[0].color = '#222222'
    expect(resolveEngineerColor('Eric', 'SIT-HW', o)).toBe('#111111')
    expect(resolveEngineerColor('Eric', 'RA', o)).toBe('#222222')
  })

  it('單位配對不到時退而以工程師名稱尋找所屬單位', () => {
    const o = opts()
    o.testUnits[0].engineers[1].color = '#abcdef'
    expect(resolveEngineerColor('Darius', '已刪除的單位', o)).toBe('#abcdef')
  })

  it('完全查無此人時回退到單位色而非崩潰', () => {
    expect(resolveEngineerColor('查無此人', 'SIT-HW', opts()).toLowerCase()).toBe('#4a90d9')
  })
})
