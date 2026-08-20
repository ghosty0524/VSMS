import { describe, it, expect } from 'vitest'
import { runDailyNotify } from '../lib/notifyRunner.js'
import type { NotifyStore, NotifyConfigRow, CandidateSchedule, NotificationLogRow, LogUpsert } from '../lib/notifyRunner.js'
import type { NotifyRuleRow } from '../lib/notifyRule.js'
import type { Mailer, SendMailInput } from '../lib/mailer.js'

// 2026/08/21 是週五。leadDays=3 → 08/24(一) 的寄信日正是 08/21。
const NOW = new Date('2026-08-21T00:30:00Z') // 台灣 08:30

const baseSchedule: CandidateSchedule = {
  id: 's1',
  projectName: 'Falcon-X',
  taskDescription: '高低溫循環測試',
  category: 'NPI',
  testUnit: 'EMC',
  testEngineer: 'Darius_Chang',
  device: 'Chamber-A',
  startDate: '2026/08/24',
  endDate: '2026/09/02',
  timeResource: 5,
  requiredPersonnel: 'Amy_Chen',
}

const defaultRule: NotifyRuleRow = {
  id: 'default', testUnit: null, enabled: true,
  subjectTemplate: '[VSMS] {{projectName}}',
  introTemplate: '即將啟動', outroTemplate: '', ccRecipients: '',
}

function makeStore(overrides: Partial<{
  config: NotifyConfigRow | null
  rules: NotifyRuleRow[]
  candidates: CandidateSchedule[]
  logs: NotificationLogRow[]
  fallback: string[]
}> = {}) {
  const upserts: LogUpsert[] = []
  const store: NotifyStore = {
    loadConfig: async () => overrides.config !== undefined ? overrides.config
      : { enabled: true, systemUrl: 'https://vsms.local:3001', leadDays: 3, catchUpDays: 3, mailDomain: 'example.com' },
    loadRestDays: async () => ({ weekends: true, specificDates: [] }),
    loadRules: async () => overrides.rules ?? [defaultRule],
    loadFallbackRecipients: async () => overrides.fallback ?? ['fallback@example.com'],
    findCandidates: async () => overrides.candidates ?? [baseSchedule],
    findLogs: async () => overrides.logs ?? [],
    upsertLog: async (e) => { upserts.push(e) },
  }
  return { store, upserts }
}

function makeMailer() {
  const sent: SendMailInput[] = []
  const mailer: Mailer = { async send(input) { sent.push(input) } }
  return { mailer, sent }
}

describe('runDailyNotify', () => {
  it('sends to the resolved requiredPersonnel address', async () => {
    const { store, upserts } = makeStore()
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toEqual(['Amy_Chen@example.com'])
    expect(sent[0].subject).toBe('[VSMS] Falcon-X')
    expect(result.sent).toBe(1)
    expect(upserts[0]).toMatchObject({ scheduleId: 's1', sendDate: '2026/08/21', status: 'sent' })
  })

  it('does nothing when the global switch is off', async () => {
    const { store } = makeStore({
      config: { enabled: false, systemUrl: '', leadDays: 3, catchUpDays: 3, mailDomain: 'example.com' },
    })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(result).toEqual({
      checked: 0, due: 0, sent: 0, failed: 0, skipped: 0, missedWindow: 0, errors: [],
      alreadyRunning: false,
    })
  })

  it('does not send twice for the same schedule and send date', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'sent', attempts: 1 }],
    })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('retries a previously failed send', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed', attempts: 1 }],
    })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(1)
    expect(upserts[0]).toMatchObject({ status: 'sent', attempts: 2 })
  })

  it('stops retrying once the send is marked permanently failed', async () => {
    const { store } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed_permanent', attempts: 3 }],
    })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
  })

  it('marks the send permanently failed on the third failure once the send date has passed', async () => {
    // sendDate for baseSchedule is 2026/08/21; run this a day later (08/22) so
    // sendDate < today and the day gate (Fix 3 / Blocker 3) allows escalation.
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed', attempts: 2 }],
    })
    const mailer: Mailer = { async send() { throw new Error('ECONNREFUSED') } }
    const result = await runDailyNotify(store, mailer, new Date('2026-08-22T00:30:00Z'))
    expect(upserts[0]).toMatchObject({ status: 'failed_permanent', attempts: 3 })
    expect(upserts[0].errorMessage).toContain('ECONNREFUSED')
    expect(result.failed).toBe(1)
  })

  it('records a plain failure while attempts remain', async () => {
    const { store, upserts } = makeStore()
    const mailer: Mailer = { async send() { throw new Error('ETIMEDOUT') } }
    await runDailyNotify(store, mailer, NOW)
    expect(upserts[0]).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('catches up on a send date that has already passed', async () => {
    // 08/26(三) 啟動 → 寄信日 08/23(日) → 挪到 08/21(五)。今天是 08/24(一)，
    // 已過期兩天，仍在 catchUpDays=3 的視窗內。
    const late = { ...baseSchedule, startDate: '2026/08/26' }
    const { store } = makeStore({ candidates: [late] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, new Date('2026-08-24T00:30:00Z'))
    expect(sent).toHaveLength(1)
  })

  it('ignores a send date older than the catch-up window, but counts it as missed rather than dropping it silently', async () => {
    // 今天 08/28，寄信日 08/21，超出 catchUpDays=3 —— Fix 1：不是靜默 continue，
    // 而是計入 missedWindow，且完全不寄信、不寫 log。
    const { store, upserts } = makeStore()
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, new Date('2026-08-28T00:30:00Z'))
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.sent).toBe(0)
    expect(result.missedWindow).toBe(1)
  })

  it('ignores a send date still in the future', async () => {
    const { store } = makeStore()
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, new Date('2026-08-19T00:30:00Z'))
    expect(sent).toHaveLength(0)
  })

  it('skips a disabled unit without writing a log row', async () => {
    const emcOff: NotifyRuleRow = {
      id: 'emc', testUnit: 'EMC', enabled: false,
      subjectTemplate: null, introTemplate: null, outroTemplate: null, ccRecipients: '',
    }
    const { store, upserts } = makeStore({ rules: [defaultRule, emcOff] })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('adds the unit cc recipients alongside the default ones', async () => {
    const emc: NotifyRuleRow = {
      id: 'emc', testUnit: 'EMC', enabled: true,
      subjectTemplate: null, introTemplate: null, outroTemplate: null,
      ccRecipients: 'emc_window',
    }
    const withCc: NotifyRuleRow = { ...defaultRule, ccRecipients: 'dept_head' }
    const { store } = makeStore({ rules: [withCc, emc] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].cc).toEqual(['dept_head@example.com', 'emc_window@example.com'])
  })

  it('falls back to the fallback group when no recipient can be resolved', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store, upserts } = makeStore({ candidates: [noOne] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].to).toEqual(['fallback@example.com'])
    expect(sent[0].text).toContain('無法對應')
    expect(upserts[0].status).toBe('sent')
  })

  it('appends the domain to a fallback recipient stored as a bare account name', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '' }
    const { store } = makeStore({ candidates: [noOne], fallback: ['dept_inbox'] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].to).toEqual(['dept_inbox@example.com'])
  })

  it('records an error and keeps going when the send date cannot be resolved', async () => {
    const blocked: NotifyStore = {
      ...makeStore().store,
      loadRestDays: async () => {
        const dates: string[] = []
        const d = new Date(Date.UTC(2026, 7, 21))
        for (let i = 0; i < 40; i++) {
          dates.push(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`)
          d.setUTCDate(d.getUTCDate() - 1)
        }
        return { weekends: true, specificDates: dates }
      },
    }
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(blocked, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].scheduleId).toBe('s1')
  })

  it('records an error when the default rule is missing', async () => {
    const { store } = makeStore({ rules: [] })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(result.errors[0].message).toContain('預設通知規則')
  })

  // --- Fix 1: catch-up window edge and visibility ------------------------

  it('sends when the send date lands exactly on the catch-up window start', async () => {
    // today=2026/08/21, catchUpDays=3 → windowStart=2026/08/18。
    // startDate=2026/08/21 → sendDate=addDays(-3)=2026/08/18，恰好等於下界。
    const atWindowStart = { ...baseSchedule, startDate: '2026/08/21' }
    const { store, upserts } = makeStore({ candidates: [atWindowStart] })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(1)
    expect(result.missedWindow).toBe(0)
    expect(upserts[0]).toMatchObject({ scheduleId: 's1', sendDate: '2026/08/18', status: 'sent' })
  })

  it('does not send, and increments missedWindow, one day before the catch-up window start', async () => {
    // startDate=2026/08/20 → sendDate=2026/08/17，比 windowStart(2026/08/18) 早一天。
    const justBefore = { ...baseSchedule, startDate: '2026/08/20' }
    const { store, upserts } = makeStore({ candidates: [justBefore] })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.missedWindow).toBe(1)
  })

  // --- Fix 3: daysUntilStart is read from today, not the send date -------

  it('computes daysUntilStart from today rather than the catch-up send date', async () => {
    // 08/26(三) 啟動 → 寄信日 08/23(日) → 挪到 08/21(五)。今天是 08/24(一)，
    // 讀信當下距離開始只剩 2 天（08/26 - 08/24），不是以寄信日算出的 5 天
    // （08/26 - 08/21）。
    const withDays: NotifyRuleRow = { ...defaultRule, introTemplate: '距離開始還有 {{daysUntilStart}} 天' }
    const late = { ...baseSchedule, startDate: '2026/08/26' }
    const { store } = makeStore({ candidates: [late], rules: [withDays] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, new Date('2026-08-24T00:30:00Z'))
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain('距離開始還有 2 天')
  })

  // --- Test gap 3 / Fix 4: fallback notice in the html body, escaped -----

  it('includes the fallback notice in the html body too', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store } = makeStore({ candidates: [noOne] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].html).toContain('但無法對應為有效信箱')
  })

  it('escapes the fallback notice before it reaches the html body', async () => {
    // '<b>@x' 因為含 @ 卻沒有網域中的 '.'，resolveRecipients 判為 unresolved，
    // 因此仍會走 fallback，把這段原始文字內插進通知句。
    const noOne = { ...baseSchedule, requiredPersonnel: '<b>@x' }
    const { store } = makeStore({ candidates: [noOne] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].to).toEqual(['fallback@example.com'])
    expect(sent[0].html).toContain('&lt;b&gt;@x')
    expect(sent[0].html).not.toContain('<b>@x')
  })

  // --- Test gap 4: cc is dropped on the fallback path ---------------------

  it('drops cc on the fallback path', async () => {
    const withCc: NotifyRuleRow = { ...defaultRule, ccRecipients: 'dept_head' }
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store } = makeStore({ candidates: [noOne], rules: [withCc] })
    const { mailer, sent } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(sent[0].to).toEqual(['fallback@example.com'])
    expect(sent[0].cc).toEqual([])
  })

  // --- Test gap 5: the log's recipients field records what was sent ------

  it('records the actual recipients (to + cc) in the log row', async () => {
    const withCc: NotifyRuleRow = { ...defaultRule, ccRecipients: 'dept_head' }
    const { store, upserts } = makeStore({ rules: [withCc] })
    const { mailer } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(upserts[0].recipients).toBe('Amy_Chen@example.com, dept_head@example.com')
  })

  // --- Test gap 6: idempotency is per (schedule, sendDate) ----------------

  it('still sends when a log exists for the same schedule but a different send date', async () => {
    // 同一筆排程曾在 2026/08/18 寄過信（例如另一次補寄），但今天算出的
    // 寄信日是 2026/08/21 —— 兩者是不同的 (scheduleId, sendDate) 鍵，
    // 不該被前一筆記錄擋下。
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/18', status: 'sent', attempts: 1 }],
    })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(1)
    expect(result.skipped).toBe(0)
    expect(upserts[0]).toMatchObject({ scheduleId: 's1', sendDate: '2026/08/21', status: 'sent' })
  })

  // --- Test gap 7: empty primary AND empty fallback group -----------------

  it('records an error and sends nothing when both primary and fallback recipients are empty', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store, upserts } = makeStore({ candidates: [noOne], fallback: [] })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('未設定 fallback 收件人')
  })

  // --- Test gap 8: sentAt is set on success --------------------------------

  it('sets sentAt to now on a successful send', async () => {
    const { store, upserts } = makeStore()
    const { mailer } = makeMailer()
    await runDailyNotify(store, mailer, NOW)
    expect(upserts[0].sentAt).toEqual(NOW)
  })

  // --- Fix 5: checked counts all examined; due counts only in-window ------

  it('checked counts every candidate examined; due counts only those inside the window', async () => {
    const future = { ...baseSchedule, id: 's2', startDate: '2026/09/20' }
    const { store } = makeStore({ candidates: [baseSchedule, future] })
    const { mailer } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(result.checked).toBe(2)
    expect(result.due).toBe(1)
  })

  // --- Fix 6: a negative catchUpDays must not silently disable sending ----

  it('clamps a negative catchUpDays to 0 instead of blocking same-day sends', async () => {
    const { store } = makeStore({
      config: { enabled: true, systemUrl: 'https://vsms.local:3001', leadDays: 3, catchUpDays: -5, mailDomain: 'example.com' },
    })
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)
    expect(sent).toHaveLength(1)
    expect(result.sent).toBe(1)
  })

  // --- Fix 2: a log-write failure after a successful send must not abort --
  // --- the batch, and must flag the duplicate-mail risk explicitly --------

  it('keeps processing later schedules and flags the duplicate-mail risk when the log write fails after a successful send', async () => {
    const second = { ...baseSchedule, id: 's2', requiredPersonnel: 'Bob_Lin' }
    const upserts: LogUpsert[] = []
    const store: NotifyStore = {
      ...makeStore({ candidates: [baseSchedule, second] }).store,
      upsertLog: async (e) => {
        if (e.scheduleId === 's1') throw new Error('ETIMEDOUT: log write failed')
        upserts.push(e)
      },
    }
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, NOW)

    // 兩封信都確實寄出了 —— 記錄失敗不能讓還沒處理的候選排程被放棄。
    expect(sent).toHaveLength(2)
    // 只有 s2 的「寄信 + 記錄」完整成功，計入 result.sent。
    expect(result.sent).toBe(1)
    // s1 的記錄失敗必須浮現在 errors，且措辭要讓管理者看得出重複寄信風險。
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].scheduleId).toBe('s1')
    expect(result.errors[0].message).toContain('已寄出')
    expect(result.errors[0].message).toContain('重複')
    expect(upserts).toHaveLength(1)
    expect(upserts[0].scheduleId).toBe('s2')
  })

  // --- Blocker 1: module-level mutex prevents concurrent runs --------------

  it('returns alreadyRunning immediately for a second call while the first is still in flight, and releases the lock once the first finishes', async () => {
    const { store } = makeStore()
    let releaseSend: () => void = () => {}
    const sendGate = new Promise<void>(resolve => { releaseSend = resolve })
    const sent: SendMailInput[] = []
    const mailer: Mailer = {
      async send(input) {
        sent.push(input)
        await sendGate // holds the first run open until the test releases it
      },
    }

    const first = runDailyNotify(store, mailer, NOW)
    // inFlight is assigned synchronously before runDailyNotify's first
    // `await`, so this second call is guaranteed to observe the lock —
    // no need to yield a tick before calling it.
    const second = await runDailyNotify(store, mailer, NOW)
    // Release right away, before any assertions: if an assertion below threw,
    // `first` would otherwise sit forever awaiting a gate nothing releases,
    // leaking the module-level lock into later tests in this file.
    releaseSend()

    expect(second.alreadyRunning).toBe(true)
    expect(second).toMatchObject({
      checked: 0, due: 0, sent: 0, failed: 0, skipped: 0, missedWindow: 0, errors: [],
    })

    const firstResult = await first
    expect(firstResult.alreadyRunning).toBe(false)
    expect(firstResult.sent).toBe(1)
    // Only the first run ever reached the mailer — the second call returned
    // before touching it.
    expect(sent).toHaveLength(1)

    // The lock is released once the first run settles, so a later call
    // proceeds normally instead of being blocked forever.
    const third = await runDailyNotify(store, mailer, NOW)
    expect(third.alreadyRunning).toBe(false)
  })

  // --- Blocker 3: the attempt cap only escalates once the day has passed ---

  it('stays failed on its own send date no matter how many attempts have accumulated', async () => {
    // sendDate for baseSchedule at NOW is 2026/08/21, same as today. Even
    // with attempts already one below the cap, a same-day failure must not
    // escalate to failed_permanent — otherwise repeated presses of the
    // manual "立即檢查並補寄" button on the day the notice is due would
    // permanently kill it before the day has even passed.
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed', attempts: 2 }],
    })
    const mailer: Mailer = { async send() { throw new Error('ECONNREFUSED') } }
    const result = await runDailyNotify(store, mailer, NOW)
    expect(upserts[0]).toMatchObject({ status: 'failed', attempts: 3 })
    expect(result.failed).toBe(1)
  })

  it('reaches failed_permanent once the cap is hit for a send date earlier than today', async () => {
    // Same schedule/log shape as above, but the run happens a day later
    // (2026/08/22) so sendDate (2026/08/21) < today — the day gate now
    // allows the attempt cap to take effect.
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed', attempts: 2 }],
    })
    const mailer: Mailer = { async send() { throw new Error('ECONNREFUSED') } }
    const result = await runDailyNotify(store, mailer, new Date('2026-08-22T00:30:00Z'))
    expect(upserts[0]).toMatchObject({ status: 'failed_permanent', attempts: 3 })
    expect(result.failed).toBe(1)
  })
})
