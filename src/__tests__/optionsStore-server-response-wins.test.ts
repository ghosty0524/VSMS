// src/__tests__/optionsStore-server-response-wins.test.ts
// AUTH_PROVIDER=vauth 下 PUT /api/options 會忽略身分類欄位、回傳資料庫目前的最新狀態，
// 與樂觀更新的 next 可能不同。store 必須套用伺服器回應，而不是無條件相信 next，
// 否則畫面會顯示過期值（見 F:\vportal\.superpowers\sdd\cleanup-vsms-report.md 項目 1）。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useOptionsStore } from '../store/optionsStore'
import type { OptionsMap } from '../types'

afterEach(() => { vi.unstubAllGlobals() })

function baseOptions(): OptionsMap {
  return {
    categories: [], restDays: { weekends: true, specificDates: [] }, devices: [],
    testUnits: [
      { id: 'u-hw', value: 'SIT-HW', label: 'SIT-HW', isActive: true, sortOrder: 0, color: null, department: null, engineers: [] },
    ],
  }
}

beforeEach(() => { useOptionsStore.setState({ options: baseOptions() }) })

describe('persistOptions 套用伺服器回應', () => {
  it('回應與樂觀更新的 next 不同時，store 以回應為準', async () => {
    // 伺服器回應多了一個 next 沒有的單位（模擬別的請求已經先寫入、或身分欄位被忽略後的最新狀態）
    const serverOptions: OptionsMap = {
      ...baseOptions(),
      testUnits: [
        ...baseOptions().testUnits,
        { id: 'u-sw', value: 'SIT-SW', label: 'SIT-SW', isActive: true, sortOrder: 1, color: null, department: null, engineers: [] },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify(serverOptions), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await useOptionsStore.getState().addTestUnit('SIT-FW')

    const units = useOptionsStore.getState().options.testUnits
    expect(units.map(u => u.id)).toEqual(['u-hw', 'u-sw'])
  })

  it('回應不是合法 options map（沒有 testUnits 陣列）時，退回樂觀更新的 next', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await useOptionsStore.getState().addTestUnit('SIT-FW')

    const units = useOptionsStore.getState().options.testUnits
    expect(units.map(u => u.value)).toEqual(['SIT-HW', 'SIT-FW'])
  })

  it('local 模式（伺服器回聲 next）行為不變', async () => {
    const spy = vi.fn(async (_url: string, opts: RequestInit) => {
      const body = opts.body ? JSON.parse(opts.body as string) : {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', spy)

    await useOptionsStore.getState().addTestUnit('SIT-FW')

    const units = useOptionsStore.getState().options.testUnits
    expect(units.map(u => u.value)).toEqual(['SIT-HW', 'SIT-FW'])
  })
})
