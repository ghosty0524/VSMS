import { todayTaipei } from './today.js'
import { computeSendDate, addDays, daysBetween, MAX_STEP_BACK_DAYS } from './notifyDate.js'
import type { RestDaySettings } from './notifyDate.js'
import { planRecipients } from './notifyRecipients.js'
import { resolveRule } from './notifyRule.js'
import type { NotifyRuleRow } from './notifyRule.js'
import { buildTemplateVars, buildMailBody } from './notifyMailBody.js'
import type { ScheduleForMail } from './notifyMailBody.js'
import type { Deliverer, Recipient } from './notifyClient.js'
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
  /** 寄件伺服器回傳的訊息 ID；平台寄送層上線後固定為 null，保留欄位相容舊列。 */
  messageId: string | null
  /** SMTP 的原始回應字串；平台寄送層上線後固定為 null，保留欄位相容舊列。 */
  smtpResponse: string | null
  /** 平台 POST /notify/deliveries 回傳的 delivery id；未寄出（dropped）時為 null。 */
  deliveryId: string | null
}

export interface NotifyStore {
  loadConfig(): Promise<NotifyConfigRow | null>
  loadRestDays(): Promise<RestDaySettings>
  loadRules(): Promise<NotifyRuleRow[]>
  loadFallbackRecipients(): Promise<string[]>
  /**
   * 所有 VSMS 使用者帳號名稱（含已停用者）。需求人員若是其中之一就不發預告
   * 信——本人在系統裡看得到排程。停用的帳號也一併排除，是使用者的決定。
   */
  loadAccountNames(): Promise<string[]>
  /** 未完成、未取消、且 startDate > today */
  findCandidates(today: string): Promise<CandidateSchedule[]>
  findLogs(scheduleIds: string[]): Promise<NotificationLogRow[]>
  upsertLog(entry: LogUpsert): Promise<void>
  /** 刪掉 sendDate 早於（不含）該日的紀錄，回傳筆數；只給 purgeOldLogs 用。 */
  deleteLogsBefore(sendDateExclusive: string): Promise<number>
  /**
   * testEngineer 對應到的 VSMS 帳號（users.linkedEngineer === value），找不到回 null。
   * 同時回傳 username：跨系統的身分鍵是 username，不是本機的 id ——
   * pre-SSO 帳號的本機 id 與 vauth 那邊的 id 對不上，寄給平台的收件人只能
   * 用 username（見 server/src/middleware/ssoAdopt.ts 與
   * server/src/lib/orgSync/derive.ts 的說明）。
   */
  loadAccountByEngineer(value: string): Promise<{ id: string; username: string } | null>
}

/**
 * 佔位用的專案編號，不是真的專案，不發預告信。
 *
 * 目前寫死在程式裡而非做成設定：只有這一個值，且它是全公司共用的慣例而非
 * 各單位可調整的偏好。若日後出現第二個佔位編號，再考慮搬進 NotifyConfig。
 */
export const EXCLUDED_PROJECT_NAMES = ['PDN-999999']

/**
 * 寄送紀錄在資料庫的保存天數（日曆天）。紀錄頁只顯示最近五個工作日，更早的列沒人看，
 * 但「已寄過就不重寄」的判斷（findLogs）會回看 catchUpDays 天、最多 MAX_STEP_BACK_DAYS 天，
 * 所以清除線一定要落在那兩個數字之外——purgeOldLogs 取三者最大值再多留一天。
 */
export const LOG_RETENTION_DAYS = 30

export async function purgeOldLogs(store: NotifyStore, today: string = todayTaipei()): Promise<{ before: string; deleted: number }> {
  const config = await store.loadConfig()
  const keep = Math.max(LOG_RETENTION_DAYS, MAX_STEP_BACK_DAYS, config?.catchUpDays ?? 0) + 1
  const before = addDays(today, -keep)
  return { before, deleted: await store.deleteLogsBefore(before) }
}

export interface RunResult {
  /** 本次執行檢視過的候選排程總數（不論是否落在寄信視窗內）。 */
  checked: number
  /** 候選排程中，寄信日落在「今天以內、且未早於補寄視窗起點」範圍內的筆數。 */
  due: number
  sent: number
  /**
   * 平台判定為重複投遞（deliver() 回應 deduped:true）的筆數，與 sent 分開
   * 計數 —— 「寄出」跟「平台認得這是同一封、沒有真的再寄一次」是兩件事，
   * 混在 sent 裡會讓管理者以為每天都多寄了那幾封。
   */
  deduped: number
  failed: number
  skipped: number
  /** 寄信日早於補寄視窗起點而被跳過的筆數 —— 見迴圈內對應註解。 */
  missedWindow: number
  /**
   * 因排除規則而不寄的筆數：佔位專案編號，或需求人員本身是 VSMS 帳號。
   * 與 skipped 分開計數，否則「規則排除」會混進「已經寄過」裡看不出來。
   */
  excluded: number
  errors: Array<{ scheduleId: string; message: string }>
  /**
   * true 表示這次呼叫沒有真的跑——呼叫時已經有另一次 runDailyNotify 在
   * process 內執行中，於是立刻回傳這個「什麼都沒做」的空結果。呼叫端要靠
   * 這個欄位分辨「今天沒有該寄的信」和「有人正在跑」，兩者不能都顯示成
   * 同一句「檢查 0 筆」。預設 false。
   */
  alreadyRunning: boolean
}

// 每次呼叫都要拿到全新的物件與全新的 errors 陣列 —— 用共用常數物件再展開
// （{ ...SHARED }）只是淺拷貝，errors 這個陣列參照會被所有呼叫共用，一次
// push 就會污染下一次呼叫的結果，跨測試甚至跨並行執行都看得到彼此的錯誤。
function emptyResult(alreadyRunning: boolean): RunResult {
  return { checked: 0, due: 0, sent: 0, deduped: 0, failed: 0, skipped: 0, missedWindow: 0, excluded: 0, errors: [], alreadyRunning }
}

// 模組級鎖：VSMS 是單一 pm2 process，一個 in-flight Promise 就足夠擋住同
// process 內的並行執行，不需要跨 process 的分散式鎖。
let inFlight: Promise<RunResult> | null = null

/**
 * 每日執行一次，也供手動重跑 API 呼叫。
 *
 * notification_logs 的 (scheduleId, sendDate) 唯一鍵只保證不會出現重複的
 * 記錄「列」，並不保證不會重複寄信：下面的迴圈是先呼叫 deliverer.deliver()、
 * 才 upsertLog()，而 upsertLog 用的是 upsert——鍵值衝突時是更新既有那一列，
 * 不是拋錯擋下來。所以唯一鍵擋不住兩次並行執行各自寄出一封信（平台端的
 * key 冪等性是另一道防線，見下方 deliver() 呼叫處的 key）。
 *
 * 真正擋住並行執行的是這裡的模組級 mutex（inFlight）：同一個 process 內
 * 第二個呼叫會立刻拿到 alreadyRunning:true 的空結果，不會真的再跑一次。
 * 這涵蓋 cron 與手動重跑 API 並行、以及兩個分頁或兩位管理者同時按下手動
 * 重跑等情況——只要都打進同一個 process（VSMS 目前只有一個）。
 */
export async function runDailyNotify(
  store: NotifyStore,
  deliverer: Deliverer,
  now: Date = new Date(),
): Promise<RunResult> {
  if (inFlight) {
    return emptyResult(true)
  }
  const run = runOnce(store, deliverer, now)
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
  deliverer: Deliverer,
  now: Date,
): Promise<RunResult> {
  const result: RunResult = emptyResult(false)

  const config = await store.loadConfig()
  if (!config?.enabled) return result

  const today = todayTaipei(now)
  const [restDays, rules, fallback, accountNames, candidates] = await Promise.all([
    store.loadRestDays(),
    store.loadRules(),
    store.loadFallbackRecipients(),
    store.loadAccountNames(),
    store.findCandidates(today),
  ])
  const accounts = new Set(accountNames.map(n => n.trim().toLowerCase()).filter(Boolean))
  const excludedProjects = new Set(EXCLUDED_PROJECT_NAMES.map(n => n.toLowerCase()))

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

      // 排除規則。放在 due 之後，excluded 才代表「今天本來該寄、但被規則擋下」
      // ——放在前面的話那幾筆每天都會被計進去，變成固定不動的雜訊。這樣
      // due = sent + failed + skipped + excluded，數字可以對帳。
      //
      // 不寫 log：這是「這筆本來就不該發通知」的設定狀態，不是一次通知事件，
      // 寫進記錄頁只會把真正的寄送記錄淹掉（與單位停用同樣的處理方式）。
      if (excludedProjects.has((schedule.projectName ?? '').trim().toLowerCase())) {
        result.excluded++
        continue
      }
      // 需求人員本人是 VSMS 使用者就不寄——他在系統裡看得到自己的排程。
      // 欄位含多人時，只要其中任何一位是帳號，整筆都不寄（使用者的決定）。
      const personnelTokens = (schedule.requiredPersonnel ?? '')
        .split(/[,，、;；\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
      if (personnelTokens.some(t => accounts.has(t))) {
        result.excluded++
        continue
      }

      const existing = logByKey.get(logKey(schedule.id, sendDate))
      // 'sent' 是平台寄送層上線前寫下的舊列，保留在冪等判斷裡是為了相容；
      // 'accepted'／'dedup' 是平台寄送層的正常完成狀態——只要 deliver() 有
      // 回應（不論是新投遞還是被平台判定為重複），這筆就已經處理過了，不該
      // 再打一次 deliver()。
      if (existing && (existing.status === 'accepted' || existing.status === 'dedup' || existing.status === 'sent')) {
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

      const { to, cc, usingFallback } = planRecipients({
        requiredPersonnel: schedule.requiredPersonnel,
        testEngineer: schedule.testEngineer,
        ruleCcRaw: rule.ccRaw,
        fallbackRaw: fallback.join(', '),
        mailDomain: config.mailDomain,
      })
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

      // 測試人員若有對應到 VSMS 帳號，除了 email 副本外再加一份站內通知
      // （inapp），讓他不必開信箱也能在系統裡看到。平台認人靠 username（見
      // loadAccountByEngineer 上方註解），不能送本機 id。
      const engineerAccount = schedule.testEngineer ? await store.loadAccountByEngineer(schedule.testEngineer) : null
      const recipients: Recipient[] = to.map(email => ({ email }))
      const ccList: Recipient[] = cc.map(email => ({ email }))
      const channels: Array<'inapp' | 'email'> = engineerAccount ? ['email', 'inapp'] : ['email']
      // 平台的 cc 只寄信、不寫收件匣，所以測試人員的 {username} 必須放進
      // recipients 才會有站內通知；他的 email 副本仍在 ccList（平台會把 To 裡
      // 已有的人從 cc 扣掉，不會重複寄）。
      const finalRecipients: Recipient[] = engineerAccount
        ? [...recipients, { username: engineerAccount.username }]
        : recipients
      const finalCc: Recipient[] = ccList
      // key 帶 (scheduleId, sendDate)：與本地的唯一鍵同一組維度，讓平台端
      // 也能認出「這是同一封信」——本地 upsertLog 失敗、下次重跑重新呼叫
      // deliver() 時，平台會回 deduped 而不是真的寄出第二封。
      const key = `schedule:${schedule.id}:${sendDate}`
      try {
        const r = await deliverer.deliver({
          key, channels,
          recipients: finalRecipients,
          cc: finalCc,
          severity: 'info', title: body.subject, body: body.text + notice, linkUrl: `/vsms/`,
          mail: { subject: body.subject, text: body.text + notice, html: body.html + noticeHtml },
        })
        const status = r.dropped ? 'error' : r.deduped ? 'dedup' : 'accepted'
        const unresolved = r.mail?.unresolved ?? []
        // 平台解析不出某個 username 時不算整批失敗——email 副本大概率還是
        // 寄出去了，只是那一位測試人員的站內通知沒送達。狀態維持 accepted，
        // 把問題浮現在 errorMessage 讓管理者查得到，而不是靜默吞掉。
        const errorMessage = r.dropped
          ? 'NOTIFY_URL 或 VAUTH_SERVICE_KEY 未設定'
          : status === 'accepted' && unresolved.length > 0
            ? `未解析收件人：${unresolved.join(', ')}`
            : null
        // attempts 欄位保留是為了相容舊列的資料形狀，寄送本身的重試與失敗
        // 升級現在都在平台那一側，這裡固定寫 1。
        await store.upsertLog({
          scheduleId: schedule.id, sendDate, status,
          recipients: [...to, ...cc].join(', '), errorMessage,
          attempts: 1, sentAt: null, messageId: null, smtpResponse: null, deliveryId: r.id,
        })
        if (r.dropped) result.failed++
        else if (r.deduped) result.deduped++
        else result.sent++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await store.upsertLog({ scheduleId: schedule.id, sendDate, status: 'error', recipients: [...to, ...cc].join(', '), errorMessage: message, attempts: 1, sentAt: null, messageId: null, smtpResponse: null, deliveryId: null })
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
