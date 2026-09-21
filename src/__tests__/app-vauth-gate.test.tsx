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

  it('local 模式未登入 → 仍顯示本地登入頁', async () => {
    setLocation('')
    apiMock.config.mockImplementation(async () => ({ authProvider: 'local' as const }))
    render(<App />)
    await waitFor(() => expect(useAuthStore.getState().isChecking).toBe(false))
    expect(replace).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /登入/ })).toBeInTheDocument()
  })
})
