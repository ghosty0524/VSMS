import { todayTaipei } from './today.js'
import { computeSendDate, addDays, daysBetween } from './notifyDate.js'
import type { RestDaySettings } from './notifyDate.js'
import { resolveRecipients } from './notifyRecipients.js'
import { resolveRule } from './notifyRule.js'
import type { NotifyRuleRow } from './notifyRule.js'
import { buildTemplateVars, buildMailBody } from './notifyMailBody.js'
import type { ScheduleForMail } from './notifyMailBody.js'
import type { Mailer } from './mailer.js'

export interface NotifyConfigRow {
  enabled: boolean
  systemUrl: string
  leadDays: number
  catchUpDays: number
  mailDomain: string
}

export interface CandidateSchedule extends ScheduleForMail {
  id: string
}

export interface NotificationLogRow {
  scheduleId: string
  sendDate: string
  status: string
  attempts: number
}

export interface LogUpsert {
  scheduleId: string
  sendDate: string
  status: string
  recipients: string
  errorMessage: string | null
  attempts: number
  sentAt: Date | null
}

export interface NotifyStore {
  loadConfig(): Promise<NotifyConfigRow | null>
  loadRestDays(): Promise<RestDaySettings>
  loadRules(): Promise<NotifyRuleRow[]>
  loadFallbackRecipients(): Promise<string[]>
  /** 未完成、未取消、且 startDate > today */
  findCandidates(today: string): Promise<CandidateSchedule[]>
  findLogs(scheduleIds: string[]): Promise<NotificationLogRow[]>
  upsertLog(entry: LogUpsert): Promise<void>
}

export interface RunResult {
  checked: number
  sent: number
  failed: number
  skipped: number
  errors: Array<{ scheduleId: string; message: string }>
}

export const MAX_ATTEMPTS = 3

/**
 * 每日執行一次，也供手動重跑 API 呼叫。
 *
 * 冪等性最終靠 notification_logs 的 (scheduleId, sendDate) 唯一鍵保證 —— cron
 * 與手動重跑可能並行，這裡的 findLogs 檢查擋不住競態。
 */
export async function runDailyNotify(
  store: NotifyStore,
  mailer: Mailer,
  now: Date = new Date(),
): Promise<RunResult> {
  const result: RunResult = { checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] }

  const config = await store.loadConfig()
  if (!config?.enabled) return result

  const today = todayTaipei(now)
  const [restDays, rules, fallback, candidates] = await Promise.all([
    store.loadRestDays(),
    store.loadRules(),
    store.loadFallbackRecipients(),
    store.findCandidates(today),
  ])

  const windowStart = addDays(today, -config.catchUpDays)
  const logs = await store.findLogs(candidates.map(c => c.id))
  const logKey = (scheduleId: string, sendDate: string) => `${scheduleId} ${sendDate}`
  const logByKey = new Map(logs.map(l => [logKey(l.scheduleId, l.sendDate), l]))

  for (const schedule of candidates) {
    const sendDate = computeSendDate(schedule.startDate, config.leadDays, restDays)
    if (sendDate === null) {
      result.errors.push({
        scheduleId: schedule.id,
        message: `無法決定寄信日：${schedule.startDate} 往前挪超過上限，請檢查休息日設定`,
      })
      continue
    }
    if (sendDate > today || sendDate < windowStart) continue

    result.checked++

    const existing = logByKey.get(logKey(schedule.id, sendDate))
    if (existing && (existing.status === 'sent' || existing.status === 'failed_permanent')) {
      result.skipped++
      continue
    }

    const rule = resolveRule(schedule.testUnit, rules)
    if (!rule) {
      result.errors.push({
        scheduleId: schedule.id,
        message: '找不到預設通知規則（testUnit = null），整批不寄信',
      })
      continue
    }
    // 單位停用是設定狀態而非通知事件，刻意不寫 log —— 否則記錄頁會被大量
    // 無意義的列淹沒。日後重新啟用時，仍在補寄視窗內的排程還是會寄出。
    if (!rule.enabled) {
      result.skipped++
      continue
    }

    const primary = resolveRecipients(schedule.requiredPersonnel, config.mailDomain)
    const cc = resolveRecipients(rule.ccRaw, config.mailDomain)

    const usingFallback = primary.addresses.length === 0
    // fallback 也要走同一支解析：Recipient.name 存的可能是帳號名而非完整信箱，
    // 直接丟給 SMTP 會寄不出去。
    const to = usingFallback
      ? resolveRecipients(fallback.join(', '), config.mailDomain).addresses
      : primary.addresses
    if (to.length === 0) {
      result.errors.push({
        scheduleId: schedule.id,
        message: '需求人員無法對應，且未設定 fallback 收件人',
      })
      continue
    }

    // 以實際寄信日為基準，而不是 today —— 補寄時 today 已經晚於寄信日，
    // 用 today 會讓信裡的天數比實際預告量少。
    const daysUntilStart = Math.max(0, daysBetween(sendDate, schedule.startDate))
    const vars = buildTemplateVars(schedule, config.systemUrl, daysUntilStart)
    const body = buildMailBody(rule, schedule, vars)

    const notice = usingFallback
      ? `\n\n（此信原應寄給需求人員「${schedule.requiredPersonnel}」，但無法對應為有效信箱，故改寄至代收群組。）`
      : ''

    const attempts = (existing?.attempts ?? 0) + 1
    try {
      await mailer.send({
        to,
        cc: usingFallback ? [] : cc.addresses,
        subject: body.subject,
        text: body.text + notice,
        html: body.html + (notice ? `<p>${notice.trim()}</p>` : ''),
      })
      await store.upsertLog({
        scheduleId: schedule.id, sendDate, status: 'sent',
        recipients: [...to, ...(usingFallback ? [] : cc.addresses)].join(', '),
        errorMessage: null, attempts, sentAt: now,
      })
      result.sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await store.upsertLog({
        scheduleId: schedule.id, sendDate,
        status: attempts >= MAX_ATTEMPTS ? 'failed_permanent' : 'failed',
        recipients: [...to, ...(usingFallback ? [] : cc.addresses)].join(', '),
        errorMessage: message, attempts, sentAt: null,
      })
      result.failed++
    }
  }

  return result
}
