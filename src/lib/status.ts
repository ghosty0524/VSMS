import type { Schedule } from '../types'

export type ScheduleStatus = 'Cancelled' | 'Completed' | 'Delayed' | 'Testing' | 'Planned'

function parseDate(s: string): Date {
  const [y, m, d] = s.split('/').map(Number)
  return new Date(y, m - 1, d)
}

export function computeStatus(s: Schedule): ScheduleStatus {
  if (s.isCancelled) return 'Cancelled'
  if (s.isCompleted) return 'Completed'
  if (s.isDelayed) return 'Delayed'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = parseDate(s.startDate)
  // 已開始（含已超過完成日）但未勾 Completed/Delayed → 維持 Testing，
  // 避免逾期排程被歸回 Planned
  if (today >= start) return 'Testing'
  return 'Planned'
}

/**
 * 逾期天數 —— 已過完成日、仍未結案的天數；未逾期回傳 0。
 *
 * 逾期是算出來的，跟 isDelayed（有人勾的旗標）不是同一件事：排程可以
 * 逾期而沒被標記，也可以被標記而還沒到完成日。server/src/routes/
 * integration.ts 也是把 overdue 與 flaggedDelayed 分兩個欄位回報給
 * Agent，前端這裡不能把兩者合併成同一個指標。
 */
export function overdueDays(s: Schedule, today: Date = new Date()): number {
  if (s.isCompleted || s.isCancelled || !s.endDate) return 0
  const t = new Date(today)
  t.setHours(0, 0, 0, 0)
  const end = parseDate(s.endDate)
  const days = Math.round((t.getTime() - end.getTime()) / 86_400_000)
  return days > 0 ? days : 0
}

/**
 * 狀態的畫面文字。只給「畫到畫面上」用：篩選、排序、Agent Excel、剪貼簿
 * 一律用英文狀態值，不要拿這裡的中文去比較或輸出。
 * 詞表與 VTMS、入口頁共用（2026-09-23 設計系統定案）。
 */
export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  Planned: '計畫中',
  Testing: '測試中',
  Completed: '已完成',
  Delayed: '延遲',
  Cancelled: '已取消',
}

export function statusLabel(s: ScheduleStatus): string {
  return STATUS_LABELS[s]
}