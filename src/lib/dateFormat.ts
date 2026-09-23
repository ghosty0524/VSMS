/**
 * 畫面顯示用的日期格式，三個系統共用同一套規則（2026-09-23 設計系統定案）：
 *   日期時間 2026-09-03 09:05（24 小時、補零、不含秒；稽核紀錄可帶秒）
 *   日期     2026-09-03
 *
 * 只給畫面用。排程的 startDate／endDate 儲存格式是 YYYY/MM/DD，比較、
 * 送 API、匯入匯出都要用原字串——拿 ISO 格式去比會靜默比不到東西。
 */
const pad = (n: number) => String(n).padStart(2, '0')

export function formatDateTime(
  v: string | Date | null | undefined,
  opts: { seconds?: boolean } = {},
): string {
  if (v === null || v === undefined || v === '') return ''
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${opts.seconds ? `:${pad(d.getSeconds())}` : ''}`
  return `${date} ${time}`
}

/** 儲存格式 2026/09/29 → 顯示格式 2026-09-29。純字串處理，不經過 Date（避免時區位移）。 */
export function displayYmd(stored: string | null | undefined): string {
  if (!stored) return ''
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(stored)
  if (!m) return stored
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}
