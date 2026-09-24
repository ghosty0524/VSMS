// src/__tests__/protectedLayout-initError.test.tsx
// 登入後初始化（排程＋選項）失敗時，畫面要顯示失敗狀態與重試，不能永遠停在
// 「載入資料中…」（UI 統一第 3 項 E，規格修正清單第 5 項）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProtectedLayout } from '../components/ProtectedLayout'
import { LoadingScreen } from '../components/shared/LoadingScreen'
import { useAuthStore } from '../store/authStore'
import { useScheduleStore } from '../store/scheduleStore'
import { useOptionsStore } from '../store/optionsStore'

const originalScheduleInit = useScheduleStore.getState().init
const originalOptionsInit = useOptionsStore.getState().init
const scheduleInit = vi.fn<() => Promise<void>>()
const optionsInit = vi.fn<() => Promise<void>>()

beforeEach(() => {
  scheduleInit.mockReset()
  optionsInit.mockReset()
  optionsInit.mockResolvedValue(undefined)
  useScheduleStore.setState({ init: scheduleInit })
  useOptionsStore.setState({ init: optionsInit })
  useAuthStore.setState({ isLoggedIn: true })
  // ProtectedLayout 失敗時仍會 console.error，測試輸出不要被洗版
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  useScheduleStore.setState({ init: originalScheduleInit })
  useOptionsStore.setState({ init: originalOptionsInit })
  vi.restoreAllMocks()
})

function renderLayout() {
  return render(<ProtectedLayout><p>主畫面</p></ProtectedLayout>)
}

describe('ProtectedLayout 初始化', () => {
  it('讀取中：顯示「載入資料中…」', () => {
    scheduleInit.mockReturnValue(new Promise<void>(() => {}))
    renderLayout()
    expect(screen.getByText('載入資料中…')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('成功：直接進入頁面', async () => {
    scheduleInit.mockResolvedValue(undefined)
    renderLayout()
    expect(await screen.findByText('主畫面')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('失敗：顯示「無法載入排程資料」與錯誤小字，不再停在載入中', async () => {
    scheduleInit.mockRejectedValue(new Error('HTTP 503'))
    renderLayout()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程資料')
    expect(alert).toHaveTextContent('HTTP 503')
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
    expect(screen.queryByText('載入資料中…')).toBeNull()
    expect(screen.queryByText('主畫面')).toBeNull()
  })

  it('按重試：重新跑同一個初始化，成功後進入頁面', async () => {
    scheduleInit
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    renderLayout()

    await user.click(await screen.findByRole('button', { name: '重試' }))

    expect(await screen.findByText('主畫面')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(scheduleInit).toHaveBeenCalledTimes(2)
    expect(optionsInit).toHaveBeenCalledTimes(2)
  })

  it('重試又失敗：仍是失敗狀態，顯示新的錯誤訊息', async () => {
    scheduleInit
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockRejectedValueOnce(new Error('HTTP 504'))
    const user = userEvent.setup()
    renderLayout()

    await user.click(await screen.findByRole('button', { name: '重試' }))

    expect(await screen.findByText('HTTP 504')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('無法載入排程資料')
    expect(scheduleInit).toHaveBeenCalledTimes(2)
  })
})

describe('LoadingScreen', () => {
  it('沒傳 error：維持原本的轉圈＋文字，沒有失敗狀態', () => {
    render(<LoadingScreen text="連線中…" />)
    expect(screen.getByText('連線中…')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('傳 error：標題用 text，錯誤放小字，有重試', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<LoadingScreen text="無法載入排程資料" error="HTTP 503" onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('無法載入排程資料')
    expect(alert).toHaveTextContent('HTTP 503')
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
