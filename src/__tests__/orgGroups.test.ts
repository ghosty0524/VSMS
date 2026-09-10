// src/__tests__/orgGroups.test.ts
// 部 → 課分組與部級上浮。規則：同一部門內出現在 >1 個課的人列在部級一次；
// 跨兩個部門的人在兩個部各列一次；department 為 NULL 的單位自成一部。
import { describe, it, expect } from 'vitest'
import { groupByDepartment, departmentOf } from '../lib/orgGroups'
import type { Person, PersonGroup } from '../lib/peopleRows'
import type { TestUnitOption } from '../types'

const u = (id: string, label: string, sortOrder: number, department: string | null): TestUnitOption =>
  ({ id, value: label, label, isActive: true, sortOrder, color: null, department, engineers: [] })
const p = (name: string): Person => ({ name, label: name, memberships: [], rosterActive: true, account: null })
const g = (unitId: string, unitLabel: string, names: string[]): PersonGroup => ({ unitId, unitLabel, people: names.map(p) })

const units = [u('u-hw', 'SIT-HW', 0, 'SIT'), u('u-sw', 'SIT-SW', 1, 'SIT'), u('u-ra', 'RA', 2, null), u('u-si', 'SI', 3, null)]
const groups = [
  g('u-hw', 'SIT-HW', ['Rock_Cai', 'Ericct_Hsieh']),
  g('u-sw', 'SIT-SW', ['Ericct_Hsieh', 'Nervo_Kuo', 'Will_Wang']),
  g('u-ra', 'RA', ['Will_Wang', 'Lily_Lee']),
  g('u-si', 'SI', ['Brian_Kuo']),
]

describe('departmentOf', () => {
  it('有 department 用它（trim），沒有就用單位 label', () => {
    expect(departmentOf({ label: 'SIT-HW', department: ' SIT ' })).toBe('SIT')
    expect(departmentOf({ label: 'RA', department: null })).toBe('RA')
    expect(departmentOf({ label: 'RA' })).toBe('RA')
    expect(departmentOf({ label: 'RA', department: '   ' })).toBe('RA')
  })
})

describe('groupByDepartment', () => {
  it('部門依第一個葉單位的 sortOrder 排序，SIT 兩層、RA 與 SI 單層', () => {
    const d = groupByDepartment(groups, units)
    expect(d.map(x => [x.department, x.isSingleLevel])).toEqual([['SIT', false], ['RA', true], ['SI', true]])
    expect(d[0].sections.map(s => s.unitLabel)).toEqual(['SIT-HW', 'SIT-SW'])
  })

  it('同部門跨課的人上浮到部級一次，不再在各課重複', () => {
    const sit = groupByDepartment(groups, units)[0]
    expect(sit.deptLevel.map(x => x.name)).toEqual(['Ericct_Hsieh'])
    expect(sit.sections[0].people.map(x => x.name)).toEqual(['Rock_Cai'])
    expect(sit.sections[1].people.map(x => x.name)).toEqual(['Nervo_Kuo', 'Will_Wang'])
  })

  it('跨兩個部門的人在兩個部各列一次', () => {
    const d = groupByDepartment(groups, units)
    expect(d[0].sections[1].people.some(x => x.name === 'Will_Wang')).toBe(true)
    expect(d[1].sections[0].people.some(x => x.name === 'Will_Wang')).toBe(true)
    expect(d[0].deptLevel.some(x => x.name === 'Will_Wang')).toBe(false)
  })

  it('單層部門：sections 只有一個、deptLevel 為空', () => {
    const ra = groupByDepartment(groups, units)[1]
    expect(ra.sections).toHaveLength(1)
    expect(ra.deptLevel).toEqual([])
    expect(ra.sections[0].people.map(x => x.name)).toEqual(['Will_Wang', 'Lily_Lee'])
  })

  it('department 全為 NULL（舊後端）→ 每個單位自成一部', () => {
    const flat = units.map(x => ({ ...x, department: null }))
    const d = groupByDepartment(groups, flat)
    expect(d.map(x => x.department)).toEqual(['SIT-HW', 'SIT-SW', 'RA', 'SI'])
    expect(d.every(x => x.isSingleLevel)).toBe(true)
    expect(d[1].sections[0].people.map(x => x.name)).toEqual(['Ericct_Hsieh', 'Nervo_Kuo', 'Will_Wang'])
  })

  it('輸入 groups 沒有的單位不出現（停用區塊只傳有人的組）', () => {
    const d = groupByDepartment([g('u-sw', 'SIT-SW', ['Nervo_Kuo'])], units)
    expect(d).toHaveLength(1)
    expect(d[0].department).toBe('SIT')
    expect(d[0].sections.map(s => s.unitLabel)).toEqual(['SIT-SW'])
  })

  it('unitId 為 null 的組被忽略', () => {
    const d = groupByDepartment([{ unitId: null, unitLabel: '無單位', people: [p('admin')] }, ...groups], units)
    expect(d.flatMap(x => [...x.deptLevel, ...x.sections.flatMap(s => s.people)]).some(x => x.name === 'admin')).toBe(false)
  })

  it('同一部門只有一個課有人時，那個人不上浮', () => {
    const d = groupByDepartment([g('u-hw', 'SIT-HW', ['Ericct_Hsieh'])], units)
    expect(d[0].deptLevel).toEqual([])
    expect(d[0].sections[0].people.map(x => x.name)).toEqual(['Ericct_Hsieh'])
  })

  it('單位 label 與另一單位的 department 同名時合併成一個部（label 那個單位成為課）', () => {
    const mixed = [u('u-ra', 'RA', 0, null), u('u-lab', 'RA-Lab', 1, 'RA')]
    const d = groupByDepartment([g('u-ra', 'RA', ['Will_Wang']), g('u-lab', 'RA-Lab', ['Will_Wang', 'Lily_Lee'])], mixed)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ department: 'RA', isSingleLevel: false })
    expect(d[0].sections.map(s => s.unitLabel)).toEqual(['RA', 'RA-Lab'])
    expect(d[0].deptLevel.map(x => x.name)).toEqual(['Will_Wang'])
    expect(d[0].sections[1].people.map(x => x.name)).toEqual(['Lily_Lee'])
  })
})
