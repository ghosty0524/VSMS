// 休息日改成單筆 API：刪除只發一個 DELETE、用回應更新清單；失敗時顯示訊息、清單不變。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestDaysManager } from '../components/settings/RestDaysManager'
import { useOptionsStore } from '../store/optionsStore'
import { DEFAULT_OPTIONS } from '../constants'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  useOptionsStore.setState({
    options: { ...DEFAULT_OPTIONS, restDays: { weekends: true, specificDates: ['2026/10/09', '2026/10/26'] } },
  })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('RestDaysManager', () => {
  it('刪除只發一個 DELETE，並用回應更新清單', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => json({ weekends: true, specificDates: ['2026/10/26'] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<RestDaysManager />)
    await userEvent.click(screen.getAllByRole('button', { name: /刪除/ })[0])

    await waitFor(() => expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/10/26']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/options/rest-days/2026-10-09')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('失敗時顯示伺服器訊息，清單不變', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, message: '權限不足' }, 403)))

    render(<RestDaysManager />)
    await userEvent.click(screen.getAllByRole('button', { name: /刪除/ })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('權限不足')
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/10/09', '2026/10/26'])
  })

  it('不再有週末開關的整份存檔：store 沒有 setRestDays', () => {
    expect('setRestDays' in useOptionsStore.getState()).toBe(false)
  })
})

describe('optionsStore.addRestDay', () => {
  it('發一個 POST 帶 { date }，用回應更新 store', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      json({ weekends: true, specificDates: ['2026/10/09', '2026/10/26', '2026/12/25'] }))
    vi.stubGlobal('fetch', fetchMock)

    await useOptionsStore.getState().addRestDay('2026/12/25')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/api/options/rest-days')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ date: '2026/12/25' })
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/10/09', '2026/10/26', '2026/12/25'])
  })
})
