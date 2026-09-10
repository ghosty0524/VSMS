// src/lib/orgGroups.ts
//
// 人員頁的「部 → 課」分組。「部」只是 test_units.department 這個標籤，NULL 代表
// 這個單位自己就是一個部。排程、名冊、篩選、統計全部維持以葉單位為準；這裡
// 只決定畫面怎麼排。
//
// 部級上浮規則（可測、不是猜測）：同一部門內出現在 >1 個課的人列在部級一次，
// 不再在各課重複；跨兩個部門的人在兩個部各列一次，因為那是兩個部。
import type { TestUnitOption } from '../types'
import type { Person, PersonGroup } from './peopleRows'

export interface SectionGroup { unitId: string; unitLabel: string; people: Person[] }

export interface DeptGroup {
  department: string
  /** 只有一個葉單位且 department 為 NULL：畫成一層卡片 */
  isSingleLevel: boolean
  deptLevel: Person[]
  sections: SectionGroup[]
}

export function departmentOf(unit: Pick<TestUnitOption, 'label' | 'department'>): string {
  const d = (unit.department ?? '').trim()
  return d || unit.label
}

export function groupByDepartment(groups: PersonGroup[], testUnits: TestUnitOption[]): DeptGroup[] {
  const byUnitId = new Map(groups.filter(g => g.unitId !== null).map(g => [g.unitId as string, g]))
  const sortedUnits = [...testUnits].sort((a, b) => a.sortOrder - b.sortOrder).filter(u => byUnitId.has(u.id))

  // 部門依第一個葉單位出現的順序
  const depts = new Map<string, TestUnitOption[]>()
  for (const unit of sortedUnits) {
    const key = departmentOf(unit)
    const list = depts.get(key) ?? []
    list.push(unit)
    depts.set(key, list)
  }

  const result: DeptGroup[] = []
  for (const [department, units] of depts) {
    const isSingleLevel = units.length === 1 && !(units[0].department ?? '').trim()
    // 每個人在這個部門的幾個課裡出現
    const seen = new Map<string, { person: Person; count: number }>()
    for (const unit of units) {
      for (const person of byUnitId.get(unit.id)!.people) {
        const entry = seen.get(person.name)
        if (entry) entry.count += 1
        else seen.set(person.name, { person, count: 1 })
      }
    }
    const deptLevel = [...seen.values()].filter(e => e.count > 1).map(e => e.person)
    const lifted = new Set(deptLevel.map(p => p.name))
    const sections: SectionGroup[] = units.map(unit => {
      const g = byUnitId.get(unit.id)!
      return { unitId: unit.id, unitLabel: unit.label, people: g.people.filter(p => !lifted.has(p.name)) }
    })
    result.push({ department, isSingleLevel, deptLevel, sections })
  }
  return result
}
