// src/__tests__/peopleActions.test.ts
// 列上的「停用」= 名冊全停 + 帳號停用，走兩個 API。第二步失敗時第一步已經
// 生效，回傳值要把這件事講清楚，不回滾也不拋出。
import { describe, it, expect, vi } from 'vitest'
import { deactivatePerson, activatePerson, membershipTargets, type PeopleDeps } from '../lib/peopleActions'
import type { Person, SafeUser } from '../lib/peopleRows'

const account: SafeUser = {
  id: 'acc-1', username: 'Ericct_Hsieh', displayName: 'Ericct_Hsieh', role: 'admin', isActive: true,
  allowedUnits: [], linkedEngineer: '', createdAt: '', lastLoginAt: '', canLinkVtms: false, canViewVtmsProgress: false,
}
const eng = (id: string, isActive = true) => ({ id, value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive, sortOrder: 0, color: null })
const person = (over: Partial<Person> = {}): Person => ({
  name: 'Ericct_Hsieh', label: 'Ericct_Hsieh', rosterActive: true, account,
  memberships: [
    { unitId: 'u-hw', unitValue: 'SIT-HW', unitLabel: 'SIT-HW', engineer: eng('e2') },
    { unitId: 'u-sw', unitValue: 'SIT-SW', unitLabel: 'SIT-SW', engineer: eng('e4') },
  ],
  ...over,
})
const deps = (): PeopleDeps => ({
  patchEngineers: vi.fn().mockResolvedValue(undefined),
  disableUser: vi.fn().mockResolvedValue({ ok: true }),
  enableUser: vi.fn().mockResolvedValue({}),
})

describe('membershipTargets', () => {
  it('列出每個 membership 的 unitId/engId', () => {
    expect(membershipTargets(person())).toEqual([{ unitId: 'u-hw', engId: 'e2' }, { unitId: 'u-sw', engId: 'e4' }])
  })
})

describe('deactivatePerson', () => {
  it('名冊全停 + 帳號停用', async () => {
    const d = deps()
    expect(await deactivatePerson(person(), d)).toEqual({ ok: true })
    expect(d.patchEngineers).toHaveBeenCalledWith([{ unitId: 'u-hw', engId: 'e2' }, { unitId: 'u-sw', engId: 'e4' }], { isActive: false })
    expect(d.disableUser).toHaveBeenCalledWith('acc-1')
  })

  it('沒有帳號只停名冊', async () => {
    const d = deps()
    const r = await deactivatePerson(person({ account: null }), d)
    expect(r).toEqual({ ok: true })
    expect(d.disableUser).not.toHaveBeenCalled()
  })

  it('沒有名冊列只停帳號', async () => {
    const d = deps()
    await deactivatePerson(person({ memberships: [], rosterActive: false }), d)
    expect(d.patchEngineers).not.toHaveBeenCalled()
    expect(d.disableUser).toHaveBeenCalledWith('acc-1')
  })

  it('帳號已停用就不再呼叫 disableUser', async () => {
    const d = deps()
    await deactivatePerson(person({ account: { ...account, isActive: false } }), d)
    expect(d.disableUser).not.toHaveBeenCalled()
  })

  it('第一步失敗：回 ok:false，不呼叫第二步', async () => {
    const d = deps()
    d.patchEngineers = vi.fn().mockRejectedValue(new Error('ENGINEER_IN_USE'))
    const r = await deactivatePerson(person(), d)
    expect(r).toEqual({ ok: false, message: '名冊停用失敗：ENGINEER_IN_USE' })
    expect(d.disableUser).not.toHaveBeenCalled()
  })

  it('第二步失敗：講清楚名冊已停用', async () => {
    const d = deps()
    d.disableUser = vi.fn().mockRejectedValue(new Error('403'))
    const r = await deactivatePerson(person(), d)
    expect(r).toEqual({ ok: false, message: '名冊已停用，但帳號停用失敗：403' })
  })

  it('沒有名冊列時第二步失敗：訊息沒有「名冊已停用，但」前綴', async () => {
    const d = deps()
    d.disableUser = vi.fn().mockRejectedValue(new Error('403'))
    const r = await deactivatePerson(person({ memberships: [], rosterActive: false }), d)
    expect(r).toEqual({ ok: false, message: '帳號停用失敗：403' })
    expect(d.patchEngineers).not.toHaveBeenCalled()
  })
})

describe('activatePerson', () => {
  it('名冊全啟 + 帳號啟用', async () => {
    const d = deps()
    expect(await activatePerson(person({ rosterActive: false, account: { ...account, isActive: false } }), d)).toEqual({ ok: true })
    expect(d.patchEngineers).toHaveBeenCalledWith(expect.any(Array), { isActive: true })
    expect(d.enableUser).toHaveBeenCalledWith('acc-1')
  })

  it('帳號已啟用就不再呼叫 enableUser', async () => {
    const d = deps()
    await activatePerson(person(), d)
    expect(d.enableUser).not.toHaveBeenCalled()
  })

  it('第二步失敗：講清楚名冊已啟用', async () => {
    const d = deps()
    d.enableUser = vi.fn().mockRejectedValue(new Error('500'))
    const r = await activatePerson(person({ account: { ...account, isActive: false } }), d)
    expect(r).toEqual({ ok: false, message: '名冊已啟用，但帳號啟用失敗：500' })
  })

  it('沒有帳號只啟名冊，回 ok:true', async () => {
    const d = deps()
    const r = await activatePerson(person({ account: null, rosterActive: false }), d)
    expect(r).toEqual({ ok: true })
    expect(d.patchEngineers).toHaveBeenCalledWith([{ unitId: 'u-hw', engId: 'e2' }, { unitId: 'u-sw', engId: 'e4' }], { isActive: true })
    expect(d.enableUser).not.toHaveBeenCalled()
  })

  it('沒有名冊列只啟帳號', async () => {
    const d = deps()
    await activatePerson(person({ memberships: [], rosterActive: false, account: { ...account, isActive: false } }), d)
    expect(d.patchEngineers).not.toHaveBeenCalled()
    expect(d.enableUser).toHaveBeenCalledWith('acc-1')
  })

  it('第一步失敗：回 ok:false，不呼叫 enableUser', async () => {
    const d = deps()
    d.patchEngineers = vi.fn().mockRejectedValue(new Error('500'))
    const r = await activatePerson(person({ rosterActive: false, account: { ...account, isActive: false } }), d)
    expect(r).toEqual({ ok: false, message: '名冊啟用失敗：500' })
    expect(d.enableUser).not.toHaveBeenCalled()
  })

  it('沒有名冊列時第二步失敗：訊息沒有前綴', async () => {
    const d = deps()
    d.enableUser = vi.fn().mockRejectedValue(new Error('500'))
    const r = await activatePerson(person({ memberships: [], rosterActive: false, account: { ...account, isActive: false } }), d)
    expect(r).toEqual({ ok: false, message: '帳號啟用失敗：500' })
  })
})
