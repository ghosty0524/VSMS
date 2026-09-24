// src/lib/topbarData.ts
//
// 全域頂欄（UI 統一 4A）的資料來源與純函式。規格：
// F:\vportal\docs\superpowers\specs\2026-09-24-global-topbar-design.md
//
// 系統入口與收件匣都在 vauth，掛在站台根目錄（/portal/apps、/notify/inbox），
// 不在 VSMS 的 /vsms/ 前綴底下，所以這裡用絕對路徑直接 fetch，不經 withBase，
// 也不經 lib/api.ts 的 req()：那支會加 /api 前綴與 VSMS 的 session 標頭，401 時還會
// 走 SSO_REVOKED 的登出流程——vauth 讀不到不該讓 VSMS 登出。
// 同網域，瀏覽器會帶 SSO cookie（credentials: 'same-origin'）。
import type { Role } from '../types'

/** 本系統在 portal_apps 的代碼，用來標出「目前所在的系統」。內建代碼不能改名。 */
export const CURRENT_APP_CODE = 'vsms'

export interface TopbarApp {
  code: string
  name: string
  description: string
  url: string
  sortOrder: number
  showInTopbar: boolean
}

/**
 * 讀取失敗或非 vauth 模式時的內建清單。規格的退回清單是「入口頁首頁、VTMS、VSMS」；
 * 入口頁首頁是產品切換下拉固定的第一項，不在這裡，所以這裡只有兩個系統。
 * 說明文字與 vauth 的預設種子（auth/sql/008-portal.sql）相同。
 */
export const FALLBACK_APPS: readonly TopbarApp[] = [
  { code: 'vtms', name: 'VTMS', description: '測試計畫、任務、案例、報告', url: '/vtms/', sortOrder: 1, showInTopbar: true },
  { code: 'vsms', name: 'VSMS', description: '工作排程、設備排程、負載分析', url: '/vsms/', sortOrder: 2, showInTopbar: true },
]

export const PORTAL_HOME_LABEL = '入口頁首頁'
export const PORTAL_HOME_URL = '/'
export const INBOX_URL = '/inbox'
/** 入口頁的 React Route（BrowserRouter；舊 Header 的 /#change-password 其實只會到首頁）。 */
export const CHANGE_PASSWORD_URL = '/change-password'

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: '超級管理者',
  admin: '管理者',
  user: '測試人員',
  guest: '訪客（唯讀）',
}

/** GET /portal/apps 的回應 → 依 sortOrder 排好的清單。形狀不對就 throw。 */
export function parsePortalApps(body: unknown): TopbarApp[] {
  const list = typeof body === 'object' && body !== null ? (body as { apps?: unknown }).apps : undefined
  if (!Array.isArray(list)) throw new Error('portal apps: unexpected response')
  const apps: TopbarApp[] = []
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) continue
    const a = raw as Record<string, unknown>
    if (typeof a.code !== 'string' || typeof a.name !== 'string' || typeof a.url !== 'string') continue
    apps.push({
      code: a.code,
      name: a.name,
      description: typeof a.description === 'string' ? a.description : '',
      url: a.url,
      sortOrder: typeof a.sortOrder === 'number' ? a.sortOrder : 0,
      // 規格：前端讀不到 showInTopbar（vauth 還沒上新版）時視為真。
      showInTopbar: a.showInTopbar !== false,
    })
  }
  return apps.sort((x, y) => x.sortOrder - y.sortOrder)
}

export async function fetchPortalApps(): Promise<TopbarApp[]> {
  const res = await fetch('/portal/apps', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`portal apps: HTTP ${res.status}`)
  return parsePortalApps(await res.json())
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch('/notify/inbox?limit=1', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`inbox: HTTP ${res.status}`)
  const body = await res.json() as { unreadCount?: unknown } | null
  const n = body?.unreadCount
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error('inbox: unexpected response')
  return Math.floor(n)
}

/** 徽章文字；null 表示不顯示徽章。 */
export function formatUnreadBadge(n: number | null): string | null {
  if (n === null || !(n > 0)) return null
  return n > 99 ? '99+' : String(n)
}

/** 頭像縮寫：名稱前兩個字元轉大寫（Array.from 以免切壞 surrogate pair）。 */
export function avatarInitials(name: string): string {
  const head = Array.from(name.trim()).slice(0, 2).join('')
  return head ? head.toUpperCase() : '?'
}
