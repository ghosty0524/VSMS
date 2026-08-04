// src/__tests__/optionsStore-toggleEngineer.test.ts
// 需求二：人員可停用 —— toggleEngineer 比照既有 toggleCategory / toggleTestUnit，
// 只切換 isActive，不影響其他人員或 value/label。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useOptionsStore } from '../store/optionsStore'
import type { OptionsMap } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

function baseOptions(): OptionsMap {
  return {
    categories: [],
    restDays: { weekends: true, specificDates: [] },
    devices: [],
    testUnits: [
      {
        id: 'u1', value: 'RA', label: 'RA', isActive: true, sortOrder: 0, color: null,
        engineers: [
          { id: 'e1', value: 'Ben_Ko', label: 'Ben_Ko', isActive: true, sortOrder: 0, color: null },
          { id: 'e2', value: 'Alice_Wu', label: 'Alice_Wu', isActive: true, sortOrder: 1, color: null },
        ],
      },
    ],
  }
}

function stubFetchEcho() {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: RequestInit) => {
    const body = opts.body ? JSON.parse(opts.body as string) : {}
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}

beforeEach(() => {
  useOptionsStore.setState({ options: baseOptions() })
})

describe('toggleEngineer（需求二：人員可停用）', () => {
  it('停用後 isActive 為 false，不影響其他人員', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().toggleEngineer('u1', 'e1', false)
    const eng = useOptionsStore.getState().options.testUnits[0].engineers.find(e => e.id === 'e1')
    const other = useOptionsStore.getState().options.testUnits[0].engineers.find(e => e.id === 'e2')
    expect(eng?.isActive).toBe(false)
    expect(other?.isActive).toBe(true)
  })

  it('停用不影響 value/label', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().toggleEngineer('u1', 'e1', false)
    const eng = useOptionsStore.getState().options.testUnits[0].engineers.find(e => e.id === 'e1')
    expect(eng?.value).toBe('Ben_Ko')
    expect(eng?.label).toBe('Ben_Ko')
  })

  it('啟用回 true', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().toggleEngineer('u1', 'e1', false)
    await useOptionsStore.getState().toggleEngineer('u1', 'e1', true)
    const eng = useOptionsStore.getState().options.testUnits[0].engineers.find(e => e.id === 'e1')
    expect(eng?.isActive).toBe(true)
  })
})
