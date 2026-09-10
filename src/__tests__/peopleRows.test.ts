// src/__tests__/peopleRows.test.ts
// 「人員」分頁的身分模型：一個名字就是一個人。名冊以 engineer.value 為鍵、
// 帳號以 username 為鍵，同名即同一人，不分角色。
import { describe, it, expect } from 'vitest'
import { buildPeopleModel, isPersonInactive, roleLabel, type SafeUser, type Person } from '../lib/peopleRows'
import type { TestUnitOption } from '../types'

const units: TestUnitOption[] = [
  {
    id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null,
    engineers: [
      { id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null },
      { id: 'e2', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 1, color: '#112233' },
      { id: 'e3', value: 'Ben_Ko', label: 'Ben_Ko', isActive: false, sortOrder: 2, color: null },
    ],
  },
  {
    id: 'u-sw', value: 'SIT-SW', label: 'SIT-SW', isActive: true, sortOrder: 1, color: null,
    engineers: [
      { id: 'e4', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 0, color: null },
      { id: 'e5', value: 'Nervo_Kuo', label: 'Nervo_Kuo', isActive: true, sortOrder: 1, color: null },
    ],
  },
]

function user(over: Partial<SafeUser> & { username: string }): SafeUser {
  return {
    id: 'id-' + over.username, displayName: over.username, role: 'user', isActive: true, allowedUnits: [],
    linkedEngineer: '', createdAt: '2026-01-01T00:00:00Z', lastLoginAt: '',
    canLinkVtms: false, canViewVtmsProgress: false,
    ...over,
  }
}

const findPerson = (groups: { people: Person[] }[], name: string): Person | undefined =>
  groups.flatMap(g => g.people).find(p => p.name === name)

describe('buildPeopleModel', () => {
  it('同名多單位合併成一人，memberships 依單位順序', () => {
    const m = buildPeopleModel(units, [])
    const ericct = findPerson(m.active, 'Ericct_Hsieh')!
    expect(ericct.memberships.map(x => x.unitValue)).toEqual(['SIT-HW', 'SIT-SW'])
    expect(ericct.memberships[0].engineer.color).toBe('#112233')
  })

  it('啟用清單依單位分組，一人多單位時每個單位都列他', () => {
    const m = buildPeopleModel(units, [])
    expect(m.active.map(g => g.unitLabel)).toEqual(['SIT-HW', 'SIT-SW'])
    expect(m.active[0].people.map(p => p.name)).toEqual(['Rock_Cai', 'Ericct_Hsieh'])
    expect(m.active[1].people.map(p => p.name)).toEqual(['Ericct_Hsieh', 'Nervo_Kuo'])
  })

  it('帳號以 username 對應，admin 也對得到', () => {
    const m = buildPeopleModel(units, [
      user({ username: 'Ericct_Hsieh', role: 'admin', allowedUnits: ['SIT-HW', 'SIT-SW'] }),
      user({ username: 'Rock_Cai', linkedEngineer: 'Rock_Cai' }),
    ])
    expect(findPerson(m.active, 'Ericct_Hsieh')!.account?.role).toBe('admin')
    expect(findPerson(m.active, 'Rock_Cai')!.account?.username).toBe('Rock_Cai')
    expect(findPerson(m.active, 'Nervo_Kuo')!.account).toBeNull()
  })

  it('只有帳號沒有名冊的人進 unassigned', () => {
    const m = buildPeopleModel(units, [user({ username: 'admin', role: 'super_admin' })])
    expect(m.unassigned.map(p => p.name)).toEqual(['admin'])
    expect(m.unassigned[0].memberships).toEqual([])
    expect(findPerson(m.active, 'admin')).toBeUndefined()
  })

  it('名冊全停且無帳號 → 停用區塊；名冊全停但帳號啟用 → 仍在啟用清單', () => {
    const m = buildPeopleModel(units, [user({ username: 'Ben_Ko' })])
    expect(findPerson(m.active, 'Ben_Ko')).toBeDefined()
    expect(findPerson(m.inactive, 'Ben_Ko')).toBeUndefined()

    const m2 = buildPeopleModel(units, [])
    expect(findPerson(m2.active, 'Ben_Ko')).toBeUndefined()
    expect(findPerson(m2.inactive, 'Ben_Ko')).toBeDefined()
    expect(m2.inactive.map(g => g.unitLabel)).toEqual(['SIT-HW'])
  })

  it('名冊全停且帳號停用 → 停用區塊', () => {
    const m = buildPeopleModel(units, [user({ username: 'Ben_Ko', isActive: false })])
    expect(findPerson(m.inactive, 'Ben_Ko')!.account?.isActive).toBe(false)
  })

  it('只停一個單位的人仍在啟用清單，rosterActive 為 true', () => {
    const partial = units.map(u => u.id !== 'u-sw' ? u : {
      ...u, engineers: u.engineers.map(e => e.value === 'Ericct_Hsieh' ? { ...e, isActive: false } : e),
    })
    const m = buildPeopleModel(partial, [])
    expect(findPerson(m.active, 'Ericct_Hsieh')!.rosterActive).toBe(true)
  })

  it('只有帳號且帳號停用 → 停用區塊的「無單位」組', () => {
    const m = buildPeopleModel(units, [user({ username: 'ex_intern', isActive: false })])
    expect(m.unassigned).toEqual([])
    const g = m.inactive.find(x => x.unitId === null)!
    expect(g.unitLabel).toBe('無單位')
    expect(g.people.map(p => p.name)).toEqual(['ex_intern'])
  })

  it('停用區塊沒有人時為空陣列', () => {
    const only = [units[1]]
    expect(buildPeopleModel(only, []).inactive).toEqual([])
  })

  it('label 取第一個 membership 的 label', () => {
    const renamed = units.map(u => u.id !== 'u-hw' ? u : {
      ...u, engineers: u.engineers.map(e => e.id === 'e1' ? { ...e, label: 'Rock' } : e),
    })
    expect(findPerson(buildPeopleModel(renamed, []).active, 'Rock_Cai')!.label).toBe('Rock')
  })
})

describe('isPersonInactive / roleLabel', () => {
  it('isPersonInactive：名冊全停且無帳號', () => {
    expect(isPersonInactive({ name: 'x', label: 'x', memberships: [], rosterActive: false, account: null })).toBe(true)
    expect(isPersonInactive({ name: 'x', label: 'x', memberships: [], rosterActive: false, account: user({ username: 'x' }) })).toBe(false)
    expect(isPersonInactive({ name: 'x', label: 'x', memberships: [], rosterActive: true, account: null })).toBe(false)
  })

  it('roleLabel 三種角色', () => {
    expect(roleLabel('super_admin')).toBe('系統管理員')
    expect(roleLabel('admin')).toBe('部級主管')
    expect(roleLabel('user')).toBe('測試人員')
  })
})
