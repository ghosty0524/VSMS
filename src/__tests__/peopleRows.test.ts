// src/__tests__/peopleRows.test.ts
// 「人員」分頁的對應邏輯：名冊（engineers）與帳號（users）以
// users.linkedEngineer === engineer.value 精確對應。
import { describe, it, expect } from 'vitest'
import { buildPeopleView, type SafeUser } from '../lib/peopleRows'
import type { TestUnitOption } from '../types'

const units: TestUnitOption[] = [
  {
    id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 0, color: null,
    engineers: [
      { id: 'e1', value: 'Ben_Ko', label: 'Ben Ko', isActive: true, sortOrder: 0, color: null },
      { id: 'e2', value: 'Alice_Wu', label: 'Alice', isActive: false, sortOrder: 1, color: null },
    ],
  },
  {
    id: 'u2', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 1, color: null,
    engineers: [
      { id: 'e3', value: 'Cathy_Lin', label: 'Cathy', isActive: true, sortOrder: 0, color: null },
    ],
  },
]

function user(over: Partial<SafeUser> & { id: string; username: string }): SafeUser {
  return {
    displayName: over.username, role: 'user', isActive: true, allowedUnits: [],
    linkedEngineer: '', createdAt: '2026-01-01T00:00:00Z', lastLoginAt: '',
    canLinkVtms: false, canViewVtmsProgress: false,
    ...over,
  }
}

describe('buildPeopleView', () => {
  it('把 user 帳號掛到 linkedEngineer 對應的人員列', () => {
    const v = buildPeopleView(units, [user({ id: 'a1', username: 'ben', linkedEngineer: 'Ben_Ko' })])
    expect(v.units[0].rows[0].account?.username).toBe('ben')
    expect(v.units[0].rows[1].account).toBeNull()
    expect(v.orphanAccounts).toEqual([])
  })

  it('沒有帳號的人員 account 為 null，仍然列出', () => {
    const v = buildPeopleView(units, [])
    expect(v.units.map(u => u.rows.length)).toEqual([2, 1])
    expect(v.units[1].rows[0].account).toBeNull()
  })

  it('停用的人員仍列出且帶帳號', () => {
    const v = buildPeopleView(units, [user({ id: 'a2', username: 'alice', linkedEngineer: 'Alice_Wu' })])
    expect(v.units[0].rows[1].engineer.isActive).toBe(false)
    expect(v.units[0].rows[1].account?.username).toBe('alice')
  })

  it('admin 與 super_admin 進 adminAccounts，不進人員列', () => {
    const v = buildPeopleView(units, [
      user({ id: 'a3', username: 'root', role: 'super_admin' }),
      user({ id: 'a4', username: 'mgr', role: 'admin', allowedUnits: ['RA'] }),
    ])
    expect(v.adminAccounts.map(u => u.username)).toEqual(['root', 'mgr'])
    expect(v.units.flatMap(u => u.rows).every(r => r.account === null)).toBe(true)
  })

  it('對應人員已刪除的 user 帳號進 orphanAccounts，reason 為 missing', () => {
    const v = buildPeopleView(units, [user({ id: 'a5', username: 'ghost', linkedEngineer: 'Gone_Guy' })])
    expect(v.orphanAccounts).toEqual([{ user: expect.objectContaining({ username: 'ghost' }), reason: 'missing' }])
  })

  it('linkedEngineer 為空的 user 帳號也算 missing', () => {
    const v = buildPeopleView(units, [user({ id: 'a6', username: 'blank', linkedEngineer: '' })])
    expect(v.orphanAccounts[0].reason).toBe('missing')
  })

  it('兩個帳號指到同一人時，第一個進列、第二個為 duplicate', () => {
    const v = buildPeopleView(units, [
      user({ id: 'a7', username: 'ben1', linkedEngineer: 'Ben_Ko' }),
      user({ id: 'a8', username: 'ben2', linkedEngineer: 'Ben_Ko' }),
    ])
    expect(v.units[0].rows[0].account?.username).toBe('ben1')
    expect(v.orphanAccounts).toEqual([{ user: expect.objectContaining({ username: 'ben2' }), reason: 'duplicate' }])
  })

  it('保留單位與人員的原始順序', () => {
    const v = buildPeopleView(units, [])
    expect(v.units.map(u => u.unitLabel)).toEqual(['RA', 'SIT-HW'])
    expect(v.units[0].rows.map(r => r.engineer.value)).toEqual(['Ben_Ko', 'Alice_Wu'])
  })
})
