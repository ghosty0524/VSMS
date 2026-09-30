import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2026-09-30 案例：分頁 sessionStorage 殘留訪客登入的 token，伺服器早已不認；留著會跟著每個
// 請求送出、讓 SSO 認領被略過而永遠進不了 VSMS。checkAuth 一收到 401 就把它清掉。
const apiMock = vi.hoisted(() => ({
  config: vi.fn(async () => ({ authProvider: 'vauth' as const })),
  me: vi.fn(async () => { throw new Error('401') }),
}))
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, ...apiMock } }
})

import { useAuthStore } from '../store/authStore'

beforeEach(() => {
  sessionStorage.clear()
  useAuthStore.setState({ isLoggedIn: false, isChecking: true, authProvider: 'local' })
})

describe('authStore.checkAuth 與殘留的 header token', () => {
  it('伺服器不認 session 時清掉 sessionStorage 的 vsms-session-token', async () => {
    sessionStorage.setItem('vsms-session-token', 'stale-guest-token')
    await useAuthStore.getState().checkAuth()
    expect(sessionStorage.getItem('vsms-session-token')).toBeNull()
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
  })

  it('session 有效時不動 token', async () => {
    apiMock.me.mockResolvedValueOnce({ ok: true, role: 'user', username: 'alice', displayName: 'Alice' } as never)
    sessionStorage.setItem('vsms-session-token', 'live-token')
    await useAuthStore.getState().checkAuth()
    expect(sessionStorage.getItem('vsms-session-token')).toBe('live-token')
  })
})
