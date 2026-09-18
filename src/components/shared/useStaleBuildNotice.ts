import { withBase } from '../../lib/basePath';
// src/components/shared/useStaleBuildNotice.ts
// 判斷「這個分頁載入的前端版本」是否已經舊了：啟動時記錄一次 /api/build 回傳的
// build 值，之後在視窗取得焦點、以及每隔一段時間輪詢當作 backstop；一旦偵測到
// 版本不同就回報 stale 並停止繼續輪詢（狀態不可逆，沒有「復原」的必要）。
//
// 判斷邏輯本身在 buildVersionTracker.ts（純函式，可脫離瀏覽器單元測試）；
// 這個 hook 只負責「什麼時候問一次、怎麼問」。
import { useEffect, useRef, useState } from 'react'
import { createBuildVersionTracker } from '../../lib/buildVersionTracker'

// 十分鐘量級的 backstop，不是主要偵測手段（主要靠視窗取得焦點時觸發）；
// 沒必要頻繁到造成無謂的請求。
const POLL_INTERVAL_MS = 10 * 60 * 1000

interface BuildResponse {
  build?: unknown
}

async function fetchBuildVersion(): Promise<number | null> {
  try {
    const res = await fetch(withBase('/api/build'))
    if (!res.ok) return null
    const data = (await res.json()) as BuildResponse
    return typeof data.build === 'number' ? data.build : null
  } catch {
    // 網路失敗不代表版本變了，交給 tracker 忽略這次觀察
    return null
  }
}

export function useStaleBuildNotice(): boolean {
  const [isStale, setIsStale] = useState(false)
  const trackerRef = useRef(createBuildVersionTracker())

  useEffect(() => {
    let cancelled = false

    const check = () => {
      if (trackerRef.current.isStale()) return // 已定案，沒必要再打 API
      fetchBuildVersion().then(value => {
        if (cancelled) return
        if (trackerRef.current.observe(value)) setIsStale(true)
      })
    }

    check()
    const intervalId = window.setInterval(check, POLL_INTERVAL_MS)
    window.addEventListener('focus', check)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', check)
    }
  }, [])

  return isStale
}
