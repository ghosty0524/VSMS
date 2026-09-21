import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: { ...actual.api, logout: vi.fn(async () => ({ ok: true })) } }
})

import { useAuthStore } from '../store/authStore'

// 單一登入模式下，系統內登出必須把 VTMS 的本地 session 也結束掉，
// 否則在 VSMS 按登出後改網址到 /vtms/ 仍是登入狀態。與入口頁的登出行為一致。
const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore.setState({ isLoggedIn: true, authProvider: 'local' })
})
afterEach(() => { vi.unstubAllGlobals() })

const calledPaths = () => fetchMock.mock.calls.map(c => String((c as unknown[])[0]))

describe('authStore.logout 單一登出', () => {
  it('vauth 模式：結束 VTMS 的本地 session，再撤銷 SSO', async () => {
    useAuthStore.setState({ authProvider: 'vauth' })
    // 登出要等三個請求都完成才把 isLoggedIn 設為 false：App 一看到未登入就會導回入口頁，
    // 導頁會中斷還在飛的請求，SSO 撤銷沒送出去的話入口頁仍是登入狀態。
    const p = useAuthStore.getState().logout()
    expect(useAuthStore.getState().isLoggedIn).toBe(true)
    await p
    const paths = calledPaths()
    expect(paths).toContain('/vtms/api/logout')
    expect(paths.indexOf('/vtms/api/logout')).toBeLessThan(paths.indexOf('/auth/session/logout'))
    for (const c of fetchMock.mock.calls) {
      const init = (c as unknown[])[1] as RequestInit
      expect(init.method).toBe('POST')
      expect(init.credentials).toBe('same-origin')
    }
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
  })

  it('local 模式：不碰 VTMS 也不碰 SSO', async () => {
    await useAuthStore.getState().logout()
    expect(calledPaths()).toEqual([])
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
  })
})
