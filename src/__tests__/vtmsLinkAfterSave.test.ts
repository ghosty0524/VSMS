// src/__tests__/vtmsLinkAfterSave.test.ts
// 修 bug：表單選的 VTMS 計畫從來沒存進去（POST/PUT 會把 vtmsPlanId 濾掉，
// 前端又從未呼叫 vtms-link）。儲存後的關聯流程抽成純函式，關聯失敗不能
// 讓「排程已儲存」這件事被誤報成失敗。
import { describe, it, expect, vi } from 'vitest'
import { syncVtmsLink } from '../lib/vtmsLinkAfterSave'
import type { Schedule } from '../types'

const linked = { id: 's1', vtmsPlanId: 'plan-1' } as Schedule

describe('syncVtmsLink', () => {
  it('沒有 canLinkVtms 權限：skipped，不呼叫 API', async () => {
    const setLink = vi.fn()
    const r = await syncVtmsLink({ canLinkVtms: false, savedId: 's1', previous: '', next: 'plan-1', setLink })
    expect(r).toEqual({ status: 'skipped' })
    expect(setLink).not.toHaveBeenCalled()
  })

  it('選擇沒變：skipped（undefined 與空字串視為相同）', async () => {
    const setLink = vi.fn()
    expect(await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: undefined, next: '', setLink })).toEqual({ status: 'skipped' })
    expect(await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: 'plan-1', next: 'plan-1', setLink })).toEqual({ status: 'skipped' })
    expect(setLink).not.toHaveBeenCalled()
  })

  it('新選了計畫：呼叫 setLink 並回 linked', async () => {
    const setLink = vi.fn().mockResolvedValue(linked)
    const r = await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: '', next: 'plan-1', setLink })
    expect(setLink).toHaveBeenCalledWith('s1', 'plan-1')
    expect(r).toEqual({ status: 'linked', schedule: linked })
  })

  it('取消關聯：以 null 呼叫 setLink', async () => {
    const setLink = vi.fn().mockResolvedValue({ id: 's1', vtmsPlanId: undefined } as Schedule)
    await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: 'plan-1', next: '', setLink })
    expect(setLink).toHaveBeenCalledWith('s1', null)
  })

  it('setLink 拋錯：回 failed 帶錯誤，不往外丟', async () => {
    const err = new Error('403')
    const setLink = vi.fn().mockRejectedValue(err)
    const r = await syncVtmsLink({ canLinkVtms: true, savedId: 's1', previous: '', next: 'plan-1', setLink })
    expect(r).toEqual({ status: 'failed', error: err })
  })
})
