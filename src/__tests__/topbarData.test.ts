// src/__tests__/topbarData.test.ts
// 全域頂欄（UI 統一 4A）的資料來源：vauth 的系統入口與未讀數。兩支 API 都在站台
// 根目錄（不在 /vsms/ 底下），不經 withBase、不經 lib/api.ts。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CURRENT_APP_CODE, FALLBACK_APPS, ROLE_LABELS, PORTAL_HOME_LABEL, PORTAL_HOME_URL,
  INBOX_URL, CHANGE_PASSWORD_URL,
  parsePortalApps, fetchPortalApps, fetchUnreadCount, formatUnreadBadge, avatarInitials,
} from '../lib/topbarData'

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
  new Response('{}', { status: 200 }))

function respondOnce(status: number, body: unknown) {
  fetchMock.mockImplementationOnce(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('常數', () => {
  it('目前系統是 vsms；退回清單是 VTMS、VSMS，全部顯示在頂欄', () => {
    expect(CURRENT_APP_CODE).toBe('vsms')
    expect(FALLBACK_APPS.map(a => [a.code, a.name, a.url])).toEqual([
      ['vtms', 'VTMS', '/vtms/'],
      ['vsms', 'VSMS', '/vsms/'],
    ])
    expect(FALLBACK_APPS.every(a => a.showInTopbar)).toBe(true)
  })

  it('入口頁網址都是站台根目錄的絕對路徑', () => {
    expect(PORTAL_HOME_LABEL).toBe('入口頁首頁')
    expect(PORTAL_HOME_URL).toBe('/')
    expect(INBOX_URL).toBe('/inbox')
    expect(CHANGE_PASSWORD_URL).toBe('/change-password')
  })

  it('VSMS 角色中文', () => {
    expect(ROLE_LABELS).toEqual({
      super_admin: '超級管理者',
      admin: '管理者',
      user: '測試人員',
      guest: '訪客（唯讀）',
    })
  })
})

describe('parsePortalApps', () => {
  it('依 sortOrder 排序；缺 showInTopbar 視為真、false 保留；缺 description 補空字串', () => {
    const apps = parsePortalApps({ apps: [
      { code: 'lab', name: '實驗室', url: '/lab/', sortOrder: 3, showInTopbar: false },
      { code: 'vsms', name: 'VSMS', description: '排程', url: '/vsms/', sortOrder: 2 },
      { code: 'vtms', name: 'VTMS', description: '測試', url: '/vtms/', sortOrder: 1, showInTopbar: true },
    ] })
    expect(apps).toEqual([
      { code: 'vtms', name: 'VTMS', description: '測試', url: '/vtms/', sortOrder: 1, showInTopbar: true },
      { code: 'vsms', name: 'VSMS', description: '排程', url: '/vsms/', sortOrder: 2, showInTopbar: true },
      { code: 'lab', name: '實驗室', description: '', url: '/lab/', sortOrder: 3, showInTopbar: false },
    ])
  })

  it('略過缺 code／name／url 的項目', () => {
    const apps = parsePortalApps({ apps: [
      null,
      { code: 'x', name: 'X' },
      { code: 'vtms', name: 'VTMS', url: '/vtms/', sortOrder: 1 },
    ] })
    expect(apps.map(a => a.code)).toEqual(['vtms'])
  })

  it('形狀不對就 throw（由呼叫端退回內建清單）', () => {
    expect(() => parsePortalApps(null)).toThrow()
    expect(() => parsePortalApps({})).toThrow()
    expect(() => parsePortalApps([])).toThrow()
  })

  it('空清單是合法的（全部停用），不 throw', () => {
    expect(parsePortalApps({ apps: [] })).toEqual([])
  })
})

describe('fetchPortalApps', () => {
  it('打站台根目錄的 /portal/apps，帶同源 cookie', async () => {
    respondOnce(200, { apps: [{ code: 'vtms', name: 'VTMS', url: '/vtms/', sortOrder: 1 }] })
    const apps = await fetchPortalApps()
    expect(apps.map(a => a.code)).toEqual(['vtms'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/portal/apps')
    expect(init?.credentials).toBe('same-origin')
  })

  it('HTTP 錯誤時 reject', async () => {
    respondOnce(401, { code: 'NO_SESSION' })
    await expect(fetchPortalApps()).rejects.toThrow()
  })
})

describe('fetchUnreadCount', () => {
  it('打 /notify/inbox?limit=1，回傳 unreadCount', async () => {
    respondOnce(200, { items: [], unreadCount: 12, total: 40 })
    await expect(fetchUnreadCount()).resolves.toBe(12)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/notify/inbox?limit=1')
    expect(init?.credentials).toBe('same-origin')
  })

  it('HTTP 錯誤或沒有 unreadCount 時 reject', async () => {
    respondOnce(500, {})
    await expect(fetchUnreadCount()).rejects.toThrow()
    respondOnce(200, { items: [] })
    await expect(fetchUnreadCount()).rejects.toThrow()
  })
})

describe('formatUnreadBadge', () => {
  it('null 與 0 不顯示；1～99 照實；超過 99 顯示 99+', () => {
    expect(formatUnreadBadge(null)).toBeNull()
    expect(formatUnreadBadge(0)).toBeNull()
    expect(formatUnreadBadge(1)).toBe('1')
    expect(formatUnreadBadge(99)).toBe('99')
    expect(formatUnreadBadge(100)).toBe('99+')
    expect(formatUnreadBadge(1500)).toBe('99+')
  })
})

describe('avatarInitials', () => {
  it('名稱前兩個字元轉大寫', () => {
    expect(avatarInitials('Will Wang')).toBe('WI')
    expect(avatarInitials('paul')).toBe('PA')
    expect(avatarInitials('系統管理員')).toBe('系統')
    expect(avatarInitials('  訪客 ')).toBe('訪客')
  })

  it('空名稱顯示 ?', () => {
    expect(avatarInitials('')).toBe('?')
  })
})
