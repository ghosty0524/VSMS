// src/lib/buildVersionTracker.ts
// 純狀態機：判斷「目前這個分頁載入的前端版本」是否已過期（stale）。
// 刻意不碰 fetch / timer / DOM，讓 useStaleBuildNotice 這類 hook 只需負責
// 「多久檢查一次、怎麼檢查」，判斷邏輯本身可以脫離瀏覽器直接單元測試。

export interface BuildVersionTracker {
  /** 目前是否已判定為 stale（一旦為 true 就不會再變回 false）。 */
  isStale(): boolean
  /**
   * 回報一次觀察到的 build 版本值。
   * - value 為 null：代表這次檢查失敗（網路錯誤或非 2xx），忽略、不覆寫已記錄的值。
   * - 尚未有記錄值時：僅記錄這次的值，不判定為 stale（沒有基準可比較）。
   * - 之後每次都與記錄值比較：不同就標記為 stale；相同則維持現狀。
   * - 已經 stale 時：直接回傳 true，不再更新記錄值（狀態不可逆）。
   * 回傳目前是否為 stale（呼叫後的最新狀態），方便呼叫端不用另外呼叫 isStale()。
   */
  observe(value: number | null): boolean
}

export function createBuildVersionTracker(): BuildVersionTracker {
  let recorded: number | null = null
  let stale = false

  return {
    isStale: () => stale,
    observe(value) {
      if (stale) return true
      if (value === null) return false
      if (recorded === null) {
        recorded = value
        return false
      }
      if (value !== recorded) {
        stale = true
      }
      return stale
    },
  }
}
