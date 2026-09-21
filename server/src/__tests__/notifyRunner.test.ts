import { describe, it, expect } from 'vitest'
import { runDailyNotify } from '../lib/notifyRunner.js'
import type { NotifyStore, NotifyConfigRow, CandidateSchedule, NotificationLogRow, LogUpsert } from '../lib/notifyRunner.js'
import type { NotifyRuleRow } from '../lib/notifyRule.js'
import type { Deliverer, DeliverInput } from '../lib/notifyClient.js'

// 2026/08/21 是週五。leadDays 是 3 個「工作天」，所以 08/26(三) 的寄信日正是
// 08/21：往前數 08/25(二)、08/24(一)，跳過 08/23(日) 與 08/22(六)，第三個工作天
// 落在 08/21(五)。
const NOW = new Date('2026-08-21T00:30:00Z') // 台灣 08:30

const baseSchedule: CandidateSchedule = {
  id: 's1',
  projectName: 'Falcon-X',
  taskDescription: '高低溫循環測試',
  category: 'NPI',
  testUnit: 'EMC',
  testEngineer: 'Darius_Chang',
  device: 'Chamber-A',
  startDate: '2026/08/26',
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
  accounts: string[]
  accountsByEngineer: Record<string, string>
}> = {}) {
  const upserts: LogUpsert[] = []
  const accountsByEngineer = overrides.accountsByEngineer ?? {}
  const store: NotifyStore = {
    loadConfig: async () => overrides.config !== undefined ? overrides.config
      : { enabled: true, systemUrl: 'https://vsms.local:3001', leadDays: 3, catchUpDays: 3, mailDomain: 'example.com' },
    loadRestDays: async () => ({ weekends: true, specificDates: [] }),
    loadRules: async () => overrides.rules ?? [defaultRule],
    loadFallbackRecipients: async () => overrides.fallback ?? ['fallback@example.com'],
    loadAccountNames: async () => overrides.accounts ?? [],
    findCandidates: async () => overrides.candidates ?? [baseSchedule],
    findLogs: async () => overrides.logs ?? [],
    upsertLog: async (e) => { upserts.push(e) },
    // accountsByEngineer 的值同時當作 id 與 username 用（id 加個字首避免跟
    // username 撞在一起）——這裡只是測試替身，真正的兩者關係見 notifyStore.ts。
    loadAccountByEngineer: async (value) => {
      const username = accountsByEngineer[value]
      return username ? { id: 'acct-' + username, username } : null
    },
  }
  return { store, upserts }
}

function makeDeliverer() {
  const sent: DeliverInput[] = []
  const deliverer: Deliverer = { async deliver(input) { sent.push(input); return { id: 'd-' + sent.length, deduped: false, dropped: false, mail: { queued: true, unresolved: [] } } } }
  return { deliverer, sent }
}

describe('runDailyNotify', () => {
  it('sends to the resolved requiredPersonnel address', async () => {
    const { store, upserts } = makeStore()
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)

    expect(sent).toHaveLength(1)
    expect(sent[0].recipients).toEqual([{ email: 'Amy_Chen@example.com' }])
    expect(sent[0].mail?.subject).toBe('[VSMS] Falcon-X')
    expect(result.sent).toBe(1)
    expect(upserts[0]).toMatchObject({ scheduleId: 's1', sendDate: '2026/08/21', status: 'accepted', deliveryId: 'd-1' })
  })

  it('does nothing when the global switch is off', async () => {
    const { store } = makeStore({
      config: { enabled: false, systemUrl: '', leadDays: 3, catchUpDays: 3, mailDomain: 'example.com' },
    })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(result).toEqual({
      checked: 0, due: 0, sent: 0, deduped: 0, failed: 0, skipped: 0, missedWindow: 0, excluded: 0, errors: [],
      alreadyRunning: false,
    })
  })

  it('does not send twice for the same schedule and send date', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'sent', attempts: 1 }],
    })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.skipped).toBe(1)
  })

  it('does not send twice once the platform has accepted or deduped a delivery', async () => {
    const { store: acceptedStore, upserts: acceptedUpserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'accepted', attempts: 1 }],
    })
    const first = makeDeliverer()
    const acceptedResult = await runDailyNotify(acceptedStore, first.deliverer, NOW)
    expect(first.sent).toHaveLength(0)
    expect(acceptedUpserts).toHaveLength(0)
    expect(acceptedResult.skipped).toBe(1)

    const { store: dedupStore, upserts: dedupUpserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'dedup', attempts: 1 }],
    })
    const second = makeDeliverer()
    const dedupResult = await runDailyNotify(dedupStore, second.deliverer, NOW)
    expect(second.sent).toHaveLength(0)
    expect(dedupUpserts).toHaveLength(0)
    expect(dedupResult.skipped).toBe(1)
  })

  it('retries a previously failed (error) send', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'error', attempts: 1 }],
    })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(1)
    // attempts 欄位固定寫 1 相容舊列 —— 重試次數不再由這裡累加，平台端才是
    // 真正的重試機制。
    expect(upserts[0]).toMatchObject({ status: 'accepted', attempts: 1 })
  })

  it('records status error and the exception message when deliver throws', async () => {
    const { store, upserts } = makeStore()
    const deliverer: Deliverer = { async deliver() { throw new Error('ETIMEDOUT') } }
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(upserts[0]).toMatchObject({ status: 'error', attempts: 1, deliveryId: null })
    expect(upserts[0].errorMessage).toContain('ETIMEDOUT')
    expect(result.failed).toBe(1)
  })

  it('records status dedup when the platform reports a deduplicated delivery, and counts it under deduped rather than sent', async () => {
    const { store, upserts } = makeStore()
    const deliverer: Deliverer = { async deliver() { return { id: 'd-1', deduped: true, dropped: false } } }
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(upserts[0]).toMatchObject({ status: 'dedup', deliveryId: 'd-1', attempts: 1 })
    expect(result.sent).toBe(0)
    expect(result.deduped).toBe(1)
  })

  it('records the platform-reported unresolved usernames as an errorMessage while keeping status accepted', async () => {
    const { store, upserts } = makeStore()
    const deliverer: Deliverer = {
      async deliver() { return { id: 'd-1', deduped: false, dropped: false, mail: { queued: true, unresolved: ['ghost_user'] } } },
    }
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(upserts[0].status).toBe('accepted')
    expect(upserts[0].errorMessage).toContain('未解析收件人')
    expect(upserts[0].errorMessage).toContain('ghost_user')
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('records status error and counts it as failed when the client drops the delivery (NOTIFY_URL unset)', async () => {
    const { store, upserts } = makeStore()
    const deliverer: Deliverer = { async deliver() { return { id: null, deduped: false, dropped: true } } }
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(upserts[0]).toMatchObject({ status: 'error', deliveryId: null })
    expect(upserts[0].errorMessage).toContain('NOTIFY_URL')
    expect(result.failed).toBe(1)
  })

  it('routes to a linked engineer account: {username} goes into cc (there is already a to-recipient) and channels include inapp', async () => {
    const { store, upserts } = makeStore({ accountsByEngineer: { Darius_Chang: 'darius.chang' } })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(1)
    expect(sent[0].channels).toContain('inapp')
    // 平台以 username 辨識人，不是本機 id；測試人員的站內通知走 cc，不動
    // to（原本要寄給的需求人員不變）。
    expect(sent[0].recipients).toEqual([{ email: 'Amy_Chen@example.com' }])
    expect(sent[0].cc).toEqual(
      expect.arrayContaining([{ username: 'darius.chang' }]),
    )
    expect(upserts[0].status).toBe('accepted')
  })

  it('catches up on a send date that has already passed', async () => {
    // 08/26(三) 啟動 → 往前三個工作天 = 08/21(五)。今天是 08/24(一)，
    // 已過期兩天，仍在 catchUpDays=3 的視窗內。
    const late = { ...baseSchedule, startDate: '2026/08/26' }
    const { store } = makeStore({ candidates: [late] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, new Date('2026-08-24T00:30:00Z'))
    expect(sent).toHaveLength(1)
  })

  it('ignores a send date older than the catch-up window, but counts it as missed rather than dropping it silently', async () => {
    // 今天 08/28，寄信日 08/21，超出 catchUpDays=3 —— Fix 1：不是靜默 continue，
    // 而是計入 missedWindow，且完全不寄信、不寫 log。
    const { store, upserts } = makeStore()
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, new Date('2026-08-28T00:30:00Z'))
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.sent).toBe(0)
    expect(result.missedWindow).toBe(1)
  })

  it('ignores a send date still in the future', async () => {
    const { store } = makeStore()
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, new Date('2026-08-19T00:30:00Z'))
    expect(sent).toHaveLength(0)
  })

  it('skips a disabled unit without writing a log row', async () => {
    const emcOff: NotifyRuleRow = {
      id: 'emc', testUnit: 'EMC', enabled: false,
      subjectTemplate: null, introTemplate: null, outroTemplate: null, ccRecipients: '',
    }
    const { store, upserts } = makeStore({ rules: [defaultRule, emcOff] })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
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
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].cc).toEqual([
      { email: 'dept_head@example.com' }, { email: 'emc_window@example.com' }, { email: 'Darius_Chang@example.com' },
    ])
  })

  it('falls back to the fallback group when no recipient can be resolved', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store, upserts } = makeStore({ candidates: [noOne] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].recipients).toEqual([{ email: 'fallback@example.com' }])
    expect(sent[0].mail?.text).toContain('無法對應')
    expect(upserts[0].status).toBe('accepted')
  })

  it('appends the domain to a fallback recipient stored as a bare account name', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '' }
    const { store } = makeStore({ candidates: [noOne], fallback: ['dept_inbox'] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].recipients).toEqual([{ email: 'dept_inbox@example.com' }])
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
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(blocked, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].scheduleId).toBe('s1')
  })

  it('records an error when the default rule is missing', async () => {
    const { store } = makeStore({ rules: [] })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(result.errors[0].message).toContain('預設通知規則')
  })

  // --- Fix 1: catch-up window edge and visibility ------------------------

  it('sends when the send date lands exactly on the catch-up window start', async () => {
    // today=2026/08/21, catchUpDays=3 → windowStart=2026/08/18。
    // startDate=2026/08/21(五) → 往前三個工作天 08/20、08/19、08/18，恰好等於下界。
    const atWindowStart = { ...baseSchedule, startDate: '2026/08/21' }
    const { store, upserts } = makeStore({ candidates: [atWindowStart] })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(1)
    expect(result.missedWindow).toBe(0)
    expect(upserts[0]).toMatchObject({ scheduleId: 's1', sendDate: '2026/08/18', status: 'accepted' })
  })

  it('does not send, and increments missedWindow, one day before the catch-up window start', async () => {
    // startDate=2026/08/20(四) → 往前三個工作天 = 08/17(一)，比 windowStart(08/18) 早一天。
    const justBefore = { ...baseSchedule, startDate: '2026/08/20' }
    const { store, upserts } = makeStore({ candidates: [justBefore] })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.missedWindow).toBe(1)
  })

  // --- Fix 3: daysUntilStart is read from today, not the send date -------

  it('computes daysUntilStart from today rather than the catch-up send date', async () => {
    // 08/26(三) 啟動 → 往前三個工作天 = 08/21(五)。今天是 08/24(一)，讀信當下
    // 距離開始只剩 2 天（08/26 - 08/24），不是以寄信日算出的 5 天（08/26 - 08/21）。
    const withDays: NotifyRuleRow = { ...defaultRule, introTemplate: '距離開始還有 {{daysUntilStart}} 天' }
    const late = { ...baseSchedule, startDate: '2026/08/26' }
    const { store } = makeStore({ candidates: [late], rules: [withDays] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, new Date('2026-08-24T00:30:00Z'))
    expect(sent).toHaveLength(1)
    expect(sent[0].mail?.text).toContain('距離開始還有 2 天')
  })

  // --- Test gap 3 / Fix 4: fallback notice in the html body, escaped -----

  it('includes the fallback notice in the html body too', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store } = makeStore({ candidates: [noOne] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].mail?.html).toContain('但無法對應為有效信箱')
  })

  it('escapes the fallback notice before it reaches the html body', async () => {
    // '<b>@x' 因為含 @ 卻沒有網域中的 '.'，resolveRecipients 判為 unresolved，
    // 因此仍會走 fallback，把這段原始文字內插進通知句。
    const noOne = { ...baseSchedule, requiredPersonnel: '<b>@x' }
    const { store } = makeStore({ candidates: [noOne] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].recipients).toEqual([{ email: 'fallback@example.com' }])
    expect(sent[0].mail?.html).toContain('&lt;b&gt;@x')
    expect(sent[0].mail?.html).not.toContain('<b>@x')
  })

  // --- Test gap 4: cc is dropped on the fallback path ---------------------

  it('drops the rule cc on the fallback path but keeps the test engineer', async () => {
    const withCc: NotifyRuleRow = { ...defaultRule, ccRecipients: 'dept_head' }
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store } = makeStore({ candidates: [noOne], rules: [withCc] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].recipients).toEqual([{ email: 'fallback@example.com' }])
    expect(sent[0].cc).toEqual([{ email: 'Darius_Chang@example.com' }])
  })

  // --- Test gap 5: the log's recipients field records what was sent ------

  it('records the actual recipients (to + cc) in the log row', async () => {
    const withCc: NotifyRuleRow = { ...defaultRule, ccRecipients: 'dept_head' }
    const { store, upserts } = makeStore({ rules: [withCc] })
    const { deliverer } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(upserts[0].recipients).toBe(
      'Amy_Chen@example.com, dept_head@example.com, Darius_Chang@example.com',
    )
  })

  // --- Test gap 6: idempotency is per (schedule, sendDate) ----------------

  it('still sends when a log exists for the same schedule but a different send date', async () => {
    // 同一筆排程曾在 2026/08/18 寄過信（例如另一次補寄），但今天算出的
    // 寄信日是 2026/08/21 —— 兩者是不同的 (scheduleId, sendDate) 鍵，
    // 不該被前一筆記錄擋下。
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/18', status: 'accepted', attempts: 1 }],
    })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(1)
    expect(result.skipped).toBe(0)
    expect(upserts[0]).toMatchObject({ scheduleId: 's1', sendDate: '2026/08/21', status: 'accepted' })
  })

  // --- Test gap 7: empty primary AND empty fallback group -----------------

  it('records an error and sends nothing when both primary and fallback recipients are empty', async () => {
    const noOne = { ...baseSchedule, requiredPersonnel: '   ' }
    const { store, upserts } = makeStore({ candidates: [noOne], fallback: [] })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('未設定 fallback 收件人')
  })

  // --- local sentAt is no longer set on a successful send ------------------
  // 平台才知道信真正寄出的時間（platformSentAt，由 GET /logs 合併），本地
  // 這欄只在還沒送去平台前有意義，accepted／dedup 都固定寫 null。

  it('leaves the local sentAt null on a successful send, now that the platform tracks it', async () => {
    const { store, upserts } = makeStore()
    const { deliverer } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(upserts[0].sentAt).toBeNull()
  })

  // --- Fix 5: checked counts all examined; due counts only in-window ------

  it('checked counts every candidate examined; due counts only those inside the window', async () => {
    const future = { ...baseSchedule, id: 's2', startDate: '2026/09/20' }
    const { store } = makeStore({ candidates: [baseSchedule, future] })
    const { deliverer } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(result.checked).toBe(2)
    expect(result.due).toBe(1)
  })

  // --- Fix 6: a negative catchUpDays must not silently disable sending ----

  it('clamps a negative catchUpDays to 0 instead of blocking same-day sends', async () => {
    const { store } = makeStore({
      config: { enabled: true, systemUrl: 'https://vsms.local:3001', leadDays: 3, catchUpDays: -5, mailDomain: 'example.com' },
    })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(1)
    expect(result.sent).toBe(1)
  })

  // --- Fix 2 (adapted): a log-write failure after a successful delivery ---
  // --- must not abort the batch --------------------------------------------
  //
  // 平台寄送層上線後，「信已寄出但本地記錄沒寫成功」的重複寄信風險已經大幅
  // 降低：下次重跑用同一把 key 呼叫 deliver()，平台會直接回 deduped，不會
  // 真的寄出第二封。這裡驗證的重點因此改成「不能讓整批中斷」，不再要求
  // 錯誤訊息帶特定的「已寄出／重複」措辭——那段措辭是舊 mailer 架構下，
  // 本地是唯一防線時的產物。

  it('keeps processing later schedules when the log write fails after a successful delivery', async () => {
    const second = { ...baseSchedule, id: 's2', requiredPersonnel: 'Bob_Lin' }
    const upserts: LogUpsert[] = []
    const store: NotifyStore = {
      ...makeStore({ candidates: [baseSchedule, second] }).store,
      upsertLog: async (e) => {
        if (e.scheduleId === 's1') throw new Error('ETIMEDOUT: log write failed')
        upserts.push(e)
      },
    }
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)

    // 兩筆都確實呼叫了 deliver() —— 記錄失敗不能讓還沒處理的候選排程被放棄。
    expect(sent).toHaveLength(2)
    // 只有 s2 的「投遞 + 記錄」完整成功，計入 result.sent。
    expect(result.sent).toBe(1)
    // s1 的記錄失敗必須浮現在 errors，批次仍繼續往下跑。
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].scheduleId).toBe('s1')
    expect(upserts).toHaveLength(1)
    expect(upserts[0].scheduleId).toBe('s2')
  })

  // --- Blocker 1: module-level mutex prevents concurrent runs --------------

  it('returns alreadyRunning immediately for a second call while the first is still in flight, and releases the lock once the first finishes', async () => {
    const { store } = makeStore()
    let releaseSend: () => void = () => {}
    const sendGate = new Promise<void>(resolve => { releaseSend = resolve })
    const sent: DeliverInput[] = []
    const deliverer: Deliverer = {
      async deliver(input) {
        sent.push(input)
        await sendGate // holds the first run open until the test releases it
        return { id: 'd-1', deduped: false, dropped: false }
      },
    }

    const first = runDailyNotify(store, deliverer, NOW)
    // inFlight is assigned synchronously before runDailyNotify's first
    // `await`, so this second call is guaranteed to observe the lock —
    // no need to yield a tick before calling it.
    const second = await runDailyNotify(store, deliverer, NOW)
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
    // Only the first run ever reached the deliverer — the second call returned
    // before touching it.
    expect(sent).toHaveLength(1)

    // The lock is released once the first run settles, so a later call
    // proceeds normally instead of being blocked forever.
    const third = await runDailyNotify(store, deliverer, NOW)
    expect(third.alreadyRunning).toBe(false)
  })
})

describe('runDailyNotify — 排除規則', () => {
  // 佔位用的專案編號，以及「需求人員本身就是 VSMS 使用者」的情形：
  // 這兩種都不該發預告信，前者不是真專案，後者本人在系統裡看得到排程。
  it('skips a placeholder PDN-999999 project without sending or logging', async () => {
    const placeholder = { ...baseSchedule, projectName: 'PDN-999999' }
    const { store, upserts } = makeStore({ candidates: [placeholder] })
    const { deliverer, sent } = makeDeliverer()
    const r = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(r.excluded).toBe(1)
    expect(r.sent).toBe(0)
  })

  it('matches the placeholder project name case-insensitively and ignores surrounding spaces', async () => {
    const placeholder = { ...baseSchedule, projectName: '  pdn-999999  ' }
    const { store } = makeStore({ candidates: [placeholder] })
    const { deliverer, sent } = makeDeliverer()
    const r = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(r.excluded).toBe(1)
  })

  it('still sends a project whose name merely contains the placeholder digits', async () => {
    const real = { ...baseSchedule, projectName: 'PDN-9999990' }
    const { store } = makeStore({ candidates: [real] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(1)
  })

  it('skips a schedule whose requiredPersonnel is a VSMS account', async () => {
    const s = { ...baseSchedule, requiredPersonnel: 'Polson_Cheng' }
    const { store, upserts } = makeStore({ candidates: [s], accounts: ['Polson_Cheng', 'Will_Wang'] })
    const { deliverer, sent } = makeDeliverer()
    const r = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(0)
    expect(upserts).toHaveLength(0)
    expect(r.excluded).toBe(1)
  })

  it('matches an account name case-insensitively', async () => {
    const s = { ...baseSchedule, requiredPersonnel: 'polson_cheng' }
    const { store } = makeStore({ candidates: [s], accounts: ['Polson_Cheng'] })
    const { deliverer, sent } = makeDeliverer()
    expect((await runDailyNotify(store, deliverer, NOW)).excluded).toBe(1)
    expect(sent).toHaveLength(0)
  })

  it('skips the whole schedule when any one of several requiredPersonnel is an account', async () => {
    const s = { ...baseSchedule, requiredPersonnel: 'Amy_Chen, Polson_Cheng' }
    const { store } = makeStore({ candidates: [s], accounts: ['Polson_Cheng'] })
    const { deliverer, sent } = makeDeliverer()
    expect((await runDailyNotify(store, deliverer, NOW)).excluded).toBe(1)
    expect(sent).toHaveLength(0)
  })

  it('sends normally when no requiredPersonnel is an account', async () => {
    const { store } = makeStore({ accounts: ['Polson_Cheng', 'Will_Wang'] })
    const { deliverer, sent } = makeDeliverer()
    const r = await runDailyNotify(store, deliverer, NOW)
    expect(sent).toHaveLength(1)
    expect(r.excluded).toBe(0)
  })

  it('counts an excluded schedule as due, so due reconciles with the outcomes', async () => {
    // excluded 只在「今天本來該寄」時才計數，否則它每天都會是同一個固定值。
    // due = sent + failed + skipped + excluded 必須對得起來。
    const placeholder = { ...baseSchedule, projectName: 'PDN-999999' }
    const { store } = makeStore({ candidates: [placeholder] })
    const { deliverer } = makeDeliverer()
    const r = await runDailyNotify(store, deliverer, NOW)
    expect(r.checked).toBe(1)
    expect(r.due).toBe(1)
    expect(r.excluded).toBe(1)
    expect(r.due).toBe(r.sent + r.failed + r.skipped + r.excluded)
  })

  it('does not count an excluded schedule that was not due today', async () => {
    // 寄信日還在未來：連 due 都不算，自然也不該計入 excluded。
    const future = { ...baseSchedule, projectName: 'PDN-999999', startDate: '2026/09/30' }
    const { store } = makeStore({ candidates: [future] })
    const { deliverer } = makeDeliverer()
    const r = await runDailyNotify(store, deliverer, NOW)
    expect(r.due).toBe(0)
    expect(r.excluded).toBe(0)
  })
})

describe('runDailyNotify — 測試人員副本', () => {

  it('ccs the schedule test engineer even when no rule cc is configured', async () => {
    const { store, upserts } = makeStore()
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].recipients).toEqual([{ email: 'Amy_Chen@example.com' }])
    expect(sent[0].cc).toEqual([{ email: 'Darius_Chang@example.com' }])
    expect(upserts[0].recipients).toBe('Amy_Chen@example.com, Darius_Chang@example.com')
  })

  it('does not cc the test engineer when they are also the requiredPersonnel', async () => {
    const selfServed = { ...baseSchedule, requiredPersonnel: 'Darius_Chang' }
    const { store } = makeStore({ candidates: [selfServed] })
    const { deliverer, sent } = makeDeliverer()
    await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].recipients).toEqual([{ email: 'Darius_Chang@example.com' }])
    expect(sent[0].cc).toEqual([])
  })

  it('still sends when the test engineer cannot be resolved to an address', async () => {
    const odd = { ...baseSchedule, testEngineer: '@broken' }
    const { store } = makeStore({ candidates: [odd] })
    const { deliverer, sent } = makeDeliverer()
    const result = await runDailyNotify(store, deliverer, NOW)
    expect(sent[0].cc).toEqual([])
    expect(result.sent).toBe(1)
    expect(result.errors).toEqual([])
  })
})
