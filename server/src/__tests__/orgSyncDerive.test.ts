import { describe, it, expect } from 'vitest'
import { deriveVsmsOrg, leafSetFor } from '../lib/orgSync/derive.js'
import { FIXTURE_PEOPLE, FIXTURE_UNITS, fixtureSnapshot } from '../lib/orgSync/fixture.js'
import type { VsmsOrgCurrent } from '../lib/orgSync/types.js'

// 正式庫 2026-09-21 現況（test_units、engineers、users）。
function currentFromFixture(): VsmsOrgCurrent {
  const units = [
    { id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', department: 'SIT', isActive: true, sortOrder: 0 },
    { id: 'u-sw', value: 'SIT-SW', label: 'SIT-SW', department: 'SIT', isActive: true, sortOrder: 1 },
    { id: 'u-ra', value: 'RA', label: 'RA', department: 'RA', isActive: true, sortOrder: 2 },
    { id: 'u-si', value: 'SI', label: 'SI', department: 'SI', isActive: true, sortOrder: 3 },
  ]
  const unitId = (v: string) => units.find(u => u.value === v)!.id
  const engineers: VsmsOrgCurrent['engineers'] = []
  const users: VsmsOrgCurrent['users'] = [{ id: 'sa', username: 'admin', role: 'super_admin', isActive: true, allowedUnits: [], linkedEngineer: '' }]
  for (const [username, unitCode, lead, isActive] of FIXTURE_PEOPLE) {
    const leaves = unitCode === 'SIT' ? ['SIT-HW', 'SIT-SW'] : [unitCode]
    for (const leaf of leaves) engineers.push({ id: `e-${username}-${leaf}`, value: username, testUnitId: unitId(leaf), isActive, sortOrder: 0 })
    const deptLead = lead && !unitCode.startsWith('SIT-')
    users.push(deptLead
      ? { id: 'id-' + username, username, role: 'admin', isActive, allowedUnits: leaves, linkedEngineer: '' }
      : { id: 'id-' + username, username, role: 'user', isActive, allowedUnits: [], linkedEngineer: username })
  }
  return { units, engineers, users }
}
const empty = (): VsmsOrgPlanLike => ({ create: [], update: [] })
type VsmsOrgPlanLike = { create: unknown[]; update: unknown[] }

describe('leafSetFor', () => {
  it('課 → 自己；有課的部 → 全部課；沒課的部 → 自己', () => {
    expect(leafSetFor('SIT-HW', FIXTURE_UNITS)).toEqual(['SIT-HW'])
    expect(leafSetFor('SIT', FIXTURE_UNITS)).toEqual(['SIT-HW', 'SIT-SW'])
    expect(leafSetFor('RA', FIXTURE_UNITS)).toEqual(['RA'])
  })
})

describe('deriveVsmsOrg', () => {
  it('26 人 fixture 套到正式現況：零差異', () => {
    const plan = deriveVsmsOrg(fixtureSnapshot(), currentFromFixture())
    expect(plan.units).toEqual(empty())
    expect(plan.engineers).toEqual(empty())
    expect(plan.users).toEqual(empty())
    expect(plan.skipped).toEqual([])
  })

  it('空庫：建 4 個葉單位、25 個人的名冊列（Ericct 兩列＝26 列）、25 個帳號', () => {
    const plan = deriveVsmsOrg(fixtureSnapshot(), { units: [], engineers: [], users: [] })
    expect(plan.units.create.map(u => u.value)).toEqual(['SI', 'RA', 'SIT-HW', 'SIT-SW'])
    expect(plan.units.create.find(u => u.value === 'SIT-HW')).toEqual({ value: 'SIT-HW', department: 'SIT', isActive: true })
    expect(plan.units.create.find(u => u.value === 'RA')).toEqual({ value: 'RA', department: 'RA', isActive: true })
    expect(plan.engineers.create).toHaveLength(26)
    expect(plan.engineers.create.filter(e => e.value === 'Ericct_Hsieh').map(e => e.unitValue)).toEqual(['SIT-HW', 'SIT-SW'])
    const ericct = plan.users.create.find(u => u.username === 'Ericct_Hsieh')!
    expect(ericct).toMatchObject({ role: 'admin', allowedUnits: ['SIT-HW', 'SIT-SW'], linkedEngineer: '' })
    const will = plan.users.create.find(u => u.username === 'Will_Wang')!
    expect(will).toMatchObject({ role: 'admin', allowedUnits: ['RA'] })
    const polson = plan.users.create.find(u => u.username === 'Polson_Cheng')!
    expect(polson).toMatchObject({ role: 'user', allowedUnits: [], linkedEngineer: 'Polson_Cheng' })
    expect(plan.users.create.find(u => u.username === 'Ben_Ko')).toMatchObject({ isActive: false })
  })

  it('換單位：舊單位的名冊列停用不刪、新單位建列', () => {
    const snap = fixtureSnapshot()
    snap.people = [{ id: 'id-Rock_Cai', username: 'Rock_Cai', isActive: true, unitCode: 'SIT-SW', isUnitLead: false }]
    const cur = currentFromFixture()
    const plan = deriveVsmsOrg(snap, cur)
    expect(plan.engineers.create).toEqual([{ value: 'Rock_Cai', unitValue: 'SIT-SW', isActive: true }])
    expect(plan.engineers.update).toEqual([{ id: 'e-Rock_Cai-SIT-HW', value: 'Rock_Cai', unitValue: 'SIT-HW', changes: { isActive: false } }])
  })

  it('停用人 → 帳號與所有名冊列停用；super_admin 與未知單位跳過；allowedUnits 不分順序', () => {
    const snap = fixtureSnapshot()
    snap.people = [
      { id: 'id-Ericct_Hsieh', username: 'Ericct_Hsieh', isActive: false, unitCode: 'SIT', isUnitLead: true },
      { id: 'sa', username: 'admin', isActive: true, unitCode: 'SI', isUnitLead: true },
      { id: 'g', username: 'Ghost', isActive: true, unitCode: 'NOPE', isUnitLead: false },
    ]
    const cur = currentFromFixture()
    cur.users.find(u => u.username === 'Ericct_Hsieh')!.allowedUnits = ['SIT-SW', 'SIT-HW']
    const plan = deriveVsmsOrg(snap, cur)
    expect(plan.users.update).toEqual([{ id: 'id-Ericct_Hsieh', username: 'Ericct_Hsieh', changes: { isActive: false } }])
    expect(plan.engineers.update.map(e => e.unitValue).sort()).toEqual(['SIT-HW', 'SIT-SW'])
    expect(plan.skipped).toEqual([{ username: 'admin', reason: 'LOCAL_SUPER_ADMIN' }, { username: 'Ghost', reason: 'UNKNOWN_UNIT' }])
  })

  it('新增一個課 → 建 test_unit；停用單位 → update isActive', () => {
    const snap = fixtureSnapshot()
    snap.units = [...snap.units, { code: 'SIT-FW', parentCode: 'SIT', isActive: true, sortOrder: 3 }]
    snap.units.find(u => u.code === 'SI')!.isActive = false
    const plan = deriveVsmsOrg(snap, currentFromFixture())
    expect(plan.units.create).toEqual([{ value: 'SIT-FW', department: 'SIT', isActive: true }])
    expect(plan.units.update).toEqual([{ id: 'u-si', value: 'SI', changes: { isActive: false } }])
  })
})
