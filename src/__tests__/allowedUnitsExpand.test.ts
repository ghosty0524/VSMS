// src/__tests__/allowedUnitsExpand.test.ts
// 管轄單位選擇器可以勾整個部門，但存進 allowedUnits 的永遠是葉單位 label，
// 後端零改動。
import { describe, it, expect } from 'vitest'
import { groupUnitLabelsByDepartment, deptCheckState, toggleDepartment, toggleUnit } from '../lib/allowedUnitsExpand'
import type { TestUnitOption } from '../types'

const u = (id: string, label: string, sortOrder: number, department: string | null, isActive = true): TestUnitOption =>
  ({ id, value: label, label, isActive, sortOrder, color: null, department, engineers: [] })
const units = [u('u-hw', 'SIT-HW', 0, 'SIT'), u('u-sw', 'SIT-SW', 1, 'SIT'), u('u-ra', 'RA', 2, null), u('u-old', 'OLD', 3, null, false)]

describe('groupUnitLabelsByDepartment', () => {
  it('依部門分組、只含啟用單位、單層旗標', () => {
    expect(groupUnitLabelsByDepartment(units)).toEqual([
      { department: 'SIT', unitLabels: ['SIT-HW', 'SIT-SW'], isSingleLevel: false },
      { department: 'RA', unitLabels: ['RA'], isSingleLevel: true },
    ])
  })
})

describe('deptCheckState', () => {
  it('all / some / none', () => {
    expect(deptCheckState(['SIT-HW', 'SIT-SW'], ['SIT-HW', 'SIT-SW'])).toBe('all')
    expect(deptCheckState(['SIT-HW'], ['SIT-HW', 'SIT-SW'])).toBe('some')
    expect(deptCheckState(['RA'], ['SIT-HW', 'SIT-SW'])).toBe('none')
    expect(deptCheckState([], [])).toBe('none')
  })
})

describe('toggleDepartment', () => {
  it('未全選 → 補齊（不重複、保留其他部門）', () => {
    expect(toggleDepartment(['RA', 'SIT-HW'], ['SIT-HW', 'SIT-SW'])).toEqual(['RA', 'SIT-HW', 'SIT-SW'])
  })
  it('已全選 → 全部移除', () => {
    expect(toggleDepartment(['RA', 'SIT-HW', 'SIT-SW'], ['SIT-HW', 'SIT-SW'])).toEqual(['RA'])
  })
})

describe('toggleUnit', () => {
  it('加入與移除', () => {
    expect(toggleUnit(['RA'], 'SIT-HW')).toEqual(['RA', 'SIT-HW'])
    expect(toggleUnit(['RA', 'SIT-HW'], 'SIT-HW')).toEqual(['RA'])
  })
})
