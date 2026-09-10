// src/lib/allowedUnitsExpand.ts
//
// 管轄單位（users.allowedUnits）存的是葉單位 label 陣列，後端所有判斷都是
// allowedUnits.includes(schedule.testUnit)。這裡只讓 UI 可以「勾整個部門」，
// 存值前展開成葉單位；儲存格式不變，後端零改動。
import type { TestUnitOption } from '../types'
import { departmentOf } from './orgGroups'

export interface DeptUnits { department: string; unitLabels: string[]; isSingleLevel: boolean }
export type DeptCheckState = 'all' | 'some' | 'none'

export function groupUnitLabelsByDepartment(testUnits: TestUnitOption[]): DeptUnits[] {
  const active = testUnits.filter(u => u.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  const map = new Map<string, TestUnitOption[]>()
  for (const unit of active) {
    const key = departmentOf(unit)
    const list = map.get(key) ?? []
    list.push(unit)
    map.set(key, list)
  }
  return [...map].map(([department, units]) => ({
    department,
    unitLabels: units.map(u => u.label),
    isSingleLevel: units.length === 1 && !(units[0].department ?? '').trim(),
  }))
}

export function deptCheckState(selected: string[], unitLabels: string[]): DeptCheckState {
  if (unitLabels.length === 0) return 'none'
  const n = unitLabels.filter(l => selected.includes(l)).length
  return n === 0 ? 'none' : n === unitLabels.length ? 'all' : 'some'
}

export function toggleDepartment(selected: string[], unitLabels: string[]): string[] {
  if (deptCheckState(selected, unitLabels) === 'all') return selected.filter(l => !unitLabels.includes(l))
  return [...selected, ...unitLabels.filter(l => !selected.includes(l))]
}

export function toggleUnit(selected: string[], label: string): string[] {
  return selected.includes(label) ? selected.filter(l => l !== label) : [...selected, label]
}
