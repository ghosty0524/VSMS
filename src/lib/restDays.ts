import type { RestDaysConfig } from '../types'

/** 週六日一律休息；specificDates 是全平台共用的休息日清單（VSMS、VTMS、MCP）。 */
export function isRestDay(date: Date, config: Pick<RestDaysConfig, 'specificDates'>): boolean {
  const dow = date.getDay()
  if (dow === 0 || dow === 6) return true
  const ymd = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  return config.specificDates.includes(ymd)
}
