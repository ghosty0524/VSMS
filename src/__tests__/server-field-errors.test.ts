import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from '../lib/api'
import { serverFieldErrors } from '../components/schedule/ScheduleFormModal'

afterEach(() => { vi.unstubAllGlobals() })

describe('ApiError fieldErrors 穿透', () => {
  it('422 回應的 errors 物件會掛在 ApiError.fieldErrors 上', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ errors: { taskDescription: '任務描述不可超過 500 字' } }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    )))
    const err = await api.updateSchedule('x', {}).catch(e => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(422)
    expect(err.fieldErrors).toEqual({ taskDescription: '任務描述不可超過 500 字' })
  })

  it('非 422 或無 errors 時 fieldErrors 為 undefined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: 'boom' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )))
    const err = await api.updateSchedule('x', {}).catch(e => e) as ApiError
    expect(err.fieldErrors).toBeUndefined()
  })
})

describe('serverFieldErrors(modal 端映射)', () => {
  it('422 + fieldErrors → 回傳欄位錯誤物件', () => {
    const err = new ApiError(422, 'Unprocessable', { taskDescription: '任務描述不可超過 500 字' })
    expect(serverFieldErrors(err)).toEqual({ taskDescription: '任務描述不可超過 500 字' })
  })
  it('403 → null(交由既有訊息處理)', () => {
    expect(serverFieldErrors(new ApiError(403, 'forbidden'))).toBeNull()
  })
  it('422 但沒有 fieldErrors → null', () => {
    expect(serverFieldErrors(new ApiError(422, 'Unprocessable'))).toBeNull()
  })
  it('非 ApiError → null', () => {
    expect(serverFieldErrors(new Error('x'))).toBeNull()
  })
})
