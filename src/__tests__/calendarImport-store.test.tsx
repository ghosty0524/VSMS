// 匯入改成後端一次完成：前端只發一個 POST，成功後用回應更新 store。
// 不更新 store 的話，設定頁下一次整份 PUT options 會把剛匯入的日期蓋掉。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalendarImport from '../components/settings/CalendarImport'
import { useOptionsStore } from '../store/optionsStore'
import { DEFAULT_OPTIONS } from '../constants'

beforeEach(() => { useOptionsStore.setState({ options: { ...DEFAULT_OPTIONS, restDays: { weekends: true, specificDates: ['2026/01/01'] } } }) })
afterEach(() => { vi.unstubAllGlobals() })

describe('CalendarImport', () => {
  it('只呼叫一次匯入 API，並用回應的完整清單更新 store', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({
      ok: true, year: 2026, detected: 2, added: 1, skipped: 1, specificDates: ['2026/01/01', '2026/02/27'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<CalendarImport />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], '115年辦公日曆表.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /匯入/ }))

    expect(await screen.findByText('匯入成功（2026 年）')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/calendar/import-government')
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/01/01', '2026/02/27'])
  })

  it('後端拒絕時顯示訊息，store 不變', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false, message: '解析結果不合理：2026-10 有 18 個平日被判為放假',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })))

    const { container } = render(<CalendarImport />)
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'a.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: /匯入/ }))

    expect(await screen.findByText(/2026-10 有 18 個平日/)).toBeTruthy()
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2026/01/01'])
  })
})
