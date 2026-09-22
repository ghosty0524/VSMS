import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// 單一登入模式（vauth）下 VSMS 未登入時一律導回入口頁，與 VTMS 一致；
// 只有入口頁的訪客連結（?guest=1）例外，直接以訪客登入。
const apiMock = vi.hoisted(() => ({
  config: vi.fn(async () => ({ authProvider: 'vauth' as const })),
  me: vi.fn(async () => { throw new Error('401') }),
  guestLogin: vi.fn(async () => ({ ok: true, username: 'Guest', displayName: '訪客', role: 'guest', sessionId: 'g1' })),
  logout: vi.fn(async () => ({ ok: true })),
}))
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, ...apiMock } }
})

import { App } from '../App'
import { useAuthStore } from '../store/authStore'

const replace = vi.fn()
const originalLocation = window.location

function setLocation(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, search, pathname: '/', replace, href: '/' + search },
  })
}

beforeEach(() => {
  replace.mockClear()
  apiMock.guestLogin.mockClear()
  apiMock.config.mockImplementation(async () => ({ authProvider: 'vauth' as const }))
  useAuthStore.setState({ isLoggedIn: false, isChecking: true, authProvider: 'local', role: null })
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined)
})
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  vi.restoreAllMocks()
})

describe('App 在單一登入模式下的未登入閘門', () => {
  it('vauth 未登入 → 導回入口頁，不顯示本地登入頁', async () => {
    setLocation('')
    render(<App />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(screen.queryByText('前往入口頁登入')).toBeNull()
    expect(apiMock.guestLogin).not.toHaveBeenCalled()
  })

  it('vauth 帶 ?guest=1 → 以訪客登入，不導回入口頁', async () => {
    setLocation('?guest=1')
    render(<App />)
    await waitFor(() => expect(apiMock.guestLogin).toHaveBeenCalled())
    expect(replace).not.toHaveBeenCalled()
  })

  it('vauth 帶 ?guest=1：訪客登入還沒回來時再 render 一次，也不能導回入口頁、不能重複登入', async () => {
    // 實機重現：入口頁按「以訪客身分瀏覽」有時會被彈回入口頁。原因是 App 在 render 裡
    // 先 replaceState 把 ?guest=1 拿掉、再發訪客登入；登入還沒回來前只要 store 再更新
    // 一次（StrictMode 或第二次 checkAuth），下一次 render 看不到參數就走 replace('/')。
    setLocation('?guest=1')
    vi.mocked(window.history.replaceState).mockImplementation((_s, _t, url) => {
      setLocation(String(url).includes('?') ? String(url).slice(String(url).indexOf('?')) : '')
    })
    let resolveGuest: (v: { ok: boolean; username: string; displayName: string; role: string; sessionId: string }) => void = () => {}
    apiMock.guestLogin.mockImplementation(() => new Promise(r => { resolveGuest = r }))
    render(<App />)
    await waitFor(() => expect(apiMock.guestLogin).toHaveBeenCalledTimes(1))
    // 登入還在飛：模擬第二次 checkAuth 落地（同樣的未登入結果）觸發重新 render
    useAuthStore.setState({ isLoggedIn: false, isChecking: false })
    await waitFor(() => expect(screen.getByText('以訪客身分進入…')).toBeInTheDocument())
    expect(replace).not.toHaveBeenCalled()
    expect(apiMock.guestLogin).toHaveBeenCalledTimes(1)
    resolveGuest({ ok: true, username: 'Guest', displayName: '訪客', role: 'guest', sessionId: 'g1' })
    await waitFor(() => expect(useAuthStore.getState().isLoggedIn).toBe(true))
    expect(replace).not.toHaveBeenCalled()
  })

  it('local 模式未登入 → 仍顯示本地登入頁', async () => {
    setLocation('')
    apiMock.config.mockImplementation(async () => ({ authProvider: 'local' as const }))
    render(<App />)
    await waitFor(() => expect(useAuthStore.getState().isChecking).toBe(false))
    expect(replace).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /登入/ })).toBeInTheDocument()
  })
})
