// src/__tests__/useTopbarData.test.tsx
// 頂欄掛載時各讀一次系統清單與未讀數（不輪詢）；失敗或非 vauth 退回內建清單、
// 不顯示數字；訪客不讀未讀數。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useTopbarData } from '../components/layout/useTopbarData'
import { FALLBACK_APPS } from '../lib/topbarData'

const APPS_URL = '/portal/apps'
const INBOX_URL = '/notify/inbox?limit=1'

type Route = { status: number; body: unknown }
let routes: Record<string, Route> = {}
const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
  const r = routes[String(input)]
  if (!r) return new Response('{}', { status: 404 })
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
const calls = (url: string) => fetchMock.mock.calls.filter(c => String(c[0]) === url).length
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

beforeEach(() => {
  fetchMock.mockClear()
  routes = {
    [APPS_URL]: { status: 200, body: { apps: [
      { code: 'vsms', name: 'VSMS', description: '排程', url: '/vsms/', sortOrder: 2, showInTopbar: true },
      { code: 'vtms', name: 'VTMS', description: '測試', url: '/vtms/', sortOrder: 1, showInTopbar: false },
    ] } },
    [INBOX_URL]: { status: 200, body: { items: [], unreadCount: 7, total: 9 } },
  }
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useTopbarData', () => {
  it('非 vauth：不打任何請求，直接用內建清單、不顯示數字', async () => {
    const { result } = renderHook(() => useTopbarData({ vauth: false, guest: false }))
    expect(result.current.apps).toEqual(FALLBACK_APPS)
    expect(result.current.unreadCount).toBeNull()
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('vauth：讀取中 apps 為 null，讀到後換成伺服器清單與未讀數', async () => {
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    expect(result.current.apps).toBeNull()
    await waitFor(() => expect(result.current.apps?.map(a => a.code)).toEqual(['vtms', 'vsms']))
    expect(result.current.apps?.[0].showInTopbar).toBe(false)
    await waitFor(() => expect(result.current.unreadCount).toBe(7))
  })

  it('vauth：/portal/apps 失敗退回內建清單', async () => {
    routes[APPS_URL] = { status: 500, body: {} }
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    await waitFor(() => expect(result.current.apps).toEqual(FALLBACK_APPS))
  })

  it('vauth：未讀數讀取失敗不顯示數字', async () => {
    routes[INBOX_URL] = { status: 502, body: {} }
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    await waitFor(() => expect(calls(INBOX_URL)).toBe(1))
    await flush()
    expect(result.current.unreadCount).toBeNull()
  })

  it('訪客：仍讀系統清單，但不讀未讀數', async () => {
    const { result } = renderHook(() => useTopbarData({ vauth: true, guest: true }))
    await waitFor(() => expect(result.current.apps?.length).toBe(2))
    await flush()
    expect(calls(APPS_URL)).toBe(1)
    expect(calls(INBOX_URL)).toBe(0)
    expect(result.current.unreadCount).toBeNull()
  })

  it('只在掛載時讀一次：重新 render 不再打請求', async () => {
    const { result, rerender } = renderHook(() => useTopbarData({ vauth: true, guest: false }))
    await waitFor(() => expect(result.current.unreadCount).toBe(7))
    rerender()
    rerender()
    await flush()
    expect(calls(APPS_URL)).toBe(1)
    expect(calls(INBOX_URL)).toBe(1)
  })
})
