// server/src/lib/orgSync/derive.ts
// 快照 → VSMS 本地應有狀態。純函式；apply.ts 負責寫入。
import type { OrgSnapshot, OrgUnitSnap, VsmsOrgCurrent, VsmsOrgPlan } from './types.js'

const byOrder = (a: OrgUnitSnap, b: OrgUnitSnap) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])

/** 葉單位：有 parent 的課，加上沒有任何課的部。回傳 { value, department } 依部→課的順序。 */
export function leafUnitsOf(units: OrgUnitSnap[]): { code: string; department: string; isActive: boolean }[] {
  const out: { code: string; department: string; isActive: boolean }[] = []
  for (const dept of units.filter(u => u.parentCode === null).sort(byOrder)) {
    const kids = units.filter(u => u.parentCode === dept.code).sort(byOrder)
    if (kids.length === 0) out.push({ code: dept.code, department: dept.code, isActive: dept.isActive })
    else for (const k of kids) out.push({ code: k.code, department: dept.code, isActive: k.isActive && dept.isActive })
  }
  return out
}

/** 一個人的葉單位集合（見 spec 第 5 節）。unitCode 不存在回 null。 */
export function leafSetFor(unitCode: string, units: OrgUnitSnap[]): string[] | null {
  const unit = units.find(u => u.code === unitCode)
  if (!unit) return null
  if (unit.parentCode !== null) return [unit.code]
  const kids = units.filter(u => u.parentCode === unit.code)
  if (kids.length === 0) return [unit.code]
  return kids.filter(k => k.isActive).sort(byOrder).map(k => k.code)
}

export function deriveVsmsOrg(snapshot: OrgSnapshot, current: VsmsOrgCurrent): VsmsOrgPlan {
  const plan: VsmsOrgPlan = { units: { create: [], update: [] }, engineers: { create: [], update: [] }, users: { create: [], update: [] }, skipped: [] }

  // test_units
  const unitByValue = new Map(current.units.map(u => [u.value, u]))
  for (const leaf of leafUnitsOf(snapshot.units)) {
    const cur = unitByValue.get(leaf.code)
    if (!cur) { plan.units.create.push({ value: leaf.code, department: leaf.department, isActive: leaf.isActive }); continue }
    const changes: { department?: string; isActive?: boolean } = {}
    if ((cur.department ?? '') !== leaf.department) changes.department = leaf.department
    if (cur.isActive !== leaf.isActive) changes.isActive = leaf.isActive
    if (Object.keys(changes).length) plan.units.update.push({ id: cur.id, value: cur.value, changes })
  }

  // engineers（名冊）與 users
  const unitValueById = new Map(current.units.map(u => [u.id, u.value]))
  const engineersByPerson = new Map<string, VsmsOrgCurrent['engineers']>()
  for (const e of current.engineers) {
    const k = e.value.toLowerCase()
    engineersByPerson.set(k, [...(engineersByPerson.get(k) ?? []), e])
  }
  const userByName = new Map(current.users.map(u => [u.username.toLowerCase(), u]))

  for (const p of snapshot.people) {
    const leaves = leafSetFor(p.unitCode, snapshot.units)
    if (!leaves) { plan.skipped.push({ username: p.username, reason: 'UNKNOWN_UNIT' }); continue }
    const unit = snapshot.units.find(u => u.code === p.unitCode)!
    const key = p.username.toLowerCase()
    const cur = userByName.get(key)
    if (cur?.role === 'super_admin') { plan.skipped.push({ username: p.username, reason: 'LOCAL_SUPER_ADMIN' }); continue }

    const rows = engineersByPerson.get(key) ?? []
    for (const leaf of leaves) {
      const row = rows.find(r => unitValueById.get(r.testUnitId) === leaf)
      if (!row) plan.engineers.create.push({ value: p.username, unitValue: leaf, isActive: p.isActive })
      else if (row.isActive !== p.isActive) plan.engineers.update.push({ id: row.id, value: row.value, unitValue: leaf, changes: { isActive: p.isActive } })
    }
    for (const row of rows) {
      const uv = unitValueById.get(row.testUnitId) ?? ''
      if (!leaves.includes(uv) && row.isActive) plan.engineers.update.push({ id: row.id, value: row.value, unitValue: uv, changes: { isActive: false } })
    }

    const deptLead = p.isUnitLead && unit.parentCode === null
    const want = deptLead
      ? { role: 'admin' as const, allowedUnits: leaves, linkedEngineer: '' }
      : { role: 'user' as const, allowedUnits: [] as string[], linkedEngineer: p.username }
    if (!cur) { plan.users.create.push({ id: p.id, username: p.username, ...want, isActive: p.isActive }); continue }
    const changes: VsmsOrgPlan['users']['update'][number]['changes'] = {}
    if (cur.role !== want.role) changes.role = want.role
    if (!sameSet(cur.allowedUnits, want.allowedUnits)) changes.allowedUnits = want.allowedUnits
    if (cur.linkedEngineer !== want.linkedEngineer) changes.linkedEngineer = want.linkedEngineer
    if (cur.isActive !== p.isActive) changes.isActive = p.isActive
    if (Object.keys(changes).length) plan.users.update.push({ id: cur.id, username: cur.username, changes })
  }
  return plan
}
