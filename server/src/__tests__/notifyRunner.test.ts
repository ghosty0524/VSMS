import { describe, it, expect, beforeEach } from 'vitest'
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
    expect(result).toEqual({ checked: 0, sent: 0, failed: 0, skipped: 0, errors: [] })
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

  it('marks the send permanently failed on the third failure', async () => {
    const { store, upserts } = makeStore({
      logs: [{ scheduleId: 's1', sendDate: '2026/08/21', status: 'failed', attempts: 2 }],
    })
    const mailer: Mailer = { async send() { throw new Error('ECONNREFUSED') } }
    const result = await runDailyNotify(store, mailer, NOW)
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

  it('ignores a send date older than the catch-up window', async () => {
    // 今天 08/28，寄信日 08/21，超出 catchUpDays=3
    const { store } = makeStore()
    const { mailer, sent } = makeMailer()
    const result = await runDailyNotify(store, mailer, new Date('2026-08-28T00:30:00Z'))
    expect(sent).toHaveLength(0)
    expect(result.sent).toBe(0)
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
})
