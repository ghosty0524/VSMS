// src/components/layout/useTopbarData.ts
//
// 頂欄掛載時各讀一次系統清單與未讀數，不輪詢（規格「資料來源」）。
// - 系統清單：只在 vauth 模式讀；讀取中回 null（呼叫端先不畫並排連結，免得內建清單
//   閃一下又被換掉），失敗退回內建清單。非 vauth 直接用內建清單。
// - 未讀數：只在 vauth 模式、非訪客時讀；失敗、讀取中一律 null（不顯示數字）。
//   這支 API 在 vauth，不會延長 VSMS 自己的 session。
// vauth／guest 在頂欄掛載前就定了（checkAuth 先讀 config 再驗 session），effect 只會跑一次。
import { useEffect, useState } from 'react'
import { FALLBACK_APPS, fetchPortalApps, fetchUnreadCount, type TopbarApp } from '../../lib/topbarData'

export interface TopbarData {
  /** null：vauth 模式讀取中。 */
  apps: readonly TopbarApp[] | null
  /** null：不顯示數字（非 vauth、訪客、讀取中或讀取失敗）。 */
  unreadCount: number | null
}

export function useTopbarData({ vauth, guest }: { vauth: boolean; guest: boolean }): TopbarData {
  const [apps, setApps] = useState<readonly TopbarApp[] | null>(vauth ? null : FALLBACK_APPS)
  const [unreadCount, setUnreadCount] = useState<number | null>(null)

  useEffect(() => {
    if (!vauth) { setApps(FALLBACK_APPS); return }
    let cancelled = false
    fetchPortalApps()
      .then(list => { if (!cancelled) setApps(list) })
      .catch(() => { if (!cancelled) setApps(FALLBACK_APPS) })
    return () => { cancelled = true }
  }, [vauth])

  useEffect(() => {
    if (!vauth || guest) { setUnreadCount(null); return }
    let cancelled = false
    fetchUnreadCount()
      .then(n => { if (!cancelled) setUnreadCount(n) })
      .catch(() => { if (!cancelled) setUnreadCount(null) })
    return () => { cancelled = true }
  }, [vauth, guest])

  return { apps, unreadCount }
}
