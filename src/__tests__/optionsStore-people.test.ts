// src/__tests__/optionsStore-people.test.ts
// 人員頁「一個人一份屬性」：改色／改名／停用要一次套到所有單位列，
// 而且只能發一次 PUT，否則第二次失敗會留下半套的狀態。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useOptionsStore } from '../store/optionsStore'
import type { OptionsMap } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

function baseOptions(): OptionsMap {
  return {
    categories: [], restDays: { weekends: true, specificDates: [] }, devices: [],
    testUnits: [
      { id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, engineers: [
        { id: 'e1', value: 'Rock_Cai', label: 'Rock_Cai', isActive: true, sortOrder: 0, color: null },
        { id: 'e2', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 1, color: null },
      ] },
      { id: 'u-sw', value: 'SIT-SW', label: 'SIT-SW', isActive: true, sortOrder: 1, color: null, engineers: [
        { id: 'e4', value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 0, color: null },
      ] },
      { id: 'u-ra', value: 'RA', label: 'RA', isActive: true, sortOrder: 2, color: null, engineers: [] },
    ],
  }
}

function stubFetchEcho() {
  const spy = vi.fn(async (_url: string, opts: RequestInit) => {
    const body = opts.body ? JSON.parse(opts.body as string) : {}
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const eng = (unitId: string, value: string) =>
  useOptionsStore.getState().options.testUnits.find(u => u.id === unitId)!.engineers.find(e => e.value === value)

beforeEach(() => { useOptionsStore.setState({ options: baseOptions() }) })

describe('patchEngineers', () => {
  it('一次套到多列，只發一次 PUT', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().patchEngineers(
      [{ unitId: 'u-hw', engId: 'e2' }, { unitId: 'u-sw', engId: 'e4' }],
      { isActive: false, color: '#abcdef' },
    )
    expect(spy).toHaveBeenCalledTimes(1)
    expect(eng('u-hw', 'Ericct_Hsieh')!.isActive).toBe(false)
    expect(eng('u-sw', 'Ericct_Hsieh')!.color).toBe('#abcdef')
    expect(eng('u-hw', 'Rock_Cai')!.isActive).toBe(true)
  })

  it('改 label 不動 value', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().patchEngineers([{ unitId: 'u-hw', engId: 'e1' }], { label: 'Rock' })
    expect(eng('u-hw', 'Rock_Cai')).toMatchObject({ value: 'Rock_Cai', label: 'Rock' })
  })

  it('PUT 失敗時 store 不變並拋出', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ message: '失敗' }), { status: 500, headers: { 'Content-Type': 'application/json' } })))
    await expect(useOptionsStore.getState().patchEngineers([{ unitId: 'u-hw', engId: 'e1' }], { isActive: false })).rejects.toThrow()
    expect(eng('u-hw', 'Rock_Cai')!.isActive).toBe(true)
  })
})

describe('setPersonUnits', () => {
  it('新增缺的單位、刪掉多的單位，只發一次 PUT', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().setPersonUnits('Ericct_Hsieh', ['u-sw', 'u-ra'])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(eng('u-hw', 'Ericct_Hsieh')).toBeUndefined()
    expect(eng('u-sw', 'Ericct_Hsieh')!.id).toBe('e4')
    expect(eng('u-ra', 'Ericct_Hsieh')).toMatchObject({ value: 'Ericct_Hsieh', label: 'Ericct_Hsieh', isActive: true, sortOrder: 0 })
  })

  it('沒有變動時不發 PUT', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().setPersonUnits('Ericct_Hsieh', ['u-hw', 'u-sw'])
    expect(spy).not.toHaveBeenCalled()
  })

  it('空陣列等於從名冊移除這個人', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().setPersonUnits('Ericct_Hsieh', [])
    expect(eng('u-hw', 'Ericct_Hsieh')).toBeUndefined()
    expect(eng('u-sw', 'Ericct_Hsieh')).toBeUndefined()
  })

  it('重新加回單位時延用既有的 label 與 color，不重置', async () => {
    useOptionsStore.setState(s => ({
      options: {
        ...s.options,
        testUnits: s.options.testUnits.map(u => u.id === 'u-hw'
          ? { ...u, engineers: u.engineers.map(e => e.value === 'Rock_Cai' ? { ...e, label: 'Rock', color: '#abcdef' } : e) }
          : u),
      },
    }))
    stubFetchEcho()
    await useOptionsStore.getState().setPersonUnits('Rock_Cai', ['u-hw', 'u-ra'])
    expect(eng('u-ra', 'Rock_Cai')).toMatchObject({ label: 'Rock', color: '#abcdef' })
  })
})
