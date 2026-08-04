// src/__tests__/optionsStore-updateEngineer.test.ts
// 需求一：改名不動 value —— updateEngineer 只更新 label，value 保持不變，
// 比照 updateDevice 的既有作法，避免改名等同「刪舊人新增新人」而斷開排程參照。
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

/** 模擬 PUT /api/options：預設把送出的 body 原樣回傳（200） */
function stubFetchEcho() {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: RequestInit) => {
    const body = opts.body ? JSON.parse(opts.body as string) : {}
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}

beforeEach(() => {
  useOptionsStore.setState({ options: baseOptions() })
})

describe('updateEngineer（需求一：改名不動 value）', () => {
  it('改名後 value 不變、label 更新', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().updateEngineer('u1', 'e1', 'Ben Ko Renamed')
    const eng = useOptionsStore.getState().options.testUnits[0].engineers.find(e => e.id === 'e1')
    expect(eng?.label).toBe('Ben Ko Renamed')
    expect(eng?.value).toBe('Ben_Ko')
  })

  it('不影響同單位其他人員', async () => {
    stubFetchEcho()
    await useOptionsStore.getState().updateEngineer('u1', 'e1', 'Ben Ko Renamed')
    const other = useOptionsStore.getState().options.testUnits[0].engineers.find(e => e.id === 'e2')
    expect(other?.value).toBe('Alice_Wu')
    expect(other?.label).toBe('Alice_Wu')
  })
})
