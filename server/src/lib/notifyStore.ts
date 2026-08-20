import { prisma } from './db.js'
import type {
  NotifyStore, NotifyConfigRow, CandidateSchedule, NotificationLogRow, LogUpsert,
} from './notifyRunner.js'
import type { RestDaySettings } from './notifyDate.js'
import type { NotifyRuleRow } from './notifyRule.js'

export const prismaNotifyStore: NotifyStore = {
  async loadConfig(): Promise<NotifyConfigRow | null> {
    const row = await prisma.notifyConfig.findUnique({ where: { id: 1 } })
    if (!row) return null
    return {
      enabled: row.enabled,
      systemUrl: row.systemUrl,
      leadDays: row.leadDays,
      catchUpDays: row.catchUpDays,
      mailDomain: row.mailDomain,
    }
  },

  async loadRestDays(): Promise<RestDaySettings> {
    const row = await prisma.restDaysConfig.findUnique({ where: { id: 1 } })
    return {
      weekends: row?.weekends ?? true,
      specificDates: (row?.specificDates as string[]) ?? [],
    }
  },

  async loadRules(): Promise<NotifyRuleRow[]> {
    const rows = await prisma.notifyRule.findMany()
    return rows.map(r => ({
      id: r.id,
      testUnit: r.testUnit,
      enabled: r.enabled,
      subjectTemplate: r.subjectTemplate,
      introTemplate: r.introTemplate,
      outroTemplate: r.outroTemplate,
      ccRecipients: r.ccRecipients,
    }))
  },

  async loadFallbackRecipients(): Promise<string[]> {
    const rows = await prisma.recipient.findMany({
      where: { isActive: true, notifyConfigId: 1 },
    })
    // Recipient.name 存的是帳號名或完整信箱，交由呼叫端已解析好的地址使用；
    // 這裡回傳原始字串陣列，runner 只在無法對應需求人員時才用到。
    return rows.map(r => r.name).filter(Boolean)
  },

  async findCandidates(today: string): Promise<CandidateSchedule[]> {
    const rows = await prisma.schedule.findMany({
      where: { isCompleted: false, isCancelled: false, startDate: { gt: today } },
      select: {
        id: true, projectName: true, taskDescription: true, category: true,
        testUnit: true, testEngineer: true, device: true,
        startDate: true, endDate: true, timeResource: true, requiredPersonnel: true,
      },
    })
    return rows
  },

  async findLogs(scheduleIds: string[]): Promise<NotificationLogRow[]> {
    if (scheduleIds.length === 0) return []
    const rows = await prisma.notificationLog.findMany({
      where: { scheduleId: { in: scheduleIds } },
      select: { scheduleId: true, sendDate: true, status: true, attempts: true },
    })
    return rows
  },

  async upsertLog(entry: LogUpsert): Promise<void> {
    await prisma.notificationLog.upsert({
      where: { scheduleId_sendDate: { scheduleId: entry.scheduleId, sendDate: entry.sendDate } },
      create: entry,
      update: {
        status: entry.status,
        recipients: entry.recipients,
        errorMessage: entry.errorMessage,
        attempts: entry.attempts,
        sentAt: entry.sentAt,
      },
    })
  },
}
