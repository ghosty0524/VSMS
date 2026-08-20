import { todayTaipei } from './today.js'
import { computeSendDate, addDays, daysBetween } from './notifyDate.js'
import type { RestDaySettings } from './notifyDate.js'
import { resolveRecipients } from './notifyRecipients.js'
import { resolveRule } from './notifyRule.js'
import type { NotifyRuleRow } from './notifyRule.js'
import { buildTemplateVars, buildMailBody } from './notifyMailBody.js'
import type { ScheduleForMail } from './notifyMailBody.js'
import type { Mailer } from './mailer.js'
import { escapeHtml } from './notifyTemplate.js'

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
  /** 本次執行檢視過的候選排程總數（不論是否落在寄信視窗內）。 */
  checked: number
  /** 候選排程中，寄信日落在「今天以內、且未早於補寄視窗起點」範圍內的筆數。 */
  due: number
  sent: number
  failed: number
  skipped: number
  /** 寄信日早於補寄視窗起點而被跳過的筆數 —— 見迴圈內對應註解。 */
  missedWindow: number
  errors: Array<{ scheduleId: string; message: string }>
  /**
   * true 表示這次呼叫沒有真的跑——呼叫時已經有另一次 runDailyNotify 在
   * process 內執行中，於是立刻回傳這個「什麼都沒做」的空結果。呼叫端要靠
   * 這個欄位分辨「今天沒有該寄的信」和「有人正在跑」，兩者不能都顯示成
   * 同一句「檢查 0 筆」。預設 false。
   */
  alreadyRunning: boolean
}

export const MAX_ATTEMPTS = 3

// 每次呼叫都要拿到全新的物件與全新的 errors 陣列 —— 用共用常數物件再展開
// （{ ...SHARED }）只是淺拷貝，errors 這個陣列參照會被所有呼叫共用，一次
// push 就會污染下一次呼叫的結果，跨測試甚至跨並行執行都看得到彼此的錯誤。
function emptyResult(alreadyRunning: boolean): RunResult {
  return { checked: 0, due: 0, sent: 0, failed: 0, skipped: 0, missedWindow: 0, errors: [], alreadyRunning }
}

// 模組級鎖：VSMS 是單一 pm2 process，一個 in-flight Promise 就足夠擋住同
// process 內的並行執行，不需要跨 process 的分散式鎖。
let inFlight: Promise<RunResult> | null = null

/**
 * 每日執行一次，也供手動重跑 API 呼叫。
 *
 * notification_logs 的 (scheduleId, sendDate) 唯一鍵只保證不會出現重複的
 * 記錄「列」，並不保證不會重複寄信：下面的迴圈是先呼叫 mailer.send()、
 * 成功後才 upsertLog()，而 upsertLog 用的是 upsert——鍵值衝突時是更新既有
 * 那一列，不是拋錯擋下來。所以唯一鍵擋不住兩次並行執行各自寄出一封信。
 *
 * 真正擋住並行執行的是這裡的模組級 mutex（inFlight）：同一個 process 內
 * 第二個呼叫會立刻拿到 alreadyRunning:true 的空結果，不會真的再跑一次。
 * 這涵蓋 cron 與手動重跑 API 並行、以及兩個分頁或兩位管理者同時按下手動
 * 重跑等情況——只要都打進同一個 process（VSMS 目前只有一個）。
 */
export async function runDailyNotify(
  store: NotifyStore,
  mailer: Mailer,
  now: Date = new Date(),
): Promise<RunResult> {
  if (inFlight) {
    return emptyResult(true)
  }
  const run = runOnce(store, mailer, now)
  inFlight = run
  try {
    return await run
  } finally {
    // 成功、失敗都要釋放——否則一次未預期的例外會讓鎖永遠卡住，之後所有
    // 呼叫都會被誤判成「有人正在跑」。
    inFlight = null
  }
}

async function runOnce(
  store: NotifyStore,
  mailer: Mailer,
  now: Date,
): Promise<RunResult> {
  const result: RunResult = emptyResult(false)

  const config = await store.loadConfig()
  if (!config?.enabled) return result

  const today = todayTaipei(now)
  const [restDays, rules, fallback, candidates] = await Promise.all([
    store.loadRestDays(),
    store.loadRules(),
    store.loadFallbackRecipients(),
    store.findCandidates(today),
  ])

  // catchUpDays 是管理者可編輯的資料庫欄位；負值會讓 windowStart 落在未來，
  // 導致每一筆都被判定為「早於視窗」而完全不寄信、卻無任何徵兆。在使用處
  // 夾住下限，不在此檔案另外加驗證 UI（那是 API 任務的範圍）。
  const catchUpDays = Math.max(0, config.catchUpDays)
  const windowStart = addDays(today, -catchUpDays)
  const logs = await store.findLogs(candidates.map(c => c.id))
  const logKey = (scheduleId: string, sendDate: string) => `${scheduleId} ${sendDate}`
  const logByKey = new Map(logs.map(l => [logKey(l.scheduleId, l.sendDate), l]))

  for (const schedule of candidates) {
    result.checked++
    try {
      const sendDate = computeSendDate(schedule.startDate, config.leadDays, restDays)
      if (sendDate === null) {
        result.errors.push({
          scheduleId: schedule.id,
          message: `無法決定寄信日：${schedule.startDate} 往前挪超過上限，請檢查休息日設定`,
        })
        continue
      }
      // 寄信日還在未來：該排程會在之後的某一天輪到，是正常情況，不算漏寄，
      // 不計入 missedWindow。
      if (sendDate > today) continue
      // 寄信日早於補寄視窗起點：下限是刻意保留的 —— 若拿掉它，管理者第一次
      // 啟用本功能時，所有歷史排程會在同一天一次全部寄出。因此這裡不是把
      // 視窗拉寬，而是把「因超出視窗而未寄」的情況從靜默略過改成計數，
      // 讓管理者能從 RunResult 看到有多少筆被漏掉。
      if (sendDate < windowStart) {
        result.missedWindow++
        continue
      }

      result.due++

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

      // 以 today 為基準，而不是 sendDate —— 收件人是「今天」讀到這封信，
      // 補寄時 sendDate 已經早於 today，用 sendDate 算會高估剩餘天數，
      // 讓讀信的人以為時間比實際還多。同天寄送時 today === sendDate，
      // 結果不變。
      const daysUntilStart = Math.max(0, daysBetween(today, schedule.startDate))
      const vars = buildTemplateVars(schedule, config.systemUrl, daysUntilStart)
      const body = buildMailBody(rule, schedule, vars)

      const notice = usingFallback
        ? `\n\n（此信原應寄給需求人員「${schedule.requiredPersonnel}」，但無法對應為有效信箱，故改寄至代收群組。）`
        : ''
      const noticeHtml = notice ? `<p>${escapeHtml(notice.trim())}</p>` : ''

      const attempts = (existing?.attempts ?? 0) + 1
      let mailSent = false
      try {
        await mailer.send({
          to,
          cc: usingFallback ? [] : cc.addresses,
          subject: body.subject,
          text: body.text + notice,
          html: body.html + noticeHtml,
        })
        mailSent = true
        await store.upsertLog({
          scheduleId: schedule.id, sendDate, status: 'sent',
          recipients: [...to, ...(usingFallback ? [] : cc.addresses)].join(', '),
          errorMessage: null, attempts, sentAt: now,
        })
        result.sent++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (mailSent) {
          // 信已經寄出，只是寫入通知記錄失敗 —— (scheduleId, sendDate) 唯一鍵
          // 這道冪等性保證這次沒能落地，下次執行極可能對同一批人重複寄信。
          // 這件事必須讓管理者立刻看見，而不是被當成一般寄信失敗吞掉。
          result.errors.push({
            scheduleId: schedule.id,
            message: `信件已寄出，但寫入通知記錄失敗，下次執行可能對同一批收件人重複寄信：${message}`,
          })
          continue
        }
        // attempts 是「每次執行」累加，不是「每天」累加：手動重跑按鈕存在的
        // 目的就是讓操作者能在同一天連續重跑（例如除錯 SMTP 設定），若攻頂
        // 條件只看 attempts >= MAX_ATTEMPTS，三次手動重跑就會把所有到期排程
        // 打成永久失敗、之後永遠不再重試，而操作者當下毫無徵兆。因此再加上
        // 「寄信日已經過去」（sendDate < today）這道日期閘門：寄信日當天不論
        // 重跑幾次都維持 'failed'，只有跨過至少一個自然日之後，攻頂才會真的
        // 生效，此時 attempts 才確實對應「不同天各自失敗過一次」。
        const dayHasAdvanced = sendDate < today
        await store.upsertLog({
          scheduleId: schedule.id, sendDate,
          status: (attempts >= MAX_ATTEMPTS && dayHasAdvanced) ? 'failed_permanent' : 'failed',
          recipients: [...to, ...(usingFallback ? [] : cc.addresses)].join(', '),
          errorMessage: message, attempts, sentAt: null,
        })
        result.failed++
      }
    } catch (err) {
      // 任何未預期錯誤都不能讓整批中斷（例如上面失敗記錄本身也寫入失敗）——
      // 記錄下來，繼續處理下一筆候選排程。
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({
        scheduleId: schedule.id,
        message: `處理此筆排程時發生未預期錯誤，已跳過並繼續處理下一筆：${message}`,
      })
    }
  }

  return result
}
