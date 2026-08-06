import { describe, it, expect } from 'vitest'
import {
  buildFilterOptions,
  buildInactiveValueSet,
  buildEngineerFilterOptions,
  buildEngineerInactiveValueSet,
  buildOptionLabels,
} from '../lib/filterOptions'
import type { ConfiguredOption, EngineerHolder, EngineerScheduleLike } from '../lib/filterOptions'

describe('buildFilterOptions', () => {
  it('啟用中的值會出現', () => {
    const configured: ConfiguredOption[] = [{ value: 'A', isActive: true }]
    expect(buildFilterOptions(configured, [])).toEqual(['A'])
  })

  it('已停用、但被排程參照的值仍會出現', () => {
    const configured: ConfiguredOption[] = [{ value: 'B', isActive: false }]
    expect(buildFilterOptions(configured, ['B'])).toEqual(['B'])
  })

  it('已停用、且無任何排程參照的值不會出現', () => {
    const configured: ConfiguredOption[] = [
      { value: 'B', isActive: false },
      { value: 'A', isActive: true },
    ]
    expect(buildFilterOptions(configured, [])).toEqual(['A'])
  })

  it('孤兒值（只存在於排程資料中，無對應設定）仍會出現', () => {
    const configured: ConfiguredOption[] = [{ value: 'A', isActive: true }]
    const result = buildFilterOptions(configured, ['ORPHAN'])
    expect(result).toContain('ORPHAN')
    expect(result).toContain('A')
  })

  it('結果不含重複值', () => {
    const configured: ConfiguredOption[] = [{ value: 'A', isActive: true }]
    const result = buildFilterOptions(configured, ['A', 'A', 'A'])
    expect(result).toEqual(['A'])
  })

  it('空字串不會被當成有效值收進來', () => {
    const configured: ConfiguredOption[] = [{ value: 'A', isActive: true }]
    const result = buildFilterOptions(configured, ['', 'A'])
    expect(result).toEqual(['A'])
  })
})

describe('buildInactiveValueSet', () => {
  it('只收錄有設定且 isActive=false 的值', () => {
    const configured: ConfiguredOption[] = [
      { value: 'A', isActive: true },
      { value: 'B', isActive: false },
    ]
    const set = buildInactiveValueSet(configured)
    expect(set.has('B')).toBe(true)
    expect(set.has('A')).toBe(false)
  })

  it('孤兒值不會出現在停用集合中（因為它根本不在 configured 裡）', () => {
    const configured: ConfiguredOption[] = [{ value: 'A', isActive: true }]
    const set = buildInactiveValueSet(configured)
    expect(set.has('ORPHAN')).toBe(false)
  })
})

describe('buildOptionLabels', () => {
  it('停用值加註「（已停用）」，其餘維持原樣（未提供 labelByValue 時退回原始 value）', () => {
    const labels = buildOptionLabels(['A', 'B', 'ORPHAN'], new Set(['B']))
    expect(labels.A).toBe('A')
    expect(labels.B).toBe('B（已停用）')
    expect(labels.ORPHAN).toBe('ORPHAN')
  })

  it('已設定的選項顯示目前的 label，而非 value（例如人員改名後 value 仍是舊識別碼，但顯示新名字）', () => {
    const labels = buildOptionLabels(
      ['emp-001', 'ORPHAN'],
      new Set(),
      { 'emp-001': '王小明' },
    )
    expect(labels['emp-001']).toBe('王小明')
  })

  it('孤兒值（不在任何設定中）沒有對應 label，顯示原始 value', () => {
    const labels = buildOptionLabels(
      ['emp-001', 'ORPHAN'],
      new Set(),
      { 'emp-001': '王小明' },
    )
    expect(labels.ORPHAN).toBe('ORPHAN')
  })

  it('已停用選項顯示「目前 label（改名後的新名字）＋（已停用）」，而非舊 value', () => {
    const labels = buildOptionLabels(
      ['emp-002'],
      new Set(['emp-002']),
      { 'emp-002': '李小華' },
    )
    expect(labels['emp-002']).toBe('李小華（已停用）')
  })
})

describe('buildFilterOptions 選項排序', () => {
  it('保留 configured 中啟用選項的原始順序，並將非設定值（含孤兒與已停用）以穩定、可預期的順序附加在後', () => {
    const configured: ConfiguredOption[] = [
      { value: 'Zeta', isActive: true },
      { value: 'Alpha', isActive: true },
      { value: 'Middle', isActive: false },
    ]
    // usedValues 刻意用與最終排序不同的掃描順序，確認附加部分不是「先出現先排」
    const usedValues = ['Orphan2', 'Middle', 'Orphan1']
    const result = buildFilterOptions(configured, usedValues)
    expect(result).toEqual(['Zeta', 'Alpha', 'Middle', 'Orphan1', 'Orphan2'])
  })
})

describe('buildEngineerFilterOptions', () => {
  const testUnits: EngineerHolder[] = [
    {
      value: 'UnitA',
      engineers: [
        { value: 'Alice', isActive: true },
        { value: 'Bob', isActive: false }, // 已停用，但底下會有排程參照
      ],
    },
    {
      value: 'UnitB',
      engineers: [
        { value: 'Carol', isActive: true },
      ],
    },
  ]
  const schedules: EngineerScheduleLike[] = [
    { testUnit: 'UnitA', testEngineer: 'Bob' },
    { testUnit: 'UnitB', testEngineer: 'Carol' },
    { testUnit: 'UnitA', testEngineer: 'Dave' }, // 孤兒：不在任何設定中
  ]

  it('未選取任何單位時，回傳所有單位中啟用中或有排程參照的人員', () => {
    const result = buildEngineerFilterOptions(testUnits, schedules, [])
    expect(new Set(result)).toEqual(new Set(['Alice', 'Bob', 'Carol', 'Dave']))
  })

  it('選取 UnitA 時，只回傳 UnitA 底下的人員（含孤兒與已停用者），不含 UnitB 的 Carol', () => {
    const result = buildEngineerFilterOptions(testUnits, schedules, ['UnitA'])
    expect(new Set(result)).toEqual(new Set(['Alice', 'Bob', 'Dave']))
    expect(result).not.toContain('Carol')
  })

  it('選取 UnitB 時，只回傳 UnitB 底下的人員', () => {
    const result = buildEngineerFilterOptions(testUnits, schedules, ['UnitB'])
    expect(result).toEqual(['Carol'])
  })
})

describe('buildEngineerInactiveValueSet', () => {
  const testUnits: EngineerHolder[] = [
    {
      value: 'UnitA',
      engineers: [
        { value: 'Alice', isActive: true },
        { value: 'Bob', isActive: false },
      ],
    },
    {
      value: 'UnitB',
      engineers: [
        { value: 'Eve', isActive: false },
      ],
    },
  ]

  it('narrow 到選取單位後才算停用集合', () => {
    const set = buildEngineerInactiveValueSet(testUnits, ['UnitA'])
    expect(set.has('Bob')).toBe(true)
    expect(set.has('Eve')).toBe(false)
  })

  it('未選取單位時涵蓋所有單位的停用人員', () => {
    const set = buildEngineerInactiveValueSet(testUnits, [])
    expect(set.has('Bob')).toBe(true)
    expect(set.has('Eve')).toBe(true)
  })
})
