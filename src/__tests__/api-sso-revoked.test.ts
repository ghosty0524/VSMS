// src/__tests__/api-sso-revoked.test.ts
// ssoRecheck（後端）偵測到 SSO session 已撤銷時回 401 + code SSO_REVOKED；
// 前端要跟 checkAuth() 抓到一般的 401 一樣把 isLoggedIn 設回 false，
// 讓 App 在 vauth 模式下既有的「未登入就導回入口頁」邏輯接手，不用另外寫導頁。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../store/authStore'

afterEach(() => { vi.unstubAllGlobals() })

describe('401 SSO_REVOKED', () => {
  it('讓 authStore.isLoggedIn 變 false（與一般 session 過期同樣的反應）', async () => {
    useAuthStore.setState({ isLoggedIn: true, isChecking: false, authProvider: 'vauth', role: 'user' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ok: false, code: 'SSO_REVOKED', message: '單一登入已失效，請重新登入' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )))

    const err = await api.getSchedules().catch(e => e) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('SSO_REVOKED')
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
  })

  it('一般 401（沒有 SSO_REVOKED code）不動 authStore', async () => {
    useAuthStore.setState({ isLoggedIn: true, isChecking: false, authProvider: 'vauth', role: 'user' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ ok: false, message: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )))

    await api.getSchedules().catch(() => undefined)
    expect(useAuthStore.getState().isLoggedIn).toBe(true)
  })
})
