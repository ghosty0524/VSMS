import type { Schedule } from '../types'

export type ScheduleStatus = 'Completed' | 'Delayed' | 'Testing' | 'Planned'

function parseDate(s: string): Date {
  const [y, m, d] = s.split('/').map(Number)
  return new Date(y, m - 1, d)
}

export function computeStatus(s: Schedule): ScheduleStatus {
  if (s.isCompleted) return 'Completed'
  if (s.isDelayed) return 'Delayed'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = parseDate(s.startDate)
  const end = parseDate(s.endDate)
  if (today >= start && today <= end) return 'Testing'
  return 'Planned'
}