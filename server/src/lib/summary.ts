// server/src/lib/summary.ts
// 入口頁（vauth 首頁彙整卡）用的每人排程摘要。純函式，不碰 prisma —— 呼叫端
// （routes/internal.ts）先查出該工程師的排程再傳進來，方便單元測試。
import type { Schedule } from '@prisma/client'
import { addWorkdays, type RestDaySettings } from './notifyDate.js'

export interface SummaryItem {
  label: string
  count: number
  linkUrl: string
}

type ScheduleForSummary = Pick<Schedule, 'startDate' | 'endDate' | 'isCompleted' | 'isCancelled'>

// today 所在週的週一～週日（YYYY/MM/DD）。用 UTC 運算避免時區位移，
// today 本身已是 todayTaipei() 算好的台灣日期字串。
function weekRange(today: string): { from: string; to: string } {
  const d = new Date(today.replace(/\//g, '-') + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // 週一 = 0
  const mon = new Date(d.getTime() - dow * 86400000)
  const sun = new Date(mon.getTime() + 6 * 86400000)
  const f = (x: Date) => `${x.getUTCFullYear()}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}`
  return { from: f(mon), to: f(sun) }
}

export function summaryFor(
  today: string,
  settings: RestDaySettings,
  schedules: ScheduleForSummary[],
): SummaryItem[] {
  const live = schedules.filter(s => !s.isCompleted && !s.isCancelled)
  const { from, to } = weekRange(today)
  const soon = addWorkdays(today, 3, settings)
  return [
    {
      label: '本週我的排程',
      count: live.filter(s => s.startDate <= to && s.endDate >= from).length,
      linkUrl: '/vsms/',
    },
    {
      label: '三個工作天內開始',
      count: live.filter(s => s.startDate > today && s.startDate <= soon).length,
      linkUrl: '/vsms/',
    },
    {
      label: '逾期',
      count: live.filter(s => s.endDate < today).length,
      linkUrl: '/vsms/',
    },
  ]
}
