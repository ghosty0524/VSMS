// src/lib/peopleRows.ts
//
// 「人員」分頁的身分模型：一個名字就是一個人。
//   名冊：engineers.value（不唯一，同一人在多個單位各有一列 = 屬於多個單位）
//   帳號：users.username
// 兩邊同名即同一人，不分角色。正式資料 26 個帳號全部符合（2026-09-10 查證），
// linkedEngineer 只是建立 user 帳號時後端要的欄位，不再當對應依據。
import type { TestUnitOption, EngineerOption, User } from '../types'

export type SafeUser = Omit<User, 'passwordHash'>

export interface Membership {
  unitId: string
  unitValue: string
  unitLabel: string
  engineer: EngineerOption
}

export interface Person {
  /** engineer.value === username */
  name: string
  /** 顯示名稱：第一個 membership 的 label，沒有名冊列時等於 name */
  label: string
  /** 依單位 sortOrder 排序 */
  memberships: Membership[]
  /** 任一 membership isActive */
  rosterActive: boolean
  account: SafeUser | null
}

export interface PersonGroup {
  /** null = 無單位（只有帳號的人） */
  unitId: string | null
  unitLabel: string
  people: Person[]
}

export interface PeopleModel {
  /** 依單位分組；一人多單位時每個單位都列他 */
  active: PersonGroup[]
  /** 名冊全停且（無帳號或帳號停用）的人，依單位分組，最後可能有「無單位」組 */
  inactive: PersonGroup[]
  /** 有帳號、沒名冊列、帳號啟用 */
  unassigned: Person[]
}

const ROLE_LABEL: Record<User['role'], string> = {
  super_admin: '系統管理員',
  admin: '部級主管',
  user: '測試人員',
}

export function roleLabel(role: User['role']): string {
  return ROLE_LABEL[role] ?? role
}

/** 名冊每一列都停用，且沒有帳號或帳號停用 */
export function isPersonInactive(p: Person): boolean {
  return !p.rosterActive && (!p.account || !p.account.isActive)
}

export const UNASSIGNED_LABEL = '無單位'

export function buildPeopleModel(testUnits: TestUnitOption[], users: SafeUser[]): PeopleModel {
  const byUsername = new Map(users.map(u => [u.username, u]))
  const sortedUnits = [...testUnits].sort((a, b) => a.sortOrder - b.sortOrder)

  // 1. 名冊 → Person（合併同名）
  const persons = new Map<string, Person>()
  for (const unit of sortedUnits) {
    const engineers = [...unit.engineers].sort((a, b) => a.sortOrder - b.sortOrder)
    for (const engineer of engineers) {
      const existing = persons.get(engineer.value)
      const membership: Membership = { unitId: unit.id, unitValue: unit.value, unitLabel: unit.label, engineer }
      if (existing) {
        existing.memberships.push(membership)
        existing.rosterActive = existing.rosterActive || engineer.isActive
      } else {
        persons.set(engineer.value, {
          name: engineer.value,
          label: engineer.label,
          memberships: [membership],
          rosterActive: engineer.isActive,
          account: byUsername.get(engineer.value) ?? null,
        })
      }
    }
  }

  // 2. 只有帳號的人
  const accountOnly: Person[] = users
    .filter(u => !persons.has(u.username))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(u => ({ name: u.username, label: u.displayName || u.username, memberships: [], rosterActive: false, account: u }))

  // 3. 分組
  const active: PersonGroup[] = []
  const inactive: PersonGroup[] = []
  for (const unit of sortedUnits) {
    const here = [...persons.values()].filter(p => p.memberships.some(m => m.unitId === unit.id))
    const order = (p: Person) => p.memberships.find(m => m.unitId === unit.id)!.engineer.sortOrder
    const activePeople = here.filter(p => !isPersonInactive(p)).sort((a, b) => order(a) - order(b))
    const inactivePeople = here.filter(isPersonInactive).sort((a, b) => order(a) - order(b))
    active.push({ unitId: unit.id, unitLabel: unit.label, people: activePeople })
    if (inactivePeople.length > 0) inactive.push({ unitId: unit.id, unitLabel: unit.label, people: inactivePeople })
  }

  const unassigned = accountOnly.filter(p => !isPersonInactive(p))
  const unassignedInactive = accountOnly.filter(isPersonInactive)
  if (unassignedInactive.length > 0) inactive.push({ unitId: null, unitLabel: UNASSIGNED_LABEL, people: unassignedInactive })

  return { active, inactive, unassigned }
}
