// src/__tests__/loginPage.test.tsx
// VSMS 的 local 模式登入頁（UI 統一 4B，只換色）：標誌改成 Validation Workspace 的
// 勾勾圖形、「登入」主按鈕改墨色、輸入框 40px＋token 邊框；背景、人數上限錯誤、
// 重複登入警告與訪客入口維持原樣。正式環境是單一登入（vauth），這一頁只在退版
// （AUTH_PROVIDER=local）時出現。
// 規格：F:\vportal\docs\superpowers\specs\2026-09-24-login-page-design.md 第 C 節。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../components/layout/LoginPage'
import { useAuthStore } from '../store/authStore'

const WARNING = '目前已有其他人員登入此系統，若繼續登入，對方 session 將於下次操作時失效。'
const LIMIT = '目前已達登入人數上限（30 人），請稍後再試'

const original = {
  login: useAuthStore.getState().login,
  guestLogin: useAuthStore.getState().guestLogin,
  clearErrors: useAuthStore.getState().clearErrors,
}
const login = vi.fn<(username: string, password: string, force?: boolean) => Promise<void>>()
const guestLogin = vi.fn<() => Promise<void>>()
// 照真的 clearErrors 清掉兩個訊息，畫面才會跟著收起警告。
const clearErrors = vi.fn(() => { useAuthStore.setState({ loginError: '', loginWarning: '' }) })

beforeEach(() => {
  login.mockReset()
  login.mockResolvedValue(undefined)
  guestLogin.mockReset()
  guestLogin.mockResolvedValue(undefined)
  clearErrors.mockClear()
  useAuthStore.setState({
    isChecking: false,
    isLoggedIn: false,
    authProvider: 'local',
    loginError: '',
    loginWarning: '',
    login,
    guestLogin,
    clearErrors,
  })
})

afterEach(() => {
  useAuthStore.setState({ ...original, loginError: '', loginWarning: '' })
})

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('請輸入帳號'), 'Will_Wang')
  await user.type(screen.getByPlaceholderText('請輸入密碼'), 'secret')
  await user.click(screen.getByRole('button', { name: '登入' }))
}

describe('LoginPage 外觀（UI 統一 4B）', () => {
  it('標誌是 Validation Workspace 的勾勾圖形，28×28、圓角 7px、底色 --vw-accent；標題與副標不變', () => {
    const { container } = render(<LoginPage />)
    const logo = screen.getByTestId('login-logo')
    expect(logo).toHaveAttribute('aria-hidden', 'true')
    expect(logo).toHaveClass('w-7', 'h-7', 'rounded-[7px]', 'bg-[var(--vw-accent)]', 'text-white')
    expect(logo).not.toHaveClass('bg-blue-600')
    // lucide Check：與 4A 頂欄標誌同一個圖形
    const svg = logo.querySelector('svg.lucide-check')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M20 6 9 17l-5-5')
    // 舊的剪貼簿圖形不在了
    expect(container.querySelector('path[d^="M9 5H7"]')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'VSMS' })).toBeInTheDocument()
    expect(screen.getByText('Validation Schedule Management System')).toBeInTheDocument()
  })

  it('「登入」主按鈕是墨色（stone-900＝--vw-ink）、44px、15px 粗體、圓角 6px', () => {
    render(<LoginPage />)
    const btn = screen.getByRole('button', { name: '登入' })
    expect(btn).toHaveAttribute('type', 'submit')
    expect(btn).toHaveClass(
      'bg-stone-900', 'hover:bg-stone-800', 'text-white',
      'h-11', 'text-[15px]', 'font-semibold', 'rounded-md',
    )
    expect(btn).not.toHaveClass('bg-blue-600')
  })

  it('帳號、密碼輸入框：高 40px、左右內距 12px、--vw-border-strong 邊框、圓角 6px、14px 字', () => {
    render(<LoginPage />)
    for (const placeholder of ['請輸入帳號', '請輸入密碼']) {
      const input = screen.getByPlaceholderText(placeholder)
      expect(input).toHaveClass('h-10', 'px-3', 'border', 'border-[var(--vw-border-strong)]', 'rounded-md', 'text-sm')
      expect(input).not.toHaveClass('border-gray-300')
    }
    expect(screen.getByPlaceholderText('請輸入帳號')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByPlaceholderText('請輸入密碼')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('背景維持 app-ground', () => {
    const { container } = render(<LoginPage />)
    expect(container.firstElementChild).toHaveClass('app-ground', 'h-screen')
  })

  it('不加左側品牌區，也不加「忘記密碼請洽系統管理員」', () => {
    render(<LoginPage />)
    expect(screen.queryByText('忘記密碼請洽系統管理員')).toBeNull()
    expect(screen.queryByText(/單一工作入口/)).toBeNull()
  })
})

describe('LoginPage 行為與不換色的部分維持原樣', () => {
  it('沒填帳密時「登入」停用；填好按下 → login(帳號, 密碼)', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: '登入' })).toBeDisabled()
    await fillAndSubmit(user)
    expect(login).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith('Will_Wang', 'secret', undefined)
  })

  it('重複登入警告：表單收起、黃框樣式不變，「繼續登入」以 force 重送', async () => {
    login.mockImplementation(async (_username, _password, force) => {
      if (!force) useAuthStore.setState({ loginWarning: WARNING })
    })
    const user = userEvent.setup()
    render(<LoginPage />)
    await fillAndSubmit(user)

    const warning = await screen.findByText(WARNING)
    expect(warning.parentElement).toHaveClass('bg-amber-50', 'border-amber-200')
    expect(screen.queryByPlaceholderText('請輸入帳號')).toBeNull()
    const proceed = screen.getByRole('button', { name: '繼續登入' })
    expect(proceed).toHaveClass('bg-amber-500')
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()

    await user.click(proceed)
    expect(login).toHaveBeenLastCalledWith('Will_Wang', 'secret', true)
  })

  it('重複登入警告按「取消」：清掉警告、回到空白表單', async () => {
    login.mockImplementation(async (_username, _password, force) => {
      if (!force) useAuthStore.setState({ loginWarning: WARNING })
    })
    const user = userEvent.setup()
    render(<LoginPage />)
    await fillAndSubmit(user)
    await screen.findByText(WARNING)

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(clearErrors).toHaveBeenCalled()
    expect(screen.queryByText(WARNING)).toBeNull()
    expect(screen.getByPlaceholderText('請輸入帳號')).toHaveValue('')
    expect(screen.getByPlaceholderText('請輸入密碼')).toHaveValue('')
  })

  it('人數上限錯誤：紅框（Users 圖示）照舊，表單內的一般錯誤行不重複顯示', () => {
    useAuthStore.setState({ loginError: LIMIT })
    render(<LoginPage />)
    const messages = screen.getAllByText(LIMIT)
    expect(messages).toHaveLength(1)
    const box = messages[0].closest('.bg-red-50')
    expect(box).not.toBeNull()
    expect(box).toHaveClass('border-red-200')
    expect(box?.querySelector('svg.lucide-users')).not.toBeNull()
  })

  it('一般錯誤（非上限）顯示在表單內那一行，樣式不變', () => {
    useAuthStore.setState({ loginError: '帳號或密碼錯誤' })
    render(<LoginPage />)
    expect(screen.getByText('帳號或密碼錯誤')).toHaveClass('text-red-500', 'text-xs')
  })

  it('訪客入口照舊：「或」分隔線與白底次按鈕，按下呼叫 guestLogin', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    expect(screen.getByText('或')).toBeInTheDocument()
    const guest = screen.getByRole('button', { name: '以訪客身分瀏覽（唯讀）' })
    expect(guest).toHaveClass('border-gray-300', 'text-gray-600', 'rounded-lg')
    await user.click(guest)
    expect(guestLogin).toHaveBeenCalledTimes(1)
  })

  it('單一登入模式（vauth）不顯示帳密表單', () => {
    useAuthStore.setState({ authProvider: 'vauth' })
    render(<LoginPage />)
    expect(screen.queryByPlaceholderText('請輸入帳號')).toBeNull()
    expect(screen.queryByRole('button', { name: '登入' })).toBeNull()
  })
})
