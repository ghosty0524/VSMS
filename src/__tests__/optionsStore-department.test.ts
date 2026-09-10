// src/__tests__/optionsStore-department.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useOptionsStore } from '../store/optionsStore'
import type { OptionsMap } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

function baseOptions(): OptionsMap {
  return {
    categories: [], restDays: { weekends: true, specificDates: [] }, devices: [],
    testUnits: [
      { id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: null, engineers: [] },
      { id: 'u-ra', value: 'RA', label: 'RA', isActive: true, sortOrder: 1, color: null, department: null, engineers: [] },
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

beforeEach(() => { useOptionsStore.setState({ options: baseOptions() }) })

describe('setTestUnitDepartment', () => {
  it('寫入部門並只發一次 PUT，其他單位不動', async () => {
    const spy = stubFetchEcho()
    await useOptionsStore.getState().setTestUnitDepartment('u-hw', 'SIT')
    expect(spy).toHaveBeenCalledTimes(1)
    const units = useOptionsStore.getState().options.testUnits
    expect(units.find(u => u.id === 'u-hw')!.department).toBe('SIT')
    expect(units.find(u => u.id === 'u-ra')!.department).toBeNull()
    const sent = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(sent.testUnits[0].department).toBe('SIT')
  })

  it('null 清掉部門', async () => {
    useOptionsStore.setState({ options: { ...baseOptions(), testUnits: baseOptions().testUnits.map(u => ({ ...u, department: 'SIT' })) } })
    stubFetchEcho()
    await useOptionsStore.getState().setTestUnitDepartment('u-hw', null)
    expect(useOptionsStore.getState().options.testUnits.find(u => u.id === 'u-hw')!.department).toBeNull()
  })

  it('PUT 失敗時 store 不變並拋出', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'x' }), { status: 500, headers: { 'Content-Type': 'application/json' } })))
    await expect(useOptionsStore.getState().setTestUnitDepartment('u-hw', 'SIT')).rejects.toThrow()
    expect(useOptionsStore.getState().options.testUnits.find(u => u.id === 'u-hw')!.department).toBeNull()
  })
})
