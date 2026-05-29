import type { RestDaysConfig } from '../types'

export function isRestDay(date: Date, config: RestDaysConfig): boolean {
  if (config.weekends) {
    const dow = date.getDay()
    if (dow === 0 || dow === 6) return true
  }
  const ymd = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
  return config.specificDates.includes(ymd)
}