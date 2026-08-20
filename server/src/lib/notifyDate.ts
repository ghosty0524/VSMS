export interface RestDaySettings {
  weekends: boolean
  /** YYYY/MM/DD */
  specificDates: string[]
}

/**
 * specificDates 是管理者手填的清單。貼錯一段連續日期時，無上限的往前挪迴圈
 * 會卡死整個 process — 而它與前端服務跑在同一個 process 裡。超過這個上限
 * 視為設定異常，由呼叫端記錄並跳過該筆。
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

export function isRestDay(ymd: string, settings: RestDaySettings): boolean {
  if (settings.weekends) {
    const dow = toUtc(ymd).getUTCDay()
    if (dow === 0 || dow === 6) return true
  }
  return settings.specificDates.includes(ymd)
}

/**
 * 先減 leadDays 個日曆天，落在休息日再逐日往前挪。
 * 回傳 null 表示連續休息日超過 MAX_STEP_BACK_DAYS，屬設定異常。
 */
export function computeSendDate(
  startDate: string,
  leadDays: number,
  settings: RestDaySettings,
): string | null {
  let d = addDays(startDate, -leadDays)
  for (let stepped = 0; stepped <= MAX_STEP_BACK_DAYS; stepped++) {
    if (!isRestDay(d, settings)) return d
    d = addDays(d, -1)
  }
  return null
}
