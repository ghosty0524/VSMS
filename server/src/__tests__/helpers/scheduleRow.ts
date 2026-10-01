// server/src/__tests__/helpers/scheduleRow.ts
// 變動歷程測試共用的排程列，欄位與 Prisma 的 Schedule 一致。只在測試裡用，不碰 DB。
import type { ScheduleSnapshot } from '../../lib/changeHistory.js'

export type ScheduleRow = ScheduleSnapshot & {
  completedAt: Date | null
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

export function scheduleRow(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 's1',
    category: 'NPI',
    projectName: 'PDN-250048 ECA-6710C',
    taskDescription: 'EMC 預測試：輻射與傳導兩項',
    testUnit: 'EMC',
    testEngineer: 'Lily_Lee',
    timeResource: 5,
    startDate: '2026/10/01',
    endDate: '2026/10/03',
    requiredPersonnel: 'Amy_Chen',
    testReport: '',
    isCompleted: false,
    isDelayed: false,
    isCancelled: false,
    completedAt: null,
    delayReason: '',
    createdBy: 'Will_Wang',
    updatedBy: 'Will_Wang',
    createdAt: new Date('2026-09-30T00:00:00.000Z'),
    updatedAt: new Date('2026-09-30T00:00:00.000Z'),
    adminFlag: false,
    adminFlagNote: null,
    userFlag: false,
    userFlagNote: null,
    device: 'Chamber-A',
    vtmsPlanId: null,
    ...over,
  }
}
