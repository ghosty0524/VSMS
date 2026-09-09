// src/lib/peopleRows.ts
//
// 「人員」分頁的對應邏輯。名冊（engineers 表，掛在測試單位下）與帳號
// （users 表）是兩種東西：名冊沒有登入身分、帳號只有 user 角色會透過
// linkedEngineer（純文字，存 engineer.value，無外鍵）指到一位人員。
// 這裡只做讀取端的對應，不改任何資料。
import type { TestUnitOption, EngineerOption, User } from '../types'

export type SafeUser = Omit<User, 'passwordHash'>

export interface PersonRow {
  engineer: EngineerOption
  /** role === 'user' 且 linkedEngineer === engineer.value 的第一個帳號 */
  account: SafeUser | null
}

export interface PeopleUnit {
  unitId: string
  unitValue: string
  unitLabel: string
  rows: PersonRow[]
}

export interface OrphanAccount {
  user: SafeUser
  /** missing：對應人員不存在或未設定；duplicate：該人員已被另一個帳號對應 */
  reason: 'missing' | 'duplicate'
}

export interface PeopleView {
  units: PeopleUnit[]
  /** admin / super_admin，依傳入順序（API 已依 createdAt 排序） */
  adminAccounts: SafeUser[]
  /** user 角色但沒有掛到任何人員列的帳號。不能讓它們從畫面上消失。 */
  orphanAccounts: OrphanAccount[]
}

export function buildPeopleView(testUnits: TestUnitOption[], users: SafeUser[]): PeopleView {
  const byEngineer = new Map<string, SafeUser[]>()
  for (const u of users) {
    if (u.role !== 'user') continue
    const list = byEngineer.get(u.linkedEngineer) ?? []
    list.push(u)
    byEngineer.set(u.linkedEngineer, list)
  }

  const claimed = new Set<string>()
  const knownEngineers = new Set<string>()
  const units: PeopleUnit[] = testUnits.map(unit => ({
    unitId: unit.id,
    unitValue: unit.value,
    unitLabel: unit.label,
    rows: unit.engineers.map(engineer => {
      knownEngineers.add(engineer.value)
      const account = byEngineer.get(engineer.value)?.[0] ?? null
      if (account) claimed.add(account.id)
      return { engineer, account }
    }),
  }))

  const adminAccounts = users.filter(u => u.role !== 'user')
  const orphanAccounts: OrphanAccount[] = users
    .filter(u => u.role === 'user' && !claimed.has(u.id))
    .map(u => ({
      user: u,
      reason: u.linkedEngineer && knownEngineers.has(u.linkedEngineer) ? 'duplicate' : 'missing',
    }))

  return { units, adminAccounts, orphanAccounts }
}
