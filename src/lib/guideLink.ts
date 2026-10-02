import type { View } from '../types'

/**
 * 入口頁說明中心（vportal docs/guides/vsms）的深連結：頂欄「使用說明」依目前頁面開到對應篇章。
 * 同源相對路徑（代理把 / 交給 vauth），不經 withBase。slug 要跟 F:\vportal\docs\guides\vsms 的檔名一致。
 */
export const GUIDE_SLUG_BY_VIEW: Record<View, string> = {
  main: 'schedules',
  analytics: 'analytics',
  settings: 'settings',
  audit: 'audit',
  accounts: 'settings',
}

export function guideHref(view: View): string {
  return `/guide/vsms/${GUIDE_SLUG_BY_VIEW[view]}`
}
