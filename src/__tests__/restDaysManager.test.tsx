// 休息日改成單筆 API：刪除只發一個 DELETE、用回應更新清單；失敗時顯示訊息、清單不變。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RestDaysManager } from '../components/settings/RestDaysManager'
import { useOptionsStore } from '../store/optionsStore'
import { useAuthStore } from '../store/authStore'
import { DEFAULT_OPTIONS } from '../constants'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  useOptionsStore.setState({
    options: { ...DEFAULT_OPTIONS, restDays: { weekends: true, specificDates: ['2099/10/09', '2099/10/26'] } },
  })
  useAuthStore.setState({ role: 'admin' })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('RestDaysManager', () => {
  it('刪除只發一個 DELETE，並用回應更新清單', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => json({ weekends: true, specificDates: ['2099/10/26'] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<RestDaysManager />)
    await userEvent.click(screen.getAllByRole('button', { name: /刪除/ })[0])

    await waitFor(() => expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2099/10/26']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/options/rest-days/2099-10-09')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('失敗時顯示伺服器訊息，清單不變', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, message: '權限不足' }, 403)))

    render(<RestDaysManager />)
    await userEvent.click(screen.getAllByRole('button', { name: /刪除/ })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('權限不足')
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2099/10/09', '2099/10/26'])
  })

  it('不再有週末開關的整份存檔：store 沒有 setRestDays', () => {
    expect('setRestDays' in useOptionsStore.getState()).toBe(false)
  })
})

describe('optionsStore.addRestDay', () => {
  it('發一個 POST 帶 { date }，用回應更新 store', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      json({ weekends: true, specificDates: ['2099/10/09', '2099/10/26', '2026/12/25'] }))
    vi.stubGlobal('fetch', fetchMock)

    await useOptionsStore.getState().addRestDay('2026/12/25')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/api/options/rest-days')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ date: '2026/12/25' })
    expect(useOptionsStore.getState().options.restDays.specificDates).toEqual(['2099/10/09', '2099/10/26', '2026/12/25'])
  })
})

// 年度日曆：點選多天後一次送出 batch；已結束的日期收合；非管理員只能看
function weekdayOfThisYear(month: number, nth = 1): string {
  const y = new Date().getFullYear()
  const d = new Date(y, month, 1)
  let found = 0
  for (;;) {
    if (d.getDay() !== 0 && d.getDay() !== 6 && ++found === nth) break
    d.setDate(d.getDate() + 1)
  }
  return `${y}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
const dash = (v: string) => v.replace(/\//g, '-')

describe('RestDaysManager 年度日曆', () => {
  it('點兩個平日、取消一個已存在的休息日，一次送出 batch 並用回應更新清單', async () => {
    const existing = weekdayOfThisYear(2, 5)
    const a = weekdayOfThisYear(4, 1)
    const b = weekdayOfThisYear(4, 2)
    useOptionsStore.setState({ options: { ...DEFAULT_OPTIONS, restDays: { weekends: true, specificDates: [existing] } } })
    const fetchMock = vi.fn(async (..._args: unknown[]) => json({ weekends: true, specificDates: [a, b].sort() }))
    vi.stubGlobal('fetch', fetchMock)

    render(<RestDaysManager />)
    await userEvent.click(screen.getByRole('button', { name: dash(a) }))
    await userEvent.click(screen.getByRole('button', { name: dash(b) }))
    await userEvent.click(screen.getByRole('button', { name: `${dash(existing)}，休息日` }))
    expect(screen.getByText(/待儲存/)).toHaveTextContent('新增 2 天、移除 1 天')
    expect(fetchMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '儲存變更' }))

    await waitFor(() => expect(useOptionsStore.getState().options.restDays.specificDates).toEqual([a, b].sort()))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/api/options/rest-days/batch')
    expect(JSON.parse(String(init.body))).toEqual({ add: [a, b].sort(), remove: [existing] })
    expect(screen.queryByText(/待儲存/)).toBeNull()
  })

  it('同一天點兩下等於沒變；取消會清掉待儲存', async () => {
    const a = weekdayOfThisYear(5, 3)
    render(<RestDaysManager />)
    await userEvent.click(screen.getByRole('button', { name: dash(a) }))
    await userEvent.click(screen.getByRole('button', { name: `${dash(a)}，將新增` }))
    expect(screen.queryByText(/待儲存/)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: dash(a) }))
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByText(/待儲存/)).toBeNull()
  })

  it('儲存失敗：顯示訊息、保留待儲存', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, message: '日期格式不正確' }, 400)))
    const a = weekdayOfThisYear(6, 1)
    render(<RestDaysManager />)
    await userEvent.click(screen.getByRole('button', { name: dash(a) }))
    await userEvent.click(screen.getByRole('button', { name: '儲存變更' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('日期格式不正確')
    expect(screen.getByText(/待儲存/)).toHaveTextContent('新增 1 天')
  })

  it('已結束的日期收在「已結束的休息日」裡', () => {
    useOptionsStore.setState({ options: { ...DEFAULT_OPTIONS, restDays: { weekends: true, specificDates: ['2020/01/01', '2020/02/28', '2099/10/09'] } } })
    render(<RestDaysManager />)
    expect(screen.getByText('已結束的休息日（2）')).toBeInTheDocument()
    expect(screen.getByText('已結束的休息日（2）').closest('details')).not.toHaveAttribute('open')
  })

  it('非管理員：日曆不能點、沒有刪除鈕', () => {
    useAuthStore.setState({ role: 'user' })
    render(<RestDaysManager />)
    expect(screen.queryByRole('button', { name: dash(weekdayOfThisYear(4, 1)) })).toBeNull()
    expect(screen.queryAllByRole('button', { name: /刪除/ })).toHaveLength(0)
  })
})
