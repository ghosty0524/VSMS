export interface RestDaySettings {
  weekends: boolean
  /** YYYY/MM/DD */
  specificDates: string[]
}

/**
 * specificDates 是管理者手填的清單。貼錯一段連續日期時，無上限的往前數迴圈
 * 會卡死整個 process — 而它與前端服務跑在同一個 process 裡。這是允許被休息日
 * 「吃掉」的天數上限（總步數為 leadDays + 本值），超過即視為設定異常，由呼叫端
 * 記錄並跳過該筆。
 */
export const MAX_STEP_BACK_DAYS = 30

function toUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('/').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

export function addDays(ymd: string, delta: number): string {
  const d = toUtc(ymd)
  d.setUTCDate(d.getUTCDate() + delta)
  return fromUtc(d)
}

/** toYmd 減 fromYmd 的整天數；toYmd 較早時回傳負值。 */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((toUtc(toYmd).getTime() - toUtc(fromYmd).getTime()) / 86_400_000)
}

/**
 * 從 fromYmd 往後數 n 個工作天（用於「三個工作天內開始」這類期限計算）。
 * 與 computeSendDate 方向相反，但邏輯一致：休息日不計數，只是往後而非往前。
 */
export function addWorkdays(fromYmd: string, n: number, settings: RestDaySettings): string {
  let cur = fromYmd
  let left = n
  while (left > 0) {
    cur = addDays(cur, 1)
    if (!isRestDay(cur, settings)) left--
  }
  return cur
}

export function isRestDay(ymd: string, settings: RestDaySettings): boolean {
  if (settings.weekends) {
    const dow = toUtc(ymd).getUTCDay()
    if (dow === 0 || dow === 6) return true
  }
  return settings.specificDates.includes(ymd)
}

/**
 * 從 startDate 往前數 leadDays 個工作天。
 *
 * 是工作天而非日曆天：leadDays=3 從週一起算會落在前一週的週三，不是週五。
 * 休息日只是「不計數」，不是先把日曆天減完再往前挪 —— 起始日靠近週末或連假
 * 時，兩種算法會差到一兩天，而提前量的意義是「收信人還剩幾個上班日可以準備」。
 *
 * 回傳 null 表示在合理步數內湊不滿 leadDays 個工作天，屬休息日設定異常。
 */
export function computeSendDate(
  startDate: string,
  leadDays: number,
  settings: RestDaySettings,
): string | null {
  // leadDays 是管理者可編輯的資料庫欄位。0 或負值若照常進迴圈就永遠數不到，
  // 會一路跑到上限才回 null，讓一個單純的填錯值看起來像休息日設定壞掉。
  if (leadDays <= 0) return startDate

  let d = startDate
  let counted = 0
  for (let steps = 0; steps < leadDays + MAX_STEP_BACK_DAYS; steps++) {
    d = addDays(d, -1)
    if (isRestDay(d, settings)) continue
    if (++counted === leadDays) return d
  }
  return null
}
