import { describe, it, expect } from 'vitest'
import { deriveVsmsOrg, leafSetFor, leafUnitsOf } from '../lib/orgSync/derive.js'
import { FIXTURE_PEOPLE, FIXTURE_UNITS, fixtureSnapshot } from '../lib/orgSync/fixture.js'
import { validateSnapshot } from '../lib/orgSync/types.js'
import type { OrgSnapshot, VsmsOrgCurrent } from '../lib/orgSync/types.js'

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

  it('部下的課全部停用 → 空集合，不會退回部本身（與 leafUnitsOf 一致，避免指到不存在的葉單位）', () => {
    const units = [
      { code: 'X', parentCode: null, isActive: true, sortOrder: 1 },
      { code: 'X-A', parentCode: 'X', isActive: false, sortOrder: 1 },
    ]
    expect(leafSetFor('X', units)).toEqual([])
    expect(leafUnitsOf(units).map(u => u.code)).toEqual(['X-A'])
  })
})

describe('validateSnapshot', () => {
  it('接受正常快照', () => { expect(validateSnapshot(fixtureSnapshot())).toBeNull() })
  it('拒收非物件、version 非正整數、空 units、空 people', () => {
    expect(validateSnapshot(null)).toMatch(/object/)
    expect(validateSnapshot({ ...fixtureSnapshot(), version: 0 })).toMatch(/version/)
    expect(validateSnapshot({ ...fixtureSnapshot(), version: 1.5 })).toMatch(/version/)
    expect(validateSnapshot({ ...fixtureSnapshot(), units: [] })).toMatch(/units/)
    expect(validateSnapshot({ ...fixtureSnapshot(), people: [] })).toMatch(/people/)
  })
  it('陣列元素是 null 或缺欄位時回錯誤訊息而不是丟例外', () => {
    expect(validateSnapshot({ ...fixtureSnapshot(), units: [null] })).toMatch(/unit\.code/)
    expect(validateSnapshot({ ...fixtureSnapshot(), units: [{ parentCode: null }] })).toMatch(/unit\.code/)
    expect(validateSnapshot({ ...fixtureSnapshot(), people: [null] })).toMatch(/person/)
    expect(validateSnapshot({ ...fixtureSnapshot(), people: [{ username: 'x' }] })).toMatch(/person/)
  })

  // 缺了這些欄位不會被擋下來，就會以 undefined 的樣子一路寫進 DB（isActive 變 null、
  // sortOrder 變 null），或是在 users.create 撞上 displayName VarChar(50) 而整批失敗。
  const unit = (over: Record<string, unknown>) =>
    ({ ...fixtureSnapshot(), units: [{ code: 'X', parentCode: null, isActive: true, sortOrder: 1, ...over }] })
  const person = (over: Record<string, unknown>) =>
    ({ ...fixtureSnapshot(), people: [{ id: 'i', username: 'u', unitCode: 'SI', isUnitLead: false, isActive: true, ...over }] })

  it('unit 少了 isActive／sortOrder 不是整數 → 錯誤訊息', () => {
    expect(validateSnapshot(unit({ isActive: undefined }))).toMatch(/unit/)
    expect(validateSnapshot(unit({ isActive: 'yes' }))).toMatch(/unit/)
    expect(validateSnapshot(unit({ sortOrder: undefined }))).toMatch(/unit/)
    expect(validateSnapshot(unit({ sortOrder: 1.5 }))).toMatch(/unit/)
  })

  it('person 少了 id／isUnitLead／isActive → 錯誤訊息', () => {
    expect(validateSnapshot(person({ id: undefined }))).toMatch(/person/)
    expect(validateSnapshot(person({ id: '' }))).toMatch(/person/)
    expect(validateSnapshot(person({ isUnitLead: undefined }))).toMatch(/person/)
    expect(validateSnapshot(person({ isActive: 'yes' }))).toMatch(/person/)
  })

  it('username 超過 50 字（User.displayName 是 VarChar(50)）→ 錯誤訊息', () => {
    expect(validateSnapshot(person({ username: 'a'.repeat(51) }))).toMatch(/person/)
    expect(validateSnapshot(person({ username: 'a'.repeat(50) }))).toBeNull()
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
    expect(plan.engineers.create).toEqual([])
    expect(plan.engineers.update.some(e => e.value === 'admin')).toBe(false)
  })

  it('部主管的 allowedUnits 永遠不是空陣列（[] 在 VSMS 代表「全部單位」）', () => {
    // 部 X 底下兩個課都停用：leafSetFor 回 []，若直接當 allowedUnits 就等於放行全部單位。
    const snap: OrgSnapshot = {
      version: 1, generatedAt: '2026-09-21T00:00:00.000Z',
      units: [
        { code: 'X', parentCode: null, isActive: true, sortOrder: 1 },
        { code: 'X-A', parentCode: 'X', isActive: false, sortOrder: 1 },
        { code: 'X-B', parentCode: 'X', isActive: false, sortOrder: 2 },
      ],
      people: [{ id: 'id-P', username: 'P', isActive: true, unitCode: 'X', isUnitLead: true }],
    }
    const plan = deriveVsmsOrg(snap, { units: [], engineers: [], users: [] })
    expect(plan.users.create).toHaveLength(1)
    expect(plan.users.create[0]).toMatchObject({ role: 'admin', allowedUnits: ['X-A', 'X-B'] })
    // 名冊列仍只看啟用的課（leafSetFor），停用的課不補列。
    expect(plan.engineers.create).toEqual([])
  })

  it('沒有課的部，部主管的 allowedUnits 是部本身', () => {
    const snap: OrgSnapshot = {
      version: 1, generatedAt: '2026-09-21T00:00:00.000Z',
      units: [{ code: 'X', parentCode: null, isActive: true, sortOrder: 1 }],
      people: [{ id: 'id-P', username: 'P', isActive: true, unitCode: 'X', isUnitLead: true }],
    }
    const plan = deriveVsmsOrg(snap, { units: [], engineers: [], users: [] })
    expect(plan.users.create[0]).toMatchObject({ role: 'admin', allowedUnits: ['X'] })
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
