// src/__tests__/optionsStore-removeEngineer.test.ts
// 需求三（前端部分）：removeEngineer 需讓後端 400 ENGINEER_IN_USE 的錯誤往上
// 拋，讓人員名冊管理頁能顯示訊息而非無聲失敗；未被引用者仍可正常移除。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useOptionsStore } from '../store/optionsStore'
import { ApiError } from '../lib/api'
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

function stubFetchEngineerInUse() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({
      ok: false,
      message: '「Ben_Ko」目前有 18 筆排程使用中，無法刪除。若該人員已離職，請改用「停用」。',
      code: 'ENGINEER_IN_USE',
    }),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  )))
}

beforeEach(() => {
  useOptionsStore.setState({ options: baseOptions() })
})

describe('removeEngineer（需求三：後端錯誤需往上拋）', () => {
  it('後端回 400 ENGINEER_IN_USE 時，例外往上拋而非無聲吞掉', async () => {
    stubFetchEngineerInUse()
    await expect(useOptionsStore.getState().removeEngineer('u1', 'e1')).rejects.toBeInstanceOf(ApiError)
  })

  it('拒絕時本地狀態不被樂觀更新（人員仍在）', async () => {
    stubFetchEngineerInUse()
    await useOptionsStore.getState().removeEngineer('u1', 'e1').catch(() => {})
    const eng = useOptionsStore.getState().options.testUnits[0].engineers.find(e => e.id === 'e1')
    expect(eng).toBeDefined()
  })

  it('未被引用者可正常移除：送出的 body 已不含被移除者，本地狀態同步更新', async () => {
    // Minor 7：舊版用 stubFetchEcho()（無條件回 200）加上只檢查本地狀態，
    // 即使 removeEngineer 送出的 body 完全沒濾掉 e2，只要後端不擋，測試依然會過
    // ——名稱聲稱驗證「未被引用者移除」，實際上完全沒碰引用邏輯。這裡改為同時
    // 檢查實際送出的 PUT body 是否已排除 e2，讓測試名符其實。
    let sentBody: { testUnits: { engineers: { id: string }[] }[] } | null = null
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: RequestInit) => {
      sentBody = opts.body ? JSON.parse(opts.body as string) : null
      return new Response(JSON.stringify(sentBody), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    await useOptionsStore.getState().removeEngineer('u1', 'e2')

    expect(sentBody).not.toBeNull()
    const sentIds = sentBody!.testUnits[0].engineers.map(e => e.id)
    expect(sentIds).toEqual(['e1'])

    const remaining = useOptionsStore.getState().options.testUnits[0].engineers.map(e => e.id)
    expect(remaining).toEqual(['e1'])
  })
})
